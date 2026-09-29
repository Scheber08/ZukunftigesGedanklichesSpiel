/**
 * Schreib-Operationen des Admin-Kerns auf einem Store (ohne Astro-Abhängigkeiten, daher
 * auch mit dem Memory-Store testbar). Rollenprüfung, Audit-Log und Rebuild übernimmt
 * die aufrufende Action (src/actions/admin/league.ts).
 */
import type { Store } from '~/lib/db/store';
import { insertOne, selectOne } from '~/lib/db/store';
import type { DriverRow, Id, RegistrationRow, RoundFormat, RoundRow, SeasonRow, SessionType } from '~/lib/db/types';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
import { planSessions, sessionTypesFor } from './calendar';
import { planAcceptRegistration, pseudonymizedDriverPatch } from './drivers';
import type { NumberOp } from './numbers';
import { championAwards, planSeasonClone, type CloneSeasonInput } from './season';
import type { SeatPlan } from './seats';

export class OpError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST' = 'BAD_REQUEST',
  ) {
    super(message);
    this.name = 'OpError';
  }
}

async function mustGet<T extends 'seasons' | 'rounds' | 'drivers' | 'registrations'>(store: Store, table: T, id: Id) {
  const row = await selectOne(store, table, { id } as never);
  if (!row) throw new OpError('Eintrag nicht gefunden', 'NOT_FOUND');
  return row;
}

/** Liga-Sicht direkt aus einem Store (ohne Cache) – für Wertungen im Admin. */
export async function leagueFromStore(store: Store, now = new Date()): Promise<League> {
  const entries = await Promise.all(LEAGUE_TABLES.map(async (t) => [t, await store.select(t)] as const));
  const data = Object.fromEntries(entries) as unknown as LeagueDataset;
  data.settings = data.settings.filter((s) => s.is_public);
  return new League(data, now);
}

// ---------------------------------------------------------------------------- Saisons

export async function cloneSeason(store: Store, sourceId: Id, input: CloneSeasonInput) {
  const source = (await mustGet(store, 'seasons', sourceId)) as SeasonRow;
  const [teams, seats, drivers] = await Promise.all([
    store.select('season_teams', { eq: { season_id: sourceId } }),
    store.select('seats', { eq: { season_id: sourceId } }),
    store.select('drivers'),
  ]);
  const plan = planSeasonClone(source, teams, seats, drivers, input);
  const season = await insertOne(store, 'seasons', plan.season);
  if (plan.seasonTeams.length > 0) {
    await store.insert(
      'season_teams',
      plan.seasonTeams.map((t) => ({ ...t, season_id: season.id })),
    );
  }
  if (plan.seats.length > 0) {
    await store.insert(
      'seats',
      plan.seats.map((s) => ({ ...s, season_id: season.id })),
    );
  }
  return { season, source, skippedSeats: plan.skippedSeats, teams: plan.seasonTeams.length, seats: plan.seats.length };
}

/**
 * Saison abschließen (Plan §11.2 Schritt 1): Champions aus der Wertung als Auszeichnungen
 * (Hall of Fame), Status „abgeschlossen“ – damit ist die Saison eingefroren.
 */
export async function finishSeason(store: Store, seasonId: Id, now = new Date()) {
  const season = (await mustGet(store, 'seasons', seasonId)) as SeasonRow;
  const league = await leagueFromStore(store, now);
  const driverLeader = league.driverStandings(seasonId)[0];
  const teamLeader = league.teamStandings(seasonId).find((t) => t.points > 0 || t.starts > 0);
  if (!driverLeader) throw new OpError('Die Saison hat noch keine gewerteten Ergebnisse – ohne Wertung kein Champion.');

  const awards = championAwards(seasonId, driverLeader.driverId, teamLeader?.teamId ?? null);
  await store.remove('awards', { season_id: seasonId, type: 'champion' });
  await store.remove('awards', { season_id: seasonId, type: 'constructors' });
  const inserted = awards.length > 0 ? await store.insert('awards', awards) : [];
  const today = now.toISOString().slice(0, 10);
  const [updated] = await store.update('seasons', { id: seasonId }, { status: 'finished', ends_on: season.ends_on ?? today });
  return {
    before: season,
    season: updated ?? season,
    awards: inserted,
    champion: driverLeader,
    constructors: teamLeader ?? null,
    championName: league.driverName(driverLeader.driverId),
    constructorsName: teamLeader ? (league.team(teamLeader.teamId)?.name ?? null) : null,
  };
}

