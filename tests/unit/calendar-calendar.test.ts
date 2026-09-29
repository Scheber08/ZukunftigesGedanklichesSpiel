/**
 * Rennkalender: abgeschlossene/kommende Runden trennen und die nächste Runde bestimmen.
 */
import { describe, expect, it } from 'vitest';
import { isRoundDone, splitCalendar } from '~/lib/calendar/calendar';
import type { RoundRow } from '~/lib/db/types';

const NOW = new Date('2026-09-29T12:00:00Z');

type R = Pick<RoundRow, 'id' | 'number' | 'status' | 'start_utc'>;
const r = (id: number, status: RoundRow['status'], start: string): R => ({ id, number: id, status, start_utc: start });

const rounds: R[] = [
  r(3, 'provisional', '2026-09-21T18:00:00Z'),
  r(1, 'final', '2026-09-07T18:00:00Z'),
  r(2, 'cancelled', '2026-09-14T18:00:00Z'),
  r(4, 'lineup_published', '2026-09-28T18:00:00Z'), // gefahren, Ergebnis fehlt noch
  r(5, 'cancelled', '2026-10-05T18:00:00Z'), // künftige Absage
  r(6, 'scheduled', '2026-10-12T18:00:00Z'),
  r(7, 'scheduled', '2026-10-19T18:00:00Z'),
];

describe('isRoundDone', () => {
  it('zählt veröffentlichte Ergebnisse und vergangene Absagen als abgeschlossen', () => {
    expect(isRoundDone(rounds[0]!, NOW)).toBe(true);
    expect(isRoundDone(rounds[2]!, NOW)).toBe(true);
    expect(isRoundDone(rounds[3]!, NOW)).toBe(false);
    expect(isRoundDone(rounds[4]!, NOW)).toBe(false);
  });
});

describe('splitCalendar', () => {
  it('sortiert chronologisch und trennt abgeschlossene Runden ab', () => {
    const split = splitCalendar(rounds, NOW);
    expect(split.completed.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(split.upcoming.map((x) => x.id)).toEqual([4, 5, 6, 7]);
  });

  it('überspringt Absagen und bereits gestartete Runden bei der nächsten Runde', () => {
    expect(splitCalendar(rounds, NOW).next?.id).toBe(6);
  });

  it('bevorzugt die nächste Runde laut Liga, wenn sie in der Saison liegt', () => {
    expect(splitCalendar(rounds, NOW, 7).next?.id).toBe(7);
    // gehört zu einer anderen Saison → Rückfall auf die eigene Logik
    expect(splitCalendar(rounds, NOW, 99).next?.id).toBe(6);
  });

  it('hat am Saisonende keine nächste Runde', () => {
    const done = splitCalendar([r(1, 'final', '2026-09-07T18:00:00Z')], NOW);
    expect(done.upcoming).toEqual([]);
    expect(done.next).toBeUndefined();
  });
});
