/**
 * Fahrer- und Konstrukteurswertung, Matrix und Punkteverlauf (Plan §4.4, §6.3).
 *
 * Gleichstand wird per Countback aufgelöst: mehr Siege, dann mehr 2. Plätze usw.
 * (nur Hauptrennen), danach die Sprint-Platzierungen. Ist dann immer noch alles gleich,
 * teilen sich die Fahrer die Position (Anzeige „=3“).
 */

import type { EntryRole, Id, ResultStatus, RoundFormat, RoundStatus, SessionType } from '../db/types';
import { RESULT_VISIBLE_STATUSES } from '../db/types';

export interface StandingsRound {
  id: Id;
  number: number;
  status: RoundStatus;
  format: RoundFormat;
}

export interface StandingsResult {
  roundId: Id;
  sessionType: SessionType;
  driverId: Id;
  teamId: Id;
  role: EntryRole;
  position: number | null;
  status: ResultStatus;
  points: number;
  isPole: boolean;
  isFastestLap: boolean;
  countsForConstructors: boolean;
  gridPosition: number | null;
}

export interface StandingsInput {
  rounds: readonly StandingsRound[];
  results: readonly StandingsResult[];
  /** Für die letzte Sortierstufe bei komplettem Gleichstand. */
  driverName: (driverId: Id) => string;
  teamName: (teamId: Id) => string;
  /** Teams der Saison (auch ohne Punkte in der Wertung). */
  teamIds?: readonly Id[];
}

export interface Tally {
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps: number;
  starts: number;
  dnfs: number;
  bestFinish: number | null;
  /** Anzahl Rennplatzierungen je Position (Index 0 = P1). */
  raceFinishes: number[];
  sprintFinishes: number[];
}

export interface DriverStanding extends Tally {
  driverId: Id;
  /** Team der letzten gewerteten Runde. */
  teamId: Id | null;
  position: number;
  /** true, wenn sich der Fahrer die Position mit einem anderen teilt. */
  tied: boolean;
  gapToLeader: number;
  reserveStarts: number;
}

export interface TeamStanding extends Tally {
  teamId: Id;
  position: number;
  tied: boolean;
  gapToLeader: number;
}

const emptyTally = (): Tally => ({
  points: 0,
  wins: 0,
  podiums: 0,
  poles: 0,
  fastestLaps: 0,
  starts: 0,
  dnfs: 0,
  bestFinish: null,
  raceFinishes: [],
  sprintFinishes: [],
});

function addToTally(t: Tally, r: StandingsResult): void {
  t.points += r.points;
  if (r.isPole) t.poles += 1;
  if (r.sessionType === 'race') {
    if (r.status !== 'dns') t.starts += 1;
    if (r.status === 'dnf') t.dnfs += 1;
    if (r.isFastestLap) t.fastestLaps += 1;
    if (r.position != null) {
      if (r.position === 1) t.wins += 1;
      if (r.position <= 3) t.podiums += 1;
      t.bestFinish = t.bestFinish == null ? r.position : Math.min(t.bestFinish, r.position);
      t.raceFinishes[r.position - 1] = (t.raceFinishes[r.position - 1] ?? 0) + 1;
    }
  } else if (r.sessionType === 'sprint' && r.position != null) {
    t.sprintFinishes[r.position - 1] = (t.sprintFinishes[r.position - 1] ?? 0) + 1;
  }
}

