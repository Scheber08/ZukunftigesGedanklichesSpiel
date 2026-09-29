/**
 * Reine Logik des Rennkalenders (Plan §4.3): abgeschlossene und kommende Runden trennen
 * und die nächste Runde bestimmen. Getestet in tests/unit/calendar-calendar.test.ts.
 */

import type { RoundRow } from '~/lib/db/types';
import { RESULT_VISIBLE_STATUSES } from '~/lib/db/types';

type RoundLike = Pick<RoundRow, 'id' | 'number' | 'status' | 'start_utc'>;

/** Abgeschlossen = Ergebnis veröffentlicht oder abgesagt und der Termin ist vorbei. */
export function isRoundDone(round: Pick<RoundRow, 'status' | 'start_utc'>, now: Date): boolean {
  if (RESULT_VISIBLE_STATUSES.includes(round.status)) return true;
  return round.status === 'cancelled' && new Date(round.start_utc) <= now;
}

export interface CalendarSplit<R extends RoundLike> {
  /** Abgeschlossene Runden (einklappbar), chronologisch */
  completed: R[];
  /** Noch offene Runden inkl. gerade gefahrener ohne Ergebnis, chronologisch */
  upcoming: R[];
  /** Hervorgehobene nächste Runde (Teil von `upcoming`) */
  next: R | undefined;
}

/**
 * Teilt die Runden einer Saison. `preferredNextId` ist die nächste Runde laut Liga
 * (League.nextRound); liegt sie nicht in dieser Saison, gilt die erste offene, nicht
 * abgesagte Runde mit Termin in der Zukunft.
 */
export function splitCalendar<R extends RoundLike>(rounds: readonly R[], now: Date, preferredNextId?: number): CalendarSplit<R> {
  const sorted = [...rounds].sort((a, b) => a.start_utc.localeCompare(b.start_utc) || a.number - b.number);
  const completed = sorted.filter((r) => isRoundDone(r, now));
  const upcoming = sorted.filter((r) => !isRoundDone(r, now));
  const next =
    upcoming.find((r) => r.id === preferredNextId) ??
    upcoming.find((r) => r.status !== 'cancelled' && new Date(r.start_utc) > now);
  return { completed, upcoming, next };
}
