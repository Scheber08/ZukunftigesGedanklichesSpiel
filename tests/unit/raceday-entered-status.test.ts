/**
 * results.entered_status (Phase-2-Vorbereitung): Speichern setzt den eingegebenen Status,
 * eine Steward-DSQ ändert nur `status`, Zurücknehmen stellt den eingegebenen Status wieder her
 * (auch nach erneutem Speichern in der Ergebnis-Eingabe). Altdaten ohne entered_status nutzen das
 * Audit-Log der Veröffentlichung.
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

import { enteredStatusOf, inputToResultInsert, resultRowToEditor, resultRowToEntered } from '~/lib/admin/raceday/results-map';
import { MemoryStore } from '~/lib/db/memory-store';
import type { Id, ResultRow, ResultStatus } from '~/lib/db/types';
import { recomputeRound, saveResults, type SessionPayload } from '~/lib/server/results';
import { publishDecision, revokeDecision, saveDecision } from '~/lib/server/stewarding';
import { demoDataset } from '~/lib/seed/demo';

const NOW = new Date('2026-10-15T12:00:00Z');
const admin = { userId: '00000000-0000-4000-8000-000000000001', name: 'Admin', driverId: null };
const stewardA = { userId: '00000000-0000-4000-8000-00000000000a', name: 'Steward A', driverId: null };
const stewardB = { userId: '00000000-0000-4000-8000-00000000000b', name: 'Steward B', driverId: null };

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore(demoDataset(NOW));
});

async function r4() {
  const [round] = await store.select('rounds', { eq: { season_id: 2, number: 4 } });
  const [race] = await store.select('sessions', { eq: { round_id: round!.id, type: 'race' } });
  return { round: round!, race: race! };
}

async function rows(sessionId: Id): Promise<ResultRow[]> {
  return (await store.select('results', { eq: { session_id: sessionId } })).sort((a, b) => a.entered_position - b.entered_position);
}

async function payload(sessionId: Id, change?: (driverId: Id) => ResultStatus | null): Promise<SessionPayload> {
  const list = await rows(sessionId);
  return {
    sessionId,
    rows: list.map((r) => ({
      driverId: r.driver_id,
      teamId: r.team_id,
      role: r.role,
      roundEntryId: r.round_entry_id,
      raceNumber: r.race_number,
      // wie die Ergebnis-Eingabe: eingegebener Status, nicht der nach Urteilen
      status: change?.(r.driver_id) ?? resultRowToEditor(r).status,
      gridPosition: r.grid_position,
      laps: r.laps,
      bestLapMs: r.best_lap_ms,
      totalTimeMs: r.total_time_ms,
      gapMs: r.gap_ms,
      gapLaps: r.gap_laps,
      pitStops: r.pit_stops,
      ingamePenaltyS: r.ingame_penalty_s,
    })),
  };
}

async function dsq(roundId: Id, sessionId: Id, driverId: Id) {
  const d = await saveDecision(store, stewardA, null, {
    incidentId: null,
    roundId,
    sessionId,
    driverId,
    verdict: 'dsq',
    timeSeconds: null,
    positions: null,
    penaltyPoints: null,
    reasoningDe: 'Technischer Verstoß laut Replay festgestellt.',
    reasoningEn: null,
    ruleRef: null,
    clipUrl: null,
  });
  const res = await publishDecision(store, stewardB, d.id);
  expect(res.published).toBe(true);
  return d;
}

describe('Hilfsfunktionen', () => {
  const base = { status: 'dsq', entered_status: 'dnf' } as const;

  it('enteredStatusOf: entered_status vor status, Altdaten ohne Spalte → status', () => {
    expect(enteredStatusOf(base)).toBe('dnf');
    expect(enteredStatusOf({ status: 'dsq', entered_status: null })).toBe('dsq');
  });

  it('Editor und Punktelogik gehen vom eingegebenen Status aus, Speichern setzt ihn', () => {
    const row = { ...(demoDataset(NOW).results?.[0] as ResultRow), ...base };
    expect(resultRowToEditor(row).status).toBe('dnf');
    expect(resultRowToEntered(row).status).toBe('dnf');
    const insert = inputToResultInsert({ ...resultRowToEditor(row), bestLapMs: null, totalTimeMs: null, gapMs: null }, 1, 0);
    expect(insert).toMatchObject({ status: 'dnf', entered_status: 'dnf' });
  });
});

describe('entered_status im Ablauf', () => {
  it('Speichern setzt entered_status = eingegebener Status', async () => {
    const { round, race } = await r4();
    const target = (await rows(race.id))[3]!.driver_id;
    await saveResults(store, round.id, [await payload(race.id, (id) => (id === target ? 'dnf' : null))], admin);
    const row = (await rows(race.id)).find((r) => r.driver_id === target)!;
    expect(row).toMatchObject({ status: 'dnf', entered_status: 'dnf' });
    expect((await rows(race.id)).every((r) => r.entered_status === r.status)).toBe(true);
  });

  it('Steward-DSQ ändert nur status; Zurücknehmen stellt den eingegebenen Status wieder her', async () => {
    const { round, race } = await r4();
    const target = (await rows(race.id))[2]!.driver_id;
    await saveResults(store, round.id, [await payload(race.id, (id) => (id === target ? 'dnf' : null))], admin);
    const d = await dsq(round.id, race.id, target);
    expect((await rows(race.id)).find((r) => r.driver_id === target)).toMatchObject({ status: 'dsq', entered_status: 'dnf', position: null });

    // Ergebnis-Eingabe zeigt DNF (nicht DSQ) – erneutes Speichern macht die DSQ nicht „fest“
    await saveResults(store, round.id, [await payload(race.id)], admin);
    expect((await rows(race.id)).find((r) => r.driver_id === target)).toMatchObject({ status: 'dsq', entered_status: 'dnf' });

    await revokeDecision(store, stewardA, d.id, null);
    expect((await rows(race.id)).find((r) => r.driver_id === target)).toMatchObject({ status: 'dnf', entered_status: 'dnf', points: 0 });
  });

  it('gewertet → DSQ → zurück: Position und Punkte wie vorher', async () => {
    const { round, race } = await r4();
    const before = (await rows(race.id)).find((r) => r.position === 1)!;
    const d = await dsq(round.id, race.id, before.driver_id);
    expect((await rows(race.id)).find((r) => r.driver_id === before.driver_id)).toMatchObject({ status: 'dsq', entered_status: 'classified', points: 0 });
    await revokeDecision(store, stewardA, d.id, null);
    expect((await rows(race.id)).find((r) => r.driver_id === before.driver_id)).toMatchObject({
      status: 'classified',
      position: 1,
      points: before.points,
    });
  });

  it('eingegebene DSQ bleibt DSQ, auch nach Urteil und Rücknahme', async () => {
    const { round, race } = await r4();
    const target = (await rows(race.id))[5]!.driver_id;
    await saveResults(store, round.id, [await payload(race.id, (id) => (id === target ? 'dsq' : null))], admin);
    const d = await dsq(round.id, race.id, target);
    await revokeDecision(store, stewardA, d.id, null);
    expect((await rows(race.id)).find((r) => r.driver_id === target)).toMatchObject({ status: 'dsq', entered_status: 'dsq' });
  });

  it('Altdaten ohne entered_status: Rücknahme nutzt den Status aus dem Audit-Log und ergänzt entered_status', async () => {
    const { round, race } = await r4();
    const target = (await rows(race.id))[4]!.driver_id;
    await saveResults(store, round.id, [await payload(race.id, (id) => (id === target ? 'dnf' : null))], admin);
    // Zustand wie vor der Migration: Spalte leer
    await store.update('results', { session_id: race.id, driver_id: target }, { entered_status: null });
    const d = await dsq(round.id, race.id, target);
    expect((await rows(race.id)).find((r) => r.driver_id === target)).toMatchObject({ status: 'dsq', entered_status: null });
    await revokeDecision(store, stewardA, d.id, null);
    expect((await rows(race.id)).find((r) => r.driver_id === target)).toMatchObject({ status: 'dnf', entered_status: 'dnf' });
    // Neuberechnung ändert danach nichts mehr
    expect((await recomputeRound(store, round.id)).updated).toBe(0);
  });
});
