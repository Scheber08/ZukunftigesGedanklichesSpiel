/**
 * Driver of the Day (Plan Phase 2) für die öffentlichen Seiten: Auszeichnung je Runde,
 * Anzahl je Fahrer (Profil), markierte Runden (Ergebnisliste) und die Rangliste
 * „Meiste Fahrer des Tages“ (Hall of Fame). Reine Hilfsfunktionen über der `League`.
 *
 * Es zählen nur Auszeichnungen von Runden mit veröffentlichtem Ergebnis – die Tabelle
 * `awards` ist öffentlich lesbar, eine Runde ohne (sichtbares) Ergebnis bekommt keinen Hinweis.
 */

import type { AwardRow, Id, RoundRow } from '../db/types';
import { RESULT_VISIBLE_STATUSES } from '../db/types';
import type { HallOfFameEntry, League } from '../league/league';

export interface DotdEntry {
  award: AwardRow;
  round: RoundRow;
  driverId: Id;
}

const cache = new WeakMap<League, DotdEntry[]>();

/** Alle sichtbaren Driver-of-the-Day-Auszeichnungen (eine je Runde, die neueste Änderung gewinnt). */
export function dotdAwards(league: League): DotdEntry[] {
  const cached = cache.get(league);
  if (cached) return cached;
  const list = collectDotd(league);
  cache.set(league, list);
  return list;
}

function collectDotd(league: League): DotdEntry[] {
  const byRound = new Map<Id, DotdEntry>();
  for (const award of league.data.awards) {
    if (award.type !== 'driver_of_the_day' || award.round_id == null || award.driver_id == null) continue;
    const round = league.round(award.round_id);
    if (!round || !RESULT_VISIBLE_STATUSES.includes(round.status)) continue;
    const prev = byRound.get(round.id);
    if (prev && (prev.award.updated_at > award.updated_at || (prev.award.updated_at === award.updated_at && prev.award.id > award.id))) continue;
    byRound.set(round.id, { award, round, driverId: award.driver_id });
  }
  return [...byRound.values()].sort((a, b) => a.round.start_utc.localeCompare(b.round.start_utc));
}

/** Gibt es in der Liga überhaupt Driver-of-the-Day-Auszeichnungen? (Kennzahl nur dann zeigen) */
export function hasDotd(league: League): boolean {
  return dotdAwards(league).length > 0;
}

/**
 * Fahrer des Tages einer Runde mit Team: aus der Auszeichnung, sonst das Team seines
 * Rennergebnisses, sonst aus der Aufstellung.
 */
export function dotdOfRound(league: League, roundId: Id): { driverId: Id; teamId: Id | null; reserve: boolean } | null {
  const entry = dotdAwards(league).find((e) => e.round.id === roundId);
  if (!entry) return null;
  const race = league.sessionOf(roundId, 'race');
  const result = race ? league.resultsOf(race.id).find((r) => r.driver_id === entry.driverId) : undefined;
  const lineup = league.entriesOf(roundId).find((e) => e.driver_id === entry.driverId);
  return {
    driverId: entry.driverId,
    teamId: entry.award.team_id ?? result?.team_id ?? lineup?.team_id ?? null,
    reserve: (result?.role ?? lineup?.role) === 'reserve',
  };
}

/** Runden, in denen der Fahrer Fahrer des Tages war (optional nur eine Saison). */
export function dotdRoundIds(league: League, driverId: Id, seasonId?: Id): Set<Id> {
  return new Set(
    dotdAwards(league)
      .filter((e) => e.driverId === driverId && (seasonId == null || e.round.season_id === seasonId))
      .map((e) => e.round.id),
  );
}

export function dotdCount(league: League, driverId: Id, seasonId?: Id): number {
  return dotdRoundIds(league, driverId, seasonId).size;
}

/**
 * Rangliste „Meiste Fahrer des Tages“ (absteigend, bei Gleichstand alphabetisch).
 * Top N, bei Gleichstand an der Grenze alle mit demselben Wert (wie die übrigen Bestenlisten).
 */
export function dotdLeaderboard(league: League, limit = 10): HallOfFameEntry[] {
  const counts = new Map<Id, number>();
  for (const e of dotdAwards(league)) counts.set(e.driverId, (counts.get(e.driverId) ?? 0) + 1);
  return [...counts.entries()]
    .map(([driverId, value]) => ({ driverId, value }))
    .sort((a, b) => b.value - a.value || league.driverName(a.driverId).localeCompare(league.driverName(b.driverId), 'de'))
    .filter((e, i, all) => i < limit || e.value === all[limit - 1]?.value);
}
