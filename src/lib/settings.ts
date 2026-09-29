/**
 * Einstellungen (Tabelle `settings`, Schlüssel → JSON). Öffentliche Schlüssel sind per RLS
 * lesbar und landen im statischen Build; private nur über den Service-Key.
 */

export type RegistrationState = 'open' | 'waitlist' | 'closed';

export interface PublicSettings {
  /** Discord-Einladung für die Website (eigener dauerhafter Invite je Quelle, Plan §8.1). */
  discord_invite: { url: string | null; code: string | null };
  socials: { instagram: string | null; tiktok: string | null; youtube: string | null };
  /** Leer = Stream-Anzeige ausgeblendet (Plan §8.2). */
  twitch_channel: string | null;
  /** Leer = kein Google Analytics, auch nicht nach Einwilligung. */
  ga_measurement_id: string | null;
  registration: {
    state: RegistrationState;
    free_seats: number;
    free_reserve: number;
    note_de: string | null;
    note_en: string | null;
  };
  home: { claim_de: string; claim_en: string };
  /** Vom Cron-Job gepflegt. */
  live_status: { live: boolean; title: string | null; started_at: string | null; checked_at: string | null };
  /** Vom Server gecacht (Invite-API mit with_counts). */
  discord_counts: { members: number | null; online: number | null; checked_at: string | null };
}

export interface PrivateSettings {
  /** Webhook-URLs je Channel – nur dem Server bekannt. */
  webhooks: {
    registrations: string | null;
    lineup: string | null;
    results: string | null;
    incidents: string | null;
    decisions: string | null;
    news: string | null;
    contact: string | null;
  };
  /** Discord-Rollen-IDs je App-Rolle. */
  discord_role_map: { admin: string[]; steward: string[]; redakteur: string[] };
  /** Discord-Invites je Quelle für die Statistik (Website, Instagram, TikTok, YouTube). */
  discord_invites: { website: string | null; instagram: string | null; tiktok: string | null; youtube: string | null };
  /** Gebündelter Rebuild (Plan §7.2). */
  rebuild: { requested_at: string | null; dispatched_at: string | null; reason: string | null };
}

export type SettingKey = keyof PublicSettings | keyof PrivateSettings;

export const PUBLIC_SETTING_KEYS = [
  'discord_invite',
  'socials',
  'twitch_channel',
  'ga_measurement_id',
  'registration',
  'home',
  'live_status',
  'discord_counts',
] as const satisfies ReadonlyArray<keyof PublicSettings>;

export const PRIVATE_SETTING_KEYS = [
  'webhooks',
  'discord_role_map',
  'discord_invites',
  'rebuild',
] as const satisfies ReadonlyArray<keyof PrivateSettings>;

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  discord_invite: { url: null, code: null },
  socials: { instagram: null, tiktok: null, youtube: null },
  twitch_channel: null,
  ga_measurement_id: null,
  registration: { state: 'open', free_seats: 22, free_reserve: 8, note_de: null, note_en: null },
  home: {
    claim_de: 'Crossplay-Liga für EA SPORTS F1® 25 · 22 Cockpits · faire Rennen',
    claim_en: 'Crossplay league for EA SPORTS F1® 25 · 22 cockpits · fair racing',
  },
  live_status: { live: false, title: null, started_at: null, checked_at: null },
  discord_counts: { members: null, online: null, checked_at: null },
};

export const DEFAULT_PRIVATE_SETTINGS: PrivateSettings = {
  webhooks: {
    registrations: null,
    lineup: null,
    results: null,
    incidents: null,
    decisions: null,
    news: null,
    contact: null,
  },
  discord_role_map: { admin: [], steward: [], redakteur: [] },
  discord_invites: { website: null, instagram: null, tiktok: null, youtube: null },
  rebuild: { requested_at: null, dispatched_at: null, reason: null },
};

/** Liest die Einstellungen aus Zeilen und füllt fehlende Schlüssel mit Defaults auf. */
export function parsePublicSettings(rows: ReadonlyArray<{ key: string; value: unknown }>): PublicSettings {
  const out: Record<string, unknown> = structuredClone(DEFAULT_PUBLIC_SETTINGS);
  for (const r of rows) {
    if ((PUBLIC_SETTING_KEYS as readonly string[]).includes(r.key)) {
      const def = out[r.key];
      out[r.key] =
        def && typeof def === 'object' && r.value && typeof r.value === 'object'
          ? { ...def, ...(r.value as object) }
          : r.value;
    }
  }
  return out as unknown as PublicSettings;
}

export function parsePrivateSettings(rows: ReadonlyArray<{ key: string; value: unknown }>): PrivateSettings {
  const out: Record<string, unknown> = structuredClone(DEFAULT_PRIVATE_SETTINGS);
  for (const r of rows) {
    if ((PRIVATE_SETTING_KEYS as readonly string[]).includes(r.key)) {
      const def = out[r.key];
      out[r.key] = def && typeof def === 'object' && r.value && typeof r.value === 'object' ? { ...def, ...(r.value as object) } : r.value;
    }
  }
  return out as unknown as PrivateSettings;
}
