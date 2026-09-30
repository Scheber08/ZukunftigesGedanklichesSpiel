/**
 * Antworten des Liga-Bots (reine Logik): Embeds für /naechstes-rennen, /wertung und /fahrer,
 * Hilfen für Sprache, Markdown-Escaping, Discord-Zeitstempel und Link-Buttons.
 * Alle Antworten mit `allowed_mentions: { parse: [] }` – der Bot pingt nie jemanden.
 * Getestet in tests/unit/discord-bot-commands.test.ts (Helfer) und discord-bot-handler.test.ts (Antworten).
 */

import type { NextRacePayload, StandingsPayload } from '~/components/overlay/types';
import { t, type Lang } from '~/i18n';
import type { DriverProfile } from '~/lib/server/live-data';
import { MessageFlags, ResponseType } from './commands';

export const EMBED_GREEN = 0x37be89;
export const EMBED_TEAL = 0x34c4d0;

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  author?: { name: string };
  fields?: EmbedField[];
  footer?: { text: string };
}

export interface LinkButton {
  type: 2;
  style: 5;
  label: string;
  url: string;
}

export interface MessageData {
  content?: string;
  embeds?: Embed[];
  components?: Array<{ type: 1; components: LinkButton[] }>;
  allowed_mentions: { parse: [] };
  flags?: number;
}

export interface InteractionResponse {
  type: number;
  data?: MessageData | { choices: Array<{ name: string; value: string }> };
}

/** Kontext für Links und Fußzeile. */
export interface MessageContext {
  lang: Lang;
  /** Pfad → absolute URL der Website */
  siteUrl: (path: string) => string;
  siteName: string;
}

/** Discord-Locale → Sprache der Antwort: „de“ → Deutsch, alles andere Englisch. */
export function localeLang(locale: string | null | undefined): Lang {
  return locale != null && locale.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** Zeichen mit Markdown-Bedeutung in Discord (inkl. Masked Links und <…>-Syntax). */
const MD_SPECIAL = /[\\*_~`|>[\]<]/g;

/** Markdown-Sonderzeichen maskieren (Gamertags wie „Slipstream_Sam“ nicht kursiv setzen). */
export function escapeMarkdown(text: string): string {
  return text.replace(MD_SPECIAL, (c) => `\\${c}`);
}

/** Discord-Zeitstempel: <t:1700000000:F> (Datum+Zeit in der Zeitzone des Lesers), R = relativ. */
export function discordTimestamp(iso: string, style: 'F' | 'R' | 'f' | 't' = 'F'): string {
  const seconds = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isFinite(seconds) ? `<t:${seconds}:${style}>` : '';
}

/** Länderflagge als Emoji aus dem ISO-Code (Regional Indicator Symbols). */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  const base = 0x1f1e6;
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => base + c.charCodeAt(0) - 65));
}

/** Teamfarbe (#RRGGBB) als Embed-Farbe. */
export function colorInt(hex: string | null | undefined, fallback = EMBED_GREEN): number {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex.slice(1), 16) : fallback;
}

function linkRow(buttons: Array<{ label: string; url: string }>): MessageData['components'] {
  const valid = buttons.filter((b) => /^https?:\/\//.test(b.url)).map((b): LinkButton => ({ type: 2, style: 5, label: b.label.slice(0, 80), url: b.url }));
  return valid.length > 0 ? [{ type: 1, components: valid }] : undefined;
}

/** Nachricht (öffentlich im Channel bzw. nur für den Aufrufer). */
export function message(data: Omit<MessageData, 'allowed_mentions'>, ephemeral = false): InteractionResponse {
  const out: MessageData = { ...data, allowed_mentions: { parse: [] } };
  if (ephemeral) out.flags = MessageFlags.EPHEMERAL;
  if (!out.components) delete out.components;
  return { type: ResponseType.CHANNEL_MESSAGE, data: out };
}

export function textMessage(content: string, ephemeral = true): InteractionResponse {
  return message({ content }, ephemeral);
}

// ---------------------------------------------------------------------------
// /naechstes-rennen
// ---------------------------------------------------------------------------

export function nextRaceMessage(p: NextRacePayload, ctx: MessageContext): InteractionResponse {
  const { lang } = ctx;
  const r = p.round;
  if (!r) {
    return message({
      content: t(lang, 'bot.nextRace.none'),
      components: linkRow([{ label: t(lang, 'bot.button.calendar'), url: ctx.siteUrl(lang === 'de' ? '/kalender' : '/en/calendar') }]),
    });
  }
  const url = ctx.siteUrl(r.path);
  const fields: EmbedField[] = [
    { name: t(lang, 'bot.field.leagueTime'), value: r.dateText, inline: true },
    { name: t(lang, 'bot.field.country'), value: `${flagEmoji(r.countryCode)} ${escapeMarkdown(r.countryName)}`.trim(), inline: true },
  ];
  if (r.formatText) fields.push({ name: t(lang, 'bot.field.format'), value: r.formatText, inline: true });
  if (r.status === 'lineup_published') fields.push({ name: t(lang, 'bot.field.status'), value: r.statusText, inline: true });
  return message({
    embeds: [
      {
        author: { name: t(lang, 'bot.nextRace.author', { season: r.seasonName }) },
        title: r.label,
        url,
        description: t(lang, 'bot.nextRace.yourTime', { full: discordTimestamp(r.startUtc, 'F'), relative: discordTimestamp(r.startUtc, 'R') }),
        color: EMBED_GREEN,
        fields,
        footer: { text: ctx.siteName },
      },
    ],
    components: linkRow([{ label: t(lang, 'bot.button.race'), url }]),
  });
}

// ---------------------------------------------------------------------------
// /wertung
// ---------------------------------------------------------------------------

export function standingsMessage(p: StandingsPayload, ctx: MessageContext): InteractionResponse {
  const { lang } = ctx;
  const season = p.seasonName ?? '';
  const title = t(lang, p.art === 'teams' ? 'bot.standings.teams' : 'bot.standings.drivers', { season }).replace(/ · $/, '');
  const url = ctx.siteUrl(lang === 'de' ? '/wertung' : '/en/standings');
  const lines = p.rows.map((row) => {
    const team = row.team ? ` · ${escapeMarkdown(row.team)}` : '';
    return `\`${row.pos.padStart(3, ' ')}\` **${escapeMarkdown(row.name)}**${team} – ${row.value} ${t(lang, 'common.pointsShort')}`;
  });
  return message({
    embeds: [
      {
        title,
        url,
        description: lines.length > 0 ? lines.join('\n') : t(lang, 'bot.standings.none'),
        color: EMBED_TEAL,
        footer: { text: p.afterRound != null ? `${t(lang, 'bot.standings.after', { n: p.afterRound })} · ${ctx.siteName}` : ctx.siteName },
      },
    ],
    components: linkRow([{ label: t(lang, 'bot.button.standings'), url }]),
  });
}

