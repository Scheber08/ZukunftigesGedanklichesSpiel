/**
 * Demo-Datensatz für Entwicklung, Vorschau und E2E-Tests (ohne Supabase).
 *
 * Zwei Saisons mit fiktiven Fahrern: Saison 1 ist abgeschlossen (Archiv, Hall of Fame),
 * Saison 2 läuft. Die Termine werden relativ zu `now` erzeugt, damit Countdown,
 * „vorläufig“-Status und Protestfrist immer realistisch aussehen. Die Ergebnisse
 * laufen durch dieselbe Punktelogik wie im Admin (computeSession).
 */

import type { Dataset } from '../db/memory-store';
import type {
  AwardRow,
  DecisionRow,
  DriverNumberRow,
  DriverRow,
  Id,
  IncidentRow,
  NewsRow,
  Platform,
  ResultRow,
  RoundEntryRow,
  RoundRow,
  SeatRow,
  SessionRow,
  SessionType,
  StandingsSnapshotRow,
} from '../db/types';
import { gridPenaltiesFromPreviousRound, penaltiesForSession } from '../domain/decisions';
import { computeGrid, computeSession, type EnteredResult } from '../domain/points';
import { driverStandings, teamStandings, type StandingsResult } from '../domain/standings';
import { slugify } from '../domain/text';
import { addHours, utcToZonedLocal, zonedLocalToUtc } from '../domain/time';
import { DEFAULT_LOBBY_SETTINGS } from './content/lobby';
import { BASE_POINTS_SCHEMES, BASE_TEAMS, BASE_TRACKS, baseDataset } from './base';

type Seed<T> = Omit<T, 'created_at' | 'updated_at'>;

/** Fiktiver Chef-Steward mit bereits abgegebener erster Stimme (Vier-Augen-Prinzip). */
const DEMO_CHIEF_STEWARD_ID = '00000000-0000-4000-8000-000000000005';

/** Deterministischer Zufallsgenerator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoDriver {
  id: Id;
  gamertag: string;
  nat: string | null;
  platform: Platform;
  wheel: boolean;
  skill: number;
  status: DriverRow['status'];
  reserveOrder?: number;
  numbers: number[];
  joinedSeason: 1 | 2;
}

const D = (
  id: number,
  gamertag: string,
  nat: string | null,
  platform: Platform,
  skill: number,
  numbers: number[],
  extra: Partial<DemoDriver> = {},
): DemoDriver => ({
  id,
  gamertag,
  nat,
  platform,
  wheel: id % 3 !== 0,
  skill,
  status: 'active',
  numbers,
  joinedSeason: 1,
  ...extra,
});

/** Fiktive Gamertags – keine realen Personen. */
const DRIVERS: DemoDriver[] = [
  D(1, 'ApexAnna', 'DE', 'pc_steam', 0.95, [4]),
  D(2, 'KerbKiller77', 'DE', 'playstation', 0.93, [77]),
  D(3, 'LateBrakeLukas', 'AT', 'pc_ea', 0.91, [16]),
  D(4, 'Slipstream_Sam', 'GB', 'xbox', 0.9, [44, 8]),
  D(5, 'DRS_Dani', 'DE', 'playstation', 0.88, [55]),
  D(6, 'TurboTobi', 'CH', 'pc_steam', 0.87, [12]),
  D(7, 'Undercut_Uli', 'DE', 'playstation', 0.86, [23]),
  D(8, 'PitWallPaula', 'NL', 'pc_steam', 0.85, [30]),
  D(9, 'GravelTrap_Gustav', 'SE', 'xbox', 0.84, [31]),
  D(10, 'Oversteer_Olli', 'DE', 'pc_ea', 0.83, [10]),
  D(11, 'HairpinHanna', 'DE', 'playstation', 0.82, [27]),
  D(12, 'BlueFlag_Ben', 'BE', 'pc_steam', 0.81, [5]),
  D(13, 'ChicaneCharlie', 'FR', 'xbox', 0.8, [63]),
  D(14, 'EauRouge_Emil', 'DE', 'playstation', 0.79, [14]),
  D(15, 'Parabolica_Pia', 'IT', 'pc_steam', 0.78, [7]),
  D(16, 'SectorSeven', 'PL', 'playstation', 0.77, [18]),
  D(17, 'Box_Box_Bruno', 'DE', 'xbox', 0.76, [22]),
  D(18, 'TyreWhisperer', 'DK', 'pc_steam', 0.75, [87]),
  D(19, 'MaxAttackMia', 'DE', 'playstation', 0.74, [43]),
  D(20, 'SafetyCar_Sven', null, 'pc_ea', 0.73, [6]),
  D(21, 'Kurvenkönig', 'DE', 'playstation', 0.72, [11], { joinedSeason: 2 }),
  D(22, 'NightRace_Nils', 'DE', 'xbox', 0.71, [99], { joinedSeason: 2 }),
  D(23, 'Reserve_Rico', 'DE', 'playstation', 0.7, [24], { status: 'reserve', reserveOrder: 1 }),
  D(24, 'WetTyre_Wiebke', 'DE', 'pc_steam', 0.69, [33], { status: 'reserve', reserveOrder: 2, joinedSeason: 2 }),
  D(25, 'OutLap_Oskar', 'AT', 'xbox', 0.68, [37], { status: 'reserve', reserveOrder: 3, joinedSeason: 2 }),
  D(26, 'Pole_Paulina', 'CZ', 'playstation', 0.67, [50], { status: 'reserve', reserveOrder: 4, joinedSeason: 2 }),
  D(27, 'Backmarker_Bea', 'DE', 'pc_steam', 0.6, [61], { status: 'reserve', reserveOrder: 5, joinedSeason: 2 }),
  D(28, 'Formation_Finn', 'DE', 'playstation', 0.62, [70], { status: 'reserve', reserveOrder: 6, joinedSeason: 2 }),
  D(29, 'Retired_Ralf', 'DE', 'pc_steam', 0.8, [3], { status: 'inactive' }),
  D(30, 'Oldtimer_Otto', 'DE', 'xbox', 0.75, [88], { status: 'inactive' }),
];

