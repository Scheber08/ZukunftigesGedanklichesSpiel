/**
 * Kleine Anzeige-Helfer für Seiten und Komponenten (keine I/O).
 */
import type { Lang } from '~/i18n';
import type { RoundRow, SeasonRow, TeamRow, TrackRow } from '~/lib/db/types';
import { formatLapTime } from '~/lib/domain/laptime';

const regionNames = new Map<Lang, Intl.DisplayNames>();

/** Ländername aus ISO-Code, z. B. "DE" → "Deutschland" / "Germany". */
export function countryName(code: string | null | undefined, lang: Lang): string {
  if (!code) return '';
  let dn = regionNames.get(lang);
  if (!dn) {
    dn = new Intl.DisplayNames([lang === 'de' ? 'de' : 'en'], { type: 'region' });
    regionNames.set(lang, dn);
  }
  try {
    return dn.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function trackName(track: Pick<TrackRow, 'name_de' | 'name_en'> | undefined, lang: Lang): string {
  if (!track) return '';
  return lang === 'de' ? track.name_de : track.name_en;
}

/** „R5 · Suzuka“ – keine offiziellen Event-Titel (Plan §9.1). */
export function roundLabel(round: Pick<RoundRow, 'number'>, track: Pick<TrackRow, 'name_de' | 'name_en'> | undefined, lang: Lang): string {
  return `R${round.number} · ${trackName(track, lang)}`;
}

/**
 * Saisonname. Der Name wird in der DB deutsch gepflegt; das Standardmuster „Saison N“
 * (auch mit Zusatz, z. B. „Saison 2 · 2026/27“) wird für EN übersetzt.
 */
export function seasonLabel(season: Pick<SeasonRow, 'number' | 'name'>, lang: Lang): string {
  const name = season.name?.trim() || `Saison ${season.number}`;
  return lang === 'en' ? name.replace(/^Saison(?= |$)/, 'Season') : name;
}

/** CSS-Variable für den Teamstreifen. */
export function teamStyle(team: Pick<TeamRow, 'color_hex'> | undefined | null): string {
  return team ? `--team-color: ${team.color_hex}` : '';
}

/** Startnummer mit # für Anzeigen. */
export function numberLabel(n: number | null | undefined): string {
  return n == null ? '–' : String(n);
}

export function formatPoints(points: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB').format(points);
}

export function formatPercent(value: number | null, lang: Lang): string {
  if (value == null) return '–';
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', { style: 'percent', maximumFractionDigits: 0 }).format(value);
}

export function formatDecimal(value: number | null, lang: Lang, digits = 1): string {
  if (value == null) return '–';
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export { formatLapTime };

/** Sichere Ganzzahl aus einem Routen-Parameter. */
export function intParam(value: string | undefined): number | null {
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  return Number(value);
}

/** Breadcrumb-JSON-LD (Plan §10). */
export function breadcrumbJsonLd(site: URL, items: Array<{ name: string; href: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: new URL(item.href, site).href,
    })),
  };
}
