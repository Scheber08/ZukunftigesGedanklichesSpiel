/**
 * 301-Weiterleitungen alter Slugs (src/lib/server/redirects.ts, Plan §2.2 „stabile URLs“):
 * Pfad-Muster für alle umbenennbaren Seiten in DE und EN, Unterseiten, News je Sprache,
 * Auflösen von Ketten und Wiedervergabe eines alten Slugs.
 */
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '~/lib/db/memory-store';
import { findRedirect, matchRedirectPattern, recordSlugChange } from '~/lib/server/redirects';

const store = () => new MemoryStore({ slug_redirects: [] });

describe('matchRedirectPattern', () => {
  it.each([
    ['/fahrer/alt', 'driver', null, '/fahrer/neu'],
    ['/en/drivers/alt', 'driver', null, '/en/drivers/neu'],
    ['/teams/alt', 'team', null, '/teams/neu'],
    ['/en/teams/alt', 'team', null, '/en/teams/neu'],
    ['/saison/alt/wertung', 'season', null, '/saison/neu/wertung'],
    ['/en/season/alt/standings/after-round-2', 'season', null, '/en/season/neu/standings/after-round-2'],
    ['/rennen/alt/4', 'season', null, '/rennen/neu/4'],
    ['/en/races/alt/4', 'season', null, '/en/races/neu/4'],
    ['/news/alt', 'news', 'de', '/news/neu'],
    ['/en/news/alt', 'news', 'en', '/en/news/neu'],
  ] as const)('%s → %s', (path, entity, lang, target) => {
    const m = matchRedirectPattern(path);
    expect(m?.entity).toBe(entity);
    expect(m?.lang).toBe(lang);
    expect(m?.slug).toBe('alt');
    expect(m?.build('neu')).toBe(target);
  });

  it('ignoriert Seiten ohne Slug und fremde Pfade', () => {
    for (const path of ['/', '/fahrer', '/en/drivers', '/kalender', '/news/alt/extra', '/admin/fahrer/3', '/fahrerx/alt']) {
      expect(matchRedirectPattern(path), path).toBeNull();
    }
  });

  it('dekodiert Umlaute und kodiert das Ziel wieder', () => {
    const m = matchRedirectPattern('/fahrer/k%C3%B6nig');
    expect(m?.slug).toBe('könig');
    expect(m?.build('kaiser-ä')).toBe('/fahrer/kaiser-%C3%A4');
  });

  it('kaputte Prozent-Kodierung führt zu keinem Treffer statt zu einem Fehler', () => {
    expect(matchRedirectPattern('/fahrer/%E0%A4%A')).toBeNull();
  });
});

describe('recordSlugChange und findRedirect', () => {
  it('leitet eine alte Adresse auf die neue weiter, auch auf Englisch und für Unterseiten', async () => {
    const s = store();
    await recordSlugChange(s, 'driver', 'kurvenkoenig-alt', 'kurvenkoenig');
    expect(await findRedirect(s, '/fahrer/kurvenkoenig-alt')).toBe('/fahrer/kurvenkoenig');
    expect(await findRedirect(s, '/en/drivers/kurvenkoenig-alt')).toBe('/en/drivers/kurvenkoenig');
    expect(await findRedirect(s, '/fahrer/unbekannt')).toBeNull();
    // gleicher Slug bei einer anderen Entität leitet nicht weiter
    expect(await findRedirect(s, '/teams/kurvenkoenig-alt')).toBeNull();
  });

  it('ignoriert „Umbenennungen“ ohne Änderung', async () => {
    const s = store();
    await recordSlugChange(s, 'team', 'mclaren', 'mclaren');
    await recordSlugChange(s, 'team', '', 'mclaren');
    expect(await s.select('slug_redirects')).toEqual([]);
  });

  it('löst Ketten auf: a → b, dann b → c ergibt a → c und b → c', async () => {
    const s = store();
    await recordSlugChange(s, 'season', 'a', 'b');
    await recordSlugChange(s, 'season', 'b', 'c');
    expect(await findRedirect(s, '/saison/a/wertung')).toBe('/saison/c/wertung');
    expect(await findRedirect(s, '/rennen/b/3')).toBe('/rennen/c/3');
    expect((await s.select('slug_redirects')).length).toBe(2);
  });

  it('Zurückbenennen entfernt die Weiterleitung auf sich selbst (keine Schleife)', async () => {
    const s = store();
    await recordSlugChange(s, 'driver', 'alt', 'neu');
    await recordSlugChange(s, 'driver', 'neu', 'alt');
    expect(await findRedirect(s, '/fahrer/alt')).toBeNull();
    expect(await findRedirect(s, '/fahrer/neu')).toBe('/fahrer/alt');
    const rows = await s.select('slug_redirects');
    expect(rows.every((r) => r.old_slug !== r.new_slug)).toBe(true);
  });

  it('News-Weiterleitungen gelten nur für ihre Sprache', async () => {
    const s = store();
    await recordSlugChange(s, 'news', 'artikel-alt', 'artikel-neu', 'de');
    expect(await findRedirect(s, '/news/artikel-alt')).toBe('/news/artikel-neu');
    expect(await findRedirect(s, '/en/news/artikel-alt')).toBeNull();
    await recordSlugChange(s, 'news', 'article-old', 'article-new', 'en');
    expect(await findRedirect(s, '/en/news/article-old')).toBe('/en/news/article-new');
    expect(await findRedirect(s, '/news/article-old')).toBeNull();
  });

  it('die Demo-Daten enthalten die Weiterleitung, die der E2E-Test prüft', async () => {
    const { demoDataset } = await import('~/lib/seed/demo');
    const s = new MemoryStore(demoDataset());
    expect(await findRedirect(s, '/fahrer/kurvenkoenig-alt')).toBe('/fahrer/kurvenkoenig');
    expect(await findRedirect(s, '/en/drivers/kurvenkoenig-alt')).toBe('/en/drivers/kurvenkoenig');
  });
});
