/**
 * Import-Zuordnung (Plan §5.2 „Zuordnung über Startnummer“), Spielstatus-Übersetzung,
 * Normalisierung der Telemetrie, Session-Zuordnung (±36 h) und Import-Token.
 */
import { describe, expect, it } from 'vitest';
import { gameSessionKind, mapGameResultStatus } from '~/lib/import/game';
import { mapImport, sortWarnings, type MapContext } from '~/lib/import/map';
import { telemetryPayloadSchema, type TelemetryResult } from '~/lib/import/payload';
import { resolveImportSession, type ResolveInput } from '~/lib/import/resolve';
import { normalizeTelemetry, type ImportRow } from '~/lib/import/rows';
import { bearerToken, generateImportToken, sha256Hex, timingSafeEqual, TOKEN_PREFIX, verifyImportToken } from '~/lib/import/token';

const row = (over: Partial<ImportRow>): ImportRow => ({
  line: 1,
  position: 1,
  raceNumber: null,
  name: null,
  status: 'classified',
  statusNote: null,
  gridPosition: null,
  laps: null,
  bestLapMs: null,
  totalTimeMs: null,
  pitStops: null,
  penaltyS: 0,
  lapsDown: null,
  gapMs: null,
  ai: false,
  gameTeamId: null,
  ...over,
});

const ctx = (over: Partial<MapContext> = {}): MapContext => ({
  sessionType: 'race',
  lineupSource: 'round',
  entries: [
    { id: 101, driver_id: 1, team_id: 10, role: 'regular', race_number: 4 },
    { id: 102, driver_id: 2, team_id: 10, role: 'regular', race_number: 77 },
    { id: 103, driver_id: 3, team_id: 20, role: 'reserve', race_number: 24 },
    { id: 104, driver_id: 5, team_id: 20, role: 'regular', race_number: null },
  ],
  numberHolders: [
    { number: 4, driverId: 1 },
    { number: 77, driverId: 2 },
    { number: 24, driverId: 3 },
    { number: 55, driverId: 5 },
    { number: 16, driverId: 9 },
  ],
  driverNames: { 1: 'ApexAnna', 2: 'KerbKiller77', 3: 'Reserve_Rico', 5: 'DRS_Dani', 9: 'LateBrakeLukas' },
  teamGameIds: { 10: 8, 20: 1 },
  ...over,
});

const codes = (w: Array<{ code: string }>) => w.map((x) => x.code);

