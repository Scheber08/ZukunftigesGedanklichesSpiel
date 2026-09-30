/**
 * Head-to-Head (src/lib/domain/h2h.ts): Duell-Regel, kompakte Kodierung fürs HTML und der
 * Vergleich zweier Fahrer (gemeinsame Rennen, Quali-Duell, Kennzahlen, Saisonfilter, DotD).
 */
import { describe, expect, it } from 'vitest';
import type { ResultStatus, SessionType } from '~/lib/db/types';
import {
  betterSide,
  compareDrivers,
  decodeResults,
  duelWinner,
  encodeResult,
  H2H_METRICS,
  type H2hResult,
} from '~/lib/domain/h2h';

const A = 1;
const B = 2;

function res(
  driverId: number,
  roundId: number,
  session: SessionType,
  position: number | null,
  extra: Partial<H2hResult> = {},
): H2hResult {
  const status: ResultStatus = extra.status ?? (position == null ? 'dnf' : 'classified');
  return {
    driverId,
    roundId,
    seasonId: extra.seasonId ?? 1,
    session,
    teamId: extra.teamId ?? driverId * 10,
    position,
    status,
    points: extra.points ?? 0,
    grid: extra.grid ?? null,
    pole: extra.pole ?? false,
    fastestLap: extra.fastestLap ?? false,
    reserve: extra.reserve ?? false,
  };
}

describe('duelWinner', () => {
  it('bessere Position gewinnt', () => {
    expect(duelWinner({ position: 3, status: 'classified' }, { position: 5, status: 'classified' })).toBe('a');
    expect(duelWinner({ position: 7, status: 'classified' }, { position: 2, status: 'classified' })).toBe('b');
  });
  it('gewerteter Fahrer schlägt ausgefallenen (DNF, DSQ, DNS, NC)', () => {
    for (const status of ['dnf', 'dsq', 'dns', 'dnc'] as const) {
      expect(duelWinner({ position: 20, status: 'classified' }, { position: null, status })).toBe('a');
      expect(duelWinner({ position: null, status }, { position: 18, status: 'classified' })).toBe('b');
    }
  });
  it('beide ausgefallen oder einer fehlt = kein Duell', () => {
    expect(duelWinner({ position: null, status: 'dnf' }, { position: null, status: 'dsq' })).toBe('none');
    expect(duelWinner({ position: 1, status: 'classified' }, null)).toBe('none');
    expect(duelWinner(undefined, { position: 1, status: 'classified' })).toBe('none');
  });
  it('gleiche Position = gleichauf', () => {
    expect(duelWinner({ position: 4, status: 'classified' }, { position: 4, status: 'classified' })).toBe('tie');
  });
});

describe('Kodierung', () => {
  it('encode/decode ergibt dieselben Ergebnisse', () => {
    const original = [
      res(A, 11, 'race', 1, { points: 26, grid: 2, fastestLap: true, seasonId: 3 }),
      res(B, 11, 'qualifying', 1, { pole: true, seasonId: 3 }),
      res(B, 12, 'sprint', null, { status: 'dsq', reserve: true, seasonId: 3, points: 0 }),
    ];
    const encoded = original.map(({ seasonId: _s, ...rest }) => encodeResult(rest));
    expect(encoded[0]).toEqual([A, 11, 2, 10, 1, 0, 26, 2, 2]);
    const decoded = decodeResults(JSON.parse(JSON.stringify(encoded)), new Map([[11, 3], [12, 3]]));
    expect(decoded).toEqual(original);
  });
  it('ignoriert kaputte Zeilen und unbekannte Runden', () => {
    const rows = [[1, 99, 2, 10, 1, 0, 0, 0, 0], 'x', [1, 11, 2], [1, 11, 7, 10, 1, 0, 0, 0, 0], [1, 11, 2, 10, 1, 9, 0, 0, 0], [1, 11, 2, 10, 'a', 0, 0, 0, 0]];
    expect(decodeResults(rows, new Map([[11, 1]]))).toEqual([]);
  });
});

