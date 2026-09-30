/**
 * Saison-Logik für den Admin (Plan §5 „Saisons“, §11.2 Saisonwechsel): Einfrieren,
 * Klonen aus der Vorsaison, Champions beim Abschluss und die Checkliste.
 * Reine Funktionen ohne I/O.
 */
import type {
  AwardRow,
  DriverNumberRow,
  DriverRow,
  Id,
  RoundRow,
  RulesVersionRow,
  SeasonRow,
  SeasonTeamRow,
  SeatRow,
} from '~/lib/db/types';
import type { PublicSettings } from '~/lib/settings';

/**
 * Abgeschlossene Saisons sind eingefroren (Plan §4.8 Archiv): Ergebnisse, Kalender,
 * Cockpits und Saisondaten sind dann im Admin gesperrt. Andere Module (Renntag,
 * Ergebnisse, Stewards) prüfen das vor Änderungen mit dieser Funktion.
 */
export function isSeasonFrozen(season: Pick<SeasonRow, 'status'> | null | undefined): boolean {
  return season?.status === 'finished';
}

export const FROZEN_MESSAGE =
  'Diese Saison ist abgeschlossen und eingefroren. Änderungen sind erst nach „Saison wieder öffnen“ möglich.';

export function nextSeasonNumber(seasons: ReadonlyArray<Pick<SeasonRow, 'number'>>): number {
  return seasons.reduce((max, s) => Math.max(max, s.number), 0) + 1;
}

export type SeasonInsert = Omit<SeasonRow, 'id' | 'created_at' | 'updated_at'>;

export interface CloneSeasonInput {
  number: number;
  name: string;
  slug: string;
  game_version: string;
  /** Regelwerk-Version der neuen Saison (Standard: die der Vorsaison). */
  rules_version_id?: Id | null;
  starts_on?: string | null;
  ends_on?: string | null;
  /** Cockpits übernehmen (Stand am Saisonende der Vorsaison). */
  copySeats: boolean;
}

export interface ClonePlan {
  season: SeasonInsert;
  /** season_id wird nach dem Anlegen eingesetzt */
  seasonTeams: Array<Omit<SeasonTeamRow, 'season_id' | 'created_at' | 'updated_at'>>;
  seats: Array<Omit<SeatRow, 'id' | 'season_id' | 'created_at' | 'updated_at'>>;
  /** Übersprungene Cockpits (z. B. inaktive oder gesperrte Fahrer) */
  skippedSeats: Array<{ team_id: Id; seat_no: 1 | 2; driver_id: Id; reason: string }>;
}

/**
 * Neue Saison aus der Vorsaison ableiten (Plan §11.2 Schritt 3): Punkteschema,
 * Reservepunkte, Protestfrist, Vier-Augen-Prinzip, Strafpunkte-Schalter,
 * Lobby-Einstellungen, Regelwerk-Version, Teams mit Reihenfolge und optional die Cockpits.
 */