describe('mapImport', () => {
  it('ordnet über die Startnummer zu und übernimmt Team, Rolle und Eintrag der Aufstellung', () => {
    const res = mapImport(
      [
        row({ line: 1, position: 1, raceNumber: 24, name: 'Rico', bestLapMs: 76_543, totalTimeMs: 1_900_000, laps: 25, gridPosition: 3, pitStops: 1, penaltyS: 5 }),
        row({ line: 2, position: 2, raceNumber: 4, laps: 25, totalTimeMs: 1_905_000 }),
        row({ line: 3, position: 3, raceNumber: 77, laps: 24, totalTimeMs: 1_880_000 }),
        row({ line: 4, position: 4, raceNumber: 55, status: 'dnf', laps: 10 }),
      ],
      ctx(),
    );
    expect(res.matched).toBe(4);
    expect(res.rows[0]).toMatchObject({
      driverId: 3,
      teamId: 20,
      role: 'reserve',
      roundEntryId: 103,
      raceNumber: 24,
      status: 'classified',
      gridPosition: 3,
      laps: 25,
      bestLap: '1:16.543',
      totalTime: '31:40.000',
      gapLaps: null,
      pitStops: 1,
      ingamePenaltyS: 5,
    });
    // überrundet: Rückstand aus den Runden
    expect(res.rows[2]).toMatchObject({ driverId: 2, gapLaps: 1 });
    // Nummer 55 steht nicht in der Aufstellung (race_number null), gehört aber DRS_Dani → Eintrag über den Fahrer
    expect(res.rows[3]).toMatchObject({ driverId: 5, roundEntryId: 104, raceNumber: 55, status: 'dnf', gapLaps: null });
    expect(res.warnings).toEqual([]);
    expect(res.missing).toEqual([]);
  });

  it('KI-Autos: ohne Treffer ignoriert, mit Treffer übernommen + Warnung', () => {
    const res = mapImport(
      [row({ line: 1, raceNumber: 2, ai: true, name: 'KI' }), row({ line: 2, raceNumber: 4, ai: true }), row({ line: 3, raceNumber: null, ai: true })],
      ctx(),
    );
    expect(res.rows.map((r) => r.driverId)).toEqual([1]);
    expect(codes(res.warnings)).toEqual(expect.arrayContaining(['ai_ignored', 'ai_driven']));
    expect(res.warnings.filter((w) => w.code === 'ai_ignored')).toHaveLength(2);
  });

  it('unbekannte, fehlende und doppelte Nummern', () => {
    const res = mapImport(
      [
        row({ line: 1, raceNumber: 99, name: 'Gast' }),
        row({ line: 2, raceNumber: null, name: 'Player' }),
        row({ line: 3, raceNumber: 4, name: 'A' }),
        row({ line: 4, raceNumber: 4, name: 'B' }),
        row({ line: 5, raceNumber: 77, name: 'Kerb' }),
        row({ line: 6, raceNumber: 77, name: 'KI', ai: true }),
      ],
      ctx(),
    );
    expect(codes(res.warnings)).toEqual(expect.arrayContaining(['unknown_number', 'no_number', 'duplicate_number', 'ai_ignored', 'missing']));
    // #4 doppelt (zwei Menschen) → nicht eindeutig; #77 Mensch gewinnt gegen KI
    expect(res.rows.map((r) => r.driverId)).toEqual([2]);
    expect(res.lines.find((l) => l.line === 5)!.driverId).toBe(2);
    expect(res.lines.find((l) => l.line === 3)!.driverId).toBeNull();
    expect(res.missing).toEqual([1, 3, 5]);
  });

  it('Nummer gehört einem Fahrer außerhalb der Aufstellung → nicht zugeordnet mit Hinweis auf den Grid-Builder', () => {
    const res = mapImport([row({ raceNumber: 16, name: 'Lukas' })], ctx());
    expect(res.rows).toEqual([]);
    expect(res.warnings[0]).toMatchObject({ code: 'not_in_lineup' });
    expect(res.warnings[0]!.message).toMatch(/LateBrakeLukas steht nicht in der Aufstellung.*Grid-Builder/);
  });

  it('gleicher Fahrer zweimal (Nummer aus Aufstellung + Nummernhistorie) → zweite Zeile übersprungen', () => {
    const c = ctx({ numberHolders: [{ number: 44, driverId: 1 }] });
    const res = mapImport([row({ line: 1, raceNumber: 4 }), row({ line: 2, raceNumber: 44 })], c);
    expect(res.rows).toHaveLength(1);
    expect(codes(res.warnings)).toContain('duplicate_driver');
  });

  it('abweichendes Team im Spiel: zusammengefasste Warnung, generische Teams (≥ 41) nicht', () => {
    const one = mapImport([row({ raceNumber: 4, gameTeamId: 1 }), row({ raceNumber: 77, gameTeamId: 8 }), row({ raceNumber: 24, gameTeamId: 104 })], ctx());
    const w = one.warnings.filter((x) => x.code === 'team_mismatch');
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toMatch(/^#4 ApexAnna fuhr im Spiel/);
    const many = mapImport([row({ raceNumber: 4, gameTeamId: 1 }), row({ raceNumber: 77, gameTeamId: 1 })], ctx());
    expect(many.warnings.find((x) => x.code === 'team_mismatch')!.message).toMatch(/^2 Fahrer fuhren/);
  });

  it('Status-Hinweise und übersprungene Zeilen erscheinen als Warnung', () => {
    const res = mapImport([row({ raceNumber: 4, statusNote: 'bitte prüfen' })], ctx(), ['P9 #3: ungültig']);
    expect(codes(res.warnings)).toEqual(expect.arrayContaining(['status_note', 'skipped']));
  });

  it('Qualifying: keine Renn-Felder', () => {
    const res = mapImport([row({ raceNumber: 4, laps: 3, gridPosition: 5, totalTimeMs: 1000, pitStops: 1, penaltyS: 3, bestLapMs: 75_000 })], ctx({ sessionType: 'qualifying' }));
    expect(res.rows[0]).toMatchObject({ laps: null, gridPosition: null, totalTime: '', pitStops: null, ingamePenaltyS: 0, bestLap: '1:15.000' });
  });

  it('Saisonaufstellung als Grundlage → Hinweis ganz vorn', () => {
    const res = mapImport([row({ raceNumber: 99 })], ctx({ lineupSource: 'season' }));
    expect(sortWarnings(res.warnings)[0]!.code).toBe('no_lineup');
  });

  it('viele fehlende Fahrer → eine zusammengefasste Warnung', () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({ id: 200 + i, driver_id: 30 + i, team_id: 10, role: 'regular' as const, race_number: 60 + i }));
    const res = mapImport([row({ raceNumber: 60 })], ctx({ entries }));
    const missing = res.warnings.filter((w) => w.code === 'missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]!.message).toMatch(/^5 Fahrer der Aufstellung fehlen im Import: #61 Fahrer #31/);
    expect(res.missing).toHaveLength(5);
  });

  it('CSV „+1 Runde“ wird zum Rundenrückstand', () => {
    const res = mapImport([row({ raceNumber: 4, lapsDown: 2 })], ctx());
    expect(res.rows[0]).toMatchObject({ gapLaps: 2, totalTime: '' });
  });

  it('CSV-Abstand „+3.664“ landet im Abstandsfeld, nicht in der Gesamtzeit', () => {
    const res = mapImport([row({ raceNumber: 4, gapMs: 3_664 }), row({ line: 2, position: 2, raceNumber: 77, gapMs: 65_200 })], ctx());
    expect(res.rows[0]).toMatchObject({ gap: '3.664', totalTime: '', gapLaps: null });
    expect(res.rows[1]).toMatchObject({ gap: '1:05.200' });
    // im Qualifying gibt es keinen Abstand
    const quali = mapImport([row({ raceNumber: 4, gapMs: 3_664 })], ctx({ sessionType: 'qualifying' }));
    expect(quali.rows[0]!.gap).toBe('');
  });
});

