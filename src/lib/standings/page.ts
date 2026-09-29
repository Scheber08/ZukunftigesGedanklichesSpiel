/**
 * Hilfsfunktionen für die Wertungsseiten (Plan §4.4): Saisonauswahl, „Stand nach Runde X“,
 * Positionsveränderungen, Champions und Punkteschema. Reine Funktionen ohne I/O –
 * sie bekommen die `League` als Parameter und sind in tests/unit/standings-*.test.ts getestet.
 */

import type { Lang } from '~/i18n/routes';
import type { AwardRow, Id, PointsSchemeRow, RoundRow, RulesSectionRow, SeasonRow } from '~/lib/db/types';
import type { DriverStanding, TeamStanding } from '~/lib/domain/standings';
import type { League } from '~/lib/league/league';

// ---------------------------------------------------------------------------
// Tabs (Fahrer | Konstrukteure | Matrix)
// ---------------------------------------------------------------------------

export const STANDINGS_TABS = ['drivers', 'teams', 'matrix'] as const;
export type StandingsTab = (typeof STANDINGS_TABS)[number];

/** Sprechende Anker je Sprache – landen im Teilen-Link (z. B. /wertung#matrix). */
export const TAB_ANCHORS: Record<Lang, Record<StandingsTab, string>> = {
  de: { drivers: 'fahrer', teams: 'konstrukteure', matrix: 'matrix' },
  en: { drivers: 'drivers', teams: 'constructors', matrix: 'matrix' },
};

// ---------------------------------------------------------------------------
// Saisons
// ---------------------------------------------------------------------------

/**
 * Anzeigename einer Saison. Der Name in der DB ist meist deutsch („Saison 2“) –
 * für die englische Seite wird das Standardmuster übersetzt, eigene Namen bleiben.
 */
export function seasonName(season: Pick<SeasonRow, 'number' | 'name'>, lang: Lang): string {
  const name = season.name?.trim() ?? '';
  if (name === '' || /^(saison|season)\s+\d+$/i.test(name)) {
    return lang === 'de' ? `Saison ${season.number}` : `Season ${season.number}`;
  }
  return name;
}

/** Saison per Slug – ohne Slug die aktuelle Saison. */
export function resolveSeason(league: League, seasonSlug?: string): SeasonRow | undefined {
  return seasonSlug ? league.seasonBySlug(seasonSlug) : league.currentSeason;
}

/**
 * Stichtag für Startnummern in der Gesamtwertung: Bei abgeschlossenen Saisons gilt die
 * Nummer zum Start der letzten gewerteten Runde (Archiv-genau, auch für ehemalige Fahrer),
 * sonst die aktuelle Nummer (null). Seite und CSV nutzen dieselbe Regel.
 */
export function standingsNumbersAt(league: League, season: Pick<SeasonRow, 'id' | 'status'>): Date | null {
  if (season.status !== 'finished') return null;
  const last = league.countedRounds(season.id).at(-1);
  return last ? new Date(last.start_utc) : null;
}

/** Startnummer eines Fahrers in der Wertung – zum Stichtag, sonst die aktuelle. */
export function standingsNumber(league: League, driverId: Id, at: Date | null): number | null {
  return (at ? league.numberAt(driverId, at) : null) ?? league.numberOf(driverId);
}

/** getStaticPaths für /saison/[season]/wertung (+ CSV): alle Saisons mit Ergebnissen. */
export function seasonStandingsPaths(league: League): Array<{ params: { season: string } }> {
  return league.archiveSeasons.map((s) => ({ params: { season: s.slug } }));
}

/** getStaticPaths für /saison/[season]/wertung/nach-runde-[round]: jede gewertete Runde. */
export function standingsAfterPaths(league: League): Array<{ params: { season: string; round: string } }> {
  return league.archiveSeasons.flatMap((s) =>
    league.countedRounds(s.id).map((r) => ({ params: { season: s.slug, round: String(r.number) } })),
  );
}

/** Nachbarn einer gewerteten Runde (abgesagte/offene Runden werden übersprungen). */
export function roundNeighbours(
  league: League,
  seasonId: Id,
  roundNumber: number,
): { previous: RoundRow | undefined; current: RoundRow | undefined; next: RoundRow | undefined } {
  const counted = league.countedRounds(seasonId);
  const i = counted.findIndex((r) => r.number === roundNumber);
  if (i < 0) return { previous: undefined, current: undefined, next: undefined };
  return { previous: counted[i - 1], current: counted[i], next: counted[i + 1] };
}

// ---------------------------------------------------------------------------
// Positionsveränderung gegenüber der Vorrunde
// ---------------------------------------------------------------------------

export type Movement =
  | { kind: 'up'; n: number }
  | { kind: 'down'; n: number }
  | { kind: 'same'; n: 0 }
  | { kind: 'new'; n: 0 };

/**
 * Veränderung je Eintrag (Fahrer- oder Team-ID). Ohne Vorrunde (`previous` = null)
 * gibt es keine Veränderung – die Map bleibt leer.
 */
