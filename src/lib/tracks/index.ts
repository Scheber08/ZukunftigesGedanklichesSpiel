/**
 * Streckenseiten mit Rekorden (Plan Phase 3): Streckenliste aus den Liga-Kalendern und
 * Rekorde je Strecke. Reine Logik ohne I/O auf Basis der `League` – getestet in
 * tests/unit/tracks-records.test.ts.
 *
 * Rekorde zählen nur gewertete Ergebnisse (Runden-Status vorläufig, final oder korrigiert;
 * die League blendet alle anderen Ergebnisse schon aus). Disqualifizierte Ergebnisse zählen
 * für Zeit-Rekorde nicht.
 */

import { alternates, type Alternates, type Lang } from '~/i18n';
import type { Id, ResultRow, RoundRow, SeasonRow, SessionType, TrackRow } from '~/lib/db/types';
import { RESULT_VISIBLE_STATUSES } from '~/lib/db/types';
import type { League } from '~/lib/league/league';

// ---------------------------------------------------------------------------
// Streckenliste
// ---------------------------------------------------------------------------

/** Alle Strecken, die in mindestens einem Liga-Kalender vorkommen (auch abgesagte Runden). */
export function calendarTracks(league: League): TrackRow[] {
  const ids = new Set(league.data.rounds.map((r) => r.track_id));
  return league.data.tracks.filter((t) => ids.has(t.id)).sort((a, b) => a.name_de.localeCompare(b.name_de, 'de'));
}

/** Slugs für getStaticPaths der Streckenseiten. */
export function trackPageSlugs(league: League): string[] {
  return calendarTracks(league).map((t) => t.slug);
}

/** Seiten für die Sitemap (Übersicht + alle Streckenseiten) – für src/lib/content/sitemap.ts. */
export function trackSitemapPages(league: League): Array<{ alternates: Alternates; lastmod: string | null }> {
  const tracks = calendarTracks(league);
  return [
    { alternates: alternates('tracks'), lastmod: league.lastUpdated(tracks) },
    ...tracks.map((t) => ({ alternates: alternates('track', { slug: t.slug }), lastmod: t.updated_at ?? null })),
  ];
}

export function localTrackName(track: Pick<TrackRow, 'name_de' | 'name_en'>, lang: Lang): string {
  return lang === 'de' ? track.name_de : track.name_en;
}

/** Streckenlänge × Standard-Rundenzahl in km (null, wenn eines fehlt). */
export function raceDistanceKm(track: Pick<TrackRow, 'length_km' | 'laps_default'>): number | null {
  if (track.length_km == null || track.laps_default == null || track.length_km <= 0 || track.laps_default <= 0) return null;
  return Math.round(track.length_km * track.laps_default * 1000) / 1000;
}

const isUpcomingStatus = (r: Pick<RoundRow, 'status'>) => r.status === 'scheduled' || r.status === 'lineup_published';
/** Wie League.nextRound(): gestartete Runden ohne Ergebnis gelten noch 3 h als „nächste“. */
const UPCOMING_GRACE_MS = 3 * 3_600_000;

function isUpcoming(round: Pick<RoundRow, 'status' | 'start_utc'>, now: Date): boolean {
  return isUpcomingStatus(round) && new Date(round.start_utc).getTime() > now.getTime() - UPCOMING_GRACE_MS;
}

export interface TrackOverviewItem {
  track: TrackRow;
  /** Gewertete Rennen (Runden mit veröffentlichtem Ergebnis) */
  races: number;
  /** Nächste Runde auf dieser Strecke (falls geplant) */
  next: RoundRow | null;
  /** Rundennummer in der aktuellen Saison (für die Sortierung) */
  currentRound: RoundRow | null;
}

function overviewItem(league: League, track: TrackRow): TrackOverviewItem {
  const rounds = league.data.rounds.filter((r) => r.track_id === track.id);
  const season = league.currentSeason;
  return {
    track,
    races: rounds.filter((r) => RESULT_VISIBLE_STATUSES.includes(r.status)).length,
    next:
      rounds
        .filter((r) => isUpcoming(r, league.now))
        .sort((a, b) => a.start_utc.localeCompare(b.start_utc))[0] ?? null,
    currentRound:
      season != null
        ? (rounds.filter((r) => r.season_id === season.id).sort((a, b) => a.number - b.number)[0] ?? null)
        : null,
  };
}

/**
 * Übersicht: Strecken der aktuellen Saison in Kalender-Reihenfolge, danach alle weiteren
 * Strecken aus früheren Kalendern alphabetisch.
 */
export function tracksOverview(league: League, lang: Lang): { current: TrackOverviewItem[]; other: TrackOverviewItem[] } {
  const items = calendarTracks(league).map((t) => overviewItem(league, t));
  const current = items
    .filter((i) => i.currentRound != null)
    .sort((a, b) => a.currentRound!.number - b.currentRound!.number);
  const other = items
    .filter((i) => i.currentRound == null)
    .sort((a, b) => localTrackName(a.track, lang).localeCompare(localTrackName(b.track, lang), lang));
  return { current, other };
}

// ---------------------------------------------------------------------------
// Rekorde
// ---------------------------------------------------------------------------

export interface LapRecord {
  ms: number;
  result: ResultRow;
  round: RoundRow;
  season: SeasonRow;
  sessionType: SessionType;
}