describe('Spielstatus → Liga-Status', () => {
  it('Standardfälle', () => {
    expect(mapGameResultStatus(3, 2, 'race')).toEqual({ status: 'classified', note: null });
    expect(mapGameResultStatus(4, 3, 'race')).toEqual({ status: 'dnf', note: null });
    expect(mapGameResultStatus(7, 1, 'race')).toEqual({ status: 'dnf', note: null });
    expect(mapGameResultStatus(5, null, 'race').status).toBe('dsq');
    expect(mapGameResultStatus(6, null, 'race')).toEqual({ status: 'dnc', note: null });
  });

  it('Sonderfälle mit Hinweis', () => {
    expect(mapGameResultStatus(4, 5, 'race')).toEqual({ status: 'dnc', note: null });
    expect(mapGameResultStatus(4, 6, 'race')).toMatchObject({ status: 'dsq', note: expect.stringMatching(/schwarze Flagge/) });
    expect(mapGameResultStatus(2, null, 'race')).toMatchObject({ status: 'classified', note: expect.stringMatching(/noch unterwegs/) });
    expect(mapGameResultStatus(2, null, 'qualifying')).toEqual({ status: 'classified', note: null });
    expect(mapGameResultStatus(1, null, 'race')).toMatchObject({ status: 'dns' });
    expect(mapGameResultStatus(3, 10, 'race')).toMatchObject({ status: 'classified', note: expect.stringMatching(/simuliert/) });
    expect(mapGameResultStatus(0, null, 'race').status).toBeNull();
  });

  it('Session-Arten', () => {
    expect(gameSessionKind(5)).toBe('qualifying');
    expect(gameSessionKind(13)).toBe('sprint_shootout');
    expect(gameSessionKind(17)).toBe('race');
    expect(gameSessionKind(0)).toBe('unknown');
  });
});

