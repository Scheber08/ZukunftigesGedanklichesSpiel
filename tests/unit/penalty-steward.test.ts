/**
 * Strafpunkte im Steward-Werkzeug gegen den Memory-Store mit Demo-Daten (Saison 2: Verwarnung ab 6,
 * Sperre ab 10, kein Verfall; Saison 1 ohne Strafpunkte).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { draftWarning, formPenalty, involvedAccounts, loadStewardPenaltyPoints } from '~/lib/admin/raceday/decision-input';
import { MemoryStore } from '~/lib/db/memory-store';
import type { SeasonRow } from '~/lib/db/types';
import { demoDataset } from '~/lib/seed/demo';

let store: MemoryStore;
const season = async (id: number): Promise<SeasonRow> => (await store.select('seasons', { eq: { id } }))[0]!;

beforeEach(() => {
  store = new MemoryStore(demoDataset(new Date('2026-09-30T12:00:00Z')));
});

describe('Steward-Werkzeug: Strafpunkte-Konten', () => {
  it('Saison ohne System → null', async () => {
    expect(await loadStewardPenaltyPoints(store, await season(1))).toBeNull();
  });

  it('Konten aus veröffentlichten Entscheidungen, Entwürfe zählen nicht', async () => {
    const pp = (await loadStewardPenaltyPoints(store, await season(2)))!;
    expect(pp.config).toEqual({ warningThreshold: 6, banThreshold: 10, expiryRounds: null });
    expect(pp.accounts.map((a) => [a.driverId, a.active])).toEqual([
      [13, 3],
      [10, 2],
      [20, 2],
    ]);
    // Fahrer 22 hat nur einen Entwurf mit 2 Punkten
    expect(pp.activeOf(22)).toBe(0);
    expect(pp.accountOf(22)).toBeUndefined();
  });

  it('Formulardaten und Konten der Beteiligten', async () => {
    const s2 = await season(2);
    const pp = await loadStewardPenaltyPoints(store, s2);
    const form = formPenalty(pp, s2, [14, 13, 13], (id) => `Fahrer ${id}`)!;
    expect(form.active).toEqual({ '13': 3, '10': 2, '20': 2 });
    expect(form.involved.map((r) => [r.id, r.label, r.active, r.status])).toEqual([
      [14, 'Fahrer 14', 0, 'ok'],
      [13, 'Fahrer 13', 3, 'ok'],
    ]);
    expect(formPenalty(null, s2, [13], String)).toBeNull();
    expect(involvedAccounts(pp!, [], String)).toEqual([]);
  });

  it('Warnung für Entwürfe, nicht für veröffentlichte Entscheidungen', async () => {
    const pp = await loadStewardPenaltyPoints(store, await season(2));
    expect(draftWarning(pp, { status: 'draft', driver_id: 13, penalty_points: 3 })).toMatchObject({ level: 'warning', after: 6 });
    expect(draftWarning(pp, { status: 'draft', driver_id: 13, penalty_points: 7 })).toMatchObject({ level: 'ban', after: 10 });
    expect(draftWarning(pp, { status: 'published', driver_id: 13, penalty_points: 7 })).toBeNull();
    expect(draftWarning(pp, { status: 'draft', driver_id: 22, penalty_points: 2 })).toBeNull();
    expect(draftWarning(null, { status: 'draft', driver_id: 13, penalty_points: 12 })).toBeNull();
  });

  it('Zurücknahme senkt das Konto', async () => {
    await store.update('decisions', { public_ref: 'S2-R03-01' }, { status: 'revoked' });
    const pp = (await loadStewardPenaltyPoints(store, await season(2)))!;
    expect(pp.activeOf(13)).toBe(0);
    expect(pp.accounts.map((a) => a.driverId)).toEqual([10, 20]);
  });
});
