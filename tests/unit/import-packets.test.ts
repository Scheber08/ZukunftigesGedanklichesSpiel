/**
 * Telemetrie-Companion: Paket-Parser (F1 25 UDP), Sammler, Mitschnitt, Optionen und Upload –
 * mit synthetischen Buffern (tools/telemetry/fixtures.mjs).
 */
import { describe, expect, it, vi } from 'vitest';
import { createCollector, exportFileName, PARTICIPANTS_WAIT_MS } from '../../tools/telemetry/collector.mjs';
import { parseOptions, upload } from '../../tools/telemetry/companion.mjs';
import {
  decodeName,
  layoutFor,
  PacketError,
  parseFinalClassification,
  parseHeader,
  parsePacket,
  parseParticipants,
  parseSession,
  parseSessionHistory,
  sessionKind,
  UnsupportedFormatError,
} from '../../tools/telemetry/f1-packets.mjs';
import {
  buildFinalClassification,
  buildHeaderOnly,
  buildParticipants,
  buildSession,
  buildSessionHistory,
  sampleSession,
} from '../../tools/telemetry/fixtures.mjs';
import { encodeRecording, parseRecording } from '../../tools/telemetry/recording.mjs';

const UID = 18_446_744_073_709_551_615n; // größter uint64 – darf nicht durch Number verfälscht werden

describe('Header', () => {
  it('liest alle Felder little-endian, sessionUID als String', () => {
    const buf = buildHeaderOnly({ packetFormat: 2025, packetId: 8, sessionUid: UID, sessionTime: 12.5, frame: 4242 });
    const h = parseHeader(buf);
    expect(h).toMatchObject({
      packetFormat: 2025,
      gameYear: 25,
      packetId: 8,
      sessionUid: '18446744073709551615',
      frameIdentifier: 4242,
      overallFrameIdentifier: 4242,
    });
    expect(h.sessionTime).toBeCloseTo(12.5);
  });

  it('funktioniert mit Buffer-Ausschnitten (byteOffset ≠ 0)', () => {
    const inner = buildHeaderOnly({ packetFormat: 2024, packetId: 1, sessionUid: 7n });
    const big = new Uint8Array(inner.length + 10);
    big.set(inner, 10);
    expect(parseHeader(big.subarray(10))).toMatchObject({ packetFormat: 2024, packetId: 1, sessionUid: '7' });
  });

  it('meldet zu kurze Pakete', () => {
    expect(() => parseHeader(new Uint8Array(10))).toThrow(PacketError);
  });
});

describe('Layouts und Formate', () => {
  it('2024 und 2025 sind dokumentiert, 2026 vorläufig wie 2025', () => {
    expect(layoutFor(2024)).toMatchObject({ participantEntry: 60, nameLength: 48, classificationEntry: 45, hasResultReason: false });
    expect(layoutFor(2025)).toMatchObject({ participantEntry: 57, nameLength: 32, classificationEntry: 46, hasResultReason: true, tentative: false });
    expect(layoutFor(2026)).toMatchObject({ format: 2026, participantEntry: 57, tentative: true });
    expect(layoutFor(2025).sizes).toMatchObject({ participants: 1284, finalClassification: 1042, sessionHistory: 1460 });
    expect(layoutFor(2024).sizes).toMatchObject({ participants: 1350, finalClassification: 1020 });
  });

  it('unbekanntes Format: verständliche Meldung', () => {
    expect(() => layoutFor(2023)).toThrow(UnsupportedFormatError);
    expect(() => layoutFor(2023)).toThrow(/UDP-Format 2023 wird nicht unterstützt.*2025/);
  });

  it('2026 mit abweichender Paketgröße: klare Meldung statt Datenmüll', () => {
    const buf = buildParticipants({ packetFormat: 2025, cars: [{ raceNumber: 4 }] });
    new DataView(buf.buffer).setUint16(0, 2026, true);
    expect(() => parsePacket(buf.subarray(0, 1200))).toThrow(/2026.*noch nicht dokumentiert/);
    // passende Größe → wird wie 2025 gelesen
    const ok = parsePacket(buf);
    expect(ok.kind).toBe('participants');
  });
});

