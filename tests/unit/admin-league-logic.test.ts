import { describe, expect, it } from 'vitest';
import { auditChanges, formatAuditValue } from '~/lib/admin/league/audit-view';
import { safeNext } from '~/lib/admin/league/auth';
import { batchDates, parseTrackList, planSessions, sessionTypesFor, splitLocalStart, weekdayOf } from '~/lib/admin/league/calendar';
import { bestTextColor, contrastRatio, contrastReport } from '~/lib/admin/league/color';
import { formatHoursLeft, missingTranslations, protestDeadlines } from '~/lib/admin/league/dashboard';
import { confirmsGamertag, driverSlug, planAcceptRegistration, pseudonymizedDriverPatch } from '~/lib/admin/league/drivers';
import {
  isDiscordWebhookUrl,
  isGaMeasurementId,
  isIsoDate,
  maskSecret,
  paginate,
  parseIntList,
  parseSnowflakes,
  parseTwitchChannel,
  normalizeHex,
  uniqueName,
} from '~/lib/admin/league/forms';
import { lobbyFromFields, parseLobbyJson } from '~/lib/admin/league/lobby';
import { nextRoundStart, planNumberAssign, planNumberChange, planNumberRelease } from '~/lib/admin/league/numbers';
import { championAwards, isSeasonFrozen, nextSeasonNumber, openRoundsBeforeFinish, planSeasonClone } from '~/lib/admin/league/season';
import { findSeatConflicts, planSeatChange, roundRangeLabel } from '~/lib/admin/league/seats';
import type { DriverNumberRow, RegistrationRow, RoundRow, SeasonRow, SeatRow, TrackRow } from '~/lib/db/types';

const TS = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

describe('Formular-Helfer', () => {
  it('liest Punktelisten mit verschiedenen Trennern', () => {
    expect(parseIntList('25, 18;15 12\n10')).toEqual({ values: [25, 18, 15, 12, 10], error: null });
    expect(parseIntList('')).toEqual({ values: [], error: null });
    expect(parseIntList('', { allowEmpty: false }).error).toMatch(/mindestens/);
    expect(parseIntList('25, x').error).toMatch(/keine ganze Zahl/);
    expect(parseIntList('-1').error).toMatch(/zwischen/);
  });

  it('normalisiert Hex-Farben', () => {
    expect(normalizeHex('#ff8000')).toBe('#FF8000');
    expect(normalizeHex('abc')).toBe('#AABBCC');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('rot')).toBeNull();
  });

  it('prüft Datum, GA-ID, Webhooks und Discord-IDs', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isGaMeasurementId('G-AB12CD34EF')).toBe(true);
    expect(isGaMeasurementId('UA-12345-1')).toBe(false);
    expect(isDiscordWebhookUrl('https://discord.com/api/webhooks/123456789012345678/abc-DEF_1')).toBe(true);
    expect(isDiscordWebhookUrl('https://canary.discord.com/api/webhooks/1/x')).toBe(true);
    expect(isDiscordWebhookUrl('http://discord.com/api/webhooks/1/x')).toBe(false);
    expect(isDiscordWebhookUrl('https://evil.example/api/webhooks/1/x')).toBe(false);
    expect(parseSnowflakes('123456789012345678, 123456789012345678\nabc')).toEqual({ ids: ['123456789012345678'], invalid: ['abc'] });
  });

  it('maskiert Webhook-URLs und liest Twitch-Kanäle', () => {
    expect(maskSecret('https://discord.com/api/webhooks/123/abcdefghijkl')).toBe('https://discord.com/api/webhooks/…ijkl');
    expect(maskSecret(null)).toBe('');
    expect(parseTwitchChannel('https://www.twitch.tv/Liga_Kanal')).toEqual({ channel: 'liga_kanal', error: null });
    expect(parseTwitchChannel('a b').error).not.toBeNull();
    expect(parseTwitchChannel('')).toEqual({ channel: null, error: null });
  });

  it('erzeugt eindeutige Namen und blättert', () => {
    expect(uniqueName('F1 aktuell', ['f1 aktuell', 'F1 aktuell (2)'])).toBe('F1 aktuell (3)');
    const p = paginate([1, 2, 3, 4, 5], 3, 2);
    expect(p).toEqual({ items: [5], page: 3, pages: 3, total: 5 });
    expect(paginate([], 5, 10).page).toBe(1);
  });
});

