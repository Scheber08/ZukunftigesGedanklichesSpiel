/**
 * Server-Dienst Renntag (Plan §5.1, §5.2, §6.3, §11.1): Aufstellung speichern/veröffentlichen,
 * Ergebnisse speichern und neu berechnen, vorläufig/final/korrigiert setzen, Wertungs-Snapshots
 * schreiben, Discord-Posts (Channels „lineup“ und „results“) und gebündelter Rebuild.
 *
 * Alle Funktionen bekommen den Store als Parameter (Service-Store nach Rollenprüfung in der Action).
 * Fachliche Fehler werden als `RacedayError` geworfen und in der Action übersetzt.
 */
import { url } from '~/i18n/routes';
import { lineupEmbed, resultsEmbed, type EmbedDriver, type ResultsEmbedKind } from '../admin/raceday/embeds';
import { notFound, RacedayError } from '../admin/raceday/errors';
import { COMPUTE_WARNING_TEXT, gridIssueText, SESSION_LABEL } from '../admin/raceday/labels';
import { standingsPreview } from '../admin/raceday/preview';
import {
  computedToPatch,
  inputToResultInsert,
  resultRowToEntered,
  validateSessionInput,
  type ComputedPatch,
  type ResultInput,
} from '../admin/raceday/results-map';
import { selectOne, type Store } from '../db/store';
import type {
  DecisionRow,
  DriverNumberRow,
  DriverRow,
  Id,
  PointsSchemeRow,
  ResultRow,
  RoundAbsenceRow,
  RoundEntryRow,
  RoundRow,
  SeasonRow,
  SeatRow,
  SessionRow,
  SessionType,
  TeamRow,
  TrackRow,
} from '../db/types';
import { RESULT_VISIBLE_STATUSES } from '../db/types';
import { penaltiesForSession, raceBansFromPreviousRound } from '../domain/decisions';
import { checkGrid, hasBlockingIssues, seatsForRound, type GridEntry, type GridIssue } from '../domain/grid';
import { formatLapTime } from '../domain/laptime';
import { numberAt } from '../domain/numbers';
import { computeSession, type ComputeWarningCode } from '../domain/points';
import { driverStandings, teamStandings, type StandingsInput, type StandingsResult } from '../domain/standings';
import { formatDateTime } from '../domain/time';
import { roundLabel, seasonLabel } from '../view';
import { audit } from './audit';
import type { Staff } from './auth';
import { EMBED_GREEN, EMBED_TEAL, EMBED_WARNING, notify, siteUrl } from './discord';
import { requestRebuild } from './rebuild';

type Actor = Pick<Staff, 'userId' | 'name'>;

const SESSION_ORDER: Record<SessionType, number> = { qualifying: 0, sprint: 1, race: 2 };
const FINAL_STATUSES: readonly RoundRow['status'][] = ['final', 'corrected'];

// ---------------------------------------------------------------------------- Grundlagen

export interface RoundBasics {
  round: RoundRow;
  season: SeasonRow;
  track: TrackRow | undefined;
  scheme: PointsSchemeRow;
  sessions: SessionRow[];
}

export async function loadRoundBasics(store: Store, roundId: Id): Promise<RoundBasics> {
  const round = await selectOne(store, 'rounds', { id: roundId });
  if (!round) throw notFound('Runde');
  const [season, track, sessions] = await Promise.all([
    selectOne(store, 'seasons', { id: round.season_id }),
    selectOne(store, 'tracks', { id: round.track_id }),
    store.select('sessions', { eq: { round_id: roundId } }),
  ]);
  if (!season) throw notFound('Saison');
  const scheme = await selectOne(store, 'points_schemes', { id: season.points_scheme_id });
  if (!scheme) throw notFound('Punkteschema');
  return {
    round,
    season,
    track: track ?? undefined,
    scheme,
    sessions: sessions.sort((a, b) => SESSION_ORDER[a.type] - SESSION_ORDER[b.type]),
  };
}

/** Abgeschlossene Saison: keine Ergebnis- oder Grid-Änderungen mehr. */
export function isFrozen(season: Pick<SeasonRow, 'status'>): boolean {
  return season.status === 'finished';
}

function assertOpen(b: RoundBasics): void {
  if (isFrozen(b.season)) {
    throw new RacedayError('PRECONDITION_FAILED', 'Die Saison ist abgeschlossen – Ergebnisse und Aufstellungen sind eingefroren.');
  }
  if (b.round.status === 'cancelled') throw new RacedayError('PRECONDITION_FAILED', 'Die Runde ist abgesagt.');
}

