/**
 * Strafenkatalog (Regelwerk §8.3, Codes V-01 … V-25) als Textbausteine für das
 * Entscheidungsformular (Plan §5.3). Quelle ist die Markdown-Tabelle im Regelwerk-Abschnitt.
 */
import type { Verdict } from '../../db/types';

export interface CatalogEntry {
  code: string;
  offence: string;
  standardPenalty: string;
  notes: string;
}

/** Anker des Abschnitts mit dem Strafenkatalog. */
export const CATALOG_ANCHOR = 'p8-3';
export const CATALOG_NUMBER = '§8.3';

function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

/** Liest alle Tabellenzeilen mit einem Code „V-nn“ aus Markdown. */
export function parsePenaltyCatalog(markdown: string): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const [code, offence = '', standardPenalty = '', notes = ''] = cells(line);
    if (!code || !/^V-\d{2}$/.test(code)) continue;
    out.push({ code, offence, standardPenalty, notes });
  }
  return out;
}

/** Vorschlag für die Art der Entscheidung aus der Regelstrafe (nur eindeutige Fälle). */
export function suggestVerdict(standardPenalty: string): { verdict: Verdict; timeSeconds?: number } | null {
  const s = standardPenalty.trim();
  const time = /^(\d+)\s*s$/i.exec(s);
  if (time) return { verdict: 'time_penalty', timeSeconds: Number(time[1]) };
  if (/^verwarnung$/i.test(s)) return { verdict: 'warning' };
  if (/^dsq$/i.test(s)) return { verdict: 'dsq' };
  if (/^positionsstrafe$/i.test(s)) return { verdict: 'position_penalty' };
  if (/^rennsperre$/i.test(s)) return { verdict: 'race_ban' };
  return null;
}

/** Textbaustein für die Begründung. */
export function catalogSnippet(entry: CatalogEntry): string {
  return `${entry.offence} (Strafenkatalog ${entry.code}, Regelstrafe: ${entry.standardPenalty}).`;
}
