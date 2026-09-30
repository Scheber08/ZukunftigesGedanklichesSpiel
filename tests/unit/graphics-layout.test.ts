/**
 * Social-Grafiken: Layout-Berechnung (Rahmen, sichere Ränder, Raster, Textkürzung, Schriftgrößen).
 */
import { describe, expect, it } from 'vitest';
import { FORMAT_IDS, FORMATS, formatBySize, formatSize, isFormatId } from '~/lib/graphics/formats';
import {
  ELLIPSIS,
  fitFontSize,
  fitTextBlock,
  frameLayout,
  lineHeight,
  orientationOf,
  safeInsets,
  scaleFor,
  sizeSteps,
  tableLayout,
  truncateText,
  wrapText,
  type Rect,
} from '~/lib/graphics/layout';
import { backgroundGlows, glowPixels, hexToRgb } from '~/lib/graphics/glow';

/** Attrappe: jedes Zeichen 10 px breit (bei Größe 10), linear mit der Schriftgröße */
const measure = (t: string) => Array.from(t).length * 10;
const measureAt = (t: string, size: number) => Array.from(t).length * size;

const inside = (inner: Rect, outer: { width: number; height: number }) =>
  inner.x >= 0 && inner.y >= 0 && inner.x + inner.w <= outer.width + 0.001 && inner.y + inner.h <= outer.height + 0.001;

describe('Formate', () => {
  it('kennt die vier Formate aus dem Plan', () => {
    expect(FORMAT_IDS).toEqual(['instagram', 'story', 'youtube', 'og']);
    expect([FORMATS.instagram.width, FORMATS.instagram.height]).toEqual([1080, 1350]);
    expect([FORMATS.story.width, FORMATS.story.height]).toEqual([1080, 1920]);
    expect([FORMATS.youtube.width, FORMATS.youtube.height]).toEqual([1280, 720]);
    expect([FORMATS.og.width, FORMATS.og.height]).toEqual([1200, 630]);
  });

  it('prüft IDs und findet Formate über die Pixelmaße', () => {
    expect(isFormatId('story')).toBe(true);
    expect(isFormatId('tiktok')).toBe(false);
    expect(isFormatId(undefined)).toBe(false);
    expect(formatBySize(1280, 720)?.id).toBe('youtube');
    expect(formatBySize(1000, 1000)).toBeUndefined();
    expect(formatSize(FORMATS.og)).toBe('1200 × 630');
  });
});

describe('Rahmen und sichere Ränder', () => {
  it('Ausrichtung und Skalierung je Format', () => {
    expect(orientationOf(FORMATS.instagram)).toBe('portrait');
    expect(orientationOf(FORMATS.story)).toBe('portrait');
    expect(orientationOf(FORMATS.youtube)).toBe('landscape');
    expect(scaleFor(FORMATS.instagram)).toBe(1);
    expect(scaleFor(FORMATS.story)).toBe(1);
    expect(scaleFor(FORMATS.youtube)).toBeCloseTo(0.75);
    expect(scaleFor(FORMATS.og)).toBeCloseTo(0.656, 2);
  });

  it('Story hält oben und unten Abstand für die App-Oberfläche', () => {
    const story = safeInsets(FORMATS.story);
    expect(story.top).toBeGreaterThanOrEqual(200);
    expect(story.bottom).toBeGreaterThanOrEqual(280);
    expect(story.right).toBeGreaterThan(story.left);
    const insta = safeInsets(FORMATS.instagram);
    expect(insta).toEqual({ top: 64, right: 64, bottom: 64, left: 64 });
    expect(safeInsets(FORMATS.youtube).top).toBe(48);
  });

  it.each(FORMAT_IDS)('alle Bereiche liegen im Bild und innerhalb der sicheren Ränder (%s)', (id) => {
    const f = FORMATS[id];
    const frame = frameLayout(f);
    for (const rect of [frame.header, frame.title, frame.content, frame.footer]) {
      expect(inside(rect, f)).toBe(true);
      expect(rect.w).toBeGreaterThan(0);
      expect(rect.h).toBeGreaterThan(0);
      expect(rect.x).toBeGreaterThanOrEqual(frame.safe.left);
      expect(rect.y).toBeGreaterThanOrEqual(frame.safe.top);
      expect(rect.y + rect.h).toBeLessThanOrEqual(f.height - frame.safe.bottom + 0.001);
      expect(rect.x + rect.w).toBeLessThanOrEqual(f.width - frame.safe.right + 0.001);
    }
    // Inhalt überlappt Kopf und Fuß nicht
    if (frame.orientation === 'portrait') {
      expect(frame.content.y).toBeGreaterThan(frame.title.y + frame.title.h);
      expect(frame.content.y + frame.content.h).toBeLessThan(frame.footer.y);
      expect(frame.content.h).toBeGreaterThan(f.height * 0.4);
    } else {
      expect(frame.content.x).toBeGreaterThan(frame.title.x + frame.title.w);
      expect(frame.content.h).toBeGreaterThan(f.height * 0.8);
    }
  });
});

