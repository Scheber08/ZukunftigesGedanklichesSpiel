import { describe, expect, it } from 'vitest';
import { formatDecisionRef, gridPenaltiesFromPreviousRound, isConflicted, nextDecisionSequence, penaltiesForSession } from '~/lib/domain/decisions';
import { checkGrid, seatsForRound, type GridEntry } from '~/lib/domain/grid';
import { buildIcs, escapeIcsText, foldIcsLine } from '~/lib/domain/ics';
import { formatGapMs, formatLapTime, parseLapTime } from '~/lib/domain/laptime';
import { currentNumber, isNumberAvailable, numberAt } from '~/lib/domain/numbers';
import { careerStats, teammateDuel } from '~/lib/domain/stats';
import type { StandingsResult } from '~/lib/domain/standings';
import { gamertagKey, isAllowedClipUrl, normalizeGamertag, slugify, uniqueSlug } from '~/lib/domain/text';
import { utcToZonedLocal, zonedLocalToUtc } from '~/lib/domain/time';

describe('Zeitzonen', () => {
  it('rechnet Berliner Winter- und Sommerzeit korrekt um', () => {
    expect(zonedLocalToUtc('2026-01-15T20:00:00').toISOString()).toBe('2026-01-15T19:00:00.000Z');
    expect(zonedLocalToUtc('2026-07-15T20:00').toISOString()).toBe('2026-07-15T18:00:00.000Z');
  });

  it('behandelt die Zeitumstellung (Lücke und Überlappung)', () => {
    // 29.03.2026 02:30 existiert nicht → wie Postgres mit Winterzeit-Offset
    expect(zonedLocalToUtc('2026-03-29T02:30:00').toISOString()).toBe('2026-03-29T01:30:00.000Z');
    // 25.10.2026 02:30 gibt es doppelt → Winterzeit
    expect(zonedLocalToUtc('2026-10-25T02:30:00').toISOString()).toBe('2026-10-25T01:30:00.000Z');
    // direkt nach der Umstellung
    expect(zonedLocalToUtc('2026-10-25T20:00:00').toISOString()).toBe('2026-10-25T19:00:00.000Z');
  });

  it('rechnet UTC in Ortszeit zurück', () => {
    expect(utcToZonedLocal(new Date('2026-07-15T18:00:00Z'))).toBe('2026-07-15T20:00:00');
    expect(utcToZonedLocal(new Date('2026-12-01T19:30:00Z'), 'Europe/London')).toBe('2026-12-01T19:30:00');
  });
});

describe('Rundenzeiten', () => {
  it('formatiert und parst', () => {
    expect(formatLapTime(83_456)).toBe('1:23.456');
    expect(formatLapTime(3_723_456)).toBe('1:02:03.456');
    expect(formatLapTime(null)).toBe('–');
    expect(parseLapTime('1:23.456')).toBe(83_456);
    expect(parseLapTime('01:23,4')).toBe(83_400);
    expect(parseLapTime('83.456')).toBe(83_456);
    expect(parseLapTime('1:02:03.456')).toBe(3_723_456);
    expect(parseLapTime('1:75.000')).toBeNull();
    expect(parseLapTime('abc')).toBeNull();
    expect(parseLapTime('')).toBeNull();
  });

  it('formatiert Abstände', () => {
    expect(formatGapMs(1234)).toBe('+1.234');
    expect(formatGapMs(75_000)).toBe('+1:15.000');
  });
});

const ZWSP = String.fromCharCode(0x200b);
const ZWJ = String.fromCharCode(0x200d);

