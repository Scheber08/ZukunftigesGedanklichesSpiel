/**
 * Social-Grafiken: Dateinamen, PNG-Prüfung (Action admin.graphicsSend), Schriften und SVG-Helfer.
 */
import { describe, expect, it } from 'vitest';
import { swirlPathData } from '~/lib/graphics/draw';
import {
  checkPngUpload,
  formatBytes,
  graphicFileName,
  hasPngSignature,
  MAX_GRAPHIC_BYTES,
  pngDimensions,
  safePngName,
  slugPart,
} from '~/lib/graphics/files';
import { canvasFont, firstFontFamily, fontLoadSpecs, quoteFamily, resolveFamilies } from '~/lib/graphics/fonts';
import { svgAspect, withSvgSize } from '~/lib/graphics/svg';

/** Minimaler PNG-Kopf: Signatur + IHDR mit Breite/Höhe */
function pngHead(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('Dateinamen', () => {
  it('folgt dem Muster motiv-saison-runde-format.png', () => {
    expect(graphicFileName({ motif: 'ergebnis', season: 2, key: 'r4', format: 'instagram', lang: 'de' })).toBe('ergebnis-s2-r4-instagram.png');
    expect(graphicFileName({ motif: 'wertung-fahrer', season: 1, key: 'r12', format: 'story', lang: 'en' })).toBe('wertung-fahrer-s1-r12-story-en.png');
    expect(graphicFileName({ motif: 'neuzugang', season: 2, key: 'Jörg Übermut', format: 'og', lang: 'de' })).toBe('neuzugang-s2-joerg-uebermut-og.png');
  });

  it('slugPart entfernt Sonderzeichen und Akzente', () => {
    expect(slugPart('Pérez_Straße!!')).toBe('perez-strasse');
    expect(slugPart('  --  ')).toBe('');
  });

  it('safePngName schützt vor Pfaden und fremden Endungen', () => {
    expect(safePngName('ergebnis-s2-r4-instagram.png')).toBe('ergebnis-s2-r4-instagram.png');
    expect(safePngName('../../etc/passwd')).toBe('passwd.png');
    expect(safePngName('C:\\temp\\Grafik Ü.PNG')).toBe('grafik-ue.png');
    expect(safePngName('')).toBe('grafik.png');
    expect(safePngName(null)).toBe('grafik.png');
    expect(safePngName('<script>.png')).toBe('script.png');
  });
});

describe('PNG-Prüfung', () => {
  it('erkennt Signatur und Maße', () => {
    const head = pngHead(1080, 1350);
    expect(hasPngSignature(head)).toBe(true);
    expect(pngDimensions(head)).toEqual({ width: 1080, height: 1350 });
    expect(hasPngSignature(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
    expect(pngDimensions(new Uint8Array(10))).toBeNull();
  });

  it('akzeptiert Grafiken in den bekannten Formaten', () => {
    expect(checkPngUpload({ size: 200_000, type: 'image/png' }, pngHead(1280, 720))).toEqual({ ok: true, width: 1280, height: 720 });
  });

  it('lehnt leere, zu große, falsche und fremde Dateien ab', () => {
    expect(checkPngUpload({ size: 0, type: 'image/png' }, pngHead(1080, 1350))).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
    expect(checkPngUpload({ size: MAX_GRAPHIC_BYTES + 1, type: 'image/png' }, pngHead(1080, 1350))).toMatchObject({ ok: false, code: 'CONTENT_TOO_LARGE' });
    expect(checkPngUpload({ size: 100, type: 'image/jpeg' }, pngHead(1080, 1350))).toMatchObject({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
    // als PNG deklariert, aber kein PNG
    expect(checkPngUpload({ size: 100, type: 'image/png' }, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
    // PNG ohne IHDR direkt nach der Signatur
    const broken = pngHead(1080, 1350);
    broken[12] = 0x41;
    expect(checkPngUpload({ size: 100, type: 'image/png' }, broken)).toMatchObject({ ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
    // beliebiges Bild statt einer erzeugten Grafik
    expect(checkPngUpload({ size: 100, type: 'image/png' }, pngHead(4000, 3000))).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
  });

  it('formatBytes für Statusmeldungen', () => {
    expect(formatBytes(512)).toBe('1 KB');
    expect(formatBytes(412 * 1024)).toBe('412 KB');
    expect(formatBytes(1.6 * 1024 * 1024)).toBe('1,6 MB');
  });
});

describe('Schriften (Astro-Familiennamen aus den CSS-Variablen)', () => {
  const titillium = '"Titillium Web-634993bbc8e321a5", "Titillium Web-634993bbc8e321a5 fallback: Arial", system-ui, sans-serif';
  const inter = 'Inter-b50c61ceea3fab36, "Inter-b50c61ceea3fab36 fallback: Arial", system-ui, sans-serif';

  it('liest den ersten Familiennamen, mit und ohne Anführungszeichen', () => {
    expect(firstFontFamily(titillium)).toBe('Titillium Web-634993bbc8e321a5');
    expect(firstFontFamily(` ${inter}`)).toBe('Inter-b50c61ceea3fab36');
    expect(firstFontFamily("'Font \\'X\\'', serif")).toBe("Font 'X'");
    expect(firstFontFamily('system-ui, sans-serif')).toBeNull();
    expect(firstFontFamily('')).toBeNull();
    expect(firstFontFamily(null)).toBeNull();
  });

  it('fällt auf die bekannten Namen zurück, wenn die Variable fehlt', () => {
    expect(resolveFamilies((v) => (v === '--font-titillium' ? titillium : ''))).toEqual({ display: 'Titillium Web-634993bbc8e321a5', text: 'Inter' });
    expect(resolveFamilies(() => undefined)).toEqual({ display: 'Titillium Web', text: 'Inter' });
  });

  it('baut Canvas-Schriftangaben und Ladeangaben', () => {
    expect(quoteFamily('A "B"')).toBe('"A \\"B\\""');
    expect(canvasFont(900, 96.456, 'Titillium Web-6349')).toBe('900 96.46px "Titillium Web-6349", system-ui, sans-serif');
    const specs = fontLoadSpecs({ display: 'T', text: 'I' });
    expect(specs).toContain('900 64px "T"');
    expect(specs).toContain('700 64px "T"');
    expect(specs).toContain('400 32px "I"');
    expect(specs).toHaveLength(7);
  });
});

describe('SVG-Helfer und Wirbel-Motiv', () => {
  const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><path d="M0 0"/></svg>';

  it('setzt feste Maße am Wurzelelement', () => {
    const out = withSvgSize(logo, 256, 256);
    expect(out).toMatch(/^<svg width="256" height="256" xmlns=/);
    expect(out).toContain('viewBox="0 0 64 64"');
    const replaced = withSvgSize('<svg width="10" height="20" viewBox="0 0 30 20"></svg>', 150, 100);
    expect(replaced).toContain('width="150" height="100"');
    expect(replaced).not.toContain('width="10"');
    expect(replaced).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(withSvgSize('kein svg', 1, 1)).toBe('kein svg');
  });

  it('liest das Seitenverhältnis', () => {
    expect(svgAspect(logo)).toBe(1);
    expect(svgAspect('<svg viewBox="0 0 640 480"></svg>')).toBeCloseTo(4 / 3);
    expect(svgAspect('<svg width="300" height="100"></svg>')).toBe(3);
    expect(svgAspect('<svg></svg>')).toBe(1);
  });

  it('Wirbel wie im Logo: Viertelbögen mit wachsendem Radius im Uhrzeigersinn', () => {
    // Innenwirbel des Logos: a3 3 … 3-3, a6 6 … 6 6, a9 9 … -9 9, a12 12 … -12-12, a15 15 … 15-15
    expect(swirlPathData(5, 3)).toBe('M0 0 a3 3 0 0 1 3 -3 a6 6 0 0 1 6 6 a9 9 0 0 1 -9 9 a12 12 0 0 1 -12 -12 a15 15 0 0 1 15 -15');
  });
});
