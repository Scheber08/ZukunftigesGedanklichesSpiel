/**
 * Datenquelle der Social-Grafiken: aus der `League` (nur öffentliche Daten) ein kompaktes,
 * serialisierbares Paket für die Admin-Island bauen. Keine E-Mails, Discord-Namen, EA-IDs
 * oder Notizen – nur, was auch auf der Website steht. Rein, ohne I/O.
 */
import type {
  DriverStatus,
  Id,
  ResultRow,
  ResultStatus,
  RoundFormat,
  RoundStatus,
  SeasonStatus,
  SessionType,
} from '~/lib/db/types';
import type { League } from '~/lib/league/league';

export interface GTeam {
  id: Id;
  name: string;
  short: string;
  color: string;
}

export interface GDriver {
  id: Id;
  /** leer bei pseudonymisierten Fahrern */
  slug: string;
  /** null = pseudonymisiert („Ehemaliger Fahrer #id“) */
  tag: string | null;
  nat: string | null;
  /** aktuelle bzw. nächste gültige Startnummer */
  num: number | null;
  status: DriverStatus;
  /** Saison, in der der Fahrer dazugekommen ist */
  joined: Id | null;
}

export interface GResult {
  pos: number | null;
  driver: Id;
  team: Id;
  num: number | null;
  status: ResultStatus;
  timeMs: number | null;
  gapMs: number | null;
  gapLaps: number | null;
  bestMs: number | null;
  fastest: boolean;
  pole: boolean;
  points: number;
  grid: number | null;
  reserve: boolean;
}

export interface GEntry {
  driver: Id;
  team: Id;
  seat: 1 | 2;
  num: number | null;
  reserve: boolean;
  replaces: Id | null;
}

export interface GRound {
  id: Id;
  number: number;
  status: RoundStatus;
  format: RoundFormat;
  trackDe: string;
  trackEn: string;
  country: string;
  lengthKm: number | null;
  laps: number | null;
  startUtc: string;
  sessions: SessionType[];
  /** veröffentlichtes Rennergebnis (sortiert, gewertete zuerst) */
  race: GResult[];
  /**
   * veröffentlichtes Qualifying – nur die ersten drei (Pole-Motiv), solange die Startplätze im
   * Rennergebnis stehen; sonst komplett (Startaufstellung aus dem Qualifying)
   */
  quali: GResult[];
  /** veröffentlichte Aufstellung in Team-Reihenfolge – nur, solange es keine Startplätze gibt */
  lineup: GEntry[];
}

export interface GStanding {
  pos: number;
  id: Id;
  /** Team (nur Fahrerwertung) */
  team: Id | null;
  points: number;
  tied: boolean;
}

export interface GStandings {
  /** Stand nach dieser Rundennummer */
  after: number;
  drivers: GStanding[];
  teams: GStanding[];
}

export interface GSeason {
  id: Id;
  number: number;
  name: string;
  status: SeasonStatus;
  rounds: GRound[];
  standings: GStandings[];
  /** Team-Reihenfolge der Saison */
  teams: Id[];
  /** aktuelle Cockpits: Fahrer → Team */
  seats: Array<[Id, Id]>;
}

export interface GraphicsSource {
  brand: { name: string; shortName: string; host: string };
  /** Zeitpunkt der Erzeugung (ISO) – Bezug für „nächste Runde“ */
  now: string;
  /** aktuelle Saison (aktiv, sonst zuletzt abgeschlossen, sonst geplant) */
  currentSeasonId: Id | null;
  seasons: GSeason[];
  teams: GTeam[];
  drivers: GDriver[];
  /** SVG-Flaggen nach ISO-Code (nur benötigte) */
  flags: Record<string, string>;
}

export interface SourceOptions {
  brand: GraphicsSource['brand'];
  /** SVG-Flagge zu einem ISO-Code (z. B. aus country-flag-icons) */
  flagSvg?: (code: string) => string | undefined;
  /** Top N der Fahrerwertung je Stand (Story zeigt 22) */
  standingsLimit?: number;
}

