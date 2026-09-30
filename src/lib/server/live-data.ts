/**
 * Live-Daten für OBS-Overlays (/api/overlay/*.json) und den Discord-Bot (/api/discord/interactions).
 *
 * Im Worker nie `loadLeague()` pro Anfrage (Plan §7.2, CPU-Limit): stattdessen wenige gezielte
 * Abfragen über `getPublicStore()` (anon key + RLS → nur öffentliche Daten) und die reinen
 * Wertungsfunktionen aus src/lib/domain. Die Ergebnisse sind klein (eine Saison) und werden im
 * Isolate kurz zwischengespeichert.
 *
 * Aufbau: `loadLiveSnapshot()` lädt (I/O), alle anderen Funktionen sind rein und arbeiten auf dem
 * Snapshot – getestet in tests/unit/overlay-live-data.test.ts.
 */

import type { OverlayName, OverlayParams } from '~/components/overlay/params';
import type {
  LineupPayload,
  NextRacePayload,
  OverlayLine,
  OverlayPayload,
  OverlayRound,
  ResultPayload,
  StandingsPayload,
  TickerPayload,
} from '~/components/overlay/types';
import { t, url, type Lang } from '~/i18n';
import type { Store } from '../db/store';
import type {
  DriverNumberRow,
  DriverRow,
  Id,
  ResultRow,
  RoundEntryRow,
  RoundRow,
  SeasonRow,
  SeasonTeamRow,
  SeatRow,
  SessionRow,
  SessionType,
  TeamRow,
  TrackRow,
} from '../db/types';
import { RESULT_VISIBLE_STATUSES } from '../db/types';
import { formatGapMs, formatLapTime } from '../domain/laptime';
import { currentNumber } from '../domain/numbers';
import { driverStandings, teamStandings, type DriverStanding, type StandingsInput, type TeamStanding } from '../domain/standings';
import { gamertagKey } from '../domain/text';
import { formatDateLong, formatTime, timeZoneName } from '../domain/time';
import { isReservedDriverSlug } from '../people';
import { countryName, roundLabel, seasonLabel, trackName } from '../view';
import { getPublicStore, storeVersion } from './db';

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export interface LiveSnapshot {
  now: Date;
  seasons: SeasonRow[];
  /** Aktive Saison, sonst die zuletzt abgeschlossene, sonst die nächste geplante (wie League.currentSeason) */
  season: SeasonRow | null;
  rounds: RoundRow[];
  tracks: TrackRow[];
  teams: TeamRow[];
  seasonTeams: SeasonTeamRow[];
  drivers: DriverRow[];
  numbers: DriverNumberRow[];
  /** Sessions der geladenen Runden (aktuelle Saison + letztes Ergebnis) */
  sessions: SessionRow[];
  /** Nur Ergebnisse gewerteter Runden (vorläufig/final/korrigiert) */
  results: ResultRow[];
  /** Veröffentlichte Aufstellung der nächsten Runde */
  entries: RoundEntryRow[];
  /** Cockpits der aktuellen Saison */
  seats: SeatRow[];
}

export type SnapshotPart = 'results' | 'entries' | 'seats';

const SESSION_ORDER: Record<SessionType, number> = { qualifying: 0, sprint: 1, race: 2 };
const UPCOMING_GRACE_MS = 3 * 3_600_000;

export function pickCurrentSeason(seasons: readonly SeasonRow[]): SeasonRow | null {
  const list = [...seasons].sort((a, b) => b.number - a.number);
  return (
    list.find((s) => s.status === 'active') ??
    list.find((s) => s.status === 'finished') ??
    [...list].reverse().find((s) => s.status === 'planned') ??
    null
  );
}

/** Nächste Runde (wie League.nextRound): noch nicht gestartet bzw. vor < 3 h gestartet und ohne Ergebnis. */
export function pickNextRound(rounds: readonly RoundRow[], now: Date): RoundRow | null {
  const cutoff = now.getTime() - UPCOMING_GRACE_MS;
  return (
    [...rounds]
      .filter((r) => (r.status === 'scheduled' || r.status === 'lineup_published') && new Date(r.start_utc).getTime() > cutoff)
      .sort((a, b) => a.start_utc.localeCompare(b.start_utc))[0] ?? null
  );
}

