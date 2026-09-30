/**
 * Datenaufbereitung für den Fahrer-Vergleich /fahrer/vergleich (Plan Phase 2 „Head-to-Head“).
 * Der Build schreibt alle öffentlichen Ergebnisse kompakt als JSON ins HTML, das gebündelte
 * Skript rechnet im Browser mit src/lib/domain/h2h.ts. Nur öffentliche Daten: Gamertag,
 * Startnummer, Team, Ergebnisse – pseudonymisierte Fahrer fehlen ganz.
 */

import { url, type Lang, type T } from '~/i18n';
import type { DriverRow, Id } from '../db/types';
import { encodeResult, type EncodedResult } from '../domain/h2h';
import type { League } from '../league/league';
import { roundLabel, seasonLabel } from '../view';
import { dotdAwards } from './awards';
import { profileDrivers } from './index';

/** Texte fürs Client-Skript (kurze Schlüssel, Platzhalter {x} wie in t()). */
export interface H2hText {
  [key: string]: string;
}

export interface H2hPayload {
  v: 1;
  /** Saisons mit Ergebnissen, neueste zuerst */
  seasons: Array<{ id: number; slug: string; label: string }>;
  /** Runden chronologisch: [id, saisonId, Bezeichnung, Link zur Rennseite] */
  rounds: Array<[number, number, string, string]>;
  /** [id, Name, Farbe] */
  teams: Array<[number, string, string]>;
  /** [id, Slug, Gamertag, Profil-Link, aktuelles/letztes Team (0 = keins), Startnummer (0 = keine)] */
  drivers: Array<[number, string, string, string, number, number]>;
  results: EncodedResult[];
  /** Fahrer des Tages: [Runde, Fahrer] */
  dotd: Array<[number, number]>;
  /** Vorauswahl ohne URL-Parameter: die ersten beiden der aktuellen Wertung */
  defaults: { a: string | null; b: string | null };
  text: H2hText;
}

export interface CompareDriverOption {
  driver: DriverRow;
  teamName: string | null;
}

/** Fahrer, die verglichen werden können: mit Profilseite und mindestens einem Ergebnis. */
export function comparableDrivers(league: League): DriverRow[] {
  const withResults = new Set(league.standingsResults().map((r) => r.driverId));
  return profileDrivers(league).filter((d) => withResults.has(d.id));
}

/** Aktuelles Team (Cockpit der aktuellen Saison), sonst das Team des letzten Ergebnisses. */
export function compareTeamOf(league: League, driverId: Id): Id | null {
  const season = league.currentSeason;
  const seat = season ? league.driverTeam(driverId, season.id) : undefined;
  if (seat) return seat.id;
  return league.driverResults(driverId)[0]?.result.team_id ?? null;
}

/**
 * Auswahlgruppen fürs Formular: Fahrer mit Ergebnis in der aktuellen Saison und frühere,
 * jeweils alphabetisch.
 */
export function compareOptionGroups(league: League): { current: CompareDriverOption[]; earlier: CompareDriverOption[] } {
  const season = league.currentSeason;
  const inSeason = new Set(season ? league.standingsResults(season.id).map((r) => r.driverId) : []);
  const option = (driver: DriverRow): CompareDriverOption => {
    const teamId = compareTeamOf(league, driver.id);
    return { driver, teamName: teamId != null ? (league.team(teamId)?.name ?? null) : null };
  };
  const all = comparableDrivers(league);
  return {
    current: all.filter((d) => inSeason.has(d.id)).map(option),
    earlier: all.filter((d) => !inSeason.has(d.id)).map(option),
  };
}

/** Vorauswahl: Platz 1 und 2 der aktuellen Wertung (sonst die ersten beiden Fahrer). */
export function compareDefaults(league: League): { a: string | null; b: string | null } {
  const allowed = new Map(comparableDrivers(league).map((d) => [d.id, d]));
  const season = league.currentSeason;
  const ranked = season ? league.driverStandings(season.id).filter((s) => allowed.has(s.driverId)) : [];
  const ids = ranked.length >= 2 ? ranked.map((s) => s.driverId) : [...allowed.keys()];
  return { a: allowed.get(ids[0]!)?.slug ?? null, b: allowed.get(ids[1]!)?.slug ?? null };
}

