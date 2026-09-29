/**
 * Ergebnis-Eingabe (Plan §5.2): Zuordnung zwischen Datenbankzeilen (`results`),
 * Eingabezeilen des Editors (Texte wie „1:23.456“) und der Punktelogik (`EnteredResult`).
 * Reine Funktionen – im Server (Speichern, Neuberechnung) und im Browser (Vorschau) genutzt.
 */
import type { EntryRole, Id, ResultRow, ResultStatus, SessionType } from '../../db/types';
import { RESULT_STATUSES } from '../../db/types';
import { formatLapTime, parseLapTime } from '../../domain/laptime';
import type { ComputedResult, EnteredResult } from '../../domain/points';

/** Zeile im Editor – Zeiten als Text, wie getippt. */
export interface EditorRow {
  driverId: Id;
  teamId: Id;
  role: EntryRole;
  roundEntryId: Id | null;
  raceNumber: number | null;
  status: ResultStatus;
  gridPosition: number | null;
  laps: number | null;
  bestLap: string;
  totalTime: string;
  gap: string;
  gapLaps: number | null;
  pitStops: number | null;
  ingamePenaltyS: number;
}

/** Geprüfte Zeile, wie sie an den Server geht (Reihenfolge = Eingabe-Reihenfolge). */
export interface ResultInput {
  driverId: Id;
  teamId: Id;
  role: EntryRole;
  roundEntryId: Id | null;
  raceNumber: number | null;
  status: ResultStatus;
  gridPosition: number | null;
  laps: number | null;
  bestLapMs: number | null;
  totalTimeMs: number | null;
  gapMs: number | null;
  gapLaps: number | null;
  pitStops: number | null;
  ingamePenaltyS: number;
}

export type TimeField = 'bestLap' | 'totalTime' | 'gap';
export type RowErrors = Partial<Record<TimeField, string>>;

/** Felder, die das Neuberechnen aus Eingabe + Strafen setzt. */
export type ComputedPatch = Pick<
  ResultRow,
  'position' | 'points' | 'is_fastest_lap' | 'is_pole' | 'steward_penalty_s' | 'counts_for_constructors' | 'status'
>;

const msToText = (ms: number | null | undefined): string => (ms == null || ms <= 0 ? '' : formatLapTime(ms));

/** Abstand als Text: unter einer Minute in Sekunden („5.123“), sonst „1:05.123“. */
export function formatGapInput(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '';
  if (ms === 0) return '0.000';
  if (ms >= 60_000) return formatLapTime(ms);
  return (ms / 1000).toFixed(3);
}

/** Abstand parsen: „+5.123“, „5,1“, „1:05.2“. Leer → null, ungültig → undefined. */
export function parseGap(input: string): number | null | undefined {
  const s = input.trim().replace(/^\+/, '');
  if (s === '') return null;
  if (/^0+([.,]0*)?$/.test(s)) return 0;
  const ms = parseLapTime(s);
  return ms == null ? undefined : ms;
}

/** Zeit parsen: leer → null, ungültig → undefined. */
export function parseTimeInput(input: string): number | null | undefined {
  const s = input.trim();
  if (s === '') return null;
  const ms = parseLapTime(s);
  return ms == null ? undefined : ms;
}

export function resultRowToEditor(row: ResultRow): EditorRow {
  return {
    driverId: row.driver_id,
    teamId: row.team_id,
    role: row.role,
    roundEntryId: row.round_entry_id,
    raceNumber: row.race_number,
    status: row.status,
    gridPosition: row.grid_position,
    laps: row.laps,
    bestLap: msToText(row.best_lap_ms),
    totalTime: msToText(row.total_time_ms),
    gap: formatGapInput(row.gap_ms),
    gapLaps: row.gap_laps,
    pitStops: row.pit_stops,
    ingamePenaltyS: row.ingame_penalty_s ?? 0,
  };
}

