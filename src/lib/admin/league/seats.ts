/**
 * Saisonaufstellung (Plan §5 „Teams und Cockpits“, §6.2 `seats`): zwei Cockpits pro Team,
 * Transfers während der Saison „gültig ab Runde X“. Ein Fahrer darf nie in zwei
 * Cockpits gleichzeitig sitzen. Reine Planungsfunktionen.
 */
import type { Id, SeatRow } from '~/lib/db/types';

type Seat = Pick<SeatRow, 'id' | 'season_id' | 'team_id' | 'seat_no' | 'driver_id' | 'from_round' | 'to_round'>;

export interface SeatChangeInput {
  season_id: Id;
  team_id: Id;
  seat_no: 1 | 2;
  /** null = Cockpit ab Runde X leer */
  driver_id: Id | null;
  from_round: number;
  /** Bisheriges Cockpit des Fahrers ab Runde X automatisch freigeben */
  releaseOtherSeat: boolean;
}

export interface SeatPlan {
  deletes: Id[];
  updates: Array<{ id: Id; to_round: number }>;
  insert: Omit<SeatRow, 'id' | 'created_at' | 'updated_at'> | null;
  error: string | null;
  /** Hinweise (z. B. freigegebenes zweites Cockpit) */
  notes: string[];
}

const end = (s: Pick<Seat, 'to_round'>) => s.to_round ?? Number.POSITIVE_INFINITY;

/** Überschneiden sich die Rundenbereiche [from, to]? */
export function rangesOverlap(a: Pick<Seat, 'from_round' | 'to_round'>, b: Pick<Seat, 'from_round' | 'to_round'>): boolean {
  return a.from_round <= end(b) && b.from_round <= end(a);
}

/** Cockpit ab Runde X „abschneiden“: vorher endend kürzen, komplett danach liegend löschen. */
function cutFrom(seat: Seat, fromRound: number, plan: SeatPlan): void {
  if (end(seat) < fromRound) return;
  if (seat.from_round >= fromRound) plan.deletes.push(seat.id);
  else plan.updates.push({ id: seat.id, to_round: fromRound - 1 });
}

/**
 * Transfer bzw. Neubesetzung planen: Alle Einträge dieses Cockpits ab Runde X werden
 * gekürzt oder entfernt, danach sitzt der neue Fahrer ab X (offenes Ende) darin.
 */
export function planSeatChange(
  seats: readonly Seat[],
  input: SeatChangeInput,
  names: { driver?: (id: Id) => string; team?: (id: Id) => string } = {},
): SeatPlan {
  const driverName = names.driver ?? ((id: Id) => `Fahrer #${id}`);
  const teamName = names.team ?? ((id: Id) => `Team #${id}`);
  const plan: SeatPlan = { deletes: [], updates: [], insert: null, error: null, notes: [] };
  const { season_id, team_id, seat_no, driver_id, from_round } = input;
  if (!Number.isInteger(from_round) || from_round < 1 || from_round > 99) {
    return { ...plan, error: 'Die Runde muss zwischen 1 und 99 liegen.' };
  }
  const seasonSeats = seats.filter((s) => s.season_id === season_id);
  const slot = seasonSeats.filter((s) => s.team_id === team_id && s.seat_no === seat_no);

  // Unverändert? (derselbe Fahrer sitzt ab ≤ X mit offenem Ende bereits darin)
  const covering = slot.find((s) => s.from_round <= from_round && end(s) === Number.POSITIVE_INFINITY);
  if (driver_id != null && covering?.driver_id === driver_id) {
    return { ...plan, error: `${driverName(driver_id)} sitzt ab Runde ${covering.from_round} bereits in diesem Cockpit.` };
  }
  if (driver_id == null && !slot.some((s) => end(s) >= from_round)) {
    return { ...plan, error: `Das Cockpit ist ab Runde ${from_round} bereits leer.` };
  }

  for (const s of slot) cutFrom(s, from_round, plan);

  if (driver_id != null) {
    const newRange = { from_round, to_round: null };
    const conflicts = seasonSeats.filter(
      (s) => s.driver_id === driver_id && !(s.team_id === team_id && s.seat_no === seat_no) && rangesOverlap(s, newRange),
    );
    if (conflicts.length > 0) {
      if (!input.releaseOtherSeat) {
        const c = conflicts[0]!;
        return {
          ...plan,
          deletes: [],
          updates: [],
          error: `${driverName(driver_id)} sitzt ab Runde ${Math.max(c.from_round, from_round)} bereits in einem anderen Cockpit (${teamName(c.team_id)}, Cockpit ${c.seat_no}). Gib das andere Cockpit zuerst frei oder setze das Häkchen „bisheriges Cockpit freigeben“.`,
        };
      }
      for (const c of conflicts) {
        cutFrom(c, from_round, plan);
        plan.notes.push(`Bisheriges Cockpit (${teamName(c.team_id)}, Cockpit ${c.seat_no}) ab Runde ${from_round} freigegeben.`);
      }
    }
    plan.insert = { season_id, team_id, seat_no, driver_id, from_round, to_round: null };
  }
  return plan;
}

export interface SeatConflict {
  driver_id: Id;
  a: Seat;
  b: Seat;
}

/** Prüft eine komplette Aufstellung auf Doppelbelegungen (Fahrer oder Cockpit). */
export function findSeatConflicts(seats: readonly Seat[]): { drivers: SeatConflict[]; slots: Array<{ a: Seat; b: Seat }> } {
  const drivers: SeatConflict[] = [];
  const slots: Array<{ a: Seat; b: Seat }> = [];
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      const a = seats[i]!;
      const b = seats[j]!;
      if (a.season_id !== b.season_id || !rangesOverlap(a, b)) continue;
      if (a.driver_id === b.driver_id) drivers.push({ driver_id: a.driver_id, a, b });
      if (a.team_id === b.team_id && a.seat_no === b.seat_no) slots.push({ a, b });
    }
  }
  return { drivers, slots };
}

/** Belegung eines Cockpits zu einer Runde. */
export function seatAt(seats: readonly Seat[], teamId: Id, seatNo: 1 | 2, round: number): Seat | undefined {
  return seats.find((s) => s.team_id === teamId && s.seat_no === seatNo && s.from_round <= round && end(s) >= round);
}

/** Lesbarer Rundenbereich „R1–R4“ bzw. „ab R3“. */
export function roundRangeLabel(s: Pick<Seat, 'from_round' | 'to_round'>): string {
  if (s.to_round == null) return `ab R${s.from_round}`;
  if (s.to_round === s.from_round) return `nur R${s.from_round}`;
  return `R${s.from_round}–R${s.to_round}`;
}