describe('Kontrast', () => {
  it('rechnet WCAG-Kontraste', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(bestTextColor('#FF8000')).toBe('#000000');
    expect(bestTextColor('#3671C6')).toBe('#FFFFFF');
    const r = contrastReport('#E8002D', '#FFFFFF')!;
    expect(r.textOk).toBe(true);
    expect(contrastReport('#FFFF00', '#FFFFFF')!.textOk).toBe(false);
    expect(contrastReport('nope', '#FFFFFF')).toBeNull();
  });
});

describe('Login-Weiterleitung', () => {
  it('erlaubt nur relative /admin-Pfade', () => {
    expect(safeNext('/admin/saisons?x=1')).toBe('/admin/saisons?x=1');
    expect(safeNext('/admin')).toBe('/admin');
    expect(safeNext('//evil.example/admin')).toBe('/admin');
    expect(safeNext('https://evil.example/admin')).toBe('/admin');
    expect(safeNext('/administrator')).toBe('/admin');
    expect(safeNext('/admin\\..\\evil')).toBe('/admin');
    expect(safeNext('%2F%2Fevil.example')).toBe('/admin');
    expect(safeNext('/admin/login?next=/admin')).toBe('/admin');
    expect(safeNext('/fahrer')).toBe('/admin');
    expect(safeNext(null)).toBe('/admin');
  });
});

const season = (over: Partial<SeasonRow> = {}): SeasonRow => ({
  id: 1,
  number: 1,
  slug: '1',
  name: 'Saison 1',
  game_version: 'F1 25',
  status: 'finished',
  points_scheme_id: 2,
  reserve_points_for_constructors: false,
  protest_window_hours: 36,
  two_steward_rule: true,
  penalty_points_enabled: false,
  lobby_settings: { groups: [{ key: 'lobby', title_de: 'Lobby', items: [] }] },
  rules_version_id: 1,
  starts_on: '2026-01-01',
  ends_on: '2026-03-01',
  ...TS,
  ...over,
});

const seat = (id: number, team: number, no: 1 | 2, driver: number, from = 1, to: number | null = null, seasonId = 1): SeatRow => ({
  id,
  season_id: seasonId,
  team_id: team,
  seat_no: no,
  driver_id: driver,
  from_round: from,
  to_round: to,
  ...TS,
});

