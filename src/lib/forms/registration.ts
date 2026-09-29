/**
 * Anmeldung (Plan §4.9): Normalisierung des Discord-Namens und Duplikat-Erkennung.
 * Reine Funktionen ohne I/O – die Action lädt die Vergleichsdaten und ruft sie auf.
 */
import type { DriverPrivateRow, DriverRow, RegistrationRow } from '../db/types';
import { gamertagKey, normalizeGamertag } from '../domain/text';

/** Discord-Name: Trim/NFKC, führendes „@“ entfernen; neue Namen (ohne #1234) sind immer klein. */
export function normalizeDiscordName(input: string): string {
  const base = normalizeGamertag(input).replace(/^@+/, '').trim();
  return /#\d{4}$/.test(base) ? base : base.toLowerCase();
}

const NEW_DISCORD_NAME = /^(?!.*\.\.)[a-z0-9_.]{2,32}$/;
const LEGACY_DISCORD_NAME = /^[^@#:`]{2,32}#\d{4}$/;

/** Neue Discord-Benutzernamen (2–32 Zeichen: a–z, 0–9, _ und .) oder alte „Name#1234“. */
export function isValidDiscordName(name: string): boolean {
  return NEW_DISCORD_NAME.test(name) || LEGACY_DISCORD_NAME.test(name);
}

/** Vergleichsschlüssel für Discord-Namen (Groß-/Kleinschreibung egal). */
export function discordKey(name: string | null | undefined): string {
  return name ? normalizeDiscordName(name).toLocaleLowerCase('en') : '';
}

export type DuplicateKind = 'gamertag' | 'discord';

export interface DuplicateSources {
  registrations: ReadonlyArray<Pick<RegistrationRow, 'gamertag' | 'discord_username' | 'ea_id' | 'status'>>;
  drivers: ReadonlyArray<Pick<DriverRow, 'gamertag' | 'anonymized'>>;
  driverPrivate: ReadonlyArray<Pick<DriverPrivateRow, 'discord_username' | 'ea_id'>>;
}

/**
 * Gleicher Gamertag (bzw. EA-ID) oder gleicher Discord-Name unter nicht abgelehnten Anmeldungen
 * und bestehenden Fahrern? Liefert die Art des ersten Treffers, sonst null.
 */
export function findRegistrationDuplicate(
  candidate: { gamertag: string; discord_username: string; ea_id?: string | null },
  sources: DuplicateSources,
): DuplicateKind | null {
  const names = new Set([gamertagKey(candidate.gamertag), candidate.ea_id ? gamertagKey(candidate.ea_id) : ''].filter(Boolean));
  const discord = discordKey(candidate.discord_username);
  const open = sources.registrations.filter((r) => r.status !== 'rejected');

  const nameTaken =
    open.some((r) => names.has(gamertagKey(r.gamertag)) || (r.ea_id != null && names.has(gamertagKey(r.ea_id)))) ||
    sources.drivers.some((d) => !d.anonymized && names.has(gamertagKey(d.gamertag))) ||
    sources.driverPrivate.some((p) => p.ea_id != null && names.has(gamertagKey(p.ea_id)));
  if (nameTaken) return 'gamertag';

  const discordTaken =
    discord !== '' &&
    (open.some((r) => discordKey(r.discord_username) === discord) ||
      sources.driverPrivate.some((p) => discordKey(p.discord_username) === discord));
  return discordTaken ? 'discord' : null;
}
