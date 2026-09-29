/**
 * Kalender-Abo und ICS pro Runde mit dem Demo-Datensatz.
 */
import { describe, expect, it } from 'vitest';
import { SITE } from '~/config/site';
import {
  buildCalendarIcs,
  buildRoundIcs,
  icsSequence,
  roundIcsFilename,
  roundUid,
  subscriptionRounds,
  subscriptionSeasons,
} from '~/lib/calendar/ics';
import type { Dataset } from '~/lib/db/memory-store';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
import { demoDataset } from '~/lib/seed/demo';

const NOW = new Date('2026-09-29T12:00:00Z');
const STAMP = '2026-09-01T00:00:00.000Z';
const SITE_URL = new URL('https://liga.example');

function leagueFrom(dataset: Dataset, mutate?: (data: LeagueDataset) => void): League {
  const data = Object.fromEntries(
    LEAGUE_TABLES.map((table) => [
      table,
      ((dataset as Record<string, Array<Record<string, unknown>> | undefined>)[table] ?? []).map((row) => ({
        created_at: STAMP,
        updated_at: STAMP,
        ...row,
      })),
    ]),
  ) as unknown as LeagueDataset;
  data.settings = data.settings.filter((s) => s.is_public);
  mutate?.(data);
  return new League(data, NOW);
}

const events = (ics: string) => ics.split('BEGIN:VEVENT').length - 1;
/** Gefaltete Zeilen wieder zusammensetzen (RFC 5545 §3.1). */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('icsSequence & Dateinamen', () => {
  it('steigt mit updated_at und ist robust gegen ungültige Werte', () => {
    const a = icsSequence('2026-09-01T00:00:00Z');
    const b = icsSequence('2026-09-01T00:00:01Z');
    expect(b).toBe(a + 1);
    expect(a).toBeLessThan(2 ** 31);
    expect(icsSequence('kaputt')).toBe(0);
    expect(icsSequence(null)).toBe(0);
    expect(icsSequence('2020-01-01T00:00:00Z')).toBe(0);
  });

  it('baut sprechende Dateinamen', () => {
    expect(roundIcsFilename({ slug: '2' }, { number: 5 }, 'suzuka')).toBe('s2-r05-suzuka.ics');
    expect(roundIcsFilename({ slug: '2026' }, { number: 12 }, undefined)).toBe('s2026-r12.ics');
  });
});

describe('Kalender-Abo', () => {
  const league = leagueFrom(demoDataset(NOW));

  it('enthält nur die aktuelle Saison (Saison 1 ist abgeschlossen)', () => {
    expect(subscriptionSeasons(league).map((s) => s.number)).toEqual([2]);
    const ics = buildCalendarIcs(league, SITE_URL);
    expect(events(ics)).toBe(12);
    expect(ics).toContain('BEGIN:VTIMEZONE');
  });

  it('beschreibt Termine mit TZID, Dauer, SUMMARY, URL und SEQUENCE', () => {
    const ics = unfold(buildCalendarIcs(league, SITE_URL));
    // R6 liegt in der Zukunft und startet regulär um 20:00 Uhr (R5 ist im Demo gerade gefahren)
    const r6 = league.roundByNumber(league.currentSeason!.id, 6)!;
    const block = ics.slice(ics.indexOf(`UID:${roundUid(r6, SITE_URL)}`));
    const event = block.slice(0, block.indexOf('END:VEVENT'));
    expect(event).toContain(`SUMMARY:R6 · Spielberg – ${SITE.name}`);
    expect(event).toContain(`DTSTART;TZID=Europe/Berlin:${r6.local_start.replace(/[-:]/g, '').slice(0, 15)}`);
    expect(event).toMatch(/DTEND;TZID=Europe\/Berlin:\d{8}T223000/);
    expect(event).toContain('URL:https://liga.example/rennen/2/6');
    expect(event).toContain(`SEQUENCE:${icsSequence(STAMP)}`);
    expect(event).toContain('STATUS:CONFIRMED');
  });

  it('Sprint-Wochenenden dauern länger', () => {
    const ics = unfold(buildCalendarIcs(league, SITE_URL));
    const r8 = league.roundByNumber(league.currentSeason!.id, 8)!;
    expect(r8.format).toBe('sprint');
    const block = ics.slice(ics.indexOf(`UID:${roundUid(r8, SITE_URL)}`));
    expect(block.slice(0, block.indexOf('END:VEVENT'))).toMatch(/DTEND;TZID=Europe\/Berlin:\d{8}T230000/);
  });

  it('kennzeichnet abgesagte Runden und übernimmt Änderungen über SEQUENCE', () => {
    const changed = leagueFrom(demoDataset(NOW), (data) => {
      const r6 = data.rounds.find((r) => r.season_id === 2 && r.number === 6)!;
      r6.status = 'cancelled';
      r6.updated_at = '2026-09-20T10:00:00.000Z';
    });
    const ics = unfold(buildCalendarIcs(changed, SITE_URL));
    const r6 = changed.roundByNumber(2, 6)!;
    const block = ics.slice(ics.indexOf(`UID:${roundUid(r6, SITE_URL)}`));
    const event = block.slice(0, block.indexOf('END:VEVENT'));
    expect(event).toContain('STATUS:CANCELLED');
    expect(event).toContain('SUMMARY:Abgesagt: R6 · Spielberg');
    expect(event).toContain(`SEQUENCE:${icsSequence('2026-09-20T10:00:00.000Z')}`);
    expect(event).not.toContain('BEGIN:VALARM');
  });

  it('nimmt geplante Saisons mit auf', () => {
    const withPlanned = leagueFrom(demoDataset(NOW), (data) => {
      const s2 = data.seasons.find((s) => s.number === 2)!;
      data.seasons.push({ ...s2, id: 3, number: 3, slug: '3', name: 'Saison 3', status: 'planned' });
      const template = data.rounds.find((r) => r.season_id === 2 && r.number === 1)!;
      data.rounds.push({
        ...template,
        id: 999,
        season_id: 3,
        number: 1,
        local_start: '2027-03-07T20:00:00',
        start_utc: '2027-03-07T19:00:00.000Z',
        status: 'scheduled',
      });
    });
    expect(subscriptionSeasons(withPlanned).map((s) => s.number)).toEqual([2, 3]);
    expect(subscriptionRounds(withPlanned).at(-1)?.id).toBe(999);
    const ics = unfold(buildCalendarIcs(withPlanned, SITE_URL));
    expect(events(ics)).toBe(13);
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20270307T200000');
    expect(ics).toContain('URL:https://liga.example/rennen/3/1');
  });
});

