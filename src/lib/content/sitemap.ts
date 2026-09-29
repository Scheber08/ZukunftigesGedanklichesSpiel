/**
 * sitemap.xml (Plan §4.10, §10): alle öffentlichen, indexierbaren Seiten beider Sprachen
 * mit hreflang-Alternativen. Ohne I/O – der Endpunkt src/pages/sitemap.xml.ts füllt sie.
 *
 * Nicht enthalten: Admin, APIs, Formular-Hilfsseiten (Vorfall melden), Zwischenstände
 * („Wertung nach Runde X“ = Snapshots), Downloads (ICS/CSV), der Stream ohne Kanal,
 * die aktuelle Regelwerk-Fassung unter /v/… (Duplikat der Hauptseite) und Entwürfe.
 */
import { alternates, type Alternates, type RouteName } from '~/i18n';
import type { League } from '~/lib/league/league';
import { escapeHtml } from '~/lib/util/html';
import { newsAlternates } from './news';
import { rulesUpdatedAt } from './rules';

export interface SitemapPage {
  alternates: Alternates;
  /** ISO-Zeitpunkt der letzten Änderung (optional) */
  lastmod?: string | null;
}

export type LegalDoc = 'imprint' | 'privacy' | 'terms';

export interface SitemapOptions {
  /** Stream-Seite nur, wenn ein Twitch-Kanal eingetragen ist (Plan §8.2). */
  includeStream: boolean;
  /** Rechtstexte mit Stand; Entwürfe (draft) werden ausgelassen. */
  legal?: Partial<Record<LegalDoc, { updated: string | null; draft: boolean }>>;
}

/** Statische Seiten, die immer in die Sitemap gehören. */
export const STATIC_SITEMAP_ROUTES = [
  'home',
  'calendar',
  'results',
  'standings',
  'drivers',
  'teams',
  'stewards',
  'news',
  'rules',
  'lobby',
  'faq',
  'about',
  'partners',
  'hallOfFame',
  'archive',
  'join',
  'contact',
] as const satisfies readonly RouteName[];

function maxIso(...values: Array<string | null | undefined>): string | null {
  return values.reduce<string | null>((max, v) => (v && (max == null || v > max) ? v : max), null);
}

/** Alle Seiten aus den Liga-Daten sammeln (ohne Duplikate). */
export function collectSitemapPages(league: League, opts: SitemapOptions): SitemapPage[] {
  const pages: SitemapPage[] = [];
  const seen = new Set<string>();
  const add = (alt: Alternates, lastmod?: string | null) => {
    if (seen.has(alt.de)) return;
    seen.add(alt.de);
    pages.push({ alternates: alt, lastmod: lastmod ?? null });
  };

  const rulesVersion = league.rulesVersion;
  const staticLastmod: Partial<Record<RouteName, string | null>> = {
    news: league.lastUpdated(league.news),
    rules: rulesVersion ? rulesUpdatedAt(league, rulesVersion) : null,
    lobby: league.currentSeason?.updated_at ?? null,
    faq: league.lastUpdated(league.faq),
    about: league.lastUpdated([...league.staff, ...league.openPositions]),
    partners: league.lastUpdated(league.partners),
    stewards: league.lastUpdated(league.decisions),
  };
  for (const route of STATIC_SITEMAP_ROUTES) add(alternates(route), staticLastmod[route]);

  // Rechtstexte (Entwürfe nicht)
  for (const doc of ['imprint', 'privacy', 'terms'] as const) {
    const info = opts.legal?.[doc];
    if (info?.draft) continue;
    add(alternates(doc), info?.updated ?? null);
  }

  if (opts.includeStream) add(alternates('stream'));

  // Rennseiten: alle Runden der Saisons mit Ergebnissen plus der aktuellen Saison
  const seasons = new Map(league.archiveSeasons.map((s) => [s.id, s]));
  const current = league.currentSeason;
  if (current) seasons.set(current.id, current);
  for (const season of [...seasons.values()].sort((a, b) => a.number - b.number)) {
    for (const round of league.roundsOf(season.id)) {
      add(alternates('race', { season: season.slug, round: round.number }), maxIso(round.updated_at, round.final_at, round.provisional_at));
    }
  }

  // Saisonwertungen (Archiv)
  for (const season of league.archiveSeasons) {
    add(alternates('seasonStandings', { season: season.slug }), season.updated_at);
  }

  // Fahrer (pseudonymisierte ohne eigene Seite) und Teams
  for (const driver of league.drivers) {
    if (driver.anonymized) continue;
    add(alternates('driver', { slug: driver.slug }), driver.updated_at);
  }
  const teamIds = new Set(league.data.season_teams.map((st) => st.team_id));
  for (const team of league.data.teams) {
    if (!teamIds.has(team.id)) continue;
    add(alternates('team', { slug: team.slug }), team.updated_at);
  }

  // Steward-Entscheidungen
  for (const decision of league.decisions) {
    add(alternates('decision', { ref: decision.public_ref }), maxIso(decision.updated_at, decision.published_at));
  }

  // News
  for (const news of league.news) add(newsAlternates(news), news.updated_at);

  // Ältere Regelwerk-Fassungen (die gültige steht unter /liga/regelwerk)
  for (const version of league.rulesVersions) {
    if (version.id === rulesVersion?.id) continue;
    add(alternates('rulesVersion', { version: version.version }), rulesUpdatedAt(league, version));
  }

  return pages;
}

function w3cDate(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Sitemap-XML mit `xhtml:link`-Alternativen (de, en, x-default = de) je URL. */
export function buildSitemapXml(pages: readonly SitemapPage[], site: URL | string): string {
  const base = typeof site === 'string' ? new URL(site) : site;
  const abs = (path: string) => escapeHtml(new URL(path, base).href);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const page of pages) {
    const links = [
      `    <xhtml:link rel="alternate" hreflang="de" href="${abs(page.alternates.de)}" />`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${abs(page.alternates.en)}" />`,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(page.alternates.de)}" />`,
    ];
    const lastmod = page.lastmod ? w3cDate(page.lastmod) : null;
    for (const lang of ['de', 'en'] as const) {
      lines.push('  <url>');
      lines.push(`    <loc>${abs(page.alternates[lang])}</loc>`);
      if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
      lines.push(...links);
      lines.push('  </url>');
    }
  }
  lines.push('</urlset>', '');
  return lines.join('\n');
}
