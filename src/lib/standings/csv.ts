/**
 * CSV-Export der Fahrerwertung (Plan §4.4): UTF-8 mit BOM, Semikolon-getrennt,
 * CRLF-Zeilenenden (öffnet sich in Excel mit deutscher Ländereinstellung direkt richtig),
 * Felder nach RFC 4180 gequotet und gegen Formel-Injection abgesichert.
 */

import { url, useT, type Lang, type UiKey, type TParams } from '~/i18n';
import type { Id } from '~/lib/db/types';
import type { League } from '~/lib/league/league';
import { standingsNumber, standingsNumbersAt } from './page';

/** Byte Order Mark – damit Excel die Datei als UTF-8 erkennt (kein \u-Escape im Quelltext). */
export const BOM = String.fromCharCode(0xfeff);
export const CSV_SEPARATOR = ';';
const CRLF = '\r\n';

/**
 * Ein CSV-Feld. Zahlen bleiben unverändert; Texte werden gequotet, wenn sie Trennzeichen,
 * Anführungszeichen, Zeilenumbrüche oder Rand-Leerzeichen enthalten. Texte, die mit
 * =, +, -, @, Tab oder CR beginnen, bekommen ein ' vorangestellt, damit Tabellen-
 * programme sie nicht als Formel ausführen (Gamertags sind Nutzereingaben).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text) || text !== text.trim()) {
    text = `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function csvRow(values: ReadonlyArray<string | number | null | undefined>): string {
  return values.map(csvCell).join(CSV_SEPARATOR);
}

/** Komplette Datei aus Zeilen: BOM + CRLF + abschließender Zeilenumbruch. */
export function csvDocument(rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return BOM + rows.map(csvRow).join(CRLF) + CRLF;
}

type Translate = (key: UiKey, params?: TParams) => string;

/** Spaltenköpfe der Fahrerwertung (wie die Tabelle auf der Seite, Rückstand als positive Zahl). */
export const CSV_COLUMNS = [
  'standingsPage.csv.position',
  'standingsPage.csv.number',
  'standingsPage.csv.gamertag',
  'standingsPage.csv.team',
  'standingsPage.csv.points',
  'standingsPage.csv.behind',
  'standingsPage.csv.wins',
  'standingsPage.csv.podiums',
  'standingsPage.csv.poles',
  'standingsPage.csv.fastestLaps',
  'standingsPage.csv.reserve',
] as const satisfies readonly UiKey[];

/**
 * Fahrerwertung einer Saison als CSV in der Sprache der Seite. Startnummer und Reserve-Kennzeichen
 * nach derselben Regel wie auf der Seite (`standingsNumbersAt`): abgeschlossene Saison → Stand der
 * letzten gewerteten Runde (Reserve = alle Starts als Ersatzfahrer), laufende Saison → aktueller Stand.
 */
export function driverStandingsCsv(league: League, seasonId: Id, t: Translate, lang: Lang = 'de'): string {
  const standings = league.driverStandings(seasonId);
  const season = league.season(seasonId);
  const at = season ? standingsNumbersAt(league, season) : null;
  const yes = t('standingsPage.csv.yes');

  const rows = standings.map((s) => {
    const reserve = at ? s.starts > 0 && s.reserveStarts === s.starts : league.driver(s.driverId)?.status === 'reserve';
    return [
      s.position,
      standingsNumber(league, s.driverId, at),
      league.driverName(s.driverId, lang),
      s.teamId != null ? (league.team(s.teamId)?.name ?? '') : '',
      s.points,
      s.gapToLeader,
      s.wins,
      s.podiums,
      s.poles,
      s.fastestLaps,
      reserve ? yes : '',
    ];
  });
  return csvDocument([CSV_COLUMNS.map((key) => t(key)), ...rows]);
}

/** Dateiname für den Download, z. B. „wertung-saison-2.csv“ bzw. „standings-season-2.csv“. */
export function csvFileName(seasonSlug: string, lang: Lang = 'de'): string {
  const fallback = lang === 'de' ? 'saison' : 'season';
  const safe = seasonSlug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
  return lang === 'de' ? `wertung-saison-${safe}.csv` : `standings-season-${safe}.csv`;
}

/**
 * Adresse des CSV-Exports. DE: Route 'standingsCsv'. EN: englische Spaltenköpfe unter
 * /en/season/[season]/standings.csv – solange 'standingsCsv' für EN noch auf die deutsche
 * Datei zeigt, wird die Adresse aus der Saison-Wertung abgeleitet.
 */
export function csvHref(lang: Lang, seasonSlug: string): string {
  const route = url(lang, 'standingsCsv', { season: seasonSlug });
  if (lang === 'de' || route !== url('de', 'standingsCsv', { season: seasonSlug })) return route;
  return `${url(lang, 'seasonStandings', { season: seasonSlug })}.csv`;
}

/** Antwort des CSV-Endpunkts (DE und EN): Datei als Download, unbekannte Saison → 404. */
export function csvResponse(league: League, seasonSlug: string, lang: Lang): Response {
  const season = league.seasonBySlug(seasonSlug);
  if (!season) return new Response('Not found', { status: 404 });
  return new Response(driverStandingsCsv(league, season.id, useT(lang), lang), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFileName(season.slug, lang)}"`,
    },
  });
}
