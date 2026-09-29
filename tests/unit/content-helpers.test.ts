/**
 * Inhalte: Regelwerk-Helfer, News-Helfer, Twitch-Kanal und Text-Helfer.
 */
import { describe, expect, it } from 'vitest';
import type { Dataset } from '~/lib/db/memory-store';
import type { NewsRow } from '~/lib/db/types';
import { newsAlternates, newsArticleJsonLd, newsHref, newsNeedsTranslation, newsSlug, newsTeaser, newsWasUpdated } from '~/lib/content/news';
import {
  enhanceTables,
  findRulesVersion,
  flattenRuleTree,
  isValidVersionParam,
  rulesHaveFallback,
  rulesHref,
  rulesUpdatedAt,
  sortRulesVersions,
} from '~/lib/content/rules';
import { normalizeTwitchChannel, twitchChannelUrl, twitchPlayerUrl } from '~/lib/content/stream';
import { initials, localizedEffort, splitStep } from '~/lib/content/text';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
import { demoDataset } from '~/lib/seed/demo';
import { renderMarkdown } from '~/lib/util/markdown';

const NOW = new Date('2026-09-29T12:00:00Z');
const STAMP = '2026-09-01T00:00:00.000Z';

function leagueFrom(dataset: Dataset): League {
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
  return new League(data, NOW);
}

const league = leagueFrom(demoDataset(NOW));

describe('Regelwerk', () => {
  const version = league.rulesVersion!;
  const tree = league.rulesTree(version.id);

  it('flacht den Baum in Dokument-Reihenfolge ab', () => {
    const flat = flattenRuleTree(tree);
    expect(flat[0]!.node.anchor).toBe('p1');
    expect(flat[0]!.level).toBe(0);
    expect(flat[1]!.node.anchor).toBe('p1-1');
    expect(flat[1]!.level).toBe(1);
    expect(flat.length).toBe(league.data.rules_sections.filter((s) => s.version_id === version.id).length);
    expect(new Set(flat.map((f) => f.node.anchor)).size).toBe(flat.length);
  });

  it('erkennt fehlende Übersetzungen nur für EN', () => {
    expect(rulesHaveFallback(tree, 'de')).toBe(false);
    expect(rulesHaveFallback(tree, 'en')).toBe(false);
    const broken = [{ ...tree[0]!, title_en: null, children: [] }];
    expect(rulesHaveFallback(broken, 'en')).toBe(true);
  });

  it('findet Versionen und prüft den URL-Parameter', () => {
    expect(findRulesVersion(league, undefined)?.id).toBe(version.id);
    expect(findRulesVersion(league, version.version)?.id).toBe(version.id);
    expect(findRulesVersion(league, '9.9')).toBeUndefined();
    expect(isValidVersionParam('1.0')).toBe(true);
    expect(isValidVersionParam('2026-1')).toBe(true);
    expect(isValidVersionParam('../x')).toBe(false);
    expect(isValidVersionParam('')).toBe(false);
    expect(rulesUpdatedAt(league, version)).toBe(STAMP);
  });

  it('macht Tabellen scrollbar, beschriftet und mit data-label', () => {
    const html = renderMarkdown('Text\n\n| Code | Vergehen |\n| --- | --- |\n| V-01 | Kollision <b> |\n| V-02 | Blockieren |');
    const out = enhanceTables(html, { label: 'Tabelle zu §8.3', caption: '§8.3 Katalog', className: 'rules-table' });
    expect(out).toContain('<div class="rules-table" role="region" tabindex="0" aria-label="Tabelle zu §8.3">');
    expect(out).toContain('<caption class="sr-only">§8.3 Katalog</caption>');
    expect(out.match(/data-label="Code"/g)).toHaveLength(2);
    expect(out.match(/data-label="Vergehen"/g)).toHaveLength(2);
    expect(out).toContain('&lt;b&gt;');
    expect(out).toContain('<th scope="col">Code</th>');
    // erste Spalte als Zeilenkopf
    const rows = enhanceTables(html, { label: 'a', caption: 'b', rowHeaders: true });
    expect(rows).toContain('<tr><th scope="row" data-label="Code">V-01</th><td data-label="Vergehen">');
    expect(rows.match(/scope="row"/g)).toHaveLength(2);
    // ohne Tabelle unverändert
    expect(enhanceTables('<p>x</p>', { label: 'a', caption: 'b' })).toBe('<p>x</p>');
  });

  it('sortiert den Changelog nach Versionsnummer, nicht nach Datum', () => {
    const versions = [
      { version: '1.0', published_at: '2026-11-01T00:00:00Z' },
      { version: '1.10', published_at: '2026-09-01T00:00:00Z' },
      { version: '1.2', published_at: '2026-09-29T00:00:00Z' },
    ];
    expect(sortRulesVersions(versions).map((v) => v.version)).toEqual(['1.10', '1.2', '1.0']);
    expect(versions[0]!.version).toBe('1.0');
  });

  it('verlinkt Paragraphen nur, wenn es den Anker gibt', () => {
    expect(rulesHref(league, 'de', 'p2-5')).toBe('/liga/regelwerk#p2-5');
    expect(rulesHref(league, 'en', 'p10-2')).toBe('/en/league/rules#p10-2');
    expect(rulesHref(league, 'de', 'p99-9')).toBe('/liga/regelwerk');
  });

  it('der Strafenkatalog im Demo-Regelwerk wird erkannt', () => {
    const catalogue = flattenRuleTree(tree).find((f) => f.node.anchor === 'p8-3')!.node;
    const out = enhanceTables(renderMarkdown(catalogue.body_de), { label: 'x', caption: 'y' });
    expect(out.match(/<tr>/g)!.length).toBeGreaterThan(20);
    expect(out).toContain('data-label="Regelstrafe"');
  });
});

