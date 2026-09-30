/**
 * Import-Dienst und Endpunkt /api/import gegen den Memory-Store mit Demo-Daten
 * (Runde 5 der Saison 2 in Montreal ist vor ~3 h gestartet, Aufstellung veröffentlicht).
 * Discord und Rebuild werden gemockt.
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

import { createCollector } from '../../tools/telemetry/collector.mjs';
import { sampleSession, DEMO_NUMBERS } from '../../tools/telemetry/fixtures.mjs';
import { RacedayError } from '~/lib/admin/raceday/errors';
import { parseEditorRow } from '~/lib/admin/raceday/results-map';
import { MemoryStore } from '~/lib/db/memory-store';
import type { Id } from '~/lib/db/types';
import { telemetryPayloadSchema, type TelemetryPayload } from '~/lib/import/payload';
import {
  createCsvBatch,
  createImportToken,
  createTelemetryBatch,
  discardImportBatch,
  importPrefill,
  importTokenStatus,
  listImportBatches,
  markBatchApplied,
  revokeImportToken,
} from '~/lib/import/service';
import { POST } from '~/pages/api/import';
import { saveResults } from '~/lib/server/results';
import { readPrivateSettings } from '~/lib/server/settings';
import { demoDataset } from '~/lib/seed/demo';

const admin = { userId: '00000000-0000-4000-8000-000000000001', name: 'Demo-Admin' };

let store: MemoryStore;

async function r5() {
  const [round] = await store.select('rounds', { eq: { season_id: 2, number: 5 } });
  const sessions = await store.select('sessions', { eq: { round_id: round!.id } });
  return { round: round!, race: sessions.find((s) => s.type === 'race')!, quali: sessions.find((s) => s.type === 'qualifying')! };
}

/** Beispiel-Mitschnitt → Upload-Payload (wie das Companion ihn schickt). */
function samplePayload(opts: Parameters<typeof sampleSession>[0] = {}): TelemetryPayload {
  const c = createCollector();
  const events = sampleSession(opts).flatMap((p) => c.handle(p.buf, 1_000 + p.t));
  const final = events.find((e) => e.type === 'final');
  if (!final || final.type !== 'final') throw new Error('kein Export');
  return telemetryPayloadSchema.parse(JSON.parse(JSON.stringify(final.payload)));
}

beforeEach(() => {
  store = new MemoryStore(demoDataset(new Date()));
  globalThis.__ligaMemoryStore = store;
  mocks.notify.mockClear();
  mocks.requestRebuild.mockClear();
});