describe('Session (Id 1)', () => {
  it('liest Session-Typ, Strecke, Runden und Online-Flag', () => {
    const s = parseSession(buildSession({ sessionType: 15, trackId: 6, totalLaps: 35, networkGame: 1 }));
    expect(s).toMatchObject({ sessionType: 15, trackId: 6, totalLaps: 35, networkGame: 1, trackLength: 4361 });
  });

  it('Track-ID -1 (unbekannt) bleibt negativ', () => {
    expect(parseSession(buildSession({ trackId: -1 })).trackId).toBe(-1);
  });

  it('ordnet Session-Typen ein', () => {
    expect(sessionKind(1)).toBe('practice');
    expect(sessionKind(8)).toBe('qualifying');
    expect(sessionKind(12)).toBe('sprint_shootout');
    expect(sessionKind(15)).toBe('race');
    expect(sessionKind(16)).toBe('race');
    expect(sessionKind(18)).toBe('time_trial');
    expect(sessionKind(99)).toBe('unknown');
  });
});

describe('Participants (Id 4)', () => {
  const cars = [
    { raceNumber: 44, name: 'ÄpexÄnna', teamId: 8, platform: 3 },
    { raceNumber: 2, name: 'KI', teamId: 1, ai: true, platform: 255 },
  ];

  for (const format of [2024, 2025] as const) {
    it(`liest Nummer, Namen (UTF-8), Team, KI und Plattform – Format ${format}`, () => {
      const { numActiveCars, participants } = parseParticipants(buildParticipants({ packetFormat: format, cars }), layoutFor(format));
      expect(numActiveCars).toBe(2);
      expect(participants).toHaveLength(22);
      expect(participants[0]).toMatchObject({ carIndex: 0, raceNumber: 44, name: 'ÄpexÄnna', teamId: 8, aiControlled: false, platform: 3, showOnlineNames: true });
      expect(participants[1]).toMatchObject({ raceNumber: 2, aiControlled: true, platform: 255 });
    });
  }

  it('Namen: nullterminiert, Steuerzeichen raus', () => {
    const bytes = new Uint8Array(32);
    bytes.set(new TextEncoder().encode(`Max${String.fromCharCode(7)}Power`), 0);
    expect(decodeName(bytes)).toBe('MaxPower');
    expect(decodeName(new TextEncoder().encode(`Nils${String.fromCharCode(0)}Müll`))).toBe('Nils');
  });

  it('zu kurzes Paket im dokumentierten Format → PacketError', () => {
    const buf = buildParticipants({ packetFormat: 2025, cars });
    expect(() => parseParticipants(buf.subarray(0, 500), layoutFor(2025))).toThrow(PacketError);
  });
});

describe('Final Classification (Id 8)', () => {
  const entries = [
    { carIndex: 0, position: 1, numLaps: 25, gridPosition: 3, numPitStops: 1, resultStatus: 3, resultReason: 2, bestLapTimeMs: 76_543, totalRaceTimeS: 1950.123, penaltiesTimeS: 5, numPenalties: 1 },
    { carIndex: 5, position: 2, numLaps: 12, gridPosition: 1, numPitStops: 0, resultStatus: 4, resultReason: 3, bestLapTimeMs: 76_111, totalRaceTimeS: 0 },
  ];

  it('Format 2025 mit resultReason', () => {
    const { numCars, entries: out } = parseFinalClassification(buildFinalClassification({ packetFormat: 2025, entries }), layoutFor(2025));
    expect(numCars).toBe(2);
    expect(out[0]).toMatchObject({ position: 1, numLaps: 25, gridPosition: 3, numPitStops: 1, resultStatus: 3, resultReason: 2, bestLapTimeMs: 76_543, penaltiesTimeS: 5, numPenalties: 1 });
    expect(out[0]!.totalRaceTimeS).toBeCloseTo(1950.123, 6);
    expect(out[5]).toMatchObject({ position: 2, resultStatus: 4, resultReason: 3 });
    expect(out[1]!.position).toBe(0); // leerer Platz
  });

  it('Format 2024 ohne resultReason (Felder um ein Byte verschoben)', () => {
    const { entries: out } = parseFinalClassification(buildFinalClassification({ packetFormat: 2024, entries }), layoutFor(2024));
    expect(out[0]).toMatchObject({ resultStatus: 3, resultReason: null, bestLapTimeMs: 76_543, penaltiesTimeS: 5 });
    expect(out[0]!.totalRaceTimeS).toBeCloseTo(1950.123, 6);
  });
});

