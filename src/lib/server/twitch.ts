/**
 * Twitch-Live-Status (Plan §8.2, vorbereitet): Nur wenn ein Kanal eingetragen ist,
 * fragt der Cron-Job die Helix-API ab. Client-Secret bleibt serverseitig.
 */
import type { Store } from '../db/store';
import type { PublicSettings } from '../settings';
import { env } from './env';
import { patchSetting, readPrivateSettings, readPublicSettings } from './settings';

async function appToken(store: Store): Promise<string | null> {
  if (!env.twitchClientId || !env.twitchClientSecret) return null;
  const { twitch_token } = await readPrivateSettings(store);
  if (twitch_token.access_token && twitch_token.expires_at && new Date(twitch_token.expires_at).getTime() > Date.now() + 3_600_000) {
    return twitch_token.access_token;
  }
  const body = new URLSearchParams({
    client_id: env.twitchClientId,
    client_secret: env.twitchClientSecret,
    grant_type: 'client_credentials',
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body });
  if (!res.ok) throw new Error(`Twitch-Token fehlgeschlagen: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  await patchSetting(store, 'twitch_token', {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  });
  return data.access_token;
}

/** Normalisiert Eingaben wie "https://twitch.tv/kanal" oder "@kanal" zu "kanal". */
export function twitchLogin(channel: string | null | undefined): string | null {
  if (!channel) return null;
  const m = /(?:twitch\.tv\/)?@?([A-Za-z0-9_]{3,25})\/?$/.exec(channel.trim());
  return m?.[1]?.toLowerCase() ?? null;
}

/** Live-Status prüfen und nur bei Änderung speichern. */
export async function refreshLiveStatus(store: Store): Promise<PublicSettings['live_status'] | null> {
  const settings = await readPublicSettings(store);
  const login = twitchLogin(settings.twitch_channel);
  if (!login) {
    if (settings.live_status.live) await patchSetting(store, 'live_status', { live: false, title: null, started_at: null, checked_at: new Date().toISOString() });
    return null;
  }
  const token = await appToken(store);
  if (!token) return null;
  const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, {
    headers: { 'client-id': env.twitchClientId!, authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Twitch-Status fehlgeschlagen: ${res.status}`);
  const data = (await res.json()) as { data?: Array<{ title?: string; started_at?: string }> };
  const stream = data.data?.[0];
  const next = { live: Boolean(stream), title: stream?.title ?? null, started_at: stream?.started_at ?? null };
  const prev = settings.live_status;
  if (prev.live !== next.live || prev.title !== next.title) {
    await patchSetting(store, 'live_status', { ...next, checked_at: new Date().toISOString() });
  }
  return { ...next, checked_at: new Date().toISOString() };
}
