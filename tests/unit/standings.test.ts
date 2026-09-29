import { describe, expect, it } from 'vitest';
import {
  compareTallies,
  driverProgression,
  driverStandings,
  standingsMatrix,
  teamStandings,
  type StandingsInput,
  type StandingsResult,
  type StandingsRound,
} from '~/lib/domain/standings';

const names: Record<number, string> = { 1: 'Alpha', 2: 'Bravo', 3: 'Charlie', 4: 'Delta' };

function res(roundId: number, driverId: number, position: number | null, points: number, extra: Partial<StandingsResult> = {}): StandingsResult {
  return {
    roundId,
    sessionType: 'race',
    driverId,
    teamId: driverId <= 2 ? 10 : 20,
    role: 'regular',
    position,
    status: position == null ? 'dnf' : 'classified',
    points,
    isPole: false,
    isFastestLap: false,
    countsForConstructors: true,
    gridPosition: null,
    ...extra,
  };
}

function input(rounds: StandingsRound[], results: StandingsResult[]): StandingsInput {
  return {
    rounds,
    results,
    driverName: (id) => names[id] ?? String(id),
    teamName: (id) => `Team ${id}`,
    teamIds: [10, 20, 30],
  };
}

const R = (id: number, number: number, status: StandingsRound['status'] = 'final'): StandingsRound => ({
  id,
  number,
  status,
  format: 'standard',
});

describe('driverStandings', () => {
  it('summiert Punkte und zählt Siege, Podien, Poles, schnellste Runden', () => {
    const data = input(
      [R(1, 1), R(2, 2)],
      [
        res(1, 1, 1, 25, { isFastestLap: true }),
        res(1, 2, 2, 18),
        res(1, 1, 1, 0, { sessionType: 'qualifying', isPole: true }),
        res(2, 2, 1, 25),
        res(2, 1, 3, 15),
      ],
    );
    const [first, second] = driverStandings(data);
    expect(first).toMatchObject({ driverId: 2, points: 43, wins: 1, podiums: 2, poles: 0, position: 1, gapToLeader: 0 });
    expect(second).toMatchObject({ driverId: 1, points: 40, wins: 1, podiums: 2, poles: 1, fastestLaps: 1, position: 2, gapToLeader: 3 });
  });

  it('löst Gleichstand per Countback auf (mehr Siege gewinnt)', () => {
    const data = input(
      [R(1, 1), R(2, 2)],
      [res(1, 1, 1, 25), res(1, 2, 2, 18), res(2, 2, 2, 25), res(2, 1, 4, 18)],
    );
    // beide 43 Punkte – Fahrer 1 hat einen Sieg
    const s = driverStandings(data);
    expect(s.map((x) => [x.driverId, x.points, x.position])).toEqual([
      [1, 43, 1],
      [2, 43, 2],
    ]);
    expect(s[0]!.tied).toBe(false);
  });

  it('Countback über 2. Plätze, dann Sprint', () => {
    const a = { points: 30, raceFinishes: [0, 1, 1], sprintFinishes: [] } as never;
    const b = { points: 30, raceFinishes: [0, 1, 0, 1], sprintFinishes: [] } as never;
    expect(compareTallies(a, b)).toBeLessThan(0);
    const c = { points: 30, raceFinishes: [0, 1], sprintFinishes: [1] } as never;
    const d = { points: 30, raceFinishes: [0, 1], sprintFinishes: [0, 1] } as never;
    expect(compareTallies(c, d)).toBeLessThan(0);
  });

  it('bei komplettem Gleichstand teilen sich die Fahrer die Position', () => {
    const data = input([R(1, 1)], [res(1, 3, 1, 10), res(1, 1, 2, 10), res(1, 2, 3, 10)]);
    // Konstruiert: gleiche Punkte, unterschiedliche Platzierungen → kein Gleichstand
    expect(driverStandings(data).map((x) => x.position)).toEqual([1, 2, 3]);

    const tie = input([R(1, 1), R(2, 2)], [res(1, 1, 1, 25), res(1, 2, 2, 18), res(2, 2, 1, 25), res(2, 1, 2, 18)]);
    const s = driverStandings(tie);
    expect(s.map((x) => [x.driverId, x.position, x.tied])).toEqual([
      [1, 1, true],
      [2, 1, true],
    ]);
  });

  it('zählt nur veröffentlichte Runden, nicht geplante oder abgesagte', () => {
    const data = input(
      [R(1, 1, 'provisional'), R(2, 2, 'scheduled'), R(3, 3, 'cancelled'), R(4, 4, 'corrected')],
      [res(1, 1, 1, 25), res(2, 1, 1, 25), res(3, 1, 1, 25), res(4, 1, 1, 25)],
    );
    expect(driverStandings(data)[0]!.points).toBe(50);
  });

  it('„Stand nach Runde X“', () => {
    const data = input([R(1, 1), R(2, 2)], [res(1, 1, 1, 25), res(2, 2, 1, 25), res(2, 1, 2, 18)]);
    expect(driverStandings(data, 1).map((x) => x.driverId)).toEqual([1]);
    expect(driverStandings(data, 2)[0]!.points).toBe(43);
  });

  it('Abstand zum Führenden und Reservestarts', () => {
    const data = input([R(1, 1)], [res(1, 1, 1, 25), res(1, 2, 2, 18, { role: 'reserve' })]);
    const s = driverStandings(data);
    expect(s[1]!.gapToLeader).toBe(7);
    expect(s[1]!.reserveStarts).toBe(1);
  });
});

describe('teamStandings', () => {
  it('zählt nur Ergebnisse, die für Konstrukteure zählen, und listet Teams ohne Punkte', () => {
    const data = input(
      [R(1, 1)],
      [res(1, 1, 1, 25), res(1, 3, 2, 18), res(1, 2, 3, 15, { role: 'reserve', countsForConstructors: false })],
    );
    const s = teamStandings(data);
    expect(s.map((t) => [t.teamId, t.points])).toEqual([
      [10, 25],
      [20, 18],
      [30, 0],
    ]);
  });
});

describe('Matrix und Verlauf', () => {
  it('Matrix: Position je Runde inkl. Pole/FL/Reserve und Rundenpunkten', () => {
    const data = input(
      [R(1, 1)],
      [
        res(1, 1, 1, 25, { isFastestLap: true }),
        res(1, 1, 1, 1, { sessionType: 'qualifying', isPole: true }),
        res(1, 2, null, 0, { role: 'reserve' }),
      ],
    );
    const [row1, row2] = standingsMatrix(data);
    const cell = row1!.cells.get(1)!;
    expect(cell).toMatchObject({ racePosition: 1, qualiPosition: 1, isPole: true, isFastestLap: true, points: 26 });
    expect(row2!.cells.get(1)).toMatchObject({ raceStatus: 'dnf', isReserve: true });
  });

  it('Verlauf: kumulierte Punkte je Runde', () => {
    const data = input([R(1, 1), R(2, 2)], [res(1, 1, 1, 25), res(1, 2, 2, 18), res(2, 2, 1, 25), res(2, 1, 2, 18)]);
    const series = driverProgression(data);
    const d1 = series.find((s) => s.id === 1)!;
    expect(d1.points.map((p) => p.points)).toEqual([25, 43]);
    expect(d1.points.map((p) => p.position)).toEqual([1, 1]);
  });
});