const SKILL = new Map(DRIVERS.map((d) => [d.id, d.skill]));

/** Saison 1: Teamaufstellung (Team-ID → [Cockpit 1, Cockpit 2]). */
const S1_LINEUP: Record<number, [number, number]> = {
  1: [3, 29], 2: [1, 6], 3: [2, 5], 4: [4, 8], 5: [7, 30], 6: [9, 10],
  7: [11, 12], 8: [13, 14], 9: [15, 16], 10: [17, 18], 11: [19, 20],
};

const S1_TRACKS = ['shanghai', 'jeddah', 'barcelona', 'budapest', 'zandvoort', 'baku', 'mexico-city', 'sao-paulo'];
const S2_TRACKS = ['melbourne', 'suzuka', 'sakhir', 'miami', 'montreal', 'spielberg', 'silverstone', 'spa', 'monza', 'singapore', 'austin', 'abu-dhabi'];
const S2_SPRINT_ROUNDS = new Set([3, 8]);

/** Abmeldungen: Saison → Runde → [abwesend, rechtzeitig, Ersatz]. */
const ABSENCES: Record<number, Record<number, Array<[number, boolean, number]>>> = {
  1: { 3: [[30, true, 23]] },
  2: { 2: [[7, true, 23]], 4: [[12, false, 24], [18, true, 25]], 5: [[3, true, 23]] },
};

