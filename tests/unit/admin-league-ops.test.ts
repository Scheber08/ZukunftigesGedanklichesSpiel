import { describe, expect, it } from 'vitest';
import { planNumberChange, nextRoundStart } from '~/lib/admin/league/numbers';
import {
  acceptRegistration,
  applyNumberOps,
  applySeatPlan,
  cloneSeason,
  createRound,
  finishSeason,
  OpError,
  pseudonymizeDriver,
  roundHasResults,
  syncSessions,
} from '~/lib/admin/league/ops';
import { seasonFrozenForRound } from '~/lib/admin/league/guards';
import { planSeatChange } from '~/lib/admin/league/seats';
import { MemoryStore } from '~/lib/db/memory-store';
import { demoDataset } from '~/lib/seed/demo';

const NOW = new Date();
const fresh = () => new MemoryStore(demoDataset(NOW));

describe('Admin-Operationen auf dem Demo-Store', () => {
  it('nimmt eine Anmeldung an (Fahrer, private Daten, Wunschnummer)', async () => {
    const store = fresh();
    const res = await acceptRegistration(store, 1, '00000000-0000-4000-8000-000000000001', NOW);
    expect(res.driver).toMatchObject({ gamertag: 'Newcomer_Nele', status: 'reserve', platform: 'playstation' });
    const [priv] = await store.select('driver_private', { eq: { driver_id: res.driver.id } });
    expect(priv?.discord_username).toBe('nele_racing');
    const numbers = await store.select('driver_numbers', { eq: { driver_id: res.driver.id } });
    expect(numbers.map((n) => n.number)).toEqual([42]);
    const [reg] = await store.select('registrations', { eq: { id: 1 } });
    expect(reg).toMatchObject({ status: 'accepted', driver_id: res.driver.id });
    // Reservepool: ans Ende
    const reserves = (await store.select('drivers')).filter((d) => d.reserve_order != null);
    expect(res.driver.reserve_order).toBe(Math.max(...reserves.map((d) => d.reserve_order!)));
    // zweites Annehmen scheitert
    await expect(acceptRegistration(store, 1, 'x', NOW)).rejects.toBeInstanceOf(OpError);
  });

  it('klont eine Saison mit Teams und Cockpits', async () => {
    const store = fresh();
    const res = await cloneSeason(store, 2, { number: 3, name: 'Saison 3', slug: '3', game_version: 'F1 25', copySeats: true });
    expect(res.season).toMatchObject({ number: 3, status: 'planned', two_steward_rule: true, reserve_points_for_constructors: true });
    expect(res.teams).toBe(11);
    const seats = await store.select('seats', { eq: { season_id: res.season.id } });
    expect(seats.length).toBe(res.seats);
    expect(seats.every((s) => s.from_round === 1 && s.to_round == null)).toBe(true);
    // kein Fahrer doppelt
    expect(new Set(seats.map((s) => s.driver_id)).size).toBe(seats.length);
  });

  it('schließt eine Saison ab und vergibt die Titel aus der Wertung', async () => {
    const store = fresh();
    // Saison 1 ist bereits abgeschlossen – erneut abschließen ersetzt die Titel
    const res = await finishSeason(store, 1, NOW);
    expect(res.season.status).toBe('finished');
    const awards = await store.select('awards', { eq: { season_id: 1 } });
    expect(awards.filter((a) => a.type === 'champion')).toHaveLength(1);
    expect(awards.filter((a) => a.type === 'constructors')).toHaveLength(1);
    expect(awards.find((a) => a.type === 'champion')?.driver_id).toBe(res.champion.driverId);
    const [round] = await store.select('rounds', { eq: { season_id: 1 }, limit: 1 });
    expect(await seasonFrozenForRound(store, round!.id)).toBe(true);
  });

  it('legt Runden mit Sessions an und passt sie beim Formatwechsel an', async () => {
    const store = fresh();
    const round = await createRound(store, { season_id: 2, number: 30, track_id: 1, local_start: '2027-03-01T20:00:00', format: 'sprint' });
    expect(round.start_utc).toBe('2027-03-01T19:00:00.000Z');
    let sessions = await store.select('sessions', { eq: { round_id: round.id } });
    expect(sessions.map((s) => s.type).sort()).toEqual(['qualifying', 'race', 'sprint']);
    const plan = await syncSessions(store, round.id, 'standard');
    expect(plan.remove).toHaveLength(1);
    sessions = await store.select('sessions', { eq: { round_id: round.id } });
    expect(sessions.map((s) => s.type).sort()).toEqual(['qualifying', 'race']);
    expect(await roundHasResults(store, round.id)).toBe(false);
    const [done] = await store.select('rounds', { eq: { season_id: 2, number: 1 } });
    expect(await roundHasResults(store, done!.id)).toBe(true);
  });

  it('wechselt Startnummern ab dem nächsten Rennen', async () => {
    const store = fresh();
    const [numbers, rounds] = await Promise.all([store.select('driver_numbers'), store.select('rounds')]);
    const next = nextRoundStart(rounds, NOW);
    const current = numbers.find((n) => n.driver_id === 1 && n.valid_to == null)!;
    const plan = planNumberChange(1, 98, numbers, next, NOW);
    expect(plan.error).toBeNull();
    await applyNumberOps(store, plan.ops);
    const after = await store.select('driver_numbers', { eq: { driver_id: 1 } });
    expect(after.find((n) => n.id === current.id)?.valid_to).toBe(next);
    expect(after.find((n) => n.number === 98)?.valid_from).toBe(next);
  });

  it('setzt Transfers um', async () => {
    const store = fresh();
    const seats = await store.select('seats', { eq: { season_id: 2 } });
    const target = seats.find((s) => s.team_id === 1 && s.seat_no === 1 && s.to_round == null)!;
    const plan = planSeatChange(seats, { season_id: 2, team_id: 1, seat_no: 1, driver_id: 23, from_round: 7, releaseOtherSeat: false });
    expect(plan.error).toBeNull();
    await applySeatPlan(store, plan);
    const after = await store.select('seats', { eq: { season_id: 2, team_id: 1, seat_no: 1 } });
    expect(after.find((s) => s.id === target.id)?.to_round).toBe(6);
    expect(after.find((s) => s.driver_id === 23)?.from_round).toBe(7);
  });

  it('pseudonymisiert einen Fahrer und löscht private Daten', async () => {
    const store = fresh();
    await store.insert('audit_log', { action: 'update', entity: 'drivers', entity_id: '29', diff: { before: { gamertag: 'Retired_Ralf' }, after: {} } });
    const res = await pseudonymizeDriver(store, 29, NOW);
    expect(res.driver).toMatchObject({ gamertag: 'Ehemaliger Fahrer #29', anonymized: true, show_links: false });
    expect(await store.select('driver_private', { eq: { driver_id: 29 } })).toEqual([]);
    const log = await store.select('audit_log', { eq: { entity: 'drivers', entity_id: '29' } });
    expect(log.every((l) => l.diff == null)).toBe(true);
    const open = (await store.select('driver_numbers', { eq: { driver_id: 29 } })).filter((n) => n.valid_to == null);
    expect(open).toEqual([]);
    // Ergebnisse bleiben erhalten
    expect((await store.select('results', { eq: { driver_id: 29 } })).length).toBeGreaterThan(0);
    await expect(pseudonymizeDriver(store, 29, NOW)).rejects.toThrow(/bereits/);
  });
});
