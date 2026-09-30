/**
 * Alle öffentlichen Routen mit übersetzten Slugs (Plan §4.1).
 * Deutsch ohne Präfix, Englisch unter /en/…
 */

export type Lang = 'de' | 'en';
export const LANGS: readonly Lang[] = ['de', 'en'];
export const DEFAULT_LANG: Lang = 'de';

export const ROUTES = {
  home: { de: '/', en: '/en' },
  calendar: { de: '/kalender', en: '/en/calendar' },
  calendarIcs: { de: '/kalender.ics', en: '/en/calendar.ics' },
  race: { de: '/rennen/{season}/{round}', en: '/en/races/{season}/{round}' },
  raceIcs: { de: '/rennen/{season}/{round}.ics', en: '/en/races/{season}/{round}.ics' },
  results: { de: '/ergebnisse', en: '/en/results' },
  standings: { de: '/wertung', en: '/en/standings' },
  seasonStandings: { de: '/saison/{season}/wertung', en: '/en/season/{season}/standings' },
  standingsAfter: { de: '/saison/{season}/wertung/nach-runde-{round}', en: '/en/season/{season}/standings/after-round-{round}' },
  standingsCsv: { de: '/saison/{season}/wertung.csv', en: '/en/season/{season}/standings.csv' },
  drivers: { de: '/fahrer', en: '/en/drivers' },
  driver: { de: '/fahrer/{slug}', en: '/en/drivers/{slug}' },
  driverCompare: { de: '/fahrer/vergleich', en: '/en/drivers/compare' },
  teams: { de: '/teams', en: '/en/teams' },
  team: { de: '/teams/{slug}', en: '/en/teams/{slug}' },
  stewards: { de: '/stewards', en: '/en/stewards' },
  stewardsReport: { de: '/stewards/melden', en: '/en/stewards/report' },
  decision: { de: '/stewards/{ref}', en: '/en/stewards/{ref}' },
  news: { de: '/news', en: '/en/news' },
  newsArticle: { de: '/news/{slug}', en: '/en/news/{slug}' },
  newsRss: { de: '/news/rss.xml', en: '/en/news/rss.xml' },
  rules: { de: '/liga/regelwerk', en: '/en/league/rules' },
  rulesVersion: { de: '/liga/regelwerk/v/{version}', en: '/en/league/rules/v/{version}' },
  lobby: { de: '/liga/lobby', en: '/en/league/lobby' },
  faq: { de: '/liga/faq', en: '/en/league/faq' },
  about: { de: '/liga/ueber-uns', en: '/en/league/about' },
  partners: { de: '/liga/partner', en: '/en/league/partners' },
  tracks: { de: '/strecken', en: '/en/tracks' },
  track: { de: '/strecken/{slug}', en: '/en/tracks/{slug}' },
  hallOfFame: { de: '/hall-of-fame', en: '/en/hall-of-fame' },
  archive: { de: '/archiv', en: '/en/archive' },
  join: { de: '/mitfahren', en: '/en/join' },
  stream: { de: '/stream', en: '/en/stream' },
  contact: { de: '/kontakt', en: '/en/contact' },
  imprint: { de: '/impressum', en: '/en/imprint' },
  privacy: { de: '/datenschutz', en: '/en/privacy' },
  terms: { de: '/teilnahmebedingungen', en: '/en/terms' },
} as const satisfies Record<string, Record<Lang, string>>;

export type RouteName = keyof typeof ROUTES;
export type RouteParams = Record<string, string | number>;

/** Pfad einer Route in einer Sprache, Parameter werden URL-kodiert eingesetzt. */
export function url(lang: Lang, route: RouteName, params: RouteParams = {}): string {
  let path: string = ROUTES[route][lang];
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
  }
  if (path.includes('{')) throw new Error(`Fehlender Parameter für Route ${route}: ${path}`);
  return path;
}

/** Sprachvarianten einer Seite (für Sprachumschalter und hreflang). */
export type Alternates = Record<Lang, string>;

export function alternates(route: RouteName, params: RouteParams | Record<Lang, RouteParams> = {}): Alternates {
  const isPerLang = 'de' in params && typeof params.de === 'object';
  const p = (lang: Lang) => (isPerLang ? (params as Record<Lang, RouteParams>)[lang] : (params as RouteParams));
  return { de: url('de', route, p('de')), en: url('en', route, p('en')) };
}

/** Sprache aus einem Pfad ableiten. */
export function langFromPath(pathname: string): Lang {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'de';
}
