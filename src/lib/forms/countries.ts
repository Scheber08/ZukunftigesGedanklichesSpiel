/**
 * Länderliste für die Nationalität (Flagge) im Anmeldeformular: ISO-3166-Codes aus
 * country-flag-icons (dieselbe Quelle wie die Flaggen), Namen über Intl.DisplayNames.
 */
import { countries } from 'country-flag-icons';
import type { Lang } from '~/i18n/routes';

/** Keine Nationalitäten im engeren Sinn. */
// Keine Staaten: EU/UN sowie Pseudo-Regionen (XA/XB/XC/XO) aus country-flag-icons
const EXCLUDED = new Set(['EU', 'UN', 'XA', 'XB', 'XC', 'XO']);

const CODES: readonly string[] = countries.filter((c) => /^[A-Z]{2}$/.test(c) && !EXCLUDED.has(c));
const CODE_SET = new Set(CODES);

export function isKnownCountry(code: string | null | undefined): boolean {
  return code != null && CODE_SET.has(code.toUpperCase());
}

export interface CountryOption {
  value: string;
  label: string;
}

const cache = new Map<Lang, CountryOption[]>();

/** Alle Länder mit Namen in der Sprache, alphabetisch sortiert. */
export function countryOptions(lang: Lang): CountryOption[] {
  const hit = cache.get(lang);
  if (hit) return hit;
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  const names = new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' });
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  const list = CODES.map((code) => ({ value: code, label: safeName(names, code) }))
    // Unbekannte Codes (Name = Code) weglassen
    .filter((o) => o.label !== o.value)
    .sort((a, b) => collator.compare(a.label, b.label));
  cache.set(lang, list);
  return list;
}

function safeName(names: Intl.DisplayNames, code: string): string {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