/** Aufstellungen bleiben am Renntag bis 12 h nach dem Start „aktuell“ (Stream läuft, Ergebnis fehlt noch). */
const LINEUP_GRACE_MS = 12 * 3_600_000;

/** Runde für das Aufstellungs-Overlay: veröffentlichte Aufstellung einer laufenden Runde, sonst die nächste. */
export function pickLineupRound(rounds: readonly RoundRow[], now: Date): RoundRow | null {
  const cutoff = now.getTime() - LINEUP_GRACE_MS;
  const running = [...rounds]
    .filter((r) => r.status === 'lineup_published' && new Date(r.start_utc).getTime() > cutoff)
    .sort((a, b) => a.start_utc.localeCompare(b.start_utc))[0];
  return running ?? pickNextRound(rounds, now);
}

/** Zuletzt gewertete Runde (alle Saisons). */
export function pickLastResultRound(rounds: readonly RoundRow[]): RoundRow | null {
  return [...rounds].filter((r) => RESULT_VISIBLE_STATUSES.includes(r.status)).sort((a, b) => b.start_utc.localeCompare(a.start_utc))[0] ?? null;
}

/** Lädt die für Overlays/Bot nötigen Daten mit wenigen gezielten Abfragen. */
export async function loadLiveSnapshot(store: Store, parts: readonly SnapshotPart[], now: Date = new Date()): Promise<LiveSnapshot> {
  const [seasons, rounds, tracks, teams, seasonTeams, drivers, numbers] = await Promise.all([
    store.select('seasons'),
    store.select('rounds'),
    store.select('tracks'),
    store.select('teams'),
    store.select('season_teams'),
    store.select('drivers'),
    store.select('driver_numbers'),
  ]);
  const season = pickCurrentSeason(seasons);
  const snap: LiveSnapshot = {
    now,
    seasons,
    season,
    rounds,
    tracks,
    teams,
    seasonTeams,
    // Wie die View drivers_public: keine Links, die der Fahrer nicht zeigen will
    drivers: drivers.map((d) => (d.show_links ? d : { ...d, twitch_url: null, youtube_url: null })),
    numbers,
    sessions: [],
    results: [],
    entries: [],
    seats: [],
  };

  const jobs: Array<Promise<void>> = [];
  if (parts.includes('results')) {
    const visible = new Set(rounds.filter((r) => RESULT_VISIBLE_STATUSES.includes(r.status)).map((r) => r.id));
    const last = pickLastResultRound(rounds);
    const roundIds = [...new Set([...rounds.filter((r) => r.season_id === season?.id && visible.has(r.id)).map((r) => r.id), ...(last ? [last.id] : [])])];
    if (roundIds.length > 0) {
      jobs.push(
        (async () => {
          const sessions = await store.select('sessions', { in: { round_id: roundIds } });
          snap.sessions = sessions;
          if (sessions.length === 0) return;
          const results = await store.select('results', { in: { session_id: sessions.map((s) => s.id) } });
          // Doppelte Absicherung zusätzlich zur RLS: nur gewertete Runden
          const roundOf = new Map(sessions.map((s) => [s.id, s.round_id]));
          snap.results = results.filter((r) => visible.has(roundOf.get(r.session_id) ?? -1));
        })(),
      );
    }
  }
  if (parts.includes('entries')) {
    const next = pickLineupRound(rounds, now);
    if (next && next.status !== 'scheduled') {
      jobs.push(
        store.select('round_entries', { eq: { round_id: next.id } }).then((rows) => {
          snap.entries = rows;
        }),
      );
    }
  }
  if (parts.includes('seats') && season) {
    jobs.push(
      store.select('seats', { eq: { season_id: season.id } }).then((rows) => {
        snap.seats = rows;
      }),
    );
  }
  await Promise.all(jobs);
  return snap;
}

const snapshotCache = new Map<string, { at: number; version: number; promise: Promise<LiveSnapshot> }>();
const SNAPSHOT_TTL_MS = 10_000;

/** Snapshot aus dem öffentlichen Store, 10 s im Isolate zwischengespeichert. */
export function liveSnapshot(parts: readonly SnapshotPart[]): Promise<LiveSnapshot> {
  const key = [...parts].sort().join(',');
  const version = storeVersion();
  const now = Date.now();
  const hit = snapshotCache.get(key);
  if (hit && hit.version === version && now - hit.at < SNAPSHOT_TTL_MS) return hit.promise;
  const promise = loadLiveSnapshot(getPublicStore(), parts, new Date(now));
  promise.catch(() => {
    if (snapshotCache.get(key)?.promise === promise) snapshotCache.delete(key);
  });
  snapshotCache.set(key, { at: now, version, promise });
  return promise;
}

