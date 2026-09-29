import { describe, expect, it } from 'vitest';
import {
  decideNewsStatus,
  missingNewsTranslations,
  newsListState,
  newsRedirectsFor,
  newsSlug,
  newsSlugChanges,
  publishProblems,
  resolveNewsSlugs,
} from '~/lib/admin/content/news';
import { dateToLocalInput, localInputToDate, pick, pickChecked } from '~/lib/admin/content/form';

const NOW = new Date('2026-10-01T12:00:00Z');

describe('News-Slugs', () => {
  it('erzeugt Slugs aus Titeln mit Umlauten und Sonderzeichen', () => {
    expect(newsSlug('Rennbericht R3 · Sakhir: Sprint unter Flutlicht')).toBe('rennbericht-r3-sakhir-sprint-unter-flutlicht');
    expect(newsSlug('Neuzugänge für Saison 2!')).toBe('neuzugaenge-fuer-saison-2');
  });

  it('fällt ohne verwertbare Zeichen auf „news“ zurück, nicht auf „fahrer“', () => {
    expect(newsSlug('!!!')).toBe('news');
    expect(newsSlug('')).toBe('news');
    expect(newsSlug(null)).toBe('news');
    expect(newsSlug('Fahrer')).toBe('fahrer');
  });

  it('macht Slugs je Sprache eindeutig und ignoriert den eigenen Artikel', () => {
    const existing = [
      { id: 1, slug_de: 'saison-2-startet', slug_en: 'season-2-starts' },
      { id: 2, slug_de: 'saison-2-startet-2', slug_en: 'other' },
    ];
    expect(resolveNewsSlugs({ titleDe: 'Saison 2 startet', titleEn: 'Season 2 starts' }, existing)).toEqual({
      slug_de: 'saison-2-startet-3',
      slug_en: 'season-2-starts-2',
    });
    // eigener Artikel (id 1) behält seinen Slug
    expect(resolveNewsSlugs({ titleDe: 'Saison 2 startet', titleEn: 'Season 2 starts' }, existing, 1)).toEqual({
      slug_de: 'saison-2-startet',
      slug_en: 'season-2-starts',
    });
  });

  it('bevorzugt eingetragene Slugs und nutzt für EN notfalls den deutschen Titel', () => {
    expect(resolveNewsSlugs({ slugDe: 'Mein Slug', titleDe: 'Titel', titleEn: '' }, [])).toEqual({ slug_de: 'mein-slug', slug_en: 'titel' });
  });

  it('behält bei veröffentlichten Artikeln leere Slugs statt sie aus dem neuen Titel zu bilden', () => {
    const prev = { id: 5, status: 'published' as const, slug_de: 'alter-titel', slug_en: 'old-title' };
    expect(resolveNewsSlugs({ titleDe: 'Neuer Titel', titleEn: 'New title' }, [prev], 5, prev)).toEqual({ slug_de: 'alter-titel', slug_en: 'old-title' });
    // Entwurf: Slug folgt dem Titel
    expect(resolveNewsSlugs({ titleDe: 'Neuer Titel' }, [prev], 5, { ...prev, status: 'draft' })).toEqual({ slug_de: 'neuer-titel', slug_en: 'neuer-titel' });
    // bewusst geänderter Slug gilt auch bei veröffentlichten Artikeln
    expect(resolveNewsSlugs({ slugDe: 'neu', titleDe: 'Neuer Titel' }, [prev], 5, prev).slug_de).toBe('neu');
  });

  it('leitet alte Slugs nur bei veröffentlichten Artikeln weiter', () => {
    const before = { status: 'published' as const, slug_de: 'alt', slug_en: 'old' };
    expect(newsSlugChanges(before, { slug_de: 'neu', slug_en: 'old' })).toEqual([{ lang: 'de', from: 'alt', to: 'neu' }]);
    expect(newsSlugChanges(before, { slug_de: 'neu', slug_en: 'new' })).toHaveLength(2);
    expect(newsSlugChanges(before, before)).toEqual([]);
    expect(newsSlugChanges({ ...before, status: 'draft' }, { slug_de: 'neu', slug_en: 'new' })).toEqual([]);
    expect(newsSlugChanges(null, { slug_de: 'neu', slug_en: 'new' })).toEqual([]);
  });

  it('listet alte Adressen je Sprache', () => {
    const redirects = [
      { entity: 'news', old_slug: 'alt', new_slug: 'neu', lang: 'de' as const },
      { entity: 'news', old_slug: 'old', new_slug: 'new', lang: 'en' as const },
      { entity: 'news', old_slug: 'fremd', new_slug: 'new', lang: 'de' as const },
      { entity: 'driver', old_slug: 'x', new_slug: 'neu', lang: null },
    ];
    expect(newsRedirectsFor({ slug_de: 'neu', slug_en: 'new' }, redirects)).toEqual([
      { lang: 'de', path: '/news/alt' },
      { lang: 'en', path: '/en/news/old' },
    ]);
  });
});

