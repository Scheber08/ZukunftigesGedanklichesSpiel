/**
 * Kennzahlen für Fahrer- und Teamprofile (Plan §4.5) sowie das Teamkollegen-Duell.
 */

import type { Id } from '../db/types';
import type { StandingsResult } from './standings';

export interface CareerStats {
  starts: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps: number;
  points: number;
  /** Ø-Platz über alle gewerteten Rennen (null ohne gewertetes Rennen). */
  avgFinish: number | null;
  bestFinish: number | null;
  dnfs: number;
  /** Anteil DNF an Starts (0..1). */
  dnfRate: number | null;
  /** Summe (Startplatz − Zielplatz) über Rennen mit bekanntem Startplatz. */
  positionsGained: number;
  reserveStarts: number;
  sprintWins: number;
}

export function careerStats(results: readonly StandingsResult[]): CareerStats {
  let starts = 0;
  let wins = 0;
  let podiums = 0;
  let poles = 0;
  let fastestLaps = 0;
  let points = 0;
  let dnfs = 0;
  let finishSum = 0;
  let finishCount = 0;
  let bestFinish: number | null = null;
  let positionsGained = 0;
  let reserveStarts = 0;
  let sprintWins = 0;

  for (const r of results) {
    points += r.points;
    if (r.isPole) poles += 1;
    if (r.sessionType === 'sprint' && r.position === 1) sprintWins += 1;
    if (r.sessionType !== 'race') continue;
    if (r.status === 'dns') continue;
    starts += 1;
    if (r.role === 'reserve') reserveStarts += 1;
    if (r.status === 'dnf') dnfs += 1;
    if (r.isFastestLap) fastestLaps += 1;
    if (r.position != null) {
      if (r.position === 1) wins += 1;
      if (r.position <= 3) podiums += 1;
      finishSum += r.position;
      finishCount += 1;
      bestFinish = bestFinish == null ? r.position : Math.min(bestFinish, r.position);
      if (r.gridPosition != null) positionsGained += r.gridPosition - r.position;
    }
  }

  return {
    starts,
    wins,
    podiums,
    poles,
    fastestLaps,
    points,
    avgFinish: finishCount > 0 ? Math.round((finishSum / finishCount) * 10) / 10 : null,
    bestFinish,
    dnfs,
    dnfRate: starts > 0 ? dnfs / starts : null,
    positionsGained,
    reserveStarts,
    sprintWins,
  };
}

export interface DuelRound {
  roundId: Id;
  qualiA: number | null;
  qualiB: number | null;
  raceA: number | null;
  raceB: number | null;
}

export interface Duel {
  driverA: Id;
  driverB: Id;
  teamId: Id;
  qualiWinsA: number;
  qualiWinsB: number;
  raceWinsA: number;
  raceWinsB: number;
  pointsA: number;
  pointsB: number;
  rounds: DuelRound[];
}

/**
 * Kopf-an-Kopf zweier Fahrer eines Teams: nur Runden, in denen beide für dasselbe Team
 * gefahren sind. Gewertete Position schlägt „nicht gewertet“.
 */
export function teammateDuel(
  results: readonly StandingsResult[],
  teamId: Id,
  driverA: Id,
  driverB: Id,
): Duel {
  const byRound = new Map<Id, DuelRound & { inA: boolean; inB: boolean; ptsA: number; ptsB: number }>();
  for (const r of results) {
    if (r.teamId !== teamId || (r.driverId !== driverA && r.driverId !== driverB)) continue;
    let d = byRound.get(r.roundId);
    if (!d) {
      d = { roundId: r.roundId, qualiA: null, qualiB: null, raceA: null, raceB: null, inA: false, inB: false, ptsA: 0, ptsB: 0 };
      byRound.set(r.roundId, d);
    }
    const isA = r.driverId === driverA;
    if (isA) {
      d.inA = true;
      d.ptsA += r.points;
    } else {
      d.inB = true;
      d.ptsB += r.points;
    }
    const pos = r.position ?? Number.POSITIVE_INFINITY;
    if (r.sessionType === 'qualifying') {
      if (isA) d.qualiA = pos;
      else d.qualiB = pos;
    } else if (r.sessionType === 'race') {
      if (isA) d.raceA = pos;
      else d.raceB = pos;
    }
  }

  const duel: Duel = {
    driverA,
    driverB,
    teamId,
    qualiWinsA: 0,
    qualiWinsB: 0,
    raceWinsA: 0,
    raceWinsB: 0,
    pointsA: 0,
    pointsB: 0,
    rounds: [],
  };
  for (const d of byRound.values()) {
    if (!d.inA || !d.inB) continue;
    duel.pointsA += d.ptsA;
    duel.pointsB += d.ptsB;
    if (d.qualiA != null && d.qualiB != null && d.qualiA !== d.qualiB) {
      if (d.qualiA < d.qualiB) duel.qualiWinsA += 1;
      else duel.qualiWinsB += 1;
    }
    if (d.raceA != null && d.raceB != null && d.raceA !== d.raceB) {
      if (d.raceA < d.raceB) duel.raceWinsA += 1;
      else duel.raceWinsB += 1;
    }
    const fin = (n: number | null) => (n == null || !Number.isFinite(n) ? null : n);
    duel.rounds.push({ roundId: d.roundId, qualiA: fin(d.qualiA), qualiB: fin(d.qualiB), raceA: fin(d.raceA), raceB: fin(d.raceB) });
  }
  return duel;
}