describe('Session History (Id 11)', () => {
  it('beste Runde aus der Rundenliste', () => {
    const h = parseSessionHistory(buildSessionHistory({ carIndex: 3, lapTimesMs: [80_000, 77_500, 78_000] }), layoutFor(2025));
    expect(h).toMatchObject({ carIndex: 3, numLaps: 3, bestLapTimeLapNum: 2, bestLapTimeMs: 77_500 });
    expect(h.laps[1]).toEqual({ lapTimeMs: 77_500, valid: true });
  });

  it('ohne Runden → keine beste Runde', () => {
    expect(parseSessionHistory(buildSessionHistory({ carIndex: 0, lapTimesMs: [] }), layoutFor(2025)).bestLapTimeMs).toBeNull();
  });
});

describe('parsePacket', () => {
  it('andere Pakete (z. B. Motion) werden nicht dekodiert', () => {
    expect(parsePacket(buildHeaderOnly({ packetId: 0, size: 1349 })).kind).toBe('other');
  });
});

describe('Sammler', () => {
  const common = { packetFormat: 2025, sessionUid: 555n };

  it('baut nach der Final Classification das Export-JSON (Zeit inkl. Nummer, Name, KI, beste Runde aus History)', () => {
    const c = createCollector();
    const t0 = 1_000_000;
    expect(c.handle(buildSession({ ...common, sessionType: 15, trackId: 6, totalLaps: 25 }), t0)).toEqual([expect.objectContaining({ type: 'session' })]);
    c.handle(buildParticipants({ ...common, cars: [{ raceNumber: 4, name: 'Anna' }, { raceNumber: 2, name: 'KI', ai: true }] }), t0 + 10);
    c.handle(buildSessionHistory({ ...common, carIndex: 1, lapTimesMs: [79_000, 78_500] }), t0 + 20);
    const events = c.handle(
      buildFinalClassification({
        ...common,
        entries: [
          { carIndex: 0, position: 1, numLaps: 25, gridPosition: 2, resultStatus: 3, bestLapTimeMs: 77_000, totalRaceTimeS: 1900.5, penaltiesTimeS: 5 },
          { carIndex: 1, position: 2, numLaps: 25, gridPosition: 1, resultStatus: 3, bestLapTimeMs: 0, totalRaceTimeS: 1910 },
        ],
      }),
      t0 + 30,
    );
    const final = events.find((e) => e.type === 'final');
    expect(final?.type).toBe('final');
    if (final?.type !== 'final') return;
    expect(final.payload).toMatchObject({
      format: 'liga-telemetry/1',
      sessionUid: '555',
      game: { packetFormat: 2025, gameYear: 25 },
      session: { gameSessionType: 15, trackId: 6, totalLaps: 25 },
      warnings: [],
    });
    expect(final.payload.results).toEqual([
      expect.objectContaining({ position: 1, raceNumber: 4, name: 'Anna', aiControlled: false, bestLapMs: 77_000, totalRaceTimeMs: 1_900_500, penaltiesS: 5, gridPosition: 2 }),
      expect.objectContaining({ position: 2, raceNumber: 2, aiControlled: true, bestLapMs: 78_500 }),
    ]);
    expect(final.text).toContain('Montreal');
    expect(exportFileName(final.payload)).toMatch(/^1970-01-01T00-16-40_rennen_montreal_555\.json$/);
  });

  it('gleiches Endergebnis mehrfach → nur ein Export; geändertes Ergebnis → neuer Export', () => {
    const c = createCollector();
    c.handle(buildParticipants({ ...common, cars: [{ raceNumber: 4 }] }), 0);
    const fc = (pos: number) => buildFinalClassification({ ...common, entries: [{ carIndex: 0, position: pos, resultStatus: 3 }] });
    expect(c.handle(fc(1), 1).filter((e) => e.type === 'final')).toHaveLength(1);
    expect(c.handle(fc(1), 2).filter((e) => e.type === 'final')).toHaveLength(0);
    expect(c.handle(fc(2), 3).filter((e) => e.type === 'final')).toHaveLength(1);
  });

  it('wartet auf das Teilnehmer-Paket, exportiert sonst nach Ablauf mit Hinweis', () => {
    const c = createCollector();
    const fc = buildFinalClassification({ ...common, entries: [{ carIndex: 0, position: 1, resultStatus: 3 }] });
    expect(c.handle(fc, 100)).toEqual([]);
    expect(c.hasPending()).toBe(true);
    expect(c.tick(100 + PARTICIPANTS_WAIT_MS - 1)).toEqual([]);
    const events = c.tick(100 + PARTICIPANTS_WAIT_MS);
    const final = events[0];
    expect(final?.type).toBe('final');
    if (final?.type === 'final') {
      expect(final.payload.warnings.join(' ')).toMatch(/Teilnehmer-Paket fehlte/);
      expect(final.payload.warnings.join(' ')).toMatch(/Session-Paket fehlte/);
      expect(final.payload.results[0]).toMatchObject({ raceNumber: null, name: null });
    }
    expect(c.hasPending()).toBe(false);
  });

  it('Teilnehmer kommen nach dem Endergebnis → Export sofort', () => {
    const c = createCollector();
    c.handle(buildFinalClassification({ ...common, entries: [{ carIndex: 0, position: 1, resultStatus: 3 }] }), 0);
    const events = c.handle(buildParticipants({ ...common, cars: [{ raceNumber: 31 }] }), 500);
    expect(events).toHaveLength(1);
    expect(events[0]?.type === 'final' && events[0].payload.results[0]?.raceNumber).toBe(31);
  });

  it('trennt Sessions nach sessionUID und übernimmt Vorgaben (--round/--session)', () => {
    const c = createCollector({ target: { roundId: 13, sessionType: 'sprint' } });
    c.handle(buildParticipants({ packetFormat: 2025, sessionUid: 1n, cars: [{ raceNumber: 4 }] }), 0);
    c.handle(buildParticipants({ packetFormat: 2025, sessionUid: 2n, cars: [{ raceNumber: 77 }] }), 0);
    const e = c.handle(buildFinalClassification({ packetFormat: 2025, sessionUid: 2n, entries: [{ carIndex: 0, position: 1, resultStatus: 3 }] }), 1);
    expect(c.sessions.size).toBe(2);
    expect(e[0]?.type === 'final' && e[0].payload).toMatchObject({ sessionUid: '2', target: { roundId: 13, sessionType: 'sprint' }, results: [{ raceNumber: 77 }] });
  });

  it('unbekanntes Format wird einmal gemeldet (auch bei häufigen Paketen)', () => {
    const c = createCollector();
    const motion = buildHeaderOnly({ packetFormat: 2023, packetId: 0, size: 1349 });
    expect(c.handle(motion, 0)).toEqual([expect.objectContaining({ type: 'error', message: expect.stringMatching(/2023/) })]);
    expect(c.handle(motion, 1)).toEqual([]);
  });

  it('ungültige Einträge (Position 0 oder Status 0) fehlen im Export', () => {
    const c = createCollector();
    c.handle(buildParticipants({ ...common, cars: [{ raceNumber: 4 }, { raceNumber: 5 }, { raceNumber: 6 }] }), 0);
    const e = c.handle(
      buildFinalClassification({
        ...common,
        entries: [
          { carIndex: 0, position: 1, resultStatus: 3 },
          { carIndex: 1, position: 2, resultStatus: 0 },
          { carIndex: 2, position: 0, resultStatus: 3 },
        ],
      }),
      1,
    );
    expect(e[0]?.type === 'final' && e[0].payload.results.map((r) => r.raceNumber)).toEqual([4]);
  });
});

