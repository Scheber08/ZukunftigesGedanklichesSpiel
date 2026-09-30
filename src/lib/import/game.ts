/**
 * Spielcodes der F1-25-Telemetrie (Plan Phase 2) und ihre Übersetzung in Liga-Werte.
 * Gegenstück zu tools/telemetry/f1-packets.mjs (dort das Dekodieren der Pakete).
 * Reine Daten/Funktionen – im Worker (Endpunkt) und im Admin nutzbar.
 */
import type { ResultStatus, SessionType } from '../db/types';

export type GameSessionKind = 'practice' | 'qualifying' | 'sprint_shootout' | 'race' | 'time_trial' | 'unknown';

/** Art der Session aus dem Session-Typ des Spiels (F1 24/25). */
export function gameSessionKind(sessionType: number): GameSessionKind {
  if (sessionType >= 1 && sessionType <= 4) return 'practice';
  if (sessionType >= 5 && sessionType <= 9) return 'qualifying';
  if (sessionType >= 10 && sessionType <= 14) return 'sprint_shootout';
  if (sessionType >= 15 && sessionType <= 17) return 'race';
  if (sessionType === 18) return 'time_trial';
  return 'unknown';
}

export const GAME_SESSION_TYPE_LABEL: Readonly<Record<number, string>> = {
  0: 'Unbekannt',
  1: 'Training 1',
  2: 'Training 2',
  3: 'Training 3',
  4: 'Kurzes Training',
  5: 'Q1',
  6: 'Q2',
  7: 'Q3',
  8: 'Kurzes Qualifying',
  9: 'Ein-Runden-Qualifying',
  10: 'Sprint-Shootout 1',
  11: 'Sprint-Shootout 2',
  12: 'Sprint-Shootout 3',
  13: 'Kurzes Sprint-Shootout',
  14: 'Ein-Runden-Sprint-Shootout',
  15: 'Rennen',
  16: 'Rennen 2',
  17: 'Rennen 3',
  18: 'Zeitfahren',
};

export function gameSessionLabel(sessionType: number | null | undefined): string {
  if (sessionType == null) return 'unbekannte Session';
  return GAME_SESSION_TYPE_LABEL[sessionType] ?? `Session-Typ ${sessionType}`;
}

/** Strecken laut Spezifikation – nur für verständliche Meldungen (Zuordnung über tracks.game_track_id). */
export const GAME_TRACK_LABEL: Readonly<Record<number, string>> = {
  0: 'Melbourne',
  1: 'Paul Ricard',
  2: 'Shanghai',
  3: 'Sakhir',
  4: 'Barcelona',
  5: 'Monaco',
  6: 'Montreal',
  7: 'Silverstone',
  8: 'Hockenheim',
  9: 'Budapest',
  10: 'Spa-Francorchamps',
  11: 'Monza',
  12: 'Singapur',
  13: 'Suzuka',
  14: 'Abu Dhabi',
  15: 'Austin',
  16: 'São Paulo',
  17: 'Spielberg',
  18: 'Sotschi',
  19: 'Mexiko-Stadt',
  20: 'Baku',
  21: 'Sakhir (kurz)',
  22: 'Silverstone (kurz)',
  23: 'Austin (kurz)',
  24: 'Suzuka (kurz)',
  25: 'Hanoi',
  26: 'Zandvoort',
  27: 'Imola',
  28: 'Portimão',
  29: 'Dschidda',
  30: 'Miami',
  31: 'Las Vegas',
  32: 'Lusail',
  39: 'Silverstone (rückwärts)',
  40: 'Spielberg (rückwärts)',
  41: 'Zandvoort (rückwärts)',
};

export function gameTrackLabel(trackId: number | null | undefined): string {
  if (trackId == null || trackId < 0) return 'unbekannte Strecke';
  return GAME_TRACK_LABEL[trackId] ?? `Strecken-ID ${trackId}`;
}