// ---------------------------------------------------------------------------
// Hilfen auf dem Snapshot
// ---------------------------------------------------------------------------

const byId = <T extends { id: Id }>(list: readonly T[], id: Id | null | undefined): T | undefined =>
  id == null ? undefined : list.find((x) => x.id === id);

export function driverDisplayName(snap: LiveSnapshot, id: Id, lang: Lang = 'de'): string {
  const d = byId(snap.drivers, id);
  if (!d) return lang === 'de' ? 'Unbekannt' : 'Unknown';
  if (d.anonymized) return `${t(lang, 'common.formerDriver')} #${d.id}`;
  return d.gamertag;
}

function seasonRounds(snap: LiveSnapshot, seasonId: Id): RoundRow[] {
  return snap.rounds.filter((r) => r.season_id === seasonId).sort((a, b) => a.number - b.number);
}

/** Teams der Saison in Anzeige-Reihenfolge. */
function seasonTeamIds(snap: LiveSnapshot, seasonId: Id): Id[] {
  return snap.seasonTeams
    .filter((st) => st.season_id === seasonId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((st) => st.team_id);
}

/** Eingabe der Wertungslogik – identisch zu League.standingsInput (gleiche Sortierung, gleiche Namen). */
export function standingsInputFor(snap: LiveSnapshot, seasonId: Id): StandingsInput {
  const rounds = seasonRounds(snap, seasonId);
  const roundIds = new Set(rounds.map((r) => r.id));
  const sessionById = new Map(snap.sessions.map((s) => [s.id, s]));
  const results = snap.results
    .filter((r) => roundIds.has(sessionById.get(r.session_id)?.round_id ?? -1))
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.entered_position - b.entered_position)
    .map((r) => {
      const session = sessionById.get(r.session_id)!;
      return {
        roundId: session.round_id,
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
      };
    });
  return {
    rounds,
    results,
    driverName: (id) => driverDisplayName(snap, id),
    teamName: (id) => byId(snap.teams, id)?.name ?? String(id),
    teamIds: seasonTeamIds(snap, seasonId),
  };
}

export function liveDriverStandings(snap: LiveSnapshot): DriverStanding[] {
  return snap.season ? driverStandings(standingsInputFor(snap, snap.season.id)) : [];
}

export function liveTeamStandings(snap: LiveSnapshot): TeamStanding[] {
  return snap.season ? teamStandings(standingsInputFor(snap, snap.season.id)) : [];
}

/** Letzte gewertete Runde der aktuellen Saison (für „Stand nach Runde X“). */
function lastCountedRound(snap: LiveSnapshot): RoundRow | null {
  if (!snap.season) return null;
  return seasonRounds(snap, snap.season.id).filter((r) => RESULT_VISIBLE_STATUSES.includes(r.status)).at(-1) ?? null;
}

/** Nummer der Runde, für die die aktuelle Aufstellung gilt (wie League.currentRoundNumber). */
function currentRoundNumber(snap: LiveSnapshot, seasonId: Id): number {
  const rounds = seasonRounds(snap, seasonId);
  const next = rounds.find((r) => r.status !== 'cancelled' && !RESULT_VISIBLE_STATUSES.includes(r.status));
  return next?.number ?? rounds.at(-1)?.number ?? 1;
}

const pos = (position: number, tied: boolean) => (tied ? `=${position}` : String(position));
const fmtPoints = (points: number, lang: Lang) => new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB').format(points);

export function overlayRound(snap: LiveSnapshot, round: RoundRow, lang: Lang): OverlayRound {
  const track = byId(snap.tracks, round.track_id);
  const season = byId(snap.seasons, round.season_id);
  return {
    seasonName: season ? seasonLabel(season, lang) : '',
    number: round.number,
    label: roundLabel(round, track, lang),
    trackName: trackName(track, lang),
    countryCode: track?.country_code ?? '',
    countryName: countryName(track?.country_code, lang),
    startUtc: round.start_utc,
    dateText: `${formatDateLong(round.start_utc, lang)} · ${formatTime(round.start_utc, lang)} ${timeZoneName(round.start_utc, lang)}`,
    format: round.format,
    formatText: round.format === 'sprint' ? t(lang, 'format.sprint') : null,
    status: round.status,
    statusText: t(lang, `status.round.${round.status}`),
    path: season ? url(lang, 'race', { season: season.slug, round: round.number }) : url(lang, 'calendar'),
  };
}

