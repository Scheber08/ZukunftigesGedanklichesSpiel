/**
 * Einheitliche Import-Zeile – egal ob aus der UDP-Telemetrie oder aus einer CSV-Datei.
 * Daraus macht `mapImport()` (map.ts) Zeilen der Ergebnis-Eingabe.
 */
import type { ResultStatus, SessionType } from '../db/types';
import { mapGameResultStatus } from './game';
import type { TelemetryResult } from './payload';

export interface ImportRow {
  /** Herkunft für Meldungen: CSV-Zeilennummer bzw. Auto-Index im Spiel (ab 1) */
  line: number;
  position: number | null;
  raceNumber: number | null;
  /** Name im Spiel bzw. Gamertag-Spalte (nur Anzeige, zugeordnet wird über die Nummer) */
  name: string | null;
  status: ResultStatus;
  /** Hinweis zur Status-Übersetzung */
  statusNote: string | null;
  gridPosition: number | null;
  laps: number | null;
  bestLapMs: number | null;
  /** Renndauer inkl. Ingame-Strafen (entspricht der Reihenfolge im Spiel) */
  totalTimeMs: number | null;
  pitStops: number | null;
  penaltyS: number;
  /** Runden Rückstand, falls statt einer Zeit „+1 Runde“ angegeben ist (nur CSV) */
  lapsDown: number | null;
  /** Von der KI gefahren (nur Telemetrie) */
  ai: boolean;
  /** Team-ID im Spiel (nur Telemetrie) */
  gameTeamId: number | null;
}

export interface NormalizeResult {
  rows: ImportRow[];
  /** Zeilen, die gar nicht übernommen werden können (z. B. ungültiger Status) */
  skipped: string[];
}

/**
 * Telemetrie-Ergebnis → Import-Zeilen. Gesamtzeit = Rennzeit + Ingame-Strafsekunden
 * (so passt sie zur Reihenfolge der Final Classification).
 */
export function normalizeTelemetry(results: readonly TelemetryResult[], sessionType: SessionType): NormalizeResult {
  const rows: ImportRow[] = [];
  const skipped: string[] = [];
  const sorted = [...results].filter((r) => r.position >= 1).sort((a, b) => a.position - b.position || a.carIndex - b.carIndex);
  for (const r of sorted) {
    const mapped = mapGameResultStatus(r.resultStatus, r.resultReason, sessionType);
    const label = `P${r.position} #${r.raceNumber ?? '?'}${r.name ? ` ${r.name}` : ''}`;
    if (!mapped.status) {
      skipped.push(`${label}: ${mapped.note ?? 'nicht übernommen'}`);
      continue;
    }
    const penaltyS = r.penaltiesS ?? 0;
    const race = sessionType !== 'qualifying';
    const finished = mapped.status === 'classified';
    rows.push({
      line: r.carIndex + 1,
      position: r.position,
      raceNumber: r.raceNumber != null && r.raceNumber > 0 ? r.raceNumber : null,
      name: r.name ?? null,
      status: mapped.status,
      statusNote: mapped.note,
      gridPosition: race && r.gridPosition != null && r.gridPosition > 0 ? r.gridPosition : null,
      laps: race && r.numLaps != null ? r.numLaps : null,
      bestLapMs: r.bestLapMs != null && r.bestLapMs > 0 ? r.bestLapMs : null,
      totalTimeMs: race && finished && r.totalRaceTimeMs != null && r.totalRaceTimeMs > 0 ? r.totalRaceTimeMs + penaltyS * 1000 : null,
      pitStops: race && r.numPitStops != null ? r.numPitStops : null,
      penaltyS: race ? penaltyS : 0,
      lapsDown: null,
      ai: r.aiControlled,
      gameTeamId: r.teamId ?? null,
    });
  }
  return { rows, skipped };
}
