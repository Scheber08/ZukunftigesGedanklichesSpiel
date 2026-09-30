/**
 * Verarbeitung der Discord-Interactions (nach erfolgreicher Signaturprüfung im Endpunkt):
 * PING → PONG, Slash-Befehle, Autocomplete. Alle Abhängigkeiten (Daten, Selbstrollen,
 * Discord-API) kommen über `BotDeps` – so ist der Ablauf ohne Netz testbar
 * (tests/unit/discord-bot-handler.test.ts).
 */

import { t, type Lang } from '~/i18n';
import type { LiveSnapshot, SnapshotPart } from '~/lib/server/live-data';
import { driverProfile, driverSuggestions, findDriver, nextRacePayload, standingsPayload } from '~/lib/server/live-data';
import type { PrivateSettings } from '~/lib/settings';
import { commandKey, InteractionType, OPTION_NAMES, ResponseType } from './commands';
import {
  driverMessage,
  escapeMarkdown,
  localeLang,
  nextRaceMessage,
  standingsMessage,
  textMessage,
  type InteractionResponse,
  type MessageContext,
} from './messages';
import type { RoleResult } from './roles';

export type SelfRole = PrivateSettings['discord_self_roles']['roles'][number];

export interface InteractionOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  focused?: boolean;
  options?: InteractionOption[];
}

/** Die benötigten Felder einer Discord-Interaction. */
export interface Interaction {
  type: number;
  id?: string;
  locale?: string;
  guild_locale?: string;
  guild_id?: string;
  member?: { user?: { id: string }; roles?: string[] };
  user?: { id: string };
  data?: { name?: string; options?: InteractionOption[] };
}

export interface BotDeps {
  siteUrl: (path: string) => string;
  siteName: string;
  /** Liga-Server (DISCORD_GUILD_ID); Rollen nur dort – ohne Angabe ist /rolle aus */
  guildId: string | null;
  snapshot: (parts: SnapshotPart[]) => Promise<LiveSnapshot>;
  /** Konfigurierte Selbstrollen und Rollen, die nie selbst vergeben werden dürfen (Staff) */
  selfRoles: () => Promise<{ roles: SelfRole[]; blocked: readonly string[] }>;
  /** Rolle setzen/entfernen; 'no_token' = Bot-Token fehlt */
  setRole: (guildId: string, userId: string, roleId: string, add: boolean, reason: string) => Promise<RoleResult | 'no_token'>;
}

const AUTOCOMPLETE_MAX = 25;

function option(i: Interaction, name: string): InteractionOption | undefined {
  return i.data?.options?.find((o) => o.name === name);
}

function stringOption(i: Interaction, name: string): string {
  const v = option(i, name)?.value;
  return typeof v === 'string' ? v : v != null ? String(v) : '';
}

function focusedOption(i: Interaction): InteractionOption | undefined {
  return i.data?.options?.find((o) => o.focused);
}

const autocomplete = (choices: Array<{ name: string; value: string }>): InteractionResponse => ({
  type: ResponseType.AUTOCOMPLETE_RESULT,
  data: { choices: choices.slice(0, AUTOCOMPLETE_MAX).map((c) => ({ name: c.name.slice(0, 100), value: c.value.slice(0, 100) })) },
});

function roleLabel(role: SelfRole, lang: Lang): string {
  return (lang === 'en' ? role.label_en : role.label_de) || role.label_de;
}

/** Selbstrolle aus dem Optionswert: Rollen-ID (Autocomplete) oder getippte Bezeichnung. */
export function matchSelfRole(roles: readonly SelfRole[], value: string): SelfRole | undefined {
  const v = value.trim();
  if (v === '') return undefined;
  const lower = v.toLowerCase();
  return roles.find((r) => r.role_id === v) ?? roles.find((r) => r.label_de.toLowerCase() === lower || (r.label_en ?? '').toLowerCase() === lower);
}

// ---------------------------------------------------------------------------
// Befehle
// ---------------------------------------------------------------------------