describe('Saisons', () => {
  it('friert abgeschlossene Saisons ein', () => {
    expect(isSeasonFrozen({ status: 'finished' })).toBe(true);
    expect(isSeasonFrozen({ status: 'active' })).toBe(false);
    expect(isSeasonFrozen(undefined)).toBe(false);
    expect(nextSeasonNumber([{ number: 1 }, { number: 3 }])).toBe(4);
  });

  it('klont Einstellungen, Teams und die Cockpits zum Saisonende', () => {
    const teams = [
      { season_id: 1, team_id: 5, sort_order: 1, ...TS },
      { season_id: 1, team_id: 3, sort_order: 0, ...TS },
    ];
    const seats = [
      seat(1, 3, 1, 10, 1, 2),
      seat(2, 3, 1, 11, 3, null),
      seat(3, 3, 2, 12),
      seat(4, 5, 1, 13),
      seat(5, 5, 2, 14, 1, 4), // zum Saisonende leer
    ];
    const drivers = [10, 11, 12, 13, 14].map((id) => ({ id, status: id === 13 ? ('inactive' as const) : ('active' as const), anonymized: false }));
    const plan = planSeasonClone(season(), teams, seats, drivers, {
      number: 2,
      name: 'Saison 2',
      slug: '2',
      game_version: 'F1 25 · Pack',
      copySeats: true,
    });
    expect(plan.season).toMatchObject({
      status: 'planned',
      points_scheme_id: 2,
      reserve_points_for_constructors: false,
      protest_window_hours: 36,
      two_steward_rule: true,
      rules_version_id: 1,
      number: 2,
    });
    expect(plan.season.lobby_settings.groups?.[0]?.key).toBe('lobby');
    expect(plan.seasonTeams).toEqual([
      { team_id: 3, sort_order: 0 },
      { team_id: 5, sort_order: 1 },
    ]);
    expect(plan.seats.map((s) => [s.team_id, s.seat_no, s.driver_id, s.from_round])).toEqual([
      [3, 1, 11, 1],
      [3, 2, 12, 1],
    ]);
    expect(plan.skippedSeats.map((s) => s.driver_id).sort()).toEqual([13, 14]);
    const without = planSeasonClone(season(), teams, seats, drivers, { number: 2, name: 'S2', slug: '2', game_version: 'x', copySeats: false, rules_version_id: 7 });
    expect(without.seats).toEqual([]);
    expect(without.season.rules_version_id).toBe(7);
  });

  it('erzeugt Champion-Auszeichnungen und findet offene Runden', () => {
    expect(championAwards(2, 7, 3)).toEqual([
      { season_id: 2, round_id: null, type: 'champion', driver_id: 7, team_id: null },
      { season_id: 2, round_id: null, type: 'constructors', driver_id: null, team_id: 3 },
    ]);
    expect(championAwards(2, null, null)).toEqual([]);
    expect(
      openRoundsBeforeFinish([
        { number: 2, status: 'provisional' },
        { number: 1, status: 'final' },
        { number: 3, status: 'cancelled' },
        { number: 4, status: 'scheduled' },
      ]),
    ).toEqual([2, 4]);
  });
});

describe('Lobby-Einstellungen', () => {
  it('prüft JSON mit verständlichen Fehlern', () => {
    expect(parseLobbyJson('{').errors[0]).toMatch(/Kein gültiges JSON/);
    expect(parseLobbyJson('[]').errors[0]).toMatch(/JSON-Objekt/);
    const bad = parseLobbyJson(JSON.stringify({ groups: [{ title_de: '', items: [{ label_de: 'A' }] }], extra: 1 }));
    expect(bad.errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/Unbekanntes Feld/), expect.stringMatching(/title_de/), expect.stringMatching(/value_de/)]),
    );
    const ok = parseLobbyJson(
      JSON.stringify({ groups: [{ title_de: 'Fahrhilfen', items: [{ label_de: 'ABS', value_de: 'Aus', value_en: 'Off' }] }], join_steps_de: ['Eins', ' '] }),
    );
    expect(ok.errors).toEqual([]);
    expect(ok.value?.groups?.[0]).toMatchObject({ key: 'fahrhilfen', title_en: null, items: [{ label_en: null, value_en: 'Off' }] });
    expect(ok.value?.join_steps_de).toEqual(['Eins']);
  });

  it('liest die einfache Formular-Oberfläche', () => {
    const fields = new Map<string, string>([
      ['g0.key', 'lobby'],
      ['g0.title_de', 'Lobby'],
      ['g0.title_en', 'Lobby'],
      ['g0.i0.label_de', 'Crossplay'],
      ['g0.i0.value_de', 'An'],
      ['g0.i0.label_en', 'Crossplay'],
      ['g0.i0.value_en', 'On'],
      ['g0.i1.label_de', ''],
      ['g0.i1.value_de', ''],
      ['g0.i2.label_de', 'Weg'],
      ['g0.i2.value_de', 'damit'],
      ['g0.i2.remove', 'on'],
      ['g1.title_de', 'Wetter'],
      ['g1.i0.label_de', 'Wetter'],
      ['g1.i0.value_de', 'Dynamisch'],
      ['g2.title_de', ''],
      ['g2.i0.label_de', ''],
      ['join_steps_de', 'Discord öffnen\n\nLobby beitreten'],
    ]);
    const res = lobbyFromFields(fields);
    expect(res.errors).toEqual([]);
    expect(res.value?.groups).toHaveLength(2);
    expect(res.value?.groups?.[0]?.items).toHaveLength(1);
    expect(res.value?.groups?.[1]?.key).toBe('wetter');
    expect(res.value?.join_steps_de).toEqual(['Discord öffnen', 'Lobby beitreten']);
  });
});

