/**
 * Punkteberechnung pro Session (Plan §5.2, §6.3).
 *
 * Eingabe ist die Reihenfolge, wie der Admin sie eingetragen hat. Daraus entsteht –
 * nach veröffentlichten Steward-Strafen – das gewertete Ergebnis mit Positionen,
 * Pole, schnellster Runde und Punkten nach dem Saisonschema.
 *
 * Reine Funktion ohne Datenbankzugriff, vollständig durch Unit-Tests abgedeckt.
 */

import type { EntryRole, Id, ResultStatus, SessionType } from '../db/types';

export interface PointsScheme {
  race_points: readonly number[];
  sprint_points: readonly number[];
  fastest_lap_bonus: number;
  /** Bonus für die schnellste Runde nur bis zu dieser Platzierung (null = immer). */
  fastest_lap_max_pos: number | null;
  pole_bonus: number;
}

export interface EnteredResult {
  driverId: Id;
  teamId: Id;
  role: EntryRole;
  /** Reihenfolge laut Eingabe (1 = erste Zeile). */
  enteredPosition: number;
  status: ResultStatus;
  laps: number | null;
  totalTimeMs: number | null;
  gapMs: number | null;
  gapLaps: number | null;
  bestLapMs: number | null;
}

/** Strafen aus veröffentlichten Steward-Entscheidungen, in Veröffentlichungsreihenfolge. */
export type ResultPenalty =
  | { driverId: Id; kind: 'time'; seconds: number }
  | { driverId: Id; kind: 'position'; positions: number }
  | { driverId: Id; kind: 'dsq' };

export interface ComputedResult extends EnteredResult {
  /** Gewertete Position nach Strafen; null für DNF/DNS/DSQ/DNC. */
  position: number | null;
  /** Anzeige-Reihenfolge über alle Zeilen (1..n). */
  order: number;
  stewardPenaltyS: number;
  isFastestLap: boolean;
  isPole: boolean;
  points: number;
  countsForConstructors: boolean;
}

export type ComputeWarningCode =
  /** Zeitstrafe ließ sich mangels Zeiten/Abständen nicht verrechnen. */
  | 'time_penalty_unresolved'
  /** Zeitstrafe im Qualifying – wird nicht verrechnet. */
  | 'time_penalty_in_qualifying'
  /** Strafe für einen Fahrer ohne Ergebniszeile. */
  | 'penalty_unknown_driver'
  | 'duplicate_driver';

export interface ComputeWarning {
  code: ComputeWarningCode;
  driverId: Id;
}

export interface ComputeOptions {
  type: SessionType;
  scheme: PointsScheme;
  reservePointsForConstructors: boolean;
}

export interface ComputeOutput {
  results: ComputedResult[];
  warnings: ComputeWarning[];
}

/** Rang der Status für die Anzeige-Reihenfolge der nicht gewerteten Fahrer. */
const STATUS_RANK: Record<ResultStatus, number> = {
  classified: 0,
  dnf: 1,
  dnc: 1,
  dns: 2,
  dsq: 3,
};

