/**
 * MemoryStore (Demo-Modus, E2E): muss sich wie die Postgres-Migration verhalten –
 * Defaults, Identitäts-IDs, Unique-Constraints, Kaskaden und der Rundenzeit-Trigger.
 */
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '~/lib/db/memory-store';
import { StoreError, UNIQUE_VIOLATION, insertOne, selectOne } from '~/lib/db/store';
import { baseDataset } from '~/lib/seed/base';
import { demoDataset } from '~/lib/seed/demo';

const NOW = new Date('2026-10-15T12:00:00Z');

async function expectUnique(promise: Promise<unknown>): Promise<void> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(StoreError);
  expect((err as StoreError).code).toBe(UNIQUE_VIOLATION);
}

function leagueStore(): MemoryStore {
  const store = new MemoryStore(baseDataset());
  return store;
}

async function addSeason(store: MemoryStore, number: number, extra: Record<string, unknown> = {}) {
  return insertOne(store, 'seasons', { number, slug: String(number), name: `Saison ${number}`, game_version: 'F1 25', points_scheme_id: 1, ...extra });
}

describe('MemoryStore – Defaults und IDs', () => {
  it('setzt Spalten-Defaults wie die Migration', async () => {
    const store = leagueStore();
    const season = await addSeason(store, 1);
    expect(season).toMatchObject({
      status: 'planned',
      reserve_points_for_constructors: true,
      protest_window_hours: 48,
      two_steward_rule: false,
      penalty_points_enabled: false,
      lobby_settings: {},
      rules_version_id: null,
    });
    expect(season.created_at).toBeTruthy();
    expect(season.updated_at).toBeTruthy();

    const driver = await insertOne(store, 'drivers', { slug: 'neu', gamertag: 'Neu', platform: 'xbox' });
    expect(driver).toMatchObject({ status: 'reserve', input_device: 'controller', show_links: false, anonymized: false, nationality_code: null });
  });

  it('vergibt IDs hinter den höchsten Seed-IDs', async () => {
    const store = leagueStore();
    const team = await insertOne(store, 'teams', { slug: 'neues-team', name: 'Neues Team', short_name: 'NEU', color_hex: '#123456' });
    expect(team.id).toBe(12);
    const second = await insertOne(store, 'teams', { slug: 'noch-eins', name: 'Noch eins', short_name: 'NE2', color_hex: '#654321' });
    expect(second.id).toBe(13);
  });

  it('liefert Kopien (Änderungen am Ergebnis verändern den Speicher nicht)', async () => {
    const store = leagueStore();
    const [team] = await store.select('teams', { eq: { slug: 'ferrari' } });
    team!.name = 'Verändert';
    expect((await selectOne(store, 'teams', { slug: 'ferrari' }))?.name).toBe('Ferrari');
  });

  it('erhöht die Version bei jeder Schreiboperation', async () => {
    const store = leagueStore();
    const v0 = store.version;
    await store.update('teams', { slug: 'ferrari' }, { color_hex: '#DC0000' });
    expect(store.version).toBe(v0 + 1);
    await store.update('teams', { slug: 'gibt-es-nicht' }, { color_hex: '#000000' });
    expect(store.version).toBe(v0 + 1);
  });
});

describe('MemoryStore – Filter', () => {
  it('unterstützt eq (inkl. null), in, order und limit', async () => {
    const store = leagueStore();
    const it1 = await store.select('teams', { in: { slug: ['audi', 'cadillac', 'haas'] }, order: { column: 'name', desc: true }, limit: 2 });
    expect(it1.map((t) => t.slug)).toEqual(['haas', 'cadillac']);
    const noGameId = await store.select('teams', { eq: { game_team_id: null } });
    expect(noGameId.map((t) => t.slug)).toEqual(['cadillac']);
    const tracks = await store.select('tracks', { order: { column: 'game_track_id' } });
    // null-Werte am Ende
    expect(tracks.at(-1)?.game_track_id).toBeNull();
  });
});

