/**
 * Feinschliff Admin-Kern (Phase 2/3): rückwirkende Transfers, reservierte Slugs,
 * Einstellungen mit Patch-Semantik und Selbstrollen des Discord-Bots.
 */
import { describe, expect, it } from 'vitest';
import {
  interactionsEndpoint,
  isRoleId,
  MAX_SELF_ROLES,
  planSelfRoleRemove,
  planSelfRoleUpsert,
  selfRolesWithStaffRights,
  type SelfRole,
} from '~/lib/admin/league/discord-bot';
import { driverSlug, nextDriverSlug, planAcceptRegistration, pseudonymizedDriverPatch } from '~/lib/admin/league/drivers';
import { pseudonymizeDriver } from '~/lib/admin/league/ops';
import { retroConfirmMessage, roundListLabel, scoredRoundNumbers, seatChangeRetro } from '~/lib/admin/league/seats';
import { applySettingPatch, changedKeys, mergeSettingPatch } from '~/lib/admin/league/settings-patch';
import { autoSlug, isReservedSlug, RESERVED_DRIVER_SLUGS, RESERVED_TEAM_SLUGS, reservedSlugMessage, slugProblem } from '~/lib/admin/league/slugs';
import { MemoryStore } from '~/lib/db/memory-store';
import type { RegistrationRow, RoundStatus } from '~/lib/db/types';
import { ROUTES } from '~/i18n/routes';
import { DEFAULT_PUBLIC_SETTINGS, parsePrivateSettings, parsePublicSettings } from '~/lib/settings';

const TS = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
const round = (number: number, status: RoundStatus) => ({ number, status });

// ---------------------------------------------------------------------------- Transfers

describe('Transfers „ab Runde X“: rückwirkende Änderung', () => {
  const rounds = [
    round(1, 'final'),
    round(2, 'corrected'),
    round(3, 'final'),
    round(4, 'provisional'),
    round(5, 'lineup_published'),
    round(6, 'scheduled'),
    round(7, 'cancelled'),
  ];

  it('zählt vorläufige, finale und korrigierte Runden als gewertet', () => {
    expect(scoredRoundNumbers(rounds)).toEqual([1, 2, 3, 4]);
    expect(scoredRoundNumbers([round(3, 'final'), round(1, 'provisional')])).toEqual([1, 3]);
  });

  it('X auf oder vor der letzten gewerteten Runde ist rückwirkend', () => {
    expect(seatChangeRetro(rounds, 4)).toEqual({ retroactive: true, lastScoredRound: 4, affectedRounds: [4] });
    expect(seatChangeRetro(rounds, 2)).toEqual({ retroactive: true, lastScoredRound: 4, affectedRounds: [2, 3, 4] });
    expect(seatChangeRetro(rounds, 1).affectedRounds).toEqual([1, 2, 3, 4]);
  });

  it('X nach der letzten gewerteten Runde ist unkritisch – auch wenn die Aufstellung schon steht', () => {
    expect(seatChangeRetro(rounds, 5)).toEqual({ retroactive: false, lastScoredRound: 4, affectedRounds: [] });
    expect(seatChangeRetro(rounds, 12).retroactive).toBe(false);
  });

  it('ohne gewertete Runden (Saisonstart) nie rückwirkend', () => {
    expect(seatChangeRetro([round(1, 'scheduled'), round(2, 'lineup_published')], 1)).toEqual({
      retroactive: false,
      lastScoredRound: null,
      affectedRounds: [],
    });
    expect(seatChangeRetro([], 1).retroactive).toBe(false);
  });

  it('Lücken (abgesagte Runde) zählen nicht als gewertet', () => {
    const withGap = [round(1, 'final'), round(2, 'cancelled'), round(3, 'final')];
    expect(seatChangeRetro(withGap, 2)).toEqual({ retroactive: true, lastScoredRound: 3, affectedRounds: [3] });
  });

  it('verständliche Meldung mit betroffenen Runden', () => {
    const msg = retroConfirmMessage(seatChangeRetro(rounds, 2), 2);
    expect(msg).toContain('Runde 2');
    expect(msg).toContain('R4');
    expect(msg).toContain('R2, R3, R4');
    expect(msg).toContain('Konstrukteurspunkte');
    expect(msg).toContain('Rückwirkende Änderung bestätigen');
  });

  it('kürzt lange Rundenfolgen', () => {
    expect(roundListLabel([3, 1, 2])).toBe('R1, R2, R3');
    expect(roundListLabel([1, 2, 3, 4, 5])).toBe('R1–R5');
    expect(roundListLabel([1, 3, 4, 5])).toBe('R1, R3, R4, R5');
    expect(roundListLabel([])).toBe('');
  });
});