describe('compareDrivers', () => {
  const results: H2hResult[] = [
    // Runde 1 (Saison 1): A vorn in Quali und Rennen
    res(A, 1, 'qualifying', 1, { pole: true }),
    res(B, 1, 'qualifying', 3),
    res(A, 1, 'race', 2, { points: 18, grid: 1 }),
    res(B, 1, 'race', 4, { points: 12, grid: 3, fastestLap: true }),
    // Runde 2 (Saison 1): A fällt aus, B gewertet → B vorn
    res(A, 2, 'qualifying', 2),
    res(B, 2, 'qualifying', 1, { pole: true }),
    res(A, 2, 'race', null, { status: 'dnf' }),
    res(B, 2, 'race', 1, { points: 25, grid: 1 }),
    // Runde 3 (Saison 2): beide ausgefallen → kein Duell; Sprint zählt nur für Punkte
    res(A, 3, 'qualifying', 5, { seasonId: 2 }),
    res(B, 3, 'qualifying', 6, { seasonId: 2 }),
    res(A, 3, 'sprint', 1, { seasonId: 2, points: 8 }),
    res(A, 3, 'race', null, { status: 'dnf', seasonId: 2 }),
    res(B, 3, 'race', null, { status: 'dsq', seasonId: 2 }),
    // Runde 4 (Saison 2): nur A am Start
    res(A, 4, 'race', 3, { seasonId: 2, points: 15 }),
    // fremder Fahrer
    res(3, 1, 'race', 1, { points: 25 }),
  ];

  it('zählt gemeinsame Rennen und Quali-Duelle nach der Duell-Regel', () => {
    const cmp = compareDrivers(results, A, B);
    expect(cmp.rounds.map((r) => r.roundId)).toEqual([1, 2, 3]);
    expect(cmp.race).toEqual({ shared: 3, winsA: 1, winsB: 1, none: 1 });
    expect(cmp.quali).toEqual({ shared: 3, winsA: 2, winsB: 1, none: 0 });
    expect(cmp.rounds[1]!.race).toEqual({ a: { position: null, status: 'dnf' }, b: { position: 1, status: 'classified' }, winner: 'b' });
    expect(cmp.rounds[2]!.race.winner).toBe('none');
  });

  it('Kennzahlen wie im Profil (careerStats) plus DotD', () => {
    const cmp = compareDrivers(results, A, B, { dotd: [{ roundId: 2, seasonId: 1, driverId: B }, { roundId: 1, seasonId: 1, driverId: 3 }] });
    expect(cmp.a.stats).toMatchObject({ starts: 4, wins: 0, podiums: 2, poles: 1, points: 41, dnfs: 2, bestFinish: 2, avgFinish: 2.5 });
    expect(cmp.b.stats).toMatchObject({ starts: 3, wins: 1, podiums: 1, poles: 1, fastestLaps: 1, points: 37, dnfs: 0, bestFinish: 1 });
    expect(cmp.a.dotd).toBe(0);
    expect(cmp.b.dotd).toBe(1);
    const metric = (key: string) => cmp.metrics.find((m) => m.key === key)!;
    expect(metric('points').better).toBe('a');
    expect(metric('wins').better).toBe('b');
    expect(metric('poles').better).toBeNull();
    expect(metric('bestFinish').better).toBe('b');
    expect(metric('avgFinish')).toMatchObject({ a: 2.5, b: 2.5, better: null });
    expect(metric('dnfs').better).toBe('b');
    expect(metric('starts').better).toBeNull();
    expect(metric('dotd').better).toBe('b');
    expect(cmp.metrics.map((m) => m.key)).toEqual(H2H_METRICS.map((m) => m.key));
  });

  it('Saisonfilter begrenzt Rennen, Kennzahlen und DotD', () => {
    const cmp = compareDrivers(results, A, B, { seasonId: 2, dotd: [{ roundId: 2, seasonId: 1, driverId: B }] });
    expect(cmp.rounds.map((r) => r.roundId)).toEqual([3]);
    expect(cmp.race).toEqual({ shared: 1, winsA: 0, winsB: 0, none: 1 });
    expect(cmp.a.stats.points).toBe(23);
    expect(cmp.b.stats.starts).toBe(1);
    expect(cmp.b.dotd).toBe(0);
    expect(cmp.a.rounds).toBe(2);
  });

  it('ohne gemeinsame Runden: leere Liste, Kennzahlen trotzdem', () => {
    const cmp = compareDrivers(results, A, 3, { seasonId: 2 });
    expect(cmp.rounds).toEqual([]);
    expect(cmp.b.rounds).toBe(0);
    expect(cmp.metrics.find((m) => m.key === 'avgFinish')!.better).toBeNull();
    expect(cmp.metrics.find((m) => m.key === 'dnfs')!.better).toBeNull();
  });

  it('Teamkollegen und Sortierung nach roundOrder', () => {
    const mates = [res(A, 5, 'race', 1, { teamId: 7 }), res(B, 5, 'race', 2, { teamId: 7 }), res(A, 6, 'race', 2, { teamId: 7 }), res(B, 6, 'race', 1, { teamId: 8 })];
    const cmp = compareDrivers(mates, A, B, { roundOrder: new Map([[6, 0], [5, 1]]) });
    expect(cmp.rounds.map((r) => [r.roundId, r.teammates])).toEqual([
      [6, false],
      [5, true],
    ]);
  });
});

describe('betterSide', () => {
  it('höher bzw. niedriger ist besser, gleich oder ohne Wert = keiner', () => {
    expect(betterSide('points', 10, 5)).toBe('a');
    expect(betterSide('avgFinish', 3.5, 2.1)).toBe('b');
    expect(betterSide('wins', 2, 2)).toBeNull();
    expect(betterSide('bestFinish', null, 3)).toBeNull();
    expect(betterSide('starts', 10, 2)).toBeNull();
  });
  it('DNFs zählen nur, wenn beide gestartet sind', () => {
    expect(betterSide('dnfs', 0, 2, { a: 0, b: 5 })).toBeNull();
    expect(betterSide('dnfs', 1, 2, { a: 4, b: 5 })).toBe('a');
  });
});