describe('tableLayout', () => {
  const box: Rect = { x: 0, y: 100, w: 900, h: 800 };

  it('eine Spalte, solange die Mindesthöhe erreicht wird', () => {
    const l = tableLayout(box, 10, { minRow: 50, maxRow: 100, gapRatio: 0.1 });
    expect(l.cols).toBe(1);
    expect(l.fits).toBe(true);
    expect(l.cells).toHaveLength(10);
    // 10 Zeilen + 9 Abstände füllen genau die Höhe
    expect(10 * l.rowH + 9 * l.gap).toBeCloseTo(800);
    expect(l.cells[0]).toMatchObject({ x: 0, y: 100, w: 900, row: 0, col: 0 });
    expect(l.cells[9]!.y + l.rowH).toBeCloseTo(900);
  });

  it('zweite Spalte, wenn die Zeilen zu niedrig würden (22 Fahrer)', () => {
    const l = tableLayout(box, 22, { minRow: 50, maxRow: 100, gapRatio: 0.1, colGap: 20, maxCols: 2 });
    expect(l.cols).toBe(2);
    expect(l.rowsPerCol).toBe(11);
    expect(l.colW).toBe(440);
    // spaltenweise: 1–11 links, 12–22 rechts
    expect(l.cells[10]).toMatchObject({ col: 0, row: 10 });
    expect(l.cells[11]).toMatchObject({ col: 1, row: 0, x: 460 });
  });

  it('meldet, wenn es selbst mit der Höchstzahl an Spalten zu eng wird', () => {
    const l = tableLayout({ x: 0, y: 0, w: 400, h: 200 }, 22, { minRow: 50, maxRow: 100, maxCols: 2 });
    expect(l.fits).toBe(false);
    expect(l.cols).toBe(2);
    expect(l.rowH).toBeLessThan(50);
  });

  it('begrenzt die Zeilenhöhe und zentriert auf Wunsch', () => {
    const l = tableLayout(box, 3, { minRow: 50, maxRow: 100, gapRatio: 0.1, align: 'center' });
    expect(l.rowH).toBe(100);
    const used = 3 * 100 + 2 * 10;
    expect(l.cells[0]!.y).toBeCloseTo(100 + (800 - used) / 2);
  });

  it('Startaufstellung: abwechselnd links/rechts, rechte Spalte um eine halbe Zeile versetzt', () => {
    const l = tableLayout(box, 22, { minRow: 30, maxRow: 200, gapRatio: 0.2, colGap: 40, minCols: 2, maxCols: 2, order: 'row', stagger: true });
    expect(l.cols).toBe(2);
    expect(l.cells[0]).toMatchObject({ col: 0, row: 0 });
    expect(l.cells[1]).toMatchObject({ col: 1, row: 0 });
    expect(l.cells[2]).toMatchObject({ col: 0, row: 1 });
    const pitch = l.rowH + l.gap;
    expect(l.cells[1]!.y - l.cells[0]!.y).toBeCloseTo(pitch / 2);
    // letzte (versetzte) Zelle endet genau am unteren Rand
    const last = l.cells[21]!;
    expect(last.y + last.h).toBeCloseTo(box.y + box.h);
  });

  it('leere Liste ergibt keine Zellen', () => {
    expect(tableLayout(box, 0, { minRow: 10, maxRow: 20 }).cells).toEqual([]);
  });
});