describe('MemoryStore – Unique-Constraints', () => {
  it('verhindert doppelte Slugs und Primärschlüssel', async () => {
    const store = leagueStore();
    await expectUnique(store.insert('teams', { slug: 'ferrari', name: 'X', short_name: 'X', color_hex: '#000000' }));
    await expectUnique(store.insert('teams', { id: 1, slug: 'anders', name: 'X', short_name: 'X', color_hex: '#000000' }));
  });

  it('erlaubt nur eine aktive Saison', async () => {
    const store = leagueStore();
    await addSeason(store, 1, { status: 'active' });
    await addSeason(store, 2, { status: 'planned' });
    await expectUnique(addSeason(store, 3, { status: 'active' }));
    await expectUnique(store.update('seasons', { number: 2 }, { status: 'active' }));
    await store.update('seasons', { number: 1 }, { status: 'finished' });
    await store.update('seasons', { number: 2 }, { status: 'active' });
  });

  it('prüft Gamertags ohne Groß-/Kleinschreibung, pseudonymisierte ausgenommen', async () => {
    const store = leagueStore();
    await insertOne(store, 'drivers', { slug: 'apex', gamertag: 'ApexAnna', platform: 'pc_steam' });
    await expectUnique(store.insert('drivers', { slug: 'apex-2', gamertag: 'apexanna', platform: 'xbox' }));
    await store.update('drivers', { slug: 'apex' }, { anonymized: true });
    await insertOne(store, 'drivers', { slug: 'apex-2', gamertag: 'apexanna', platform: 'xbox' });
  });

  it('vergibt eine Startnummer nur einmal aktiv, die Historie bleibt', async () => {
    const store = leagueStore();
    const a = await insertOne(store, 'drivers', { slug: 'a', gamertag: 'A', platform: 'xbox' });
    const b = await insertOne(store, 'drivers', { slug: 'b', gamertag: 'B', platform: 'xbox' });
    const n = await insertOne(store, 'driver_numbers', { driver_id: a.id, number: 44 });
    expect(n.valid_from).toBeTruthy();
    await expectUnique(store.insert('driver_numbers', { driver_id: b.id, number: 44 }));
    // eine zweite offene Nummer für denselben Fahrer ist ebenfalls verboten
    await expectUnique(store.insert('driver_numbers', { driver_id: a.id, number: 45 }));
    await store.update('driver_numbers', { id: n.id }, { valid_to: new Date().toISOString() });
    await insertOne(store, 'driver_numbers', { driver_id: b.id, number: 44 });
    expect(await store.select('driver_numbers', { eq: { number: 44 } })).toHaveLength(2);
  });

  it('prüft zusammengesetzte Schlüssel (Aufstellung, Ergebnisse)', async () => {
    const store = new MemoryStore(demoDataset(NOW));
    const [entry] = await store.select('round_entries', { limit: 1 });
    await expectUnique(store.insert('round_entries', { ...entry!, id: undefined, team_id: 99, seat_no: 1 }));
    await expectUnique(store.insert('round_entries', { ...entry!, id: undefined, driver_id: 999 }));
    const [result] = await store.select('results', { limit: 1 });
    await expectUnique(store.insert('results', { ...result!, id: undefined }));
  });
});

describe('MemoryStore – Upsert', () => {
  it('fügt ein oder aktualisiert anhand der Konfliktspalten', async () => {
    const store = leagueStore();
    await store.upsert('settings', [{ key: 'twitch_channel', value: 'liga', is_public: true }], ['key']);
    expect((await selectOne(store, 'settings', { key: 'twitch_channel' }))?.value).toBe('liga');
    await store.upsert('settings', [{ key: 'neuer_schluessel', value: { a: 1 }, is_public: false }]);
    expect((await selectOne(store, 'settings', { key: 'neuer_schluessel' }))?.value).toEqual({ a: 1 });
  });
});

describe('MemoryStore – Rundenzeit-Trigger', () => {
  it('berechnet start_utc aus der Berliner Ortszeit (Sommer/Winter)', async () => {
    const store = leagueStore();
    const season = await addSeason(store, 1);
    const summer = await insertOne(store, 'rounds', { season_id: season.id, number: 1, track_id: 1, local_start: '2026-07-02T20:00:00' });
    expect(summer.start_utc).toBe('2026-07-02T18:00:00.000Z');
    expect(summer.timezone).toBe('Europe/Berlin');
    const winter = await insertOne(store, 'rounds', { season_id: season.id, number: 2, track_id: 2, local_start: '2026-11-05T20:00:00' });
    expect(winter.start_utc).toBe('2026-11-05T19:00:00.000Z');
    expect(winter.protest_deadline).toBeNull();
  });

  it('rechnet bei Änderungen neu, Protestfrist nach Saison-Einstellung', async () => {
    const store = leagueStore();
    const season = await addSeason(store, 1, { protest_window_hours: 24 });
    const round = await insertOne(store, 'rounds', { season_id: season.id, number: 1, track_id: 1, local_start: '2026-11-05T20:00:00' });
    const [moved] = await store.update('rounds', { id: round.id }, { local_start: '2026-11-05T21:30:00' });
    expect(moved?.start_utc).toBe('2026-11-05T20:30:00.000Z');
    const [provisional] = await store.update('rounds', { id: round.id }, { status: 'provisional', provisional_at: '2026-11-05T23:00:00.000Z' });
    expect(provisional?.protest_deadline).toBe('2026-11-06T23:00:00.000Z');
    const [reset] = await store.update('rounds', { id: round.id }, { provisional_at: null });
    expect(reset?.protest_deadline).toBeNull();
  });
});

