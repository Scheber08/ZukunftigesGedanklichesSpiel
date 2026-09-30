/**
 * Server-Dienst Import (Plan Phase 2, §5.2, §6.6): Import-Stapel anlegen (UDP/CSV), auflisten,
 * verwerfen, als übernommen markieren, Vorbefüllung der Ergebnis-Eingabe und das Import-Token.
 *
 * NUR serverseitig (Store mit Service-Key). Alle Funktionen bekommen den Store als Parameter;
 * fachliche Fehler kommen als RacedayError (die Actions/der Endpunkt übersetzen sie).
 * Keine loadLeague()-Aufrufe – nur gezielte Abfragen (läuft auch im Worker-Endpunkt).
 */
import type { EditorRow } from '../admin/raceday/results-map';
import { notFound, RacedayError } from '../admin/raceday/errors';
import { selectOne, type Store } from '../db/store';
import type { DriverNumberRow, Id, ImportBatchRow, SessionType } from '../db/types';
import { seatsForRound } from '../domain/grid';
import { numberAt } from '../domain/numbers';
import { formatDateTime } from '../domain/time';
import { roundLabel } from '../view';
import { audit } from '../server/audit';
import type { Staff } from '../server/auth';
import { displayName, isFrozen, loadRoundBasics, type RoundBasics } from '../server/results';
import { readPrivateSettings, writeSetting } from '../server/settings';
import { parseCsv, CSV_MAX_CHARS } from './csv';
import { mapImport, sortWarnings, type ImportWarning, type MapContext, type MappedLine, type MappingResult } from './map';
import { telemetryPayloadSchema, type TelemetryPayload } from './payload';
import type { ResolveResult } from './resolve';
import { normalizeTelemetry, type ImportRow } from './rows';
import { generateImportToken, sha256Hex, tokenFingerprint } from './token';

type Actor = Pick<Staff, 'userId' | 'name'>;

/** Inhalt von import_batches.mapping (Stand beim Import; beim Übernehmen wird neu zugeordnet). */
export interface BatchMapping {
  v: 1;
  roundId: Id;
  sessionType: SessionType;
  matched: number;
  total: number;
  warnings: ImportWarning[];
  lines: MappedLine[];
  meta: {
    how?: 'explicit' | 'auto';
    fileName?: string | null;
    packetFormat?: number;
    gameSessionType?: number | null;
    gameTrackId?: number | null;
    companionWarnings?: string[];
  };
}

