/**
 * Server-Dienste Renntag gegen den Memory-Store mit Demo-Daten.
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
import { initialLineup, markAbsent, assignSeat } from '~/lib/admin/raceday/lineup';
import { MemoryStore } from '~/lib/db/memory-store';
import type { Id } from '~/lib/db/types';
import {
  correctRound,
  finalizeRound,
  loadLineupContext,
  previewStandings,
  publishLineup,
  publishProvisional,
  recomputeRound,
  saveLineup,
  saveResults,
  type SessionPayload,
} from '~/lib/server/results';
import { openInvestigation, publishDecision, revokeDecision, saveDecision, setIncidentStatus, voteDecision } from '~/lib/server/stewarding';
import { demoDataset } from '~/lib/seed/demo';

const NOW = new Date('2026-10-15T12:00:00Z');
const admin = { userId: '00000000-0000-4000-8000-000000000001', name: 'Admin', driverId: null };
const stewardA = { userId: '00000000-0000-4000-8000-00000000000a', name: 'Steward A', driverId: null };
const stewardB = { userId: '00000000-0000-4000-8000-00000000000b', name: 'Steward B', driverId: null };

let store: MemoryStore;

async function roundOf(season: number, number: number) {
  const [r] = await store.select('rounds', { eq: { season_id: season, number } });
  return r!;
}
async function sessionOf(roundId: Id, type: 'qualifying' | 'sprint' | 'race') {
  const [s] = await store.select('sessions', { eq: { round_id: roundId, type } });
  return s!;
}
async function raceRows(roundId: Id) {
  const race = await sessionOf(roundId, 'race');
  return (await store.select('results', { eq: { session_id: race.id } })).sort((a, b) => a.entered_position - b.entered_position);
}

/** Aktuelle Zeilen einer Session als Eingabe (optional umsortiert). */
async function payloadFor(roundId: Id, type: 'qualifying' | 'race', reorder?: (ids: Id[]) => Id[]): Promise<SessionPayload> {
  const session = await sessionOf(roundId, type);
  const rows = (await store.select('results', { eq: { session_id: session.id } })).sort((a, b) => a.entered_position - b.entered_position);
  const order = reorder ? reorder(rows.map((r) => r.driver_id)) : rows.map((r) => r.driver_id);
  return {
    sessionId: session.id,
    rows: order.map((driverId) => {
      const r = rows.find((x) => x.driver_id === driverId)!;
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
    }),
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

describe('Ergebnisse', () => {
  it('Neuberechnung der Demo-Runde ändert nichts', async () => {
    const r4 = await roundOf(2, 4);
    const { updated } = await recomputeRound(store, r4.id);
    expect(updated).toBe(0);
  });

  it('Speichern mit neuer Reihenfolge berechnet Positionen und Punkte neu', async () => {
    const r4 = await roundOf(2, 4);
    const before = await raceRows(r4.id);
    const [first, second] = [before[0]!.driver_id, before[1]!.driver_id];
    const payload = await payloadFor(r4.id, 'race', (ids) => [second, first, ...ids.slice(2)]);
    await saveResults(store, r4.id, [payload], admin);
    const after = await raceRows(r4.id);
    expect(after[0]!.driver_id).toBe(second);
    expect(after.find((r) => r.driver_id === second)).toMatchObject({ position: 1 });
    expect(after.find((r) => r.driver_id === first)).toMatchObject({ position: 2 });
    expect(mocks.requestRebuild).toHaveBeenCalled(); // Runde ist vorläufig = öffentlich
  });

  it('meldet doppelte Fahrer und entfernt fehlende Zeilen', async () => {
    const r4 = await roundOf(2, 4);
    const payload = await payloadFor(r4.id, 'race');
    const dup = { ...payload, rows: [...payload.rows, payload.rows[0]!] };
    const err = await expectError(saveResults(store, r4.id, [dup], admin), 'BAD_REQUEST');
    expect(err.details.join(' ')).toContain('doppelt');
    const shorter = { ...payload, rows: payload.rows.slice(0, 21) };
    await saveResults(store, r4.id, [shorter], admin);
    expect(await raceRows(r4.id)).toHaveLength(21);
  });

  it('Wertungsvorschau zeigt die Top 10 mit Veränderung', async () => {
    const r4 = await roundOf(2, 4);
    const preview = await previewStandings(store, r4.id);
    expect(preview).toHaveLength(10);
    expect(preview[0]!.position).toBe(1);
    expect(preview.some((p) => p.pointsDelta > 0)).toBe(true);
  });

  it('vorläufig → final → korrigiert mit Snapshots und Discord', async () => {
    const r5 = await roundOf(2, 5);
    await expectError(publishProvisional(store, r5.id, admin), 'PRECONDITION_FAILED');

    const r4 = await roundOf(2, 4);
    const blocked = await expectError(finalizeRound(store, r4.id, admin), 'PRECONDITION_FAILED');
    expect(blocked.details.some((d) => d.includes('offene Vorfälle'))).toBe(true);

    const fin = await finalizeRound(store, r4.id, admin, { force: true });
    expect(fin.round.status).toBe('final');
    expect(fin.snapshots).toBe(1);
    const snaps = await store.select('standings_snapshots', { eq: { after_round_id: r4.id } });
    expect(snaps.filter((s) => s.kind === 'driver').length).toBeGreaterThan(20);
    expect(snaps.filter((s) => s.kind === 'team')).toHaveLength(11);
    expect(mocks.notify).toHaveBeenCalledWith(store, 'results', expect.objectContaining({ title: expect.stringContaining('Endergebnis') }));

    await expectError(saveResults(store, r4.id, [await payloadFor(r4.id, 'race')], admin), 'CONFLICT');
    await expectError(correctRound(store, r4.id, admin, ''), 'BAD_REQUEST');
    const corr = await correctRound(store, r4.id, admin, 'Zeitmessung nachträglich korrigiert');
    expect(corr.round.status).toBe('corrected');
    const corrections = await store.select('round_corrections', { eq: { round_id: r4.id } });
    expect(corrections).toHaveLength(1);
  });

  it('eingefrorene Saison verweigert Änderungen', async () => {
    const s1r1 = await roundOf(1, 1);
    await expectError(recomputeRound(store, s1r1.id).then(() => correctRound(store, s1r1.id, admin, 'Test-Korrektur')), 'PRECONDITION_FAILED');
  });
});

describe('Aufstellung', () => {
  it('speichert Abmeldung und Ersatzfahrer mit Startnummer und „ersetzt“', async () => {
    const r6 = await roundOf(2, 6);
    const ctx = await loadLineupContext(store, r6.id);
    let state = initialLineup(ctx.teams.map((t) => t.id), ctx.seasonSeats, ctx.entries, []);
    state = markAbsent(state, 1, false);
    state = assignSeat(state, 1, 1, 23);
    const input = {
      entries: state.seats.filter((s) => s.driverId != null).map((s) => ({ teamId: s.teamId, seatNo: s.seatNo, driverId: s.driverId! })),
      absences: state.absences,
    };
    const res = await publishLineup(store, r6.id, input, admin, { discord: true });
    expect(res.round.status).toBe('lineup_published');
    const entries = await store.select('round_entries', { eq: { round_id: r6.id } });
    expect(entries).toHaveLength(22);
    expect(entries.find((e) => e.driver_id === 23)).toMatchObject({ role: 'reserve', replaces_driver_id: 1, race_number: 24 });
    const absences = await store.select('round_absences', { eq: { round_id: r6.id } });
    expect(absences).toEqual([expect.objectContaining({ driver_id: 1, reported_in_time: false })]);
    expect(mocks.notify).toHaveBeenCalledWith(store, 'lineup', expect.objectContaining({ title: expect.stringContaining('Aufstellung') }));
  });

  it('blockiert das Veröffentlichen bei Rennsperre, speichert aber den Entwurf', async () => {
    const r4 = await roundOf(2, 4);
    const r5 = await roundOf(2, 5);
    await store.insert('decisions', {
      public_ref: 'S2-R04-09',
      round_id: r4.id,
      driver_id: 2,
      verdict: 'race_ban',
      reasoning_de: 'Testsperre für die nächste Runde.',
      status: 'published',
      published_at: NOW.toISOString(),
    });
    const ctx = await loadLineupContext(store, r5.id);
    expect(ctx.bannedForRound).toContain(2);
    const input = { entries: ctx.entries.map((e) => ({ teamId: e.team_id, seatNo: e.seat_no, driverId: e.driver_id })), absences: [] };
    const err = await expectError(publishLineup(store, r5.id, input, admin, { discord: false }), 'PRECONDITION_FAILED');
    expect(err.details.join(' ')).toContain('Rennsperre');
  });

  it('lehnt doppelte Fahrer schon beim Speichern ab', async () => {
    const r6 = await roundOf(2, 6);
    const input = { entries: [{ teamId: 1, seatNo: 1 as const, driverId: 1 }, { teamId: 1, seatNo: 2 as const, driverId: 1 }], absences: [] };
    await expectError(saveLineup(store, r6.id, input, admin), 'BAD_REQUEST');
  });
});

describe('Stewards', () => {
  it('Vier-Augen-Prinzip: erst die zweite Stimme veröffentlicht, Zeitstrafe fließt ein', async () => {
    const r4 = await roundOf(2, 4);
    const [draft] = await store.select('decisions', { eq: { round_id: r4.id, status: 'draft' } });
    const first = await publishDecision(store, stewardA, draft!.id);
    expect(first.published).toBe(false);
    const second = await publishDecision(store, stewardB, draft!.id);
    expect(second.published).toBe(true);
    expect(second.effect).toBe('recomputed');
    const row = (await raceRows(r4.id)).find((r) => r.driver_id === draft!.driver_id)!;
    expect(row.steward_penalty_s).toBe(5);
    const [incident] = await store.select('incidents', { eq: { id: draft!.incident_id! } });
    expect(incident!.status).toBe('decided');
    expect(mocks.notify).toHaveBeenCalledWith(store, 'decisions', expect.objectContaining({ title: 'Urteil S2-R04-01' }));

    await revokeDecision(store, stewardA, draft!.id, 'Irrtum');
    const reverted = (await raceRows(r4.id)).find((r) => r.driver_id === draft!.driver_id)!;
    expect(reverted.steward_penalty_s).toBe(0);
  });

  it('DSQ auf finaler Runde korrigiert automatisch, Zurücknehmen stellt wieder her', async () => {
    const r3 = await roundOf(2, 3);
    const race = await sessionOf(r3.id, 'race');
    const winner = (await raceRows(r3.id)).find((r) => r.position === 1)!;
    const d = await saveDecision(store, stewardA, null, {
      incidentId: null,
      roundId: r3.id,
      sessionId: race.id,
      driverId: winner.driver_id,
      verdict: 'dsq',
      timeSeconds: null,
      positions: null,
      penaltyPoints: null,
      reasoningDe: 'Unerlaubte Fahrhilfe laut Replay (V-17).',
      reasoningEn: null,
      ruleRef: '§8.3',
      clipUrl: null,
    });
    expect(d.public_ref).toBe('S2-R03-03');
    await voteDecision(store, stewardB, d.id);
    const res = await publishDecision(store, stewardB, d.id);
    expect(res.effect).toBe('corrected');
    const round = (await store.select('rounds', { eq: { id: r3.id } }))[0]!;
    expect(round.status).toBe('corrected');
    const dsq = (await raceRows(r3.id)).find((r) => r.driver_id === winner.driver_id)!;
    expect(dsq).toMatchObject({ status: 'dsq', position: null, points: 0 });
    const corrections = await store.select('round_corrections', { eq: { round_id: r3.id } });
    expect(corrections.at(-1)!.reason_de).toBe('Urteil S2-R03-03');

    await revokeDecision(store, stewardA, d.id, null);
    const back = (await raceRows(r3.id)).find((r) => r.driver_id === winner.driver_id)!;
    expect(back).toMatchObject({ status: 'classified', position: 1 });
  });

  it('befangene Stewards können nicht entscheiden', async () => {
    const r4 = await roundOf(2, 4);
    const [draft] = await store.select('decisions', { eq: { round_id: r4.id, status: 'draft' } });
    const involved = { ...stewardA, driverId: 19 }; // Meldende Person von Vorfall 4
    await expectError(publishDecision(store, involved, draft!.id), 'FORBIDDEN');
    await expectError(setIncidentStatus(store, involved, draft!.incident_id!, 'rejected'), 'FORBIDDEN');
  });

  it('eigene Untersuchung ohne Meldung', async () => {
    const r4 = await roundOf(2, 4);
    const incident = await openInvestigation(store, stewardA, {
      roundId: r4.id,
      sessionType: 'race',
      involvedDriverIds: [3, 4],
      lap: 12,
      corner: 'Kurve 1',
      description: 'Kontakt in Kurve 1, von den Stewards selbst aufgegriffen.',
      clipUrl: null,
      clipTimestamp: null,
    });
    expect(incident).toMatchObject({ source: 'steward', status: 'in_review', reporter_driver_id: null });
    expect(incident.session_id).toBe((await sessionOf(r4.id, 'race')).id);
  });
});
