/**
 * Head-to-Head zweier beliebiger Fahrer (Plan Phase 2, §4.5): gemeinsame Rennen (wer war vorn),
 * Quali-Duell und Kennzahlen im Vergleich – über alle Saisons oder eine Saison.
 *
 * Reine Logik ohne I/O: Der Build bereitet die Daten kompakt auf (encode…), der Browser
 * rechnet auf /fahrer/vergleich den Vergleich (decode… + compareDrivers). Dazu `duelWinner`,
 * die gemeinsame Regel für alle Kopf-an-Kopf-Vergleiche (auch Teamkollegen-Duell):
 * gewertete Position schlägt „nicht gewertet“, beide nicht gewertet = kein Duell.
 * Getestet in tests/unit/h2h-*.test.ts.
 */

import type { Id, ResultStatus, SessionType } from '../db/types';
import type { StandingsResult } from './standings';
import { careerStats, type CareerStats } from './stats';

// ---------------------------------------------------------------------------
// Duell-Regel
// ---------------------------------------------------------------------------

/** Ergebnis eines Fahrers in einer Session für den Direktvergleich. */
export interface DuelCell {
  /** Gewertete Position; null = nicht gewertet (DNF, DSQ, DNS, NC) */
  position: number | null;
  status: ResultStatus;
}

/** a/b = dieser Fahrer war vorn, none = kein Duell (beide nicht gewertet oder einer fehlt). */
export type DuelWinner = 'a' | 'b' | 'tie' | 'none';

/**
 * Wer war vorn? Gewertete Position schlägt „nicht gewertet“ (DNF, DSQ, DNS, NC); sind beide
 * nicht gewertet, gibt es kein Duell. Fehlt einer der beiden in der Session, ebenfalls nicht.
 */
export function duelWinner(a: DuelCell | null | undefined, b: DuelCell | null | undefined): DuelWinner {
  if (!a || !b) return 'none';
  const pa = a.position;
  const pb = b.position;
  if (pa == null && pb == null) return 'none';
  if (pa == null) return 'b';
  if (pb == null) return 'a';
  if (pa === pb) return 'tie';
  return pa < pb ? 'a' : 'b';
}

// ---------------------------------------------------------------------------
// Daten
// ---------------------------------------------------------------------------

/** Ein veröffentlichtes Session-Ergebnis (alle Felder öffentlich). */
export interface H2hResult {
  driverId: Id;
  roundId: Id;
  seasonId: Id;
  session: SessionType;
  teamId: Id;
  position: number | null;
  status: ResultStatus;
  points: number;
  grid: number | null;
  pole: boolean;
  fastestLap: boolean;
  reserve: boolean;
}

export interface H2hDotd {
  roundId: Id;
  seasonId: Id;
  driverId: Id;
}

const SESSION_CODES: readonly SessionType[] = ['qualifying', 'sprint', 'race'];
const STATUS_CODES: readonly ResultStatus[] = ['classified', 'dnf', 'dns', 'dsq', 'dnc'];
const FLAG_POLE = 1;
const FLAG_FASTEST = 2;
const FLAG_RESERVE = 4;

/**
 * Kompakte Zeile fürs HTML: [Fahrer, Runde, Session, Team, Position (0 = keine), Status,
 * Punkte, Startplatz (0 = keiner), Marken (1 Pole, 2 schnellste Runde, 4 Reserve)].
 * Die Saison ergibt sich aus der Runde.
 */
export type EncodedResult = [number, number, number, number, number, number, number, number, number];

export function encodeResult(r: Omit<H2hResult, 'seasonId'>): EncodedResult {
  return [
    r.driverId,
    r.roundId,
    Math.max(0, SESSION_CODES.indexOf(r.session)),
    r.teamId,
    r.position ?? 0,
    Math.max(0, STATUS_CODES.indexOf(r.status)),
    r.points,
    r.grid ?? 0,
    (r.pole ? FLAG_POLE : 0) | (r.fastestLap ? FLAG_FASTEST : 0) | (r.reserve ? FLAG_RESERVE : 0),
  ];
}

