/**
 * Kompletter Renntag im Demo-Datenbestand (Plan §5.1–5.3, §11.1), geprüft bis in die öffentliche
 * Sicht (`League`): Abmeldung + Ersatz → Aufstellung veröffentlichen → Urteil mit Vier-Augen-Prinzip
 * → Ergebnis und Wertung neu → final → Korrektur → Urteil zurücknehmen (automatische Korrektur).
 * Discord und Rebuild werden gemockt (brauchen astro:env).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(async (..._args: unknown[]) => true),
  requestRebuild: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('~/lib/server/discord', () => ({
  notify: mocks.notify,
  siteUrl: (path: string) => `https://liga.example${path}`,
  EMBED_GREEN: 1,
  EMBED_TEAL: 2,
  EMBED_WARNING: 3,
  EMBED_DANGER: 4,
}));
vi.mock('~/lib/server/rebuild', () => ({ requestRebuild: mocks.requestRebuild }));

import { RacedayError } from '~/lib/admin/raceday/errors';
import { assignSeat, initialLineup, markAbsent, type LineupState } from '~/lib/admin/raceday/lineup';
import { MemoryStore } from '~/lib/db/memory-store';
import type { Id, ResultRow } from '~/lib/db/types';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
import {
  correctRound,
  finalizeRound,
  isLineupPublic,
  loadLineupContext,
  publishLineup,
  saveLineup,
  saveResults,
  type SessionPayload,
} from '~/lib/server/results';
import { publishDecision, revokeDecision, saveDecision, voteDecision } from '~/lib/server/stewarding';
import { demoDataset } from '~/lib/seed/demo';

const NOW = new Date('2026-10-15T12:00:00Z');
const admin = { userId: '00000000-0000-4000-8000-000000000001', name: 'Admin', driverId: null };
const stewardA = { userId: '00000000-0000-4000-8000-00000000000a', name: 'Steward A', driverId: null };
const stewardB = { userId: '00000000-0000-4000-8000-00000000000b', name: 'Steward B', driverId: null };

let store: MemoryStore;

/** Öffentliche Sicht wie im Build: alle Liga-Tabellen, nur öffentliche Einstellungen. */
async function publicLeague(): Promise<League> {
  const entries = await Promise.all(LEAGUE_TABLES.map(async (t) => [t, await store.select(t)] as const));
  const data = Object.fromEntries(entries) as unknown as LeagueDataset;
  data.settings = data.settings.filter((s) => s.is_public);
  return new League(data, NOW);
}

async function roundOf(number: number) {
  const [r] = await store.select('rounds', { eq: { season_id: 2, number } });
  return r!;
}

async function sessionOf(roundId: Id, type: 'qualifying' | 'race') {
  const [s] = await store.select('sessions', { eq: { round_id: roundId, type } });
  return s!;
}

function lineupInput(state: LineupState) {
  return {
    entries: state.seats.filter((s) => s.driverId != null).map((s) => ({ teamId: s.teamId, seatNo: s.seatNo, driverId: s.driverId! })),
    absences: state.absences,
  };
}

function toInput(r: ResultRow) {
  return {
    driverId: r.driver_id,
    teamId: r.team_id,
    role: r.role,
    roundEntryId: r.round_entry_id,
    raceNumber: r.race_number,
    status: r.status,
    gridPosition: r.grid_position,
    laps: r.laps,
    bestLapMs: r.best_lap_ms,
    totalTimeMs: r.total_time_ms,
    gapMs: r.gap_ms,
    gapLaps: r.gap_laps,
    pitStops: r.pit_stops,
    ingamePenaltyS: r.ingame_penalty_s,
  };
}

async function expectError(p: Promise<unknown>, code: RacedayError['code']): Promise<RacedayError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(RacedayError);
    expect((err as RacedayError).code).toBe(code);
    return err as RacedayError;
  }
  throw new Error(`Fehler ${code} erwartet`);
}

beforeEach(() => {
  store = new MemoryStore(demoDataset(NOW));
  mocks.notify.mockClear();
  mocks.requestRebuild.mockClear();
});

