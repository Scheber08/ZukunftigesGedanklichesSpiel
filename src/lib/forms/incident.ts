/**
 * Vorfall melden (Plan §4.6): Protestfrist, Zeitstempel im Clip, Beteiligte.
 * Reine Funktionen ohne I/O – Seite und Action nutzen dieselbe Logik.
 */
import type { Id, ResultRow, RoundEntryRow, RoundRow } from '../db/types';

/** Offene Protestfrist: Ergebnis vorläufig und Frist in der Zukunft (wie League.protestOpen). */
export function isProtestOpen(round: Pick<RoundRow, 'status' | 'protest_deadline'>, now: Date): boolean {
  if (round.status !== 'provisional' || !round.protest_deadline) return false;
  const deadline = new Date(round.protest_deadline).getTime();
  return Number.isFinite(deadline) && deadline > now.getTime();
}

/** Runden mit offener Protestfrist, die früheste Frist zuerst. */
export function openProtestRounds<T extends Pick<RoundRow, 'status' | 'protest_deadline'>>(rounds: readonly T[], now: Date): T[] {
  return rounds
    .filter((r) => isProtestOpen(r, now))
    .sort((a, b) => (a.protest_deadline ?? '').localeCompare(b.protest_deadline ?? ''));
}

const TIMESTAMP_RE = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/;

/** „01:23“, „1:02:10“ oder „83:10“ (Minuten ohne Stunden). Punkt als Trenner wird akzeptiert. */
export function normalizeClipTimestamp(input: string): string {
  return input.trim().replace(/\s+/g, '').replace(/\./g, ':');
}

export function isValidClipTimestamp(input: string): boolean {
  const m = TIMESTAMP_RE.exec(normalizeClipTimestamp(input));
  if (!m) return false;
  const [, hours, minutes, seconds] = m;
  if (Number(seconds) >= 60) return false;
  // Mit Stundenangabe müssen die Minuten zweistellig sinnvoll sein (< 60)
  if (hours !== undefined && Number(minutes) >= 60) return false;
  return true;
}

export type ParticipantIssue =
  | { field: 'reporter_driver_id'; code: 'reporter_invalid' }
  | { field: 'involved_driver_ids'; code: 'involved_invalid' | 'involved_required' };

/**
 * Melder und Beteiligte müssen im Grid der Runde stehen; mindestens ein Beteiligter
 * muss jemand anderes als der Melder sein.
 */
export function checkParticipants(gridDriverIds: Iterable<Id>, reporterId: Id, involvedIds: readonly Id[]): ParticipantIssue | null {
  const grid = new Set(gridDriverIds);
  if (!grid.has(reporterId)) return { field: 'reporter_driver_id', code: 'reporter_invalid' };
  if (involvedIds.some((id) => !grid.has(id))) return { field: 'involved_driver_ids', code: 'involved_invalid' };
  if (!involvedIds.some((id) => id !== reporterId)) return { field: 'involved_driver_ids', code: 'involved_required' };
  return null;
}

/** Beteiligte ohne Duplikate, Reihenfolge wie ausgewählt. */
export function uniqueIds(ids: readonly Id[]): Id[] {
  return [...new Set(ids)];
}

export interface GridSlot {
  driverId: Id;
  number: number | null;
  teamId: Id;
  reserve: boolean;
}

/**
 * Wer stand in der Runde am Start? Die Aufstellung, ergänzt um Fahrer, die nur in den
 * Ergebnissen stehen (z. B. kurzfristiger Ersatz ohne gepflegte Aufstellung). Je Fahrer ein Eintrag.
 */
export function mergeGrid(
  entries: ReadonlyArray<Pick<RoundEntryRow, 'driver_id' | 'race_number' | 'team_id' | 'role'>>,
  results: ReadonlyArray<Pick<ResultRow, 'driver_id' | 'race_number' | 'team_id' | 'role'>>,
): GridSlot[] {
  const out = new Map<Id, GridSlot>();
  for (const e of entries) {
    if (!out.has(e.driver_id)) out.set(e.driver_id, { driverId: e.driver_id, number: e.race_number, teamId: e.team_id, reserve: e.role === 'reserve' });
  }
  for (const r of results) {
    const known = out.get(r.driver_id);
    if (!known) out.set(r.driver_id, { driverId: r.driver_id, number: r.race_number, teamId: r.team_id, reserve: r.role === 'reserve' });
    else if (known.number == null && r.race_number != null) known.number = r.race_number;
  }
  return [...out.values()];
}