/** Rohdaten eines CSV-Stapels */
export interface CsvRaw {
  csv: string;
  fileName: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------- Zuordnungs-Kontext

function activeAt(n: Pick<DriverNumberRow, 'valid_from' | 'valid_to'>, at: Date): boolean {
  return new Date(n.valid_from) <= at && (n.valid_to == null || new Date(n.valid_to) > at);
}

/**
 * Kontext für mapImport(): Aufstellung der Runde (sonst Saisonaufstellung mit Nummer zum
 * Rennstart), gültige Startnummern, Namen und Spiel-Team-IDs – nur gezielte Abfragen.
 */
export async function loadMapContext(store: Store, roundId: Id, sessionType: SessionType, basicsIn?: RoundBasics): Promise<MapContext> {
  const basics = basicsIn ?? (await loadRoundBasics(store, roundId));
  const { round, season } = basics;
  const start = new Date(round.start_utc);
  const [roundEntries, allNumbers, seasonTeams] = await Promise.all([
    store.select('round_entries', { eq: { round_id: roundId } }),
    store.select('driver_numbers'),
    store.select('season_teams', { eq: { season_id: season.id } }),
  ]);
  const order = new Map(seasonTeams.map((t) => [t.team_id, t.sort_order]));
  const sortKey = (e: { team_id: Id; seat_no: 1 | 2 }) => (order.get(e.team_id) ?? 99) * 10 + e.seat_no;

  let entries: MapContext['entries'];
  let lineupSource: MapContext['lineupSource'] = 'round';
  if (roundEntries.length > 0) {
    entries = [...roundEntries]
      .sort((a, b) => sortKey(a) - sortKey(b))
      .map((e) => ({ id: e.id, driver_id: e.driver_id, team_id: e.team_id, role: e.role, race_number: e.race_number }));
  } else {
    lineupSource = 'season';
    const seats = seatsForRound(await store.select('seats', { eq: { season_id: season.id } }), round.number);
    entries = [...seats]
      .sort((a, b) => sortKey(a) - sortKey(b))
      .map((s) => ({ id: null, driver_id: s.driver_id, team_id: s.team_id, role: 'regular' as const, race_number: numberAt(s.driver_id, allNumbers, start) }));
  }
  const numberHolders = allNumbers.filter((n) => activeAt(n, start)).map((n) => ({ number: n.number, driverId: n.driver_id }));
  const driverIds = [...new Set([...entries.map((e) => e.driver_id), ...numberHolders.map((h) => h.driverId)])];
  const teamIds = [...new Set(entries.map((e) => e.team_id))];
  const [drivers, teams] = await Promise.all([
    driverIds.length > 0 ? store.select('drivers', { in: { id: driverIds } }) : Promise.resolve([]),
    teamIds.length > 0 ? store.select('teams', { in: { id: teamIds } }) : Promise.resolve([]),
  ]);
  const driverNames: Record<number, string> = {};
  for (const d of drivers) driverNames[d.id] = displayName(d);
  const teamGameIds: Record<number, number | null> = {};
  for (const t of teams) teamGameIds[t.id] = t.game_team_id;
  return { sessionType, entries, lineupSource, numberHolders, driverNames, teamGameIds };
}

// ---------------------------------------------------------------------------- Stapel → Zeilen

export interface BatchRows {
  rows: ImportRow[];
  skipped: string[];
  notes: string[];
}

/** Import-Zeilen aus den Rohdaten eines Stapels (UDP-Payload bzw. CSV-Text). */
export function rowsFromBatch(batch: Pick<ImportBatchRow, 'source' | 'raw'>, sessionType: SessionType): BatchRows {
  if (batch.source === 'udp') {
    const parsed = telemetryPayloadSchema.safeParse(batch.raw);
    if (!parsed.success) throw new RacedayError('BAD_REQUEST', 'Die gespeicherten Telemetrie-Daten sind ungültig.');
    const { rows, skipped } = normalizeTelemetry(parsed.data.results, sessionType);
    return { rows, skipped, notes: parsed.data.warnings ?? [] };
  }
  const raw = batch.raw as Partial<CsvRaw> | null;
  if (!raw || typeof raw.csv !== 'string') throw new RacedayError('BAD_REQUEST', 'Die gespeicherte CSV ist ungültig.');
  const parsed = parseCsv(raw.csv, sessionType);
  return { rows: parsed.rows, skipped: parsed.errors, notes: parsed.warnings };
}

function toMapping(roundId: Id, sessionType: SessionType, result: MappingResult, meta: BatchMapping['meta'], notes: string[]): BatchMapping {
  const extra: ImportWarning[] = notes.map((n) => ({ code: 'skipped' as const, message: n }));
  return {
    v: 1,
    roundId,
    sessionType,
    matched: result.matched,
    total: result.total,
    warnings: sortWarnings([...result.warnings, ...extra]),
    lines: result.lines,
    meta,
  };
}

// ---------------------------------------------------------------------------- Anlegen

/** UDP-Stapel aus einem geprüften Upload (Endpunkt /api/import). */
export async function createTelemetryBatch(
  store: Store,
  payload: TelemetryPayload,
  resolved: Extract<ResolveResult, { ok: true }>,
  uploadedBy: string | null,
): Promise<{ batch: ImportBatchRow; mapping: BatchMapping }> {
  const basics = await loadRoundBasics(store, resolved.roundId);
  const { rows, skipped } = normalizeTelemetry(payload.results, resolved.sessionType);
  const ctx = await loadMapContext(store, resolved.roundId, resolved.sessionType, basics);
  const result = mapImport(rows, ctx, skipped);
  const mapping = toMapping(
    resolved.roundId,
    resolved.sessionType,
    result,
    {
      how: resolved.how,
      packetFormat: payload.game.packetFormat,
      gameSessionType: payload.session?.gameSessionType ?? null,
      gameTrackId: payload.session?.trackId ?? null,
      companionWarnings: payload.warnings ?? [],
    },
    payload.warnings ?? [],
  );
  const [batch] = await store.insert('import_batches', {
    session_id: resolved.sessionId,
    source: 'udp',
    raw: payload,
    mapping,
    status: 'draft',
    uploaded_by: uploadedBy && UUID.test(uploadedBy) ? uploadedBy : null,
  });
  if (!batch) throw new RacedayError('BAD_REQUEST', 'Import-Stapel konnte nicht gespeichert werden.');
  // Akteur = Person, die das Token erzeugt hat (sonst „System“)
  const actor = batch.uploaded_by ? { userId: batch.uploaded_by, name: 'Telemetrie-Import' } : null;
  await audit(store, actor, 'import', 'import_batches', batch.id, null, {
    source: 'udp',
    round: roundLabel(basics.round, basics.track, 'de'),
    session: resolved.sessionType,
    matched: mapping.matched,
    total: mapping.total,
    warnings: mapping.warnings.length,
  });
  return { batch, mapping };
}

/** CSV-Stapel aus dem Admin (Session gewählt, Text eingefügt oder Datei gelesen). */
export async function createCsvBatch(
  store: Store,
  staff: Actor,
  input: { roundId: Id; sessionId: Id; csv: string; fileName?: string | null },
): Promise<{ batch: ImportBatchRow; mapping: BatchMapping }> {
  const basics = await loadRoundBasics(store, input.roundId);
  if (isFrozen(basics.season)) throw new RacedayError('PRECONDITION_FAILED', 'Die Saison ist abgeschlossen – Ergebnisse sind eingefroren.');
  if (basics.round.status === 'cancelled') throw new RacedayError('PRECONDITION_FAILED', 'Die Runde ist abgesagt.');
  const session = basics.sessions.find((s) => s.id === input.sessionId);
  if (!session) throw new RacedayError('BAD_REQUEST', 'Die Session gehört nicht zu dieser Runde.');
  if (input.csv.length > CSV_MAX_CHARS) throw new RacedayError('BAD_REQUEST', `Die CSV ist zu groß (höchstens ${CSV_MAX_CHARS / 1024} KB).`);
  const parsed = parseCsv(input.csv, session.type);
  if (parsed.rows.length === 0) throw new RacedayError('BAD_REQUEST', 'Die CSV enthält keine verwertbaren Zeilen:', parsed.errors.slice(0, 10));
  const ctx = await loadMapContext(store, input.roundId, session.type, basics);
  const result = mapImport(parsed.rows, ctx, parsed.errors);
  if (result.matched === 0) {
    throw new RacedayError(
      'BAD_REQUEST',
      'Keine Zeile ließ sich einem Fahrer der Aufstellung zuordnen – bitte die Startnummern prüfen:',
      sortWarnings(result.warnings).slice(0, 10).map((w) => w.message),
    );
  }
  const fileName = input.fileName?.trim().slice(0, 120) || null;
  const mapping = toMapping(input.roundId, session.type, result, { how: 'explicit', fileName }, parsed.warnings);
  const raw: CsvRaw = { csv: input.csv, fileName };
  const [batch] = await store.insert('import_batches', {
    session_id: session.id,
    source: 'csv',
    raw,
    mapping,
    status: 'draft',
    uploaded_by: UUID.test(staff.userId) ? staff.userId : null,
  });
  if (!batch) throw new RacedayError('BAD_REQUEST', 'Import-Stapel konnte nicht gespeichert werden.');
  await audit(store, staff, 'import', 'import_batches', batch.id, null, {
    source: 'csv',
    round: roundLabel(basics.round, basics.track, 'de'),
    session: session.type,
    file: fileName,
    matched: mapping.matched,
    total: mapping.total,
    warnings: mapping.warnings.length,
  });
  return { batch, mapping };
}

// ---------------------------------------------------------------------------- Liste

export interface BatchView {
  id: Id;
  source: ImportBatchRow['source'];
  status: ImportBatchRow['status'];
  createdAt: string;
  createdText: string;
  sessionId: Id;
  sessionType: SessionType;
  matched: number;
  total: number;
  warnings: ImportWarning[];
  uploadedBy: string;
  fileName: string | null;
}

function readMapping(value: unknown): BatchMapping | null {
  const m = value as Partial<BatchMapping> | null;
  return m && m.v === 1 && Array.isArray(m.warnings) ? (m as BatchMapping) : null;
}

export async function listImportBatches(store: Store, roundId: Id): Promise<BatchView[]> {
  const sessions = await store.select('sessions', { eq: { round_id: roundId } });
  if (sessions.length === 0) return [];
  const batches = await store.select('import_batches', { in: { session_id: sessions.map((s) => s.id) } });
  const uploaderIds = [...new Set(batches.map((b) => b.uploaded_by).filter((u): u is string => u != null))];
  const accounts = uploaderIds.length > 0 ? await store.select('staff_accounts', { in: { user_id: uploaderIds } }) : [];
  const nameOf = new Map(accounts.map((a) => [a.user_id, a.display_name]));
  return batches
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
    .map((b) => {
      const session = sessions.find((s) => s.id === b.session_id)!;
      const m = readMapping(b.mapping);
      const raw = b.raw as Partial<CsvRaw> | null;
      return {
        id: b.id,
        source: b.source,
        status: b.status,
        createdAt: b.created_at,
        createdText: `${formatDateTime(b.created_at, 'de')} Uhr`,
        sessionId: b.session_id,
        sessionType: session.type,
        matched: m?.matched ?? 0,
        total: m?.total ?? 0,
        warnings: m?.warnings ?? [],
        uploadedBy: b.uploaded_by ? (nameOf.get(b.uploaded_by) ?? (b.source === 'udp' ? 'Companion' : 'Admin')) : b.source === 'udp' ? 'Companion' : 'Admin',
        fileName: b.source === 'csv' && raw && typeof raw.fileName === 'string' ? raw.fileName : null,
      };
    });
}

/** Anzahl offener Stapel (Entwürfe) einer Runde – für den Runden-Hub. */
export async function countDraftBatches(store: Store, sessionIds: readonly Id[]): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const rows = await store.select('import_batches', { in: { session_id: [...sessionIds] }, eq: { status: 'draft' } });
  return rows.length;
}