export function computeSession(
  entered: readonly EnteredResult[],
  penalties: readonly ResultPenalty[],
  options: ComputeOptions,
): ComputeOutput {
  const warnings: ComputeWarning[] = [];

  // Duplikate verwerfen (erste Zeile gewinnt)
  const seen = new Set<Id>();
  const rows: EnteredResult[] = [];
  for (const r of [...entered].sort((a, b) => a.enteredPosition - b.enteredPosition)) {
    if (seen.has(r.driverId)) {
      warnings.push({ code: 'duplicate_driver', driverId: r.driverId });
      continue;
    }
    seen.add(r.driverId);
    rows.push({ ...r });
  }

  // Strafen einsammeln
  const timePenalty = new Map<Id, number>();
  const positionPenalties: Array<{ driverId: Id; positions: number }> = [];
  for (const p of penalties) {
    if (!seen.has(p.driverId)) {
      warnings.push({ code: 'penalty_unknown_driver', driverId: p.driverId });
      continue;
    }
    if (p.kind === 'dsq') {
      const row = rows.find((r) => r.driverId === p.driverId);
      if (row) row.status = 'dsq';
    } else if (p.kind === 'time') {
      timePenalty.set(p.driverId, (timePenalty.get(p.driverId) ?? 0) + p.seconds);
    } else {
      positionPenalties.push({ driverId: p.driverId, positions: p.positions });
    }
  }

  // 1. gewertete Fahrer in Eingabe-Reihenfolge
  let classified = rows.filter((r) => r.status === 'classified');

  // 2. Zeitstrafen verrechnen (nicht im Qualifying)
  const penalizedClassified = classified.filter((r) => (timePenalty.get(r.driverId) ?? 0) > 0);
  if (penalizedClassified.length > 0) {
    if (options.type === 'qualifying') {
      for (const r of penalizedClassified) warnings.push({ code: 'time_penalty_in_qualifying', driverId: r.driverId });
    } else {
      classified = applyTimePenalties(classified, timePenalty, warnings);
    }
  }

  // 3. Positionsstrafen: um N Plätze nach hinten
  for (const pp of positionPenalties) {
    const idx = classified.findIndex((r) => r.driverId === pp.driverId);
    if (idx < 0) continue; // nicht gewertet – Positionsstrafe ohne Wirkung
    const [row] = classified.splice(idx, 1);
    const target = Math.min(idx + pp.positions, classified.length);
    classified.splice(target, 0, row!);
  }

  // 4. nicht gewertete Fahrer hinten anhängen
  const unclassified = rows
    .filter((r) => r.status !== 'classified')
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.enteredPosition - b.enteredPosition);

  const ordered = [...classified, ...unclassified];

  // 5. schnellste Runde (Rennen und Sprint)
  let fastestDriver: Id | null = null;
  if (options.type !== 'qualifying') {
    let best = Infinity;
    for (const r of ordered) {
      if (r.bestLapMs == null || r.status === 'dsq' || r.status === 'dns') continue;
      if (r.bestLapMs < best) {
        best = r.bestLapMs;
        fastestDriver = r.driverId;
      }
    }
  }

  // 6. Positionen, Pole und Punkte
  const results: ComputedResult[] = ordered.map((r, i) => {
    const position = r.status === 'classified' ? i + 1 : null;
    const isPole = options.type === 'qualifying' && position === 1;
    const isFastestLap = r.driverId === fastestDriver;
    const points = pointsFor(options, position, isFastestLap);
    return {
      ...r,
      position,
      order: i + 1,
      stewardPenaltyS: timePenalty.get(r.driverId) ?? 0,
      isFastestLap,
      isPole,
      points,
      countsForConstructors: r.role === 'regular' || options.reservePointsForConstructors,
    };
  });

  return { results, warnings };
}

function pointsFor(options: ComputeOptions, position: number | null, isFastestLap: boolean): number {
  if (position == null) return 0;
  const { scheme, type } = options;
  if (type === 'qualifying') return position === 1 ? scheme.pole_bonus : 0;
  if (type === 'sprint') return scheme.sprint_points[position - 1] ?? 0;
  let points = scheme.race_points[position - 1] ?? 0;
  if (
    isFastestLap &&
    scheme.fastest_lap_bonus > 0 &&
    (scheme.fastest_lap_max_pos == null || position <= scheme.fastest_lap_max_pos)
  ) {
    points += scheme.fastest_lap_bonus;
  }
  return points;
}

/**
 * Zeitstrafen: Innerhalb einer Rundengruppe (gleiche Rundenzahl) wird nach Zeit + Strafe
 * neu sortiert. Fahrer mit mehr Runden bleiben immer vorn. Die Plätze einer Gruppe bleiben
 * dieselben „Slots“ wie in der Eingabe – nur die Belegung ändert sich.
 */