export interface CountEntry {
  driverId: Id;
  value: number;
}

export interface TrackRoundEntry {
  round: RoundRow;
  season: SeasonRow;
  /** Sieger des Hauptrennens */
  winner: ResultRow | null;
  pole: ResultRow | null;
  fastestLap: ResultRow | null;
}

export interface TrackRecords {
  /** Anzahl gewerteter Rennen auf der Strecke */
  races: number;
  /** Schnellste Runde in einem Rennen (Hauptrennen oder Sprint) */
  fastestRaceLap: LapRecord | null;
  /** Beste Qualifying-Zeit */
  bestQualifying: LapRecord | null;
  /** Meiste Siege (Hauptrennen), absteigend, Gleichstand alphabetisch */
  wins: CountEntry[];
  /** Meiste Pole-Positions, absteigend */
  poles: CountEntry[];
  /** Gewertete Runden, neueste zuerst */
  history: TrackRoundEntry[];
  /** Erstes gewertetes Rennen */
  first: TrackRoundEntry | null;
  /** Nächste Runde auf dieser Strecke */
  next: RoundRow | null;
}

/** Zeitrekord: kleinste Zeit; bei gleicher Zeit zählt, wer sie zuerst gefahren ist. */
function bestLap(candidates: LapRecord[]): LapRecord | null {
  return (
    [...candidates].sort(
      (a, b) => a.ms - b.ms || a.round.start_utc.localeCompare(b.round.start_utc) || a.result.entered_position - b.result.entered_position,
    )[0] ?? null
  );
}

function ranking(counts: Map<Id, number>, name: (id: Id) => string): CountEntry[] {
  return [...counts.entries()]
    .map(([driverId, value]) => ({ driverId, value }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value || name(a.driverId).localeCompare(name(b.driverId), 'de'));
}

/** Rekorde und Historie einer Strecke aus allen gewerteten Runden aller Saisons. */
export function trackRecords(league: League, trackId: Id): TrackRecords {
  const rounds = league.data.rounds.filter((r) => r.track_id === trackId);
  const graded = rounds
    .filter((r) => league.hasResults(r.id))
    .sort((a, b) => a.start_utc.localeCompare(b.start_utc));

  const raceLaps: LapRecord[] = [];
  const qualiLaps: LapRecord[] = [];
  const wins = new Map<Id, number>();
  const poles = new Map<Id, number>();
  const history: TrackRoundEntry[] = [];

  for (const round of graded) {
    const season = league.season(round.season_id);
    if (!season) continue;
    let winner: ResultRow | null = null;
    let pole: ResultRow | null = null;
    let fastestLap: ResultRow | null = null;
    for (const session of league.sessionsOf(round.id)) {
      for (const result of league.resultsOf(session.id)) {
        const validLap = result.best_lap_ms != null && result.best_lap_ms > 0 && result.status !== 'dsq';
        if (session.type === 'qualifying') {
          if (validLap) qualiLaps.push({ ms: result.best_lap_ms!, result, round, season, sessionType: session.type });
          if (result.is_pole) {
            pole ??= result;
            poles.set(result.driver_id, (poles.get(result.driver_id) ?? 0) + 1);
          }
        } else {
          if (validLap) raceLaps.push({ ms: result.best_lap_ms!, result, round, season, sessionType: session.type });
          if (session.type === 'race') {
            if (result.position === 1) {
              winner ??= result;
              wins.set(result.driver_id, (wins.get(result.driver_id) ?? 0) + 1);
            }
            if (result.is_fastest_lap) fastestLap ??= result;
          }
        }
      }
    }
    history.push({ round, season, winner, pole, fastestLap });
  }

  const name = (id: Id) => league.driverName(id);
  return {
    races: graded.length,
    fastestRaceLap: bestLap(raceLaps),
    bestQualifying: bestLap(qualiLaps),
    wins: ranking(wins, name),
    poles: ranking(poles, name),
    history: [...history].reverse(),
    first: history[0] ?? null,
    next:
      rounds
        .filter((r) => isUpcoming(r, league.now))
        .sort((a, b) => a.start_utc.localeCompare(b.start_utc))[0] ?? null,
  };
}

/** Top N einer Rangliste; bei Gleichstand an der Grenze alle mit demselben Wert. */
export function topEntries(entries: readonly CountEntry[], limit = 5): CountEntry[] {
  return entries.filter((e, i) => i < limit || e.value === entries[limit - 1]?.value);
}

/** Alle, die sich den Spitzenwert teilen (z. B. „meiste Siege: A, B – je 2“). */
export function leaders(entries: readonly CountEntry[]): CountEntry[] {
  const top = entries[0]?.value;
  return top == null ? [] : entries.filter((e) => e.value === top);
}

// ---------------------------------------------------------------------------
// JSON-LD (Plan §10)
// ---------------------------------------------------------------------------

/** Strecke als schema.org Place (Land als Adresse, Karte als Bild). */
export function trackPlaceJsonLd(
  track: Pick<TrackRow, 'name_de' | 'name_en' | 'country_code' | 'map_url'>,
  lang: Lang,
  pageUrl: string,
  mapUrl?: string | null,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: localTrackName(track, lang),
    url: pageUrl,
    address: { '@type': 'PostalAddress', addressCountry: track.country_code.toUpperCase() },
    ...(mapUrl ? { hasMap: mapUrl } : {}),
  };
}
