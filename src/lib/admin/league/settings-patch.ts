/**
 * Einstellungen mit Patch-Semantik schreiben (Plan §5 „Einstellungen“): Eine Action
 * überschreibt nur die Unterschlüssel eines Settings-JSON, die sie übermittelt. Andere Felder
 * – auch solche, die ein anderes Modul später ergänzt – bleiben erhalten. So können zwei
 * Formulare (z. B. Einstellungen → Anmeldestatus und Seiten-Inhalte → Texte) denselben
 * Schlüssel pflegen, ohne sich gegenseitig Felder zu löschen.
 */
import type { Store } from '~/lib/db/store';
import {
  DEFAULT_PRIVATE_SETTINGS,
  DEFAULT_PUBLIC_SETTINGS,
  PUBLIC_SETTING_KEYS,
  type PrivateSettings,
  type PublicSettings,
} from '~/lib/settings';

export type SettingKey = keyof PublicSettings | keyof PrivateSettings;
export type SettingValue<K extends SettingKey> = K extends keyof PublicSettings
  ? PublicSettings[K]
  : K extends keyof PrivateSettings
    ? PrivateSettings[K]
    : never;

/** Einfaches JSON-Objekt (kein Array, kein null)? */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Patch in einen gespeicherten Wert mischen:
 * - Unterschlüssel des Patches überschreiben, alle anderen bleiben erhalten,
 * - `undefined` im Patch heißt „nicht übermittelt“ (bleibt), `null` löscht den Wert bewusst,
 * - verschachtelte Objekte werden ebenso gemischt, Arrays und Einzelwerte ersetzt,
 * - ist der gespeicherte Wert kein Objekt (fehlt/ungültig), gilt der Standardwert als Basis.
 * Die Eingaben werden nicht verändert.
 */
export function mergeSettingPatch<T>(current: unknown, patch: Partial<T> | Record<string, unknown>, fallback?: T): T {
  const base: Record<string, unknown> = isPlainObject(current) ? current : isPlainObject(fallback) ? fallback : {};
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (value === undefined) continue;
    const prev = out[key];
    out[key] = isPlainObject(value) && isPlainObject(prev) ? mergeSettingPatch(prev, value) : structuredClone(value);
  }
  return out as T;
}

/** Nur die Unterschlüssel, die sich durch den Patch tatsächlich ändern (für das Audit-Log). */
export function changedKeys(before: unknown, after: unknown): string[] {
  const a = isPlainObject(before) ? before : {};
  const b = isPlainObject(after) ? after : {};
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
}

export function isPublicSettingKey(key: string): key is keyof PublicSettings {
  return (PUBLIC_SETTING_KEYS as readonly string[]).includes(key);
}

function defaultFor(key: SettingKey): unknown {
  const defaults = (isPublicSettingKey(key) ? DEFAULT_PUBLIC_SETTINGS : DEFAULT_PRIVATE_SETTINGS) as unknown as Record<string, unknown>;
  return defaults[key];
}

/**
 * Patch auf einen Objekt-Schlüssel anwenden (lesen, mischen, upserten). Liefert den Wert
 * vorher (inkl. Standardwerten) und nachher – die Action protokolliert beides. Ändert der
 * Patch nichts, wird nicht geschrieben (`changed: false`): So bleibt `updated_at` – z. B. der
 * „Stand“ des Anmeldestatus auf „Mitfahren“ – beim Speichern unveränderter Formulare stehen.
 */
export async function applySettingPatch<K extends SettingKey>(
  store: Store,
  key: K,
  patch: Partial<SettingValue<K>>,
): Promise<{ before: SettingValue<K>; after: SettingValue<K>; changed: boolean }> {
  const [row] = await store.select('settings', { eq: { key } });
  const fallback = defaultFor(key) as SettingValue<K>;
  const before = mergeSettingPatch<SettingValue<K>>(fallback, isPlainObject(row?.value) ? row.value : {}, fallback);
  const after = mergeSettingPatch<SettingValue<K>>(row?.value ?? fallback, patch as Record<string, unknown>, fallback);
  const changed = !row || changedKeys(row.value, after).length > 0;
  if (changed) await store.upsert('settings', [{ key, value: after, is_public: isPublicSettingKey(key) }], ['key']);
  return { before, after, changed };
}

/** Einzelwert-Schlüssel (z. B. Twitch-Kanal, GA-ID) komplett setzen. */
export async function writeSettingValue<K extends SettingKey>(
  store: Store,
  key: K,
  value: SettingValue<K>,
): Promise<{ before: SettingValue<K>; after: SettingValue<K>; changed: boolean }> {
  const [row] = await store.select('settings', { eq: { key } });
  const before = (row ? row.value : defaultFor(key)) as SettingValue<K>;
  const changed = !row || JSON.stringify(row.value) !== JSON.stringify(value);
  if (changed) await store.upsert('settings', [{ key, value, is_public: isPublicSettingKey(key) }], ['key']);
  return { before, after: value, changed };
}
