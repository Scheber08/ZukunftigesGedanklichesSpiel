/**
 * Discord-Integration (Plan §8.1):
 * - Webhooks je Channel (URLs nur serverseitig in den Einstellungen)
 * - Rollenprüfung für den Staff-Login per Bot-Token
 * - Mitglieder-/Online-Zahlen für die Discord-Karte (Invite-API mit with_counts)
 *
 * Webhooks werfen nie: Ein Discord-Ausfall darf keine Veröffentlichung verhindern.
 */
import { SITE } from '~/config/site';
import type { Store } from '../db/store';
import type { StaffRole } from '../db/types';
import type { PrivateSettings } from '../settings';
import { env } from './env';
import { readPrivateSettings } from './settings';

const API = 'https://discord.com/api/v10';
/** Akzentfarbe Grün (#37BE89) als Embed-Farbe. */
export const EMBED_GREEN = 0x37be89;
export const EMBED_TEAL = 0x34c4d0;
export const EMBED_WARNING = 0xf5b94a;
export const EMBED_DANGER = 0xff6b6b;

export type WebhookChannel = keyof PrivateSettings['webhooks'];

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: EmbedField[];
  footer?: { text: string };
  timestamp?: string;
  thumbnail?: { url: string };
  image?: { url: string };
}

/** Discord-Limits beachten (Titel 256, Beschreibung 4096, Feldwert 1024 Zeichen). */
function clampEmbed(e: Embed): Embed {
  const cut = (s: string | undefined, n: number) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return {
    ...e,
    title: cut(e.title, 256),
    description: cut(e.description, 4096),
    fields: e.fields?.slice(0, 25).map((f) => ({ ...f, name: cut(f.name, 256)!, value: cut(f.value, 1024) || '–' })),
    footer: e.footer ?? { text: SITE.name },
  };
}

/** Webhook senden. Liefert true bei Erfolg, loggt Fehler, wirft nie. */
export async function sendWebhook(url: string | null | undefined, payload: { content?: string; embeds?: Embed[] }): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(`${url}?wait=false`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: SITE.name,
        allowed_mentions: { parse: [] },
        content: payload.content,
        embeds: payload.embeds?.map(clampEmbed),
      }),
    });
    if (!res.ok) console.error(`Discord-Webhook fehlgeschlagen: ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error('Discord-Webhook nicht erreichbar', err);
    return false;
  }
}

/** Webhook an einen konfigurierten Channel (siehe Einstellungen → Webhooks). */
export async function notify(store: Store, channel: WebhookChannel, embed: Embed, content?: string): Promise<boolean> {
  try {
    const settings = await readPrivateSettings(store);
    return await sendWebhook(settings.webhooks[channel], { content, embeds: [embed] });
  } catch (err) {
    console.error('Discord-Benachrichtigung fehlgeschlagen', err);
    return false;
  }
}

// ---------------------------------------------------------------------------- Rollen

/** Rollen-IDs eines Mitglieds auf dem Liga-Server; null = kein Mitglied / nicht prüfbar. */
export async function fetchMemberRoleIds(discordUserId: string): Promise<string[] | null> {
  if (!env.discordBotToken || !env.discordGuildId) return null;
  const res = await fetch(`${API}/guilds/${env.discordGuildId}/members/${discordUserId}`, {
    headers: { authorization: `Bot ${env.discordBotToken}` },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Discord-Rollenabfrage fehlgeschlagen: ${res.status}`);
  const data = (await res.json()) as { roles?: string[] };
  return data.roles ?? [];
}

/** Discord-Rollen → App-Rollen laut Rollen-Zuordnung (Plan §5 Login). */
export function mapRoles(roleIds: readonly string[], map: PrivateSettings['discord_role_map']): StaffRole[] {
  const roles: StaffRole[] = [];
  if (map.admin.some((id) => roleIds.includes(id))) roles.push('admin');
  if (map.steward.some((id) => roleIds.includes(id))) roles.push('steward');
  if (map.redakteur.some((id) => roleIds.includes(id))) roles.push('redakteur');
  return roles;
}

// ---------------------------------------------------------------------------- Discord-Karte

export interface InviteCounts {
  members: number | null;
  online: number | null;
}

/** Mitglieder/online über die öffentliche Invite-API (ohne Bot, ohne Besucherdaten). */
export async function fetchInviteCounts(inviteCode: string): Promise<InviteCounts> {
  const res = await fetch(`${API}/invites/${encodeURIComponent(inviteCode)}?with_counts=true`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Discord-Invite-Abfrage fehlgeschlagen: ${res.status}`);
  const data = (await res.json()) as { approximate_member_count?: number; approximate_presence_count?: number };
  return { members: data.approximate_member_count ?? null, online: data.approximate_presence_count ?? null };
}

/** Invite-Code aus einer URL wie https://discord.gg/abc oder https://discord.com/invite/abc. */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]+)/.exec(url);
  return m?.[1] ?? null;
}

/** Absolute URL auf die Website (für Links in Embeds). */
export function siteUrl(path: string, origin?: string): string {
  const base = origin ?? import.meta.env.SITE ?? 'https://liga.example';
  return new URL(path, base).href;
}
