/**
 * Datenformate der OBS-Overlays (Plan Phase 2): Antworten von /api/overlay/<name>.json.
 * Nur öffentliche Angaben (Gamertag, Team, Startnummer, Punkte, Platzierung) – keine
 * E-Mails, Discord-Namen, EA-IDs oder Notizen. Wird von Server (src/lib/server/live-data.ts)
 * und Browser-Skript (./client.ts) gemeinsam genutzt, daher hier ohne Server-Importe.
 */

import type { RoundFormat, RoundStatus } from '~/lib/db/types';

export type OverlayLang = 'de' | 'en';

/** Runde für die Anzeige: Texte schon in der angefragten Sprache formatiert (Liga-Zeit). */
export interface OverlayRound {
  seasonName: string;
  number: number;
  /** „R6 · Spielberg“ (Plan §9.1: keine offiziellen Event-Titel) */
  label: string;
  trackName: string;
  countryCode: string;
  countryName: string;
  /** ISO-Zeitpunkt des Starts (für den Countdown im Browser) */
  startUtc: string;
  /** „Mi., 7. Oktober 2026 · 20:00 MESZ“ */
  dateText: string;
  format: RoundFormat;
  formatText: string | null;
  status: RoundStatus;
  statusText: string;
  /** Pfad der Rennseite in der Sprache */
  path: string;
}

export type OverlayMark = 'pole' | 'fastestLap' | 'reserve';

/** Zeile einer Wertungs- oder Ergebnisliste. */
export interface OverlayLine {
  /** „1“, „=3“, „DNF“ */
  pos: string;
  number: number | null;
  /** Gamertag bzw. Teamname */
  name: string;
  /** Team des Fahrers (bei Teamwertung null) */
  team: string | null;
  /** Teamfarbe (#RRGGBB) für den 4-px-Streifen */
  color: string | null;
  /** Punkte als Text */
  value: string;
  /** Abstand/Zeit/Status */
  detail: string | null;
  marks: OverlayMark[];
}

export interface NextRacePayload {
  kind: 'next';
  generatedAt: string;
  round: OverlayRound | null;
}

export interface LineupPayload {
  kind: 'lineup';
  generatedAt: string;
  round: OverlayRound | null;
  /** false = Aufstellung noch nicht veröffentlicht */
  published: boolean;
  teams: Array<{
    name: string;
    short: string;
    color: string;
    drivers: Array<{ number: number | null; name: string; reserve: boolean; replaces: string | null }>;
  }>;
}

export interface StandingsPayload {
  kind: 'standings';
  generatedAt: string;
  art: 'drivers' | 'teams';
  seasonName: string | null;
  /** Stand nach Runde X (null = noch keine gewertete Runde) */
  afterRound: number | null;
  rows: OverlayLine[];
}

export interface ResultPayload {
  kind: 'result';
  generatedAt: string;
  round: OverlayRound | null;
  /** Ergebnis-Status (vorläufig/final/korrigiert) als Text */
  statusText: string | null;
  rows: OverlayLine[];
}

export interface TickerPayload {
  kind: 'ticker';
  generatedAt: string;
  items: string[];
}

export type OverlayPayload = NextRacePayload | LineupPayload | StandingsPayload | ResultPayload | TickerPayload;

/** Feste Beschriftungen je Overlay (vom Server in der Sprache in die Seite geschrieben). */
export interface OverlayLabels {
  /** Liganame (Laufband-Etikett) */
  brand: string;
  nextRace: string;
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  live: string;
  noRace: string;
  lineup: string;
  lineupPending: string;
  reserveShort: string;
  replaces: string;
  standingsDrivers: string;
  standingsTeams: string;
  afterRound: string;
  noStandings: string;
  result: string;
  noResult: string;
  pointsShort: string;
  pole: string;
  fastestLap: string;
  tickerEmpty: string;
  stale: string;
}

/** Konfiguration in der Overlay-Seite (<script type="application/json" id="overlay-config">). */
export interface OverlayConfig {
  name: string;
  endpoint: string;
  intervalMs: number;
  lang: OverlayLang;
  labels: OverlayLabels;
  initial: OverlayPayload | null;
}
