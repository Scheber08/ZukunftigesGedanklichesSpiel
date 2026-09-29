/**
 * Rechtstexte aus der Content Collection `legal` (src/content/legal/<lang>/<datei>.md),
 * siehe src/content.config.ts und Plan §9.2.
 */
import { getEntry, render, type CollectionEntry } from 'astro:content';
import type { Lang } from '~/i18n';
import type { LegalDoc } from './sitemap';

export type { LegalDoc };

/** Dateiname je Dokument und Sprache (entspricht den übersetzten Slugs). */
export const LEGAL_FILES: Record<LegalDoc, Record<Lang, string>> = {
  imprint: { de: 'impressum', en: 'imprint' },
  privacy: { de: 'datenschutz', en: 'privacy' },
  terms: { de: 'teilnahmebedingungen', en: 'terms' },
};

export const LEGAL_DOCS = Object.keys(LEGAL_FILES) as LegalDoc[];

export function legalEntryId(doc: LegalDoc, lang: Lang): string {
  return `${lang}/${LEGAL_FILES[doc][lang]}`;
}

export async function getLegalEntry(doc: LegalDoc, lang: Lang): Promise<CollectionEntry<'legal'> | undefined> {
  return getEntry('legal', legalEntryId(doc, lang));
}

export async function renderLegal(entry: CollectionEntry<'legal'>) {
  return render(entry);
}

/** Stand und Entwurfsstatus aller Rechtstexte in einer Sprache (für die Sitemap). */
export async function legalStatus(lang: Lang = 'de'): Promise<Record<LegalDoc, { updated: string | null; draft: boolean }>> {
  const out = {} as Record<LegalDoc, { updated: string | null; draft: boolean }>;
  for (const doc of LEGAL_DOCS) {
    const entry = await getLegalEntry(doc, lang);
    out[doc] = entry ? { updated: entry.data.updated.toISOString(), draft: entry.data.draft } : { updated: null, draft: true };
  }
  return out;
}
