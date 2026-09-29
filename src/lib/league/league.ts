/**
 * `League` – alle öffentlichen Daten einer Liga plus berechnete Sichten
 * (Wertungen, Statistiken, Kalender, Hall of Fame). Reine Klasse ohne I/O:
 * Der Loader (src/lib/server/league.ts) füllt sie aus Supabase oder dem Demo-Store.
 *
 * Eine Datenquelle für alle Seiten (Plan §2.2): Zeiten, Spielversion, Feldgröße,
 * Regeln usw. kommen immer von hier und erscheinen überall gleich.
 */

import type {
  AwardRow,
  DecisionRow,
  DriverNumberRow,
  DriverRow,
  FaqItemRow,
  IncidentRow,
  Id,
  NewsRow,
  OpenPositionRow,
  PartnerRow,
  PointsSchemeRow,
  ResultRow,
  RoundCorrectionRow,
  RoundEntryRow,
  RoundRow,
  RulesSectionRow,
  RulesVersionRow,
  SeasonRow,
  SeasonTeamRow,
  SeatRow,
  SessionRow,
  SessionType,
  SettingRow,
  StaffMemberRow,
  StandingsSnapshotRow,
  TeamRow,
  TrackRow,
} from '../db/types';
import { RESULT_VISIBLE_STATUSES } from '../db/types';
import { currentNumber, numberAt, numberHistory } from '../domain/numbers';
import {
  driverProgression,
  driverStandings,
  standingsMatrix,
  teamProgression,
  teamStandings,
  type DriverStanding,
  type MatrixRow,
  type ProgressionSeries,
  type StandingsInput,
  type StandingsResult,
  type TeamStanding,
} from '../domain/standings';
import { careerStats, teammateDuel, type CareerStats, type Duel } from '../domain/stats';
import { parsePublicSettings, type PublicSettings } from '../settings';

export type Lang = 'de' | 'en';

export interface LeagueDataset {
  seasons: SeasonRow[];
  points_schemes: PointsSchemeRow[];
  tracks: TrackRow[];
  rounds: RoundRow[];
  round_corrections: RoundCorrectionRow[];
  sessions: SessionRow[];
  teams: TeamRow[];
  season_teams: SeasonTeamRow[];
  drivers: DriverRow[];
  driver_numbers: DriverNumberRow[];
  seats: SeatRow[];
  round_entries: RoundEntryRow[];
  results: ResultRow[];
  standings_snapshots: StandingsSnapshotRow[];
  awards: AwardRow[];
  decisions: DecisionRow[];
  /** Nur öffentliche Felder von Vorfällen mit veröffentlichtem Urteil (View incidents_public) */
  incidents: Array<Pick<IncidentRow, 'id' | 'round_id' | 'session_id' | 'involved_driver_ids' | 'lap' | 'corner' | 'source'>>;
  news: NewsRow[];
  rules_versions: RulesVersionRow[];
  rules_sections: RulesSectionRow[];
  faq_items: FaqItemRow[];
  staff_members: StaffMemberRow[];
  open_positions: OpenPositionRow[];
  partners: PartnerRow[];
  settings: Pick<SettingRow, 'key' | 'value' | 'is_public'>[];
}

export const LEAGUE_TABLES = [
  'seasons',
  'points_schemes',
  'tracks',
  'rounds',
  'round_corrections',
  'sessions',
  'teams',
  'season_teams',
  'drivers',
  'driver_numbers',
  'seats',
  'round_entries',
  'results',
  'standings_snapshots',
  'awards',
  'decisions',
  'incidents',
  'news',
  'rules_versions',
  'rules_sections',
  'faq_items',
  'staff_members',
  'open_positions',
  'partners',
  'settings',
] as const satisfies ReadonlyArray<keyof LeagueDataset>;

const SESSION_ORDER: Record<SessionType, number> = { qualifying: 0, sprint: 1, race: 2 };

/** Ergebnis-Zeile mit Kontext für Listen (Fahrerprofil, Rennseite). */
export interface ResultWithContext {
  result: ResultRow;
  session: SessionRow;
  round: RoundRow;
  season: SeasonRow;
}