/** Kurztexte fürs Client-Skript. */
export function compareText(t: T): H2hText {
  return {
    pos: t('people.pos', { n: '{n}' }),
    points: t('people.points', { n: '{n}' }),
    st_dnf: t('status.result.dnf'),
    st_dns: t('status.result.dns'),
    st_dsq: t('status.result.dsq'),
    st_dnc: t('status.result.dnc'),
    st_classified: t('status.result.classified'),
    m_starts: t('people.compare.metric.starts'),
    m_points: t('people.stats.points'),
    m_wins: t('people.stats.wins'),
    m_podiums: t('people.stats.podiums'),
    m_poles: t('people.stats.poles'),
    m_fastestLaps: t('people.stats.fastestLaps'),
    m_avgFinish: t('people.compare.metric.avgFinish'),
    m_bestFinish: t('people.stats.bestFinish'),
    m_dnfs: t('people.compare.metric.dnfs'),
    m_dotd: t('people.stats.dotd'),
    pick: t('people.compare.pick'),
    pickSecond: t('people.compare.pickSecond'),
    same: t('people.compare.same'),
    heading: t('people.compare.heading', { a: '{a}', b: '{b}' }),
    scopeAll: t('people.compare.scopeAll'),
    statsTitle: t('people.compare.statsTitle'),
    statsCaption: t('people.compare.statsCaption', { a: '{a}', b: '{b}', scope: '{scope}' }),
    metric: t('people.stats.metric'),
    better: t('people.compare.better'),
    duelTitle: t('people.compare.duelTitle'),
    raceDuel: t('people.compare.raceDuel'),
    qualiDuel: t('people.compare.qualiDuel'),
    score: t('people.duel.score', { a: '{a}', x: '{x}', b: '{b}', y: '{y}' }),
    sharedCount: t('people.compare.sharedCount', { n: '{n}' }),
    noDuels: t('people.compare.noDuels', { n: '{n}' }),
    sharedTitle: t('people.compare.sharedTitle'),
    sharedCaption: t('people.compare.sharedCaption', { a: '{a}', b: '{b}', scope: '{scope}' }),
    noShared: t('people.compare.noShared', { a: '{a}', b: '{b}' }),
    round: t('common.round'),
    quali: t('session.qualifying'),
    race: t('session.race'),
    leader: t('people.compare.leader'),
    ahead: t('people.compare.ahead'),
    noDuel: t('people.compare.noDuel'),
    tie: t('people.compare.tie'),
    teammates: t('people.compare.teammates'),
    notInScope: t('people.compare.notInScope', { name: '{name}' }),
    updated: t('people.compare.updated', { a: '{a}', b: '{b}' }),
    number: t('common.number'),
    versus: t('people.duel.versus'),
    driverA: t('people.compare.driverA'),
    driverB: t('people.compare.driverB'),
    profile: t('people.compare.profile', { name: '{name}' }),
  };
}

/** Kompakte Daten für den Vergleich (alle Saisons, nur öffentliche Felder). */
export function comparePayload(league: League, lang: Lang, t: T): H2hPayload {
  const drivers = comparableDrivers(league);
  const driverIds = new Set(drivers.map((d) => d.id));
  const results = league.standingsResults().filter((r) => driverIds.has(r.driverId));

  const roundIds = new Set(results.map((r) => r.roundId));
  const rounds = league.data.rounds
    .filter((r) => roundIds.has(r.id))
    .sort((a, b) => a.start_utc.localeCompare(b.start_utc) || a.number - b.number);
  const seasonIds = new Set(rounds.map((r) => r.season_id));
  const seasons = league.seasons.filter((s) => seasonIds.has(s.id));

  const teamOf = new Map(drivers.map((d) => [d.id, compareTeamOf(league, d.id)]));
  const teamIds = new Set<Id>([...results.map((r) => r.teamId), ...[...teamOf.values()].filter((x): x is Id => x != null)]);
  const teams = league.data.teams.filter((tm) => teamIds.has(tm.id));

  return {
    v: 1,
    seasons: seasons.map((s) => ({ id: s.id, slug: s.slug, label: seasonLabel(s, lang) })),
    rounds: rounds.map((r) => {
      const season = league.season(r.season_id)!;
      return [r.id, r.season_id, roundLabel(r, league.track(r.track_id), lang), url(lang, 'race', { season: season.slug, round: r.number })];
    }),
    teams: teams.map((tm) => [tm.id, tm.name, tm.color_hex]),
    drivers: drivers.map((d) => [d.id, d.slug, d.gamertag, url(lang, 'driver', { slug: d.slug }), teamOf.get(d.id) ?? 0, league.numberOf(d.id) ?? 0]),
    results: results.map((r) =>
      encodeResult({
        driverId: r.driverId,
        roundId: r.roundId,
        session: r.sessionType,
        teamId: r.teamId,
        position: r.position,
        status: r.status,
        points: r.points,
        grid: r.gridPosition,
        pole: r.isPole,
        fastestLap: r.isFastestLap,
        reserve: r.role === 'reserve',
      }),
    ),
    dotd: dotdAwards(league)
      .filter((e) => driverIds.has(e.driverId))
      .map((e) => [e.round.id, e.driverId]),
    defaults: compareDefaults(league),
    text: compareText(t),
  };
}