export function isResultVisible(status: RoundRow['status']): boolean {
  return RESULT_VISIBLE_STATUSES.includes(status);
}

export function displayName(d: Pick<DriverRow, 'id' | 'gamertag' | 'anonymized'> | undefined, id?: Id): string {
  if (!d) return `Fahrer #${id ?? '?'}`;
  return d.anonymized ? `Ehemaliger Fahrer #${d.id}` : d.gamertag;
}

async function driverNameMap(store: Store, ids: Iterable<Id>): Promise<Map<Id, string>> {
  const list = [...new Set(ids)];
  if (list.length === 0) return new Map();
  const rows = await store.select('drivers', { in: { id: list } });
  const map = new Map(rows.map((d) => [d.id, displayName(d)]));
  for (const id of list) if (!map.has(id)) map.set(id, displayName(undefined, id));
  return map;
}

const withoutTimestamps = <T extends { created_at?: string; updated_at?: string }>(row: T): Omit<T, 'created_at' | 'updated_at'> => {
  const { created_at: _c, updated_at: _u, ...rest } = row;
  return rest;
};

function roundText(b: Pick<RoundBasics, 'round' | 'track'>): string {
  return roundLabel(b.round, b.track, 'de');
}

function racePageUrl(season: SeasonRow, round: RoundRow): string {
  return siteUrl(url('de', 'race', { season: season.slug, round: round.number }));
}

// ---------------------------------------------------------------------------- Neuberechnung

export interface RecomputeWarning {
  sessionId: Id;
  sessionType: SessionType;
  driverId: Id;
  code: ComputeWarningCode;
  message: string;
}

const PATCH_KEYS: Array<keyof ComputedPatch> = [
  'position',
  'points',
  'is_fastest_lap',
  'is_pole',
  'steward_penalty_s',
  'counts_for_constructors',
  'status',
];

/**
 * Ergebnis einer Runde neu berechnen: Positionen, Punkte, Pole, schnellste Runde,
 * Steward-Zeitstrafen, DSQ und Konstrukteurs-Zählung aus Eingabe + veröffentlichten Urteilen.
 */
export async function recomputeRound(store: Store, roundId: Id): Promise<{ warnings: RecomputeWarning[]; updated: number }> {
  const b = await loadRoundBasics(store, roundId);
  const sessionIds = b.sessions.map((s) => s.id);
  if (sessionIds.length === 0) return { warnings: [], updated: 0 };
  const [results, decisions] = await Promise.all([
    store.select('results', { in: { session_id: sessionIds } }),
    store.select('decisions', { eq: { round_id: roundId } }),
  ]);

  const warningsRaw: Array<Omit<RecomputeWarning, 'message'>> = [];
  let updated = 0;
  for (const session of b.sessions) {
    const rows = results.filter((r) => r.session_id === session.id);
    if (rows.length === 0) continue;
    const out = computeSession(rows.map(resultRowToEntered), penaltiesForSession(decisions, session), {
      type: session.type,
      scheme: b.scheme,
      reservePointsForConstructors: b.season.reserve_points_for_constructors,
    });
    for (const w of out.warnings) warningsRaw.push({ sessionId: session.id, sessionType: session.type, driverId: w.driverId, code: w.code });
    const byDriver = new Map(out.results.map((c) => [c.driverId, c]));
    const changed: ResultRow[] = [];
    for (const row of rows) {
      const computed = byDriver.get(row.driver_id);
      if (!computed) continue;
      const patch = computedToPatch(computed);
      if (PATCH_KEYS.some((k) => row[k] !== patch[k])) changed.push({ ...row, ...patch });
    }
    if (changed.length > 0) {
      await store.upsert('results', changed.map(withoutTimestamps) as Partial<ResultRow>[], ['id']);
      updated += changed.length;
    }
  }

  const names = await driverNameMap(store, warningsRaw.map((w) => w.driverId));
  const warnings = warningsRaw.map((w) => ({
    ...w,
    message: `${SESSION_LABEL[w.sessionType]}: ${names.get(w.driverId)} – ${COMPUTE_WARNING_TEXT[w.code]}`,
  }));
  return { warnings, updated };
}

// ---------------------------------------------------------------------------- Wertung

