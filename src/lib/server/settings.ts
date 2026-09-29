/**
 * Private und öffentliche Einstellungen lesen/schreiben (nur serverseitig, Service-Store).
 */
import type { Store } from '../db/store';
import {
  DEFAULT_PRIVATE_SETTINGS,
  DEFAULT_PUBLIC_SETTINGS,
  parsePrivateSettings,
  parsePublicSettings,
  PUBLIC_SETTING_KEYS,
  type PrivateSettings,
  type PublicSettings,
} from '../settings';

export async function readPrivateSettings(store: Store): Promise<PrivateSettings> {
  const rows = await store.select('settings', { eq: { is_public: false } });
  return parsePrivateSettings(rows);
}

export async function readPublicSettings(store: Store): Promise<PublicSettings> {
  const rows = await store.select('settings', { eq: { is_public: true } });
  return parsePublicSettings(rows);
}

type AnyKey = keyof PublicSettings | keyof PrivateSettings;

/** Einen Einstellungs-Schlüssel setzen (Upsert, is_public nach Schlüssel). */
export async function writeSetting<K extends AnyKey>(
  store: Store,
  key: K,
  value: K extends keyof PublicSettings ? PublicSettings[K] : K extends keyof PrivateSettings ? PrivateSettings[K] : never,
): Promise<void> {
  const isPublic = (PUBLIC_SETTING_KEYS as readonly string[]).includes(key);
  await store.upsert('settings', [{ key, value, is_public: isPublic }], ['key']);
}

/** Teil-Update eines Objekt-Schlüssels (z. B. rebuild.requested_at). */
export async function patchSetting<K extends AnyKey>(store: Store, key: K, patch: Record<string, unknown>): Promise<void> {
  const isPublic = (PUBLIC_SETTING_KEYS as readonly string[]).includes(key);
  const [row] = await store.select('settings', { eq: { key } });
  const defaults = (isPublic ? DEFAULT_PUBLIC_SETTINGS : DEFAULT_PRIVATE_SETTINGS) as unknown as Record<string, unknown>;
  const base = (row?.value ?? defaults[key] ?? {}) as Record<string, unknown>;
  await store.upsert('settings', [{ key, value: { ...base, ...patch }, is_public: isPublic }], ['key']);
}
