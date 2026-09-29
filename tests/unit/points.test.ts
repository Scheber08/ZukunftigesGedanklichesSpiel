import { describe, expect, it } from 'vitest';
import { computeGrid, computeSession, POINTS_TEMPLATES, type EnteredResult, type PointsScheme } from '~/lib/domain/points';

const F1: PointsScheme = POINTS_TEMPLATES.f1_current;
const F1_FL: PointsScheme = POINTS_TEMPLATES.f1_fastest_lap;

/** Erzeugt n gewertete Fahrer (IDs 1..n) mit Zeiten im Abstand von 1 s. */
function field(n: number, overrides: Partial<Record<number, Partial<EnteredResult>>> = {}): EnteredResult[] {
  return Array.from({ length: n }, (_, i) => {
    const id = i + 1;
    return {
      driverId: id,
      teamId: Math.ceil(id / 2),
      role: 'regular' as const,
      enteredPosition: id,
      status: 'classified' as const,
      laps: 20,
      totalTimeMs: 1_800_000 + i * 1000,
      gapMs: i * 1000,
      gapLaps: 0,
      bestLapMs: 90_000 + id,
      ...overrides[id],
    };
  });
}

const race = { type: 'race' as const, scheme: F1, reservePointsForConstructors: true };

describe('computeSession – Grundlagen', () => {
  it('vergibt Punkte nach dem Schema in Eingabe-Reihenfolge', () => {
    const { results, warnings } = computeSession(field(12), [], race);
    expect(warnings).toEqual([]);
    expect(results.map((r) => r.points)).toEqual([25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0]);
    expect(results.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('markiert die schnellste Runde, ohne Bonus bei Schema ohne Bonus', () => {
    const rows = field(5, { 4: { bestLapMs: 80_000 } });
    const { results } = computeSession(rows, [], race);
    const fl = results.find((r) => r.isFastestLap)!;
    expect(fl.driverId).toBe(4);
    expect(fl.points).toBe(12);
  });

  it('gibt den Bonus für die schnellste Runde nur innerhalb der Top N', () => {
    const inTop = computeSession(field(12, { 3: { bestLapMs: 80_000 } }), [], { ...race, scheme: F1_FL });
    expect(inTop.results.find((r) => r.driverId === 3)!.points).toBe(16);

    const outside = computeSession(field(12, { 11: { bestLapMs: 80_000 } }), [], { ...race, scheme: F1_FL });
    const p11 = outside.results.find((r) => r.driverId === 11)!;
    expect(p11.isFastestLap).toBe(true);
    expect(p11.points).toBe(0);
    // niemand sonst bekommt den Bonus
    expect(outside.results.reduce((s, r) => s + r.points, 0)).toBe(101);
  });

  it('gibt einem ausgefallenen Fahrer mit schnellster Runde keinen Bonus', () => {
    const rows = field(5, { 5: { status: 'dnf', bestLapMs: 80_000, laps: 12 } });
    const { results } = computeSession(rows, [], { ...race, scheme: F1_FL });
    const dnf = results.find((r) => r.driverId === 5)!;
    expect(dnf.isFastestLap).toBe(true);
    expect(dnf.position).toBeNull();
    expect(dnf.points).toBe(0);
  });

  it('wertet Sprint und Pole-Bonus', () => {
    const sprint = computeSession(field(9), [], { ...race, type: 'sprint' });
    expect(sprint.results.map((r) => r.points)).toEqual([8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(sprint.results.some((r) => r.isPole)).toBe(false);

    const quali = computeSession(field(3), [], {
      type: 'qualifying',
      scheme: { ...F1, pole_bonus: 1 },
      reservePointsForConstructors: true,
    });
    expect(quali.results[0]!.isPole).toBe(true);
    expect(quali.results.map((r) => r.points)).toEqual([1, 0, 0]);
    expect(quali.results.some((r) => r.isFastestLap)).toBe(false);
  });

  it('sortiert nicht gewertete Fahrer hinter die gewerteten: DNF, DNS, DSQ', () => {
    const rows = field(6, {
      1: { status: 'dsq' },
      2: { status: 'dns', laps: 0 },
      3: { status: 'dnf', laps: 5 },
    });
    const { results } = computeSession(rows, [], race);
    expect(results.map((r) => r.driverId)).toEqual([4, 5, 6, 3, 2, 1]);
    expect(results.map((r) => r.position)).toEqual([1, 2, 3, null, null, null]);
    expect(results.map((r) => r.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('verwirft doppelte Fahrer mit Warnung', () => {
    const rows = [...field(3), { ...field(3)[0]!, enteredPosition: 4 }];
    const { results, warnings } = computeSession(rows, [], race);
    expect(results).toHaveLength(3);
    expect(warnings).toEqual([{ code: 'duplicate_driver', driverId: 1 }]);
  });

  it('zählt Reservefahrer-Punkte für Konstrukteure je nach Saison-Einstellung', () => {
    const rows = field(3, { 2: { role: 'reserve' } });
    const counts = computeSession(rows, [], { ...race, reservePointsForConstructors: true });
    expect(counts.results.find((r) => r.driverId === 2)!.countsForConstructors).toBe(true);
    const notCounting = computeSession(rows, [], { ...race, reservePointsForConstructors: false });
    expect(notCounting.results.find((r) => r.driverId === 2)!.countsForConstructors).toBe(false);
    expect(notCounting.results.find((r) => r.driverId === 1)!.countsForConstructors).toBe(true);
  });
});

describe('computeSession – Steward-Strafen', () => {
  it('DSQ nach Veröffentlichung: Fahrer fällt raus, alle rücken auf', () => {
    const { results } = computeSession(field(4), [{ driverId: 1, kind: 'dsq' }], race);
    expect(results.map((r) => [r.driverId, r.position, r.points])).toEqual([
      [2, 1, 25],
      [3, 2, 18],
      [4, 3, 15],
      [1, null, 0],
    ]);
    expect(results.at(-1)!.status).toBe('dsq');
  });

  it('Zeitstrafe mit Gesamtzeiten sortiert neu', () => {
    // P1 bekommt 2,5 s → landet hinter P3 (Abstand 2 s), vor P4 (3 s)
    const { results } = computeSession(field(5), [{ driverId: 1, kind: 'time', seconds: 2.5 }], race);
    expect(results.map((r) => r.driverId)).toEqual([2, 3, 1, 4, 5]);
    expect(results.find((r) => r.driverId === 1)!.stewardPenaltyS).toBe(2.5);
  });

  it('Zeitstrafe funktioniert auch nur mit Abständen', () => {
    const rows = field(4).map((r) => ({ ...r, totalTimeMs: null }));
    const { results, warnings } = computeSession(rows, [{ driverId: 2, kind: 'time', seconds: 5 }], race);
    expect(warnings).toEqual([]);
    expect(results.map((r) => r.driverId)).toEqual([1, 3, 4, 2]);
  });

  it('Zeitstrafen addieren sich', () => {
    const { results } = computeSession(
      field(4),
      [
        { driverId: 1, kind: 'time', seconds: 1.5 },
        { driverId: 1, kind: 'time', seconds: 1 },
      ],
      race,
    );
    expect(results.map((r) => r.driverId)).toEqual([2, 3, 1, 4]);
  });

  it('Zeitstrafe schiebt nie hinter überrundete Fahrer', () => {
    const rows = field(4, {
      3: { laps: 19, gapLaps: 1, totalTimeMs: 1_790_000 },
      4: { laps: 19, gapLaps: 1, totalTimeMs: 1_795_000 },
    });
    const { results } = computeSession(rows, [{ driverId: 1, kind: 'time', seconds: 60 }], race);
    expect(results.map((r) => r.driverId)).toEqual([2, 1, 3, 4]);
  });

  it('ohne Zeiten bleibt die Reihenfolge und es gibt eine Warnung', () => {
    const rows = field(3).map((r) => ({ ...r, totalTimeMs: null, gapMs: null }));
    const { results, warnings } = computeSession(rows, [{ driverId: 1, kind: 'time', seconds: 5 }], race);
    expect(results.map((r) => r.driverId)).toEqual([1, 2, 3]);
    expect(warnings).toEqual([{ code: 'time_penalty_unresolved', driverId: 1 }]);
    expect(results[0]!.stewardPenaltyS).toBe(5);
  });

  it('Zeitstrafe im Qualifying wird nicht verrechnet', () => {
    const { results, warnings } = computeSession(field(3), [{ driverId: 1, kind: 'time', seconds: 5 }], {
      ...race,
      type: 'qualifying',
    });
    expect(results[0]!.driverId).toBe(1);
    expect(warnings[0]!.code).toBe('time_penalty_in_qualifying');
  });

  it('Positionsstrafe: N Plätze zurück, am Ende begrenzt', () => {
    const one = computeSession(field(5), [{ driverId: 1, kind: 'position', positions: 2 }], race);
    expect(one.results.map((r) => r.driverId)).toEqual([2, 3, 1, 4, 5]);

    const clamp = computeSession(field(3), [{ driverId: 2, kind: 'position', positions: 10 }], race);
    expect(clamp.results.map((r) => r.driverId)).toEqual([1, 3, 2]);
  });

  it('Strafe für unbekannten Fahrer erzeugt eine Warnung', () => {
    const { warnings } = computeSession(field(2), [{ driverId: 99, kind: 'dsq' }], race);
    expect(warnings).toEqual([{ code: 'penalty_unknown_driver', driverId: 99 }]);
  });

  it('DSQ des Fahrers mit schnellster Runde: nächstschnellster bekommt sie', () => {
    const rows = field(4, { 2: { bestLapMs: 80_000 }, 3: { bestLapMs: 81_000 } });
    const { results } = computeSession(rows, [{ driverId: 2, kind: 'dsq' }], { ...race, scheme: F1_FL });
    expect(results.find((r) => r.isFastestLap)!.driverId).toBe(3);
    expect(results.find((r) => r.driverId === 3)!.points).toBe(18 + 1);
  });
});

describe('computeGrid', () => {
  it('übernimmt die Quali-Reihenfolge', () => {
    expect([...computeGrid([5, 3, 1], []).entries()]).toEqual([
      [5, 1],
      [3, 2],
      [1, 3],
    ]);
  });

  it('wendet Grid-Strafen an', () => {
    const grid = computeGrid([1, 2, 3, 4, 5], [{ driverId: 1, positions: 3 }]);
    expect(grid.get(1)).toBe(4);
    expect(grid.get(2)).toBe(1);
    expect(grid.get(5)).toBe(5);
  });
});