// ---------------------------------------------------------------------------- Reservierte Slugs

describe('Reservierte Slugs', () => {
  it('leitet feste Unterseiten aus den Routen ab (/fahrer/vergleich, /en/drivers/compare)', () => {
    expect(ROUTES.driverCompare.de).toBe('/fahrer/vergleich');
    expect(RESERVED_DRIVER_SLUGS).toContain('vergleich');
    expect(RESERVED_DRIVER_SLUGS).toContain('compare');
    expect(RESERVED_TEAM_SLUGS).toContain('vergleich');
    // Platzhalter wie {slug} sind keine reservierten Namen
    expect(RESERVED_DRIVER_SLUGS.some((s) => s.includes('{'))).toBe(false);
  });

  it('erkennt reservierte Slugs unabhängig von Groß-/Kleinschreibung', () => {
    expect(isReservedSlug('driver', 'vergleich')).toBe(true);
    expect(isReservedSlug('driver', 'Compare')).toBe(true);
    expect(isReservedSlug('driver', 'vergleich-2')).toBe(false);
    expect(isReservedSlug('team', 'mclaren')).toBe(false);
    expect(isReservedSlug('driver', '')).toBe(false);
  });

  it('automatische Slugs bekommen bei Konflikt den Zähler -2', () => {
    expect(autoSlug('driver', 'Vergleich', [])).toBe('vergleich-2');
    expect(autoSlug('driver', 'Compare', ['compare-2'])).toBe('compare-3');
    expect(autoSlug('team', 'Vergleich', [])).toBe('vergleich-2');
    expect(autoSlug('driver', 'Apex Anna', [])).toBe('apex-anna');
  });

  it('gilt bei Neuanlage, Annahme einer Anmeldung und Gamertag-Änderung', () => {
    expect(driverSlug('VERGLEICH', ['max'])).toBe('vergleich-2');
    // Gamertag-Änderung mit automatischem Slug
    expect(nextDriverSlug({ gamertag: 'Compare', slug: 'old-name' }, { slug: 'old-name', gamertag: 'Old Name' }, ['old-name'])).toEqual({
      slug: 'compare-2',
      custom: false,
    });
    // Anmeldung annehmen
    const reg: RegistrationRow = {
      ...TS,
      id: 7,
      gamertag: 'Vergleich',
      discord_username: 'v',
      ea_id: null,
      platform: 'pc_steam',
      input_device: 'wheel',
      nationality: null,
      desired_number: 44,
      wanted_role: 'regular',
      availability: 'regular',
      experience: null,
      reference_time: null,
      consents: { age16: true, rules: true, at: TS.created_at, rules_version: null },
      status: 'new',
      admin_notes: null,
      ip_hash: null,
      driver_id: null,
      processed_by: null,
      processed_at: null,
    };
    const plan = planAcceptRegistration(reg, { drivers: [], numbers: [], seasons: [], now: new Date('2026-09-30T12:00:00Z') });
    expect(plan.driver.slug).toBe('vergleich-2');
  });

  it('selbst eingetragene reservierte Slugs ergeben eine Fehlermeldung', () => {
    expect(slugProblem('driver', 'vergleich', [])).toBe(reservedSlugMessage('driver', 'vergleich'));
    expect(slugProblem('driver', 'vergleich', [])).toMatch(/reserviert/);
    expect(slugProblem('team', 'compare', [])).toMatch(/\/teams\/… und \/en\/teams\/…/);
    expect(slugProblem('driver', 'max', ['max'])).toMatch(/schon vergeben/);
    expect(slugProblem('driver', 'max', ['anna'])).toBeNull();
    // Unveränderter (Alt-)Slug bleibt bearbeitbar
    expect(slugProblem('driver', 'vergleich', [], 'vergleich')).toBeNull();
  });

  it('Pseudonymisierung vergibt nie einen reservierten Slug', () => {
    const patch = pseudonymizedDriverPatch({ id: 3, slug: 'anna' }, ['anna', 'ehemaliger-fahrer-3']);
    expect(patch.slug).toBe('ehemaliger-fahrer-3-2');
    expect(isReservedSlug('driver', patch.slug)).toBe(false);
  });

  it('Pseudonymisierung im Store: neuer Slug frei und nicht reserviert', async () => {
    const store = new MemoryStore({});
    await store.insert('drivers', {
      id: 1,
      slug: 'vergleich-2',
      gamertag: 'Vergleich',
      nationality_code: null,
      platform: 'pc_steam',
      input_device: 'wheel',
      status: 'active',
      reserve_order: null,
      joined_season_id: null,
      twitch_url: null,
      youtube_url: null,
      show_links: false,
      anonymized: false,
    });
    const res = await pseudonymizeDriver(store, 1);
    expect(res.driver.slug).toBe('ehemaliger-fahrer-1');
    expect(isReservedSlug('driver', res.driver.slug)).toBe(false);
  });
});