describe('normalizeTelemetry', () => {
  const r = (over: Partial<TelemetryResult>): TelemetryResult => ({
    carIndex: 0,
    position: 1,
    raceNumber: 4,
    name: 'Anna',
    teamId: 8,
    aiControlled: false,
    platform: 1,
    resultStatus: 3,
    resultReason: 2,
    gridPosition: 2,
    numLaps: 25,
    bestLapMs: 76_000,
    totalRaceTimeMs: 1_900_000,
    penaltiesS: 5,
    numPenalties: 1,
    numPitStops: 1,
    ...over,
  });

  it('Gesamtzeit inkl. Ingame-Strafen, Status übersetzt, sortiert, ungültige Zeilen übersprungen', () => {
    const { rows, skipped } = normalizeTelemetry(
      [r({ carIndex: 1, position: 2, raceNumber: 77, resultStatus: 4, totalRaceTimeMs: 0 }), r({}), r({ carIndex: 2, position: 3, resultStatus: 0 }), r({ carIndex: 3, position: 0 })],
      'race',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ line: 1, raceNumber: 4, totalTimeMs: 1_905_000, penaltyS: 5, gridPosition: 2, laps: 25, pitStops: 1, gameTeamId: 8 });
    expect(rows[1]).toMatchObject({ raceNumber: 77, status: 'dnf', totalTimeMs: null });
    expect(skipped[0]).toMatch(/P3 #4 Anna: ungültiger Spielstatus 0/);
  });

  it('Qualifying: nur beste Runde; Nummer 0 = unbekannt', () => {
    const { rows } = normalizeTelemetry([r({ raceNumber: 0 })], 'qualifying');
    expect(rows[0]).toMatchObject({ raceNumber: null, bestLapMs: 76_000, totalTimeMs: null, laps: null, gridPosition: null, pitStops: null, penaltyS: 0 });
  });
});

describe('Upload-Schema', () => {
  it('verwirft unbekannte Felder und säubert Namen', () => {
    const parsed = telemetryPayloadSchema.parse({
      format: 'liga-telemetry/1',
      game: { packetFormat: 2025 },
      sessionUid: '123',
      session: { gameSessionType: 15, trackId: 6, geheim: 1 },
      results: [{ carIndex: 0, position: 1, raceNumber: 4, name: `An${String.fromCharCode(7)}na`, aiControlled: false, resultStatus: 3, ip: '1.2.3.4' }],
      extra: 'x',
    });
    expect(parsed).not.toHaveProperty('extra');
    expect(parsed.session).not.toHaveProperty('geheim');
    expect(parsed.results[0]).not.toHaveProperty('ip');
    expect(parsed.results[0]!.name).toBe('Anna');
  });

  it('lehnt falsches Format und leeres Ergebnis ab', () => {
    expect(telemetryPayloadSchema.safeParse({ format: 'x' }).success).toBe(false);
    expect(telemetryPayloadSchema.safeParse({ format: 'liga-telemetry/1', game: { packetFormat: 2025 }, sessionUid: '1', session: null, results: [] }).success).toBe(false);
  });
});