describe('Kalender', () => {
  it('liefert Sessions je Format und plant Formatwechsel', () => {
    expect(sessionTypesFor('sprint')).toEqual(['qualifying', 'sprint', 'race']);
    const existing = [
      { id: 1, type: 'qualifying' as const },
      { id: 2, type: 'sprint' as const },
      { id: 3, type: 'race' as const },
    ];
    expect(planSessions(existing, 'standard', new Set())).toEqual({ create: [], remove: [2], keptWithResults: [] });
    expect(planSessions(existing, 'standard', new Set([2]))).toEqual({ create: [], remove: [], keptWithResults: ['sprint'] });
    expect(planSessions([{ id: 1, type: 'qualifying' }], 'sprint', new Set()).create).toEqual(['sprint', 'race']);
  });

  it('erzeugt Stapel-Termine ab dem nächsten Wochentag', () => {
    // 2026-10-01 ist ein Donnerstag
    expect(weekdayOf('2026-10-01')).toBe(4);
    expect(batchDates({ startDate: '2026-10-01', weekday: 3, intervalDays: 7, time: '20:00', count: 3 })).toEqual([
      '2026-10-07T20:00:00',
      '2026-10-14T20:00:00',
      '2026-10-21T20:00:00',
    ]);
    expect(
      batchDates({ startDate: '2026-12-16', weekday: null, intervalDays: 7, time: '19:30', count: 3, skipDates: ['2026-12-23', '2026-12-30'] }),
    ).toEqual(['2026-12-16T19:30:00', '2027-01-06T19:30:00', '2027-01-13T19:30:00']);
    expect(() => batchDates({ startDate: 'x', weekday: null, intervalDays: 7, time: '20:00', count: 1 })).toThrow();
    expect(splitLocalStart('2026-11-05T20:00:00')).toEqual({ date: '2026-11-05', time: '20:00' });
  });

  it('liest Streckenlisten mit Sprint-Markierung', () => {
    const tracks = [
      { id: 1, slug: 'suzuka', name_de: 'Suzuka', name_en: 'Suzuka' },
      { id: 2, slug: 'mexico-city', name_de: 'Mexiko-Stadt', name_en: 'Mexico City' },
      { id: 3, slug: 'sao-paulo', name_de: 'São Paulo', name_en: 'São Paulo' },
    ] as TrackRow[];
    const res = parseTrackList('suzuka\nMexico City *\n\nsao paulo\nNirgendwo', tracks);
    expect(res.items.map((i) => [i.track?.id ?? null, i.format])).toEqual([
      [1, 'standard'],
      [2, 'sprint'],
      [3, 'standard'],
      [null, 'standard'],
    ]);
    expect(res.unknown).toEqual(['Zeile 5: „Nirgendwo“']);
  });
});

const num = (id: number, driver: number, n: number, from: string, to: string | null = null): DriverNumberRow => ({
  id,
  driver_id: driver,
  number: n,
  valid_from: from,
  valid_to: to,
  note: null,
  ...TS,
});

