/**
 * Helfer für das Regelwerk (Plan §4.8): Inhaltsverzeichnis, „Stand“, Übersetzungsstatus
 * und barrierearme, scrollbare Tabellen (Strafenkatalog). Ohne I/O.
 */
import { url, type Lang } from '~/i18n';
import type { RulesVersionRow } from '~/lib/db/types';
import { localized, type League, type RuleNode } from '~/lib/league/league';
import { escapeHtml } from '~/lib/util/html';

export interface FlatRule {
  node: RuleNode;
  level: number;
}

/** Baum in Dokument-Reihenfolge abflachen (für Inhaltsverzeichnis und Tests). */
export function flattenRuleTree(nodes: readonly RuleNode[], level = 0): FlatRule[] {
  return nodes.flatMap((node) => [{ node, level }, ...flattenRuleTree(node.children, level + 1)]);
}

/** Fehlt in EN bei irgendeinem Abschnitt Titel oder Text? */
export function rulesHaveFallback(nodes: readonly RuleNode[], lang: Lang): boolean {
  if (lang === 'de') return false;
  return flattenRuleTree(nodes).some(({ node }) => {
    const title = localized(node, 'title', lang);
    const body = localized(node, 'body', lang);
    return title.fallback || body.fallback;
  });
}

/** Letzte inhaltliche Änderung einer Fassung (Version selbst + alle Abschnitte). */
export function rulesUpdatedAt(league: League, version: RulesVersionRow): string | null {
  const sections = league.data.rules_sections.filter((s) => s.version_id === version.id);
  return league.lastUpdated([version, ...sections]);
}

/**
 * Link auf einen Paragraphen der gültigen Fassung (z. B. „p2-5“). Gibt es den Anker dort
 * nicht (mehr), führt der Link ohne Sprungmarke auf das Regelwerk.
 */
export function rulesHref(league: League, lang: Lang, anchor: string): string {
  const base = url(lang, 'rules');
  const version = league.rulesVersion;
  if (!version) return base;
  const exists = league.data.rules_sections.some((s) => s.version_id === version.id && s.anchor === anchor);
  return exists ? `${base}#${anchor}` : base;
}

/** Version aus dem URL-Parameter finden (z. B. "1.0"). */
export function findRulesVersion(league: League, version: string | undefined): RulesVersionRow | undefined {
  if (!version) return league.rulesVersion;
  return league.rulesVersions.find((v) => v.version === version);
}

/**
 * Fassungen für den Changelog: neueste Versionsnummer zuerst („1.10“ vor „1.9“).
 * Nicht nach Veröffentlichungsdatum, weil eine Fassung vorab mit späterem Datum
 * veröffentlicht sein kann als ihre Nachfolgerin.
 */
export function sortRulesVersions<T extends Pick<RulesVersionRow, 'version' | 'published_at'>>(versions: readonly T[]): T[] {
  return [...versions].sort(
    (a, b) =>
      b.version.localeCompare(a.version, 'de', { numeric: true, sensitivity: 'base' }) ||
      (b.published_at ?? '').localeCompare(a.published_at ?? ''),
  );
}

/** Erlaubte Zeichen im Versions-Parameter der URL. */
export function isValidVersionParam(version: string): boolean {
  return /^[0-9A-Za-z][0-9A-Za-z._-]{0,19}$/.test(version);
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tabellen aus `renderMarkdown()` zugänglich und responsiv machen:
 * - scrollbarer, per Tastatur fokussierbarer Bereich (role="region" mit Namen),
 * - `<caption>` (sichtbar nur für Screenreader),
 * - `data-label` je Zelle mit der Spaltenüberschrift (für schmale Ansichten),
 * - optional die erste Spalte als Zeilenkopf (`<th scope="row">`, z. B. Code im Strafenkatalog).
 * Rechnet mit der festen Ausgabe des eigenen Markdown-Renderers.
 */
export function enhanceTables(
  html: string,
  opts: { label: string; caption: string; className?: string; /** erste Spalte als Zeilenkopf (th scope="row") */ rowHeaders?: boolean },
): string {
  if (!html.includes('<table>')) return html;
  const cls = opts.className ?? 'md-table';
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (_match, inner: string) => {
    const headMatch = /<thead>([\s\S]*?)<\/thead>/.exec(inner);
    const headers = headMatch ? [...headMatch[1]!.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]!)) : [];
    const body = inner.replace(/<tbody>([\s\S]*?)<\/tbody>/, (_b, rows: string) => {
      const labelled = rows.replace(/<tr>([\s\S]*?)<\/tr>/g, (_r, cells: string) => {
        let i = 0;
        const withLabels = cells.replace(/<td\b/g, () => {
          const label = headers[i++];
          return label ? `<td data-label="${escapeHtml(label)}"` : '<td';
        });
        const row = opts.rowHeaders ? withLabels.replace(/^<td\b([^>]*)>([\s\S]*?)<\/td>/, '<th scope="row"$1>$2</th>') : withLabels;
        return `<tr>${row}</tr>`;
      });
      return `<tbody>${labelled}</tbody>`;
    });
    return (
      `<div class="${escapeHtml(cls)}" role="region" tabindex="0" aria-label="${escapeHtml(opts.label)}">` +
      `<table><caption class="sr-only">${escapeHtml(opts.caption)}</caption>${body}</table></div>`
    );
  });
}
