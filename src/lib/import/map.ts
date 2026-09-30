/**
 * Zuordnung eines Imports zur Aufstellung der Runde (Plan §5.2: „die Fahrer werden über die
 * Startnummer zugeordnet“). Ergebnis sind Zeilen der Ergebnis-Eingabe (EditorRow) – der Import
 * führt so in denselben Prüfbildschirm wie die Handeingabe.
 *
 * Reihenfolge der Zuordnung je Startnummer:
 *   1. Eintrag der Aufstellung mit dieser Nummer (round_entries bzw. Saisonaufstellung)
 *   2. Fahrer, dem die Nummer zum Rundenstart gehört (driver_numbers) – nur, wenn er in der
 *      Aufstellung steht; sonst Warnung „nicht in der Aufstellung“
 * Warnungen: KI-Fahrer, fehlende/unbekannte/doppelte Nummern, doppelte Fahrer, Aufstellungsfahrer
 * ohne Import-Zeile, abweichendes Team im Spiel, unsichere Status-Übersetzung.
 * Reine Funktion – im Browser (CSV-Vorschau) und auf dem Server.
 */
import { formatGapInput, type EditorRow } from '../admin/raceday/results-map';
import type { EntryRole, Id, ResultStatus, SessionType } from '../db/types';
import { formatLapTime } from '../domain/laptime';
import type { ImportRow } from './rows';

export interface MapEntry {
  id: Id | null;
  driver_id: Id;
  team_id: Id;
  role: EntryRole;
  race_number: number | null;
}

export interface MapContext {
  sessionType: SessionType;
  /** Aufstellung der Runde (oder Saisonaufstellung, wenn noch keine gespeichert ist) */
  entries: MapEntry[];
  lineupSource: 'round' | 'season';
  /** Startnummern, die zum Rundenstart gültig sind (driver_numbers) */
  numberHolders: Array<{ number: number; driverId: Id }>;
  /** Anzeigenamen der Fahrer (id → Gamertag) */
  driverNames: Record<number, string>;
  /** Team-ID im Spiel je Liga-Team (teams.game_team_id) */
  teamGameIds: Record<number, number | null>;
}

export type ImportWarningCode =
  | 'no_lineup'
  | 'ai_ignored'
  | 'ai_driven'
  | 'no_number'
  | 'unknown_number'
  | 'duplicate_number'
  | 'duplicate_driver'
  | 'not_in_lineup'
  | 'missing'
  | 'team_mismatch'
  | 'status_note'
  | 'skipped';

export interface ImportWarning {
  code: ImportWarningCode;
  message: string;
}

export interface MappedLine {
  line: number;
  position: number | null;
  raceNumber: number | null;
  name: string | null;
  ai: boolean;
  status: ResultStatus;
  /** Zugeordneter Fahrer (null = nicht übernommen) */
  driverId: Id | null;
}

export interface MappingResult {
  rows: EditorRow[];
  lines: MappedLine[];
  warnings: ImportWarning[];
  matched: number;
  total: number;
  /** Fahrer der Aufstellung ohne Import-Zeile */
  missing: Id[];
}

/** Echte Teams im Spiel (generische/eigene Teams ab 41 werden nicht verglichen) */
const MAX_REAL_GAME_TEAM_ID = 40;

const timeText = (ms: number | null): string => (ms == null || ms <= 0 ? '' : formatLapTime(ms));

function who(row: ImportRow): string {
  return `#${row.raceNumber ?? '?'}${row.name ? ` (${row.name})` : ''}`;
}

