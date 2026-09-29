/**
 * Rennseite: Tabs, Status-Banner, Aufstellung, Navigation, Steward-Texte, Medien, JSON-LD.
 */
import { describe, expect, it } from 'vitest';
import { useT } from '~/i18n';
import {
  adjacentRounds,
  defaultTabKind,
  groupByTeam,
  isUpcoming,
  mediaPlatform,
  plainExcerpt,
  raceBanner,
  raceTabs,
  safeMediaUrl,
  splitPlaceholder,
  sportsEventJsonLd,
  trackMapImage,
  verdictText,
  verdictTone,
} from '~/lib/calendar/race';
import type { RoundCorrectionRow, RoundRow } from '~/lib/db/types';

const NOW = new Date('2026-09-29T12:00:00Z');

const round = (patch: Partial<RoundRow> = {}): Pick<RoundRow, 'status' | 'protest_deadline' | 'final_at' | 'start_utc'> => ({
  status: 'scheduled',
  protest_deadline: null,
  final_at: null,
  start_utc: '2026-10-05T18:00:00.000Z',
  ...patch,
});

const correction: RoundCorrectionRow = {
  id: 1,
  round_id: 6,
  reason_de: 'DSQ nach Urteil',
  reason_en: null,
  created_by: null,
  created_at: '2026-04-20T10:00:00Z',
  updated_at: '2026-04-20T10:00:00Z',
};

describe('raceTabs', () => {
  const sessions = [
    { id: 11, type: 'qualifying' as const },
    { id: 12, type: 'race' as const },
  ];

  it('liefert die feste Reihenfolge ohne Sprint', () => {
    const tabs = raceTabs('standard', sessions, 'de');
    expect(tabs.map((t) => t.kind)).toEqual(['lineup', 'qualifying', 'race', 'stewards', 'media']);
    expect(tabs.map((t) => t.id)).toEqual(['aufstellung', 'qualifying', 'rennen', 'stewards', 'medien']);
    expect(tabs.find((t) => t.kind === 'race')?.sessionId).toBe(12);
    expect(tabs.find((t) => t.kind === 'lineup')?.sessionId).toBeNull();
  });

  it('ergänzt den Sprint-Tab bei Sprint-Wochenenden, auch ohne angelegte Session', () => {
    const tabs = raceTabs('sprint', sessions, 'en');
    expect(tabs.map((t) => t.id)).toEqual(['lineup', 'qualifying', 'sprint', 'race', 'stewards', 'media']);
    expect(tabs.find((t) => t.kind === 'sprint')?.sessionId).toBeNull();
  });

  it('zeigt einen Sprint-Tab, wenn es eine Sprint-Session gibt', () => {
    const tabs = raceTabs('standard', [...sessions, { id: 13, type: 'sprint' }], 'de');
    expect(tabs.find((t) => t.kind === 'sprint')?.sessionId).toBe(13);
  });

  it('wählt das Rennen als Standard, sobald ein Ergebnis veröffentlicht ist', () => {
    expect(defaultTabKind('provisional')).toBe('race');
    expect(defaultTabKind('final')).toBe('race');
    expect(defaultTabKind('corrected')).toBe('race');
    expect(defaultTabKind('scheduled')).toBe('lineup');
    expect(defaultTabKind('lineup_published')).toBe('lineup');
    expect(defaultTabKind('cancelled')).toBe('lineup');
  });
});