// ---------------------------------------------------------------------------
// Overlay-Daten
// ---------------------------------------------------------------------------

export function nextRacePayload(snap: LiveSnapshot, lang: Lang): NextRacePayload {
  const next = pickNextRound(snap.rounds, snap.now);
  return { kind: 'next', generatedAt: snap.now.toISOString(), round: next ? overlayRound(snap, next, lang) : null };
}

/** Aufstellung der aktuellen bzw. nächsten Runde nach Team (Team-Reihenfolge der Saison, Cockpit 1 vor 2). */
export function lineupPayload(snap: LiveSnapshot, lang: Lang): LineupPayload {
  const next = pickLineupRound(snap.rounds, snap.now);
  const base = { kind: 'lineup' as const, generatedAt: snap.now.toISOString(), round: next ? overlayRound(snap, next, lang) : null };
  if (!next || next.status === 'scheduled') return { ...base, published: false, teams: [] };
  const order = new Map(seasonTeamIds(snap, next.season_id).map((id, i) => [id, i]));
  const entries = snap.entries
    .filter((e) => e.round_id === next.id)
    .sort((a, b) => (order.get(a.team_id) ?? 99) - (order.get(b.team_id) ?? 99) || a.seat_no - b.seat_no);
  const teams: LineupPayload['teams'] = [];
  for (const e of entries) {
    const team = byId(snap.teams, e.team_id);
    if (!team) continue;
    let group = teams.find((g) => g.name === team.name);
    if (!group) {
      group = { name: team.name, short: team.short_name, color: team.color_hex, drivers: [] };
      teams.push(group);
    }
    group.drivers.push({
      number: e.race_number ?? currentNumber(e.driver_id, snap.numbers, new Date(next.start_utc)),
      name: driverDisplayName(snap, e.driver_id, lang),
      reserve: e.role === 'reserve',
      replaces: e.replaces_driver_id != null ? driverDisplayName(snap, e.replaces_driver_id, lang) : null,
    });
  }
  return { ...base, published: teams.length > 0, teams };
}

export function standingsPayload(snap: LiveSnapshot, lang: Lang, art: 'drivers' | 'teams', n: number): StandingsPayload {
  const last = lastCountedRound(snap);
  const base = {
    kind: 'standings' as const,
    generatedAt: snap.now.toISOString(),
    art,
    seasonName: snap.season ? seasonLabel(snap.season, lang) : null,
    afterRound: last?.number ?? null,
  };
  if (!last) return { ...base, rows: [] };
  if (art === 'teams') {
    const rows = liveTeamStandings(snap)
      .slice(0, n)
      .map((s): OverlayLine => {
        const team = byId(snap.teams, s.teamId);
        return {
          pos: pos(s.position, s.tied),
          number: null,
          name: team?.name ?? String(s.teamId),
          team: null,
          color: team?.color_hex ?? null,
          value: fmtPoints(s.points, lang),
          detail: s.gapToLeader > 0 ? `−${fmtPoints(s.gapToLeader, lang)}` : null,
          marks: [],
        };
      });
    return { ...base, rows };
  }
  const rows = liveDriverStandings(snap)
    .slice(0, n)
    .map((s): OverlayLine => {
      const team = byId(snap.teams, s.teamId);
      return {
        pos: pos(s.position, s.tied),
        number: currentNumber(s.driverId, snap.numbers, snap.now),
        name: driverDisplayName(snap, s.driverId, lang),
        team: team?.name ?? null,
        color: team?.color_hex ?? null,
        value: fmtPoints(s.points, lang),
        detail: s.gapToLeader > 0 ? `−${fmtPoints(s.gapToLeader, lang)}` : null,
        marks: [],
      };
    });
  return { ...base, rows };
}