/** Countback-Vergleich: negativ, wenn a vor b liegt; 0 bei echtem Gleichstand. */
export function compareTallies(a: Tally, b: Tally): number {
  if (a.points !== b.points) return b.points - a.points;
  const raceLen = Math.max(a.raceFinishes.length, b.raceFinishes.length);
  for (let i = 0; i < raceLen; i++) {
    const diff = (b.raceFinishes[i] ?? 0) - (a.raceFinishes[i] ?? 0);
    if (diff !== 0) return diff;
  }
  const sprintLen = Math.max(a.sprintFinishes.length, b.sprintFinishes.length);
  for (let i = 0; i < sprintLen; i++) {
    const diff = (b.sprintFinishes[i] ?? 0) - (a.sprintFinishes[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Runden, die in die Wertung zählen (Ergebnis veröffentlicht), optional bis Runde X. */
export function countedRounds(rounds: readonly StandingsRound[], upToRound?: number): StandingsRound[] {
  return rounds
    .filter((r) => RESULT_VISIBLE_STATUSES.includes(r.status))
    .filter((r) => upToRound == null || r.number <= upToRound)
    .sort((a, b) => a.number - b.number);
}

function rankWithTies<T extends Tally>(
  items: T[],
  name: (item: T) => string,
): Array<T & { position: number; tied: boolean; gapToLeader: number }> {
  const sorted = [...items].sort((a, b) => compareTallies(a, b) || name(a).localeCompare(name(b), 'de'));
  const leaderPoints = sorted[0]?.points ?? 0;
  const ranked = sorted.map((item) => ({ ...item, position: 0, tied: false, gapToLeader: leaderPoints - item.points }));
  ranked.forEach((item, i) => {
    const prev = ranked[i - 1];
    if (prev && compareTallies(prev, item) === 0) {
      item.position = prev.position;
      item.tied = true;
      prev.tied = true;
    } else {
      item.position = i + 1;
    }
  });
  return ranked;
}

export function driverStandings(input: StandingsInput, upToRound?: number): DriverStanding[] {
  const rounds = countedRounds(input.rounds, upToRound);
  const roundNumber = new Map(rounds.map((r) => [r.id, r.number]));
  const byDriver = new Map<Id, Tally & { driverId: Id; teamId: Id | null; lastRound: number; reserveStarts: number }>();

  for (const r of input.results) {
    const rn = roundNumber.get(r.roundId);
    if (rn == null) continue;
    let t = byDriver.get(r.driverId);
    if (!t) {
      t = { ...emptyTally(), driverId: r.driverId, teamId: null, lastRound: 0, reserveStarts: 0 };
      byDriver.set(r.driverId, t);
    }
    addToTally(t, r);
    if (r.sessionType === 'race' && r.role === 'reserve' && r.status !== 'dns') t.reserveStarts += 1;
    // Team der letzten Runde – Stammcockpit hat Vorrang vor einem Reserve-Einsatz
    if (rn > t.lastRound || (rn === t.lastRound && r.role === 'regular')) {
      t.lastRound = rn;
      t.teamId = r.teamId;
    }
  }

  return rankWithTies([...byDriver.values()], (t) => input.driverName(t.driverId)).map(
    ({ lastRound: _lastRound, ...rest }) => rest,
  );
}

export function teamStandings(input: StandingsInput, upToRound?: number): TeamStanding[] {
  const rounds = countedRounds(input.rounds, upToRound);
  const counted = new Set(rounds.map((r) => r.id));
  const byTeam = new Map<Id, Tally & { teamId: Id }>();
  for (const id of input.teamIds ?? []) byTeam.set(id, { ...emptyTally(), teamId: id });

  for (const r of input.results) {
    if (!counted.has(r.roundId) || !r.countsForConstructors) continue;
    let t = byTeam.get(r.teamId);
    if (!t) {
      t = { ...emptyTally(), teamId: r.teamId };
      byTeam.set(r.teamId, t);
    }
    addToTally(t, r);
  }

  return rankWithTies([...byTeam.values()], (t) => input.teamName(t.teamId));
}

// ---------------------------------------------------------------------------
// Matrix (Position je Rennen)
// ---------------------------------------------------------------------------

export interface MatrixCell {
  roundId: Id;
  racePosition: number | null;
  raceStatus: ResultStatus | null;
  sprintPosition: number | null;
  sprintStatus: ResultStatus | null;
  qualiPosition: number | null;
  isPole: boolean;
  isFastestLap: boolean;
  isReserve: boolean;
  /** Punkte der ganzen Runde (Quali-Bonus + Sprint + Rennen). */
  points: number;
  teamId: Id | null;
}

export interface MatrixRow {
  driverId: Id;
  cells: Map<Id, MatrixCell>;
}

export function standingsMatrix(input: StandingsInput, upToRound?: number): MatrixRow[] {
  const rounds = countedRounds(input.rounds, upToRound);
  const counted = new Set(rounds.map((r) => r.id));
  const rows = new Map<Id, MatrixRow>();

  for (const r of input.results) {
    if (!counted.has(r.roundId)) continue;
    let row = rows.get(r.driverId);
    if (!row) {
      row = { driverId: r.driverId, cells: new Map() };
      rows.set(r.driverId, row);
    }
    let cell = row.cells.get(r.roundId);
    if (!cell) {
      cell = {
        roundId: r.roundId,
        racePosition: null,
        raceStatus: null,
        sprintPosition: null,
        sprintStatus: null,
        qualiPosition: null,
        isPole: false,
        isFastestLap: false,
        isReserve: false,
        points: 0,
        teamId: null,
      };
      row.cells.set(r.roundId, cell);
    }
    cell.points += r.points;
    if (r.isPole) cell.isPole = true;
    if (r.role === 'reserve') cell.isReserve = true;
    if (r.sessionType === 'race') {
      cell.racePosition = r.position;
      cell.raceStatus = r.status;
      cell.isFastestLap = r.isFastestLap;
      cell.teamId = r.teamId;
    } else if (r.sessionType === 'sprint') {
      cell.sprintPosition = r.position;
      cell.sprintStatus = r.status;
      cell.teamId ??= r.teamId;
    } else {
      cell.qualiPosition = r.position;
      cell.teamId ??= r.teamId;
    }
  }

  const order = driverStandings(input, upToRound).map((s) => s.driverId);
  return order.map((id) => rows.get(id)).filter((r): r is MatrixRow => r != null);
}

// ---------------------------------------------------------------------------
// Punkteverlauf
// ---------------------------------------------------------------------------

export interface ProgressionPoint {
  roundId: Id;
  roundNumber: number;
  points: number;
  position: number;
}

export interface ProgressionSeries {
  id: Id;
  points: ProgressionPoint[];
}

/** Kumulierte Punkte und Position nach jeder gewerteten Runde. */
export function driverProgression(input: StandingsInput): ProgressionSeries[] {
  return progression(input, (upTo) =>
    driverStandings(input, upTo).map((s) => ({ id: s.driverId, points: s.points, position: s.position })),
  );
}

export function teamProgression(input: StandingsInput): ProgressionSeries[] {
  return progression(input, (upTo) =>
    teamStandings(input, upTo).map((s) => ({ id: s.teamId, points: s.points, position: s.position })),
  );
}

function progression(
  input: StandingsInput,
  standingsAfter: (upTo: number) => Array<{ id: Id; points: number; position: number }>,
): ProgressionSeries[] {
  const rounds = countedRounds(input.rounds);
  const series = new Map<Id, ProgressionPoint[]>();
  for (const round of rounds) {
    for (const s of standingsAfter(round.number)) {
      const list = series.get(s.id) ?? [];
      list.push({ roundId: round.id, roundNumber: round.number, points: s.points, position: s.position });
      series.set(s.id, list);
    }
  }
  return [...series.entries()].map(([id, points]) => ({ id, points }));
}