describe('Telemetrie-Stapel', () => {
  it('legt einen Entwurf an und ordnet über die Startnummer zu', async () => {
    const { round, race } = await r5();
    const payload = samplePayload();
    const { batch, mapping } = await createTelemetryBatch(store, payload, { ok: true, roundId: round.id, sessionId: race.id, sessionType: 'race', how: 'auto' }, admin.userId);
    expect(batch).toMatchObject({ session_id: race.id, source: 'udp', status: 'draft', uploaded_by: admin.userId });
    expect(mapping.total).toBe(22);
    expect(mapping.matched).toBeGreaterThanOrEqual(18);
    const codes = mapping.warnings.map((w) => w.code);
    expect(codes).toContain('ai_ignored');
    // In Runde 5 fehlt LateBrakeLukas (#16, abgemeldet) – sein Ersatz fährt mit eigener Nummer
    expect(codes).toContain('not_in_lineup');
    const [log] = await store.select('audit_log', { eq: { entity: 'import_batches', entity_id: String(batch.id) } });
    expect(log).toMatchObject({ action: 'import', actor_name: 'Telemetrie-Import' });
  });

  it('Vorbefüllung → Speichern in der Ergebnis-Eingabe → Stapel übernommen', async () => {
    const { round, race } = await r5();
    const { batch } = await createTelemetryBatch(store, samplePayload(), { ok: true, roundId: round.id, sessionId: race.id, sessionType: 'race', how: 'auto' }, null);
    const prefill = await importPrefill(store, round.id, batch.id);
    expect(prefill).toMatchObject({ batchId: batch.id, sessionId: race.id, sessionType: 'race', status: 'draft', source: 'udp' });
    expect(prefill.rows.length).toBe(prefill.matched);
    const first = prefill.rows[0]!;
    expect(first.bestLap).toMatch(/^1:1\d\.\d{3}$/);
    expect(first.totalTime).not.toBe('');

    const inputs = prefill.rows.map((r) => parseEditorRow(r).input);
    await saveResults(store, round.id, [{ sessionId: race.id, rows: inputs }], admin);
    expect(await markBatchApplied(store, admin, batch.id, [race.id])).toBe(true);
    expect(await markBatchApplied(store, admin, batch.id, [race.id])).toBe(false);
    const [stored] = await store.select('import_batches', { eq: { id: batch.id } });
    expect(stored!.status).toBe('applied');
    const results = await store.select('results', { eq: { session_id: race.id } });
    expect(results).toHaveLength(prefill.rows.length);
    // Ingame-Strafe und eingegebener Status landen im Ergebnis
    expect(results.some((r) => r.ingame_penalty_s === 5)).toBe(true);
    expect(results.every((r) => r.entered_status === r.status)).toBe(true);
    await expect(discardImportBatch(store, admin, round.id, batch.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('markBatchApplied nur für gespeicherte Session', async () => {
    const { round, race, quali } = await r5();
    const { batch } = await createTelemetryBatch(store, samplePayload(), { ok: true, roundId: round.id, sessionId: race.id, sessionType: 'race', how: 'auto' }, null);
    expect(await markBatchApplied(store, admin, batch.id, [quali.id])).toBe(false);
  });
});

describe('CSV-Stapel', () => {
  const csv = ['Position;Startnummer;Gamertag;Status;Beste Runde;Gesamtzeit;Stopps;Strafsekunden', '1;4;Anna;;1:14.512;32:10.456;1;0', '2;77;Kerb;DNF;1:15.000;;0;0', '3;98;Gast;;;;;'].join('\n');

  it('speichert Rohtext, Zuordnung und Audit; Liste zeigt Zählung und Hinweise', async () => {
    const { round, race } = await r5();
    const { batch, mapping } = await createCsvBatch(store, admin, { roundId: round.id, sessionId: race.id, csv, fileName: 'ergebnis.csv' });
    expect(batch).toMatchObject({ source: 'csv', status: 'draft', raw: { csv, fileName: 'ergebnis.csv' } });
    expect(mapping).toMatchObject({ matched: 2, total: 3, sessionType: 'race' });
    const list = await listImportBatches(store, round.id);
    expect(list[0]).toMatchObject({ id: batch.id, source: 'csv', matched: 2, total: 3, sessionType: 'race', fileName: 'ergebnis.csv', status: 'draft' });
    expect(list[0]!.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['unknown_number', 'missing']));
    const prefill = await importPrefill(store, round.id, batch.id);
    expect(prefill.rows.map((r) => r.status)).toEqual(['classified', 'dnf']);
  });

  it('ohne Zuordnung, falsche Session oder eingefrorene Saison → Fehler', async () => {
    const { round, race } = await r5();
    await expect(createCsvBatch(store, admin, { roundId: round.id, sessionId: race.id, csv: '1;98;;' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(createCsvBatch(store, admin, { roundId: round.id, sessionId: 99999, csv })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const [oldRound] = await store.select('rounds', { eq: { season_id: 1, number: 1 } });
    const [oldRace] = await store.select('sessions', { eq: { round_id: oldRound!.id, type: 'race' } });
    await expect(createCsvBatch(store, admin, { roundId: oldRound!.id, sessionId: oldRace!.id, csv })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('verwerfen, danach keine Vorbefüllung; fremde Runde → Fehler', async () => {
    const { round, race } = await r5();
    const { batch } = await createCsvBatch(store, admin, { roundId: round.id, sessionId: race.id, csv });
    await expect(importPrefill(store, round.id + 1, batch.id)).rejects.toBeInstanceOf(RacedayError);
    const discarded = await discardImportBatch(store, admin, round.id, batch.id);
    expect(discarded.status).toBe('discarded');
    await expect(importPrefill(store, round.id, batch.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    const logs = await store.select('audit_log', { eq: { entity: 'import_batches', entity_id: String(batch.id) } });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['import', 'update']));
  });
});

describe('Import-Token', () => {
  it('speichert nur den Hash, Klartext nirgends; widerrufen', async () => {
    expect((await importTokenStatus(store)).configured).toBe(false);
    const { token, fingerprint } = await createImportToken(store, admin);
    const priv = await readPrivateSettings(store);
    expect(priv.import_token.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(priv.import_token.created_by).toBe(admin.userId);
    expect(JSON.stringify(await store.select('settings'))).not.toContain(token);
    expect(JSON.stringify(await store.select('audit_log'))).not.toContain(token);
    expect(await importTokenStatus(store)).toMatchObject({ configured: true, fingerprint });
    expect(await revokeImportToken(store, admin)).toBe(true);
    expect((await readPrivateSettings(store)).import_token.hash).toBeNull();
    expect(await revokeImportToken(store, admin)).toBe(false);
  });
});

describe('POST /api/import', () => {
  const url = new URL('http://localhost:4321/api/import');
  const call = (body: string, headers: Record<string, string> = {}) =>
    POST({ request: new Request(url, { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } }), url } as never) as Promise<Response>;

  it('503 ohne eingerichtetes Token, 401 bei falschem Token', async () => {
    expect((await call('{}', { authorization: 'Bearer liga_imp_xxxxxxxxxxxxxxxxxxxx' })).status).toBe(503);
    await createImportToken(store, admin);
    const res = await call('{}', { authorization: 'Bearer liga_imp_xxxxxxxxxxxxxxxxxxxx' });
    expect(res.status).toBe(401);
    expect((await call('{}')).status).toBe(401);
  });

  it('prüft Content-Type, Größe, JSON und Schema', async () => {
    const { token } = await createImportToken(store, admin);
    const auth = { authorization: `Bearer ${token}` };
    expect((await call('{}', { ...auth, 'content-type': 'text/plain' })).status).toBe(415);
    expect((await call('x'.repeat(600 * 1024), auth)).status).toBe(413);
    expect((await call('{kaputt', auth)).status).toBe(400);
    const bad = await call(JSON.stringify({ format: 'liga-telemetry/1' }), auth);
    expect(bad.status).toBe(400);
    expect((await bad.json()).details.length).toBeGreaterThan(0);
  });

  it('201 mit Stapel und Prüf-Link (Runde 5, Rennen); 422 bei falscher Strecke mit Erklärung', async () => {
    const { token } = await createImportToken(store, admin);
    const auth = { authorization: `Bearer ${token}` };
    const { round, race } = await r5();
    const ok = await call(JSON.stringify(samplePayload()), auth);
    expect(ok.status).toBe(201);
    const data = await ok.json();
    expect(data).toMatchObject({ roundId: round.id, sessionId: race.id, sessionType: 'race', total: 22 });
    expect(data.reviewUrl).toBe(`http://localhost:4321/admin/runden/${round.id}/ergebnisse?session=${race.id}&import=${data.batchId}`);
    const [batch] = await store.select('import_batches', { eq: { id: data.batchId as Id } });
    expect(batch).toMatchObject({ source: 'udp', status: 'draft', uploaded_by: admin.userId });

    const wrong = await call(JSON.stringify(samplePayload({ trackId: 13 })), auth);
    expect(wrong.status).toBe(422);
    const err = await wrong.json();
    expect(err.error).toBe('Keine passende Runde gefunden.');
    expect(err.details.join(' ')).toMatch(/Suzuka/);

    const quali = await call(JSON.stringify(samplePayload({ sessionType: 8 })), auth);
    expect(quali.status).toBe(201);
    expect((await quali.json()).sessionType).toBe('qualifying');
  });

  it('wiederholter Upload desselben Endergebnisses: 200 mit dem vorhandenen Stapel, nach Verwerfen wieder neu', async () => {
    const { token } = await createImportToken(store, admin);
    const auth = { authorization: `Bearer ${token}` };
    const { round } = await r5();
    const payload = samplePayload();
    const first = await call(JSON.stringify(payload), auth);
    expect(first.status).toBe(201);
    const firstData = await first.json();
    expect(firstData.duplicate).toBe(false);

    // gleicher Inhalt, andere Schlüsselreihenfolge (wie nach jsonb) → kein zweiter Stapel
    const reordered = { ...payload, results: payload.results.map((r) => Object.fromEntries(Object.entries(r).reverse())) };
    const again = await call(JSON.stringify(reordered), auth);
    expect(again.status).toBe(200);
    const againData = await again.json();
    expect(againData).toMatchObject({ batchId: firstData.batchId, duplicate: true });
    expect(await store.select('import_batches', { eq: { source: 'udp' } })).toHaveLength(1);

    // anderes Ergebnis derselben Session → neuer Stapel
    const changed = { ...payload, results: payload.results.map((r, i) => (i === 0 ? { ...r, bestLapMs: (r.bestLapMs ?? 80_000) + 1 } : r)) };
    expect((await call(JSON.stringify(changed), auth)).status).toBe(201);

    // verworfen → gleicher Upload legt wieder einen Entwurf an
    await discardImportBatch(store, admin, round.id, firstData.batchId as Id);
    const afterDiscard = await call(JSON.stringify(payload), auth);
    expect(afterDiscard.status).toBe(201);
    expect((await afterDiscard.json()).batchId).not.toBe(firstData.batchId);
  });

  it('Antwort enthält keine privaten Daten', async () => {
    const { token } = await createImportToken(store, admin);
    const res = await call(JSON.stringify(samplePayload({ numbers: DEMO_NUMBERS.slice(0, 4) })), { authorization: `Bearer ${token}` });
    const text = await res.text();
    expect(text).not.toMatch(/discord|ea_id|@|notes/i);
  });

  it('Rate-Limit nach 30 Anfragen je IP (auch Fehlversuche)', async () => {
    await createImportToken(store, admin);
    const headers = { authorization: 'Bearer liga_imp_xxxxxxxxxxxxxxxxxxxx', 'cf-connecting-ip': '203.0.113.9' };
    for (let i = 0; i < 30; i++) expect((await call('{}', headers)).status).toBe(401);
    const limited = await call('{}', headers);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('600');
  });
});