export interface RoundSummary {
  round: RoundRow;
  track: TrackRow;
  season: SeasonRow;
  /** Podium des Hauptrennens (P1–P3). */
  podium: ResultRow[];
  pole: ResultRow | null;
  fastestLap: ResultRow | null;
  hasResults: boolean;
}

export interface HallOfFameEntry {
  driverId: Id;
  value: number;
}

export interface HallOfFame {
  champions: Array<{ season: SeasonRow; driverId: Id | null; teamId: Id | null; points: number | null }>;
  titles: HallOfFameEntry[];
  wins: HallOfFameEntry[];
  podiums: HallOfFameEntry[];
  poles: HallOfFameEntry[];
  fastestLaps: HallOfFameEntry[];
  starts: HallOfFameEntry[];
  points: HallOfFameEntry[];
}

export interface RuleNode extends RulesSectionRow {
  children: RuleNode[];
}

/** Lokalisierter Text mit Hinweis, ob die EN-Fassung fehlt (Plan §7.4). */
export interface Localized {
  text: string;
  /** true, wenn EN angefragt war, aber nur DE vorhanden ist. */
  fallback: boolean;
}

/** Wählt `<feld>_en` oder fällt auf `<feld>_de` zurück. */
export function localized<T extends object>(row: T, field: string, lang: Lang): Localized {
  const rec = row as Record<string, unknown>;
  const de = (rec[`${field}_de`] as string | null | undefined) ?? '';
  if (lang === 'de') return { text: de, fallback: false };
  const en = rec[`${field}_en`] as string | null | undefined;
  if (en && en.trim() !== '') return { text: en, fallback: false };
  return { text: de, fallback: de.trim() !== '' };
}

export function loc<T extends object>(row: T, field: string, lang: Lang): string {
  return localized(row, field, lang).text;
}

function by<T, K>(list: readonly T[], key: (item: T) => K): Map<K, T> {
  return new Map(list.map((item) => [key(item), item]));
}