describe('Mitschnitt', () => {
  it('kodieren und wieder lesen (Beispiel-Session)', () => {
    const packets = sampleSession();
    const text = encodeRecording(packets, new Date('2026-10-01T18:00:00Z'));
    expect(text.split('\n')[0]).toContain('liga-telemetry-recording');
    const back = parseRecording(`${text}kaputt\n`);
    expect(back.skipped).toBe(1);
    expect(back.packets).toHaveLength(packets.length);
    expect([...back.packets[3]!.buf]).toEqual([...packets[3]!.buf]);
  });

  it('Beispiel-Session ergibt genau einen Export mit KI-Auto', () => {
    const c = createCollector();
    const finals = sampleSession().flatMap((p) => c.handle(p.buf, p.t)).filter((e) => e.type === 'final');
    expect(finals).toHaveLength(1);
    const payload = finals[0]!.type === 'final' ? finals[0]!.payload : null;
    expect(payload?.results).toHaveLength(22);
    expect(payload?.results.filter((r) => r.aiControlled)).toHaveLength(1);
    expect(payload?.results.some((r) => r.resultStatus === 4)).toBe(true);
  });

  it('leere Datei → Fehler', () => {
    expect(() => parseRecording('')).toThrow(/Keine Pakete/);
  });
});

describe('Companion-Optionen', () => {
  it('Standardwerte und Umgebungsvariablen', () => {
    vi.stubEnv('LIGA_IMPORT_TOKEN', 'liga_imp_abcdefghijklmnopqrstuvwxyz');
    vi.stubEnv('LIGA_SITE_URL', 'https://liga.example');
    const o = parseOptions([]);
    expect(o).toMatchObject({ port: 20777, bind: '0.0.0.0', url: 'https://liga.example', token: 'liga_imp_abcdefghijklmnopqrstuvwxyz', out: 'telemetrie-export', dryRun: false });
    vi.unstubAllEnvs();
  });

  it('prüft Port, Runde, Session und URL', () => {
    expect(() => parseOptions(['--port', '99999'])).toThrow(/--port/);
    expect(() => parseOptions(['--round', 'abc'])).toThrow(/--round/);
    expect(() => parseOptions(['--session', 'training'])).toThrow(/--session/);
    expect(() => parseOptions(['--url', 'http://liga.example'])).toThrow(/https/);
    expect(parseOptions(['--url', 'http://localhost:4321', '--round', '13', '--session', 'sprint'])).toMatchObject({ url: 'http://localhost:4321', round: 13, session: 'sprint' });
    expect(parseOptions(['--help'])).toBe('help');
    expect(() => parseOptions(['--unbekannt'])).toThrow();
  });
});

