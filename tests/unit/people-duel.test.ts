/**
 * Teamkollegen-Duell Runde für Runde (src/lib/people/duel.ts): Status statt „–“ bei
 * DNF/DSQ/DNS, gewerteter Fahrer schlägt ausgefallenen, beide ausgefallen = kein Duell.
 */
import { describe, expect, it } from 'vitest';
import type { ResultStatus, SessionType } from '~/lib/db/types';
import type { StandingsResult } from '~/lib/domain/standings';
import { teammateDuel } from '~/lib/domain/stats';
import { duelDetail, isNoDuel } from '~/lib/people/duel';

const TEAM = 5;
const A = 1;
const B = 2;

function r(driverId: number, roundId: number, sessionType: SessionType, position: number | null, status: ResultStatus = position == null ? 'dnf' : 'classified', teamId = TEAM): StandingsResult {
  return {
    roundId,
    sessionType,
    driverId,
    teamId,
    role: 'regular',
    position,
    status,
    points: 0,
    isPole: false,
    isFastestLap: false,
    countsForConstructors: true,
    gridPosition: null,
  };
}

const results: StandingsResult[] = [
  // Runde 10: normal, A vorn
  r(A, 10, 'qualifying', 2),
  r(B, 10, 'qualifying', 4),
  r(A, 10, 'race', 3),
  r(B, 10, 'race', 6),
  // Runde 11: B DNF im Rennen → A vorn; Quali B vorn
  r(A, 11, 'qualifying', 5),
  r(B, 11, 'qualifying', 1),
  r(A, 11, 'race', 12),
  r(B, 11, 'race', null, 'dnf'),
  // Runde 12: beide nicht gewertet (DNF + DSQ) → kein Duell
  r(A, 12, 'qualifying', 3),
  r(B, 12, 'qualifying', 7),
  r(A, 12, 'race', null, 'dnf'),
  r(B, 12, 'race', null, 'dsq'),
  // Runde 13: A DNS, B gewertet → B vorn
  r(A, 13, 'qualifying', 9),
  r(B, 13, 'qualifying', 8),
  r(A, 13, 'race', null, 'dns'),
  r(B, 13, 'race', 15),
  // Runde 14: B fuhr für ein anderes Team → keine gemeinsame Runde
  r(A, 14, 'race', 1),
  r(B, 14, 'race', 2, 'classified', 6),
  // fremder Fahrer
  r(3, 10, 'race', 1),
];

describe('duelDetail', () => {
  const detail = duelDetail(results, TEAM, A, B);

  it('nur Runden, in denen beide fürs Team gefahren sind', () => {
    expect(detail.rounds.map((x) => x.roundId)).toEqual([10, 11, 12, 13]);
  });

  it('Status statt Strich und Sieger nach der Duell-Regel', () => {
    const r11 = detail.rounds.find((x) => x.roundId === 11)!;
    expect(r11.race).toEqual({ a: { position: 12, status: 'classified' }, b: { position: null, status: 'dnf' }, winner: 'a' });
    expect(r11.quali.winner).toBe('b');
    const r13 = detail.rounds.find((x) => x.roundId === 13)!;
    expect(r13.race.a).toEqual({ position: null, status: 'dns' });
    expect(r13.race.winner).toBe('b');
  });

  it('beide ausgefallen = kein Duell (als Text markiert)', () => {
    const r12 = detail.rounds.find((x) => x.roundId === 12)!;
    expect(r12.race.winner).toBe('none');
    expect(isNoDuel(r12.race)).toBe(true);
    expect(isNoDuel(r12.quali)).toBe(false);
    expect(detail.raceNoDuel).toBe(1);
    expect(detail.qualiNoDuel).toBe(0);
  });

  it('Zähler stimmen mit teammateDuel überein', () => {
    const duel = teammateDuel(results, TEAM, A, B);
    expect([detail.qualiWinsA, detail.qualiWinsB, detail.raceWinsA, detail.raceWinsB]).toEqual([
      duel.qualiWinsA,
      duel.qualiWinsB,
      duel.raceWinsA,
      duel.raceWinsB,
    ]);
    expect([detail.raceWinsA, detail.raceWinsB]).toEqual([2, 1]);
    expect([detail.qualiWinsA, detail.qualiWinsB]).toEqual([2, 2]);
  });

  it('fehlende Session (nur Rennen gefahren) ist kein Duell, aber kein „kein Duell“-Text', () => {
    const d = duelDetail([r(A, 20, 'race', 4), r(B, 20, 'race', 5), r(A, 20, 'qualifying', 3)], TEAM, A, B);
    expect(d.rounds[0]!.quali).toEqual({ a: { position: 3, status: 'classified' }, b: null, winner: 'none' });
    expect(isNoDuel(d.rounds[0]!.quali)).toBe(false);
    expect(d.qualiNoDuel).toBe(0);
  });

  it('sortiert nach roundOrder', () => {
    const d = duelDetail(results, TEAM, A, B, (id) => -id);
    expect(d.rounds.map((x) => x.roundId)).toEqual([13, 12, 11, 10]);
  });
});