// ---------------------------------------------------------------------------- Kalender

/** Runde samt Sessions anlegen (Quali + Rennen, bei Sprint zusätzlich Sprint). */
export async function createRound(
  store: Store,
  input: Pick<RoundRow, 'season_id' | 'number' | 'track_id' | 'local_start' | 'format'> &
    Partial<Pick<RoundRow, 'vod_url' | 'highlights_url' | 'status'>>,
): Promise<RoundRow> {
  const round = await insertOne(store, 'rounds', {
    timezone: 'Europe/Berlin',
    status: 'scheduled',
    vod_url: null,
    highlights_url: null,
    ...input,
  });
  await store.insert(
    'sessions',
    sessionTypesFor(round.format).map((type) => ({ round_id: round.id, type, status: 'pending' as const, weather: null })),
  );
  return round;
}

/** Sessions an das Format anpassen; Sessions mit Ergebnissen werden nie gelöscht. */
export async function syncSessions(store: Store, roundId: Id, format: RoundFormat) {
  const sessions = await store.select('sessions', { eq: { round_id: roundId } });
  const results = sessions.length
    ? await store.select('results', { in: { session_id: sessions.map((s) => s.id) } })
    : [];
  const withResults = new Set(results.map((r) => r.session_id));
  const plan = planSessions(sessions, format, withResults);
  for (const id of plan.remove) await store.remove('sessions', { id });
  if (plan.create.length > 0) {
    await store.insert(
      'sessions',
      plan.create.map((type: SessionType) => ({ round_id: roundId, type, status: 'pending' as const, weather: null })),
    );
  }
  return plan;
}

/** Hat die Runde bereits Ergebnisse? (dann z. B. nicht löschbar) */
export async function roundHasResults(store: Store, roundId: Id): Promise<boolean> {
  const sessions = await store.select('sessions', { eq: { round_id: roundId } });
  if (sessions.length === 0) return false;
  const results = await store.select('results', { in: { session_id: sessions.map((s) => s.id) }, limit: 1 });
  return results.length > 0;
}

// ---------------------------------------------------------------------------- Nummern & Cockpits

export async function applyNumberOps(store: Store, ops: readonly NumberOp[]): Promise<void> {
  // Reihenfolge ist wichtig (partieller Unique-Index auf offene Nummern): erst schließen/löschen
  const rank = (op: NumberOp) => (op.kind === 'close' || op.kind === 'delete' ? 0 : op.kind === 'reopen' ? 1 : 2);
  for (const op of [...ops].sort((a, b) => rank(a) - rank(b))) {
    switch (op.kind) {
      case 'close':
        await store.update('driver_numbers', { id: op.id }, { valid_to: op.valid_to });
        break;
      case 'delete':
        await store.remove('driver_numbers', { id: op.id });
        break;
      case 'reopen':
        await store.update('driver_numbers', { id: op.id }, { valid_to: null });
        break;
      case 'update':
        await store.update('driver_numbers', { id: op.id }, { number: op.number, note: op.note });
        break;
      case 'insert':
        await store.insert('driver_numbers', op.row);
        break;
    }
  }
}

export async function applySeatPlan(store: Store, plan: SeatPlan): Promise<void> {
  for (const id of plan.deletes) await store.remove('seats', { id });
  for (const u of plan.updates) await store.update('seats', { id: u.id }, { to_round: u.to_round });
  if (plan.insert) await store.insert('seats', plan.insert);
}