export function movements(
  current: ReadonlyArray<{ id: Id; position: number }>,
  previous: ReadonlyArray<{ id: Id; position: number }> | null,
): Map<Id, Movement> {
  const out = new Map<Id, Movement>();
  if (previous == null) return out;
  const before = new Map(previous.map((p) => [p.id, p.position]));
  for (const c of current) {
    const prev = before.get(c.id);
    if (prev == null) out.set(c.id, { kind: 'new', n: 0 });
    else if (prev > c.position) out.set(c.id, { kind: 'up', n: prev - c.position });
    else if (prev < c.position) out.set(c.id, { kind: 'down', n: c.position - prev });
    else out.set(c.id, { kind: 'same', n: 0 });
  }
  return out;
}

export const driverPositions = (list: readonly DriverStanding[]) => list.map((s) => ({ id: s.driverId, position: s.position }));
export const teamPositions = (list: readonly TeamStanding[]) => list.map((s) => ({ id: s.teamId, position: s.position }));

// ---------------------------------------------------------------------------
// Champions (abgeschlossene Saison)
// ---------------------------------------------------------------------------

export interface SeasonChampions {
  driverId: Id | null;
  driverPoints: number | null;
  teamId: Id | null;
  teamPoints: number | null;
}

/**
 * Champions einer abgeschlossenen Saison: Auszeichnung aus `awards` hat Vorrang
 * (z. B. nach einer Entscheidung am grünen Tisch), sonst Platz 1 der Wertung.
 * Für laufende oder geplante Saisons gibt es keine Champions (null).
 */
export function seasonChampions(
  season: Pick<SeasonRow, 'id' | 'status'>,
  awards: readonly Pick<AwardRow, 'season_id' | 'type' | 'driver_id' | 'team_id'>[],
  drivers: readonly DriverStanding[],
  teams: readonly TeamStanding[],
): SeasonChampions | null {
  if (season.status !== 'finished') return null;
  const own = awards.filter((a) => a.season_id === season.id);
  const driverId = own.find((a) => a.type === 'champion')?.driver_id ?? drivers.find((d) => d.position === 1)?.driverId ?? null;
  const teamId =
    own.find((a) => a.type === 'constructors')?.team_id ??
    teams.find((t) => t.position === 1 && t.points > 0)?.teamId ??
    null;
  if (driverId == null && teamId == null) return null;
  return {
    driverId,
    driverPoints: drivers.find((d) => d.driverId === driverId)?.points ?? null,
    teamId,
    teamPoints: teams.find((t) => t.teamId === teamId)?.points ?? null,
  };
}

// ---------------------------------------------------------------------------
// Punkteschema (eine Datenquelle: points_schemes der Saison)
// ---------------------------------------------------------------------------

export interface SchemeSummary {
  name: string;
  /** Spalten der Punktetabelle: 1..n (n = längste Punkteliste). */
  places: number[];
  race: Array<number | null>;
  sprint: Array<number | null> | null;
  fastestLap: { bonus: number; maxPos: number | null } | null;
  pole: number | null;
}

export function schemeSummary(scheme: Pick<
  PointsSchemeRow,
  'name' | 'race_points' | 'sprint_points' | 'fastest_lap_bonus' | 'fastest_lap_max_pos' | 'pole_bonus'
>): SchemeSummary {
  const hasSprint = scheme.sprint_points.some((p) => p > 0);
  const len = Math.max(scheme.race_points.length, hasSprint ? scheme.sprint_points.length : 0);
  const places = Array.from({ length: len }, (_, i) => i + 1);
  return {
    name: scheme.name,
    places,
    race: places.map((p) => scheme.race_points[p - 1] ?? null),
    sprint: hasSprint ? places.map((p) => scheme.sprint_points[p - 1] ?? null) : null,
    fastestLap: scheme.fastest_lap_bonus > 0 ? { bonus: scheme.fastest_lap_bonus, maxPos: scheme.fastest_lap_max_pos } : null,
    pole: scheme.pole_bonus > 0 ? scheme.pole_bonus : null,
  };
}

// ---------------------------------------------------------------------------
// Regelwerk-Verweis (Gleichstand)
// ---------------------------------------------------------------------------

/** Anker der Gleichstands-Regel im Regelwerk. */
export const TIE_RULE_ANCHOR = 'p1-6';

/** §-Nummer der Regel aus dem gültigen Regelwerk (z. B. „§1.6“), damit Text und Regelwerk nie auseinanderlaufen. */
export function ruleNumber(
  sections: readonly Pick<RulesSectionRow, 'version_id' | 'anchor' | 'number'>[],
  versionId: Id | undefined,
  anchor: string = TIE_RULE_ANCHOR,
): string | null {
  if (versionId == null) return null;
  return sections.find((s) => s.version_id === versionId && s.anchor === anchor)?.number ?? null;
}
