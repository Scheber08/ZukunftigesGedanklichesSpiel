/**
 * UI-Texte (Plan §7.4). Wörterbücher je Bereich in locales/<lang>/<bereich>.json,
 * flache Schlüssel mit Punkt-Notation. Der Typcheck unten meldet fehlende Schlüssel
 * in einer der beiden Sprachen (`astro check` / `npm run lint`).
 */

import deCommon from './locales/de/common.json';
import deContent from './locales/de/content.json';
import deForms from './locales/de/forms.json';
import deHome from './locales/de/home.json';
import deSport from './locales/de/sport.json';
import deStewards from './locales/de/stewards.json';
import enCommon from './locales/en/common.json';
import enContent from './locales/en/content.json';
import enForms from './locales/en/forms.json';
import enHome from './locales/en/home.json';
import enSport from './locales/en/sport.json';
import enStewards from './locales/en/stewards.json';
import type { Lang } from './routes';

export * from './routes';

const de = { ...deCommon, ...deHome, ...deSport, ...deStewards, ...deContent, ...deForms };
const en = { ...enCommon, ...enHome, ...enSport, ...enStewards, ...enContent, ...enForms };

export type UiKey = keyof typeof de;

// Typcheck: beide Sprachen müssen exakt dieselben Schlüssel haben.
const _enComplete: Record<UiKey, string> = en;
const _deComplete: Record<keyof typeof en, string> = de;
void _enComplete;
void _deComplete;

export const DICTIONARIES: Record<Lang, Record<UiKey, string>> = { de, en };

export type TParams = Record<string, string | number>;

/** Übersetzt einen Schlüssel und ersetzt {platzhalter}. */
export function t(lang: Lang, key: UiKey, params?: TParams): string {
  let text: string = DICTIONARIES[lang][key] ?? DICTIONARIES.de[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

/** Gebundene Übersetzungsfunktion für eine Sprache. */
export function useT(lang: Lang) {
  return (key: UiKey, params?: TParams) => t(lang, key, params);
}

export type T = ReturnType<typeof useT>;

/** Prüft, ob ein String ein bekannter Schlüssel ist (z. B. für Status-Werte aus der DB). */
export function isUiKey(key: string): key is UiKey {
  return key in de;
}