function applyTimePenalties(
  classified: EnteredResult[],
  timePenalty: Map<Id, number>,
  warnings: ComputeWarning[],
): EnteredResult[] {
  const leader = classified[0];
  if (!leader) return classified;
  const lapsKnown = classified.filter((r) => r.laps != null).map((r) => r.laps!);
  const maxLaps = lapsKnown.length > 0 ? Math.max(...lapsKnown) : null;
  const baseTime = leader.totalTimeMs ?? 0;

  const lapDeficit = (r: EnteredResult): number =>
    r.laps != null && maxLaps != null ? maxLaps - r.laps : (r.gapLaps ?? 0);
  const effTime = (r: EnteredResult): number | null => {
    if (r.totalTimeMs != null) return r.totalTimeMs;
    if (r === leader) return baseTime;
    if (r.gapMs != null && (r.gapLaps ?? 0) === 0) return baseTime + r.gapMs;
    return null;
  };

  const groups = new Map<number, number[]>(); // lapDeficit → Slot-Indizes
  classified.forEach((r, i) => {
    const key = lapDeficit(r);
    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  });

  const result = [...classified];
  for (const slots of groups.values()) {
    const members = slots.map((i) => classified[i]!);
    const penalized = members.filter((r) => (timePenalty.get(r.driverId) ?? 0) > 0);
    if (penalized.length === 0) continue;
    if (members.some((r) => effTime(r) == null)) {
      for (const r of penalized) warnings.push({ code: 'time_penalty_unresolved', driverId: r.driverId });
      continue;
    }
    const sorted = [...members].sort((a, b) => {
      const ta = effTime(a)! + (timePenalty.get(a.driverId) ?? 0) * 1000;
      const tb = effTime(b)! + (timePenalty.get(b.driverId) ?? 0) * 1000;
      return ta - tb || a.enteredPosition - b.enteredPosition;
    });
    slots.forEach((slot, k) => {
      result[slot] = sorted[k]!;
    });
  }
  return result;
}

/**
 * Startaufstellung aus dem Qualifying ableiten, Grid-Strafen (Plätze zurück) anwenden.
 * `qualiOrder` sind die Fahrer-IDs in gewerteter Quali-Reihenfolge.
 */
export function computeGrid(
  qualiOrder: readonly Id[],
  gridPenalties: ReadonlyArray<{ driverId: Id; positions: number }>,
): Map<Id, number> {
  const order = [...qualiOrder];
  for (const gp of gridPenalties) {
    const idx = order.indexOf(gp.driverId);
    if (idx < 0) continue;
    order.splice(idx, 1);
    order.splice(Math.min(idx + gp.positions, order.length), 0, gp.driverId);
  }
  return new Map(order.map((id, i) => [id, i + 1]));
}

/** Vorlagen für Punkteschemata (Plan §5 „Punkteschemata“). */
export const POINTS_TEMPLATES = {
  f1_current: {
    name: 'F1 aktuell',
    race_points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    sprint_points: [8, 7, 6, 5, 4, 3, 2, 1],
    fastest_lap_bonus: 0,
    fastest_lap_max_pos: null,
    pole_bonus: 0,
  },
  f1_fastest_lap: {
    name: 'F1 mit Bonus für schnellste Runde',
    race_points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    sprint_points: [8, 7, 6, 5, 4, 3, 2, 1],
    fastest_lap_bonus: 1,
    fastest_lap_max_pos: 10,
    pole_bonus: 0,
  },
  full_grid_22: {
    name: 'Punkte bis P22',
    race_points: [35, 30, 26, 23, 21, 19, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1],
    sprint_points: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    fastest_lap_bonus: 1,
    fastest_lap_max_pos: null,
    pole_bonus: 1,
  },
} as const satisfies Record<string, PointsScheme & { name: string }>;
