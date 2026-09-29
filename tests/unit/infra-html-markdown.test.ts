import { describe, expect, it } from 'vitest';
import { escapeHtml, safeJson } from '~/lib/util/html';
import { markdownToText, renderMarkdown, renderMarkdownInline } from '~/lib/util/markdown';

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('safeJson (JSON-LD ohne Ausbruch aus <script>)', () => {
  it('maskiert <, > und & als Unicode-Escape', () => {
    const out = safeJson({ name: '</script><script>alert(1)</script>', q: 'a & b' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('&');
    expect(out).toContain('\\u003c/script\\u003e');
    expect(out).toContain('\\u0026');
  });

  it('maskiert die JavaScript-Zeilentrenner U+2028/U+2029', () => {
    const out = safeJson({ text: `a${LS}b${PS}c` });
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('bleibt gültiges JSON mit identischem Inhalt', () => {
    const data = { a: '<b>&</b>', list: [1, 'x', null], nested: { t: `z${LS}` }, umlaut: 'Überholmanöver' };
    expect(JSON.parse(safeJson(data))).toEqual(data);
  });
});

describe('escapeHtml', () => {
  it('maskiert alle fünf HTML-Sonderzeichen', () => {
    expect(escapeHtml(`<a href="x" title='y'>Tom & Jerry</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;',
    );
  });

  it('maskiert & zuerst (keine doppelte Maskierung)', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    expect(escapeHtml('Ölwechsel')).toBe('Ölwechsel');
  });
});

describe('renderMarkdown – Sicherheit (Inhalte aus der DB)', () => {
  it('lässt kein rohes HTML durch', () => {
    const html = renderMarkdown('Hallo <script>alert(1)</script> und <img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img[^>]*onerror/i);
    expect(html).toContain('&lt;script&gt;');
  });

  it('maskiert HTML-Blöcke', () => {
    const html = renderMarkdown('<div onclick="evil()">Block</div>\n\nText');
    expect(html).not.toMatch(/<div/i);
    expect(html).toContain('&lt;div');
  });

  it('entfernt javascript:-, data:- und vbscript:-Links (Text bleibt)', () => {
    for (const href of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:msgbox(1)']) {
      const html = renderMarkdown(`[Klick](${href})`);
      expect(html, href).not.toMatch(/<a\b/);
      expect(html, href).toContain('Klick');
    }
  });

  it('blockiert protokoll-relative Links', () => {
    expect(renderMarkdown('[x](//evil.example/pfad)')).not.toMatch(/<a\b/);
  });

  it('erlaubt http(s), mailto, relative Pfade und Anker', () => {
    expect(renderMarkdown('[a](https://example.com)')).toContain('href="https://example.com"');
    expect(renderMarkdown('[b](mailto:kontakt@example.com)')).toContain('href="mailto:kontakt@example.com"');
    expect(renderMarkdown('[c](/liga/regelwerk#p3-4)')).toContain('href="/liga/regelwerk#p3-4"');
    expect(renderMarkdown('[d](#p5)')).toContain('href="#p5"');
  });

  it('öffnet externe Links sicher in neuem Tab, interne nicht', () => {
    const ext = renderMarkdown('[YouTube](https://www.youtube.com/@beispiel)');
    expect(ext).toContain('rel="noopener"');
    expect(ext).toContain('target="_blank"');
    const int = renderMarkdown('[Kalender](/kalender)');
    expect(int).not.toContain('target=');
  });

  it('maskiert Attribute in Linktiteln', () => {
    const html = renderMarkdown('[x](https://example.com "a\\" onmouseover=\\"alert(1)")');
    expect(html).not.toMatch(/onmouseover="alert/);
  });

  it('lässt Bilder nur mit sicherer Quelle zu, sonst Alt-Text', () => {
    expect(renderMarkdown('![Logo](/brand/logo.svg)')).toMatch(/<img src="\/brand\/logo.svg" alt="Logo" loading="lazy"/);
    const bad = renderMarkdown('![Böse](javascript:alert(1))');
    expect(bad).not.toMatch(/<img/);
    expect(bad).toContain('Böse');
  });
});

describe('renderMarkdown – Tabellen (Strafenkatalog, Plan §2.2)', () => {
  const md = '| Code | Vergehen | Strafe |\n| :--- | --- | ---: |\n| V-01 | Kollision | 5 s |\n| V-02 | <b>Fett</b> | 10 s |';

  it('rendert echte HTML-Tabellen mit Kopfzeile und th scope', () => {
    const html = renderMarkdown(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html.match(/<th scope="col"/g)).toHaveLength(3);
    expect(html).toContain('<td style="text-align:left">V-01</td>');
    expect(html).toContain('<td>Kollision</td>');
    expect(html).toContain('<td style="text-align:right">5 s</td>');
    expect(html.match(/<tr>/g)).toHaveLength(3);
  });

  it('maskiert HTML in Tabellenzellen', () => {
    expect(renderMarkdown(md)).toContain('&lt;b&gt;Fett&lt;/b&gt;');
  });
});

describe('Markdown-Hilfsfunktionen', () => {
  it('liefert leere Strings für leere Eingaben', () => {
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
    expect(renderMarkdownInline('')).toBe('');
    expect(markdownToText(null)).toBe('');
  });

  it('rendert Inline-Markdown ohne Absatz', () => {
    const html = renderMarkdownInline('**fett** und [Link](/news)');
    expect(html).not.toContain('<p>');
    expect(html).toContain('<strong>fett</strong>');
  });

  it('macht aus Markdown kurzen Klartext für Meta-Descriptions', () => {
    const text = markdownToText('## Titel\n\n**Saison 2** startet – [Kalender](/kalender) ansehen. ![Bild](/x.png)');
    expect(text).toBe('Titel Saison 2 startet – Kalender ansehen. Bild');
    const long = markdownToText('Wort '.repeat(100), 50);
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long.endsWith('…')).toBe(true);
  });
});
