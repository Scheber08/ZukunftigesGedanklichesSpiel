/**
 * Partner (Plan §4.8): Ausschlussliste und URL-Prüfung.
 * Die Ausschlussliste ist ein Hinweis-System – Treffer müssen im Admin bewusst
 * bestätigt werden, damit niemand versehentlich einen unpassenden Partner einträgt.
 */

export interface ExclusionCategory {
  key: 'gambling' | 'betting' | 'skins' | 'alcohol' | 'crypto';
  label: string;
  patterns: RegExp[];
}

export const EXCLUSION_CATEGORIES: readonly ExclusionCategory[] = [
  {
    key: 'gambling',
    label: 'Glücksspiel',
    patterns: [/casino/i, /poker/i, /\bslots?\b/i, /gl(ü|ue)cksspiel/i, /\blotto\b/i, /roulette/i, /jackpot/i, /gambl/i, /spielothek/i],
  },
  {
    key: 'betting',
    label: 'Wetten',
    patterns: [/\bwett/i, /sportwett/i, /\bbet(s|ting)?\b/i, /buchmacher/i, /bookmaker/i, /\bodds\b/i, /tipico/i, /bwin/i],
  },
  {
    key: 'skins',
    label: 'Skins und Cases',
    patterns: [/\bskins?\b/i, /\bcases?\b/i, /case[- ]?opening/i, /loot ?box/i, /\bdrops?\b.*\bcs/i],
  },
  {
    key: 'alcohol',
    label: 'Alkohol',
    patterns: [/alkohol/i, /alcohol/i, /\bbier\b/i, /\bbeer\b/i, /brauerei/i, /brewery/i, /w[ou]dka/i, /whisk(e)?y/i, /\bgin\b/i, /\brum\b/i, /schnaps/i, /\bwein\b/i, /\bwine\b/i, /spirituose/i, /liquor/i, /energy[- ]?shot/i],
  },
  {
    key: 'crypto',
    label: 'Krypto',
    patterns: [/krypto/i, /crypto/i, /bitcoin/i, /\bbtc\b/i, /ethereum/i, /\bnfts?\b/i, /blockchain/i, /\bcoin\b/i, /exchange.*(token|coin)/i],
  },
];

/** Kategorien der Ausschlussliste, auf die ein Text hindeutet. */
export function exclusionHits(...texts: Array<string | null | undefined>): string[] {
  const haystack = texts.filter(Boolean).join('\n');
  if (haystack.trim() === '') return [];
  return EXCLUSION_CATEGORIES.filter((c) => c.patterns.some((p) => p.test(haystack))).map((c) => c.label);
}

/** Partner-Links: nur https (http wird auf https gehoben ist nicht sicher – daher abgelehnt). */
export function normalizePartnerUrl(input: string): string | null {
  const value = input.trim();
  if (value === '') return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    if (url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}