// ---------------------------------------------------------------------------- Anmeldungen

/**
 * „Annehmen“: Fahrer (Reserve, ans Ende des Pools) + private Daten + Wunschnummer (falls frei)
 * anlegen und die Anmeldung verknüpfen.
 */
export async function acceptRegistration(store: Store, registrationId: Id, processedById: string, now = new Date()) {
  const reg = (await mustGet(store, 'registrations', registrationId)) as RegistrationRow;
  const [drivers, numbers, seasons] = await Promise.all([
    store.select('drivers'),
    store.select('driver_numbers'),
    store.select('seasons'),
  ]);
  const plan = planAcceptRegistration(reg, { drivers, numbers, seasons, now });
  if (plan.error) throw new OpError(plan.error, 'CONFLICT');

  const driver = await insertOne(store, 'drivers', plan.driver);
  await store.insert('driver_private', { driver_id: driver.id, ...plan.private });
  if (plan.number != null) {
    await store.insert('driver_numbers', {
      driver_id: driver.id,
      number: plan.number,
      valid_from: now.toISOString(),
      valid_to: null,
      note: `Wunschnummer aus Anmeldung #${reg.id}`,
    });
  }
  const [updated] = await store.update(
    'registrations',
    { id: reg.id },
    { status: 'accepted', driver_id: driver.id, processed_by: processedById, processed_at: now.toISOString() },
  );
  return { registration: updated ?? reg, before: reg, driver, number: plan.number, warnings: plan.warnings };
}

// ---------------------------------------------------------------------------- Pseudonymisierung

/**
 * Löschwunsch (Plan §6.7): Fahrer pseudonymisieren, private Daten und verknüpfte
 * Anmeldungen löschen, Kontaktdaten aus Vorfällen entfernen, offene Nummern freigeben
 * und personenbezogene Werte aus alten Audit-Einträgen entfernen.
 */
export async function pseudonymizeDriver(store: Store, driverId: Id, now = new Date()) {
  const driver = (await mustGet(store, 'drivers', driverId)) as DriverRow;
  if (driver.anonymized) throw new OpError('Der Fahrer ist bereits pseudonymisiert.', 'CONFLICT');
  const all = await store.select('drivers');
  const patch = pseudonymizedDriverPatch(driver, all.map((d) => d.slug));
  const [updated] = await store.update('drivers', { id: driverId }, patch);

  await store.remove('driver_private', { driver_id: driverId });
  const regs = await store.select('registrations', { eq: { driver_id: driverId } });
  for (const r of regs) await store.remove('registrations', { id: r.id });
  const incidents = await store.select('incidents', { eq: { reporter_driver_id: driverId } });
  for (const i of incidents) {
    if (i.reporter_contact != null) await store.update('incidents', { id: i.id }, { reporter_contact: null });
  }
  // Offene Nummern freigeben (Historie bleibt für die Ergebnisse)
  const nowIso = now.toISOString();
  const numbers = await store.select('driver_numbers', { eq: { driver_id: driverId } });
  for (const n of numbers) {
    if (new Date(n.valid_from) >= now) await store.remove('driver_numbers', { id: n.id });
    else if (n.valid_to == null || new Date(n.valid_to) > now) await store.update('driver_numbers', { id: n.id }, { valid_to: nowIso });
  }
  // Staff-Verknüpfung lösen
  const staff = await store.select('staff_accounts', { eq: { driver_id: driverId } });
  for (const s of staff) await store.update('staff_accounts', { user_id: s.user_id }, { driver_id: null });
  // Alte Audit-Einträge mit personenbezogenen Werten leeren
  for (const entity of ['drivers', 'driver_private'] as const) {
    await store.update('audit_log', { entity, entity_id: String(driverId) }, { diff: null });
  }
  for (const r of regs) await store.update('audit_log', { entity: 'registrations', entity_id: String(r.id) }, { diff: null });

  return { driver: updated ?? driver, removedRegistrations: regs.length };
}