/** m_resultStatus der Final Classification */
export const GAME_RESULT_STATUS_LABEL: Readonly<Record<number, string>> = {
  0: 'ungültig',
  1: 'inaktiv',
  2: 'aktiv',
  3: 'im Ziel',
  4: 'nicht im Ziel',
  5: 'disqualifiziert',
  6: 'nicht gewertet',
  7: 'aufgegeben',
};

/** m_resultReason (ab UDP-Format 2025) */
export const GAME_RESULT_REASON_LABEL: Readonly<Record<number, string>> = {
  0: 'ungültig',
  1: 'aufgegeben',
  2: 'im Ziel',
  3: 'Totalschaden',
  4: 'inaktiv',
  5: 'zu wenige Runden',
  6: 'schwarze Flagge',
  7: 'rote Flagge',
  8: 'technischer Defekt',
  9: 'Session übersprungen',
  10: 'Session simuliert',
};

export interface StatusMapping {
  /** null = Zeile nicht übernehmen (ungültiger Eintrag) */
  status: ResultStatus | null;
  /** Hinweis für die Prüfung, wenn die Übersetzung nicht eindeutig ist */
  note: string | null;
}

/**
 * Spielstatus → Liga-Status.
 *
 *   3 im Ziel        → gewertet
 *   4 nicht im Ziel  → DNF
 *   5 disqualifiziert→ DSQ
 *   6 nicht gewertet → NC (dnc)
 *   7 aufgegeben     → DNF
 *   1 inaktiv        → DNS (hat nicht teilgenommen) – mit Hinweis
 *   2 aktiv          → gewertet, mit Hinweis: bei Sessionende noch unterwegs (z. B. Session vom Host beendet)
 *   0 ungültig       → nicht übernommen
 *
 * Der Grund (ab 2025) verfeinert: „zu wenige Runden“ → NC, „schwarze Flagge“ → DSQ,
 * „Session übersprungen/simuliert“ → Hinweis. Im Qualifying zählt „aktiv“ ohne Hinweis als gewertet.
 */
export function mapGameResultStatus(status: number, reason: number | null | undefined, sessionType: SessionType): StatusMapping {
  const reasonText = reason != null && reason !== 2 && reason !== 0 ? GAME_RESULT_REASON_LABEL[reason] : undefined;
  if (reason === 9 || reason === 10) {
    return { status: status === 3 ? 'classified' : 'dnf', note: `Spiel meldet „${reasonText}“ – bitte prüfen` };
  }
  switch (status) {
    case 3:
      return { status: 'classified', note: null };
    case 4:
    case 7:
      // Grund eines Ausfalls (Totalschaden, Defekt …) ist kein Prüfhinweis
      if (reason === 5) return { status: 'dnc', note: null };
      if (reason === 6) return { status: 'dsq', note: 'vom Spiel disqualifiziert (schwarze Flagge) – bitte prüfen' };
      return { status: 'dnf', note: null };
    case 5:
      return { status: 'dsq', note: `vom Spiel disqualifiziert${reasonText ? ` (${reasonText})` : ''} – bitte prüfen` };
    case 6:
      return { status: 'dnc', note: null };
    case 2:
      return sessionType === 'qualifying'
        ? { status: 'classified', note: null }
        : { status: 'classified', note: 'bei Sessionende noch unterwegs (Spielstatus „aktiv“) – bitte prüfen' };
    case 1:
      return { status: 'dns', note: 'Spielstatus „inaktiv“ – als DNS übernommen, bitte prüfen' };
    default:
      return { status: null, note: `ungültiger Spielstatus ${status}` };
  }
}

/** Plattform-Codes (nur zur Anzeige in der Prüfung). */
export const GAME_PLATFORM_LABEL: Readonly<Record<number, string>> = {
  1: 'Steam',
  3: 'PlayStation',
  4: 'Xbox',
  6: 'EA App',
  255: 'unbekannt',
};