function toResult(r: ResultRow): GResult {
  return {
    pos: r.position,
    driver: r.driver_id,
    team: r.team_id,
    num: r.race_number,
    status: r.status,
    timeMs: r.total_time_ms,
    gapMs: r.gap_ms,
    gapLaps: r.gap_laps,
    bestMs: r.best_lap_ms,
    fastest: r.is_fastest_lap,
    pole: r.is_pole,
    points: r.points,
    grid: r.grid_position,
    reserve: r.role === 'reserve',
  };
}

/** Paket für die Grafik-Island aus der League (nur öffentliche Sichten der League-Klasse). */
export function buildGraphicsSource(league: League, options: SourceOptions): GraphicsSource {
  const limit = options.standingsLimit ?? 22;
  const countries = new Set<string>();

  const seasons: GSeason[] = league.seasons.map((season) => {
    const rounds: GRound[] = league.roundsOf(season.id).map((round) => {
      const track = league.track(round.track_id);
      if (track?.country_code) countries.add(track.country_code.toUpperCase());
      const resultsOf = (type: SessionType) => {
        const session = league.sessionOf(round.id, type);
        return session ? league.resultsOf(session.id).map(toResult) : [];
      };
      // Nur, was die Motive brauchen (hält die Seite klein)
      const race = resultsOf('race');
      const hasGrid = race.some((x) => x.grid != null);
      const quali = resultsOf('qualifying');
      return {
        id: round.id,
        number: round.number,
        status: round.status,
        format: round.format,
        trackDe: track?.name_de ?? '',
        trackEn: track?.name_en ?? track?.name_de ?? '',
        country: track?.country_code?.toUpperCase() ?? '',
        lengthKm: track?.length_km ?? null,
        laps: track?.laps_default ?? null,
        startUtc: round.start_utc,
        sessions: league.sessionsOf(round.id).map((s) => s.type),
        race,
        quali: hasGrid ? quali.filter((x) => x.pole || (x.pos != null && x.pos <= 3)) : quali,
        lineup: (hasGrid ? [] : league.entriesOf(round.id)).map((e) => ({
          driver: e.driver_id,
          team: e.team_id,
          seat: e.seat_no,
          num: e.race_number,
          reserve: e.role === 'reserve',
          replaces: e.replaces_driver_id,
        })),
      };
    });

    const standings: GStandings[] = league.countedRounds(season.id).map((round) => ({
      after: round.number,
      drivers: league
        .driverStandings(season.id, round.number)
        .slice(0, limit)
        .map((d) => ({ pos: d.position, id: d.driverId, team: d.teamId, points: d.points, tied: d.tied })),
      teams: league
        .teamStandings(season.id, round.number)
        .map((t) => ({ pos: t.position, id: t.teamId, team: null, points: t.points, tied: t.tied })),
    }));

    return {
      id: season.id,
      number: season.number,
      name: season.name,
      status: season.status,
      rounds,
      standings,
      teams: league.teamsOf(season.id).map((t) => t.id),
      seats: league.seatsOf(season.id).map((s) => [s.driver_id, s.team_id] as [Id, Id]),
    };
  });

  const drivers: GDriver[] = league.drivers.map((d) => {
    if (!d.anonymized && d.nationality_code) countries.add(d.nationality_code.toUpperCase());
    return {
      id: d.id,
      slug: d.anonymized ? '' : d.slug,
      tag: d.anonymized ? null : d.gamertag,
      nat: d.anonymized ? null : (d.nationality_code?.toUpperCase() ?? null),
      num: d.anonymized ? null : league.numberOf(d.id),
      status: d.status,
      joined: d.joined_season_id,
    };
  });

  const teams: GTeam[] = league.data.teams.map((t) => ({ id: t.id, name: t.name, short: t.short_name, color: t.color_hex }));

  const flags: Record<string, string> = {};
  if (options.flagSvg) {
    for (const code of [...countries].sort()) {
      const svg = options.flagSvg(code);
      if (svg) flags[code] = svg;
    }
  }

  return {
    brand: options.brand,
    now: league.now.toISOString(),
    currentSeasonId: league.currentSeason?.id ?? null,
    seasons,
    teams,
    drivers,
    flags,
  };
}