describe('Renntag im Demo-Modus', () => {
  it('Runde 5: Abmeldung nach Frist + Ersatz aus dem Reservepool, veröffentlichen', async () => {
    const r5 = await roundOf(5);
    expect(r5.status).toBe('lineup_published');
    expect(isLineupPublic(r5.status)).toBe(true);
    const ctx = await loadLineupContext(store, r5.id);
    const teamIds = ctx.teams.map((t) => t.id);
    const absences = ctx.absences.map((a) => ({ driverId: a.driver_id, reportedInTime: a.reported_in_time }));
    let state = initialLineup(teamIds, ctx.seasonSeats, ctx.entries, absences);

    // Oversteer_Olli (10) meldet sich zu spät ab – ohne Ersatz ist das Cockpit frei (nur Hinweis)
    state = markAbsent(state, 10, false);
    const seat = state.seats.find((s) => s.regularId === 10)!;
    expect(seat.driverId).toBeNull();

    // Öffentliche Aufstellung: ein abgemeldeter Fahrer darf nicht mehr eingetragen bleiben – nichts wird gespeichert
    const broken = { ...lineupInput(state), entries: [...lineupInput(state).entries, { teamId: seat.teamId, seatNo: seat.seatNo, driverId: 10 }] };
    const err = await expectError(saveLineup(store, r5.id, broken, admin), 'PRECONDITION_FAILED');
    expect(err.headline).toContain('schon öffentlich');
    expect(await store.select('round_absences', { eq: { round_id: r5.id, driver_id: 10 } })).toHaveLength(0);

    // Ersatz: WetTyre_Wiebke (24, Warteliste 2 – Platz 1 fährt schon)
    state = assignSeat(state, seat.teamId, seat.seatNo, 24);
    const res = await publishLineup(store, r5.id, lineupInput(state), admin, { discord: true });
    expect(res.round.status).toBe('lineup_published');
    expect(mocks.notify).toHaveBeenCalledWith(store, 'lineup', expect.objectContaining({ title: expect.stringContaining('Aufstellung') }));

    const [absence] = await store.select('round_absences', { eq: { round_id: r5.id, driver_id: 10 } });
    expect(absence).toMatchObject({ reported_in_time: false, note: 'Abmeldung nach Frist' });

    const league = await publicLeague();
    const entry = league.entriesOf(r5.id).find((e) => e.driver_id === 24);
    expect(entry).toMatchObject({ role: 'reserve', replaces_driver_id: 10, team_id: seat.teamId, seat_no: seat.seatNo, race_number: 33 });
    expect(league.entriesOf(r5.id).some((e) => e.driver_id === 10)).toBe(false);
  });

  it('Runde 4: Urteil mit zweitem Steward → Ergebnis und Wertung neu → final → Korrektur → Zurücknehmen', async () => {
    const r4 = await roundOf(4);
    const race = await sessionOf(r4.id, 'race');
    expect(r4.status).toBe('provisional');

    const before = await publicLeague();
    const raceBefore = before.resultsOf(race.id);
    const third = raceBefore.find((r) => r.position === 3)!;
    const standingsBefore = new Map(before.driverStandings(2).map((s) => [s.driverId, s.points]));

    // Steward A legt den Entwurf an (zählt als erste Stimme), Veröffentlichen allein geht nicht
    const draft = await saveDecision(store, stewardA, null, {
      incidentId: null,
      roundId: r4.id,
      sessionId: race.id,
      driverId: third.driver_id,
      verdict: 'time_penalty',
      timeSeconds: 10,
      positions: null,
      penaltyPoints: null,
      reasoningDe: 'Abkürzen der Schikane mit bleibendem Vorteil (Strafenkatalog V-06).',
      reasoningEn: null,
      ruleRef: '§8.3 · V-06',
      clipUrl: 'https://www.twitch.tv/videos/1',
    });
    expect(draft).toMatchObject({ status: 'draft', public_ref: 'S2-R04-02', decided_by: [stewardA.userId] });
    const pending = await publishDecision(store, stewardA, draft.id);
    expect(pending.published).toBe(false);
    expect((await publicLeague()).decisionByRef('S2-R04-02')).toBeUndefined();

    // Steward B bestätigt und veröffentlicht
    await voteDecision(store, stewardB, draft.id);
    const published = await publishDecision(store, stewardB, draft.id);
    expect(published).toMatchObject({ published: true, effect: 'recomputed' });
    expect(new Set(published.decision.decided_by)).toEqual(new Set([stewardA.userId, stewardB.userId]));
    expect(mocks.notify).toHaveBeenCalledWith(store, 'decisions', expect.objectContaining({ title: 'Urteil S2-R04-02' }));

    // Öffentliche Sicht: Strafe im Ergebnis, Fahrer fällt zurück, Wertung folgt den neuen Punkten
    const after = await publicLeague();
    expect(after.decisionByRef('S2-R04-02')).toBeDefined();
    const raceAfter = after.resultsOf(race.id);
    const penalized = raceAfter.find((r) => r.driver_id === third.driver_id)!;
    expect(penalized.steward_penalty_s).toBe(10);
    expect(penalized.position!).toBeGreaterThan(3);
    const newThird = raceAfter.find((r) => r.position === 3)!;
    expect(newThird.driver_id).not.toBe(third.driver_id);
    for (const s of after.driverStandings(2)) {
      const r4Before = raceBefore.find((r) => r.driver_id === s.driverId)?.points ?? 0;
      const r4After = raceAfter.find((r) => r.driver_id === s.driverId)?.points ?? 0;
      expect(s.points).toBe((standingsBefore.get(s.driverId) ?? 0) - r4Before + r4After);
    }
    expect(after.driverStandings(2).find((s) => s.driverId === third.driver_id)!.points).toBeLessThan(standingsBefore.get(third.driver_id)!);

    // Final setzen: offene Vorfälle/Frist nur mit Bestätigung, dann Snapshot + Discord
    await expectError(finalizeRound(store, r4.id, admin), 'PRECONDITION_FAILED');
    const fin = await finalizeRound(store, r4.id, admin, { force: true });
    expect(fin.round.status).toBe('final');
    const snaps = await store.select('standings_snapshots', { eq: { after_round_id: r4.id, kind: 'driver' } });
    expect(snaps.find((s) => s.entity_id === third.driver_id)!.points).toBe(
      after.driverStandings(2).find((s) => s.driverId === third.driver_id)!.points,
    );

    // Korrektur mit Pflicht-Grund: P1 und P2 tauschen (Reihenfolge und Zeiten)
    const rows = (await store.select('results', { eq: { session_id: race.id } })).sort((a, b) => a.entered_position - b.entered_position);
    const [p1, p2] = [rows[0]!, rows[1]!];
    const swapped = [
      { ...p2, total_time_ms: p1.total_time_ms, gap_ms: p1.gap_ms },
      { ...p1, total_time_ms: p2.total_time_ms, gap_ms: p2.gap_ms },
      ...rows.slice(2),
    ];
    const payload: SessionPayload = { sessionId: race.id, rows: swapped.map(toInput) };
    await expectError(saveResults(store, r4.id, [payload], admin), 'CONFLICT');
    await saveResults(store, r4.id, [payload], admin, { allowFinal: true });
    const corr = await correctRound(store, r4.id, admin, 'Zieleinlauf nach Replay korrigiert', 'Finish order corrected after replay');
    expect(corr.round.status).toBe('corrected');
    const corrected = await publicLeague();
    expect(corrected.correctionsOf(r4.id).map((c) => c.reason_de)).toContain('Zieleinlauf nach Replay korrigiert');
    expect(corrected.resultsOf(race.id).find((r) => r.position === 1)!.driver_id).toBe(rows[1]!.driver_id);

    // Zurücknehmen auf korrigierter Runde → automatische Korrektur, Strafe weg
    const revoked = await revokeDecision(store, stewardA, draft.id, 'Neue Kameraperspektive');
    expect(revoked.effect).toBe('corrected');
    const final = await publicLeague();
    expect(final.decisionByRef('S2-R04-02')).toBeUndefined();
    expect(final.correctionsOf(r4.id).map((c) => c.reason_de)).toContain('Urteil S2-R04-02 zurückgenommen');
    const restored = final.resultsOf(race.id).find((r) => r.driver_id === third.driver_id)!;
    expect(restored).toMatchObject({ steward_penalty_s: 0, position: 3 });
  });

  it('geplante Runde: Fehler blockieren nur das Veröffentlichen, der Entwurf bleibt gespeichert und privat', async () => {
    const r6 = await roundOf(6);
    expect(isLineupPublic(r6.status)).toBe(false);
    const ctx = await loadLineupContext(store, r6.id);
    let state = initialLineup(ctx.teams.map((t) => t.id), ctx.seasonSeats, [], []);
    state = markAbsent(state, 1, true);
    const input = lineupInput(state);
    const seat = state.seats.find((s) => s.regularId === 1)!;
    const broken = { ...input, entries: [...input.entries, { teamId: seat.teamId, seatNo: seat.seatNo, driverId: 1 }] };
    const err = await expectError(publishLineup(store, r6.id, broken, admin, { discord: true }), 'PRECONDITION_FAILED');
    expect(err.headline).toContain('Als Entwurf gespeichert');
    expect(await store.select('round_entries', { eq: { round_id: r6.id } })).toHaveLength(22);
    expect((await roundOf(6)).status).toBe('scheduled');
    expect((await publicLeague()).entriesOf(r6.id)).toHaveLength(0);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('eingefrorene Saison: Aufstellung und Ergebnis bleiben unverändert', async () => {
    const [s1r2] = await store.select('rounds', { eq: { season_id: 1, number: 2 } });
    const ctx = await loadLineupContext(store, s1r2!.id);
    const input = { entries: ctx.entries.map((e) => ({ teamId: e.team_id, seatNo: e.seat_no, driverId: e.driver_id })), absences: [] };
    await expectError(saveLineup(store, s1r2!.id, input, admin), 'PRECONDITION_FAILED');
    await expectError(correctRound(store, s1r2!.id, admin, 'Test in abgeschlossener Saison'), 'PRECONDITION_FAILED');
  });
});
