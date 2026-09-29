/**
 * Startnummern im Admin (Plan §1 „Startnummern“, §6.2): vergeben, wechseln (gilt ab dem
 * nächsten Rennen), freigeben (nur inaktive Fahrer). Die Historie bleibt erhalten.
 * Reine Planungsfunktionen – die Action führt die Operationen aus.
 */
import type { DriverNumberRow, DriverRow, Id, RoundRow } from '~/lib/db/types';
import { isNumberAvailable, MAX_NUMBER, MIN_NUMBER, numberHolder } from '~/lib/domain/numbers';

type NumberEntry = Pick<DriverNumberRow, 'id' | 'driver_id' | 'number' | 'valid_from' | 'valid_to'>;

export type NumberOp =
  | { kind: 'insert'; row: { driver_id: Id; number: number; valid_from: string; valid_to: null; note: string | null } }
  | { kind: 'close'; id: Id; valid_to: string }
  | { kind: 'update'; id: Id; number: number; note: string | null }
  | { kind: 'reopen'; id: Id }
  | { kind: 'delete'; id: Id };

export interface NumberPlan {
  ops: NumberOp[];
  error: string | null;
  /** Zeitpunkt, ab dem die neue Nummer gilt */
  effectiveFrom?: string;
}

const fail = (error: string): NumberPlan => ({ ops: [], error });

/** Start des nächsten Rennens (geplant oder Aufstellung veröffentlicht) nach `now`. */
export function nextRoundStart(rounds: ReadonlyArray<Pick<RoundRow, 'status' | 'start_utc'>>, now: Date): string | null {
  const next = rounds
    .filter((r) => (r.status === 'scheduled' || r.status === 'lineup_published') && new Date(r.start_utc) > now)
    .sort((a, b) => a.start_utc.localeCompare(b.start_utc))[0];
  return next?.start_utc ?? null;
}

/** Aktiver Eintrag (gilt jetzt) und vorgemerkter Wechsel (gilt künftig) eines Fahrers. */
export function numberState(driverId: Id, numbers: readonly NumberEntry[], now: Date): { active: NumberEntry | null; pending: NumberEntry | null } {
  const mine = numbers.filter((n) => n.driver_id === driverId);
  const active =
    mine.find((n) => new Date(n.valid_from) <= now && (n.valid_to == null || new Date(n.valid_to) > now)) ?? null;
  const pending =
    mine
      .filter((n) => new Date(n.valid_from) > now && (n.valid_to == null || new Date(n.valid_to) > new Date(n.valid_from)))
      .sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0] ?? null;
  return { active, pending };
}

function checkNumber(number: number, numbers: readonly NumberEntry[], now: Date, driverId: Id, driverName: (id: Id) => string): string | null {
  if (!Number.isInteger(number) || number < MIN_NUMBER || number > MAX_NUMBER) return `Startnummern gehen von ${MIN_NUMBER} bis ${MAX_NUMBER}.`;
  if (!isNumberAvailable(number, numbers, now, driverId)) {
    const holder = numberHolder(number, numbers, now);
    return `Die Nummer ${number} ist bereits vergeben${holder != null ? ` (${driverName(holder)})` : ''}.`;
  }
  return null;
}

/** Nummer an einen Fahrer ohne Nummer vergeben – gilt sofort. */
export function planNumberAssign(
  driverId: Id,
  number: number,
  numbers: readonly NumberEntry[],
  now: Date,
  note: string | null = null,
  driverName: (id: Id) => string = (id) => `Fahrer #${id}`,
): NumberPlan {
  const { active, pending } = numberState(driverId, numbers, now);
  if (active || pending) return fail('Der Fahrer hat bereits eine Nummer – nutze „Nummer wechseln“.');
  const err = checkNumber(number, numbers, now, driverId, driverName);
  if (err) return fail(err);
  const from = now.toISOString();
  return {
    ops: [{ kind: 'insert', row: { driver_id: driverId, number, valid_from: from, valid_to: null, note } }],
    error: null,
    effectiveFrom: from,
  };
}

/**
 * Nummer wechseln (mit Admin-OK): Die neue Nummer gilt ab dem Start des nächsten Rennens,
 * die alte bekommt dort ihr Ende. Ist bereits ein Wechsel vorgemerkt, wird er angepasst
 * bzw. zurückgenommen (wenn die alte Nummer wieder gewählt wird).
 */
export function planNumberChange(
  driverId: Id,
  number: number,
  numbers: readonly NumberEntry[],
  nextStart: string | null,
  now: Date,
  note: string | null = null,
  driverName: (id: Id) => string = (id) => `Fahrer #${id}`,
): NumberPlan {
  const { active, pending } = numberState(driverId, numbers, now);
  if (!active && !pending) return planNumberAssign(driverId, number, numbers, now, note, driverName);

  if (pending) {
    if (pending.number === number) return fail(`Der Wechsel auf die ${number} ist bereits vorgemerkt.`);
    if (active && active.number === number) {
      // Wechsel zurücknehmen: vorgemerkten Eintrag löschen, alte Nummer wieder offen
      return { ops: [{ kind: 'delete', id: pending.id }, { kind: 'reopen', id: active.id }], error: null, effectiveFrom: active.valid_from };
    }
    const err = checkNumber(number, numbers, now, driverId, driverName);
    if (err) return fail(err);
    return { ops: [{ kind: 'update', id: pending.id, number, note }], error: null, effectiveFrom: pending.valid_from };
  }

  const current = active!;
  if (current.number === number) return fail(`Der Fahrer fährt bereits mit der ${number}.`);
  const err = checkNumber(number, numbers, now, driverId, driverName);
  if (err) return fail(err);
  const from = nextStart && new Date(nextStart) > now ? nextStart : now.toISOString();
  return {
    ops: [
      { kind: 'close', id: current.id, valid_to: from },
      { kind: 'insert', row: { driver_id: driverId, number, valid_from: from, valid_to: null, note } },
    ],
    error: null,
    effectiveFrom: from,
  };
}

/** Nummer freigeben – nur bei inaktiven (oder pseudonymisierten) Fahrern, gilt sofort. */
export function planNumberRelease(
  driver: Pick<DriverRow, 'id' | 'status' | 'anonymized'>,
  numbers: readonly NumberEntry[],
  now: Date,
): NumberPlan {
  if (driver.status !== 'inactive' && !driver.anonymized) {
    return fail('Nummern können nur bei inaktiven Fahrern freigegeben werden. Setze den Status zuerst auf „Inaktiv“.');
  }
  const { active, pending } = numberState(driver.id, numbers, now);
  const ops: NumberOp[] = [];
  if (active) {
    // valid_to muss nach valid_from liegen (Check-Constraint) – sonst Eintrag entfernen
    if (new Date(active.valid_from).getTime() >= now.getTime()) ops.push({ kind: 'delete', id: active.id });
    else ops.push({ kind: 'close', id: active.id, valid_to: now.toISOString() });
  }
  if (pending) ops.push({ kind: 'delete', id: pending.id });
  if (ops.length === 0) return fail('Der Fahrer hat keine aktive Nummer.');
  return { ops, error: null, effectiveFrom: now.toISOString() };
}

/** Freie Nummern im Bereich (für Vorschläge im Formular). */
export function freeNumbers(numbers: readonly NumberEntry[], now: Date, from = 2, to = MAX_NUMBER): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n++) if (numberHolder(n, numbers, now) == null) out.push(n);
  return out;
}
