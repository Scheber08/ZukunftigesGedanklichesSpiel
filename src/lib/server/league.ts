/**
 * Lädt alle öffentlichen Daten einmal pro Build (bzw. pro Änderung im Demo-Modus)
 * und stellt sie als `League` bereit.
 */

import type { Store } from '../db/store';
import { League, LEAGUE_TABLES, type LeagueDataset } from '../league/league';
import { parsePublicSettings, type PublicSettings } from '../settings';
import { getPublicStore, storeVersion } from './db';

let cached: { version: number; promise: Promise<League> } | undefined;

async function loadDataset(store: Store): Promise<LeagueDataset> {
  const entries = await Promise.all(
    LEAGUE_TABLES.map(async (table) => {
      const rows = await store.select(table);
      return [table, rows] as const;
    }),
  );
  const data = Object.fromEntries(entries) as unknown as LeagueDataset;
  // Doppelte Absicherung zusätzlich zur RLS: nur öffentliche Einstellungen
  data.settings = data.settings.filter((s) => s.is_public);
  return data;
}

/** Liga-Daten für öffentliche Seiten. Im Build einmal geladen und dann wiederverwendet. */
export function loadLeague(): Promise<League> {
  const version = storeVersion();
  if (!cached || cached.version !== version || import.meta.env.DEV) {
    const promise = loadDataset(getPublicStore()).then((data) => new League(data));
    promise.catch(() => {
      if (cached?.promise === promise) cached = undefined;
    });
    cached = { version, promise };
  }
  return cached.promise;
}

let settingsCache: { at: number; version: number; value: Promise<PublicSettings> } | undefined;
const SETTINGS_TTL_MS = 60_000;

/**
 * Nur die öffentlichen Einstellungen – für das Layout dynamischer Seiten (Formulare, Admin),
 * damit dort nicht die ganze Liga geladen werden muss. 60 s im Isolate gecacht.
 */
export function loadPublicSettings(): Promise<PublicSettings> {
  const version = storeVersion();
  const now = Date.now();
  if (!settingsCache || settingsCache.version !== version || now - settingsCache.at > SETTINGS_TTL_MS) {
    const value = getPublicStore()
      .select('settings', { eq: { is_public: true } })
      .then((rows) => parsePublicSettings(rows));
    value.catch(() => {
      if (settingsCache?.value === value) settingsCache = undefined;
    });
    settingsCache = { at: now, version, value };
  }
  return settingsCache.value;
}

/**
 * Liga-Daten direkt aus einem Store laden, ohne Cache – z. B. im Admin mit dem
 * Service-Store (enthält dann auch Entwürfe; die League-Klasse filtert öffentliche Sichten).
 */
export async function loadLeagueFrom(store: Store): Promise<League> {
  return new League(await loadDataset(store));
}