/** Leere Eingabezeile aus einem Aufstellungs-Eintrag. */
export function entryToEditor(
  entry: { id: Id | null; driver_id: Id; team_id: Id; role: EntryRole; race_number: number | null },
  gridPosition: number | null = null,
): EditorRow {
  return {
    driverId: entry.driver_id,
    teamId: entry.team_id,
    role: entry.role,
    roundEntryId: entry.id,
    raceNumber: entry.race_number,
    status: 'classified',
    gridPosition,
    laps: null,
    bestLap: '',
    totalTime: '',
    gap: '',
    gapLaps: null,
    pitStops: null,
    ingamePenaltyS: 0,
  };
}

const isNonNegativeInt = (n: number | null): boolean => n == null || (Number.isInteger(n) && n >= 0);

/** Eingabezeile prüfen und in Millisekunden umrechnen. */
export function parseEditorRow(row: EditorRow): { input: ResultInput; errors: RowErrors } {
  const errors: RowErrors = {};
  const bestLapMs = parseTimeInput(row.bestLap);
  const totalTimeMs = parseTimeInput(row.totalTime);
  const gapMs = parseGap(row.gap);
  if (bestLapMs === undefined) errors.bestLap = 'Format m:ss.SSS, z. B. 1:23.456';
  if (totalTimeMs === undefined) errors.totalTime = 'Format h:mm:ss.SSS oder m:ss.SSS';
  if (gapMs === undefined) errors.gap = 'Sekunden, z. B. 5.123 oder 1:05.200';
  return {
    input: {
      driverId: row.driverId,
      teamId: row.teamId,
      role: row.role,
      roundEntryId: row.roundEntryId,
      raceNumber: row.raceNumber,
      status: row.status,
      gridPosition: row.gridPosition,
      laps: row.laps,
      bestLapMs: bestLapMs ?? null,
      totalTimeMs: totalTimeMs ?? null,
      gapMs: gapMs ?? null,
      gapLaps: row.gapLaps,
      pitStops: row.pitStops,
      ingamePenaltyS: row.ingamePenaltyS || 0,
    },
    errors,
  };
}

export type SessionIssueCode = 'duplicate_driver' | 'invalid_number' | 'grid_duplicate' | 'status_unknown';

export interface SessionIssue {
  code: SessionIssueCode;
  driverId?: Id;
  message: string;
}

/** Plausibilitätsprüfung einer Session vor dem Speichern (Server und Browser). */
export function validateSessionInput(rows: readonly ResultInput[], name: (id: Id) => string = String): SessionIssue[] {
  const issues: SessionIssue[] = [];
  const seen = new Set<Id>();
  const grid = new Map<number, Id>();
  for (const r of rows) {
    if (seen.has(r.driverId)) {
      issues.push({ code: 'duplicate_driver', driverId: r.driverId, message: `${name(r.driverId)} ist doppelt eingetragen` });
    }
    seen.add(r.driverId);
    if (!RESULT_STATUSES.includes(r.status)) {
      issues.push({ code: 'status_unknown', driverId: r.driverId, message: `${name(r.driverId)}: unbekannter Status` });
    }
    const ints = [r.laps, r.gapLaps, r.pitStops, r.ingamePenaltyS, r.gridPosition];
    if (!ints.every((n) => isNonNegativeInt(n)) || (r.gridPosition != null && r.gridPosition < 1)) {
      issues.push({ code: 'invalid_number', driverId: r.driverId, message: `${name(r.driverId)}: Zahlenfelder müssen ganze Zahlen ≥ 0 sein` });
    }
    if (r.gridPosition != null) {
      const other = grid.get(r.gridPosition);
      if (other != null && other !== r.driverId) {
        issues.push({
          code: 'grid_duplicate',
          driverId: r.driverId,
          message: `Startplatz ${r.gridPosition} ist doppelt vergeben (${name(other)}, ${name(r.driverId)})`,
        });
      }
      grid.set(r.gridPosition, r.driverId);
    }
  }
  return issues;
}

/**
 * Zeilen mit der Aufstellung der Runde verknüpfen: Eintrag, Team, Rolle und Startnummer kommen
 * aus `round_entries` (Quelle der Wahrheit, nicht der Browser). Fahrer ohne Eintrag in dieser Runde
 * behalten Team und Rolle, verlieren aber eine fremde Verknüpfung.
 */