// ---------------------------------------------------------------------------- Patch-Semantik

describe('Einstellungen: Patch-Semantik', () => {
  it('überschreibt nur übermittelte Unterschlüssel', () => {
    const current = { state: 'open', free_seats: 3, free_reserve: 4, note_de: 'Hallo', note_en: 'Hello' };
    expect(mergeSettingPatch(current, { state: 'closed' })).toEqual({ ...current, state: 'closed' });
    // Eingaben bleiben unverändert
    expect(current.state).toBe('open');
  });

  it('undefined = nicht übermittelt, null = bewusst leeren', () => {
    const current = { a: 1, b: 'x', c: true };
    expect(mergeSettingPatch(current, { a: undefined, b: null })).toEqual({ a: 1, b: null, c: true });
  });

  it('erhält unbekannte Felder (z. B. von anderen Modulen ergänzt)', () => {
    const current = { claim_de: 'Alt', claim_en: 'Old', extra_flag: true };
    expect(mergeSettingPatch(current, { claim_de: 'Neu' })).toEqual({ claim_de: 'Neu', claim_en: 'Old', extra_flag: true });
  });

  it('mischt verschachtelte Objekte, ersetzt Arrays', () => {
    const current = { roles: [{ role_id: '1' }], nested: { x: 1, y: 2 } };
    const out = mergeSettingPatch<Record<string, unknown>>(current, { roles: [], nested: { y: 3 } });
    expect(out).toEqual({ roles: [], nested: { x: 1, y: 3 } });
  });

  it('nimmt den Standardwert als Basis, wenn nichts gespeichert ist', () => {
    const out = mergeSettingPatch(undefined, { claim_de: 'Neu' }, DEFAULT_PUBLIC_SETTINGS.home);
    expect(out).toEqual({ claim_de: 'Neu', claim_en: DEFAULT_PUBLIC_SETTINGS.home.claim_en });
    expect(mergeSettingPatch('kaputt', { a: 1 })).toEqual({ a: 1 });
  });

  it('nennt die geänderten Unterschlüssel', () => {
    expect(changedKeys({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })).toEqual(['b', 'c']);
    expect(changedKeys(null, { a: 1 })).toEqual(['a']);
  });

  it('zwei Formulare für denselben Schlüssel überschreiben sich nicht gegenseitig (Store)', async () => {
    const store = new MemoryStore({});
    // Formular A (Einstellungen) setzt nur den Zustand, Formular B (Texte) nur die Hinweise
    await applySettingPatch(store, 'registration', { state: 'waitlist', free_seats: 0 });
    const { before, after } = await applySettingPatch(store, 'registration', { note_de: 'Warteliste offen', note_en: null });
    expect(before.state).toBe('waitlist');
    expect(after).toMatchObject({ state: 'waitlist', free_seats: 0, note_de: 'Warteliste offen', note_en: null });
    const rows = await store.select('settings', { eq: { key: 'registration' } });
    expect(rows[0]?.is_public).toBe(true);
    expect(parsePublicSettings(rows).registration.free_reserve).toBe(DEFAULT_PUBLIC_SETTINGS.registration.free_reserve);
  });

  it('unveränderte Werte werden nicht neu geschrieben (Stand bleibt stehen)', async () => {
    const store = new MemoryStore({});
    const first = await applySettingPatch(store, 'registration', { state: 'closed' });
    expect(first.changed).toBe(true);
    const [row] = await store.select('settings', { eq: { key: 'registration' } });
    const again = await applySettingPatch(store, 'registration', { state: 'closed', note_de: undefined });
    expect(again.changed).toBe(false);
    const [rowAfter] = await store.select('settings', { eq: { key: 'registration' } });
    expect(rowAfter?.updated_at).toBe(row?.updated_at);
    expect((await applySettingPatch(store, 'registration', { free_seats: 5 })).changed).toBe(true);
  });

  it('private Schlüssel bleiben privat, andere Channels bleiben erhalten', async () => {
    const store = new MemoryStore({});
    await applySettingPatch(store, 'webhooks', { results: 'https://discord.com/api/webhooks/1/a' });
    await applySettingPatch(store, 'webhooks', { graphics: 'https://discord.com/api/webhooks/2/b' });
    const rows = await store.select('settings', { eq: { key: 'webhooks' } });
    expect(rows[0]?.is_public).toBe(false);
    const hooks = parsePrivateSettings(rows).webhooks;
    expect(hooks.results).toBe('https://discord.com/api/webhooks/1/a');
    expect(hooks.graphics).toBe('https://discord.com/api/webhooks/2/b');
    expect(hooks.news).toBeNull();
  });
});

