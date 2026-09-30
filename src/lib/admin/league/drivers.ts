/**
 * Fahrer-Logik im Admin (Plan §5 „Fahrer“, §6.7 Pseudonymisierung). Reine Funktionen.
 */
import type { DriverNumberRow, DriverRow, Id, RegistrationRow, RoundRow, SeasonRow } from '~/lib/db/types';
import { isNumberAvailable, MAX_NUMBER, MIN_PUBLIC_NUMBER } from '~/lib/domain/numbers';
import { gamertagKey, normalizeGamertag, slugify, uniqueSlug } from '~/lib/domain/text';
import { autoSlug, RESERVED_DRIVER_SLUGS } from './slugs';

/**
 * Eindeutiger Slug für einen Gamertag (der eigene aktuelle Slug zählt nicht als belegt).
 * Reservierte Slugs fester Unterseiten (z. B. „vergleich“) bekommen einen Zähler („vergleich-2“).
 */
export function driverSlug(gamertag: string, takenSlugs: Iterable<string>, ownSlug?: string): string {
  return autoSlug('driver', gamertag, takenSlugs, ownSlug);
}

/** Wurde der Slug automatisch aus dem Gamertag erzeugt (ggf. mit Zähler „-2“)? */
export function isAutoSlug(slug: string, gamertag: string): boolean {
  const base = slugify(gamertag);
  if (slug === base) return true;
  return slug.startsWith(`${base}-`) && /^\d+$/.test(slug.slice(base.length + 1));
}

/**
 * Slug beim Speichern eines Fahrers:
 * - eigener Slug im Formular → der (nach Prüfung) gilt,
 * - Gamertag geändert und der Slug war automatisch erzeugt und wurde nicht angefasst →
 *   neuer Slug aus dem neuen Gamertag (die alte URL leitet dann per 301 weiter),
 * - sonst bleibt der bisherige Slug.
 */
export function nextDriverSlug(
  input: { gamertag: string; slug: string | null | undefined },
  before: Pick<DriverRow, 'slug' | 'gamertag'> | null | undefined,
  takenSlugs: Iterable<string>,
): { slug: string; custom: boolean } {
  const wanted = (input.slug ?? '').trim();
  if (!before) return wanted ? { slug: wanted, custom: true } : { slug: driverSlug(input.gamertag, takenSlugs), custom: false };
  const renamed = before.gamertag !== input.gamertag;
  if (wanted && wanted !== before.slug) return { slug: wanted, custom: true };
  if (!renamed) return { slug: before.slug, custom: false };
  if (!wanted || isAutoSlug(before.slug, before.gamertag)) return { slug: driverSlug(input.gamertag, takenSlugs, before.slug), custom: false };
  return { slug: before.slug, custom: false };
}

/** Gibt es schon einen (nicht pseudonymisierten) Fahrer mit diesem Gamertag? */
export function findGamertagDuplicate(
  gamertag: string,
  drivers: ReadonlyArray<Pick<DriverRow, 'id' | 'gamertag' | 'anonymized'>>,
  exceptId?: Id,
): Pick<DriverRow, 'id' | 'gamertag'> | undefined {
  const key = gamertagKey(gamertag);
  return drivers.find((d) => d.id !== exceptId && !d.anonymized && gamertagKey(d.gamertag) === key);
}

/** Nächste Position im Reservepool (ans Ende). */
export function nextReserveOrder(drivers: ReadonlyArray<Pick<DriverRow, 'reserve_order'>>): number {
  return drivers.reduce((m, d) => Math.max(m, d.reserve_order ?? 0), 0) + 1;
}

export const PSEUDONYM_PREFIX = 'Ehemaliger Fahrer';

export function pseudonym(driverId: Id): string {
  return `${PSEUDONYM_PREFIX} #${driverId}`;
}

/**
 * Pseudonymisierung auf Löschwunsch (Plan §6.7): Gamertag → „Ehemaliger Fahrer #id“,
 * neuer Slug, keine Links/Flagge, Status inaktiv. Ergebnisse bleiben erhalten, damit
 * die Wertungen stimmen. Private Daten löscht die Action separat.
 */
