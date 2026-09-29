/**
 * Prüfungen für den Grid-Builder (Plan §5.1):
 * Fahrer doppelt? Nummernkonflikt? Gesperrter Fahrer? Mehr als 22 Fahrer?
 */

import type { DriverStatus, EntryRole, Id } from '../db/types';

export const GRID_SIZE = 22;
export const TEAMS_PER_GRID = 11;

export interface GridEntry {
  teamId: Id;
  seatNo: 1 | 2;
  driverId: Id;
  role: EntryRole;
  replacesDriverId: Id | null;
  raceNumber: number | null;
}

export type GridIssueCode =
  | 'duplicate_driver'
  | 'duplicate_seat'
  | 'number_conflict'
  | 'missing_number'
  | 'banned_driver'
  | 'race_ban'
  | 'inactive_driver'
  | 'absent_driver_entered'
  | 'too_many_drivers'
  | 'empty_seat'
  | 'reserve_without_replacement';

export interface GridIssue {
  code: GridIssueCode;
  severity: 'error' | 'warning';
  driverId?: Id;
  teamId?: Id;
  seatNo?: 1 | 2;
  number?: number;
}

export interface GridCheckContext {
  driverStatus: (driverId: Id) => DriverStatus | undefined;
  /** Fahrer, die für diese Runde abgemeldet sind. */
  absentDriverIds: ReadonlySet<Id>;
  /** Fahrer mit Rennsperre für diese Runde. */
  bannedForRound: ReadonlySet<Id>;
  /** Teams der Saison – für die Prüfung auf leere Cockpits. */
  teamIds: readonly Id[];
}

export function checkGrid(entries: readonly GridEntry[], ctx: GridCheckContext): GridIssue[] {
  const issues: GridIssue[] = [];

  const byDriver = new Map<Id, number>();
  const bySeat = new Map<string, number>();
  const byNumber = new Map<number, Id[]>();
  for (const e of entries) {
    byDriver.set(e.driverId, (byDriver.get(e.driverId) ?? 0) + 1);
    const seatKey = `${e.teamId}:${e.seatNo}`;
    bySeat.set(seatKey, (bySeat.get(seatKey) ?? 0) + 1);
    if (e.raceNumber != null) byNumber.set(e.raceNumber, [...(byNumber.get(e.raceNumber) ?? []), e.driverId]);
  }

  for (const [driverId, count] of byDriver) {
    if (count > 1) issues.push({ code: 'duplicate_driver', severity: 'error', driverId });
  }
  for (const [key, count] of bySeat) {
    if (count > 1) {
      const [teamId, seatNo] = key.split(':').map(Number);
      issues.push({ code: 'duplicate_seat', severity: 'error', teamId: teamId!, seatNo: seatNo as 1 | 2 });
    }
  }
  for (const [number, drivers] of byNumber) {
    if (new Set(drivers).size > 1) {
      for (const driverId of new Set(drivers)) issues.push({ code: 'number_conflict', severity: 'error', driverId, number });
    }
  }

  for (const e of entries) {
    const status = ctx.driverStatus(e.driverId);
    if (status === 'banned') issues.push({ code: 'banned_driver', severity: 'error', driverId: e.driverId });
    else if (status === 'inactive') issues.push({ code: 'inactive_driver', severity: 'warning', driverId: e.driverId });
    if (ctx.bannedForRound.has(e.driverId)) issues.push({ code: 'race_ban', severity: 'error', driverId: e.driverId });
    if (ctx.absentDriverIds.has(e.driverId)) {
      issues.push({ code: 'absent_driver_entered', severity: 'error', driverId: e.driverId });
    }
    if (e.raceNumber == null) issues.push({ code: 'missing_number', severity: 'warning', driverId: e.driverId });
    if (e.role === 'reserve' && e.replacesDriverId == null) {
      issues.push({ code: 'reserve_without_replacement', severity: 'warning', driverId: e.driverId });
    }
  }

  if (entries.length > GRID_SIZE) issues.push({ code: 'too_many_drivers', severity: 'error' });

  for (const teamId of ctx.teamIds) {
    for (const seatNo of [1, 2] as const) {
      if (!bySeat.has(`${teamId}:${seatNo}`)) issues.push({ code: 'empty_seat', severity: 'warning', teamId, seatNo });
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: readonly GridIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/**
 * Vorbelegung aus der Saisonaufstellung: je Team zwei Cockpits,
 * gültig für die Runde (from_round ≤ Runde ≤ to_round).
 */
export function seatsForRound<T extends { team_id: Id; seat_no: 1 | 2; driver_id: Id; from_round: number; to_round: number | null }>(
  seats: readonly T[],
  roundNumber: number,
): T[] {
  return seats.filter((s) => s.from_round <= roundNumber && (s.to_round == null || s.to_round >= roundNumber));
}
