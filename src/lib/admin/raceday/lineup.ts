/**
 * Zustand des Grid-Builders (Plan §5.1): 22 Cockpits aus der Saisonaufstellung,
 * Abmeldungen, Ersatzfahrer aus dem Reservepool. Reine Funktionen, die immer einen
 * neuen Zustand liefern – im Browser (Island) und auf dem Server (Prüfung) nutzbar.
 */
import type { DriverStatus, EntryRole, Id } from '../../db/types';
import type { GridEntry } from '../../domain/grid';

export interface SeatSlot {
  teamId: Id;
  seatNo: 1 | 2;
  /** Stammfahrer laut Saisonaufstellung (null = Cockpit in der Saison nicht besetzt). */
  regularId: Id | null;
  /** Aktuell eingetragener Fahrer (null = Cockpit frei). */
  driverId: Id | null;
}

export interface Absence {
  driverId: Id;
  reportedInTime: boolean;
}

export interface LineupState {
  seats: SeatSlot[];
  absences: Absence[];
}

export interface SeasonSeat {
  team_id: Id;
  seat_no: 1 | 2;
  driver_id: Id;
}

export interface ExistingEntry {
  team_id: Id;
  seat_no: 1 | 2;
  driver_id: Id;
}

/**
 * Startzustand: vorhandene Aufstellung der Runde, sonst die Saisonaufstellung
 * ohne abgemeldete Fahrer. `teamIds` in Anzeige-Reihenfolge (11 Teams → 22 Cockpits).
 */
export function initialLineup(
  teamIds: readonly Id[],
  seasonSeats: readonly SeasonSeat[],
  entries: readonly ExistingEntry[],
  absences: readonly Absence[],
): LineupState {
  const absent = new Set(absences.map((a) => a.driverId));
  const seats: SeatSlot[] = [];
  for (const teamId of teamIds) {
    for (const seatNo of [1, 2] as const) {
      const regularId = seasonSeats.find((s) => s.team_id === teamId && s.seat_no === seatNo)?.driver_id ?? null;
      let driverId: Id | null;
      if (entries.length > 0) {
        driverId = entries.find((e) => e.team_id === teamId && e.seat_no === seatNo)?.driver_id ?? null;
      } else {
        driverId = regularId != null && !absent.has(regularId) ? regularId : null;
      }
      seats.push({ teamId, seatNo, regularId, driverId });
    }
  }
  return { seats, absences: absences.map((a) => ({ ...a })) };
}

const sameSlot = (s: SeatSlot, teamId: Id, seatNo: 1 | 2) => s.teamId === teamId && s.seatNo === seatNo;

/** Fahrer abmelden: Cockpit wird frei. */
export function markAbsent(state: LineupState, driverId: Id, reportedInTime: boolean): LineupState {
  const absences = state.absences.filter((a) => a.driverId !== driverId);
  absences.push({ driverId, reportedInTime });
  return {
    seats: state.seats.map((s) => (s.driverId === driverId ? { ...s, driverId: null } : s)),
    absences,
  };
}

/** Abmeldung zurücknehmen: Der Stammfahrer kehrt in sein Cockpit zurück, wenn es frei ist. */
export function unmarkAbsent(state: LineupState, driverId: Id): LineupState {
  return {
    seats: state.seats.map((s) => (s.regularId === driverId && s.driverId == null ? { ...s, driverId } : s)),
    absences: state.absences.filter((a) => a.driverId !== driverId),
  };
}

export function setReportedInTime(state: LineupState, driverId: Id, reportedInTime: boolean): LineupState {
  return { ...state, absences: state.absences.map((a) => (a.driverId === driverId ? { ...a, reportedInTime } : a)) };
}

/** Fahrer in ein Cockpit setzen; sitzt er schon woanders, wird jenes Cockpit frei. */
export function assignSeat(state: LineupState, teamId: Id, seatNo: 1 | 2, driverId: Id): LineupState {
  return {
    ...state,
    seats: state.seats.map((s) => {
      if (sameSlot(s, teamId, seatNo)) return { ...s, driverId };
      if (s.driverId === driverId) return { ...s, driverId: null };
      return s;
    }),
  };
}

export function clearSeat(state: LineupState, teamId: Id, seatNo: 1 | 2): LineupState {
  return { ...state, seats: state.seats.map((s) => (sameSlot(s, teamId, seatNo) ? { ...s, driverId: null } : s)) };
}

/** Zurück zur Saisonaufstellung (Abmeldungen bleiben bestehen). */
export function resetToSeason(state: LineupState): LineupState {
  const absent = new Set(state.absences.map((a) => a.driverId));
  return {
    ...state,
    seats: state.seats.map((s) => ({ ...s, driverId: s.regularId != null && !absent.has(s.regularId) ? s.regularId : null })),
  };
}

/** Rolle eines Cockpit-Eintrags: Stammfahrer oder Ersatz (mit „ersetzt X“). */
export function slotRole(s: SeatSlot): { role: EntryRole; replacesDriverId: Id | null } {
  if (s.driverId != null && s.driverId === s.regularId) return { role: 'regular', replacesDriverId: null };
  return { role: 'reserve', replacesDriverId: s.regularId };
}

/** Einträge für checkGrid bzw. zum Speichern. */
export function toGridEntries(state: LineupState, numberOf: (driverId: Id) => number | null): GridEntry[] {
  return state.seats
    .filter((s): s is SeatSlot & { driverId: Id } => s.driverId != null)
    .map((s) => ({
      teamId: s.teamId,
      seatNo: s.seatNo,
      driverId: s.driverId,
      ...slotRole(s),
      raceNumber: numberOf(s.driverId),
    }));
}

export interface PoolDriver {
  id: Id;
  gamertag: string;
  status: DriverStatus;
  reserve_order: number | null;
}

/**
 * Reservepool: Reservefahrer (nach Warteliste), danach weitere Fahrer ohne Cockpit
 * (aktiv ohne Platz in dieser Runde, inaktiv). Bereits gesetzte Fahrer fehlen.
 */
export function reservePool<D extends PoolDriver>(
  drivers: readonly D[],
  state: LineupState,
): { reserves: D[]; others: D[] } {
  const seated = new Set(state.seats.map((s) => s.driverId).filter((id): id is Id => id != null));
  const regulars = new Set(state.seats.map((s) => s.regularId).filter((id): id is Id => id != null));
  const free = drivers.filter((d) => !seated.has(d.id));
  const reserves = free
    .filter((d) => d.status === 'reserve')
    .sort((a, b) => (a.reserve_order ?? 999) - (b.reserve_order ?? 999) || a.gamertag.localeCompare(b.gamertag, 'de'));
  const others = free
    .filter((d) => d.status !== 'reserve' && !regulars.has(d.id))
    .sort((a, b) => a.gamertag.localeCompare(b.gamertag, 'de'));
  return { reserves, others };
}
