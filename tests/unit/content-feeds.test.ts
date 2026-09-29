/**
 * Inhalte: RSS, Sitemap und robots.txt (reine Funktionen, Demo-Datensatz).
 */
import { describe, expect, it } from 'vitest';
import type { Dataset } from '~/lib/db/memory-store';
import { buildRobotsTxt } from '~/lib/content/robots';
import { buildRss, rfc822, xmlText } from '~/lib/content/rss';
import { buildSitemapXml, collectSitemapPages, STATIC_SITEMAP_ROUTES } from '~/lib/content/sitemap';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
import { driverProfileSlugs, teamPageSlugs } from '~/lib/people';
import { seasonStandingsPaths } from '~/lib/standings/page';
import { demoDataset } from '~/lib/seed/demo';

const NOW = new Date('2026-09-29T12:00:00Z');
const STAMP = '2026-09-01T00:00:00.000Z';
const SITE_URL = new URL('https://liga.example');

function leagueFrom(dataset: Dataset, mutate?: (data: LeagueDataset) => void): League {
  const data = Object.fromEntries(
    LEAGUE_TABLES.map((table) => [
      table,
      ((dataset as Record<string, Array<Record<string, unknown>> | undefined>)[table] ?? []).map((row) => ({
        created_at: STAMP,
        updated_at: STAMP,
        ...row,
      })),
    ]),
  ) as unknown as LeagueDataset;
  data.settings = data.settings.filter((s) => s.is_public);
  mutate?.(data);
  return new League(data, NOW);
}

describe('RSS', () => {
  const xml = buildRss({
    title: 'Liga – News',
    link: 'https://liga.example/news',
    description: 'Neuigkeiten & mehr',
    language: 'de-DE',
    selfUrl: 'https://liga.example/news/rss.xml',
    items: [
      {
        title: 'Rennbericht <R3> & "Sakhir"',
        link: 'https://liga.example/news/r3',
        description: 'Kurz' + String.fromCharCode(1) + 'text',
        pubDate: '2026-09-22T20:00:00Z',
        categories: ['Rennbericht'],
        creator: 'Newsdesk_Nora',
      },
      {
        title: 'Älter',
        link: 'https://liga.example/news/alt',
        description: 'x',
        pubDate: '2026-09-01T18:00:00Z',
        language: 'de-DE',
      },
    ],
  });

  it('erzeugt gültiges RSS 2.0 mit Channel-Angaben', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<atom:link href="https://liga.example/news/rss.xml" rel="self" type="application/rss+xml" />');
    expect(xml).toContain('<language>de-DE</language>');
    expect(xml).toContain('<description>Neuigkeiten &amp; mehr</description>');
    expect(xml.match(/<item>/g)).toHaveLength(2);
  });

  it('escaped Inhalte und entfernt ungültige Steuerzeichen', () => {
    expect(xml).toContain('<title>Rennbericht &lt;R3&gt; &amp; &quot;Sakhir&quot;</title>');
    expect(xml).toContain('<description>Kurztext</description>');
    expect(xmlText('a' + String.fromCharCode(0) + 'b' + String.fromCharCode(9) + 'c')).toBe('ab' + String.fromCharCode(9) + 'c');
  });

  it('setzt RFC-822-Daten, Permalink-GUID, Autor und lastBuildDate (neuester Eintrag)', () => {
    expect(rfc822('2026-09-22T20:00:00Z')).toBe('Tue, 22 Sep 2026 20:00:00 GMT');
    expect(xml).toContain('<pubDate>Tue, 22 Sep 2026 20:00:00 GMT</pubDate>');
    expect(xml).toContain('<guid isPermaLink="true">https://liga.example/news/r3</guid>');
    expect(xml).toContain('<dc:creator>Newsdesk_Nora</dc:creator>');
    expect(xml).toContain('<dc:language>de-DE</dc:language>');
    expect(xml).toContain('<lastBuildDate>Tue, 22 Sep 2026 20:00:00 GMT</lastBuildDate>');
  });
});