async function handleCommand(i: Interaction, deps: BotDeps, lang: Lang): Promise<InteractionResponse> {
  const ctx: MessageContext = { lang, siteUrl: deps.siteUrl, siteName: deps.siteName };
  switch (commandKey(i.data?.name)) {
    case 'nextRace': {
      const snap = await deps.snapshot([]);
      return nextRaceMessage(nextRacePayload(snap, lang), ctx);
    }
    case 'standings': {
      const art = /^(teams?|constructors|konstrukteure)$/i.test(stringOption(i, OPTION_NAMES.standingsType)) ? 'teams' : 'drivers';
      const snap = await deps.snapshot(['results']);
      return standingsMessage(standingsPayload(snap, lang, art, 10), ctx);
    }
    case 'driver': {
      const query = stringOption(i, OPTION_NAMES.driverName).slice(0, 100);
      const snap = await deps.snapshot(['results', 'seats']);
      const { driver, candidates } = findDriver(snap, query);
      if (driver) return driverMessage(driverProfile(snap, driver, lang), ctx);
      if (candidates.length > 1) {
        const list = candidates
          .slice(0, 10)
          .map((d) => escapeMarkdown(d.gamertag))
          .join(', ');
        return textMessage(t(lang, 'bot.driver.ambiguous', { query: escapeMarkdown(query), list }));
      }
      return textMessage(t(lang, 'bot.driver.notFound', { query: escapeMarkdown(query) }));
    }
    case 'role':
      return handleRole(i, deps, lang);
    default:
      return textMessage(t(lang, 'bot.unknownCommand'));
  }
}

async function handleRole(i: Interaction, deps: BotDeps, lang: Lang): Promise<InteractionResponse> {
  const userId = i.member?.user?.id;
  // Ohne bekannten Liga-Server keine Rollenvergabe (sonst ginge /rolle auf jedem Server mit dem Bot)
  if (!deps.guildId) return textMessage(t(lang, 'bot.role.notConfigured'));
  if (!i.guild_id || !userId || i.guild_id !== deps.guildId) return textMessage(t(lang, 'bot.role.guildOnly'));
  const { roles, blocked } = await deps.selfRoles();
  if (roles.length === 0) return textMessage(t(lang, 'bot.role.none'));
  const role = matchSelfRole(roles, stringOption(i, OPTION_NAMES.role));
  // Nur konfigurierte Selbstrollen – und nie eine Rolle mit Admin-/Steward-/Redaktionsrechten
  if (!role || blocked.includes(role.role_id)) return textMessage(t(lang, 'bot.role.unknown'));
  const has = (i.member?.roles ?? []).includes(role.role_id);
  const result = await deps.setRole(i.guild_id, userId, role.role_id, !has, has ? 'Selbstrolle entfernt (/rolle)' : 'Selbstrolle vergeben (/rolle)');
  const label = escapeMarkdown(roleLabel(role, lang));
  switch (result) {
    case 'ok':
      return textMessage(t(lang, has ? 'bot.role.removed' : 'bot.role.added', { role: label }));
    case 'forbidden':
      return textMessage(t(lang, 'bot.role.forbidden'));
    case 'no_token':
      return textMessage(t(lang, 'bot.role.notConfigured'));
    default:
      return textMessage(t(lang, 'bot.role.error'));
  }
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

async function handleAutocomplete(i: Interaction, deps: BotDeps, lang: Lang): Promise<InteractionResponse> {
  const focused = focusedOption(i);
  const typed = typeof focused?.value === 'string' ? focused.value : '';
  switch (commandKey(i.data?.name)) {
    case 'driver': {
      const snap = await deps.snapshot([]);
      return autocomplete(driverSuggestions(snap, typed).map((d) => ({ name: d.gamertag, value: d.slug })));
    }
    case 'role': {
      if (!deps.guildId || i.guild_id !== deps.guildId) return autocomplete([]);
      const { roles, blocked } = await deps.selfRoles();
      const memberRoles = i.member?.roles ?? [];
      const q = typed.trim().toLowerCase();
      return autocomplete(
        roles
          .filter((r) => !blocked.includes(r.role_id))
          .filter((r) => q === '' || roleLabel(r, lang).toLowerCase().includes(q))
          .map((r) => ({
            name: t(lang, memberRoles.includes(r.role_id) ? 'bot.role.choiceRemove' : 'bot.role.choiceAdd', { role: roleLabel(r, lang) }),
            value: r.role_id,
          })),
      );
    }
    default:
      return autocomplete([]);
  }
}

/** Einstieg: eine (bereits signaturgeprüfte) Interaction beantworten. */
export async function handleInteraction(i: Interaction, deps: BotDeps): Promise<InteractionResponse> {
  if (i.type === InteractionType.PING) return { type: ResponseType.PONG };
  const lang = localeLang(i.locale ?? i.guild_locale);
  try {
    if (i.type === InteractionType.AUTOCOMPLETE) return await handleAutocomplete(i, deps, lang);
    if (i.type === InteractionType.APPLICATION_COMMAND) return await handleCommand(i, deps, lang);
    return textMessage(t(lang, 'bot.unknownCommand'));
  } catch (err) {
    console.error('Discord-Befehl fehlgeschlagen', err);
    if (i.type === InteractionType.AUTOCOMPLETE) return autocomplete([]);
    return textMessage(t(lang, 'bot.error'));
  }
}