// ---------------------------------------------------------------------------- Discord-Bot

describe('Discord-Bot: Selbstrollen', () => {
  const staffMap = { admin: ['111111111111111111'], steward: ['222222222222222222'], redakteur: [] };
  const ping: SelfRole = { role_id: '333333333333333333', label_de: 'Renntag-Ping', label_en: 'Race day ping' };

  it('prüft Rollen-IDs (nur Ziffern, 17–20 Stellen)', () => {
    expect(isRoleId('12345678901234567')).toBe(true);
    expect(isRoleId('12345678901234567890')).toBe(true);
    expect(isRoleId('1234567890123456')).toBe(false);
    expect(isRoleId('123456789012345678901')).toBe(false);
    expect(isRoleId('12345678901234567a')).toBe(false);
    expect(isRoleId('')).toBe(false);
  });

  it('fügt eine Rolle hinzu, EN fällt auf DE zurück', () => {
    const plan = planSelfRoleUpsert([], { role_id: ' 333333333333333333 ', label_de: '  Renntag-Ping ', label_en: '' }, staffMap);
    expect(plan.errors).toEqual({});
    expect(plan.updated).toBe(false);
    expect(plan.roles).toEqual([{ role_id: '333333333333333333', label_de: 'Renntag-Ping', label_en: 'Renntag-Ping' }]);
  });

  it('bekannte Rollen-ID ändert nur die Bezeichnungen', () => {
    const plan = planSelfRoleUpsert([ping], { role_id: ping.role_id, label_de: 'Ping', label_en: 'Ping EN' }, staffMap);
    expect(plan.updated).toBe(true);
    expect(plan.roles).toEqual([{ role_id: ping.role_id, label_de: 'Ping', label_en: 'Ping EN' }]);
  });

  it('lehnt ungültige IDs, fehlende Bezeichnung und doppelte Namen ab', () => {
    expect(planSelfRoleUpsert([], { role_id: '12', label_de: 'x' }, staffMap).errors.role_id).toMatch(/17–20/);
    expect(planSelfRoleUpsert([], { role_id: '444444444444444444', label_de: '  ' }, staffMap).errors.label_de).toMatch(/fehlt/);
    const dup = planSelfRoleUpsert([ping], { role_id: '444444444444444444', label_de: 'renntag-ping' }, staffMap);
    expect(dup.errors.label_de).toMatch(/gibt es schon/);
    expect(dup.roles).toEqual([ping]);
    expect(planSelfRoleUpsert([], { role_id: '444444444444444444', label_de: 'x'.repeat(61) }, staffMap).errors.label_de).toMatch(/höchstens/);
  });

  it('Staff-Rollen sind nie selbst vergebbar', () => {
    const plan = planSelfRoleUpsert([], { role_id: '111111111111111111', label_de: 'Admin' }, staffMap);
    expect(plan.errors.role_id).toMatch(/Rechte im Admin-Bereich/);
    expect(selfRolesWithStaffRights([ping, { ...ping, role_id: '222222222222222222' }], staffMap).map((r) => r.role_id)).toEqual([
      '222222222222222222',
    ]);
  });

  it('begrenzt auf die Größe einer Discord-Auswahl', () => {
    const many = Array.from({ length: MAX_SELF_ROLES }, (_, i) => ({ role_id: `40000000000000${String(i).padStart(4, '0')}`, label_de: `R${i}`, label_en: `R${i}` }));
    expect(planSelfRoleUpsert(many, { role_id: '555555555555555555', label_de: 'Neu' }, staffMap).errors.role_id).toMatch(/Höchstens/);
    // Umbenennen geht auch bei voller Liste
    expect(planSelfRoleUpsert(many, { role_id: many[0]!.role_id, label_de: 'Umbenannt' }, staffMap).errors).toEqual({});
  });

  it('entfernt Rollen', () => {
    expect(planSelfRoleRemove([ping], ping.role_id)).toEqual({ roles: [], removed: ping });
    expect(planSelfRoleRemove([ping], '999999999999999999')).toEqual({ roles: [ping], removed: null });
  });

  it('Interactions-Endpunkt unter der Website-Adresse', () => {
    expect(interactionsEndpoint('https://liga.example')).toBe('https://liga.example/api/discord/interactions');
    expect(interactionsEndpoint('https://liga.example/irgendwo/')).toBe('https://liga.example/api/discord/interactions');
  });
});