describe('Startnummern', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const numbers = [num(1, 1, 44, '2026-01-01T00:00:00Z'), num(2, 2, 16, '2026-01-01T00:00:00Z'), num(3, 3, 7, '2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z')];

  it('findet den Start des nächsten Rennens', () => {
    const rounds = [
      { status: 'final', start_utc: '2026-09-20T18:00:00Z' },
      { status: 'scheduled', start_utc: '2026-10-15T18:00:00Z' },
      { status: 'lineup_published', start_utc: '2026-10-08T18:00:00Z' },
      { status: 'cancelled', start_utc: '2026-10-02T18:00:00Z' },
    ] as RoundRow[];
    expect(nextRoundStart(rounds, now)).toBe('2026-10-08T18:00:00Z');
    expect(nextRoundStart([], now)).toBeNull();
  });

  it('vergibt freie Nummern und lehnt belegte ab', () => {
    expect(planNumberAssign(4, 7, numbers, now).ops).toHaveLength(1); // 7 wurde freigegeben
    expect(planNumberAssign(4, 16, numbers, now).error).toMatch(/bereits vergeben/);
    expect(planNumberAssign(1, 9, numbers, now).error).toMatch(/bereits eine Nummer/);
    expect(planNumberAssign(4, 100, numbers, now).error).toMatch(/1 bis 99/);
  });

  it('wechselt ab dem nächsten Rennen und passt vorgemerkte Wechsel an', () => {
    const plan = planNumberChange(1, 4, numbers, '2026-10-08T18:00:00Z', now);
    expect(plan.error).toBeNull();
    expect(plan.ops).toEqual([
      { kind: 'close', id: 1, valid_to: '2026-10-08T18:00:00Z' },
      { kind: 'insert', row: { driver_id: 1, number: 4, valid_from: '2026-10-08T18:00:00Z', valid_to: null, note: null } },
    ]);
    // ohne nächstes Rennen: sofort
    expect(planNumberChange(1, 4, numbers, null, now).effectiveFrom).toBe(now.toISOString());
    expect(planNumberChange(1, 44, numbers, null, now).error).toMatch(/bereits mit der 44/);
    expect(planNumberChange(1, 16, numbers, null, now).error).toMatch(/vergeben/);

    const withPending = [...numbers.map((n) => (n.id === 1 ? { ...n, valid_to: '2026-10-08T18:00:00Z' } : n)), num(9, 1, 4, '2026-10-08T18:00:00Z')];
    expect(planNumberChange(1, 5, withPending, '2026-10-08T18:00:00Z', now).ops).toEqual([{ kind: 'update', id: 9, number: 5, note: null }]);
    expect(planNumberChange(1, 44, withPending, '2026-10-08T18:00:00Z', now).ops).toEqual([
      { kind: 'delete', id: 9 },
      { kind: 'reopen', id: 1 },
    ]);
    expect(planNumberChange(1, 4, withPending, null, now).error).toMatch(/bereits vorgemerkt/);
  });

  it('gibt Nummern nur bei inaktiven Fahrern frei', () => {
    expect(planNumberRelease({ id: 1, status: 'active', anonymized: false }, numbers, now).error).toMatch(/inaktiven/);
    expect(planNumberRelease({ id: 1, status: 'inactive', anonymized: false }, numbers, now).ops).toEqual([
      { kind: 'close', id: 1, valid_to: now.toISOString() },
    ]);
    expect(planNumberRelease({ id: 3, status: 'inactive', anonymized: false }, numbers, now).error).toMatch(/keine aktive/);
  });
});