// ---------------------------------------------------------------------------
// /fahrer
// ---------------------------------------------------------------------------

export function driverMessage(p: DriverProfile, ctx: MessageContext): InteractionResponse {
  const { lang } = ctx;
  const url = ctx.siteUrl(p.path);
  const fields: EmbedField[] = [
    { name: t(lang, 'bot.driver.team'), value: p.team ? escapeMarkdown(p.team.name) : '–', inline: true },
    { name: t(lang, 'bot.driver.number'), value: p.number != null ? `#${p.number}` : '–', inline: true },
    { name: t(lang, 'bot.driver.role'), value: t(lang, p.reserve ? 'bot.driver.reserve' : 'bot.driver.regular'), inline: true },
  ];
  if (p.seasonName) {
    fields.push({
      name: t(lang, 'bot.driver.position', { season: p.seasonName }),
      value:
        p.position != null
          ? `${p.position.startsWith('=') ? `P${p.position.slice(1)} (=)` : `P${p.position}`} · ${p.points ?? 0} ${t(lang, 'common.pointsShort')}`
          : t(lang, 'bot.driver.noResults'),
      inline: true,
    });
    if (p.position != null) fields.push({ name: t(lang, 'bot.driver.winsPodiums'), value: `${p.wins} / ${p.podiums}`, inline: true });
  }
  const flag = flagEmoji(p.nationality);
  return message({
    embeds: [
      {
        title: `${p.number != null ? `#${p.number} ` : ''}${escapeMarkdown(p.name)}${flag ? ` ${flag}` : ''}`,
        url,
        color: colorInt(p.team?.color),
        fields,
        footer: { text: ctx.siteName },
      },
    ],
    components: linkRow([{ label: t(lang, 'bot.button.profile'), url }]),
  });
}