export function linkRowsToEntries<R extends Pick<ResultInput, 'driverId' | 'teamId' | 'role' | 'roundEntryId' | 'raceNumber'>>(
  rows: readonly R[],
  entries: ReadonlyArray<{ id: Id; driver_id: Id; team_id: Id; role: EntryRole; race_number: number | null }>,
): R[] {
  const byDriver = new Map(entries.map((e) => [e.driver_id, e]));
  return rows.map((r) => {
    const e = byDriver.get(r.driverId);
    if (!e) return { ...r, roundEntryId: null };
    return { ...r, roundEntryId: e.id, teamId: e.team_id, role: e.role, raceNumber: e.race_number ?? r.raceNumber };
  });
}

/** Eingabezeile → Eingabe der Punktelogik. */
export function inputToEntered(r: ResultInput, index: number): EnteredResult {
  return {
    driverId: r.driverId,
    teamId: r.teamId,
    role: r.role,
    enteredPosition: index + 1,
    status: r.status,
    laps: r.laps,
    totalTimeMs: r.totalTimeMs,
    gapMs: r.gapMs,
    gapLaps: r.gapLaps,
    bestLapMs: r.bestLapMs,
  };
}

/** Gespeicherte Ergebniszeile → Eingabe der Punktelogik. */
export function resultRowToEntered(row: ResultRow): EnteredResult {
  return {
    driverId: row.driver_id,
    teamId: row.team_id,
    role: row.role,
    enteredPosition: row.entered_position,
    status: row.status,
    laps: row.laps,
    totalTimeMs: row.total_time_ms,
    gapMs: row.gap_ms,
    gapLaps: row.gap_laps,
    bestLapMs: row.best_lap_ms,
  };
}

/** Berechnete Felder für das Speichern. */
export function computedToPatch(c: ComputedResult): ComputedPatch {
  return {
    position: c.position,
    points: c.points,
    is_fastest_lap: c.isFastestLap,
    is_pole: c.isPole,
    steward_penalty_s: c.stewardPenaltyS,
    counts_for_constructors: c.countsForConstructors,
    status: c.status,
  };
}

/** Eingabezeile → Zeile für `results` (ohne id, Konflikt über session_id + driver_id). */
export function inputToResultInsert(r: ResultInput, sessionId: Id, index: number): Partial<ResultRow> {
  return {
    session_id: sessionId,
    round_entry_id: r.roundEntryId,
    driver_id: r.driverId,
    team_id: r.teamId,
    race_number: r.raceNumber,
    role: r.role,
    entered_position: index + 1,
    status: r.status,
    grid_position: r.gridPosition,
    laps: r.laps,
    total_time_ms: r.totalTimeMs,
    gap_ms: r.gapMs,
    gap_laps: r.gapLaps,
    best_lap_ms: r.bestLapMs,
    pit_stops: r.pitStops,
    ingame_penalty_s: r.ingamePenaltyS,
  };
}

/** Positionsänderung Start → Ziel (positiv = gewonnen), nur für Rennen und Sprint. */
export function positionChange(type: SessionType, grid: number | null, position: number | null): number | null {
  if (type === 'qualifying' || grid == null || position == null) return null;
  return grid - position;
}

/**
 * Vorbelegung einer Session: Reihenfolge nach Startplatz (falls bekannt),
 * sonst nach Aufstellung. Startplätze aus `grid` (z. B. computeGrid).
 */
export function prefillRows<E extends { id: Id | null; driver_id: Id; team_id: Id; role: EntryRole; race_number: number | null }>(
  entries: readonly E[],
  grid: ReadonlyMap<Id, number> | null,
): EditorRow[] {
  const rows = entries.map((e) => entryToEditor(e, grid?.get(e.driver_id) ?? null));
  if (!grid || grid.size === 0) return rows;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.gridPosition ?? 999) - (b.r.gridPosition ?? 999) || a.i - b.i)
    .map(({ r }) => r);
}

/** Zeile an eine neue Position (0-basiert) verschieben. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item as T);
  return out;
}