export function planSeasonClone(
  source: SeasonRow,
  sourceTeams: readonly SeasonTeamRow[],
  sourceSeats: readonly SeatRow[],
  drivers: ReadonlyArray<Pick<DriverRow, 'id' | 'status' | 'anonymized'>>,
  input: CloneSeasonInput,
): ClonePlan {
  const season: SeasonInsert = {
    number: input.number,
    slug: input.slug,
    name: input.name,
    game_version: input.game_version,
    status: 'planned',
    points_scheme_id: source.points_scheme_id,
    reserve_points_for_constructors: source.reserve_points_for_constructors,
    protest_window_hours: source.protest_window_hours,
    two_steward_rule: source.two_steward_rule,
    penalty_points_enabled: source.penalty_points_enabled,
    penalty_points_config: structuredClone(source.penalty_points_config ?? {}),
    lobby_settings: structuredClone(source.lobby_settings ?? {}),
    rules_version_id: input.rules_version_id === undefined ? source.rules_version_id : input.rules_version_id,
    starts_on: input.starts_on ?? null,
    ends_on: input.ends_on ?? null,
  };

  const seasonTeams = sourceTeams
    .filter((st) => st.season_id === source.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((st, i) => ({ team_id: st.team_id, sort_order: i }));

  const seats: ClonePlan['seats'] = [];
  const skippedSeats: ClonePlan['skippedSeats'] = [];
  if (input.copySeats) {
    const teamIds = new Set(seasonTeams.map((t) => t.team_id));
    const driverById = new Map(drivers.map((d) => [d.id, d]));
    // Stand am Saisonende: offene Cockpits bzw. das jeweils letzte pro Platz
    const lastBySlot = new Map<string, SeatRow>();
    for (const s of sourceSeats.filter((x) => x.season_id === source.id && teamIds.has(x.team_id))) {
      const key = `${s.team_id}:${s.seat_no}`;
      const prev = lastBySlot.get(key);
      const end = (x: SeatRow) => x.to_round ?? Number.POSITIVE_INFINITY;
      if (!prev || end(s) > end(prev) || (end(s) === end(prev) && s.from_round > prev.from_round)) lastBySlot.set(key, s);
    }
    const used = new Set<Id>();
    for (const s of [...lastBySlot.values()].sort((a, b) => a.team_id - b.team_id || a.seat_no - b.seat_no)) {
      const d = driverById.get(s.driver_id);
      if (s.to_round != null) {
        skippedSeats.push({ team_id: s.team_id, seat_no: s.seat_no, driver_id: s.driver_id, reason: 'Cockpit war zum Saisonende nicht besetzt' });
        continue;
      }
      if (!d || d.anonymized || d.status === 'inactive' || d.status === 'banned') {
        skippedSeats.push({ team_id: s.team_id, seat_no: s.seat_no, driver_id: s.driver_id, reason: 'Fahrer ist inaktiv oder gesperrt' });
        continue;
      }
      if (used.has(s.driver_id)) continue;
      used.add(s.driver_id);
      seats.push({ team_id: s.team_id, seat_no: s.seat_no, driver_id: s.driver_id, from_round: 1, to_round: null });
    }
  }
  return { season, seasonTeams, seats, skippedSeats };
}

type AwardInsert = Omit<AwardRow, 'id' | 'created_at' | 'updated_at'>;

/** Auszeichnungen beim Saisonabschluss: Fahrer- und Konstrukteurs-Champion (Hall of Fame). */
export function championAwards(
  seasonId: Id,
  driverLeader: Id | null | undefined,
  teamLeader: Id | null | undefined,
): AwardInsert[] {
  const out: AwardInsert[] = [];
  if (driverLeader != null) out.push({ season_id: seasonId, round_id: null, type: 'champion', driver_id: driverLeader, team_id: null });
  if (teamLeader != null) out.push({ season_id: seasonId, round_id: null, type: 'constructors', driver_id: null, team_id: teamLeader });
  return out;
}

/** Runden, die vor dem Abschluss noch nicht fertig sind (nicht final/korrigiert/abgesagt). */
export function openRoundsBeforeFinish(rounds: ReadonlyArray<Pick<RoundRow, 'status' | 'number'>>): number[] {
  return rounds
    .filter((r) => r.status !== 'final' && r.status !== 'corrected' && r.status !== 'cancelled')
    .map((r) => r.number)
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------- Checkliste §11.2

export type ChecklistState = 'done' | 'open' | 'manual';

export interface ChecklistItem {
  step: number;
  title: string;
  detail: string;
  state: ChecklistState;
  href?: string;
  linkLabel?: string;
}

export interface ChecklistInput {
  season: SeasonRow;
  seasons: readonly SeasonRow[];
  rounds: readonly RoundRow[];
  rulesVersions: readonly RulesVersionRow[];
  seats: readonly SeatRow[];
  drivers: ReadonlyArray<Pick<DriverRow, 'id' | 'status'>>;
  numbers: ReadonlyArray<Pick<DriverNumberRow, 'driver_id' | 'valid_to'>>;
  championAwarded: boolean;
  registration: PublicSettings['registration'];
  now: Date;
}

/**
 * Checkliste Saisonwechsel (Plan §11.2) mit automatisch erkannten Häkchen, soweit
 * sich der Stand aus den Daten ablesen lässt. Umfrage, Discord-Rollen und Grafiken
 * bleiben manuelle Schritte.
 */
export function seasonChangeChecklist(input: ChecklistInput): ChecklistItem[] {
  const { season, seasons, rounds, rulesVersions, seats, drivers, numbers, now } = input;
  const successor = seasons
    .filter((s) => s.number > season.number)
    .sort((a, b) => a.number - b.number)[0];
  const finished = season.status === 'finished';

  // 2. Regelwerk: gibt es eine nach Saisonende veröffentlichte Version?
  const seasonEnd = season.ends_on ? new Date(`${season.ends_on}T00:00:00Z`) : null;
  const newerRules = rulesVersions.some(
    (v) =>
      v.status === 'published' &&
      v.id !== season.rules_version_id &&
      v.published_at != null &&
      (seasonEnd == null || new Date(v.published_at) >= seasonEnd),
  );

  const successorRounds = successor ? rounds.filter((r) => r.season_id === successor.id).length : 0;
  const successorSeats = successor ? seats.filter((s) => s.season_id === successor.id && s.to_round == null).length : 0;
  const inactiveIds = new Set(drivers.filter((d) => d.status === 'inactive').map((d) => d.id));
  const blockedNumbers = numbers.filter((n) => inactiveIds.has(n.driver_id) && (n.valid_to == null || new Date(n.valid_to) > now)).length;

  return [
    {
      step: 1,
      title: 'Saison beenden',
      detail: finished
        ? input.championAwarded
          ? 'Abgeschlossen, Champions sind in der Hall of Fame, die Saison ist eingefroren.'
          : 'Abgeschlossen, aber ohne Champion-Eintrag – ggf. erneut abschließen.'
        : 'Champions in die Hall of Fame übernehmen und die Saison einfrieren (unten auf dieser Seite).',
      state: finished && input.championAwarded ? 'done' : 'open',
    },
    {
      step: 2,
      title: 'Umfrage & Regelwerk',
      detail: newerRules
        ? 'Eine neue Regelwerk-Version ist veröffentlicht. Die Umfrage unter den Fahrern läuft über Discord.'
        : 'Umfrage unter den Fahrern (Discord), Regelwerk überarbeiten und eine neue Version mit Changelog veröffentlichen.',
      state: newerRules ? 'done' : 'manual',
      href: '/admin/regelwerk',
      linkLabel: 'Zum Regelwerk',
    },
    {
      step: 3,
      title: 'Neue Saison klonen, Kalender anlegen',
      detail: successor
        ? `${successor.name} ist angelegt, ${successorRounds} ${successorRounds === 1 ? 'Runde' : 'Runden'} im Kalender.`
        : 'Neue Saison aus dieser klonen (Punkteschema, Lobby, Teams) und den Kalender anlegen.',
      state: successor && successorRounds > 0 ? 'done' : 'open',
      href: successor ? `/admin/kalender?saison=${successor.id}` : '/admin/saisons#klonen',
      linkLabel: successor ? 'Zum Kalender' : 'Saison klonen',
    },
    {
      step: 4,
      title: 'Stammfahrer, Nummern, Cockpits',
      detail: `Rückmeldung der Stammfahrer einholen (bleibt / pausiert / hört auf). ${
        blockedNumbers > 0
          ? `${blockedNumbers} ${blockedNumbers === 1 ? 'Nummer ist' : 'Nummern sind'} noch von inaktiven Fahrern belegt.`
          : 'Keine Nummern inaktiver Fahrer mehr belegt.'
      } ${successor ? `${successorSeats} von 22 Cockpits der neuen Saison besetzt.` : ''}`.trim(),
      state: successor && blockedNumbers === 0 && successorSeats >= 22 ? 'done' : 'open',
      href: successor ? `/admin/teams/aufstellung?saison=${successor.id}` : '/admin/fahrer?status=inactive',
      linkLabel: successor ? 'Zur Aufstellung' : 'Inaktive Fahrer',
    },
    {
      step: 5,
      title: 'Discord, Grafiken, Anmeldefenster',
      detail: `Discord-Rollen und Grafiken aktualisieren. Anmeldestatus: ${
        input.registration.state === 'open' ? 'offen' : input.registration.state === 'waitlist' ? 'Warteliste' : 'geschlossen'
      }.`,
      state: input.registration.state === 'closed' ? 'open' : 'manual',
      href: '/admin/einstellungen#anmeldung',
      linkLabel: 'Anmeldestatus',
    },
  ];
}