export function pseudonymizedDriverPatch(
  driver: Pick<DriverRow, 'id' | 'slug'>,
  takenSlugs: Iterable<string>,
): Pick<DriverRow, 'gamertag' | 'slug' | 'anonymized' | 'nationality_code' | 'twitch_url' | 'youtube_url' | 'show_links' | 'status' | 'reserve_order'> {
  const taken = new Set(takenSlugs);
  taken.delete(driver.slug);
  for (const r of RESERVED_DRIVER_SLUGS) taken.add(r);
  return {
    gamertag: pseudonym(driver.id),
    slug: uniqueSlug(`ehemaliger-fahrer-${driver.id}`, taken),
    anonymized: true,
    nationality_code: null,
    twitch_url: null,
    youtube_url: null,
    show_links: false,
    status: 'inactive',
    reserve_order: null,
  };
}

/** Sicherheitsabfrage: Eingabe muss dem Gamertag entsprechen (Groß-/Kleinschreibung egal). */
export function confirmsGamertag(input: string | null | undefined, gamertag: string): boolean {
  return !!input && gamertagKey(input) === gamertagKey(gamertag);
}

// ---------------------------------------------------------------------------- Anmeldung → Fahrer

export interface AcceptPlan {
  driver: Omit<DriverRow, 'id' | 'created_at' | 'updated_at'>;
  private: { discord_username: string | null; ea_id: string | null; discord_user_id: null; notes: string | null };
  /** Wunschnummer, falls frei (gilt sofort) */
  number: number | null;
  warnings: string[];
  error: string | null;
}

/**
 * „Annehmen“ (Plan §5 „Anmeldungen“): Fahrer als Reserve ans Ende des Pools anlegen,
 * private Kontaktdaten übernehmen, Wunschnummer vergeben, falls frei.
 */
export function planAcceptRegistration(
  reg: RegistrationRow,
  ctx: {
    drivers: ReadonlyArray<Pick<DriverRow, 'id' | 'slug' | 'gamertag' | 'anonymized' | 'reserve_order'>>;
    numbers: ReadonlyArray<Pick<DriverNumberRow, 'driver_id' | 'number' | 'valid_from' | 'valid_to'>>;
    seasons: ReadonlyArray<Pick<SeasonRow, 'id' | 'status' | 'number'>>;
    now: Date;
  },
): AcceptPlan {
  const gamertag = normalizeGamertag(reg.gamertag);
  const warnings: string[] = [];
  let error: string | null = null;
  if (reg.driver_id != null) error = 'Diese Anmeldung ist bereits mit einem Fahrer verknüpft.';
  const dup = findGamertagDuplicate(gamertag, ctx.drivers);
  if (!error && dup) error = `Es gibt bereits einen Fahrer mit dem Gamertag „${dup.gamertag}“ (#${dup.id}).`;

  const active = ctx.seasons.find((s) => s.status === 'active');
  const planned = [...ctx.seasons].filter((s) => s.status === 'planned').sort((a, b) => a.number - b.number)[0];
  const joined = active ?? planned ?? null;

  let number: number | null = null;
  const wish = reg.desired_number;
  if (Number.isInteger(wish) && wish >= MIN_PUBLIC_NUMBER && wish <= MAX_NUMBER) {
    if (isNumberAvailable(wish, ctx.numbers, ctx.now)) number = wish;
    else warnings.push(`Die Wunschnummer ${wish} ist inzwischen vergeben – bitte im Fahrerprofil eine Nummer vergeben.`);
  } else {
    warnings.push('Keine gültige Wunschnummer – bitte im Fahrerprofil eine Nummer vergeben.');
  }

  const noteParts = [`Aus Anmeldung #${reg.id}`];
  if (reg.admin_notes) noteParts.push(reg.admin_notes);

  return {
    driver: {
      slug: driverSlug(gamertag, ctx.drivers.map((d) => d.slug)),
      gamertag,
      nationality_code: reg.nationality ? reg.nationality.toUpperCase() : null,
      platform: reg.platform,
      input_device: reg.input_device,
      status: 'reserve',
      reserve_order: nextReserveOrder(ctx.drivers),
      joined_season_id: joined?.id ?? null,
      twitch_url: null,
      youtube_url: null,
      show_links: false,
      anonymized: false,
    },
    private: {
      discord_username: reg.discord_username || null,
      ea_id: reg.ea_id,
      discord_user_id: null,
      notes: noteParts.join('\n'),
    },
    number,
    warnings,
    error,
  };
}

/** Nächste Runde über alle Saisons (für Hinweise „gilt ab …“). */
export function nextRound<T extends Pick<RoundRow, 'status' | 'start_utc'>>(rounds: readonly T[], now: Date): T | undefined {
  return rounds
    .filter((r) => (r.status === 'scheduled' || r.status === 'lineup_published') && new Date(r.start_utc) > now)
    .sort((a, b) => a.start_utc.localeCompare(b.start_utc))[0];
}
