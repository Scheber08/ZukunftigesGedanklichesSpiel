import { describe, expect, it } from 'vitest';
import {
  fitWithin,
  isValidMediaPath,
  isWebp,
  mediaPath,
  mediaVariantUrl,
  normalizeImageValue,
  publicMediaUrl,
  redactDataUrl,
  validateUploadRequest,
} from '~/lib/admin/content/media';
import { moveInList, nextSort, positionInfo } from '~/lib/admin/content/order';
import { exclusionHits, normalizePartnerUrl } from '~/lib/admin/content/partners';
import { countMissing, FAQ_EN_FIELDS, missingEn } from '~/lib/admin/content/translations';

const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('Reihenfolge', () => {
  const items = [
    { id: 1, sort: 10 },
    { id: 2, sort: 20 },
    { id: 3, sort: 30 },
  ];

  it('verschiebt Einträge und liefert nur geänderte Sort-Werte', () => {
    expect(moveInList(items, 3, 'up')).toEqual([
      { id: 3, sort: 20 },
      { id: 2, sort: 30 },
    ]);
    expect(moveInList(items, 1, 'up')).toBeNull();
    expect(moveInList(items, 3, 'down')).toBeNull();
    expect(moveInList(items, 9, 'down')).toBeNull();
  });

  it('normalisiert unordentliche Sort-Werte', () => {
    const messy = [
      { id: 1, sort: 0 },
      { id: 2, sort: 0 },
      { id: 3, sort: 7 },
    ];
    expect(moveInList(messy, 2, 'up')).toEqual([
      { id: 2, sort: 10 },
      { id: 1, sort: 20 },
      { id: 3, sort: 30 },
    ]);
  });

  it('hängt neue Einträge hinten an und kennt Anfang/Ende', () => {
    expect(nextSort(items)).toBe(40);
    expect(nextSort([])).toBe(0);
    expect(nextSort([{ id: 1, sort: 7 }])).toBe(10);
    expect(positionInfo(items, 1)).toEqual({ first: true, last: false });
    expect(positionInfo(items, 3)).toEqual({ first: false, last: true });
  });
});

describe('Medien', () => {
  it('baut Pfade und öffentliche URLs', () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const path = mediaPath('news', UUID, 1600, at);
    expect(path).toBe(`news/2026/${UUID}-1600.webp`);
    expect(isValidMediaPath(path)).toBe(true);
    expect(isValidMediaPath('../etc/passwd')).toBe(false);
    expect(() => mediaPath('news', 'kein-uuid', 800)).toThrow();
    expect(publicMediaUrl('https://abc.supabase.co/', path)).toBe(`https://abc.supabase.co/storage/v1/object/public/media/${path}`);
  });

  it('leitet die 800er-Variante aus der gespeicherten URL ab', () => {
    const url = `https://abc.supabase.co/storage/v1/object/public/media/news/2026/${UUID}-1600.webp`;
    expect(mediaVariantUrl(url, 800)).toBe(url.replace('-1600.webp', '-800.webp'));
    expect(mediaVariantUrl('data:image/webp;base64,AAAA', 800)).toBe('data:image/webp;base64,AAAA');
    expect(mediaVariantUrl('https://example.com/logo.png', 800)).toBe('https://example.com/logo.png');
    expect(mediaVariantUrl(null, 800)).toBeNull();
  });

  it('verkleinert auf die längste Kante, ohne zu vergrößern', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 800)).toEqual({ width: 600, height: 800 });
    expect(fitWithin(640, 480, 1600)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(10000, 10, 800)).toEqual({ width: 800, height: 1 });
    expect(() => fitWithin(0, 10, 800)).toThrow();
  });

  it('prüft Upload-Anfragen auf Typ und Größe', () => {
    const ok = { kind: 'news', contentType: 'image/webp', sizes: { 1600: 300_000, 800: 90_000 } };
    expect(validateUploadRequest(ok)).toBeNull();
    expect(validateUploadRequest({ ...ok, kind: 'avatars' })).toMatch(/Bereich/);
    expect(validateUploadRequest({ ...ok, contentType: 'image/png' })).toMatch(/WebP/);
    expect(validateUploadRequest({ ...ok, sizes: { 1600: 3_000_000, 800: 1 } })).toMatch(/2 MB/);
    expect(validateUploadRequest({ ...ok, sizes: { 1600: 1 } })).toMatch(/800/);
  });

  it('erkennt WebP an der Signatur', () => {
    const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 1]);
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    expect(isWebp(webp)).toBe(true);
    expect(isWebp(png)).toBe(false);
    expect(isWebp(new Uint8Array(3))).toBe(false);
  });

  it('lässt Data-URLs nur im Demo-Modus zu', () => {
    const data = 'data:image/webp;base64,UklGRg==';
    expect(normalizeImageValue(data, { demo: true })).toBe(data);
    expect(() => normalizeImageValue(data, { demo: false })).toThrow(/Upload/);
    expect(() => normalizeImageValue('data:text/html;base64,PHNjcmlwdD4=', { demo: true })).toThrow();
    expect(() => normalizeImageValue('javascript:alert(1)', { demo: false })).toThrow();
    expect(normalizeImageValue('  ', { demo: false })).toBeNull();
    expect(normalizeImageValue('https://abc.supabase.co/x-1600.webp', { demo: false })).toBe('https://abc.supabase.co/x-1600.webp');
    expect(redactDataUrl(data)).toMatch(/^\[Data-URL/);
    expect(redactDataUrl('https://x.test/a.webp')).toBe('https://x.test/a.webp');
  });
});

describe('Partner', () => {
  it('erkennt Kategorien der Ausschlussliste', () => {
    expect(exclusionHits('Sim-Racing-Shop', 'Lenkräder und Pedale')).toEqual([]);
    expect(exclusionHits('MegaCasino')).toEqual(['Glücksspiel']);
    expect(exclusionHits('Sportwetten-Portal')).toEqual(['Wetten']);
    expect(exclusionHits('CS Skins & Cases')).toEqual(['Skins und Cases']);
    expect(exclusionHits('Brauerei Müller', 'Bier aus der Region')).toEqual(['Alkohol']);
    expect(exclusionHits('Bitcoin Exchange')).toEqual(['Krypto']);
    expect(exclusionHits('Better Sim Parts', 'Alphabet')).toEqual([]);
  });

  it('akzeptiert nur https-Links', () => {
    expect(normalizePartnerUrl('example.com/shop')).toBe('https://example.com/shop');
    expect(normalizePartnerUrl('https://example.com')).toBe('https://example.com/');
    expect(normalizePartnerUrl('http://example.com')).toBeNull();
    expect(normalizePartnerUrl('javascript:alert(1)')).toBeNull();
    expect(normalizePartnerUrl('localhost')).toBeNull();
    expect(normalizePartnerUrl('')).toBeNull();
  });
});

describe('Übersetzungen', () => {
  it('meldet fehlende EN-Felder nur, wenn DE Text hat', () => {
    expect(missingEn({ question_de: 'Frage', question_en: null, answer_de: 'A', answer_en: 'A' }, FAQ_EN_FIELDS)).toEqual(['Frage']);
    expect(missingEn({ question_de: '', question_en: null, answer_de: 'A', answer_en: '  ' }, FAQ_EN_FIELDS)).toEqual(['Antwort']);
    expect(
      countMissing(
        [
          { question_de: 'F', question_en: 'Q', answer_de: 'A', answer_en: 'A' },
          { question_de: 'F', question_en: null, answer_de: 'A', answer_en: 'A' },
        ],
        FAQ_EN_FIELDS,
      ),
    ).toBe(1);
  });
});
