/**
 * OBS-Overlays – Parameter und Rechenhelfer (src/components/overlay/params.ts):
 * robuste Standardwerte bei vertippten URLs, kanonische URLs (Cache-Schlüssel),
 * Countdown, Polling mit Backoff, Laufband-Dauer.
 */
import { describe, expect, it } from 'vitest';
import {
  countdownParts,
  DEFAULT_N,
  isOverlayName,
  nextPollDelay,
  OVERLAY_NAMES,
  overlayApiPath,
  overlayPagePath,
  pad2,
  parseOverlayParams,
  POLL_MS,
  tickerSeconds,
} from '~/components/overlay/params';

const q = (s: string) => new URLSearchParams(s);

describe('Overlay-Namen', () => {
  it('kennt genau die fünf Overlays', () => {
    expect(OVERLAY_NAMES).toEqual(['naechstes-rennen', 'aufstellung', 'wertung', 'ergebnis', 'ticker']);
    expect(isOverlayName('wertung')).toBe(true);
    expect(isOverlayName('Wertung')).toBe(false);
    expect(isOverlayName('../admin')).toBe(false);
    expect(isOverlayName(undefined)).toBe(false);
  });
});

describe('parseOverlayParams', () => {
  it('Standardwerte ohne Parameter', () => {
    expect(parseOverlayParams('wertung', q(''))).toEqual({ lang: 'de', n: 10, scale: 1, art: 'drivers' });
    expect(parseOverlayParams('ticker', q('')).n).toBe(DEFAULT_N.ticker);
  });

  it('Sprache: nur en schaltet um', () => {
    expect(parseOverlayParams('wertung', q('lang=en')).lang).toBe('en');
    expect(parseOverlayParams('wertung', q('lang=EN')).lang).toBe('en');
    expect(parseOverlayParams('wertung', q('lang=fr')).lang).toBe('de');
  });

  it('n wird auf 1–22 begrenzt, Unsinn ergibt den Standard', () => {
    expect(parseOverlayParams('wertung', q('n=5')).n).toBe(5);
    expect(parseOverlayParams('wertung', q('n=0')).n).toBe(1);
    expect(parseOverlayParams('wertung', q('n=99')).n).toBe(22);
    expect(parseOverlayParams('wertung', q('n=abc')).n).toBe(10);
    expect(parseOverlayParams('wertung', q('n=-3')).n).toBe(10);
    expect(parseOverlayParams('wertung', q('n=1e3')).n).toBe(10);
  });

  it('scale 0,5–3, Komma erlaubt', () => {
    expect(parseOverlayParams('wertung', q('scale=1.5')).scale).toBe(1.5);
    expect(parseOverlayParams('wertung', q('scale=0,67')).scale).toBe(0.67);
    expect(parseOverlayParams('wertung', q('scale=0.1')).scale).toBe(0.5);
    expect(parseOverlayParams('wertung', q('scale=10')).scale).toBe(3);
    expect(parseOverlayParams('wertung', q('scale=calc(2)')).scale).toBe(1);
    expect(parseOverlayParams('wertung', q('scale=Infinity')).scale).toBe(1);
  });

  it('art: Teams in mehreren Schreibweisen, sonst Fahrer', () => {
    for (const v of ['teams', 'team', 'Konstrukteure', 'constructors']) expect(parseOverlayParams('wertung', q(`art=${v}`)).art).toBe('teams');
    for (const v of ['fahrer', 'drivers', '', 'x']) expect(parseOverlayParams('wertung', q(`art=${v}`)).art).toBe('drivers');
  });
});

describe('Kanonische URLs', () => {
  it('API-Pfad nur mit ausgewerteten Parametern (fester Cache-Schlüssel)', () => {
    const p = parseOverlayParams('naechstes-rennen', q('lang=en&n=7&art=teams&scale=2&foo=bar'));
    expect(overlayApiPath('naechstes-rennen', p)).toBe('/api/overlay/naechstes-rennen.json?lang=en');
    const w = parseOverlayParams('wertung', q('art=team&n=5'));
    expect(overlayApiPath('wertung', w)).toBe('/api/overlay/wertung.json?lang=de&n=5&art=teams');
    expect(overlayApiPath('ergebnis', parseOverlayParams('ergebnis', q('art=teams')))).toBe('/api/overlay/ergebnis.json?lang=de&n=10');
  });

  it('Seiten-Pfad behält scale (nur wenn ≠ 1)', () => {
    const p = parseOverlayParams('ticker', q('scale=1.5&lang=en'));
    expect(overlayPagePath('ticker', p)).toBe('/overlay/ticker?lang=en&n=5&scale=1.5');
    expect(overlayPagePath('aufstellung', parseOverlayParams('aufstellung', q('')))).toBe('/overlay/aufstellung?lang=de');
  });
});

describe('Countdown und Polling', () => {
  it('zerlegt die Restzeit in Tage/Std./Min./Sek.', () => {
    const now = Date.UTC(2026, 9, 1, 12, 0, 0);
    const target = now + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000 + 999;
    expect(countdownParts(target, now)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(countdownParts(now, now)).toBeNull();
    expect(countdownParts(now - 1000, now)).toBeNull();
    expect(countdownParts(Number.NaN, now)).toBeNull();
    expect(pad2(3)).toBe('03');
    expect(pad2(12)).toBe('12');
  });

  it('Polling alle 20 s, nach Fehlern länger (max. 2 min)', () => {
    expect(POLL_MS).toBeGreaterThanOrEqual(15_000);
    expect(POLL_MS).toBeLessThanOrEqual(30_000);
    expect(nextPollDelay(0)).toBe(POLL_MS);
    expect(nextPollDelay(1)).toBe(2 * POLL_MS);
    expect(nextPollDelay(2)).toBe(4 * POLL_MS);
    expect(nextPollDelay(50)).toBe(120_000);
    expect(nextPollDelay(-1)).toBe(POLL_MS);
  });

  it('Laufband: mindestens 20 s, länger bei mehr Text', () => {
    expect(tickerSeconds(10)).toBe(20);
    expect(tickerSeconds(700)).toBe(100);
  });
});
