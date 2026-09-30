/**
 * Parameter und kleine Rechenhelfer der OBS-Overlays (reine Logik, auch im Browser genutzt):
 * ?lang=de|en&n=10&scale=1&art=fahrer|teams. Ungültige Werte fallen auf Standardwerte zurück,
 * damit eine vertippte URL in OBS nie eine leere Quelle ergibt.
 * Getestet in tests/unit/overlay-params.test.ts.
 */

import type { OverlayLang } from './types';

export const OVERLAY_NAMES = ['naechstes-rennen', 'aufstellung', 'wertung', 'ergebnis', 'ticker'] as const;
export type OverlayName = (typeof OVERLAY_NAMES)[number];

export function isOverlayName(value: string | undefined | null): value is OverlayName {
  return value != null && (OVERLAY_NAMES as readonly string[]).includes(value);
}

export type StandingsArt = 'drivers' | 'teams';

export interface OverlayParams {
  lang: OverlayLang;
  /** Anzahl Zeilen (Top N) */
  n: number;
  /** Vergrößerung für andere Auflösungen (1 = 1920×1080) */
  scale: number;
  /** Nur Wertung: Fahrer oder Teams */
  art: StandingsArt;
}

export const N_MIN = 1;
export const N_MAX = 22;
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 3;

/** Standard-Zeilenzahl je Overlay. */
export const DEFAULT_N: Record<OverlayName, number> = {
  'naechstes-rennen': 1,
  aufstellung: 22,
  wertung: 10,
  ergebnis: 10,
  ticker: 5,
};

/** Welche Parameter ein Overlay auswertet (für kanonische URLs und die Admin-Übersicht). */
export const OVERLAY_PARAMS: Record<OverlayName, ReadonlyArray<'n' | 'art'>> = {
  'naechstes-rennen': [],
  aufstellung: [],
  wertung: ['n', 'art'],
  ergebnis: ['n'],
  ticker: ['n'],
};

const TEAM_WORDS = new Set(['teams', 'team', 'konstrukteure', 'constructors']);

export function parseOverlayParams(name: OverlayName, search: URLSearchParams): OverlayParams {
  const lang: OverlayLang = search.get('lang')?.trim().toLowerCase() === 'en' ? 'en' : 'de';

  const nRaw = search.get('n');
  const nNum = nRaw != null && /^\s*\d{1,3}\s*$/.test(nRaw) ? Number(nRaw) : Number.NaN;
  const n = Number.isFinite(nNum) ? Math.min(N_MAX, Math.max(N_MIN, nNum)) : DEFAULT_N[name];

  const scaleRaw = search.get('scale')?.trim().replace(',', '.');
  const scaleNum = scaleRaw && /^\d{1,2}(\.\d{1,3})?$/.test(scaleRaw) ? Number(scaleRaw) : Number.NaN;
  const scale = Number.isFinite(scaleNum) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, scaleNum)) : 1;

  const art: StandingsArt = TEAM_WORDS.has(search.get('art')?.trim().toLowerCase() ?? '') ? 'teams' : 'drivers';
  return { lang, n, scale, art };
}

/** Kanonische Query: nur die Parameter, die das Overlay auswertet (fester Cache-Schlüssel). */
function query(name: OverlayName, p: OverlayParams, withScale: boolean): string {
  const q = new URLSearchParams({ lang: p.lang });
  if (OVERLAY_PARAMS[name].includes('n')) q.set('n', String(p.n));
  if (OVERLAY_PARAMS[name].includes('art')) q.set('art', p.art === 'teams' ? 'teams' : 'fahrer');
  if (withScale && p.scale !== 1) q.set('scale', String(p.scale));
  return q.toString();
}

/** JSON-Endpunkt eines Overlays, z. B. /api/overlay/wertung.json?lang=de&n=10&art=fahrer */
export function overlayApiPath(name: OverlayName, p: OverlayParams): string {
  return `/api/overlay/${name}.json?${query(name, p, false)}`;
}

/** Seite eines Overlays (Browser-Quelle in OBS). */
export function overlayPagePath(name: OverlayName, p: OverlayParams): string {
  return `/overlay/${name}?${query(name, p, true)}`;
}

// ---------------------------------------------------------------------------
// Polling und Countdown
// ---------------------------------------------------------------------------

/** Abfrage-Intervall der Overlays (Plan: alle 15–30 s). */
export const POLL_MS = 20_000;
const POLL_MAX_MS = 120_000;

/** Wartezeit bis zur nächsten Abfrage: nach Fehlern exponentiell länger (max. 2 min). */
export function nextPollDelay(failures: number, base = POLL_MS): number {
  const f = Math.max(0, Math.min(10, Math.floor(failures)));
  return Math.min(POLL_MAX_MS, base * 2 ** f);
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Restzeit bis zum Start; null, wenn der Start erreicht ist. */
export function countdownParts(targetMs: number, nowMs: number): CountdownParts | null {
  const diff = Math.floor((targetMs - nowMs) / 1000);
  if (!Number.isFinite(diff) || diff <= 0) return null;
  return {
    days: Math.floor(diff / 86_400),
    hours: Math.floor((diff % 86_400) / 3600),
    minutes: Math.floor((diff % 3600) / 60),
    seconds: diff % 60,
  };
}

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Laufband-Dauer: gleichmäßige Geschwindigkeit unabhängig von der Textlänge (≈ 7 Zeichen/s). */
export function tickerSeconds(chars: number): number {
  return Math.max(20, Math.round(chars / 7));
}