describe('Session-Zuordnung', () => {
  const now = new Date('2026-10-01T20:00:00Z');
  const base: ResolveInput = {
    now,
    gameSessionType: 15,
    gameTrackId: 6,
    seasons: [
      { id: 1, status: 'finished', number: 1 },
      { id: 2, status: 'active', number: 2 },
    ],
    tracks: [
      { id: 7, game_track_id: 6, name_de: 'Montreal' },
      { id: 8, game_track_id: 13, name_de: 'Suzuka' },
      { id: 9, game_track_id: null, name_de: 'Madrid' },
    ],
    rounds: [
      { id: 50, season_id: 2, number: 5, track_id: 7, start_utc: '2026-10-01T18:00:00Z', status: 'lineup_published', format: 'standard' },
      { id: 51, season_id: 2, number: 6, track_id: 8, start_utc: '2026-10-08T18:00:00Z', status: 'scheduled', format: 'sprint' },
      { id: 40, season_id: 1, number: 5, track_id: 7, start_utc: '2026-10-01T10:00:00Z', status: 'final', format: 'standard' },
    ],
    sessions: [
      { id: 500, round_id: 50, type: 'qualifying' },
      { id: 501, round_id: 50, type: 'race' },
      { id: 510, round_id: 51, type: 'qualifying' },
      { id: 511, round_id: 51, type: 'sprint' },
      { id: 512, round_id: 51, type: 'race' },
    ],
  };

  it('automatisch über aktive Saison, Strecke und ±36 h', () => {
    expect(resolveImportSession(base)).toEqual({ ok: true, roundId: 50, sessionId: 501, sessionType: 'race', how: 'auto' });
    expect(resolveImportSession({ ...base, gameSessionType: 7 })).toMatchObject({ ok: true, sessionId: 500, sessionType: 'qualifying' });
    expect(resolveImportSession({ ...base, gameSessionType: 12 })).toMatchObject({ ok: true, sessionType: 'qualifying' });
  });

  it('außerhalb des Fensters oder falsche Strecke → Erklärung', () => {
    const far = resolveImportSession({ ...base, now: new Date('2026-10-03T12:00:00Z') });
    expect(far).toMatchObject({ ok: false, message: 'Keine passende Runde gefunden.' });
    const wrongTrack = resolveImportSession({ ...base, gameTrackId: 13 });
    expect(wrongTrack.ok).toBe(false);
    if (!wrongTrack.ok) {
      expect(wrongTrack.details.join(' ')).toMatch(/Suzuka.*Strecken-ID 13/);
      expect(wrongTrack.details.join(' ')).toMatch(/S2 R5 · Montreal/);
    }
  });

  it('Training/Zeitfahren werden abgelehnt, unbekannte Strecke verlangt --round', () => {
    expect(resolveImportSession({ ...base, gameSessionType: 2 })).toMatchObject({ ok: false, message: expect.stringMatching(/Training/) });
    expect(resolveImportSession({ ...base, gameTrackId: null })).toMatchObject({ ok: false, message: expect.stringMatching(/Strecke ist unbekannt/) });
  });

  it('Sprint-Runde: „Rennen“ ist mehrdeutig, „Rennen 2“ ist das Hauptrennen, Vorgabe entscheidet', () => {
    const sprintNow = { ...base, now: new Date('2026-10-08T19:00:00Z'), gameTrackId: 13 };
    expect(resolveImportSession(sprintNow)).toMatchObject({ ok: false, message: expect.stringMatching(/Sprint-Runde/) });
    expect(resolveImportSession({ ...sprintNow, gameSessionType: 16 })).toMatchObject({ ok: true, sessionId: 512 });
    expect(resolveImportSession({ ...sprintNow, target: { sessionType: 'sprint' } })).toEqual({ ok: true, roundId: 51, sessionId: 511, sessionType: 'sprint', how: 'explicit' });
  });

  it('explizite Runde (auch ohne Session-Paket), abgeschlossene Saison und mehrere Kandidaten', () => {
    expect(resolveImportSession({ ...base, gameTrackId: null, gameSessionType: null, target: { roundId: 50, sessionType: 'qualifying' } })).toMatchObject({ ok: true, sessionId: 500, how: 'explicit' });
    expect(resolveImportSession({ ...base, target: { roundId: 40 } })).toMatchObject({ ok: false, message: expect.stringMatching(/abgeschlossen/) });
    expect(resolveImportSession({ ...base, target: { roundId: 999 } })).toMatchObject({ ok: false });
    const twice = resolveImportSession({
      ...base,
      rounds: [...base.rounds, { id: 52, season_id: 2, number: 7, track_id: 7, start_utc: '2026-10-02T06:00:00Z', status: 'scheduled', format: 'standard' }],
    });
    expect(twice).toMatchObject({ ok: false, message: expect.stringMatching(/Mehrere Runden/) });
  });

  it('abgesagte Runden zählen nicht', () => {
    const cancelled = { ...base, rounds: base.rounds.map((r) => (r.id === 50 ? { ...r, status: 'cancelled' as const } : r)) };
    expect(resolveImportSession(cancelled).ok).toBe(false);
  });
});

describe('Import-Token', () => {
  it('erzeugt zufällige Tokens mit Präfix', () => {
    const a = generateImportToken();
    const b = generateImportToken();
    expect(a).not.toBe(b);
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a.length).toBeGreaterThan(40);
    expect(a).toMatch(/^[\w-]+$/);
  });

  it('SHA-256 und Prüfung in konstanter Zeit', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const token = generateImportToken();
    const hash = await sha256Hex(token);
    expect(await verifyImportToken(token, hash)).toBe(true);
    expect(await verifyImportToken(token, hash.toUpperCase())).toBe(true);
    expect(await verifyImportToken(`${token}x`, hash)).toBe(false);
    expect(await verifyImportToken(null, hash)).toBe(false);
    expect(await verifyImportToken(token, null)).toBe(false);
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  it('Bearer-Header', () => {
    expect(bearerToken('Bearer liga_imp_abcdefghijklmnop')).toBe('liga_imp_abcdefghijklmnop');
    expect(bearerToken('bearer   liga_imp_abcdefghijklmnop ')).toBe('liga_imp_abcdefghijklmnop');
    expect(bearerToken('Basic xyz')).toBeNull();
    expect(bearerToken('Bearer kurz')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