describe('raceBanner', () => {
  it('meldet Absagen', () => {
    expect(raceBanner(round({ status: 'cancelled' }), [], NOW)).toEqual({ kind: 'cancelled' });
  });

  it('unterscheidet offene und abgelaufene Protestfristen', () => {
    const open = raceBanner(round({ status: 'provisional', protest_deadline: '2026-09-30T20:30:00Z' }), [], NOW);
    expect(open).toEqual({ kind: 'provisional', deadline: '2026-09-30T20:30:00Z', open: true });
    const closed = raceBanner(round({ status: 'provisional', protest_deadline: '2026-09-28T20:30:00Z' }), [], NOW);
    expect(closed).toMatchObject({ kind: 'provisional', open: false });
    const none = raceBanner(round({ status: 'provisional' }), [], NOW);
    expect(none).toEqual({ kind: 'provisional', deadline: null, open: false });
  });

  it('zeigt final bzw. korrigiert mit Gründen', () => {
    expect(raceBanner(round({ status: 'final', final_at: '2026-09-25T10:00:00Z' }), [], NOW)).toEqual({
      kind: 'final',
      finalAt: '2026-09-25T10:00:00Z',
    });
    expect(raceBanner(round({ status: 'corrected' }), [correction], NOW)).toEqual({ kind: 'corrected', corrections: [correction] });
    // Korrekturen gehen auch bei „final“ nicht unter
    expect(raceBanner(round({ status: 'final' }), [correction], NOW).kind).toBe('corrected');
  });

  it('erkennt geplante, aufgestellte und gerade gefahrene Runden', () => {
    expect(raceBanner(round(), [], NOW)).toEqual({ kind: 'scheduled' });
    expect(raceBanner(round({ status: 'lineup_published' }), [], NOW)).toEqual({ kind: 'lineup' });
    expect(raceBanner(round({ status: 'lineup_published', start_utc: '2026-09-28T18:00:00Z' }), [], NOW)).toEqual({ kind: 'awaiting' });
  });

  it('isUpcoming nur für offene Runden mit Termin in der Zukunft', () => {
    expect(isUpcoming(round(), NOW)).toBe(true);
    expect(isUpcoming(round({ status: 'cancelled' }), NOW)).toBe(false);
    expect(isUpcoming(round({ start_utc: '2026-09-28T18:00:00Z' }), NOW)).toBe(false);
  });
});

describe('Hilfen', () => {
  it('splitPlaceholder trennt am Platzhalter', () => {
    expect(splitPlaceholder('Frist bis {deadline}.', 'deadline')).toEqual(['Frist bis ', '.']);
    expect(splitPlaceholder('{deadline} ist die Frist', 'deadline')).toEqual(['', ' ist die Frist']);
    expect(splitPlaceholder('ohne Platzhalter', 'deadline')).toEqual(['ohne Platzhalter', '']);
  });

  it('groupByTeam behält die Reihenfolge', () => {
    const groups = groupByTeam([
      { team_id: 2, n: 1 },
      { team_id: 1, n: 2 },
      { team_id: 2, n: 3 },
    ]);
    expect(groups.map((g) => g.teamId)).toEqual([2, 1]);
    expect(groups[0]!.entries.map((e) => e.n)).toEqual([1, 3]);
  });

  it('adjacentRounds findet Nachbarn auch in unsortierten Listen', () => {
    const rounds = [{ number: 3 }, { number: 1 }, { number: 2 }];
    expect(adjacentRounds(rounds, { number: 2 })).toEqual({ previous: { number: 1 }, next: { number: 3 } });
    expect(adjacentRounds(rounds, { number: 1 }).previous).toBeUndefined();
    expect(adjacentRounds(rounds, { number: 3 }).next).toBeUndefined();
  });
});

describe('Stewards', () => {
  const de = useT('de');
  const en = useT('en');
  const base = { time_seconds: null, positions: null, penalty_points: null };

  it('formuliert Verdikte mit Details', () => {
    expect(verdictText(de, { ...base, verdict: 'time_penalty', time_seconds: 5 })).toBe('5 Sekunden Zeitstrafe');
    expect(verdictText(en, { ...base, verdict: 'time_penalty', time_seconds: 5 })).toBe('5-second time penalty');
    expect(verdictText(de, { ...base, verdict: 'grid_penalty_next', positions: 3 })).toBe('3 Startplätze zurück im nächsten Rennen');
    expect(verdictText(de, { ...base, verdict: 'position_penalty' })).toBe('Strafversetzung');
    expect(verdictText(de, { ...base, verdict: 'warning', penalty_points: 2 })).toBe('Verwarnung · 2 Strafpunkte');
    expect(verdictText(en, { ...base, verdict: 'dsq' })).toBe('Disqualification');
  });

  it('ordnet Verdikten eine Tonalität zu', () => {
    expect(verdictTone('no_action')).toBe('muted');
    expect(verdictTone('time_penalty')).toBe('warning');
    expect(verdictTone('race_ban')).toBe('danger');
  });

  it('plainExcerpt entfernt Markdown, lässt Gamertags stehen und kürzt an Wortgrenzen', () => {
    expect(plainExcerpt('**Slipstream_Sam** traf [Car #10](https://x.y) in `T1`.')).toBe('Slipstream_Sam traf Car #10 in T1.');
    expect(plainExcerpt('## Titel\n\n- Punkt eins\n- Punkt zwei')).toBe('Titel Punkt eins Punkt zwei');
    const long = plainExcerpt('Wort '.repeat(80), 50);
    expect(long.length).toBeLessThanOrEqual(51);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/\s…$/);
    expect(plainExcerpt(null)).toBe('');
  });
});

