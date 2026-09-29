/**
 * RSS 2.0 für die News (Plan §4.7). Reine Funktion ohne I/O – die Endpunkte
 * src/pages/news/rss.xml.ts und src/pages/en/news/rss.xml.ts füllen sie.
 */
import { escapeHtml } from '~/lib/util/html';

export interface RssItem {
  title: string;
  /** Absolute URL des Artikels */
  link: string;
  /** Kurzer Teaser als reiner Text */
  description: string;
  pubDate: Date | string;
  /** Standard: der Link (isPermaLink="true") */
  guid?: string;
  categories?: string[];
  /** Gamertag des Autors (dc:creator, da <author> eine E-Mail verlangt) */
  creator?: string | null;
  /** Sprache des Eintrags, falls sie von der des Feeds abweicht (fehlende Übersetzung) */
  language?: string | null;
}

export interface RssChannel {
  title: string;
  /** Absolute URL der News-Übersicht */
  link: string;
  description: string;
  /** z. B. "de-DE" oder "en-GB" */
  language: string;
  /** Absolute URL des Feeds selbst (atom:link rel="self") */
  selfUrl: string;
  lastBuildDate?: Date | string;
  /** Absolute URL eines quadratischen Logos */
  imageUrl?: string;
  items: RssItem[];
}

// Steuerzeichen sind in XML 1.0 nicht erlaubt (Tab, LF, CR ausgenommen).
const C = (n: number) => String.fromCharCode(n);
const XML_INVALID = new RegExp(`[${C(0)}-${C(8)}${C(11)}${C(12)}${C(14)}-${C(31)}${C(0xfffe)}${C(0xffff)}]`, 'g');

/** Text für XML: ungültige Zeichen entfernen und escapen. */
export function xmlText(value: string | null | undefined): string {
  return escapeHtml((value ?? '').replace(XML_INVALID, ''));
}

/** RFC-822-Datum, wie RSS es verlangt (z. B. "Tue, 29 Sep 2026 18:00:00 GMT"). */
export function rfc822(date: Date | string): string {
  return new Date(date).toUTCString();
}

export function buildRss(channel: RssChannel): string {
  const lastBuild =
    channel.lastBuildDate ??
    channel.items.reduce<string | null>((max, i) => {
      const iso = new Date(i.pubDate).toISOString();
      return max == null || iso > max ? iso : max;
    }, null);

  const items = channel.items.map((item) => {
    const guid = item.guid ?? item.link;
    const lines = [
      '    <item>',
      `      <title>${xmlText(item.title)}</title>`,
      `      <link>${xmlText(item.link)}</link>`,
      `      <guid isPermaLink="${guid === item.link ? 'true' : 'false'}">${xmlText(guid)}</guid>`,
      `      <pubDate>${rfc822(item.pubDate)}</pubDate>`,
      item.creator ? `      <dc:creator>${xmlText(item.creator)}</dc:creator>` : null,
      item.language ? `      <dc:language>${xmlText(item.language)}</dc:language>` : null,
      ...(item.categories ?? []).map((c) => `      <category>${xmlText(c)}</category>`),
      `      <description>${xmlText(item.description)}</description>`,
      '    </item>',
    ];
    return lines.filter((l): l is string => l != null).join('\n');
  });

  const head = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    <title>${xmlText(channel.title)}</title>`,
    `    <link>${xmlText(channel.link)}</link>`,
    `    <description>${xmlText(channel.description)}</description>`,
    `    <language>${xmlText(channel.language)}</language>`,
    `    <atom:link href="${xmlText(channel.selfUrl)}" rel="self" type="application/rss+xml" />`,
    lastBuild ? `    <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>` : null,
    '    <docs>https://www.rssboard.org/rss-specification</docs>',
    channel.imageUrl
      ? [
          '    <image>',
          `      <url>${xmlText(channel.imageUrl)}</url>`,
          `      <title>${xmlText(channel.title)}</title>`,
          `      <link>${xmlText(channel.link)}</link>`,
          '    </image>',
        ].join('\n')
      : null,
  ].filter((l): l is string => l != null);

  return [...head, ...items, '  </channel>', '</rss>', ''].join('\n');
}