const trackId = (slug: string) => BASE_TRACKS.find((t) => t.slug === slug)!.id;
const track = (id: Id) => BASE_TRACKS.find((t) => t.id === id)!;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function demoDataset(now: Date = new Date()): Dataset {
  const base = baseDataset();
  const iso = (d: Date) => d.toISOString();

  // ------------------------------------------------------------------ Termine
  // Renntag-Situation: R5 ist vor ~3 h gestartet (Aufstellung steht, Ergebnis fehlt noch),
  // R4 ist vorläufig mit offener Protestfrist, das nächste Rennen ist R6 in einer Woche.
  const floorHour = (ms: number) => new Date(Math.floor(ms / 3_600_000) * 3_600_000);
  const s2r5Local = utcToZonedLocal(floorHour(now.getTime() - 3 * 3_600_000));
  const s2r4Local = utcToZonedLocal(floorHour(now.getTime() - 30 * 3_600_000));
  const s2r4Date = s2r4Local.slice(0, 10);
  const s2r5Date = s2r5Local.slice(0, 10);
  const s2Start = addDays(s2r4Date, -21);
  const s1Start = addDays(s2Start, -26 * 7);

  const seasons = [
    {
      id: 1,
      number: 1,
      slug: '1',
      name: 'Saison 1',
      game_version: 'F1 25',
      status: 'finished' as const,
      points_scheme_id: BASE_POINTS_SCHEMES[1]!.id,
      reserve_points_for_constructors: false,
      protest_window_hours: 48,
      two_steward_rule: false,
      penalty_points_enabled: false,
      penalty_points_config: {},
      raceday_deadlines: {},
      lobby_settings: DEFAULT_LOBBY_SETTINGS,
      rules_version_id: 1,
      starts_on: s1Start,
      ends_on: addDays(s1Start, 7 * 7),
    },
    {
      id: 2,
      number: 2,
      slug: '2',
      name: 'Saison 2',
      game_version: 'F1 25 · 2026 Season Pack',
      status: 'active' as const,
      points_scheme_id: BASE_POINTS_SCHEMES[1]!.id,
      reserve_points_for_constructors: true,
      protest_window_hours: 48,
      two_steward_rule: true,
      penalty_points_enabled: true,
      penalty_points_config: { warning_threshold: 6, ban_threshold: 10, expiry_rounds: null },
      raceday_deadlines: {},
      lobby_settings: DEFAULT_LOBBY_SETTINGS,
      rules_version_id: 1,
      starts_on: s2Start,
      ends_on: addDays(s2Start, 11 * 7),
    },
  ];

  const rounds: Seed<RoundRow>[] = [];
  let roundId = 1;
  const mkRound = (seasonId: Id, number: number, slug: string, date: string, status: RoundRow['status'], format: RoundRow['format']) => {
    // Datum (dann 20:00 Uhr) oder komplette Ortszeit
    const local = date.length > 10 ? date : `${date}T20:00:00`;
    const start = zonedLocalToUtc(local);
    const provisionalAt = ['provisional', 'final', 'corrected'].includes(status) ? addHours(start, 2.5) : null;
    const round: Seed<RoundRow> = {
      id: roundId++,
      season_id: seasonId,
      number,
      track_id: trackId(slug),
      local_start: local,
      timezone: 'Europe/Berlin',
      start_utc: iso(start),
      format,
      status,
      provisional_at: provisionalAt ? iso(provisionalAt) : null,
      protest_deadline: provisionalAt ? iso(addHours(provisionalAt, 48)) : null,
      final_at: status === 'final' || status === 'corrected' ? iso(addHours(start, 72)) : null,
      vod_url: status === 'final' && number % 2 === 1 ? 'https://www.youtube.com/@beispiel' : null,
      highlights_url: null,
    };
    rounds.push(round);
    return round;
  };

  S1_TRACKS.forEach((slug, i) => mkRound(1, i + 1, slug, addDays(s1Start, i * 7), i === 5 ? 'corrected' : 'final', i === 3 ? 'sprint' : 'standard'));
  S2_TRACKS.forEach((slug, i) => {
    const n = i + 1;
    const status: RoundRow['status'] = n <= 3 ? 'final' : n === 4 ? 'provisional' : n === 5 ? 'lineup_published' : 'scheduled';
    const when = n < 4 ? addDays(s2r4Date, (n - 4) * 7) : n === 4 ? s2r4Local : n === 5 ? s2r5Local : addDays(s2r5Date, (n - 5) * 7);
    mkRound(2, n, slug, when, status, S2_SPRINT_ROUNDS.has(n) ? 'sprint' : 'standard');
  });

  const sessions: Seed<SessionRow>[] = [];
  let sessionId = 1;
  for (const r of rounds) {
    const types: SessionType[] = r.format === 'sprint' ? ['qualifying', 'sprint', 'race'] : ['qualifying', 'race'];
    const entered = ['provisional', 'final', 'corrected'].includes(r.status);
    for (const type of types) {
      sessions.push({ id: sessionId++, round_id: r.id, type, weather: type === 'race' && r.id % 5 === 0 ? 'Leichter Regen' : 'Trocken', status: entered ? 'entered' : 'pending' });
    }
  }

  // ------------------------------------------------------------------ Fahrer & Nummern
  const drivers: Seed<DriverRow>[] = DRIVERS.map((d) => ({
    id: d.id,
    slug: slugify(d.gamertag),
    gamertag: d.gamertag,
    nationality_code: d.nat,
    platform: d.platform,
    input_device: d.wheel ? 'wheel' : 'controller',
    status: d.status,
    reserve_order: d.reserveOrder ?? null,
    joined_season_id: d.joinedSeason,
    twitch_url: d.id === 1 ? 'https://www.twitch.tv/beispiel' : null,
    youtube_url: null,
    show_links: d.id === 1,
    anonymized: false,
    is_minor: false,
  }));

  const s1StartUtc = iso(zonedLocalToUtc(`${s1Start}T00:00:00`));
  const s2StartUtc = iso(zonedLocalToUtc(`${addDays(s2Start, -14)}T00:00:00`));
  const s2r3 = rounds.find((r) => r.season_id === 2 && r.number === 3)!;
  const s1End = iso(zonedLocalToUtc(`${addDays(s1Start, 8 * 7)}T00:00:00`));
  const driverNumbers: Seed<DriverNumberRow>[] = [];
  let numberId = 1;
  for (const d of DRIVERS) {
    const from = d.joinedSeason === 1 ? s1StartUtc : s2StartUtc;
    if (d.numbers.length === 2) {
      // Nummernwechsel ab Runde 3 der Saison 2 (mit Admin-OK)
      driverNumbers.push({ id: numberId++, driver_id: d.id, number: d.numbers[0]!, valid_from: from, valid_to: s2r3.start_utc, note: null });
      driverNumbers.push({ id: numberId++, driver_id: d.id, number: d.numbers[1]!, valid_from: s2r3.start_utc, valid_to: null, note: 'Wechsel auf Wunsch, Admin-OK' });
    } else {
      const released = d.status === 'inactive';
      driverNumbers.push({
        id: numberId++,
        driver_id: d.id,
        number: d.numbers[0]!,
        valid_from: from,
        valid_to: released ? s1End : null,
        note: released ? 'Freigegeben (inaktiv)' : null,
      });
    }
  }
  const numberAt = (driverId: Id, atIso: string): number | null =>
    driverNumbers.find((n) => n.driver_id === driverId && n.valid_from <= atIso && (n.valid_to == null || n.valid_to > atIso))?.number ?? null;

  // ------------------------------------------------------------------ Teams & Cockpits
  const seasonTeams = seasons.flatMap((s) => BASE_TEAMS.map((t, i) => ({ season_id: s.id, team_id: t.id, sort_order: i })));
  const seats: Seed<SeatRow>[] = [];
  let seatId = 1;
  for (const [teamId, [a, b]] of Object.entries(S1_LINEUP)) {
    seats.push({ id: seatId++, season_id: 1, team_id: Number(teamId), seat_no: 1, driver_id: a, from_round: 1, to_round: null });
    seats.push({ id: seatId++, season_id: 1, team_id: Number(teamId), seat_no: 2, driver_id: b, from_round: 1, to_round: null });
  }
  for (const t of BASE_TEAMS) {
    const a = t.id * 2 - 1;
    const b = t.id * 2;
    if (t.id === 3) {
      // Transfer ab Runde 3: DRS_Dani (5) ↔ ChicaneCharlie (13)
      seats.push({ id: seatId++, season_id: 2, team_id: 3, seat_no: 1, driver_id: 5, from_round: 1, to_round: 2 });
      seats.push({ id: seatId++, season_id: 2, team_id: 3, seat_no: 1, driver_id: 13, from_round: 3, to_round: null });
      seats.push({ id: seatId++, season_id: 2, team_id: 3, seat_no: 2, driver_id: b, from_round: 1, to_round: null });
      continue;
    }
    if (t.id === 7) {
      seats.push({ id: seatId++, season_id: 2, team_id: 7, seat_no: 1, driver_id: 13, from_round: 1, to_round: 2 });
      seats.push({ id: seatId++, season_id: 2, team_id: 7, seat_no: 1, driver_id: 5, from_round: 3, to_round: null });
      seats.push({ id: seatId++, season_id: 2, team_id: 7, seat_no: 2, driver_id: b, from_round: 1, to_round: null });
      continue;
    }
    seats.push({ id: seatId++, season_id: 2, team_id: t.id, seat_no: 1, driver_id: a, from_round: 1, to_round: null });
    seats.push({ id: seatId++, season_id: 2, team_id: t.id, seat_no: 2, driver_id: b, from_round: 1, to_round: null });
  }

  // ------------------------------------------------------------------ Aufstellungen
  const entries: Seed<RoundEntryRow>[] = [];
  const absences: Array<{ round_id: Id; driver_id: Id; reported_in_time: boolean; note: string | null }> = [];
  let entryId = 1;
  for (const r of rounds) {
    if (r.status === 'scheduled' || r.status === 'cancelled') continue;
    const roundAbs = ABSENCES[r.season_id]?.[r.number] ?? [];
    const active = seats.filter((s) => s.season_id === r.season_id && s.from_round <= r.number && (s.to_round == null || s.to_round >= r.number));
    for (const s of active) {
      const abs = roundAbs.find(([driver]) => driver === s.driver_id);
      if (abs) {
        absences.push({ round_id: r.id, driver_id: s.driver_id, reported_in_time: abs[1], note: abs[1] ? null : 'Abmeldung nach Frist' });
      }
      const driverId = abs ? abs[2] : s.driver_id;
      entries.push({
        id: entryId++,
        round_id: r.id,
        team_id: s.team_id,
        seat_no: s.seat_no,
        driver_id: driverId,
        role: abs ? 'reserve' : 'regular',
        replaces_driver_id: abs ? s.driver_id : null,
        race_number: numberAt(driverId, r.start_utc),
      });
    }
  }

  // ------------------------------------------------------------------ Vorfälle & Urteile
  const roundOf = (season: number, number: number) => rounds.find((r) => r.season_id === season && r.number === number)!;
  const sessionOf = (roundId: Id, type: SessionType) => sessions.find((s) => s.round_id === roundId && s.type === type)!;
  const after = (r: Seed<RoundRow>, hours: number) => iso(addHours(new Date(r.start_utc), hours));

  const incidents: Seed<IncidentRow>[] = [];
  const decisions: Seed<DecisionRow>[] = [];
  const mkIncident = (i: Omit<Seed<IncidentRow>, 'ip_hash' | 'clip_timestamp' | 'session_id'> & Partial<Seed<IncidentRow>>) => {
    incidents.push({ ip_hash: null, clip_timestamp: null, session_id: null, ...i });
    return i.id;
  };
  const mkDecision = (d: Omit<Seed<DecisionRow>, 'penalty_points' | 'clip_url' | 'reasoning_en' | 'rule_ref' | 'decided_by' | 'time_seconds' | 'positions' | 'incident_id' | 'session_id'> & Partial<Seed<DecisionRow>>) => {
    decisions.push({
      penalty_points: null,
      clip_url: null,
      reasoning_en: null,
      rule_ref: null,
      decided_by: [],
      time_seconds: null,
      positions: null,
      incident_id: null,
      session_id: null,
      ...d,
    });
  };

  const s1r6 = roundOf(1, 6);
  mkDecision({
    id: 1,
    public_ref: 'S1-R06-01',
    round_id: s1r6.id,
    session_id: sessionOf(s1r6.id, 'race').id,
    driver_id: 6,
    verdict: 'dsq',
    reasoning_de: 'Nach Auswertung des Replays wurde festgestellt, dass mit einer laut Lobby-Einstellungen nicht erlaubten Fahrhilfe gefahren wurde. Die Disqualifikation wurde nach der Final-Setzung ausgesprochen, das Ergebnis wurde korrigiert.',
    reasoning_en: 'The replay showed that an assist not permitted by the lobby settings was used. The disqualification was issued after the result had been finalised; the result has been corrected.',
    rule_ref: '§10',
    status: 'published',
    published_at: after(s1r6, 100),
  });

  const s2r2 = roundOf(2, 2);
  mkIncident({
    id: 1,
    round_id: s2r2.id,
    session_id: sessionOf(s2r2.id, 'race').id,
    reporter_driver_id: 9,
    reporter_contact: 'gravel_gustav',
    involved_driver_ids: [9, 10],
    lap: 3,
    corner: 'Kurve 1',
    description: 'Beim Anbremsen auf Kurve 1 wurde ich von hinten getroffen und habe mich gedreht.',
    clip_url: 'https://youtu.be/beispiel?t=754',
    clip_timestamp: '12:34',
    submitted_at: after(s2r2, 20),
    source: 'report',
    status: 'decided',
  });
  mkDecision({
    id: 2,
    public_ref: 'S2-R02-01',
    penalty_points: 2,
    incident_id: 1,
    round_id: s2r2.id,
    session_id: sessionOf(s2r2.id, 'race').id,
    driver_id: 10,
    verdict: 'time_penalty',
    time_seconds: 5,
    reasoning_de: 'Oversteer_Olli hat den Bremspunkt verpasst und GravelTrap_Gustav in Kurve 1 von hinten getroffen. Gustav drehte sich und verlor mehrere Positionen. Hauptschuld bei Car #10 (Strafenkatalog V-02).',
    reasoning_en: 'Oversteer_Olli missed his braking point and hit GravelTrap_Gustav from behind at turn 1. Gustav spun and lost several positions. Car #10 wholly to blame (penalty catalogue V-02).',
    rule_ref: '§8',
    clip_url: 'https://youtu.be/beispiel?t=754',
    status: 'published',
    published_at: after(s2r2, 70),
  });
  mkDecision({
    id: 3,
    public_ref: 'S2-R02-02',
    penalty_points: 0,
    round_id: s2r2.id,
    session_id: sessionOf(s2r2.id, 'race').id,
    driver_id: 16,
    verdict: 'warning',
    reasoning_de: 'Eigene Untersuchung der Stewards: mehrfacher Richtungswechsel auf der Geraden in Runde 11. Keine Kollision, daher Verwarnung.',
    reasoning_en: 'Stewards’ own investigation: more than one change of direction on the straight on lap 11. No contact, therefore a warning.',
    rule_ref: '§3.2',
    status: 'published',
    published_at: after(s2r2, 71),
  });

  const s2r3r = roundOf(2, 3);
  mkIncident({
    id: 2,
    round_id: s2r3r.id,
    session_id: sessionOf(s2r3r.id, 'race').id,
    reporter_driver_id: 14,
    reporter_contact: 'eaurouge_emil',
    involved_driver_ids: [14, 13],
    lap: 8,
    corner: 'Kurve 10',
    description: 'Ich wurde beim Überholversuch von der Strecke gedrängt.',
    clip_url: 'https://medal.tv/games/f1/clips/beispiel',
    clip_timestamp: '0:42',
    submitted_at: after(s2r3r, 30),
    source: 'report',
    status: 'decided',
  });
  mkDecision({
    id: 4,
    public_ref: 'S2-R03-01',
    penalty_points: 3,
    incident_id: 2,
    round_id: s2r3r.id,
    session_id: sessionOf(s2r3r.id, 'race').id,
    driver_id: 13,
    verdict: 'grid_penalty_next',
    positions: 3,
    reasoning_de: 'ChicaneCharlie hat beim Verteidigen keinen Platz gelassen, obwohl EauRouge_Emil bereits auf Höhe der Vorderachse war. Grid-Strafe von 3 Plätzen für das nächste Rennen.',
    reasoning_en: 'ChicaneCharlie did not leave room while defending although EauRouge_Emil was already alongside the front axle. Three-place grid penalty for the next race.',
    rule_ref: '§3.3',
    status: 'published',
    published_at: after(s2r3r, 72),
  });
  mkDecision({
    id: 5,
    public_ref: 'S2-R03-02',
    penalty_points: 2,
    round_id: s2r3r.id,
    session_id: sessionOf(s2r3r.id, 'race').id,
    driver_id: 20,
    verdict: 'position_penalty',
    positions: 2,
    reasoning_de: 'Wiederholter Vorteil durch Verlassen der Strecke in Kurve 4, ohne die Position zurückzugeben.',
    reasoning_en: 'Repeatedly gained an advantage by leaving the track at turn 4 without giving the position back.',
    rule_ref: '§3.4',
    status: 'published',
    published_at: after(s2r3r, 73),
  });

  const s2r4 = roundOf(2, 4);
  mkIncident({
    id: 3,
    round_id: s2r4.id,
    session_id: sessionOf(s2r4.id, 'race').id,
    reporter_driver_id: 5,
    reporter_contact: 'drs_dani',
    involved_driver_ids: [5, 11],
    lap: 1,
    corner: 'Kurve 11',
    description: 'Kontakt beim Einlenken, ich musste in die Auslaufzone.',
    clip_url: 'https://www.twitch.tv/videos/123456789',
    clip_timestamp: '1:02:10',
    submitted_at: after(s2r4, 6),
    ip_hash: 'demo',
    source: 'report',
    status: 'new',
  });
  mkIncident({
    id: 4,
    round_id: s2r4.id,
    session_id: sessionOf(s2r4.id, 'race').id,
    reporter_driver_id: 19,
    reporter_contact: 'maxattackmia',
    involved_driver_ids: [19, 22],
    lap: 14,
    corner: 'Kurve 17',
    description: 'Unsicheres Wiedereinfahren nach Dreher direkt vor mir.',
    clip_url: 'https://streamable.com/beispiel',
    submitted_at: after(s2r4, 9),
    ip_hash: 'demo',
    source: 'report',
    status: 'in_review',
  });
  mkDecision({
    id: 6,
    public_ref: 'S2-R04-01',
    penalty_points: 2,
    incident_id: 4,
    round_id: s2r4.id,
    session_id: sessionOf(s2r4.id, 'race').id,
    driver_id: 22,
    verdict: 'time_penalty',
    time_seconds: 5,
    reasoning_de:
      'NightRace_Nils ist nach einem Dreher in Kurve 17 ohne ausreichenden Blick auf den nachfolgenden Verkehr zurück auf die Ideallinie gefahren und hat MaxAttackMia zum Ausweichen gezwungen (Strafenkatalog V-04, unsicheres Wiedereinfahren).',
    reasoning_en:
      'After spinning at turn 17, NightRace_Nils rejoined the racing line without sufficient regard for following traffic and forced MaxAttackMia to take avoiding action (penalty catalogue V-04, unsafe rejoin).',
    rule_ref: '§8',
    // Erste Stimme liegt vor – die zweite fehlt noch (Vier-Augen-Prinzip in Saison 2)
    decided_by: [DEMO_CHIEF_STEWARD_ID],
    status: 'draft',
    published_at: null,
  });

  // ------------------------------------------------------------------ Ergebnisse
  const results: Seed<ResultRow>[] = [];
  let resultId = 1;
  const schemeFor = (seasonId: Id) => {
    const s = seasons.find((x) => x.id === seasonId)!;
    return { scheme: BASE_POINTS_SCHEMES.find((p) => p.id === s.points_scheme_id)!, reserve: s.reserve_points_for_constructors };
  };
  const previousRoundId = (r: Seed<RoundRow>): Id | null =>
    rounds.find((x) => x.season_id === r.season_id && x.number === r.number - 1)?.id ?? null;

  for (const r of rounds) {
    if (!['provisional', 'final', 'corrected'].includes(r.status)) continue;
    const random = rng(r.id * 7919);
    const noise = (scale: number) => (random() - 0.5) * scale;
    const t = track(r.track_id);
    const lapMs = Math.round((t.length_km ?? 5) * 16_800);
    const raceLaps = Math.round((t.laps_default ?? 50) * 0.5);
    const sprintLaps = Math.round((t.laps_default ?? 50) * 0.33);
    const roundEntries = entries.filter((e) => e.round_id === r.id);
    const { scheme, reserve } = schemeFor(r.season_id);
    const roundSessions = sessions.filter((s) => s.round_id === r.id);

    const quali = [...roundEntries]
      .map((e) => ({ e, score: SKILL.get(e.driver_id)! + noise(0.12) }))
      .sort((a, b) => b.score - a.score);

    const store = (session: Seed<SessionRow>, entered: EnteredResult[], grid: Map<Id, number> | null, pits: boolean) => {
      const { results: computed } = computeSession(entered, penaltiesForSession(decisions, session), {
        type: session.type,
        scheme,
        reservePointsForConstructors: reserve,
      });
      for (const c of computed) {
        const entry = roundEntries.find((e) => e.driver_id === c.driverId)!;
        results.push({
          id: resultId++,
          session_id: session.id,
          round_entry_id: entry.id,
          driver_id: c.driverId,
          team_id: c.teamId,
          race_number: entry.race_number,
          role: c.role,
          entered_position: c.enteredPosition,
          position: c.position,
          status: c.status,
          entered_status: entered.find((e) => e.driverId === c.driverId)?.status ?? c.status,
          grid_position: grid?.get(c.driverId) ?? null,
          laps: c.laps,
          total_time_ms: c.totalTimeMs,
          gap_ms: c.gapMs,
          gap_laps: c.gapLaps,
          best_lap_ms: c.bestLapMs,
          pit_stops: pits && c.status !== 'dns' ? 1 + (c.driverId % 3 === 0 ? 1 : 0) : null,
          ingame_penalty_s: c.driverId % 11 === 0 ? 5 : 0,
          steward_penalty_s: c.stewardPenaltyS,
          is_fastest_lap: c.isFastestLap,
          is_pole: c.isPole,
          points: c.points,
          counts_for_constructors: c.countsForConstructors,
        });
      }
      return computed;
    };

    // Qualifying
    const qualiSession = roundSessions.find((s) => s.type === 'qualifying')!;
    const qualiEntered: EnteredResult[] = quali.map(({ e }, i) => ({
      driverId: e.driver_id,
      teamId: e.team_id,
      role: e.role,
      enteredPosition: i + 1,
      status: 'classified',
      laps: null,
      totalTimeMs: null,
      gapMs: null,
      gapLaps: null,
      bestLapMs: lapMs + Math.round((1 - SKILL.get(e.driver_id)!) * 2400 + i * 60 + random() * 40),
    }));
    const qualiComputed = store(qualiSession, qualiEntered, null, false);
    const grid = computeGrid(
      qualiComputed.filter((c) => c.position != null).map((c) => c.driverId),
      gridPenaltiesFromPreviousRound(decisions, previousRoundId(r)),
    );

    const runRace = (session: Seed<SessionRow>, laps: number, variance: number) => {
      const order = [...roundEntries]
        .map((e) => ({ e, score: SKILL.get(e.driver_id)! - (grid.get(e.driver_id) ?? 22) * 0.004 + noise(variance), dnf: random() < 0.045 }))
        .sort((a, b) => Number(a.dnf) - Number(b.dnf) || b.score - a.score);
      const leaderTime = laps * (lapMs + 1800);
      let gap = 0;
      const entered: EnteredResult[] = order.map(({ e, dnf }, i) => {
        if (i > 0) gap += 300 + Math.round(random() * 3500);
        const lapped = !dnf && gap > lapMs;
        return {
          driverId: e.driver_id,
          teamId: e.team_id,
          role: e.role,
          enteredPosition: i + 1,
          status: dnf ? 'dnf' : 'classified',
          laps: dnf ? Math.max(1, Math.floor(laps * random())) : lapped ? laps - 1 : laps,
          totalTimeMs: dnf ? null : lapped ? leaderTime + gap - lapMs : leaderTime + gap,
          gapMs: dnf || lapped || i === 0 ? null : gap,
          gapLaps: lapped ? 1 : dnf ? null : 0,
          bestLapMs: lapMs + 700 + Math.round((1 - SKILL.get(e.driver_id)!) * 1900 + random() * 650),
        };
      });
      return store(session, entered, grid, session.type === 'race');
    };

    const sprintSession = roundSessions.find((s) => s.type === 'sprint');
    if (sprintSession) runRace(sprintSession, sprintLaps, 0.12);
    runRace(roundSessions.find((s) => s.type === 'race')!, raceLaps, 0.16);
  }

  // ------------------------------------------------------------------ Wertung, Snapshots, Awards
  const standingsInput = (seasonId: Id) => {
    const seasonRounds = rounds.filter((r) => r.season_id === seasonId);
    const ids = new Set(seasonRounds.map((r) => r.id));
    const sessionRound = new Map(sessions.map((s) => [s.id, s]));
    const rows: StandingsResult[] = results
      .filter((x) => ids.has(sessionRound.get(x.session_id)!.round_id))
      .map((x) => {
        const s = sessionRound.get(x.session_id)!;
        return {
          roundId: s.round_id,
          sessionType: s.type,
          driverId: x.driver_id,
          teamId: x.team_id,
          role: x.role,
          position: x.position,
          status: x.status,
          points: x.points,
          isPole: x.is_pole,
          isFastestLap: x.is_fastest_lap,
          countsForConstructors: x.counts_for_constructors,
          gridPosition: x.grid_position,
        };
      });
    return {
      rounds: seasonRounds,
      results: rows,
      driverName: (id: Id) => DRIVERS.find((d) => d.id === id)?.gamertag ?? String(id),
      teamName: (id: Id) => BASE_TEAMS.find((t) => t.id === id)?.name ?? String(id),
      teamIds: BASE_TEAMS.map((t) => t.id),
    };
  };

  const snapshots: Seed<StandingsSnapshotRow>[] = [];
  let snapId = 1;
  for (const season of seasons) {
    const input = standingsInput(season.id);
    for (const r of rounds.filter((x) => x.season_id === season.id && (x.status === 'final' || x.status === 'corrected'))) {
      for (const s of driverStandings(input, r.number)) {
        snapshots.push({ id: snapId++, season_id: season.id, after_round_id: r.id, kind: 'driver', entity_id: s.driverId, position: s.position, points: s.points, wins: s.wins, podiums: s.podiums, poles: s.poles, fastest_laps: s.fastestLaps });
      }
      for (const s of teamStandings(input, r.number)) {
        snapshots.push({ id: snapId++, season_id: season.id, after_round_id: r.id, kind: 'team', entity_id: s.teamId, position: s.position, points: s.points, wins: s.wins, podiums: s.podiums, poles: s.poles, fastest_laps: s.fastestLaps });
      }
    }
  }

  const s1Final = standingsInput(1);
  const awards: Seed<AwardRow>[] = [
    { id: 1, season_id: 1, round_id: null, type: 'champion', driver_id: driverStandings(s1Final)[0]!.driverId, team_id: null },
    { id: 2, season_id: 1, round_id: null, type: 'constructors', driver_id: null, team_id: teamStandings(s1Final)[0]!.teamId },
    { id: 3, season_id: 2, round_id: roundOf(2, 1).id, type: 'driver_of_the_day', driver_id: 14, team_id: null },
    { id: 4, season_id: 2, round_id: roundOf(2, 2).id, type: 'driver_of_the_day', driver_id: 9, team_id: null },
    { id: 5, season_id: 2, round_id: roundOf(2, 3).id, type: 'driver_of_the_day', driver_id: 21, team_id: null },
  ];

  // ------------------------------------------------------------------ Inhalte
  const newsAt = (r: Seed<RoundRow>, hours: number) => iso(addHours(new Date(r.start_utc), hours));
  const s2r1 = roundOf(2, 1);
  const news: Seed<NewsRow>[] = [
    {
      id: 1,
      slug_de: 'saison-2-startet',
      slug_en: 'season-2-kicks-off',
      title_de: 'Saison 2 startet: 12 Runden, zwei Sprints, ein volles Grid',
      title_en: 'Season 2 kicks off: 12 rounds, two sprints, a full grid',
      excerpt_de: 'Der Kalender steht, alle 22 Cockpits sind vergeben und der Reservepool ist so groß wie nie.',
      excerpt_en: 'The calendar is set, all 22 cockpits are filled and the reserve pool is bigger than ever.',
      body_de:
        'Der Kalender für **Saison 2** steht: 12 Runden, davon zwei mit Sprint. Gefahren wird wie gewohnt donnerstags um 20:00 Uhr.\n\n## Was ist neu?\n\n- Reservepunkte zählen jetzt auch für die Konstrukteurswertung.\n- Vier-Augen-Prinzip bei den Stewards.\n- Neue Teams im Grid: Audi und Cadillac.\n\nAlle Termine findest du im [Kalender](/kalender) – inklusive Kalender-Abo.',
      body_en:
        'The **Season 2** calendar is set: 12 rounds, two of them with a sprint. As usual we race on Thursdays at 8 pm (Berlin time).\n\n## What’s new?\n\n- Reserve drivers’ points now count for the constructors’ championship.\n- Four-eyes principle for the stewards.\n- New teams on the grid: Audi and Cadillac.\n\nFind all dates in the [calendar](/en/calendar) – including a calendar subscription.',
      cover_image: null,
      cover_alt_de: null,
      cover_alt_en: null,
      og_image: null,
      category: 'announcement',
      round_id: null,
      author_id: null,
      author_name: 'RaceControl_Rene',
      discord_post: false,
      status: 'published',
      publish_at: newsAt(s2r1, -24 * 10),
    },
    {
      id: 2,
      slug_de: 'neuzugaenge-saison-2',
      slug_en: 'new-drivers-season-2',
      title_de: 'Neuzugänge: Willkommen im Grid',
      title_en: 'New drivers: welcome to the grid',
      excerpt_de: 'Zwei neue Stammfahrer und fünf neue Reservefahrer verstärken die Liga.',
      excerpt_en: 'Two new regular drivers and five new reserve drivers join the league.',
      body_de: 'Mit **Kurvenkönig** und **NightRace_Nils** übernehmen zwei neue Fahrer ein Stammcockpit. Dazu kommen fünf neue Reservefahrer. Viel Spaß und faire Rennen!',
      body_en: '**Kurvenkönig** and **NightRace_Nils** take over regular cockpits. Five new reserve drivers join as well. Have fun and race fair!',
      cover_image: null,
      cover_alt_de: null,
      cover_alt_en: null,
      og_image: null,
      category: 'new_drivers',
      round_id: null,
      author_id: null,
      author_name: 'Newsdesk_Nora',
      discord_post: false,
      status: 'published',
      publish_at: newsAt(s2r1, -24 * 5),
    },
    {
      id: 3,
      slug_de: 'rennbericht-r3-sakhir',
      slug_en: 'race-report-r3-sakhir',
      title_de: 'Rennbericht R3 · Sakhir: Sprint-Wochenende unter Flutlicht',
      title_en: 'Race report R3 · Sakhir: sprint weekend under the lights',
      excerpt_de: 'Ein enger Sprint, ein chaotischer Start im Hauptrennen und zwei Steward-Entscheidungen.',
      excerpt_en: 'A close sprint, a chaotic start to the main race and two steward decisions.',
      body_de:
        'Das erste Sprint-Wochenende der Saison hielt, was es versprochen hat. Schon im Sprint ging es in den ersten fünf Runden eng zu, im Hauptrennen sorgte Kurve 1 für Durcheinander.\n\nDie Stewards haben nach dem Rennen zwei Entscheidungen veröffentlicht – alle Details im [Steward-Register](/stewards).',
      body_en: null,
      cover_image: null,
      cover_alt_de: null,
      cover_alt_en: null,
      og_image: null,
      category: 'race_report',
      round_id: s2r3r.id,
      author_id: null,
      author_name: 'Newsdesk_Nora',
      discord_post: false,
      status: 'published',
      publish_at: newsAt(s2r3r, 26),
    },
    {
      id: 4,
      slug_de: 'klarstellung-track-limits',
      slug_en: 'clarification-track-limits',
      title_de: 'Klarstellung zu Track Limits',
      title_en: 'Clarification on track limits',
      excerpt_de: 'Wann ein Verlassen der Strecke einen Vorteil bringt und wie die Stewards das bewerten.',
      excerpt_en: 'When leaving the track gains an advantage and how the stewards assess it.',
      body_de: 'Nach mehreren Rückfragen stellen wir klar: Wer die Strecke verlässt und dadurch eine Position gewinnt, muss sie sofort zurückgeben. Details stehen im [Regelwerk](/liga/regelwerk#p3-4).',
      body_en: 'Following several questions: if you leave the track and gain a position, you must give it back immediately. Details are in the [rules](/en/league/rules#p3-4).',
      cover_image: null,
      cover_alt_de: null,
      cover_alt_en: null,
      og_image: null,
      category: 'rule_change',
      round_id: null,
      author_id: null,
      author_name: 'RaceControl_Rene',
      discord_post: false,
      status: 'published',
      publish_at: newsAt(s2r3r, 50),
    },
    {
      id: 5,
      slug_de: 'rennbericht-r4-miami',
      slug_en: 'race-report-r4-miami',
      title_de: 'Rennbericht R4 · Miami (Entwurf)',
      title_en: null,
      excerpt_de: 'Entwurf – noch nicht veröffentlicht.',
      excerpt_en: null,
      body_de: 'Entwurf.',
      body_en: null,
      cover_image: null,
      cover_alt_de: null,
      cover_alt_en: null,
      og_image: null,
      category: 'race_report',
      round_id: s2r4.id,
      author_id: null,
      author_name: 'Newsdesk_Nora',
      discord_post: false,
      status: 'draft',
      publish_at: null,
    },
  ];

  const settingsOverrides: Record<string, unknown> = {
    registration: { state: 'open', free_seats: 0, free_reserve: 4, note_de: 'Alle 22 Cockpits sind vergeben – im Reservepool ist noch Platz.', note_en: 'All 22 cockpits are taken – there is still room in the reserve pool.' },
    discord_counts: { members: 214, online: 38, checked_at: iso(now) },
  };
  const settings = (base.settings ?? []).map((s) => (s.key && s.key in settingsOverrides ? { ...s, value: settingsOverrides[s.key] } : s));

  return {
    ...base,
    settings,
    seasons,
    rounds,
    sessions,
    season_teams: seasonTeams,
    drivers,
    driver_private: DRIVERS.map((d) => ({
      driver_id: d.id,
      discord_user_id: null,
      discord_username: slugify(d.gamertag).replace(/-/g, '_'),
      ea_id: d.gamertag,
      notes: null,
    })),
    driver_numbers: driverNumbers,
    seats,
    round_entries: entries,
    round_absences: absences,
    results,
    standings_snapshots: snapshots,
    awards,
    incidents,
    decisions,
    round_corrections: [
      {
        id: 1,
        round_id: s1r6.id,
        reason_de: 'Disqualifikation von TurboTobi nach Urteil S1-R06-01 – die Plätze dahinter rücken auf.',
        reason_en: 'Disqualification of TurboTobi following decision S1-R06-01 – the drivers behind move up.',
        created_by: null,
      },
    ],
    news,
    staff_members: [
      { id: 1, gamertag: 'RaceControl_Rene', role_de: 'Ligaleitung', role_en: 'League director', avatar: null, since_season: 1, sort: 10 },
      { id: 2, gamertag: 'Chefsteward_Clara', role_de: 'Stewards', role_en: 'Stewards', avatar: null, since_season: 1, sort: 20 },
      { id: 3, gamertag: 'Newsdesk_Nora', role_de: 'Redaktion', role_en: 'Editorial', avatar: null, since_season: 2, sort: 30 },
      { id: 4, gamertag: 'PixelPete', role_de: 'Grafik', role_en: 'Graphics', avatar: null, since_season: 2, sort: 40 },
    ],
    partners: [
      {
        id: 1,
        name: 'Beispiel-Partner',
        logo: null,
        url: 'https://example.com',
        text_de: 'Platzhalter für einen Partner. Partner werden immer als Anzeige gekennzeichnet.',
        text_en: 'Placeholder for a partner. Partners are always labelled as advertising.',
        label_ad: true,
        active: true,
        sort: 10,
      },
    ],
    registrations: [
      {
        id: 1,
        gamertag: 'Newcomer_Nele',
        discord_username: 'nele_racing',
        ea_id: 'Newcomer_Nele',
        platform: 'playstation',
        input_device: 'controller',
        nationality: 'DE',
        desired_number: 42,
        wanted_role: 'any',
        availability: 'regular',
        experience: 'Zwei Saisons in einer anderen Liga',
        reference_time: '1:29.812 (Suzuka, Time Trial)',
        consents: { age16: true, rules: true, at: iso(addHours(now, -30)), rules_version: '1.0' },
        status: 'new',
        admin_notes: null,
        ip_hash: 'demo',
        driver_id: null,
        processed_by: null,
        processed_at: null,
      },
      {
        id: 2,
        gamertag: 'Sidepod_Sid',
        discord_username: 'sid.sidepod',
        ea_id: null,
        platform: 'xbox',
        input_device: 'wheel',
        nationality: null,
        desired_number: 9,
        wanted_role: 'reserve',
        availability: 'mostly',
        experience: null,
        reference_time: null,
        consents: { age16: true, rules: true, at: iso(addHours(now, -80)), rules_version: '1.0' },
        status: 'contacted',
        admin_notes: 'Auf Discord angeschrieben.',
        ip_hash: null,
        driver_id: null,
        processed_by: null,
        processed_at: iso(addHours(now, -60)),
      },
    ],
    // Beispiel für eine Umbenennung: alte Profil-URL leitet per 301 weiter
    slug_redirects: [{ id: 1, entity: 'driver', old_slug: 'kurvenkoenig-alt', new_slug: slugify('Kurvenkönig'), lang: null }],
    staff_accounts: [
      {
        user_id: DEMO_CHIEF_STEWARD_ID,
        discord_user_id: 'demo-chefsteward',
        display_name: 'Chefsteward_Clara',
        avatar_url: null,
        roles: ['steward'],
        driver_id: null,
        roles_checked_at: null,
      },
    ],
    contact_messages: [
      {
        id: 1,
        name: 'Beispiel Person',
        email: 'kontakt@example.com',
        subject: 'Frage zur Partnerschaft',
        message: 'Hallo, wir würden gern Partner der Liga werden. Wie läuft das ab?',
        status: 'new',
        ip_hash: null,
      },
    ],
  };
}