describe('Text-Normalisierung', () => {
  it('normalisiert Gamertags (Trim, NFKC, Zero-Width)', () => {
    expect(normalizeGamertag('  Max' + ZWSP + ' Power ')).toBe('Max Power');
    expect(normalizeGamertag('ＭａｘＰ')).toBe('MaxP');
    expect(gamertagKey('MAX power')).toBe(gamertagKey('max' + ZWJ + ' power'));
  });

  it('erzeugt Slugs', () => {
    expect(slugify('Max Müller_99')).toBe('max-mueller-99');
    expect(slugify('Élodie Ståhl')).toBe('elodie-stahl');
    expect(slugify('!!!')).toBe('fahrer');
    expect(uniqueSlug('max', ['max', 'max-2'])).toBe('max-3');
  });

  it('akzeptiert nur Clip-Links bekannter Plattformen', () => {
    expect(isAllowedClipUrl('https://youtu.be/abc?t=12')).toBe(true);
    expect(isAllowedClipUrl('https://www.twitch.tv/videos/1')).toBe(true);
    expect(isAllowedClipUrl('https://clips.twitch.tv/abc')).toBe(true);
    expect(isAllowedClipUrl('https://medal.tv/games/f1/clips/x')).toBe(true);
    expect(isAllowedClipUrl('https://evil.example/youtube.com')).toBe(false);
    expect(isAllowedClipUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('Startnummern', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const numbers = [
    { driver_id: 1, number: 44, valid_from: '2026-01-01T00:00:00Z', valid_to: '2026-10-08T18:00:00Z' },
    { driver_id: 1, number: 7, valid_from: '2026-10-08T18:00:00Z', valid_to: null },
    { driver_id: 2, number: 16, valid_from: '2026-01-01T00:00:00Z', valid_to: null },
    { driver_id: 3, number: 5, valid_from: '2025-01-01T00:00:00Z', valid_to: '2026-01-01T00:00:00Z' },
  ];

  it('liefert die Nummer zum Zeitpunkt (Wechsel ab dem nächsten Rennen)', () => {
    expect(numberAt(1, numbers, now)).toBe(44);
    expect(numberAt(1, numbers, new Date('2026-10-09T00:00:00Z'))).toBe(7);
    expect(currentNumber(1, numbers, now)).toBe(44);
  });

  it('prüft die Verfügbarkeit inkl. künftiger und auslaufender Nummern', () => {
    expect(isNumberAvailable(16, numbers, now)).toBe(false);
    expect(isNumberAvailable(16, numbers, now, 2)).toBe(true);
    expect(isNumberAvailable(7, numbers, now)).toBe(false);
    expect(isNumberAvailable(44, numbers, now)).toBe(false);
    expect(isNumberAvailable(5, numbers, now)).toBe(true);
    expect(isNumberAvailable(0, numbers, now)).toBe(false);
    expect(isNumberAvailable(100, numbers, now)).toBe(false);
  });
});

describe('Grid-Prüfung', () => {
  const entry = (driverId: number, teamId: number, seatNo: 1 | 2, extra: Partial<GridEntry> = {}): GridEntry => ({
    driverId,
    teamId,
    seatNo,
    role: 'regular',
    replacesDriverId: null,
    raceNumber: driverId + 10,
    ...extra,
  });
  const ctx = {
    driverStatus: (id: number) => (id === 9 ? ('banned' as const) : ('active' as const)),
    absentDriverIds: new Set([5]),
    bannedForRound: new Set([6]),
    teamIds: [1, 2],
  };

  it('findet Doppelte, Nummernkonflikte, Sperren und Abwesende', () => {
    const issues = checkGrid(
      [
        entry(1, 1, 1),
        entry(1, 1, 2),
        entry(2, 2, 1, { raceNumber: 11 }),
        entry(5, 2, 2, { role: 'reserve' }),
        entry(9, 3, 1),
        entry(6, 3, 2),
      ],
      ctx,
    );
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('duplicate_driver');
    expect(codes).toContain('number_conflict');
    expect(codes).toContain('banned_driver');
    expect(codes).toContain('race_ban');
    expect(codes).toContain('absent_driver_entered');
    expect(codes).toContain('reserve_without_replacement');
  });

  it('meldet leere Cockpits und zu viele Fahrer', () => {
    const many = Array.from({ length: 23 }, (_, i) => entry(100 + i, 50 + Math.floor(i / 2), ((i % 2) + 1) as 1 | 2));
    expect(checkGrid(many, ctx).some((i) => i.code === 'too_many_drivers')).toBe(true);
    expect(checkGrid([entry(1, 1, 1)], ctx).filter((i) => i.code === 'empty_seat')).toHaveLength(3);
  });

  it('filtert Cockpits nach Gültigkeit (Transfers ab Runde X)', () => {
    const seats = [
      { team_id: 1, seat_no: 1 as const, driver_id: 1, from_round: 1, to_round: 3 },
      { team_id: 1, seat_no: 1 as const, driver_id: 2, from_round: 4, to_round: null },
    ];
    expect(seatsForRound(seats, 3).map((s) => s.driver_id)).toEqual([1]);
    expect(seatsForRound(seats, 4).map((s) => s.driver_id)).toEqual([2]);
  });
});

describe('Steward-Entscheidungen', () => {
  const base = { status: 'published' as const, session_id: null, round_id: 1, time_seconds: null, positions: null };
  const decisions = [
    { ...base, id: 2, driver_id: 5, verdict: 'time_penalty' as const, time_seconds: 5, published_at: '2026-10-02T10:00:00Z' },
    { ...base, id: 1, driver_id: 6, verdict: 'position_penalty' as const, positions: 3, published_at: '2026-10-01T10:00:00Z' },
    { ...base, id: 3, driver_id: 7, verdict: 'warning' as const, published_at: '2026-10-01T11:00:00Z' },
    { ...base, id: 4, driver_id: 8, verdict: 'dsq' as const, status: 'draft' as const, published_at: null },
    { ...base, id: 5, driver_id: 9, verdict: 'grid_penalty_next' as const, positions: 5, published_at: '2026-10-01T12:00:00Z' },
    { ...base, id: 6, driver_id: 10, verdict: 'dsq' as const, session_id: 77, published_at: '2026-10-01T12:00:00Z' },
  ];

  it('übersetzt veröffentlichte Entscheidungen in Strafen, nur für die passende Session', () => {
    const race = penaltiesForSession(decisions, { id: 99, round_id: 1, type: 'race' });
    expect(race).toEqual([
      { driverId: 6, kind: 'position', positions: 3 },
      { driverId: 5, kind: 'time', seconds: 5 },
    ]);
    const sprint = penaltiesForSession(decisions, { id: 77, round_id: 1, type: 'sprint' });
    expect(sprint).toEqual([{ driverId: 10, kind: 'dsq' }]);
  });

  it('Grid-Strafen gelten in der nächsten Runde', () => {
    expect(gridPenaltiesFromPreviousRound(decisions, 1)).toEqual([{ driverId: 9, positions: 5 }]);
    expect(gridPenaltiesFromPreviousRound(decisions, null)).toEqual([]);
  });

  it('Referenzen S1-R03-02', () => {
    expect(formatDecisionRef(1, 3, 2)).toBe('S1-R03-02');
    expect(nextDecisionSequence(['S1-R03-01', 'S1-R03-02', 'S1-R04-01'], 1, 3)).toBe(3);
    expect(nextDecisionSequence([], 2, 1)).toBe(1);
  });

  it('Befangenheit: beteiligte Stewards dürfen nicht entscheiden', () => {
    const incident = { involved_driver_ids: [3, 4], reporter_driver_id: 5 };
    expect(isConflicted(3, incident, 4)).toBe(true);
    expect(isConflicted(5, incident, 4)).toBe(true);
    expect(isConflicted(4, null, 4)).toBe(true);
    expect(isConflicted(8, incident, 4)).toBe(false);
    expect(isConflicted(null, incident, 4)).toBe(false);
  });
});

describe('Statistiken', () => {
  const r = (roundId: number, driverId: number, position: number | null, extra: Partial<StandingsResult> = {}): StandingsResult => ({
    roundId,
    sessionType: 'race',
    driverId,
    teamId: 1,
    role: 'regular',
    position,
    status: position == null ? 'dnf' : 'classified',
    points: position === 1 ? 25 : position === 2 ? 18 : 0,
    isPole: false,
    isFastestLap: false,
    countsForConstructors: true,
    gridPosition: null,
    ...extra,
  });

  it('Karriere-Kennzahlen', () => {
    const s = careerStats([
      r(1, 1, 1, { gridPosition: 3 }),
      r(2, 1, 2, { gridPosition: 1 }),
      r(3, 1, null),
      r(4, 1, null, { status: 'dns' }),
      r(1, 1, 1, { sessionType: 'qualifying', isPole: true, points: 0 }),
    ]);
    expect(s).toMatchObject({ starts: 3, wins: 1, podiums: 2, poles: 1, dnfs: 1, avgFinish: 1.5, bestFinish: 1, positionsGained: 1 });
    expect(s.dnfRate).toBeCloseTo(1 / 3);
  });

  it('Teamkollegen-Duell zählt nur gemeinsame Runden', () => {
    const d = teammateDuel(
      [
        r(1, 1, 1),
        r(1, 2, 2),
        r(1, 1, 2, { sessionType: 'qualifying' }),
        r(1, 2, 1, { sessionType: 'qualifying' }),
        r(2, 1, 1), // Fahrer 2 fehlt in Runde 2
      ],
      1,
      1,
      2,
    );
    expect(d).toMatchObject({ raceWinsA: 1, raceWinsB: 0, qualiWinsA: 0, qualiWinsB: 1 });
    expect(d.rounds).toHaveLength(1);
  });
});

describe('ICS', () => {
  it('escaped und faltet Zeilen', () => {
    expect(escapeIcsText('a,b;c\nd\\')).toBe('a\\,b\\;c\\nd\\\\');
    const folded = foldIcsLine(`SUMMARY:${'ä'.repeat(60)}`);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('erzeugt Termine mit TZID und VTIMEZONE', () => {
    const ics = buildIcs({
      name: 'Liga',
      now: new Date('2026-09-29T10:00:00Z'),
      events: [
        { uid: 'round-1@liga', localStart: '2026-10-25T20:00', durationMinutes: 120, summary: 'R1 · Suzuka' },
        { uid: 'round-2@liga', localStart: '2026-11-01T20:00', durationMinutes: 120, summary: 'R2', cancelled: true },
      ],
    });
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261025T200000');
    expect(ics).toContain('DTEND;TZID=Europe/Berlin:20261025T220000');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SUMMARY:R1 · Suzuka');
    expect(ics.endsWith('\r\n')).toBe(true);
  });
});