/** Abstand/Status einer Ergebniszeile: Siegerzeit, „+1.234“, „+1 Rd.“ oder DNF/DSQ/… */
export function resultDetail(r: Pick<ResultRow, 'status' | 'position' | 'total_time_ms' | 'gap_ms' | 'gap_laps'>, lang: Lang): string | null {
  if (r.status !== 'classified') return t(lang, `status.result.${r.status}`);
  if (r.position === 1) return r.total_time_ms != null ? formatLapTime(r.total_time_ms) : null;
  if (r.gap_laps != null && r.gap_laps > 0) return t(lang, 'results.lapsDown', { n: r.gap_laps });
  return formatGapMs(r.gap_ms) || null;
}

/** Ergebnis des Hauptrennens der zuletzt gewerteten Runde. */
export function resultPayload(snap: LiveSnapshot, lang: Lang, n: number): ResultPayload {
  const round = pickLastResultRound(snap.rounds);
  const base = { kind: 'result' as const, generatedAt: snap.now.toISOString() };
  if (!round) return { ...base, round: null, statusText: null, rows: [] };
  const sessions = snap.sessions.filter((s) => s.round_id === round.id).sort((a, b) => SESSION_ORDER[a.type] - SESSION_ORDER[b.type]);
  const race = sessions.find((s) => s.type === 'race');
  const quali = sessions.find((s) => s.type === 'qualifying');
  const poleId = quali ? snap.results.find((r) => r.session_id === quali.id && r.is_pole)?.driver_id : undefined;
  const rows = (race ? snap.results.filter((r) => r.session_id === race.id) : [])
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.entered_position - b.entered_position)
    .slice(0, n)
    .map((r): OverlayLine => {
      const team = byId(snap.teams, r.team_id);
      const marks: OverlayLine['marks'] = [];
      if (r.driver_id === poleId) marks.push('pole');
      if (r.is_fastest_lap) marks.push('fastestLap');
      if (r.role === 'reserve') marks.push('reserve');
      return {
        pos: r.position != null ? String(r.position) : t(lang, `status.result.${r.status}`),
        number: r.race_number,
        name: driverDisplayName(snap, r.driver_id, lang),
        team: team?.name ?? null,
        color: team?.color_hex ?? null,
        value: fmtPoints(r.points, lang),
        detail: resultDetail(r, lang),
        marks,
      };
    });
  return { ...base, round: overlayRound(snap, round, lang), statusText: t(lang, `status.round.${round.status}`), rows };
}

/** Laufband: nächstes Rennen, Fahrer- und Teamwertung (Top N), letztes Ergebnis (Podium). */
export function tickerPayload(snap: LiveSnapshot, lang: Lang, n: number): TickerPayload {
  const items: string[] = [];
  const next = nextRacePayload(snap, lang).round;
  if (next) items.push(t(lang, 'overlay.ticker.next', { round: next.label, date: next.dateText }));
  const drivers = standingsPayload(snap, lang, 'drivers', n);
  if (drivers.rows.length > 0) {
    const list = drivers.rows.map((r) => `${r.pos}. ${r.name} ${r.value}`).join(' · ');
    items.push(t(lang, 'overlay.ticker.drivers', { round: drivers.afterRound ?? '', list }));
  }
  const teams = standingsPayload(snap, lang, 'teams', n);
  if (teams.rows.length > 0) {
    const list = teams.rows.map((r) => `${r.pos}. ${r.name} ${r.value}`).join(' · ');
    items.push(t(lang, 'overlay.ticker.teams', { list }));
  }
  const result = resultPayload(snap, lang, 3);
  if (result.round && result.rows.length > 0) {
    const list = result.rows.map((r) => `${r.pos}. ${r.name}`).join(' · ');
    items.push(t(lang, 'overlay.ticker.result', { round: result.round.label, status: result.statusText ?? '', list }));
  }
  return { kind: 'ticker', generatedAt: snap.now.toISOString(), items };
}

/** Welche Daten ein Overlay braucht (weniger Abfragen für Countdown und Aufstellung). */
export function overlayParts(name: OverlayName): SnapshotPart[] {
  switch (name) {
    case 'naechstes-rennen':
      return [];
    case 'aufstellung':
      return ['entries'];
    default:
      return ['results'];
  }
}

