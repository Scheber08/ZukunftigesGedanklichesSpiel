/**
 * Markdown aus der Datenbank (News, Regelwerk, FAQ, Begründungen) → HTML.
 * Rohes HTML wird NICHT durchgelassen (escaped), Links nur http(s)/mailto/relativ.
 * Läuft serverseitig (Build) und im Admin-Browser für die Vorschau.
 */
import { Marked, type Tokens } from 'marked';
import { escapeHtml } from './html';

const SAFE_URL = /^(https?:|mailto:|\/(?!\/)|#|\.{0,2}\/)/i;

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
  const text = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}