// ---------------------------------------------------------------------------- Status

async function loadBatchOfRound(store: Store, batchId: Id, roundId: Id): Promise<{ batch: ImportBatchRow; sessionType: SessionType }> {
  const batch = await selectOne(store, 'import_batches', { id: batchId });
  if (!batch) throw notFound('Import-Stapel');
  const session = await selectOne(store, 'sessions', { id: batch.session_id });
  if (!session || session.round_id !== roundId) throw new RacedayError('BAD_REQUEST', 'Der Import-Stapel gehört nicht zu dieser Runde.');
  return { batch, sessionType: session.type };
}

/** Stapel verwerfen (nur Entwürfe). */
export async function discardImportBatch(store: Store, staff: Actor, roundId: Id, batchId: Id): Promise<ImportBatchRow> {
  const { batch } = await loadBatchOfRound(store, batchId, roundId);
  if (batch.status !== 'draft') throw new RacedayError('CONFLICT', batch.status === 'applied' ? 'Der Stapel ist schon übernommen.' : 'Der Stapel ist schon verworfen.');
  const [updated] = await store.update('import_batches', { id: batchId }, { status: 'discarded' });
  await audit(store, staff, 'update', 'import_batches', batchId, { status: 'draft' }, { status: 'discarded' });
  return updated ?? { ...batch, status: 'discarded' };
}

