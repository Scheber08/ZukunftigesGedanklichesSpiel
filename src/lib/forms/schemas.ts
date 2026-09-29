/**
 * Zod-Schemas der öffentlichen Formulare (Plan §4.6, §4.9, §4.10).
 *
 * Fehlermeldungen sind Fehlercodes – die Views übersetzen sie mit `forms.error.<code>`.
 * Die Feldnamen entsprechen den `name`-Attributen der Formulare. Astro liefert leere
 * Felder als null (bzw. undefined bei optionalen Feldern), Zahlen bereits als Number
 * und Checkboxen als boolean. Die Spam-Felder (Honeypot, Zeitfalle, Turnstile) ergänzt
 * die Action (src/actions/public.ts), damit diese Schemas ohne Server-Code testbar bleiben.
 */
import { z } from 'astro/zod';
import { AVAILABILITIES, INPUT_DEVICES, PLATFORMS, WANTED_ROLES } from '../db/types';
import { MAX_NUMBER, MIN_PUBLIC_NUMBER } from '../domain/numbers';
import { isAllowedClipUrl, normalizeGamertag, normalizeText } from '../domain/text';
import { isKnownCountry } from './countries';
import { isValidClipTimestamp, normalizeClipTimestamp } from './incident';
import { isValidDiscordName, normalizeDiscordName } from './registration';

/** Längen-Grenzen – die Formulare nutzen dieselben Werte für maxlength. */
export const LIMITS = {
  gamertag: { min: 2, max: 32 },
  eaId: { max: 32 },
  discord: { max: 37 },
  experience: { max: 1000 },
  referenceTime: { max: 100 },
  name: { min: 2, max: 80 },
  email: { max: 200 },
  subject: { min: 3, max: 120 },
  message: { min: 10, max: 5000 },
  description: { min: 20, max: 2000 },
  corner: { min: 1, max: 60 },
  clipUrl: { max: 500 },
  clipTimestamp: { max: 12 },
  lap: { min: 1, max: 200 },
} as const;

/** Pflicht-Text: normalisieren, dann Länge prüfen. */
function requiredText(normalize: (s: string) => string, min: number, max: number, code: string) {
  return z
    .string({ error: code })
    .transform(normalize)
    .pipe(z.string().min(min, code).max(max, code));
}

/** Optionaler Freitext: leer → null. */
function optionalText(max: number, code = 'text_too_long') {
  return z
    .string()
    .nullish()
    .transform((v) => {
      const n = v == null ? '' : normalizeText(v);
      return n === '' ? null : n;
    })
    .pipe(z.string().max(max, code).nullable());
}

/** Discord-Benutzername (Pflicht). */
const discordName = z
  .string({ error: 'discord_invalid' })
  .transform(normalizeDiscordName)
  .pipe(z.string().max(LIMITS.discord.max, 'discord_invalid').refine(isValidDiscordName, 'discord_invalid'));

/** Pflicht-Checkbox (Astro liefert true/false). */
function requiredCheckbox(code: string) {
  return z.coerce.boolean().refine((v) => v === true, code);
}

// ---------------------------------------------------------------------------- Anmeldung

export const registrationSchema = z.object({
  gamertag: requiredText(normalizeGamertag, LIMITS.gamertag.min, LIMITS.gamertag.max, 'gamertag_invalid'),
  ea_id: z
    .string()
    .nullish()
    .transform((v) => {
      const n = v == null ? '' : normalizeGamertag(v);
      return n === '' ? null : n;
    })
    .pipe(z.string().max(LIMITS.eaId.max, 'ea_id_invalid').nullable()),
  discord_username: discordName,
  platform: z.enum(PLATFORMS, { error: 'choose' }),
  input_device: z.enum(INPUT_DEVICES, { error: 'choose' }),
  desired_number: z
    .number({ error: 'number_invalid' })
    .int('number_invalid')
    .min(MIN_PUBLIC_NUMBER, 'number_invalid')
    .max(MAX_NUMBER, 'number_invalid'),
  nationality: z
    .string()
    .nullish()
    .transform((v) => (v ? v.trim().toUpperCase() : null))
    .pipe(z.string().refine(isKnownCountry, 'nationality_invalid').nullable()),
  wanted_role: z.enum(WANTED_ROLES, { error: 'choose' }),
  availability: z.enum(AVAILABILITIES, { error: 'choose' }),
  experience: optionalText(LIMITS.experience.max),
  reference_time: optionalText(LIMITS.referenceTime.max),
  age16: requiredCheckbox('age16_required'),
  rules: requiredCheckbox('rules_required'),
});

export type RegistrationInput = z.output<typeof registrationSchema>;

// ---------------------------------------------------------------------------- Vorfall

export const incidentSchema = z.object({
  round_id: z.number({ error: 'round_invalid' }).int('round_invalid').positive('round_invalid'),
  session_id: z.number({ error: 'session_invalid' }).int('session_invalid').positive('session_invalid'),
  reporter_driver_id: z.number({ error: 'reporter_invalid' }).int('reporter_invalid').positive('reporter_invalid'),
  involved_driver_ids: z
    .array(z.number({ error: 'involved_invalid' }).int('involved_invalid').positive('involved_invalid'), { error: 'involved_required' })
    .min(1, 'involved_required')
    .max(30, 'involved_invalid'),
  lap: z.number({ error: 'lap_invalid' }).int('lap_invalid').min(LIMITS.lap.min, 'lap_invalid').max(LIMITS.lap.max, 'lap_invalid').nullish(),
  corner: requiredText(normalizeGamertag, LIMITS.corner.min, LIMITS.corner.max, 'corner_invalid'),
  description: requiredText(normalizeText, LIMITS.description.min, LIMITS.description.max, 'description_invalid'),
  clip_url: z
    .string({ error: 'clip_invalid' })
    .transform((s) => s.trim())
    .pipe(z.string().max(LIMITS.clipUrl.max, 'clip_invalid').refine(isAllowedClipUrl, 'clip_invalid')),
  clip_timestamp: z
    .string({ error: 'clip_timestamp_invalid' })
    .transform(normalizeClipTimestamp)
    .pipe(z.string().max(LIMITS.clipTimestamp.max, 'clip_timestamp_invalid').refine(isValidClipTimestamp, 'clip_timestamp_invalid')),
  reporter_contact: discordName,
});

export type IncidentInput = z.output<typeof incidentSchema>;

// ---------------------------------------------------------------------------- Kontakt

export const contactSchema = z.object({
  name: requiredText(normalizeGamertag, LIMITS.name.min, LIMITS.name.max, 'name_invalid'),
  email: z
    .string({ error: 'email_invalid' })
    .transform((s) => s.trim())
    .pipe(z.email('email_invalid').max(LIMITS.email.max, 'email_invalid')),
  subject: requiredText(normalizeGamertag, LIMITS.subject.min, LIMITS.subject.max, 'subject_invalid'),
  message: requiredText(normalizeText, LIMITS.message.min, LIMITS.message.max, 'message_invalid'),
});

export type ContactInput = z.output<typeof contactSchema>;