export function mapImport(rows: readonly ImportRow[], ctx: MapContext, skipped: readonly string[] = []): MappingResult {
  const warnings: ImportWarning[] = [];
  const name = (id: Id) => ctx.driverNames[id] ?? `Fahrer #${id}`;
  if (ctx.lineupSource === 'season') {
    warnings.push({
      code: 'no_lineup',
      message: 'Für diese Runde ist keine Aufstellung gespeichert – zugeordnet wurde über die Saisonaufstellung. Ersatzfahrer bitte zuerst im Grid-Builder eintragen.',
    });
  }
  for (const s of skipped) warnings.push({ code: 'skipped', message: `Nicht übernommen: ${s}` });

  const entryByNumber = new Map<number, MapEntry>();
  for (const e of ctx.entries) if (e.race_number != null && !entryByNumber.has(e.race_number)) entryByNumber.set(e.race_number, e);
  const entryByDriver = new Map(ctx.entries.map((e) => [e.driver_id, e]));
  const holderByNumber = new Map(ctx.numberHolders.map((h) => [h.number, h.driverId]));

  // Doppelte Nummern: bei genau einem menschlichen Fahrer gewinnt er, sonst ist die Nummer nicht eindeutig
  const byNumber = new Map<number, ImportRow[]>();
  for (const r of rows) {
    if (r.raceNumber == null) continue;
    byNumber.set(r.raceNumber, [...(byNumber.get(r.raceNumber) ?? []), r]);
  }
  const ambiguous = new Set<number>();
  const shadowedAi = new Set<ImportRow>();
  for (const [n, list] of byNumber) {
    if (list.length < 2) continue;
    const humans = list.filter((r) => !r.ai);
    if (humans.length === 1) {
      for (const r of list) if (r.ai) shadowedAi.add(r);
    } else if (humans.length > 1) {
      ambiguous.add(n);
      warnings.push({
        code: 'duplicate_number',
        message: `Startnummer #${n} kommt ${list.length}× vor (${list.map((r) => r.name ?? `Zeile ${r.line}`).join(', ')}) – nicht eindeutig, bitte manuell eintragen.`,
      });
    }
  }

  const leaderLaps = Math.max(0, ...rows.filter((r) => r.status === 'classified' && r.laps != null).map((r) => r.laps!));
  const lines: MappedLine[] = [];
  const out: EditorRow[] = [];
  const used = new Set<Id>();
  const teamMismatches: string[] = [];

  for (const r of rows) {
    const line: MappedLine = { line: r.line, position: r.position, raceNumber: r.raceNumber, name: r.name, ai: r.ai, status: r.status, driverId: null };
    lines.push(line);
    const label = who(r);
    if (shadowedAi.has(r)) {
      warnings.push({ code: 'ai_ignored', message: `KI-Auto ${label} ignoriert (Nummer gehört einem menschlichen Fahrer).` });
      continue;
    }
    if (r.raceNumber == null) {
      warnings.push(
        r.ai
          ? { code: 'ai_ignored', message: `KI-Auto ${label} ignoriert.` }
          : { code: 'no_number', message: `Zeile ${r.line}${r.name ? ` (${r.name})` : ''}: keine Startnummer – nicht zugeordnet.` },
      );
      continue;
    }
    if (ambiguous.has(r.raceNumber)) continue;

    let entry = entryByNumber.get(r.raceNumber);
    if (!entry) {
      const holder = holderByNumber.get(r.raceNumber);
      if (holder != null) {
        entry = entryByDriver.get(holder);
        if (!entry) {
          warnings.push({
            code: 'not_in_lineup',
            message: `${label}: ${name(holder)} steht nicht in der Aufstellung dieser Runde – bitte im Grid-Builder eintragen und den Import erneut übernehmen.`,
          });
          continue;
        }
      }
    }
    if (!entry) {
      warnings.push(
        r.ai
          ? { code: 'ai_ignored', message: `KI-Auto ${label} ignoriert.` }
          : { code: 'unknown_number', message: `${label}: Startnummer gehört zu keinem Fahrer der Aufstellung – nicht zugeordnet.` },
      );
      continue;
    }
    if (used.has(entry.driver_id)) {
      warnings.push({ code: 'duplicate_driver', message: `${label}: ${name(entry.driver_id)} ist schon zugeordnet – Zeile übersprungen.` });
      continue;
    }
    used.add(entry.driver_id);
    line.driverId = entry.driver_id;

    if (r.ai) {
      warnings.push({
        code: 'ai_driven',
        message: `${label} → ${name(entry.driver_id)}: Auto war (zeitweise) KI-gesteuert, z. B. nach Verbindungsabbruch – bitte prüfen.`,
      });
    }
    const expectedGameTeam = ctx.teamGameIds[entry.team_id] ?? null;
    if (r.gameTeamId != null && r.gameTeamId <= MAX_REAL_GAME_TEAM_ID && expectedGameTeam != null && r.gameTeamId !== expectedGameTeam) {
      teamMismatches.push(`#${r.raceNumber} ${name(entry.driver_id)}`);
    }
    if (r.statusNote) warnings.push({ code: 'status_note', message: `${label} → ${name(entry.driver_id)}: ${r.statusNote}` });

    const race = ctx.sessionType !== 'qualifying';
    const lapsDown =
      r.lapsDown ?? (r.status === 'classified' && r.laps != null && leaderLaps > 0 && r.laps < leaderLaps ? leaderLaps - r.laps : null);
    out.push({
      driverId: entry.driver_id,
      teamId: entry.team_id,
      role: entry.role,
      roundEntryId: entry.id,
      raceNumber: entry.race_number ?? r.raceNumber,
      status: r.status,
      gridPosition: race ? r.gridPosition : null,
      laps: race ? r.laps : null,
      bestLap: timeText(r.bestLapMs),
      totalTime: race ? timeText(r.totalTimeMs) : '',
      gap: race && r.gapMs != null && !(lapsDown != null && lapsDown > 0) ? formatGapInput(r.gapMs) : '',
      gapLaps: race && lapsDown != null && lapsDown > 0 ? lapsDown : null,
      pitStops: race ? r.pitStops : null,
      ingamePenaltyS: race ? r.penaltyS : 0,
    });
  }

  if (teamMismatches.length > 0) {
    warnings.push({
      code: 'team_mismatch',
      message:
        teamMismatches.length === 1
          ? `${teamMismatches[0]} fuhr im Spiel für ein anderes Team als in der Aufstellung (gewertet wird das Team der Aufstellung).`
          : `${teamMismatches.length} Fahrer fuhren im Spiel für ein anderes Team als in der Aufstellung (gewertet wird das Team der Aufstellung): ${teamMismatches.join(', ')}.`,
    });
  }

  const missing = ctx.entries.filter((e) => !used.has(e.driver_id)).map((e) => e.driver_id);
  const missingText = missing.map((id) => `#${entryByDriver.get(id)!.race_number ?? '–'} ${name(id)}`);
  if (missing.length > 0 && missing.length <= 3) {
    for (const text of missingText) warnings.push({ code: 'missing', message: `Fehlt im Import: ${text} (steht in der Aufstellung).` });
  } else if (missing.length > 3) {
    warnings.push({ code: 'missing', message: `${missing.length} Fahrer der Aufstellung fehlen im Import: ${missingText.join(', ')}.` });
  }

  return { rows: out, lines, warnings, matched: out.length, total: rows.length, missing };
}

/** Warnungen nach Wichtigkeit sortiert (nicht zugeordnete Zeilen zuerst). */
export const WARNING_ORDER: Record<ImportWarningCode, number> = {
  duplicate_number: 0,
  unknown_number: 1,
  no_number: 2,
  not_in_lineup: 3,
  duplicate_driver: 4,
  skipped: 5,
  missing: 6,
  ai_driven: 7,
  status_note: 8,
  team_mismatch: 9,
  ai_ignored: 10,
  no_lineup: -1,
};

export function sortWarnings(warnings: readonly ImportWarning[]): ImportWarning[] {
  return [...warnings].sort((a, b) => WARNING_ORDER[a.code] - WARNING_ORDER[b.code]);
}