/**
 * Nach dem Speichern in der Ergebnis-Eingabe: Stapel als übernommen markieren – nur, wenn seine
 * Session tatsächlich mit Zeilen gespeichert wurde. Liefert true, wenn markiert.
 */
export async function markBatchApplied(store: Store, staff: Actor, batchId: Id, savedSessionIds: readonly Id[]): Promise<boolean> {
  const batch = await selectOne(store, 'import_batches', { id: batchId });
  if (!batch || batch.status !== 'draft' || !savedSessionIds.includes(batch.session_id)) return false;
  await store.update('import_batches', { id: batchId }, { status: 'applied' });
  await audit(store, staff, 'update', 'import_batches', batchId, { status: 'draft' }, { status: 'applied' });
  return true;
}

// ---------------------------------------------------------------------------- Vorbefüllung

export interface ImportPrefill {
  batchId: Id;
  sessionId: Id;
  sessionType: SessionType;
  source: ImportBatchRow['source'];
  status: ImportBatchRow['status'];
  createdText: string;
  rows: EditorRow[];
  matched: number;
  total: number;
  warnings: ImportWarning[];
}

/**
 * Stapel für die Ergebnis-Eingabe vorbereiten: Zeilen mit der AKTUELLEN Aufstellung neu zuordnen
 * (Korrekturen im Grid-Builder nach dem Import zählen also).
 */
