/**
 * Inhalte der Discord-Benachrichtigungen für die öffentlichen Formulare (Plan §8.1).
 * Reine Funktionen ohne I/O – die Action ergänzt Farbe und Zeitstempel und sendet.
 *
 * Datensparsam: Die Anmeldung meldet nur Gamertag, Plattform, Wunschnummer und den Link
 * in den Admin-Bereich (kein Discord-Name, keine EA-ID); der Kontakt nur den Betreff
 * (keine E-Mail-Adresse, keine Nachricht); der Vorfall keinen Kontakt des Melders.
 * Nutzereingaben werden entschärft, damit sie in Discord nicht als Formatierung oder
 * maskierter Link erscheinen.
 */
import { t } from '~/i18n';
import type { ContactMessageRow, RegistrationRow, SessionType } from '../db/types';

export interface EmbedContent {
  title: string;
  url: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}

/**
 * Discord-Markdown in Nutzereingaben entschärfen und Zeilenumbrüche entfernen. Überschrift,
 * Zitat und Liste wirken nur am Zeilenanfang – dort werden #, > und - zusätzlich maskiert.
 */
export function escapeDiscord(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\*_~`|[\]()<:]/g, (c) => `\\${c}`)
    .replace(/^(?=#{1,3} |>|- )/, '\\');
}

/** Link für Discord: Zeichen, die Markdown-Links bilden könnten, prozentkodieren. */
export function discordSafeUrl(value: string): string {
  return value.trim().replace(/[[\]()<>\s`]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}

/** Neue Anmeldung → #anmeldungen (nur Admins). */
export function registrationEmbed(registration: Pick<RegistrationRow, 'gamertag' | 'platform' | 'desired_number'>, adminUrl: string): EmbedContent {
  return {
    title: t('de', 'forms.discord.registration.title', { gamertag: escapeDiscord(registration.gamertag) }),
    url: adminUrl,
    fields: [
      { name: t('de', 'forms.discord.registration.platform'), value: t('de', `platform.long.${registration.platform}`), inline: true },
      { name: t('de', 'forms.discord.registration.number'), value: String(registration.desired_number), inline: true },
      { name: t('de', 'forms.discord.registration.link'), value: adminUrl },
    ],
  };
}

export interface IncidentEmbedInput {
  /** „R4 · Miami“ */
  round: string;
  session: SessionType;
  lap: number | null;
  corner: string;
  /** Anzeigenamen der Beteiligten, z. B. „#4 ApexAnna“ */
  involved: string[];
  clipUrl: string;
  clipTimestamp: string;
  adminUrl: string;
}

/** Neuer Vorfall → #stewards-intern (nur Stewards): Runde, Beteiligte, Clip, Link. */
export function incidentEmbed(input: IncidentEmbedInput): EmbedContent {
  const where = [input.lap != null ? t('de', 'forms.discord.incident.lap', { n: input.lap }) : null, escapeDiscord(input.corner)]
    .filter((x): x is string => x != null && x !== '')
    .join(' · ');
  return {
    title: t('de', 'forms.discord.incident.title', { round: input.round }),
    url: input.adminUrl,
    fields: [
      { name: t('de', 'forms.discord.incident.session'), value: t('de', `session.${input.session}`), inline: true },
      { name: t('de', 'forms.discord.incident.where'), value: where || '–', inline: true },
      { name: t('de', 'forms.discord.incident.involved'), value: input.involved.map(escapeDiscord).join(', ') || '–' },
      { name: t('de', 'forms.discord.incident.clip'), value: `${discordSafeUrl(input.clipUrl)} (${input.clipTimestamp.replace(/[^\d:]/g, '')})` },
      { name: t('de', 'forms.discord.incident.link'), value: input.adminUrl },
    ],
  };
}

/** Neue Kontaktanfrage → Kanal „contact“: nur Betreff und Link (keine E-Mail-Adresse). */
export function contactEmbed(message: Pick<ContactMessageRow, 'subject'>, adminUrl: string): EmbedContent {
  return {
    title: t('de', 'forms.discord.contact.title'),
    url: adminUrl,
    fields: [
      { name: t('de', 'forms.discord.contact.subject'), value: escapeDiscord(message.subject) },
      { name: t('de', 'forms.discord.contact.link'), value: adminUrl },
    ],
  };
}
