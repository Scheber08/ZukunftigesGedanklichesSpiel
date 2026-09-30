/**
 * Teamkollegen-Duell Runde für Runde (Plan §4.5): je Runde Quali und Rennen beider Fahrer
 * mit Status statt „–“ bei DNF/DSQ/DNS und dem Sieger nach der gemeinsamen Regel aus
 * src/lib/domain/h2h.ts (gewertet schlägt ausgefallen, beide ausgefallen = kein Duell).
 * Reine Logik, getestet in tests/unit/people-duel.test.ts.
 */

import type { Id } from '../db/types';
import { duelWinner, type DuelCell, type SessionDuel } from '../domain/h2h';
import type { StandingsResult } from '../domain/standings';

export interface DuelDetailRound {
  roundId: Id;
  quali: SessionDuel;
  race: SessionDuel;
}

export interface DuelDetail {
  rounds: DuelDetailRound[];
  qualiWinsA: number;
  qualiWinsB: number;
  raceWinsA: number;
  raceWinsB: number;
  /** Rennen, in denen beide nicht gewertet wurden */
  raceNoDuel: number;
  qualiNoDuel: number;
}

/**
 * Nur Runden, in denen beide für das Team gefahren sind (wie teammateDuel in src/lib/domain/stats.ts).
 * `roundOrder` sortiert die Runden (z. B. Rundennummer), sonst nach ID.
 */
export function duelDetail(
  results: readonly StandingsResult[],
  teamId: Id,
  driverA: Id,
  driverB: Id,
  roundOrder?: (roundId: Id) => number,
): DuelDetail {
  type Slot = { inA: boolean; inB: boolean; qa: DuelCell | null; qb: DuelCell | null; ra: DuelCell | null; rb: DuelCell | null };
  const slots = new Map<Id, Slot>();
  for (const r of results) {
    if (r.teamId !== teamId || (r.driverId !== driverA && r.driverId !== driverB)) continue;
    let s = slots.get(r.roundId);
    if (!s) {
      s = { inA: false, inB: false, qa: null, qb: null, ra: null, rb: null };
      slots.set(r.roundId, s);
    }
    const isA = r.driverId === driverA;
    if (isA) s.inA = true;
    else s.inB = true;
    const cell: DuelCell = { position: r.position, status: r.status };
    if (r.sessionType === 'qualifying') {
      if (isA) s.qa = cell;
      else s.qb = cell;
    } else if (r.sessionType === 'race') {
      if (isA) s.ra = cell;
      else s.rb = cell;
    }
  }

  const detail: DuelDetail = { rounds: [], qualiWinsA: 0, qualiWinsB: 0, raceWinsA: 0, raceWinsB: 0, raceNoDuel: 0, qualiNoDuel: 0 };
  for (const [roundId, s] of slots) {
    if (!s.inA || !s.inB) continue;
    const quali: SessionDuel = { a: s.qa, b: s.qb, winner: duelWinner(s.qa, s.qb) };
    const race: SessionDuel = { a: s.ra, b: s.rb, winner: duelWinner(s.ra, s.rb) };
    if (quali.winner === 'a') detail.qualiWinsA += 1;
    if (quali.winner === 'b') detail.qualiWinsB += 1;
    if (quali.winner === 'none' && s.qa && s.qb) detail.qualiNoDuel += 1;
    if (race.winner === 'a') detail.raceWinsA += 1;
    if (race.winner === 'b') detail.raceWinsB += 1;
    if (race.winner === 'none' && s.ra && s.rb) detail.raceNoDuel += 1;
    detail.rounds.push({ roundId, quali, race });
  }
  const key = roundOrder ?? ((id: Id) => id);
  detail.rounds.sort((x, y) => key(x.roundId) - key(y.roundId));
  return detail;
}

/** Beide in der Session am Start, aber keiner gewertet → „kein Duell“ als Text. */
export function isNoDuel(d: SessionDuel): boolean {
  return d.a != null && d.b != null && d.winner === 'none';
}