describe('News', () => {
  const news = league.news;
  const withoutEn = news.find((n) => n.body_en == null)!;
  const withEn = news.find((n) => n.body_en != null && n.title_en != null)!;

  it('baut Slugs und Alternates je Sprache', () => {
    expect(newsSlug(withEn, 'de')).toBe(withEn.slug_de);
    expect(newsSlug(withEn, 'en')).toBe(withEn.slug_en);
    expect(newsHref('en', withEn)).toBe(`/en/news/${withEn.slug_en}`);
    expect(newsAlternates(withEn)).toEqual({ de: `/news/${withEn.slug_de}`, en: `/en/news/${withEn.slug_en}` });
    const noEnSlug = { ...withEn, slug_en: '' } as NewsRow;
    expect(newsSlug(noEnSlug, 'en')).toBe(withEn.slug_de);
  });

  it('erkennt fehlende EN-Fassung und liefert Teaser', () => {
    expect(newsNeedsTranslation(withoutEn, 'en')).toBe(true);
    expect(newsNeedsTranslation(withoutEn, 'de')).toBe(false);
    expect(newsNeedsTranslation(withEn, 'en')).toBe(false);
    expect(newsTeaser(withEn, 'en').text).toBe(withEn.excerpt_en);
    const noExcerpt = { ...withEn, excerpt_de: '', excerpt_en: null, body_de: '**Fett** und [Link](/x)' } as NewsRow;
    expect(newsTeaser(noExcerpt, 'de').text).toBe('Fett und Link');
  });

  it('erkennt nachträgliche Änderungen', () => {
    const base = { ...withEn, publish_at: '2026-09-01T10:00:00Z', created_at: '2026-09-01T09:00:00Z' } as NewsRow;
    expect(newsWasUpdated({ ...base, updated_at: '2026-09-01T10:30:00Z' })).toBe(false);
    expect(newsWasUpdated({ ...base, updated_at: '2026-09-03T10:00:00Z' })).toBe(true);
  });

  it('liefert JSON-LD NewsArticle mit absoluten URLs', () => {
    const ld = newsArticleJsonLd({
      news: withoutEn,
      lang: 'en',
      site: new URL('https://liga.example'),
      title: 'Titel',
      description: 'Beschreibung',
      categoryLabel: 'Race report',
      imagePath: '/og-default.png',
    });
    expect(ld['@type']).toBe('NewsArticle');
    expect(ld.inLanguage).toBe('de-DE');
    expect(ld.image).toEqual(['https://liga.example/og-default.png']);
    expect((ld.mainEntityOfPage as { '@id': string })['@id']).toBe(`https://liga.example/en/news/${withoutEn.slug_en}`);
    expect((ld.author as { name: string }).name).toBe(withoutEn.author_name);
  });
});

