/**
 * Sichten für Fahrer, Teams, Hall of Fame und Archiv (Plan §4.5, §4.8).
 * Reine Hilfsfunktionen ohne I/O: Sie bekommen die `League` als Parameter und
 * bereiten die Daten für die Views in src/views/*View.astro auf.
 *
 * Datenschutz (Plan §1, §6.7): Pseudonymisierte Fahrer bekommen nie eine Profilseite
 * und werden nirgends verlinkt. Saisonnamen zeigen die Views mit `seasonLabel()` aus
 * src/lib/view.ts (zentral, übersetzt „Saison N“ für EN).
 */

import type { DecisionRow, DriverNumberRow, DriverRow, Id, RoundEntryRow, RoundRow, SeasonRow, TeamRow } from '../db/types';
import { RESULT_VISIBLE_STATUSES } from '../db/types';
import type { DriverStanding, TeamStanding } from '../domain/standings';
import type { CareerStats, Duel } from '../domain/stats';
import type { League, ResultWithContext } from '../league/league';

// ---------------------------------------------------------------------------
// Profilseiten
// ---------------------------------------------------------------------------

/**
 * Fahrer mit öffentlicher Profilseite: nicht pseudonymisiert und mit Ergebnis, Startnummer,
 * Cockpit, Aufstellung (auch als Ersetzter) oder veröffentlichter Steward-Entscheidung.
 * Zusätzlich alle, die in der Fahrerliste stehen (Stamm/Reserve) – so führt kein Link
 * (DriverLink, DriverCard) ins Leere.
 */
export function profileDrivers(league: League): DriverRow[] {
  const referenced = new Set<Id>();
  for (const n of league.data.driver_numbers) referenced.add(n.driver_id);
  for (const s of league.data.seats) referenced.add(s.driver_id);
  // Nur veröffentlichte Aufstellungen (entriesOf blendet geplante Runden aus)
  for (const round of league.data.rounds) {
    for (const e of league.entriesOf(round.id)) {
      referenced.add(e.driver_id);
      if (e.replaces_driver_id != null) referenced.add(e.replaces_driver_id);
    }
  }
  for (const d of league.decisions) referenced.add(d.driver_id);
  return league.drivers.filter(
    (d) =>
      !d.anonymized &&
      !isReservedDriverSlug(d.slug) &&
      (referenced.has(d.id) || league.driverResults(d.id).length > 0 || d.status === 'active' || d.status === 'reserve'),
  );
}

/**
 * Slugs, die unter /fahrer/… bzw. /en/drivers/… feste Seiten belegen (Fahrer-Vergleich).
 * Der Admin vergibt sie nicht; hier zusätzlich defensiv ausgefiltert, damit keine
 * Profilseite die Vergleichsseite überdeckt.
 */
export const RESERVED_DRIVER_SLUGS: readonly string[] = ['vergleich', 'compare'];

export function isReservedDriverSlug(slug: string): boolean {
  return RESERVED_DRIVER_SLUGS.includes(slug.trim().toLowerCase());
}

/** Slug-Liste für getStaticPaths der Fahrerprofile. */
export function driverProfileSlugs(league: League): string[] {
  return profileDrivers(league).map((d) => d.slug);
}

/** Darf zu diesem Fahrer verlinkt werden? */
export function hasProfile(driver: DriverRow | undefined | null): boolean {
  return driver != null && !driver.anonymized;
}