describe('Upload', () => {
  const payload = {
    format: 'liga-telemetry/1',
    companion: '1.0.0',
    createdAt: '2026-10-01T20:00:00.000Z',
    game: { packetFormat: 2025, gameYear: 25, version: '1.10' },
    sessionUid: '1',
    session: null,
    warnings: [],
    results: [],
  };

  it('schickt Bearer-Token und JSON an /api/import', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ batchId: 7, reviewUrl: 'https://liga.example/x' }), { status: 201 }));
    const res = await upload(payload, { url: 'https://liga.example/', token: 'liga_imp_geheim1234567890' }, fetchMock as unknown as typeof fetch);
    expect(res).toMatchObject({ ok: true, data: { batchId: 7 } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://liga.example/api/import');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer liga_imp_geheim1234567890');
    expect(JSON.parse(String(init!.body))).toMatchObject({ format: 'liga-telemetry/1' });
  });

  it('4xx wird nicht wiederholt und liefert Meldung + Details', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'Keine passende Runde gefunden.', details: ['a', 'b'] }), { status: 422 }));
    const res = await upload(payload, { url: 'https://liga.example', token: 'liga_imp_geheim1234567890' }, fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ ok: false, status: 422, message: 'Keine passende Runde gefunden.', details: ['a', 'b'] });
  });

  it('Netzwerkfehler: drei Versuche', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const p = upload(payload, { url: 'https://liga.example', token: 'liga_imp_geheim1234567890' }, fetchMock as unknown as typeof fetch);
    await vi.runAllTimersAsync();
    const res = await p;
    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res).toMatchObject({ ok: false, status: null, message: 'ECONNREFUSED' });
  });
});