/** Gegenstück zu encodeResult; Zeilen mit unbekannter Runde oder kaputtem Format fallen weg. */
export function decodeResults(rows: readonly unknown[], seasonOfRound: ReadonlyMap<Id, Id>): H2hResult[] {
  const out: H2hResult[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 9 || !row.every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    const [driverId, roundId, session, teamId, position, status, points, grid, flags] = row as EncodedResult;
    const seasonId = seasonOfRound.get(roundId);
    const sessionType = SESSION_CODES[session];
    const statusValue = STATUS_CODES[status];
    if (seasonId == null || !sessionType || !statusValue) continue;
    out.push({
      driverId,
      roundId,
      seasonId,
      session: sessionType,
      teamId,
      position: position > 0 ? position : null,
      status: statusValue,
      points,
      grid: grid > 0 ? grid : null,
      pole: (flags & FLAG_POLE) !== 0,
      fastestLap: (flags & FLAG_FASTEST) !== 0,
      reserve: (flags & FLAG_RESERVE) !== 0,
    });
  }
  return out;
}

/** Für careerStats (gleiche Kennzahlen wie im Fahrerprofil). */
function toStandingsResult(r: H2hResult): StandingsResult {
  return {
    roundId: r.roundId,
    sessionType: r.session,
    driverId: r.driverId,
    teamId: r.teamId,
    role: r.reserve ? 'reserve' : 'regular',
    position: r.position,
    status: r.status,
    points: r.points,
    isPole: r.pole,
    isFastestLap: r.fastestLap,
    countsForConstructors: true,
    gridPosition: r.grid,
  };
}

// ---------------------------------------------------------------------------
// Vergleich
// ---------------------------------------------------------------------------

export interface H2hSide {
  driverId: Id;
  stats: CareerStats;
  dotd: number;
  /** Anzahl Runden mit Ergebnis im gewählten Zeitraum */
  rounds: number;
}

export interface SessionDuel {
  a: DuelCell | null;
  b: DuelCell | null;
  winner: DuelWinner;
}

export interface SharedRound {
  roundId: Id;
  seasonId: Id;
  quali: SessionDuel;
  race: SessionDuel;
  /** Im Rennen (sonst Quali) für dasselbe Team gefahren */
  teammates: boolean;
}

export interface DuelTally {
  /** Sessions, in denen beide ein Ergebnis haben */
  shared: number;
  winsA: number;
  winsB: number;
  /** Beide nicht gewertet */
  none: number;
}

export const H2H_METRICS = [
  { key: 'starts', better: null },
  { key: 'points', better: 'higher' },
  { key: 'wins', better: 'higher' },
  { key: 'podiums', better: 'higher' },
  { key: 'poles', better: 'higher' },
  { key: 'fastestLaps', better: 'higher' },
  { key: 'avgFinish', better: 'lower' },
  { key: 'bestFinish', better: 'lower' },
  { key: 'dnfs', better: 'lower' },
  { key: 'dotd', better: 'higher' },
] as const satisfies ReadonlyArray<{ key: string; better: 'higher' | 'lower' | null }>;

export type H2hMetricKey = (typeof H2H_METRICS)[number]['key'];

export interface H2hMetric {
  key: H2hMetricKey;
  a: number | null;
  b: number | null;
  /** Wer ist in dieser Kennzahl besser (null = gleich oder nicht vergleichbar) */
  better: 'a' | 'b' | null;
}

export interface H2hComparison {
  a: H2hSide;
  b: H2hSide;
  /** Runden, in denen beide im Qualifying oder Rennen am Start waren (chronologisch) */
  rounds: SharedRound[];
  race: DuelTally;
  quali: DuelTally;
  metrics: H2hMetric[];
}

export interface CompareOptions {
  /** Nur diese Saison (null/undefined = alle Saisons) */
  seasonId?: Id | null;
  dotd?: readonly H2hDotd[];
  /** Sortierschlüssel je Runde (z. B. Startzeit); sonst Saison, dann Runden-ID */
  roundOrder?: ReadonlyMap<Id, number>;
}

function metricValue(side: H2hSide, key: H2hMetricKey): number | null {
  switch (key) {
    case 'dotd':
      return side.dotd;
    case 'avgFinish':
      return side.stats.avgFinish;
    case 'bestFinish':
      return side.stats.bestFinish;
    default:
      return side.stats[key];
  }
}

/**
 * Wer ist besser? Ohne Wert (z. B. keine Zielankunft) gibt es keinen Vergleich; DNFs zählen nur,
 * wenn beide gestartet sind (0 DNFs ohne Start sind kein Vorteil).
 */