describe('Twitch', () => {
  it('akzeptiert Kanalnamen und Kanal-URLs', () => {
    expect(normalizeTwitchChannel('MeineLiga_TV')).toBe('meineliga_tv');
    expect(normalizeTwitchChannel(' https://www.twitch.tv/MeineLiga/ ')).toBe('meineliga');
    expect(normalizeTwitchChannel('twitch.tv/liga_live?x=1')).toBe('liga_live');
    expect(normalizeTwitchChannel('@liga')).toBe('liga');
  });

  it('lehnt Unsinn und fremde URLs ab', () => {
    expect(normalizeTwitchChannel(null)).toBeNull();
    expect(normalizeTwitchChannel('')).toBeNull();
    expect(normalizeTwitchChannel('a')).toBeNull();
    expect(normalizeTwitchChannel('liga"><script>')).toBeNull();
    expect(normalizeTwitchChannel('https://evil.example/liga')).toBeNull();
  });

  it('baut Player- und Kanal-URL', () => {
    expect(twitchPlayerUrl('liga', 'liga.example')).toBe('https://player.twitch.tv/?channel=liga&parent=liga.example&autoplay=true');
    expect(twitchPlayerUrl('liga', 'localhost', { autoplay: false })).toContain('autoplay=false');
    expect(twitchChannelUrl('liga')).toBe('https://www.twitch.tv/liga');
  });
});

describe('Text-Helfer', () => {
  it('teilt Schritte mit kurzer Überschrift', () => {
    expect(splitStep('Crossplay aktivieren: In den Einstellungen einschalten.')).toEqual({
      head: 'Crossplay aktivieren:',
      rest: 'In den Einstellungen einschalten.',
    });
    expect(splitStep('Kein Doppelpunkt hier')).toEqual({ head: null, rest: 'Kein Doppelpunkt hier' });
    expect(splitStep('Ein sehr langer Satz, der viel zu lang für eine Überschrift ist: und weiter').head).toBeNull();
  });

  it('übersetzt gängige Angaben zum Zeitaufwand, sonst bleibt Deutsch', () => {
    expect(localizedEffort('ca. 1–2 h pro Woche', 'de')).toEqual({ text: 'ca. 1–2 h pro Woche', fallback: false });
    expect(localizedEffort('ca. 1–2 h pro Woche', 'en')).toEqual({ text: 'approx. 1–2 h per week', fallback: false });
    expect(localizedEffort('ca. 2–3 h pro Renntag (inkl. Vorbereitung)', 'en').text).toBe('approx. 2–3 h per race day (incl. preparation)');
    expect(localizedEffort('ca. 2–3 h pro Renntag (innerhalb von 72 h nach Ende der Protestfrist)', 'en').text).toBe(
      'approx. 2–3 h per race day (within 72 h after the protest deadline)',
    );
    expect(localizedEffort('bis zu 1,5 Stunden je Rennen', 'en').text).toBe('up to 1.5 h per race');
    expect(localizedEffort('3 h/Monat', 'en').text).toBe('3 h per month');
    expect(localizedEffort('nach Absprache', 'en')).toEqual({ text: 'nach Absprache', fallback: true });
    expect(localizedEffort('ca. 2 h pro Woche (flexibel)', 'en').fallback).toBe(true);
  });

  it('bildet Initialen aus Gamertags', () => {
    expect(initials('RaceControl_Rene')).toBe('RR');
    expect(initials('PixelPete')).toBe('PP');
    expect(initials('kurvenkönig')).toBe('KU');
    expect(initials('___')).toBe('?');
  });
});