/** Teams mit eigener Seite: alle, die in mindestens einer Saison vorkommen. */
export function teamPageTeams(league: League): TeamRow[] {
  const ids = new Set(league.data.season_teams.map((st) => st.team_id));
  return league.data.teams.filter((t) => ids.has(t.id)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function teamPageSlugs(league: League): string[] {
  return teamPageTeams(league).map((t) => t.slug);
}

// ---------------------------------------------------------------------------
// Fahrerliste und Rolle
// ---------------------------------------------------------------------------

export type DriverRole = 'regular' | 'reserve' | 'former';

/** Rolle in der Saison: Stammfahrer (Cockpit), Reserve (Pool) oder ehemalig. */
export function driverRole(league: League, driver: DriverRow, seasonId: Id | undefined): DriverRole {
  if (seasonId != null && league.seatsOf(seasonId).some((s) => s.driver_id === driver.id)) return 'regular';
  if (driver.status === 'reserve') return 'reserve';
  if (driver.status === 'active') return 'regular';
  return 'former';
}

export interface TeamGroup {
  team: TeamRow;
  drivers: Array<{ driver: DriverRow; seatNo: 1 | 2 }>;
}

/** Stammfahrer der Saison nach Team gruppiert (Team-Reihenfolge der Saison). */
export function regularsByTeam(league: League, seasonId: Id): TeamGroup[] {
  const { regulars } = league.roster(seasonId);
  const groups = new Map<Id, TeamGroup>();
  for (const team of league.teamsOf(seasonId)) groups.set(team.id, { team, drivers: [] });
  for (const r of regulars) {
    const g = groups.get(r.team.id) ?? { team: r.team, drivers: [] };
    g.drivers.push({ driver: r.driver, seatNo: r.seatNo });
    groups.set(r.team.id, g);
  }
  return [...groups.values()];
}

/** Anzahl Fahrer je Plattform-Gruppe (PC, PS, Xbox) – Crossplay auf einen Blick. */
export function platformCounts(drivers: readonly DriverRow[]): { pc: number; playstation: number; xbox: number } {
  const out = { pc: 0, playstation: 0, xbox: 0 };
  for (const d of drivers) {
    if (d.platform === 'playstation') out.playstation += 1;
    else if (d.platform === 'xbox') out.xbox += 1;
    else out.pc += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fahrerprofil
// ---------------------------------------------------------------------------

export interface SeasonResults {
  season: SeasonRow;
  rows: ResultWithContext[];
  points: number;
}

const SESSION_RANK = { qualifying: 0, sprint: 1, race: 2 } as const;

/** Ergebnisse nach Saison gruppiert: Saisons neueste zuerst, innerhalb chronologisch. */
export function resultsBySeason(results: readonly ResultWithContext[]): SeasonResults[] {
  const map = new Map<Id, SeasonResults>();
  for (const r of results) {
    let g = map.get(r.season.id);
    if (!g) {
      g = { season: r.season, rows: [], points: 0 };
      map.set(r.season.id, g);
    }
    g.rows.push(r);
    g.points += r.result.points;
  }
  const groups = [...map.values()].sort((a, b) => b.season.number - a.season.number);
  for (const g of groups) {
    g.rows.sort(
      (a, b) => a.round.number - b.round.number || SESSION_RANK[a.session.type] - SESSION_RANK[b.session.type],
    );
  }
  return groups;
}

export interface NumberPeriod {
  row: DriverNumberRow;
  state: 'current' | 'upcoming' | 'past';
}

/** Nummern-Historie mit Gültigkeitsstatus, neueste zuerst. */
export function numberPeriods(league: League, driverId: Id): NumberPeriod[] {
  const now = league.now.getTime();
  return league
    .numberHistory(driverId)
    .map((row) => {
      const from = new Date(row.valid_from).getTime();
      const to = row.valid_to ? new Date(row.valid_to).getTime() : null;
      const state: NumberPeriod['state'] = from > now ? 'upcoming' : to != null && to <= now ? 'past' : 'current';
      return { row, state };
    })
    .reverse();
}

export interface DuelView {
  mate: DriverRow;
  team: TeamRow;
  duel: Duel;
}

/** Teamkollegen-Duelle eines Fahrers in der Saison (nur Runden, in denen beide fürs Team fuhren). */
export function driverDuels(league: League, driverId: Id, seasonId: Id): DuelView[] {
  const team = league.driverTeam(driverId, seasonId);
  if (!team) return [];
  return league.teammates(driverId, seasonId).map((mate) => ({ mate, team, duel: league.duel(seasonId, team.id, driverId, mate.id) }));
}

export interface ProgressionStep {
  round: RoundRow;
  /** Punkte in dieser Runde */
  delta: number;
  /** kumulierte Punkte nach der Runde */
  total: number;
  /** Position in der Wertung nach der Runde (null = noch nicht gewertet) */
  position: number | null;
}

/** Punkteverlauf eines Fahrers bzw. Teams über alle gewerteten Runden der Saison. */
export function progressionSteps(league: League, kind: 'driver' | 'team', seasonId: Id, entityId: Id): ProgressionStep[] {
  const rounds = league.countedRounds(seasonId);
  const series = (kind === 'driver' ? league.driverProgression(seasonId) : league.teamProgression(seasonId)).find(
    (s) => s.id === entityId,
  );
  let previous = 0;
  return rounds.map((round) => {
    const hit = series?.points.find((p) => p.roundId === round.id);
    const total = hit?.points ?? previous;
    const step: ProgressionStep = { round, delta: total - previous, total, position: hit?.position ?? null };
    previous = total;
    return step;
  });
}

/** Strafpunkte-Summe einer Saison aus veröffentlichten Entscheidungen (vorbereitet, Plan §1). */
export function penaltyPointsTotal(league: League, decisions: readonly DecisionRow[], seasonId: Id): number {
  return decisions
    .filter((d) => league.round(d.round_id)?.season_id === seasonId)
    .reduce((sum, d) => sum + (d.penalty_points ?? 0), 0);
}

/** Nur http(s)-Links nach außen (Twitch/YouTube). */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** „+12“ / „−3“ / „0“ mit echtem Minuszeichen. */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${String.fromCharCode(0x2212)}${Math.abs(n)}`;
  return '0';
}

// ---------------------------------------------------------------------------
// Teamseite
// ---------------------------------------------------------------------------

/** Aktuelle Stammfahrer eines Teams (Cockpit 1, 2). */
export function teamDrivers(league: League, teamId: Id, seasonId: Id): Array<{ driver: DriverRow; seatNo: 1 | 2 }> {
  return league
    .seatsOf(seasonId)
    .filter((s) => s.team_id === teamId)
    .sort((a, b) => a.seat_no - b.seat_no)
    .map((s) => ({ driver: league.driver(s.driver_id), seatNo: s.seat_no }))
    .filter((x): x is { driver: DriverRow; seatNo: 1 | 2 } => x.driver != null);
}

/** Internes Duell der beiden aktuellen Stammfahrer eines Teams. */
export function teamDuel(league: League, teamId: Id, seasonId: Id): { a: DriverRow; b: DriverRow; duel: Duel } | null {
  const [first, second] = teamDrivers(league, teamId, seasonId);
  if (!first || !second) return null;
  return { a: first.driver, b: second.driver, duel: league.duel(seasonId, teamId, first.driver.id, second.driver.id) };
}

export interface ReserveAppearanceGroup {
  season: SeasonRow;
  items: Array<{ round: RoundRow; entry: RoundEntryRow }>;
}

/** Reserve-Einsätze eines Teams nach Saison gruppiert (neueste Saison zuerst). */
export function teamReserveBySeason(league: League, teamId: Id): ReserveAppearanceGroup[] {
  const map = new Map<Id, ReserveAppearanceGroup>();
  for (const item of league.teamReserveAppearances(teamId)) {
    const season = league.season(item.round.season_id);
    if (!season) continue;
    const g = map.get(season.id) ?? { season, items: [] };
    g.items.push(item);
    map.set(season.id, g);
  }
  return [...map.values()].sort((a, b) => b.season.number - a.season.number);
}

/** Fahrer, die in einer Saison ein Stammcockpit des Teams hatten (in Cockpit-Reihenfolge). */
export function teamSeasonDrivers(league: League, teamId: Id, seasonId: Id): DriverRow[] {
  const seen = new Set<Id>();
  const out: DriverRow[] = [];
  for (const s of league.data.seats
    .filter((x) => x.season_id === seasonId && x.team_id === teamId)
    .sort((a, b) => a.seat_no - b.seat_no || a.from_round - b.from_round)) {
    if (seen.has(s.driver_id)) continue;
    seen.add(s.driver_id);
    const d = league.driver(s.driver_id);
    if (d) out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hall of Fame
// ---------------------------------------------------------------------------

export interface RankedEntry<T> {
  rank: number;
  tied: boolean;
  entry: T;
}

/** Rang mit Gleichstand („=2“): gleiche Werte teilen sich den Rang. Erwartet absteigend sortierte Werte. */
export function rankByValue<T extends { value: number }>(entries: readonly T[]): Array<RankedEntry<T>> {
  return entries.map((entry, i) => {
    const rank = entries.findIndex((e) => e.value === entry.value) + 1;
    const tied = entries.some((e, j) => j !== i && e.value === entry.value);
    return { rank: rank > 0 ? rank : i + 1, tied, entry };
  });
}

/** Konstrukteurstitel je Team aus den Champions der Hall of Fame. */
export function constructorTitles(champions: ReadonlyArray<{ teamId: Id | null }>): Array<{ teamId: Id; value: number }> {
  const map = new Map<Id, number>();
  for (const c of champions) if (c.teamId != null) map.set(c.teamId, (map.get(c.teamId) ?? 0) + 1);
  return [...map.entries()].map(([teamId, value]) => ({ teamId, value })).sort((a, b) => b.value - a.value || a.teamId - b.teamId);
}

// ---------------------------------------------------------------------------
// Archiv
// ---------------------------------------------------------------------------

export interface ArchiveSeason {
  season: SeasonRow;
  rounds: RoundRow[];
  /** Runden ohne Absagen */
  scheduled: number;
  /** Runden mit veröffentlichtem Ergebnis */
  completed: number;
  sprints: number;
  /** Erster und letzter Tag (aus der Saison, sonst aus den Runden) */
  from: string | null;
  to: string | null;
  /** Top 3 der Fahrerwertung (Endstand bzw. Zwischenstand) */
  top3: DriverStanding[];
  /** Fahrer-Champion laut Award (abgeschlossene Saison) */
  championId: Id | null;
  /** Konstrukteurs-Champion bzw. aktuell führendes Team */
  constructors: TeamStanding | undefined;
  /** Abgeschlossen = eingefroren, nur noch lesbar */
  frozen: boolean;
}

/** Alle Saisons fürs Archiv (auch geplante), neueste zuerst. */
export function archiveOverview(league: League): ArchiveSeason[] {
  return league.seasons.map((season) => {
    const rounds = league.roundsOf(season.id);
    const active = rounds.filter((r) => r.status !== 'cancelled');
    const completed = rounds.filter((r) => RESULT_VISIBLE_STATUSES.includes(r.status)).length;
    const hasStandings = season.status !== 'planned' && completed > 0;
    const drivers = hasStandings ? league.driverStandings(season.id) : [];
    const teams = hasStandings ? league.teamStandings(season.id) : [];
    const championAward = league.awardsOf(season.id).find((a) => a.type === 'champion');
    const constructorsAward = league.awardsOf(season.id).find((a) => a.type === 'constructors');
    const constructors =
      season.status === 'finished' && constructorsAward?.team_id != null
        ? (teams.find((t) => t.teamId === constructorsAward.team_id) ?? teams[0])
        : teams.find((t) => t.points > 0);
    const firstStart = active[0]?.start_utc ?? null;
    const lastStart = active.at(-1)?.start_utc ?? null;
    return {
      season,
      rounds,
      scheduled: active.length,
      completed,
      sprints: active.filter((r) => r.format === 'sprint').length,
      from: season.starts_on ?? firstStart,
      to: season.ends_on ?? lastStart,
      top3: drivers.filter((d) => d.points > 0 || d.starts > 0).slice(0, 3),
      championId: season.status === 'finished' ? (championAward?.driver_id ?? drivers[0]?.driverId ?? null) : null,
      constructors,
      frozen: season.status === 'finished',
    };
  });
}

/** Kennzahlen, die im Profil angezeigt werden (Reihenfolge = Anzeige). */
export const STAT_KEYS = [
  'starts',
  'wins',
  'podiums',
  'poles',
  'fastestLaps',
  'points',
  'avgFinish',
  'bestFinish',
  'dnfRate',
  'positionsGained',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Hat der Fahrer (in diesem Zeitraum) überhaupt etwas vorzuweisen? */
export function hasStats(stats: CareerStats): boolean {
  return stats.starts > 0 || stats.points > 0 || stats.poles > 0;
}
