/**
 * CSV-Export der Fahrerwertung (Plan §4.4): UTF-8 mit BOM, Semikolon-getrennt,
 * CRLF-Zeilenenden (öffnet sich in Excel mit deutscher Ländereinstellung direkt richtig),
 * Felder nach RFC 4180 gequotet und gegen Formel-Injection abgesichert.
 */

import type { UiKey, TParams } from '~/i18n';
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

/** Spaltenköpfe der Fahrerwertung. */
export const CSV_COLUMNS = [
  'standingsPage.csv.position',
  'standingsPage.csv.number',
  'standingsPage.csv.gamertag',
  'standingsPage.csv.team',
  'standingsPage.csv.points',
  'standingsPage.csv.wins',
  'standingsPage.csv.podiums',
  'standingsPage.csv.poles',
  'standingsPage.csv.fastestLaps',
] as const satisfies readonly UiKey[];

/**
 * Fahrerwertung einer Saison als CSV. Startnummern nach derselben Regel wie auf der Seite
 * (`standingsNumbersAt`): abgeschlossene Saison → Nummer zur letzten gewerteten Runde,
 * laufende Saison → aktuelle Nummer.
 */
export function driverStandingsCsv(league: League, seasonId: Id, t: Translate): string {
  const standings = league.driverStandings(seasonId);
  const season = league.season(seasonId);
  const at = season ? standingsNumbersAt(league, season) : null;

  const rows = standings.map((s) => [
    s.position,
    standingsNumber(league, s.driverId, at),
    league.driverName(s.driverId, 'de'),
    s.teamId != null ? (league.team(s.teamId)?.name ?? '') : '',
    s.points,
    s.wins,
    s.podiums,
    s.poles,
    s.fastestLaps,
  ]);
  return csvDocument([CSV_COLUMNS.map((key) => t(key)), ...rows]);
}

/** Dateiname für den Download, z. B. „wertung-saison-2.csv“. */
export function csvFileName(seasonSlug: string): string {
  const safe = seasonSlug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'saison';
  return `wertung-saison-${safe}.csv`;
}