describe('Sitemap', () => {
  const league = leagueFrom(demoDataset(NOW));
  const pages = collectSitemapPages(league, {
    includeStream: false,
    legal: {
      imprint: { updated: '2026-09-29T00:00:00.000Z', draft: false },
      privacy: { updated: '2026-09-29T00:00:00.000Z', draft: true },
    },
  });
  const des = pages.map((p) => p.alternates.de);
  const ens = pages.map((p) => p.alternates.en);

  it('enthält alle statischen Seiten in beiden Sprachen', () => {
    expect(des).toContain('/');
    expect(ens).toContain('/en');
    expect(des).toContain('/liga/regelwerk');
    expect(ens).toContain('/en/league/rules');
    expect(pages.length).toBeGreaterThan(STATIC_SITEMAP_ROUTES.length);
  });

  it('enthält dynamische Seiten mit sprachspezifischen Slugs', () => {
    const news = league.news[0]!;
    const i = des.indexOf(`/news/${news.slug_de}`);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(ens[i]).toBe(`/en/news/${news.slug_en}`);
    const round = league.roundsOf(league.currentSeason!.id)[0]!;
    expect(des).toContain(`/rennen/${league.currentSeason!.slug}/${round.number}`);
    const driver = league.drivers.find((d) => !d.anonymized)!;
    expect(des).toContain(`/fahrer/${driver.slug}`);
    for (const d of league.decisions) expect(des).toContain(`/stewards/${encodeURIComponent(d.public_ref)}`);
    for (const s of league.archiveSeasons) expect(des).toContain(`/saison/${s.slug}/wertung`);
  });

  it('passt zu den getStaticPaths der Rennen, Fahrer, Teams und Saisonwertungen', () => {
    const races = des.filter((p) => p.startsWith('/rennen/'));
    expect(races).toHaveLength(league.data.rounds.length);
    const drivers = des.filter((p) => p.startsWith('/fahrer/')).map((p) => decodeURIComponent(p.slice('/fahrer/'.length)));
    expect(drivers.sort()).toEqual([...driverProfileSlugs(league)].sort());
    const teams = des.filter((p) => p.startsWith('/teams/')).map((p) => decodeURIComponent(p.slice('/teams/'.length)));
    expect(teams.sort()).toEqual([...teamPageSlugs(league)].sort());
    const standings = des.filter((p) => /^\/saison\/[^/]+\/wertung$/.test(p));
    expect(standings).toHaveLength(seasonStandingsPaths(league).length);
    const anonymized = league.drivers.filter((d) => d.anonymized);
    for (const d of anonymized) expect(des).not.toContain(`/fahrer/${d.slug}`);
  });

  it('lässt Admin, APIs, Snapshots, Stream ohne Kanal, Entwürfe und die aktuelle Regelwerk-Fassung weg', () => {
    const all = [...des, ...ens];
    expect(all.some((p) => p.startsWith('/admin') || p.startsWith('/api'))).toBe(false);
    expect(all.some((p) => p.includes('nach-runde') || p.includes('after-round'))).toBe(false);
    expect(all.some((p) => p.endsWith('.ics') || p.endsWith('.csv'))).toBe(false);
    expect(des).not.toContain('/stream');
    expect(des).not.toContain('/stewards/melden');
    expect(des).toContain('/impressum');
    expect(des).not.toContain('/datenschutz');
    expect(des).toContain('/teilnahmebedingungen');
    expect(des).not.toContain(`/liga/regelwerk/v/${league.rulesVersion!.version}`);
    expect(new Set(des).size).toBe(des.length);
  });

  it('nimmt den Stream auf, wenn ein Kanal eingetragen ist', () => {
    const withStream = collectSitemapPages(league, { includeStream: true });
    expect(withStream.map((p) => p.alternates.de)).toContain('/stream');
  });

  it('listet ältere Regelwerk-Fassungen', () => {
    const withOld = leagueFrom(demoDataset(NOW), (data) => {
      data.rules_versions.push({ ...data.rules_versions[0]!, id: 99, version: '0.9', status: 'archived', published_at: '2025-01-01T00:00:00Z' });
    });
    const list = collectSitemapPages(withOld, { includeStream: false }).map((p) => p.alternates.en);
    expect(list).toContain('/en/league/rules/v/0.9');
  });

  it('schreibt je Sprache eine <url> mit hreflang-Alternativen und x-default', () => {
    const xml = buildSitemapXml(
      [{ alternates: { de: '/news/a&b', en: '/en/news/a-b' }, lastmod: '2026-09-01T10:00:00Z' }],
      SITE_URL,
    );
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml).toContain('<loc>https://liga.example/news/a&amp;b</loc>');
    expect(xml).toContain('<loc>https://liga.example/en/news/a-b</loc>');
    expect(xml).toContain('<lastmod>2026-09-01T10:00:00.000Z</lastmod>');
    expect(xml.match(/hreflang="x-default" href="https:\/\/liga.example\/news\/a&amp;b"/g)).toHaveLength(2);
  });
});

describe('robots.txt', () => {
  it('sperrt Admin und APIs und nennt die Sitemap', () => {
    const txt = buildRobotsTxt({ disallowAll: false, sitemapUrl: 'https://liga.example/sitemap.xml' });
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Disallow: /api');
    expect(txt).toContain('Sitemap: https://liga.example/sitemap.xml');
  });

  it('sperrt im Demo-/Noindex-Modus alles', () => {
    const txt = buildRobotsTxt({ disallowAll: true, sitemapUrl: 'https://liga.example/sitemap.xml' });
    expect(txt).toContain('Disallow: /\n');
    expect(txt).not.toContain('Allow:');
    expect(txt).not.toContain('Sitemap:');
  });
});