describe('Text kürzen und einpassen', () => {
  it('lässt passende Texte unverändert', () => {
    expect(truncateText('ABC', 30, measure)).toBe('ABC');
  });

  it('kürzt mit Ellipse, ohne Leerzeichen davor', () => {
    expect(truncateText('ABCDEFGH', 50, measure)).toBe(`ABCD${ELLIPSIS}`);
    expect(truncateText('AB CDEFG', 40, measure)).toBe(`AB${ELLIPSIS}`);
    expect(measure(truncateText('Ein sehr langer Gamertag', 120, measure))).toBeLessThanOrEqual(120);
  });

  it('liefert einen leeren Text, wenn nicht einmal die Ellipse passt', () => {
    expect(truncateText('ABC', 5, measure)).toBe('');
  });

  it('schneidet keine Emoji/Surrogatpaare entzwei', () => {
    const out = truncateText('😀😀😀😀', 30, measure);
    expect(out).toBe(`😀😀${ELLIPSIS}`);
  });

  it('fitFontSize verkleinert linear bis zur Mindestgröße', () => {
    expect(fitFontSize('ABCD', 400, 100, 20, measureAt)).toBe(100);
    const size = fitFontSize('ABCDEFGHIJ', 500, 100, 20, measureAt);
    expect(size).toBeLessThanOrEqual(50);
    expect(size).toBeGreaterThan(45);
    expect(measureAt('ABCDEFGHIJ', size)).toBeLessThanOrEqual(500);
    expect(fitFontSize('A'.repeat(100), 500, 100, 20, measureAt)).toBe(20);
  });

  it('wrapText bricht an Leerzeichen um und kürzt die letzte Zeile', () => {
    expect(wrapText('Race week in Spielberg', 120, measure, 2)).toEqual(['Race week in', 'Spielberg']);
    const lines = wrapText('eins zwei drei vier fünf sechs', 100, measure, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('eins zwei');
    expect(lines[1]!.endsWith(ELLIPSIS)).toBe(true);
    expect(wrapText('', 100, measure)).toEqual([]);
    // ein zu langes Wort wird gekürzt
    expect(wrapText('Konstrukteurswertung', 100, measure, 1)).toEqual([`Konstrukt${ELLIPSIS}`]);
  });

  it('fitTextBlock: einzeilig groß, sonst umbrechen, zuletzt kürzen', () => {
    expect(fitTextBlock('POLE', 400, { max: 100, min: 40 }, measureAt)).toEqual({ size: 100, lines: ['POLE'], complete: true });
    const two = fitTextBlock('RACE RESULT', 300, { max: 100, min: 30, prefer: 50 }, measureAt, 2);
    expect(two.complete).toBe(true);
    expect(two.lines).toEqual(['RACE', 'RESULT']);
    expect(two.size * 6).toBeLessThanOrEqual(300);
    // ein langes Wort lässt sich nicht umbrechen: einzeilig so groß wie möglich statt Ellipse
    expect(fitTextBlock('KONSTRUKTEURSWERTUNG', 300, { max: 50, min: 10, prefer: 40 }, measureAt, 3)).toEqual({
      size: 15,
      lines: ['KONSTRUKTEURSWERTUNG'],
      complete: true,
    });
    // Umbruch, weil die Schrift dadurch größer wird (einzeilig nur 10 px)
    const wrapped = fitTextBlock('AB CDEFGHIJKLMNOPQRST', 210, { max: 20, min: 5, prefer: 20 }, measureAt, 2);
    expect(wrapped.lines).toEqual(['AB', 'CDEFGHIJKLMNOPQRST']);
    expect(wrapped.size).toBeGreaterThan(10);
    expect(wrapped.size * 18).toBeLessThanOrEqual(210);
    const cut = fitTextBlock('AAAAAAAAAAAAAAAAAAAA BBBBBBBBBBBBBBBBBBBB', 100, { max: 50, min: 20 }, measureAt, 1);
    expect(cut.complete).toBe(false);
    expect(cut.size).toBe(20);
    expect(cut.lines[0]!.endsWith(ELLIPSIS)).toBe(true);
  });

  it('sizeSteps endet genau bei der Mindestgröße, lineHeight rundet', () => {
    const steps = sizeSteps(100, 80);
    expect(steps[0]).toBe(100);
    expect(steps.at(-1)).toBe(80);
    expect(steps.every((s, i) => i === 0 || s < steps[i - 1]!)).toBe(true);
    expect(lineHeight(50)).toBe(56);
  });
});

describe('Hintergrund-Glow (ohne Dithering-Rauschen)', () => {
  it('hexToRgb', () => {
    expect(hexToRgb('#37BE89')).toEqual([0x37, 0xbe, 0x89]);
    expect(hexToRgb('34c4d0')).toEqual([0x34, 0xc4, 0xd0]);
    expect(hexToRgb('kaputt')).toEqual([0, 0, 0]);
  });

  it('Grundfarbe außerhalb, Glowfarbe im Zentrum, deckend', () => {
    const px = glowPixels(10, 10, '#050505', [{ cx: 0.05, cy: 0.05, r: 0.5, color: '#0B6043', alpha: 1 }]);
    expect(px).toHaveLength(400);
    // Pixel (0,0) liegt fast im Zentrum → fast Glowfarbe
    expect(px[1]).toBeGreaterThan(80);
    // Pixel (9,9) liegt außerhalb des Radius → Grundfarbe
    const last = (9 * 10 + 9) * 4;
    expect([px[last], px[last + 1], px[last + 2], px[last + 3]]).toEqual([5, 5, 5, 255]);
    expect(px.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
  });

  it('glatter Verlauf: benachbarte Pixel unterscheiden sich kaum', () => {
    const w = 60;
    const px = glowPixels(w, 40, '#050505', backgroundGlows(false));
    let maxStep = 0;
    for (let x = 1; x < w; x++) maxStep = Math.max(maxStep, Math.abs(px[x * 4 + 1]! - px[(x - 1) * 4 + 1]!));
    expect(maxStep).toBeLessThanOrEqual(3);
  });
});