describe('ICS-Format (RFC 5545)', () => {
  const league = leagueFrom(demoDataset(NOW));

  it('faltet Zeilen auf höchstens 75 Oktette, nutzt nur CRLF und definiert jede TZID', () => {
    const ics = buildCalendarIcs(league, SITE_URL);
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const lines = unfold(ics).split('\r\n');
    const tzids = new Set(lines.filter((l) => l.startsWith('TZID:')).map((l) => l.slice(5)));
    const used = lines.flatMap((l) => /^DT(?:START|END);TZID=([^:]+):/.exec(l)?.[1] ?? []);
    expect(used.length).toBeGreaterThan(0);
    for (const tz of used) expect(tzids.has(tz)).toBe(true);
    expect(lines.indexOf('BEGIN:VTIMEZONE')).toBeLessThan(lines.indexOf('BEGIN:VEVENT'));
    // BEGIN/END ausgeglichen
    const stack: string[] = [];
    for (const l of lines) {
      if (l.startsWith('BEGIN:')) stack.push(l.slice(6));
      if (l.startsWith('END:')) expect(stack.pop()).toBe(l.slice(4));
    }
    expect(stack).toEqual([]);
  });

  it('rechnet über die Zeitumstellung hinweg korrekt (Ende in Ortszeit)', () => {
    const dst = leagueFrom(demoDataset(NOW), (data) => {
      const r7 = data.rounds.find((r) => r.season_id === 2 && r.number === 7)!;
      // 25.10.2026: 03:00 MESZ → 02:00 MEZ; Start 01:30 MESZ = 23:30 UTC, Ende 150 min später = 03:00 MEZ
      r7.local_start = '2026-10-25T01:30:00';
      r7.start_utc = '2026-10-24T23:30:00.000Z';
    });
    const ics = unfold(buildRoundIcs(dst, dst.roundByNumber(2, 7)!, SITE_URL));
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261025T013000');
    expect(ics).toContain('DTEND;TZID=Europe/Berlin:20261025T030000');
  });
});

describe('ICS pro Runde', () => {
  const league = leagueFrom(demoDataset(NOW));

  it('enthält genau einen Termin mit derselben UID wie im Abo', () => {
    const r3 = league.roundByNumber(2, 3)!;
    const ics = unfold(buildRoundIcs(league, r3, SITE_URL));
    expect(events(ics)).toBe(1);
    expect(ics).toContain(`UID:${roundUid(r3, SITE_URL)}`);
    expect(ics).toContain(`X-WR-CALNAME:R3 · Sakhir – ${SITE.name}`);
    expect(unfold(buildCalendarIcs(league, SITE_URL))).toContain(`UID:${roundUid(r3, SITE_URL)}`);
  });
});
