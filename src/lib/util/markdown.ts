/**
 * Markdown aus der Datenbank (News, Regelwerk, FAQ, Begründungen) → HTML.
 * Rohes HTML wird NICHT durchgelassen (escaped), Links nur http(s)/mailto/relativ.
 * Läuft serverseitig (Build) und im Admin-Browser für die Vorschau.
 */
import { Marked, type Tokens } from 'marked';
import { escapeHtml } from './html';

const SAFE_URL = /^(https?:|mailto:|\/(?!\/)|#|\.{1,2}\/)/i;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed === '' || !SAFE_URL.test(trimmed)) return null;
  return trimmed;
}

function isExternal(href: string): boolean {
  return /^https?:/i.test(href);
}

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(token.text);
    },
    link(token: Tokens.Link): string {
      const text = this.parser.parseInline(token.tokens);
      const href = safeHref(token.href);
      if (!href) return text;
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      const ext = isExternal(href) ? ' rel="noopener" target="_blank"' : '';
      return `<a href="${escapeHtml(href)}"${title}${ext}>${text}</a>`;
    },
    image(token: Tokens.Image): string {
      const href = safeHref(token.href);
      if (!href) return escapeHtml(token.text);
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(token.text)}" loading="lazy" decoding="async">`;
    },
    table(token: Tokens.Table): string {
      const header = token.header
        .map((cell) => `<th scope="col"${cell.align ? ` style="text-align:${cell.align}"` : ''}>${this.parser.parseInline(cell.tokens)}</th>`)
        .join('');
      const rows = token.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell) => `<td${cell.align ? ` style="text-align:${cell.align}"` : ''}>${this.parser.parseInline(cell.tokens)}</td>`)
              .join('')}</tr>`,
        )
        .join('');
      return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
    },
  },
});

/** Markdown → HTML (Blockebene). */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return '';
  return marked.parse(source, { async: false }) as string;
}

/** Markdown → HTML ohne umschließende Absätze (für kurze Texte in Zeilen). */
export function renderMarkdownInline(source: string | null | undefined): string {
  if (!source) return '';
  return marked.parseInline(source, { async: false }) as string;
}

/** Markdown → reiner Text (für Meta-Descriptions, Discord, RSS-Teaser). */
export function markdownToText(source: string | null | undefined, maxLength = 200): string {
  if (!source) return '';
  // Nur Markdown-Syntax entfernen – Zeichen innerhalb von Wörtern (Oversteer_Olli, V-02, #10) bleiben
  const text = source
    .replace(/```[\s\S]*?```/g, ' ') // Codeblöcke
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // Bilder → Alt-Text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // Links → Linktext
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '') // Überschriften
    .replace(/^[ \t]{0,3}>[ \t]?/gm, '') // Zitate
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, '') // Listenpunkte
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, ' ') // Trennlinien
    .replace(/^[ \t]*\|?(?:[ \t]*:?-{3,}:?[ \t]*\|)+[ \t]*(?::?-{3,}:?)?[ \t]*$/gm, ' ') // Tabellen-Trennzeilen
    .replace(/[ \t]*\|[ \t]*/g, ' ') // Tabellenspalten
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2') // fett
    .replace(/(^|[^\p{L}\p{N}*_])([*_])(?=\S)([^\n]*?\S)\2(?![\p{L}\p{N}*_])/gu, '$1$3') // kursiv
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1') // durchgestrichen
    .replace(/`([^`\n]*)`/g, '$1') // Inline-Code
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