describe('MemoryStore – Kaskaden (ON DELETE CASCADE)', () => {
  it('löscht mit einer Saison Runden, Sessions, Ergebnisse, Aufstellungen und Snapshots', async () => {
    const store = new MemoryStore(demoDataset(NOW));
    const rounds = await store.select('rounds', { eq: { season_id: 1 } });
    const roundIds = rounds.map((r) => r.id);
    const sessions = (await store.select('sessions')).filter((s) => roundIds.includes(s.round_id));
    const sessionIds = sessions.map((s) => s.id);
    expect(sessionIds.length).toBeGreaterThan(0);

    expect(await store.remove('seasons', { id: 1 })).toBe(1);
    expect(await store.select('rounds', { eq: { season_id: 1 } })).toHaveLength(0);
    expect((await store.select('sessions')).filter((s) => roundIds.includes(s.round_id))).toHaveLength(0);
    expect((await store.select('results')).filter((r) => sessionIds.includes(r.session_id))).toHaveLength(0);
    expect((await store.select('round_entries')).filter((e) => roundIds.includes(e.round_id))).toHaveLength(0);
    expect((await store.select('decisions')).filter((d) => roundIds.includes(d.round_id))).toHaveLength(0);
    expect(await store.select('standings_snapshots', { eq: { season_id: 1 } })).toHaveLength(0);
    expect(await store.select('seats', { eq: { season_id: 1 } })).toHaveLength(0);
    // Saison 2 bleibt unberührt
    expect((await store.select('rounds', { eq: { season_id: 2 } })).length).toBe(12);
  });

  it('löscht mit einer Regelwerk-Version ihre Paragrafen', async () => {
    const store = leagueStore();
    expect((await store.select('rules_sections', { eq: { version_id: 1 } })).length).toBeGreaterThan(10);
    await store.remove('rules_versions', { id: 1 });
    expect(await store.select('rules_sections')).toHaveLength(0);
  });

  it('löscht mit einem Fahrer private Daten und Nummern', async () => {
    const store = new MemoryStore(demoDataset(NOW));
    await store.remove('results', { driver_id: 30 });
    await store.remove('round_entries', { driver_id: 30 });
    await store.remove('seats', { driver_id: 30 });
    await store.remove('drivers', { id: 30 });
    expect(await store.select('driver_private', { eq: { driver_id: 30 } })).toHaveLength(0);
    expect(await store.select('driver_numbers', { eq: { driver_id: 30 } })).toHaveLength(0);
  });
});

describe('MemoryStore – Sonstiges', () => {
  it('kennt die Wartungsfunktion run_retention im Demo-Modus', async () => {
    const store = leagueStore();
    await expect(store.rpc('run_retention')).resolves.toEqual({ demo: true });
    await expect(store.rpc('gibt_es_nicht')).rejects.toBeInstanceOf(StoreError);
  });

  it('setzt Zeitstempel für Vorfälle, Audit-Log und Nummern', async () => {
    const store = new MemoryStore(demoDataset(NOW));
    const incident = await insertOne(store, 'incidents', { round_id: 1, description: 'Test' });
    expect(incident.submitted_at).toBeTruthy();
    expect(incident.status).toBe('new');
    expect(incident.involved_driver_ids).toEqual([]);
    const log = await insertOne(store, 'audit_log', { action: 'create', entity: 'teams' });
    expect(log.at).toBeTruthy();
  });

  it('exportiert alle Tabellen per dump()', () => {
    const store = leagueStore();
    const dump = store.dump();
    expect(dump.teams).toHaveLength(11);
    expect(dump.tracks.length).toBeGreaterThanOrEqual(24);
    expect(dump.results).toEqual([]);
  });
});