describe('News-Status', () => {
  const future = new Date('2026-10-02T18:00:00Z');
  const past = new Date('2026-09-30T18:00:00Z');

  it('Entwurf behält ein optionales Plan-Datum', () => {
    expect(decideNewsStatus('draft', null, NOW)).toEqual({ ok: true, status: 'draft', publish_at: null });
    expect(decideNewsStatus('draft', future, NOW)).toMatchObject({ ok: true, status: 'draft', publish_at: future.toISOString() });
  });

  it('geplant braucht einen Zeitpunkt in der Zukunft', () => {
    expect(decideNewsStatus('scheduled', null, NOW)).toMatchObject({ ok: false, field: 'publish_at' });
    expect(decideNewsStatus('scheduled', past, NOW)).toMatchObject({ ok: false, field: 'publish_at' });
    expect(decideNewsStatus('scheduled', future, NOW)).toEqual({ ok: true, status: 'scheduled', publish_at: future.toISOString() });
  });

  it('veröffentlicht mit Zeitpunkt in der Zukunft wird zu geplant', () => {
    const d = decideNewsStatus('published', future, NOW);
    expect(d).toMatchObject({ ok: true, status: 'scheduled', publish_at: future.toISOString() });
    expect(d.ok && d.note).toBeTruthy();
  });

  it('veröffentlicht ohne Zeitpunkt: jetzt bzw. bisheriges Datum', () => {
    expect(decideNewsStatus('published', null, NOW)).toEqual({ ok: true, status: 'published', publish_at: NOW.toISOString() });
    const prev = { status: 'published' as const, publish_at: '2026-09-01T10:00:00.000Z' };
    expect(decideNewsStatus('published', null, NOW, prev)).toEqual({ ok: true, status: 'published', publish_at: prev.publish_at });
    // vorher Entwurf mit Plan-Datum → jetzt
    expect(decideNewsStatus('published', null, NOW, { status: 'draft', publish_at: '2026-09-01T10:00:00.000Z' })).toMatchObject({
      publish_at: NOW.toISOString(),
    });
    // Rückdatieren ist erlaubt
    expect(decideNewsStatus('published', past, NOW)).toEqual({ ok: true, status: 'published', publish_at: past.toISOString() });
  });

  it('Listen-Zustand erkennt fällige geplante Artikel', () => {
    expect(newsListState({ status: 'scheduled', publish_at: '2026-10-01T11:59:00Z' }, NOW)).toBe('due');
    expect(newsListState({ status: 'scheduled', publish_at: '2026-10-01T12:01:00Z' }, NOW)).toBe('scheduled');
    expect(newsListState({ status: 'draft', publish_at: null }, NOW)).toBe('draft');
    expect(newsListState({ status: 'published', publish_at: null }, NOW)).toBe('published');
  });
});

describe('News-Prüfungen', () => {
  const base = {
    title_de: 'Titel',
    title_en: null,
    excerpt_de: 'Teaser',
    excerpt_en: null,
    body_de: 'Text',
    body_en: null,
    cover_image: null,
    cover_alt_de: null,
    cover_alt_en: null,
  };

  it('verlangt Titel, Teaser, Text und bei Bild einen Alt-Text', () => {
    expect(publishProblems(base)).toEqual([]);
    expect(publishProblems({ ...base, excerpt_de: ' ', body_de: '' }).map((p) => p.field)).toEqual(['excerpt_de', 'body_de']);
    expect(publishProblems({ ...base, cover_image: 'https://x.test/a-1600.webp' }).map((p) => p.field)).toEqual(['cover_alt_de']);
  });

  it('meldet fehlende EN-Felder, Alt-Text nur mit Bild', () => {
    expect(missingNewsTranslations(base)).toEqual(['Titel', 'Teaser', 'Text']);
    expect(missingNewsTranslations({ ...base, cover_image: 'x', cover_alt_de: 'Alt' })).toEqual(['Titel', 'Teaser', 'Text', 'Alt-Text']);
    expect(missingNewsTranslations({ ...base, title_en: 'T', excerpt_en: 'E', body_en: 'B' })).toEqual([]);
  });
});

describe('Formular-Helfer', () => {
  it('rechnet datetime-local in Liga-Zeit um (Sommer- und Winterzeit)', () => {
    expect(localInputToDate('2026-07-15T20:00')?.toISOString()).toBe('2026-07-15T18:00:00.000Z');
    expect(localInputToDate('2026-12-15T20:00')?.toISOString()).toBe('2026-12-15T19:00:00.000Z');
    expect(localInputToDate('')).toBeNull();
    expect(localInputToDate('morgen')).toBeNull();
    expect(dateToLocalInput('2026-07-15T18:00:00.000Z')).toBe('2026-07-15T20:00');
    expect(dateToLocalInput(null)).toBe('');
  });

  it('bevorzugt eingereichte Werte nach einem Fehler', () => {
    expect(pick({ title: 'neu' }, 'title', 'alt')).toBe('neu');
    expect(pick(null, 'title', 'alt')).toBe('alt');
    expect(pick({}, 'title', null)).toBe('');
    expect(pickChecked({ other: 'x' }, 'active', true)).toBe(false);
    expect(pickChecked({ active: 'on' }, 'active', false)).toBe(true);
    expect(pickChecked(null, 'active', true)).toBe(true);
  });
});