function groupBy<T, K>(list: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of list) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export class League {
  readonly now: Date;
  readonly data: LeagueDataset;
  readonly settings: PublicSettings;

  private readonly seasonById: Map<Id, SeasonRow>;
  private readonly seasonBySlugMap: Map<string, SeasonRow>;
  private readonly trackById: Map<Id, TrackRow>;
  private readonly teamById: Map<Id, TeamRow>;
  private readonly teamBySlugMap: Map<string, TeamRow>;
  private readonly driverById: Map<Id, DriverRow>;
  private readonly driverBySlugMap: Map<string, DriverRow>;
  private readonly roundById: Map<Id, RoundRow>;
  private readonly roundsBySeason: Map<Id, RoundRow[]>;
  private readonly sessionById: Map<Id, SessionRow>;
  private readonly sessionsByRound: Map<Id, SessionRow[]>;
  private readonly resultsBySession: Map<Id, ResultRow[]>;
  private readonly resultsByDriver: Map<Id, ResultRow[]>;
  private readonly entriesByRound: Map<Id, RoundEntryRow[]>;
  private readonly schemeById: Map<Id, PointsSchemeRow>;
  private readonly publishedDecisions: DecisionRow[];
  private readonly cache = new Map<string, unknown>();

  constructor(data: LeagueDataset, now: Date = new Date()) {
    this.now = now;
    this.data = data;
    this.settings = parsePublicSettings(data.settings.filter((s) => s.is_public));

    this.seasonById = by(data.seasons, (s) => s.id);
    this.seasonBySlugMap = by(data.seasons, (s) => s.slug);
    this.trackById = by(data.tracks, (t) => t.id);
    this.teamById = by(data.teams, (t) => t.id);
    this.teamBySlugMap = by(data.teams, (t) => t.slug);
    this.driverById = by(data.drivers, (d) => d.id);
    this.driverBySlugMap = by(data.drivers, (d) => d.slug);
    this.roundById = by(data.rounds, (r) => r.id);
    this.roundsBySeason = groupBy(
      [...data.rounds].sort((a, b) => a.number - b.number),
      (r) => r.season_id,
    );
    this.sessionById = by(data.sessions, (s) => s.id);
    this.sessionsByRound = groupBy(
      [...data.sessions].sort((a, b) => SESSION_ORDER[a.type] - SESSION_ORDER[b.type]),
      (s) => s.round_id,
    );

    // Nur Ergebnisse veröffentlichter Runden (zusätzlich zur RLS)
    const visibleResults = data.results.filter((r) => {
      const session = this.sessionById.get(r.session_id);
      const round = session ? this.roundById.get(session.round_id) : undefined;
      return round != null && RESULT_VISIBLE_STATUSES.includes(round.status);
    });
    const sortResults = (a: ResultRow, b: ResultRow) =>
      (a.position ?? 999) - (b.position ?? 999) || a.entered_position - b.entered_position;
    this.resultsBySession = groupBy([...visibleResults].sort(sortResults), (r) => r.session_id);
    this.resultsByDriver = groupBy(visibleResults, (r) => r.driver_id);

    // Aufstellungen erst ab Veröffentlichung
    this.entriesByRound = groupBy(
      data.round_entries.filter((e) => {
        const round = this.roundById.get(e.round_id);
        return round != null && round.status !== 'scheduled';
      }),
      (e) => e.round_id,
    );
    this.schemeById = by(data.points_schemes, (p) => p.id);
    this.publishedDecisions = data.decisions
      .filter((d) => d.status === 'published')
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? '') || b.id - a.id);
  }

  private memo<T>(key: string, fn: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key) as T;
  }

  // ----------------------------------------------------------------- Saisons

  /** Alle Saisons, neueste zuerst. */
  get seasons(): SeasonRow[] {
    return [...this.data.seasons].sort((a, b) => b.number - a.number);
  }

  season(id: Id): SeasonRow | undefined {
    return this.seasonById.get(id);
  }

  seasonBySlug(slug: string): SeasonRow | undefined {
    return this.seasonBySlugMap.get(slug);
  }

  /** Aktive Saison, sonst die zuletzt abgeschlossene, sonst die nächste geplante. */
  get currentSeason(): SeasonRow | undefined {
    const list = this.seasons;
    return (
      list.find((s) => s.status === 'active') ??
      list.find((s) => s.status === 'finished') ??
      [...list].reverse().find((s) => s.status === 'planned')
    );
  }

  /** Saisons mit Ergebnissen fürs Archiv (abgeschlossen oder aktiv). */
  get archiveSeasons(): SeasonRow[] {
    return this.seasons.filter((s) => s.status !== 'planned');
  }

  pointsScheme(id: Id): PointsSchemeRow | undefined {
    return this.schemeById.get(id);
  }

  // ----------------------------------------------------------------- Stammdaten

  track(id: Id): TrackRow | undefined {
    return this.trackById.get(id);
  }

  team(id: Id): TeamRow | undefined {
    return this.teamById.get(id);
  }

  teamBySlug(slug: string): TeamRow | undefined {
    return this.teamBySlugMap.get(slug);
  }

  /** Teams einer Saison in Anzeige-Reihenfolge. */
  teamsOf(seasonId: Id): TeamRow[] {
    return this.data.season_teams
      .filter((st) => st.season_id === seasonId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((st) => this.teamById.get(st.team_id))
      .filter((t): t is TeamRow => t != null);
  }

  driver(id: Id): DriverRow | undefined {
    return this.driverById.get(id);
  }

  driverBySlug(slug: string): DriverRow | undefined {
    return this.driverBySlugMap.get(slug);
  }

  /** Anzeigename; pseudonymisierte Fahrer erscheinen als „Ehemaliger Fahrer #id“. */
  driverName(id: Id, lang: Lang = 'de'): string {
    const d = this.driverById.get(id);
    if (!d) return lang === 'de' ? 'Unbekannt' : 'Unknown';
    if (d.anonymized) return lang === 'de' ? `Ehemaliger Fahrer #${d.id}` : `Former driver #${d.id}`;
    return d.gamertag;
  }

  get drivers(): DriverRow[] {
    return [...this.data.drivers].sort((a, b) => a.gamertag.localeCompare(b.gamertag, 'de'));
  }

  /** Aktuelle bzw. nächste gültige Startnummer. */
  numberOf(driverId: Id, at: Date = this.now): number | null {
    return currentNumber(driverId, this.data.driver_numbers, at);
  }

  numberAt(driverId: Id, at: Date): number | null {
    return numberAt(driverId, this.data.driver_numbers, at);
  }

  numberHistory(driverId: Id): DriverNumberRow[] {
    return numberHistory(driverId, this.data.driver_numbers);
  }

  /** Cockpits einer Saison, gültig für eine Runde (Standard: aktuelle Runde). */
  seatsOf(seasonId: Id, roundNumber?: number): SeatRow[] {
    const n = roundNumber ?? this.currentRoundNumber(seasonId);
    return this.data.seats.filter(
      (s) => s.season_id === seasonId && s.from_round <= n && (s.to_round == null || s.to_round >= n),
    );
  }

  /** Nummer der Runde, die für „aktuelle Aufstellung“ gilt (nächste oder letzte). */
  currentRoundNumber(seasonId: Id): number {
    const rounds = this.roundsOf(seasonId);
    const next = rounds.find((r) => r.status !== 'cancelled' && !RESULT_VISIBLE_STATUSES.includes(r.status));
    return next?.number ?? rounds.at(-1)?.number ?? 1;
  }

  /** Aktuelles Stamm-Team eines Fahrers in der Saison (laut Cockpits). */
  driverTeam(driverId: Id, seasonId: Id): TeamRow | undefined {
    const seat = this.seatsOf(seasonId).find((s) => s.driver_id === driverId);
    return seat ? this.teamById.get(seat.team_id) : undefined;
  }

  /** Fahrerliste der Saison: Stamm (nach Team), Reserve (nach Warteliste), Ehemalige. */
  roster(seasonId: Id): {
    regulars: Array<{ driver: DriverRow; team: TeamRow; seatNo: 1 | 2 }>;
    reserves: DriverRow[];
    former: DriverRow[];
  } {
    const seats = this.seatsOf(seasonId);
    const teamOrder = new Map(this.teamsOf(seasonId).map((t, i) => [t.id, i]));
    const regulars = seats
      .map((s) => ({ driver: this.driverById.get(s.driver_id)!, team: this.teamById.get(s.team_id)!, seatNo: s.seat_no }))
      .filter((x) => x.driver && x.team)
      .sort((a, b) => (teamOrder.get(a.team.id) ?? 99) - (teamOrder.get(b.team.id) ?? 99) || a.seatNo - b.seatNo);
    const regularIds = new Set(regulars.map((r) => r.driver.id));
    const reserves = this.data.drivers
      .filter((d) => d.status === 'reserve' && !regularIds.has(d.id) && !d.anonymized)
      .sort((a, b) => (a.reserve_order ?? 999) - (b.reserve_order ?? 999) || a.gamertag.localeCompare(b.gamertag, 'de'));
    const reserveIds = new Set(reserves.map((d) => d.id));
    const former = this.data.drivers
      .filter((d) => !regularIds.has(d.id) && !reserveIds.has(d.id) && (this.resultsByDriver.get(d.id)?.length ?? 0) > 0)
      .sort((a, b) => a.gamertag.localeCompare(b.gamertag, 'de'));
    return { regulars, reserves, former };
  }

  // ----------------------------------------------------------------- Runden

  round(id: Id): RoundRow | undefined {
    return this.roundById.get(id);
  }

  roundsOf(seasonId: Id): RoundRow[] {
    return this.roundsBySeason.get(seasonId) ?? [];
  }

  roundByNumber(seasonId: Id, number: number): RoundRow | undefined {
    return this.roundsOf(seasonId).find((r) => r.number === number);
  }

  sessionsOf(roundId: Id): SessionRow[] {
    return this.sessionsByRound.get(roundId) ?? [];
  }

  session(id: Id): SessionRow | undefined {
    return this.sessionById.get(id);
  }

  sessionOf(roundId: Id, type: SessionType): SessionRow | undefined {
    return this.sessionsOf(roundId).find((s) => s.type === type);
  }

  /** Veröffentlichte Ergebnisse einer Session, sortiert (gewertete zuerst). */
  resultsOf(sessionId: Id): ResultRow[] {
    return this.resultsBySession.get(sessionId) ?? [];
  }

  hasResults(roundId: Id): boolean {
    const round = this.roundById.get(roundId);
    return round != null && RESULT_VISIBLE_STATUSES.includes(round.status);
  }

  /** Veröffentlichte Aufstellung, nach Team-Reihenfolge und Cockpit sortiert. */
  entriesOf(roundId: Id): RoundEntryRow[] {
    const round = this.roundById.get(roundId);
    const order = round ? new Map(this.teamsOf(round.season_id).map((t, i) => [t.id, i])) : new Map<Id, number>();
    return [...(this.entriesByRound.get(roundId) ?? [])].sort(
      (a, b) => (order.get(a.team_id) ?? 99) - (order.get(b.team_id) ?? 99) || a.seat_no - b.seat_no,
    );
  }

  correctionsOf(roundId: Id): RoundCorrectionRow[] {
    return this.data.round_corrections
      .filter((c) => c.round_id === roundId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /** Nächstes Rennen (noch nicht gestartet bzw. vor < 3 h gestartet und ohne Ergebnis). */
  nextRound(): RoundRow | undefined {
    const cutoff = this.now.getTime() - 3 * 3_600_000;
    return [...this.data.rounds]
      .filter((r) => r.status === 'scheduled' || r.status === 'lineup_published')
      .filter((r) => new Date(r.start_utc).getTime() > cutoff)
      .sort((a, b) => a.start_utc.localeCompare(b.start_utc))[0];
  }

  /** Kommende Runden (für den Countdown, der im Browser die nächste in der Zukunft wählt). */
  upcomingRounds(limit = 6): RoundRow[] {
    return [...this.data.rounds]
      .filter((r) => r.status === 'scheduled' || r.status === 'lineup_published')
      .filter((r) => new Date(r.start_utc).getTime() > this.now.getTime() - 3 * 3_600_000)
      .sort((a, b) => a.start_utc.localeCompare(b.start_utc))
      .slice(0, limit);
  }

  /** Zuletzt gewertete Runde (optional innerhalb einer Saison). */
  lastResultRound(seasonId?: Id): RoundRow | undefined {
    return [...this.data.rounds]
      .filter((r) => RESULT_VISIBLE_STATUSES.includes(r.status))
      .filter((r) => seasonId == null || r.season_id === seasonId)
      .sort((a, b) => b.start_utc.localeCompare(a.start_utc))[0];
  }

  roundSummary(roundId: Id): RoundSummary | undefined {
    const round = this.roundById.get(roundId);
    if (!round) return undefined;
    const track = this.trackById.get(round.track_id)!;
    const season = this.seasonById.get(round.season_id)!;
    const race = this.sessionOf(roundId, 'race');
    const quali = this.sessionOf(roundId, 'qualifying');
    const raceResults = race ? this.resultsOf(race.id) : [];
    return {
      round,
      track,
      season,
      podium: raceResults.filter((r) => r.position != null && r.position <= 3),
      pole: (quali ? this.resultsOf(quali.id) : []).find((r) => r.is_pole) ?? null,
      fastestLap: raceResults.find((r) => r.is_fastest_lap) ?? null,
      hasResults: this.hasResults(roundId),
    };
  }

  /** Vorherige Runde derselben Saison (für Grid-Strafen/Rennsperren). */
  previousRound(roundId: Id): RoundRow | undefined {
    const round = this.roundById.get(roundId);
    if (!round) return undefined;
    return this.roundsOf(round.season_id)
      .filter((r) => r.number < round.number && r.status !== 'cancelled')
      .at(-1);
  }

  /** Geht die Protestfrist noch? */
  protestOpen(round: RoundRow): boolean {
    return round.status === 'provisional' && round.protest_deadline != null && new Date(round.protest_deadline) > this.now;
  }

  // ----------------------------------------------------------------- Stewards

  /** Veröffentlichte Entscheidungen, neueste zuerst. */
  get decisions(): DecisionRow[] {
    return this.publishedDecisions;
  }

  decisionsOf(roundId: Id): DecisionRow[] {
    return this.publishedDecisions
      .filter((d) => d.round_id === roundId)
      .sort((a, b) => a.public_ref.localeCompare(b.public_ref));
  }

  decisionsForDriver(driverId: Id): DecisionRow[] {
    return this.publishedDecisions.filter((d) => d.driver_id === driverId);
  }

  /**
   * Beteiligte eines Urteils (Plan §4.6): Fahrer aus dem zugehörigen Vorfall, sonst nur der
   * bestrafte Fahrer. Reihenfolge: bestrafter Fahrer zuerst.
   */
  involvedDrivers(decision: Pick<DecisionRow, 'incident_id' | 'driver_id'>): Id[] {
    const incident = decision.incident_id != null ? this.data.incidents.find((i) => i.id === decision.incident_id) : undefined;
    const ids = [decision.driver_id, ...(incident?.involved_driver_ids ?? [])];
    return [...new Set(ids)];
  }

  /** Öffentliche Angaben zum Vorfall eines Urteils (Runde/Kurve), falls vorhanden. */
  incidentOf(decision: Pick<DecisionRow, 'incident_id'>): LeagueDataset['incidents'][number] | undefined {
    return decision.incident_id != null ? this.data.incidents.find((i) => i.id === decision.incident_id) : undefined;
  }

  decisionByRef(ref: string): DecisionRow | undefined {
    return this.publishedDecisions.find((d) => d.public_ref.toLowerCase() === ref.toLowerCase());
  }

  // ----------------------------------------------------------------- Wertungen

  /** Alle sichtbaren Ergebnisse einer Saison im Format der Wertungslogik. */
  standingsResults(seasonId?: Id): StandingsResult[] {
    return this.memo(`sr:${seasonId ?? 'all'}`, () => {
      const out: StandingsResult[] = [];
      for (const [sessionId, rows] of this.resultsBySession) {
        const session = this.sessionById.get(sessionId)!;
        const round = this.roundById.get(session.round_id)!;
        if (seasonId != null && round.season_id !== seasonId) continue;
        for (const r of rows) {
          out.push({
            roundId: round.id,
            sessionType: session.type,
            driverId: r.driver_id,
            teamId: r.team_id,
            role: r.role,
            position: r.position,
            status: r.status,
            points: r.points,
            isPole: r.is_pole,
            isFastestLap: r.is_fastest_lap,
            countsForConstructors: r.counts_for_constructors,
            gridPosition: r.grid_position,
          });
        }
      }
      return out;
    });
  }

  standingsInput(seasonId: Id): StandingsInput {
    return this.memo(`si:${seasonId}`, () => ({
      rounds: this.roundsOf(seasonId),
      results: this.standingsResults(seasonId),
      driverName: (id: Id) => this.driverName(id),
      teamName: (id: Id) => this.teamById.get(id)?.name ?? String(id),
      teamIds: this.teamsOf(seasonId).map((t) => t.id),
    }));
  }

  driverStandings(seasonId: Id, upToRound?: number): DriverStanding[] {
    return this.memo(`ds:${seasonId}:${upToRound ?? ''}`, () => driverStandings(this.standingsInput(seasonId), upToRound));
  }

  teamStandings(seasonId: Id, upToRound?: number): TeamStanding[] {
    return this.memo(`ts:${seasonId}:${upToRound ?? ''}`, () => teamStandings(this.standingsInput(seasonId), upToRound));
  }

  matrix(seasonId: Id, upToRound?: number): MatrixRow[] {
    return this.memo(`mx:${seasonId}:${upToRound ?? ''}`, () => standingsMatrix(this.standingsInput(seasonId), upToRound));
  }

  driverProgression(seasonId: Id): ProgressionSeries[] {
    return this.memo(`dp:${seasonId}`, () => driverProgression(this.standingsInput(seasonId)));
  }

  teamProgression(seasonId: Id): ProgressionSeries[] {
    return this.memo(`tp:${seasonId}`, () => teamProgression(this.standingsInput(seasonId)));
  }

  /** Runden mit veröffentlichtem Ergebnis (für „Stand nach Runde X“). */
  countedRounds(seasonId: Id): RoundRow[] {
    return this.roundsOf(seasonId).filter((r) => RESULT_VISIBLE_STATUSES.includes(r.status));
  }

  // ----------------------------------------------------------------- Profile

  /** Alle veröffentlichten Ergebnisse eines Fahrers mit Kontext, neueste zuerst. */
  driverResults(driverId: Id): ResultWithContext[] {
    return (this.resultsByDriver.get(driverId) ?? [])
      .map((result) => {
        const session = this.sessionById.get(result.session_id)!;
        const round = this.roundById.get(session.round_id)!;
        const season = this.seasonById.get(round.season_id)!;
        return { result, session, round, season };
      })
      .sort(
        (a, b) =>
          b.round.start_utc.localeCompare(a.round.start_utc) || SESSION_ORDER[a.session.type] - SESSION_ORDER[b.session.type],
      );
  }

  driverCareer(driverId: Id, seasonId?: Id): CareerStats {
    const results = (seasonId != null ? this.standingsResults(seasonId) : this.standingsResults()).filter(
      (r) => r.driverId === driverId,
    );
    return careerStats(results);
  }

  /** Saisons, in denen der Fahrer gefahren ist (neueste zuerst). */
  driverSeasons(driverId: Id): SeasonRow[] {
    const ids = new Set(this.driverResults(driverId).map((r) => r.season.id));
    return this.seasons.filter((s) => ids.has(s.id));
  }

  /** Teamkollege(n) in der Saison laut Cockpits. */
  teammates(driverId: Id, seasonId: Id): DriverRow[] {
    const team = this.driverTeam(driverId, seasonId);
    if (!team) return [];
    return this.seatsOf(seasonId)
      .filter((s) => s.team_id === team.id && s.driver_id !== driverId)
      .map((s) => this.driverById.get(s.driver_id))
      .filter((d): d is DriverRow => d != null);
  }

  duel(seasonId: Id, teamId: Id, driverA: Id, driverB: Id): Duel {
    return teammateDuel(this.standingsResults(seasonId), teamId, driverA, driverB);
  }

  /** Reserve-Einsätze eines Fahrers: für wen er eingesprungen ist. */
  reserveAppearances(driverId: Id): Array<{ round: RoundRow; entry: RoundEntryRow }> {
    return this.data.round_entries
      .filter((e) => e.driver_id === driverId && e.role === 'reserve')
      .map((entry) => ({ entry, round: this.roundById.get(entry.round_id)! }))
      .filter((x) => x.round && x.round.status !== 'scheduled')
      .sort((a, b) => b.round.start_utc.localeCompare(a.round.start_utc));
  }

  /** Einsätze von Reservefahrern für ein Team. */
  teamReserveAppearances(teamId: Id, seasonId?: Id): Array<{ round: RoundRow; entry: RoundEntryRow }> {
    return this.data.round_entries
      .filter((e) => e.team_id === teamId && e.role === 'reserve')
      .map((entry) => ({ entry, round: this.roundById.get(entry.round_id)! }))
      .filter((x) => x.round && x.round.status !== 'scheduled' && (seasonId == null || x.round.season_id === seasonId))
      .sort((a, b) => a.round.start_utc.localeCompare(b.round.start_utc));
  }

  /** Saisonbilanzen eines Teams (Position und Punkte je Saison). */
  teamSeasonRecords(teamId: Id): Array<{ season: SeasonRow; standing: TeamStanding | undefined }> {
    return this.archiveSeasons
      .filter((s) => this.teamsOf(s.id).some((t) => t.id === teamId))
      .map((season) => ({ season, standing: this.teamStandings(season.id).find((t) => t.teamId === teamId) }));
  }

  // ----------------------------------------------------------------- Hall of Fame

  awardsOf(seasonId: Id): AwardRow[] {
    return this.data.awards.filter((a) => a.season_id === seasonId);
  }

  hallOfFame(): HallOfFame {
    return this.memo('hof', () => {
      const finished = this.seasons.filter((s) => s.status === 'finished');
      const champions = finished.map((season) => {
        const award = this.data.awards.find((a) => a.season_id === season.id && a.type === 'champion');
        const constructors = this.data.awards.find((a) => a.season_id === season.id && a.type === 'constructors');
        const standings = this.driverStandings(season.id);
        const driverId = award?.driver_id ?? standings[0]?.driverId ?? null;
        return {
          season,
          driverId,
          teamId: constructors?.team_id ?? this.teamStandings(season.id)[0]?.teamId ?? null,
          points: standings.find((s) => s.driverId === driverId)?.points ?? null,
        };
      });

      const titles = new Map<Id, number>();
      for (const c of champions) if (c.driverId != null) titles.set(c.driverId, (titles.get(c.driverId) ?? 0) + 1);

      const career = new Map<Id, CareerStats>();
      for (const d of this.data.drivers) {
        if (d.anonymized && !this.resultsByDriver.has(d.id)) continue;
        if ((this.resultsByDriver.get(d.id)?.length ?? 0) > 0) career.set(d.id, this.driverCareer(d.id));
      }
      const top = (pick: (c: CareerStats) => number, limit = 10): HallOfFameEntry[] =>
        [...career.entries()]
          .map(([driverId, c]) => ({ driverId, value: pick(c) }))
          .filter((e) => e.value > 0)
          .sort((a, b) => b.value - a.value || this.driverName(a.driverId).localeCompare(this.driverName(b.driverId), 'de'))
          // Top N, bei Gleichstand an der Grenze alle mit demselben Wert
          .filter((e, i, all) => i < limit || e.value === all[limit - 1]?.value);

      return {
        champions,
        titles: [...titles.entries()].map(([driverId, value]) => ({ driverId, value })).sort((a, b) => b.value - a.value),
        wins: top((c) => c.wins),
        podiums: top((c) => c.podiums),
        poles: top((c) => c.poles),
        fastestLaps: top((c) => c.fastestLaps),
        starts: top((c) => c.starts),
        points: top((c) => c.points),
      };
    });
  }

  // ----------------------------------------------------------------- Inhalte

  /** Veröffentlichte News, neueste zuerst. */
  get news(): NewsRow[] {
    return this.data.news
      .filter((n) => n.status === 'published' && (n.publish_at == null || new Date(n.publish_at) <= this.now))
      .sort((a, b) => (b.publish_at ?? b.created_at).localeCompare(a.publish_at ?? a.created_at));
  }

  newsBySlug(slug: string, lang: Lang): NewsRow | undefined {
    return this.news.find((n) => (lang === 'de' ? n.slug_de : n.slug_en) === slug);
  }

  newsForRound(roundId: Id): NewsRow[] {
    return this.news.filter((n) => n.round_id === roundId);
  }

  /** Gültige Regelwerk-Version: die der aktuellen Saison, sonst die neueste veröffentlichte. */
  get rulesVersion(): RulesVersionRow | undefined {
    const published = this.data.rules_versions
      .filter((v) => v.status === 'published')
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
    const seasonVersion = this.currentSeason?.rules_version_id;
    return published.find((v) => v.id === seasonVersion) ?? published[0];
  }

  /** Alle veröffentlichten und archivierten Versionen (für „alte Versionen bleiben abrufbar“). */
  get rulesVersions(): RulesVersionRow[] {
    return this.data.rules_versions
      .filter((v) => v.status === 'published' || v.status === 'archived')
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  }

  rulesTree(versionId: Id): RuleNode[] {
    const sections = this.data.rules_sections.filter((s) => s.version_id === versionId).sort((a, b) => a.sort - b.sort);
    const nodes = new Map<Id, RuleNode>(sections.map((s) => [s.id, { ...s, children: [] }]));
    const roots: RuleNode[] = [];
    for (const s of sections) {
      const node = nodes.get(s.id)!;
      const parent = s.parent_id != null ? nodes.get(s.parent_id) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  get faq(): FaqItemRow[] {
    return [...this.data.faq_items].sort((a, b) => a.sort - b.sort);
  }

  get staff(): StaffMemberRow[] {
    return [...this.data.staff_members].sort((a, b) => a.sort - b.sort);
  }

  get openPositions(): OpenPositionRow[] {
    return this.data.open_positions.filter((p) => p.active).sort((a, b) => a.sort - b.sort);
  }

  get partners(): PartnerRow[] {
    return this.data.partners.filter((p) => p.active).sort((a, b) => a.sort - b.sort);
  }

  /** Letzte Aktualisierung einer Datenmenge – für „Stand: …“-Hinweise (Plan §11.3). */
  lastUpdated(rows: ReadonlyArray<{ updated_at: string }>): string | null {
    return rows.reduce<string | null>((max, r) => (max == null || r.updated_at > max ? r.updated_at : max), null);
  }
}