describe('Cockpits', () => {
  const seats = [seat(1, 3, 1, 10), seat(2, 3, 2, 11), seat(3, 4, 1, 12), seat(4, 4, 2, 13, 1, 2)];

  it('plant Transfers „gültig ab Runde X“', () => {
    const plan = planSeatChange(seats, { season_id: 1, team_id: 3, seat_no: 1, driver_id: 20, from_round: 4, releaseOtherSeat: false });
    expect(plan.error).toBeNull();
    expect(plan.updates).toEqual([{ id: 1, to_round: 3 }]);
    expect(plan.insert).toMatchObject({ team_id: 3, seat_no: 1, driver_id: 20, from_round: 4, to_round: null });
    // ab Runde 1 ersetzt den bisherigen Eintrag komplett
    expect(planSeatChange(seats, { season_id: 1, team_id: 3, seat_no: 1, driver_id: 20, from_round: 1, releaseOtherSeat: false }).deletes).toEqual([1]);
  });

  it('verhindert Doppelbelegungen oder gibt das alte Cockpit frei', () => {
    const blocked = planSeatChange(seats, { season_id: 1, team_id: 4, seat_no: 2, driver_id: 10, from_round: 3, releaseOtherSeat: false });
    expect(blocked.error).toMatch(/bereits in einem anderen Cockpit/);
    expect(blocked.insert).toBeNull();
    const moved = planSeatChange(seats, { season_id: 1, team_id: 4, seat_no: 2, driver_id: 10, from_round: 3, releaseOtherSeat: true });
    expect(moved.error).toBeNull();
    expect(moved.updates).toEqual([{ id: 1, to_round: 2 }]);
    expect(moved.notes).toHaveLength(1);
    // vor dem Ende des alten Eintrags in Cockpit 4/2 (R1–R2) → kein Konflikt mit Fahrer 13
    expect(planSeatChange(seats, { season_id: 1, team_id: 3, seat_no: 1, driver_id: 10, from_round: 1, releaseOtherSeat: false }).error).toMatch(
      /bereits in diesem Cockpit/,
    );
    expect(planSeatChange(seats, { season_id: 1, team_id: 4, seat_no: 2, driver_id: null, from_round: 5, releaseOtherSeat: false }).error).toMatch(
      /bereits leer/,
    );
  });

  it('findet Konflikte in einer Aufstellung', () => {
    const conflicts = findSeatConflicts([...seats, seat(5, 5, 1, 10, 2, null)]);
    expect(conflicts.drivers).toHaveLength(1);
    expect(conflicts.slots).toHaveLength(0);
    expect(roundRangeLabel({ from_round: 3, to_round: null })).toBe('ab R3');
    expect(roundRangeLabel({ from_round: 1, to_round: 2 })).toBe('R1–R2');
  });
});

describe('Fahrer', () => {
  it('erzeugt eindeutige Slugs und Pseudonyme', () => {
    expect(driverSlug('Max Müller', ['max-mueller'])).toBe('max-mueller-2');
    expect(driverSlug('Max Müller', ['max-mueller'], 'max-mueller')).toBe('max-mueller');
    const patch = pseudonymizedDriverPatch({ id: 12, slug: 'turbo-tobi' }, ['turbo-tobi', 'ehemaliger-fahrer-12']);
    expect(patch).toMatchObject({ gamertag: 'Ehemaliger Fahrer #12', slug: 'ehemaliger-fahrer-12-2', anonymized: true, show_links: false, status: 'inactive' });
    expect(confirmsGamertag(' turbo_TOBI ', 'Turbo_Tobi')).toBe(true);
    expect(confirmsGamertag('', 'Turbo_Tobi')).toBe(false);
  });

  it('plant „Annehmen“ einer Anmeldung', () => {
    const reg: RegistrationRow = {
      id: 5,
      gamertag: ' Newcomer_Nele ',
      discord_username: 'nele',
      ea_id: 'NeleEA',
      platform: 'playstation',
      input_device: 'wheel',
      nationality: 'de',
      desired_number: 42,
      wanted_role: 'any',
      availability: 'regular',
      experience: null,
      reference_time: null,
      consents: { age16: true, rules: true, at: '2026-09-01T00:00:00Z', rules_version: '1.0' },
      status: 'new',
      admin_notes: 'Nett',
      ip_hash: null,
      driver_id: null,
      processed_by: null,
      processed_at: null,
      ...TS,
    };
    const ctx = {
      drivers: [{ id: 1, slug: 'newcomer-nele', gamertag: 'Alt', anonymized: false, reserve_order: 3 }],
      numbers: [num(1, 1, 42, '2026-01-01T00:00:00Z')],
      seasons: [
        { id: 1, status: 'finished' as const, number: 1 },
        { id: 2, status: 'active' as const, number: 2 },
      ],
      now: new Date('2026-10-01T00:00:00Z'),
    };
    const plan = planAcceptRegistration(reg, ctx);
    expect(plan.error).toBeNull();
    expect(plan.driver).toMatchObject({ gamertag: 'Newcomer_Nele', slug: 'newcomer-nele-2', status: 'reserve', reserve_order: 4, joined_season_id: 2, nationality_code: 'DE' });
    expect(plan.private).toMatchObject({ discord_username: 'nele', ea_id: 'NeleEA' });
    expect(plan.number).toBeNull();
    expect(plan.warnings[0]).toMatch(/Wunschnummer 42/);
    const free = planAcceptRegistration({ ...reg, desired_number: 43 }, ctx);
    expect(free.number).toBe(43);
    const dup = planAcceptRegistration({ ...reg, gamertag: 'alt' }, ctx);
    expect(dup.error).toMatch(/bereits einen Fahrer/);
  });
});