describe('Medien', () => {
  it('erkennt YouTube und Twitch', () => {
    expect(mediaPlatform('https://www.youtube.com/watch?v=abc')).toBe('YouTube');
    expect(mediaPlatform('https://youtu.be/abc')).toBe('YouTube');
    expect(mediaPlatform('https://www.twitch.tv/videos/1')).toBe('Twitch');
    expect(mediaPlatform('https://example.com/video')).toBeNull();
    expect(mediaPlatform('kein link')).toBeNull();
  });

  it('lässt nur http(s)-Links durch', () => {
    expect(safeMediaUrl('https://youtu.be/abc')).toBe('https://youtu.be/abc');
    expect(safeMediaUrl('javascript:alert(1)')).toBeNull();
    expect(safeMediaUrl('')).toBeNull();
    expect(safeMediaUrl(null)).toBeNull();
  });
});

describe('Streckenkarte', () => {
  it('liefert eigene Pfade und https-URLs mit bereinigter Quellenangabe', () => {
    expect(trackMapImage({ map_url: '/brand/tracks/suzuka.svg', map_credit: null })).toEqual({ src: '/brand/tracks/suzuka.svg', credit: null });
    expect(trackMapImage({ map_url: ' https://example.org/maps/spa.svg ', map_credit: '  Wikimedia Commons,\n CC BY-SA 4.0 ' })).toEqual({
      src: 'https://example.org/maps/spa.svg',
      credit: 'Wikimedia Commons, CC BY-SA 4.0',
    });
  });

  it('verwirft fehlende und unsichere Adressen', () => {
    expect(trackMapImage(undefined)).toBeNull();
    expect(trackMapImage({ map_url: null, map_credit: 'x' })).toBeNull();
    expect(trackMapImage({ map_url: '   ' })).toBeNull();
    expect(trackMapImage({ map_url: 'javascript:alert(1)' })).toBeNull();
    expect(trackMapImage({ map_url: 'data:image/svg+xml,<svg/>' })).toBeNull();
    expect(trackMapImage({ map_url: 'http://example.org/map.svg' })).toBeNull();
    expect(trackMapImage({ map_url: '//evil.example/map.svg' })).toBeNull();
    expect(trackMapImage({ map_url: '/\\evil.example/map.svg' })).toBeNull();
    expect(trackMapImage({ map_url: 'maps/relativ.svg' })).toBeNull();
  });
});

describe('JSON-LD', () => {
  const input = {
    name: 'R5 · Montreal – Liga',
    description: 'Beschreibung',
    startUtc: '2026-10-05T18:00:00.000Z',
    durationMinutes: 150,
    cancelled: false,
    trackName: 'Montreal',
    pageUrl: 'https://liga.example/rennen/2/5',
    organizerName: 'Liga',
    organizerUrl: 'https://liga.example/',
    inLanguage: 'de' as const,
  };

  it('beschreibt die Runde als Online-SportsEvent mit UTC-Zeiten', () => {
    const ld = sportsEventJsonLd(input);
    expect(ld['@type']).toBe('SportsEvent');
    expect(ld.startDate).toBe('2026-10-05T18:00:00.000Z');
    expect(ld.endDate).toBe('2026-10-05T20:30:00.000Z');
    expect(ld.eventStatus).toBe('https://schema.org/EventScheduled');
    expect(ld.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode');
    expect(ld.location).toEqual({ '@type': 'VirtualLocation', name: 'Montreal', url: input.pageUrl });
    expect(ld.organizer).toMatchObject({ '@type': 'SportsOrganization', name: 'Liga' });
  });

  it('kennzeichnet Absagen', () => {
    expect(sportsEventJsonLd({ ...input, cancelled: true }).eventStatus).toBe('https://schema.org/EventCancelled');
  });

  it('nimmt ein Bild nur auf, wenn eines übergeben wird', () => {
    expect(sportsEventJsonLd(input)).not.toHaveProperty('image');
    expect(sportsEventJsonLd({ ...input, imageUrl: 'https://liga.example/og-default.png' }).image).toEqual(['https://liga.example/og-default.png']);
  });
});
