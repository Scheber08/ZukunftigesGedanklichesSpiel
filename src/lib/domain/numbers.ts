/**
 * Startnummern (Plan §1 „Startnummern“, §6.2).
 * Eine Nummer ist vergeben, solange ein Eintrag ohne Ende – oder mit Ende in der Zukunft – existiert.
 */

import type { DriverNumberRow, Id } from '../db/types';

export const MIN_NUMBER = 1;
export const MAX_NUMBER = 99;
/** Im Anmeldeformular wählbar: 2–99, die 1 bleibt ggf. dem Champion vorbehalten. */
export const MIN_PUBLIC_NUMBER = 2;

type NumberEntry = Pick<DriverNumberRow, 'driver_id' | 'number' | 'valid_from' | 'valid_to'>;

function isActiveAt(n: NumberEntry, at: Date): boolean {
  return new Date(n.valid_from) <= at && (n.valid_to == null || new Date(n.valid_to) > at);
}

/** Nummer des Fahrers zu einem Zeitpunkt (z. B. Rennstart). */
export function numberAt(driverId: Id, numbers: readonly NumberEntry[], at: Date): number | null {
  const hit = numbers.find((n) => n.driver_id === driverId && isActiveAt(n, at));
  return hit?.number ?? null;
}

/** Aktuelle oder künftig gültige Nummer (für Anzeige in Listen). */
export function currentNumber(driverId: Id, numbers: readonly NumberEntry[], now: Date): number | null {
  const active = numberAt(driverId, numbers, now);
  if (active != null) return active;
  const upcoming = numbers
    .filter((n) => n.driver_id === driverId && new Date(n.valid_from) > now)
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0];
  return upcoming?.number ?? null;
}

/** Wer blockiert die Nummer (jetzt oder künftig)? */
export function numberHolder(number: number, numbers: readonly NumberEntry[], now: Date): Id | null {
  const hit = numbers.find((n) => n.number === number && (n.valid_to == null || new Date(n.valid_to) > now));
  return hit?.driver_id ?? null;
}

export function isNumberAvailable(
  number: number,
  numbers: readonly NumberEntry[],
  now: Date,
  exceptDriverId?: Id,
): boolean {
  if (!Number.isInteger(number) || number < MIN_NUMBER || number > MAX_NUMBER) return false;
  const holder = numberHolder(number, numbers, now);
  return holder == null || holder === exceptDriverId;
}

/** Nummern-Historie eines Fahrers, älteste zuerst. */
export function numberHistory<T extends NumberEntry>(driverId: Id, numbers: readonly T[]): T[] {
  return numbers.filter((n) => n.driver_id === driverId).sort((a, b) => a.valid_from.localeCompare(b.valid_from));
}