/** Wertungs-Eingabe einer Saison direkt aus dem Store (alle Runden, Status entscheidet die Logik). */
export async function loadStandingsInput(store: Store, seasonId: Id): Promise<StandingsInput> {
  const [rounds, seasonTeams] = await Promise.all([
    store.select('rounds', { eq: { season_id: seasonId } }),
    store.select('season_teams', { eq: { season_id: seasonId } }),
  ]);
  const roundIds = rounds.map((r) => r.id);
  const sessions = roundIds.length > 0 ? await store.select('sessions', { in: { round_id: roundIds } }) : [];
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const results = sessions.length > 0 ? await store.select('results', { in: { session_id: sessions.map((s) => s.id) } }) : [];
  const teamIds = seasonTeams.sort((a, b) => a.sort_order - b.sort_order).map((t) => t.team_id);
  const allTeamIds = [...new Set([...teamIds, ...results.map((r) => r.team_id)])];
  const [names, teams] = await Promise.all([
    driverNameMap(store, results.map((r) => r.driver_id)),
    allTeamIds.length > 0 ? store.select('teams', { in: { id: allTeamIds } }) : Promise.resolve([] as TeamRow[]),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const standingsResults: StandingsResult[] = results.map((r) => {
    const s = sessionById.get(r.session_id)!;
    return {
      roundId: s.round_id,
      sessionType: s.type,
      driverId: r.driver_id,
      teamId: r.team_id,
      role: r.role,
      position: r.position,
      status: r.status,
      points: r.points,
      isPole: r.is_pole,
      isFastestLap: r.is_fastest_lap,
      countsForConstructors: r.counts_for_constructors,
      gridPosition: r.grid_position,
    };
  });
  return {
    rounds: rounds.sort((a, b) => a.number - b.number),
    results: standingsResults,
    driverName: (id) => names.get(id) ?? String(id),
    teamName: (id) => teamName.get(id) ?? String(id),
    teamIds,
  };
}

/**
 * Snapshots (Fahrer + Teams) für alle finalen/korrigierten Runden ab `fromRoundNumber`
 * neu schreiben – Grundlage für „Stand nach Runde X“ und den Punkteverlauf.
 */
export async function saveSnapshots(store: Store, seasonId: Id, fromRoundNumber: number): Promise<number> {
  const input = await loadStandingsInput(store, seasonId);
  const targets = input.rounds.filter((r) => FINAL_STATUSES.includes(r.status) && r.number >= fromRoundNumber);
  for (const r of targets) {
    const drivers = driverStandings(input, r.number);
    const teams = teamStandings(input, r.number);
    await store.remove('standings_snapshots', { after_round_id: r.id });
    const rows = [
      ...drivers.map((s) => ({ entity_id: s.driverId, kind: 'driver' as const, s })),
      ...teams.map((s) => ({ entity_id: s.teamId, kind: 'team' as const, s })),
    ].map(({ entity_id, kind, s }) => ({
      season_id: seasonId,
      after_round_id: r.id,
      kind,
      entity_id,
      position: s.position,
      points: s.points,
      wins: s.wins,
      podiums: s.podiums,
      poles: s.poles,
      fastest_laps: s.fastestLaps,
    }));
    if (rows.length > 0) await store.insert('standings_snapshots', rows);
  }
  return targets.length;
}

export interface PreviewRow {
  position: number;
  tied: boolean;
  driver: string;
  team: string;
  points: number;
  pointsDelta: number;
  positionDelta: number | null;
}

/** Top 10 der Fahrerwertung inkl. dieser Runde (auch wenn sie noch nicht veröffentlicht ist). */
export async function previewStandings(store: Store, roundId: Id, limit = 10): Promise<PreviewRow[]> {
  const round = await selectOne(store, 'rounds', { id: roundId });
  if (!round) throw notFound('Runde');
  const input = await loadStandingsInput(store, round.season_id);
  return standingsPreview(input, roundId, limit).map((r) => ({
    position: r.position,
    tied: r.tied,
    driver: input.driverName(r.driverId),
    team: r.teamId != null ? input.teamName(r.teamId) : '–',
    points: r.points,
    pointsDelta: r.pointsDelta,
    positionDelta: r.positionDelta,
  }));
}

// ---------------------------------------------------------------------------- Ergebnisse speichern

export interface SessionPayload {
  sessionId: Id;
  rows: ResultInput[];
}

/**
 * Eingaben speichern (Reihenfolge = Eingabe-Reihenfolge) und die Runde neu berechnen.
 * Nach „final“ nur mit `allowFinal` (Korrektur-Ablauf).
 */
export async function saveResults(
  store: Store,
  roundId: Id,
  payload: SessionPayload[],
  staff: Actor,
  opts: { allowFinal?: boolean } = {},
): Promise<{ warnings: RecomputeWarning[]; round: RoundRow }> {
  const b = await loadRoundBasics(store, roundId);
  assertOpen(b);
  if (FINAL_STATUSES.includes(b.round.status) && !opts.allowFinal) {
    throw new RacedayError('CONFLICT', 'Das Ergebnis ist final. Änderungen nur noch als Korrektur mit Grund.');
  }

  const allDriverIds = payload.flatMap((p) => p.rows.map((r) => r.driverId));
  const names = await driverNameMap(store, allDriverIds);
  const known = allDriverIds.length > 0 ? await store.select('drivers', { in: { id: [...new Set(allDriverIds)] } }) : [];
  const knownIds = new Set(known.map((d) => d.id));
  const issues: string[] = [];
  for (const p of payload) {
    const session = b.sessions.find((s) => s.id === p.sessionId);
    if (!session) throw new RacedayError('BAD_REQUEST', `Session ${p.sessionId} gehört nicht zu dieser Runde.`);
    for (const issue of validateSessionInput(p.rows, (id) => names.get(id) ?? String(id))) {
      issues.push(`${SESSION_LABEL[session.type]}: ${issue.message}`);
    }
    for (const r of p.rows) {
      if (!knownIds.has(r.driverId)) issues.push(`${SESSION_LABEL[session.type]}: Fahrer #${r.driverId} existiert nicht`);
    }
  }
  if (issues.length > 0) throw new RacedayError('BAD_REQUEST', 'Bitte prüfe die Eingaben:', issues);

  const summary: Array<{ session: SessionType; rows: number; removed: number }> = [];
  for (const p of payload) {
    const session = b.sessions.find((s) => s.id === p.sessionId)!;
    const existing = await store.select('results', { eq: { session_id: session.id } });
    const keep = new Set(p.rows.map((r) => r.driverId));
    let removed = 0;
    for (const old of existing) {
      if (!keep.has(old.driver_id)) removed += await store.remove('results', { session_id: session.id, driver_id: old.driver_id });
    }
    if (p.rows.length > 0) {
      await store.upsert(
        'results',
        p.rows.map((r, i) => inputToResultInsert(r, session.id, i)),
        ['session_id', 'driver_id'],
      );
    }
    const status = p.rows.length > 0 ? 'entered' : 'pending';
    if (session.status !== status) await store.update('sessions', { id: session.id }, { status });
    summary.push({ session: session.type, rows: p.rows.length, removed });
  }

  const { warnings } = await recomputeRound(store, roundId);
  await audit(store, staff, 'update', 'results', roundId, null, { round: roundText(b), sessions: summary });
  if (isResultVisible(b.round.status)) await requestRebuild(store, `Ergebnis geändert: ${roundText(b)}`);
  return { warnings, round: b.round };
}

// ---------------------------------------------------------------------------- Discord: Ergebnis

async function postResultsEmbed(store: Store, roundId: Id, kind: ResultsEmbedKind, reason?: string | null): Promise<boolean> {
  const b = await loadRoundBasics(store, roundId);
  const sessionIds = b.sessions.map((s) => s.id);
  const results = sessionIds.length > 0 ? await store.select('results', { in: { session_id: sessionIds } }) : [];
  const of = (type: SessionType) => {
    const s = b.sessions.find((x) => x.type === type);
    return s ? results.filter((r) => r.session_id === s.id).sort((x, y) => (x.position ?? 999) - (y.position ?? 999)) : [];
  };
  const race = of('race');
  const quali = of('qualifying');
  const sprint = of('sprint');
  const [names, teams] = await Promise.all([
    driverNameMap(store, results.map((r) => r.driver_id)),
    results.length > 0
      ? store.select('teams', { in: { id: [...new Set(results.map((r) => r.team_id))] } })
      : Promise.resolve([] as TeamRow[]),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const d = (r: ResultRow): EmbedDriver => ({ name: names.get(r.driver_id) ?? '?', number: r.race_number, team: teamName.get(r.team_id) });
  const pole = quali.find((r) => r.is_pole);
  const fl = race.find((r) => r.is_fastest_lap);
  const sprintWinner = sprint.find((r) => r.position === 1);
  const round = (await selectOne(store, 'rounds', { id: roundId }))!;
  const embed = resultsEmbed({
    kind,
    roundLabel: roundText(b),
    seasonName: seasonLabel(b.season, 'de'),
    url: racePageUrl(b.season, round),
    podium: race.filter((r) => r.position != null && r.position <= 3).map(d),
    pole: pole ? d(pole) : null,
    fastestLap: fl ? { ...d(fl), time: formatLapTime(fl.best_lap_ms) } : null,
    sprintWinner: sprintWinner ? d(sprintWinner) : null,
    protestDeadline: round.protest_deadline ? `${formatDateTime(round.protest_deadline, 'de')} Uhr` : null,
    reason,
  });
  const color = kind === 'provisional' ? EMBED_WARNING : kind === 'final' ? EMBED_GREEN : EMBED_TEAL;
  return notify(store, 'results', { ...embed, color });
}

// ---------------------------------------------------------------------------- Status-Wechsel

async function hasRaceResult(store: Store, b: RoundBasics): Promise<boolean> {
  const race = b.sessions.find((s) => s.type === 'race');
  if (!race) return false;
  const rows = await store.select('results', { eq: { session_id: race.id }, limit: 1 });
  return rows.length > 0;
}

/** Vorläufig veröffentlichen: sichtbar machen, Protestfrist starten, Discord-Post. */
export async function publishProvisional(
  store: Store,
  roundId: Id,
  staff: Actor,
): Promise<{ round: RoundRow; warnings: RecomputeWarning[]; discord: boolean; alreadyPublic: boolean }> {
  const b = await loadRoundBasics(store, roundId);
  assertOpen(b);
  if (FINAL_STATUSES.includes(b.round.status)) {
    throw new RacedayError('CONFLICT', 'Das Ergebnis ist bereits final.');
  }
  if (!(await hasRaceResult(store, b))) {
    throw new RacedayError('PRECONDITION_FAILED', 'Es ist noch kein Rennergebnis eingetragen.');
  }
  const { warnings } = await recomputeRound(store, roundId);
  if (b.round.status === 'provisional') {
    // Schon öffentlich: nur neu bauen, Protestfrist nicht verlängern, kein zweiter Discord-Post
    await requestRebuild(store, `Ergebnis geändert: ${roundText(b)}`);
    return { round: b.round, warnings, discord: false, alreadyPublic: true };
  }
  const [updated] = await store.update('rounds', { id: roundId }, { status: 'provisional', provisional_at: new Date().toISOString() });
  const round = updated ?? b.round;
  await audit(store, staff, 'publish', 'rounds', roundId, { status: b.round.status }, { status: round.status, provisional_at: round.provisional_at, protest_deadline: round.protest_deadline });
  const discord = await postResultsEmbed(store, roundId, 'provisional');
  await requestRebuild(store, `Ergebnis vorläufig: ${roundText(b)}`);
  return { round, warnings, discord, alreadyPublic: false };
}

export interface OpenStewardWork {
  openIncidents: number;
  draftDecisions: number;
  protestOpen: boolean;
}

export async function openStewardWork(store: Store, round: RoundRow, now = new Date()): Promise<OpenStewardWork> {
  const [incidents, drafts] = await Promise.all([
    store.select('incidents', { eq: { round_id: round.id } }),
    store.select('decisions', { eq: { round_id: round.id, status: 'draft' } }),
  ]);
  return {
    openIncidents: incidents.filter((i) => i.status === 'new' || i.status === 'in_review').length,
    draftDecisions: drafts.length,
    protestOpen: round.status === 'provisional' && round.protest_deadline != null && new Date(round.protest_deadline) > now,
  };
}

/** Final setzen: Snapshot, Discord-Post. Offene Vorfälle/Entwürfe nur mit Bestätigung. */
export async function finalizeRound(
  store: Store,
  roundId: Id,
  staff: Actor,
  opts: { force?: boolean } = {},
): Promise<{ round: RoundRow; warnings: RecomputeWarning[]; snapshots: number; discord: boolean }> {
  const b = await loadRoundBasics(store, roundId);
  assertOpen(b);
  if (FINAL_STATUSES.includes(b.round.status)) throw new RacedayError('CONFLICT', 'Das Ergebnis ist bereits final.');
  if (b.round.status !== 'provisional') {
    throw new RacedayError('PRECONDITION_FAILED', 'Bitte das Ergebnis zuerst vorläufig veröffentlichen.');
  }
  const open = await openStewardWork(store, b.round);
  const blockers: string[] = [];
  if (open.protestOpen && b.round.protest_deadline) blockers.push(`Protestfrist läuft bis ${formatDateTime(b.round.protest_deadline, 'de')} Uhr`);
  if (open.openIncidents > 0) blockers.push(`${open.openIncidents} offene Vorfälle`);
  if (open.draftDecisions > 0) blockers.push(`${open.draftDecisions} Entscheidungs-Entwürfe`);
  if (blockers.length > 0 && !opts.force) {
    throw new RacedayError('PRECONDITION_FAILED', 'Noch nicht alles erledigt – bitte bestätigen:', blockers);
  }
  const { warnings } = await recomputeRound(store, roundId);
  const [updated] = await store.update('rounds', { id: roundId }, { status: 'final', final_at: new Date().toISOString() });
  const round = updated ?? b.round;
  const snapshots = await saveSnapshots(store, b.season.id, b.round.number);
  await audit(store, staff, 'finalize', 'rounds', roundId, { status: b.round.status }, { status: 'final', final_at: round.final_at, forced: blockers.length > 0 ? blockers : undefined });
  const discord = await postResultsEmbed(store, roundId, 'final');
  await requestRebuild(store, `Ergebnis final: ${roundText(b)}`);
  return { round, warnings, snapshots, discord };
}

/**
 * Korrektur nach „final“ (Plan §5.2): Pflicht-Grund (öffentlich), Status „korrigiert“,
 * Neuberechnung und Snapshots ab dieser Runde, Discord-Post.
 */
export async function correctRound(
  store: Store,
  roundId: Id,
  staff: Actor,
  reasonDe: string,
  reasonEn: string | null = null,
): Promise<{ round: RoundRow; warnings: RecomputeWarning[]; snapshots: number; discord: boolean }> {
  const reason = reasonDe.trim();
  if (reason.length < 5) throw new RacedayError('BAD_REQUEST', 'Bitte gib einen Grund für die Korrektur an (öffentlich sichtbar).');
  const b = await loadRoundBasics(store, roundId);
  assertOpen(b);
  if (!FINAL_STATUSES.includes(b.round.status)) {
    throw new RacedayError('PRECONDITION_FAILED', 'Korrekturen gibt es erst nach „final“ – vorher einfach speichern.');
  }
  const correction = await store.insert('round_corrections', {
    round_id: roundId,
    reason_de: reason,
    reason_en: reasonEn?.trim() || null,
    created_by: staff.userId,
  });
  const { warnings } = await recomputeRound(store, roundId);
  const [updated] = b.round.status === 'corrected' ? [b.round] : await store.update('rounds', { id: roundId }, { status: 'corrected' });
  const round = updated ?? b.round;
  const snapshots = await saveSnapshots(store, b.season.id, b.round.number);
  await audit(store, staff, 'correct', 'rounds', roundId, { status: b.round.status }, { status: 'corrected', reason_de: reason, correction_id: correction[0]?.id });
  const discord = await postResultsEmbed(store, roundId, 'corrected', reason);
  await requestRebuild(store, `Ergebnis korrigiert: ${roundText(b)}`);
  return { round, warnings, snapshots, discord };
}

// ---------------------------------------------------------------------------- Aufstellung

export interface LineupContext {
  basics: RoundBasics;
  teams: TeamRow[];
  seasonSeats: SeatRow[];
  drivers: DriverRow[];
  numbers: DriverNumberRow[];
  entries: RoundEntryRow[];
  absences: RoundAbsenceRow[];
  /** Rennsperren aus der Vorrunde. */
  bannedForRound: Id[];
  previousRound: RoundRow | null;
  hasResults: boolean;
}

export async function loadLineupContext(store: Store, roundId: Id): Promise<LineupContext> {
  const basics = await loadRoundBasics(store, roundId);
  const { round, season } = basics;
  const [seasonTeams, seats, drivers, numbers, entries, absences, rounds] = await Promise.all([
    store.select('season_teams', { eq: { season_id: season.id } }),
    store.select('seats', { eq: { season_id: season.id } }),
    store.select('drivers'),
    store.select('driver_numbers'),
    store.select('round_entries', { eq: { round_id: roundId } }),
    store.select('round_absences', { eq: { round_id: roundId } }),
    store.select('rounds', { eq: { season_id: season.id } }),
  ]);
  const teamIds = seasonTeams.sort((a, b) => a.sort_order - b.sort_order).map((t) => t.team_id);
  const teamRows = teamIds.length > 0 ? await store.select('teams', { in: { id: teamIds } }) : [];
  const teams = teamIds.map((id) => teamRows.find((t) => t.id === id)).filter((t): t is TeamRow => t != null);
  const previousRound =
    rounds
      .filter((r) => r.number < round.number && r.status !== 'cancelled')
      .sort((a, b) => a.number - b.number)
      .at(-1) ?? null;
  const prevDecisions: DecisionRow[] = previousRound ? await store.select('decisions', { eq: { round_id: previousRound.id } }) : [];
  const sessionIds = basics.sessions.map((s) => s.id);
  const anyResult = sessionIds.length > 0 ? await store.select('results', { in: { session_id: sessionIds }, limit: 1 }) : [];
  return {
    basics,
    teams,
    seasonSeats: seatsForRound(seats, round.number),
    drivers: drivers.filter((d) => !d.anonymized),
    numbers,
    entries,
    absences,
    bannedForRound: [...raceBansFromPreviousRound(prevDecisions, previousRound?.id ?? null)],
    previousRound,
    hasResults: anyResult.length > 0,
  };
}

export interface LineupInput {
  entries: Array<{ teamId: Id; seatNo: 1 | 2; driverId: Id }>;
  absences: Array<{ driverId: Id; reportedInTime: boolean; note?: string | null }>;
}

/** Einträge serverseitig aufbauen (Rolle, „ersetzt X“, Startnummer zum Rennstart) und prüfen. */
export function buildGrid(ctx: LineupContext, input: LineupInput): { entries: GridEntry[]; issues: GridIssue[] } {
  const start = new Date(ctx.basics.round.start_utc);
  const teamIds = new Set(ctx.teams.map((t) => t.id));
  const driverIds = new Set(ctx.drivers.map((d) => d.id));
  const bad: string[] = [];
  for (const e of input.entries) {
    if (!teamIds.has(e.teamId)) bad.push(`Team #${e.teamId} fährt in dieser Saison nicht`);
    if (!driverIds.has(e.driverId)) bad.push(`Fahrer #${e.driverId} existiert nicht`);
  }
  for (const a of input.absences) if (!driverIds.has(a.driverId)) bad.push(`Fahrer #${a.driverId} existiert nicht`);
  if (bad.length > 0) throw new RacedayError('BAD_REQUEST', 'Ungültige Aufstellung:', bad);

  const entries: GridEntry[] = input.entries.map((e) => {
    const regular = ctx.seasonSeats.find((s) => s.team_id === e.teamId && s.seat_no === e.seatNo)?.driver_id ?? null;
    const isRegular = regular === e.driverId;
    return {
      teamId: e.teamId,
      seatNo: e.seatNo,
      driverId: e.driverId,
      role: isRegular ? 'regular' : 'reserve',
      replacesDriverId: isRegular ? null : regular,
      raceNumber: numberAt(e.driverId, ctx.numbers, start),
    };
  });
  const statusOf = new Map(ctx.drivers.map((d) => [d.id, d.status]));
  const issues = checkGrid(entries, {
    driverStatus: (id) => statusOf.get(id),
    absentDriverIds: new Set(input.absences.map((a) => a.driverId)),
    bannedForRound: new Set(ctx.bannedForRound),
    teamIds: ctx.teams.map((t) => t.id),
  });
  return { entries, issues };
}

export function gridIssueMessages(ctx: LineupContext, issues: readonly GridIssue[]): string[] {
  const driver = new Map(ctx.drivers.map((d) => [d.id, displayName(d)]));
  const team = new Map(ctx.teams.map((t) => [t.id, t.name]));
  return issues.map((i) =>
    gridIssueText(i, { driver: (id) => driver.get(id) ?? `Fahrer #${id}`, team: (id) => team.get(id) ?? `Team #${id}` }),
  );
}

const DB_BLOCKING: readonly GridIssue['code'][] = ['duplicate_driver', 'duplicate_seat', 'too_many_drivers'];

/** Aufstellung als Entwurf speichern (Einträge + Abmeldungen ersetzen). */
export async function saveLineup(
  store: Store,
  roundId: Id,
  input: LineupInput,
  staff: Actor,
): Promise<{ issues: GridIssue[]; messages: string[]; ctx: LineupContext; entries: GridEntry[] }> {
  const ctx = await loadLineupContext(store, roundId);
  assertOpen(ctx.basics);
  const { entries, issues } = buildGrid(ctx, input);
  const hard = issues.filter((i) => DB_BLOCKING.includes(i.code));
  if (hard.length > 0) {
    throw new RacedayError('BAD_REQUEST', 'Die Aufstellung kann so nicht gespeichert werden:', gridIssueMessages(ctx, hard));
  }

  const before = ctx.entries.map((e) => `${e.team_id}/${e.seat_no}:${e.driver_id}`).sort();
  await store.remove('round_entries', { round_id: roundId });
  const created =
    entries.length > 0
      ? await store.insert(
          'round_entries',
          entries.map((e) => ({
            round_id: roundId,
            team_id: e.teamId,
            seat_no: e.seatNo,
            driver_id: e.driverId,
            role: e.role,
            replaces_driver_id: e.replacesDriverId,
            race_number: e.raceNumber,
          })),
        )
      : [];

  // Vorhandene Ergebnisse wieder mit den neuen Einträgen verknüpfen
  const sessionIds = ctx.basics.sessions.map((s) => s.id);
  if (ctx.hasResults && sessionIds.length > 0) {
    const entryByDriver = new Map(created.map((e) => [e.driver_id, e.id]));
    const results = await store.select('results', { in: { session_id: sessionIds } });
    for (const r of results) {
      const next = entryByDriver.get(r.driver_id) ?? null;
      if (r.round_entry_id !== next) await store.update('results', { id: r.id }, { round_entry_id: next });
    }
  }

  await store.remove('round_absences', { round_id: roundId });
  if (input.absences.length > 0) {
    await store.insert(
      'round_absences',
      input.absences.map((a) => ({
        round_id: roundId,
        driver_id: a.driverId,
        reported_in_time: a.reportedInTime,
        note: a.note?.trim() || (a.reportedInTime ? null : 'Abmeldung nach Frist'),
      })),
    );
  }

  const after = created.map((e) => `${e.team_id}/${e.seat_no}:${e.driver_id}`).sort();
  await audit(
    store,
    staff,
    'update',
    'round_entries',
    roundId,
    { entries: before, absences: ctx.absences.map((a) => a.driver_id) },
    { entries: after, absences: input.absences.map((a) => a.driverId) },
  );
  if (ctx.basics.round.status !== 'scheduled') await requestRebuild(store, `Aufstellung geändert: ${roundText(ctx.basics)}`);
  return { issues, messages: gridIssueMessages(ctx, issues), ctx, entries };
}

/** Aufstellung speichern und veröffentlichen (Rennseite, optional Discord „lineup“). */
export async function publishLineup(
  store: Store,
  roundId: Id,
  input: LineupInput,
  staff: Actor,
  opts: { discord: boolean },
): Promise<{ round: RoundRow; messages: string[]; discord: boolean }> {
  const saved = await saveLineup(store, roundId, input, staff);
  if (hasBlockingIssues(saved.issues)) {
    const errors = saved.issues.filter((i) => i.severity === 'error');
    throw new RacedayError(
      'PRECONDITION_FAILED',
      'Als Entwurf gespeichert, aber nicht veröffentlicht – bitte zuerst die Fehler beheben:',
      gridIssueMessages(saved.ctx, errors),
    );
  }
  const { round: before } = saved.ctx.basics;
  let round = before;
  if (before.status === 'scheduled') {
    const [updated] = await store.update('rounds', { id: roundId }, { status: 'lineup_published' });
    round = updated ?? before;
  }
  await audit(store, staff, 'publish', 'round_entries', roundId, { status: before.status }, { status: round.status, entries: saved.entries.length });

  let discord = false;
  if (opts.discord) {
    const name = new Map(saved.ctx.drivers.map((d) => [d.id, displayName(d)]));
    const embed = lineupEmbed({
      roundLabel: roundText(saved.ctx.basics),
      seasonName: seasonLabel(saved.ctx.basics.season, 'de'),
      startText: `${formatDateTime(round.start_utc, 'de')} Uhr`,
      url: racePageUrl(saved.ctx.basics.season, round),
      teams: saved.ctx.teams.map((t) => ({
        team: t.name,
        seats: ([1, 2] as const).map((seatNo) => {
          const e = saved.entries.find((x) => x.teamId === t.id && x.seatNo === seatNo);
          return {
            name: e ? (name.get(e.driverId) ?? null) : null,
            number: e?.raceNumber ?? null,
            reserve: e?.role === 'reserve',
            replaces: e?.replacesDriverId != null ? (name.get(e.replacesDriverId) ?? null) : null,
          };
        }),
      })),
    });
    discord = await notify(store, 'lineup', { ...embed, color: EMBED_TEAL });
  }
  await requestRebuild(store, `Aufstellung veröffentlicht: ${roundText(saved.ctx.basics)}`);
  return { round, messages: saved.messages, discord };
}