export function betterSide(
  key: H2hMetricKey,
  a: number | null,
  b: number | null,
  starts: { a: number; b: number } = { a: 1, b: 1 },
): 'a' | 'b' | null {
  const metric = H2H_METRICS.find((m) => m.key === key);
  if (!metric?.better || a == null || b == null || a === b) return null;
  if (key === 'dnfs' && (starts.a === 0 || starts.b === 0)) return null;
  const aBetter = metric.better === 'higher' ? a > b : a < b;
  return aBetter ? 'a' : 'b';
}

function side(results: readonly H2hResult[], driverId: Id, dotd: number): H2hSide {
  const own = results.filter((r) => r.driverId === driverId);
  return {
    driverId,
    stats: careerStats(own.map(toStandingsResult)),
    dotd,
    rounds: new Set(own.map((r) => r.roundId)).size,
  };
}

function cell(r: H2hResult | undefined): DuelCell | null {
  return r ? { position: r.position, status: r.status } : null;
}

function tally(list: readonly SessionDuel[]): DuelTally {
  const t: DuelTally = { shared: 0, winsA: 0, winsB: 0, none: 0 };
  for (const d of list) {
    if (!d.a || !d.b) continue;
    t.shared += 1;
    if (d.winner === 'a') t.winsA += 1;
    else if (d.winner === 'b') t.winsB += 1;
    else if (d.winner === 'none') t.none += 1;
  }
  return t;
}

/** Vergleich zweier Fahrer im gewählten Zeitraum. */
export function compareDrivers(results: readonly H2hResult[], a: Id, b: Id, opts: CompareOptions = {}): H2hComparison {
  const seasonId = opts.seasonId ?? null;
  const scoped = results.filter((r) => (r.driverId === a || r.driverId === b) && (seasonId == null || r.seasonId === seasonId));
  const dotd = (opts.dotd ?? []).filter((d) => seasonId == null || d.seasonId === seasonId);
  const dotdCount = (id: Id) => dotd.filter((d) => d.driverId === id).length;

  const sideA = side(scoped, a, dotdCount(a));
  const sideB = side(scoped, b, dotdCount(b));

  // Runden, in denen beide ein Quali- oder Rennergebnis haben
  type Slot = { seasonId: Id; qa?: H2hResult; qb?: H2hResult; ra?: H2hResult; rb?: H2hResult };
  const slots = new Map<Id, Slot>();
  for (const r of scoped) {
    if (r.session === 'sprint') continue;
    let s = slots.get(r.roundId);
    if (!s) {
      s = { seasonId: r.seasonId };
      slots.set(r.roundId, s);
    }
    const isA = r.driverId === a;
    if (r.session === 'qualifying') {
      if (isA) s.qa = r;
      else s.qb = r;
    } else if (isA) s.ra = r;
    else s.rb = r;
  }

  const rounds: SharedRound[] = [];
  for (const [roundId, s] of slots) {
    const sharedQuali = s.qa != null && s.qb != null;
    const sharedRace = s.ra != null && s.rb != null;
    if (!sharedQuali && !sharedRace) continue;
    const teamA = (s.ra ?? s.qa)?.teamId;
    const teamB = (s.rb ?? s.qb)?.teamId;
    rounds.push({
      roundId,
      seasonId: s.seasonId,
      quali: { a: cell(s.qa), b: cell(s.qb), winner: duelWinner(cell(s.qa), cell(s.qb)) },
      race: { a: cell(s.ra), b: cell(s.rb), winner: duelWinner(cell(s.ra), cell(s.rb)) },
      teammates: teamA != null && teamA === teamB,
    });
  }
  const order = opts.roundOrder;
  rounds.sort((x, y) => {
    if (order) {
      const ox = order.get(x.roundId) ?? Number.MAX_SAFE_INTEGER;
      const oy = order.get(y.roundId) ?? Number.MAX_SAFE_INTEGER;
      if (ox !== oy) return ox - oy;
    }
    return x.seasonId - y.seasonId || x.roundId - y.roundId;
  });

  const starts = { a: sideA.stats.starts, b: sideB.stats.starts };
  const metrics: H2hMetric[] = H2H_METRICS.map(({ key }) => {
    const va = metricValue(sideA, key);
    const vb = metricValue(sideB, key);
    return { key, a: va, b: vb, better: betterSide(key, va, vb, starts) };
  });

  return {
    a: sideA,
    b: sideB,
    rounds,
    race: tally(rounds.map((r) => r.race)),
    quali: tally(rounds.map((r) => r.quali)),
    metrics,
  };
}