export function buildOverlayPayload(name: OverlayName, snap: LiveSnapshot, p: OverlayParams): OverlayPayload {
  switch (name) {
    case 'naechstes-rennen':
      return nextRacePayload(snap, p.lang);
    case 'aufstellung':
      return lineupPayload(snap, p.lang);
    case 'wertung':
      return standingsPayload(snap, p.lang, p.art, p.n);
    case 'ergebnis':
      return resultPayload(snap, p.lang, p.n);
    case 'ticker':
      return tickerPayload(snap, p.lang, p.n);
  }
}

// ---------------------------------------------------------------------------
// Fahrer-Kurzprofil (Discord-Bot /fahrer)
// ---------------------------------------------------------------------------

export interface DriverProfile {
  name: string;
  slug: string;
  number: number | null;
  nationality: string | null;
  team: { name: string; color: string } | null;
  reserve: boolean;
  position: string | null;
  points: number | null;
  wins: number;
  podiums: number;
  seasonName: string | null;
  path: string;
}

/**
 * Fahrer mit Profilseite (nicht pseudonymisiert und mit Nummer, Cockpit, Ergebnis oder Aufstellung).
 * Reservierte Slugs („vergleich“/„compare“) haben keine Profilseite – der Link führte sonst zum Vergleich.
 */
export function profileDrivers(snap: LiveSnapshot): DriverRow[] {
  const referenced = new Set<Id>([
    ...snap.numbers.map((n) => n.driver_id),
    ...snap.seats.map((s) => s.driver_id),
    ...snap.results.map((r) => r.driver_id),
    ...snap.entries.map((e) => e.driver_id),
  ]);
  return snap.drivers
    .filter((d) => !d.anonymized && !isReservedDriverSlug(d.slug) && referenced.has(d.id))
    .sort((a, b) => a.gamertag.localeCompare(b.gamertag, 'de'));
}

/**
 * Fahrer zu einer Eingabe finden: Slug (Autocomplete-Wert) oder Gamertag exakt, sonst ein
 * eindeutiger Teiltreffer. Mehrdeutige Eingaben liefern die Kandidaten.
 */
export function findDriver(snap: LiveSnapshot, query: string): { driver: DriverRow | null; candidates: DriverRow[] } {
  const q = gamertagKey(query);
  if (q === '') return { driver: null, candidates: [] };
  const list = profileDrivers(snap);
  const exact = list.find((d) => d.slug === query.trim().toLowerCase() || gamertagKey(d.gamertag) === q);
  if (exact) return { driver: exact, candidates: [exact] };
  const partial = list.filter((d) => gamertagKey(d.gamertag).includes(q));
  return { driver: partial.length === 1 ? partial[0]! : null, candidates: partial };
}

/** Vorschläge für das Autocomplete (Anfang vor Teiltreffer, max. 25 laut Discord). */
export function driverSuggestions(snap: LiveSnapshot, query: string, limit = 25): DriverRow[] {
  const q = gamertagKey(query);
  const list = profileDrivers(snap);
  if (q === '') return list.slice(0, limit);
  const starts = list.filter((d) => gamertagKey(d.gamertag).startsWith(q));
  const contains = list.filter((d) => !starts.includes(d) && gamertagKey(d.gamertag).includes(q));
  return [...starts, ...contains].slice(0, limit);
}

export function driverProfile(snap: LiveSnapshot, driver: DriverRow, lang: Lang): DriverProfile {
  const season = snap.season;
  let team: DriverProfile['team'] = null;
  if (season) {
    const n = currentRoundNumber(snap, season.id);
    const seat = snap.seats.find(
      (s) => s.season_id === season.id && s.driver_id === driver.id && s.from_round <= n && (s.to_round == null || s.to_round >= n),
    );
    const row = seat ? byId(snap.teams, seat.team_id) : undefined;
    if (row) team = { name: row.name, color: row.color_hex };
  }
  const standing = liveDriverStandings(snap).find((s) => s.driverId === driver.id);
  return {
    name: driver.gamertag,
    slug: driver.slug,
    number: currentNumber(driver.id, snap.numbers, snap.now),
    nationality: driver.nationality_code,
    team,
    reserve: driver.status === 'reserve',
    position: standing && standing.starts + standing.points > 0 ? pos(standing.position, standing.tied) : null,
    points: standing?.points ?? null,
    wins: standing?.wins ?? 0,
    podiums: standing?.podiums ?? 0,
    seasonName: season ? seasonLabel(season, lang) : null,
    path: url(lang, 'driver', { slug: driver.slug }),
  };
}