describe('Dashboard', () => {
  it('zählt fehlende Übersetzungen', () => {
    const res = missingTranslations({
      news: [
        { title_de: 'A', title_en: null, excerpt_de: '', excerpt_en: null, body_de: 'x', body_en: null, status: 'published' },
        { title_de: 'Entwurf', title_en: null, excerpt_de: '', excerpt_en: null, body_de: 'x', body_en: null, status: 'draft' },
        { title_de: 'B', title_en: 'B', excerpt_de: '', excerpt_en: null, body_de: 'x', body_en: 'y', status: 'published' },
      ],
      faq: [{ question_de: 'F?', question_en: 'Q?', answer_de: 'A', answer_en: '' }],
      rulesVersions: [
        { id: 1, status: 'archived' },
        { id: 2, status: 'published' },
      ],
      rulesSections: [
        { version_id: 1, number: '§1', title_de: 'Alt', title_en: null, body_de: 'x', body_en: null },
        { version_id: 2, number: '§1', title_de: 'Neu', title_en: 'New', body_de: 'x', body_en: null },
      ],
      positions: [{ title_de: 'Steward', title_en: null, description_de: 'x', description_en: null, active: false }],
      partners: [{ name: 'P', text_de: 'x', text_en: null, active: true }],
      staff: [{ gamertag: 'Rene', role_de: 'Leitung', role_en: 'Director' }],
    });
    expect(res.map((r) => [r.kind, r.count])).toEqual([
      ['news', 1],
      ['faq', 1],
      ['rules', 1],
      ['partners', 1],
    ]);
  });

  it('sortiert Protestfristen und formatiert Restzeiten', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    const base = { status: 'provisional' } as RoundRow;
    const list = protestDeadlines(
      [
        { ...base, id: 1, protest_deadline: '2026-10-03T12:00:00Z' },
        { ...base, id: 2, protest_deadline: '2026-10-01T10:00:00Z' },
        { ...base, id: 3, status: 'final', protest_deadline: null },
      ],
      now,
    );
    expect(list.map((p) => [p.round.id, p.state])).toEqual([
      [2, 'expired'],
      [1, 'open'],
    ]);
    expect(formatHoursLeft(5.2)).toBe('noch 5 Std.');
    expect(formatHoursLeft(72)).toBe('noch 3 Tage');
    expect(formatHoursLeft(-2)).toBe('seit 2 Std. abgelaufen');
    expect(formatHoursLeft(-96)).toBe('seit 4 Tagen abgelaufen');
    expect(formatHoursLeft(0.25)).toBe('noch 15 Min.');
  });
});

describe('Audit-Log', () => {
  it('bereitet Vorher/Nachher lesbar auf', () => {
    expect(auditChanges({ before: { name: 'A', updated_at: 'x' }, after: { name: 'B', updated_at: 'y' } })).toEqual([
      { field: 'name', before: 'A', after: 'B' },
    ]);
    expect(auditChanges({ before: null, after: { active: true } })).toEqual([{ field: 'active', before: '–', after: 'ja' }]);
    expect(auditChanges(null)).toEqual([]);
    expect(formatAuditValue({ a: 1 })).toBe('{"a":1}');
    expect(formatAuditValue('x'.repeat(300))).toHaveLength(160);
  });
});