export async function importPrefill(store: Store, roundId: Id, batchId: Id): Promise<ImportPrefill> {
  const { batch, sessionType } = await loadBatchOfRound(store, batchId, roundId);
  if (batch.status === 'discarded') throw new RacedayError('CONFLICT', 'Dieser Import-Stapel wurde verworfen.');
  const { rows, skipped, notes } = rowsFromBatch(batch, sessionType);
  const ctx = await loadMapContext(store, roundId, sessionType);
  const result = mapImport(rows, ctx, skipped);
  return {
    batchId: batch.id,
    sessionId: batch.session_id,
    sessionType,
    source: batch.source,
    status: batch.status,
    createdText: `${formatDateTime(batch.created_at, 'de')} Uhr`,
    rows: result.rows,
    matched: result.matched,
    total: result.total,
    warnings: sortWarnings([...result.warnings, ...notes.map((n) => ({ code: 'skipped' as const, message: n }))]),
  };
}

// ---------------------------------------------------------------------------- Import-Token

export interface TokenStatus {
  configured: boolean;
  createdAt: string | null;
  createdText: string | null;
  createdBy: string | null;
  fingerprint: string | null;
}

export async function importTokenStatus(store: Store): Promise<TokenStatus> {
  const { import_token: t } = await readPrivateSettings(store);
  let createdBy: string | null = null;
  if (t.created_by) {
    const account = UUID.test(t.created_by) ? await selectOne(store, 'staff_accounts', { user_id: t.created_by }) : null;
    createdBy = account?.display_name ?? null;
  }
  return {
    configured: Boolean(t.hash),
    createdAt: t.created_at,
    createdText: t.created_at ? `${formatDateTime(t.created_at, 'de')} Uhr` : null,
    createdBy,
    fingerprint: tokenFingerprint(t.hash),
  };
}

/** Neues Token erzeugen (ersetzt ein altes). Der Klartext wird nur zurückgegeben, nie gespeichert. */
export async function createImportToken(store: Store, staff: Actor): Promise<{ token: string; createdAt: string; fingerprint: string }> {
  const before = (await readPrivateSettings(store)).import_token;
  const token = generateImportToken();
  const hash = await sha256Hex(token);
  const createdAt = new Date().toISOString();
  await writeSetting(store, 'import_token', { hash, created_at: createdAt, created_by: staff.userId });
  await audit(
    store,
    staff,
    before.hash ? 'update' : 'create',
    'settings',
    'import_token',
    { configured: Boolean(before.hash), fingerprint: tokenFingerprint(before.hash) },
    { configured: true, fingerprint: tokenFingerprint(hash) },
  );
  return { token, createdAt, fingerprint: tokenFingerprint(hash)! };
}

export async function revokeImportToken(store: Store, staff: Actor): Promise<boolean> {
  const before = (await readPrivateSettings(store)).import_token;
  if (!before.hash) return false;
  await writeSetting(store, 'import_token', { hash: null, created_at: null, created_by: null });
  await audit(store, staff, 'delete', 'settings', 'import_token', { configured: true, fingerprint: tokenFingerprint(before.hash) }, { configured: false });
  return true;
}
