/**
 * Streckenseiten (src/lib/tracks): Streckenliste aus den Kalendern, Rekorde nur aus gewerteten
 * Ergebnissen (vorläufig/final/korrigiert), DSQ ohne Zeit-Rekord, Ranglisten mit Gleichstand,
 * nächste Runde, JSON-LD und Sitemap-Einträge.
 */
import { describe, expect, it } from 'vitest';
import type { Dataset } from '~/lib/db/memory-store';
import type { ResultRow } from '~/lib/db/types';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
import { demoDataset } from '~/lib/seed/demo';
import {
  calendarTracks,
  leaders,
  raceDistanceKm,
  topEntries,
  trackPageSlugs,
  trackPlaceJsonLd,
  trackRecords,
  trackSitemapPages,
  tracksOverview,
} from '~/lib/tracks';

const NOW = new Date('2026-10-15T12:00:00Z');
const STAMP = '2026-01-01T00:00:00.000Z';

function leagueFrom(dataset: Dataset, now = NOW): League {
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
  return new League(data, now);
}

const dataset = demoDataset(NOW);
const league = leagueFrom(dataset);
const trackBySlug = (slug: string) => league.data.tracks.find((t) => t.slug === slug)!;
const roundAt = (seasonId: number, number: number) => league.data.rounds.find((r) => r.season_id === seasonId && r.number === number)!;

describe('Streckenliste', () => {
  it('enthält genau die Strecken aus den Kalendern (alle Saisons)', () => {
    const ids = new Set(league.data.rounds.map((r) => r.track_id));
    const tracks = calendarTracks(league);
    expect(tracks.map((t) => t.id).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    // Monaco steht in keinem Demo-Kalender
    expect(tracks.some((t) => t.slug === 'monaco')).toBe(false);
    expect(trackPageSlugs(league)).toHaveLength(ids.size);
  });

  it('Übersicht: aktuelle Saison in Kalender-Reihenfolge, der Rest alphabetisch nach Sprache', () => {
    const { current, other } = tracksOverview(league, 'de');
    expect(current.map((i) => i.currentRound!.number)).toEqual(current.map((_, i) => i + 1));
    expect(current[0]!.track.slug).toBe('melbourne');
    const namesDe = other.map((i) => i.track.name_de);
    expect(namesDe).toEqual([...namesDe].sort((a, b) => a.localeCompare(b, 'de')));
    expect(current.length + other.length).toBe(calendarTracks(league).length);
    const en = tracksOverview(league, 'en').other.map((i) => i.track.name_en);
    expect(en).toEqual([...en].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('zählt nur gewertete Rennen und kennt die nächste Runde', () => {
    const { current } = tracksOverview(league, 'de');
    const suzuka = current.find((i) => i.track.slug === 'suzuka')!;
    expect(suzuka.races).toBe(1);
    expect(suzuka.next).toBeNull();
    // R5 läuft gerade (Aufstellung steht, noch kein Ergebnis) → 0 Rennen
    const r5 = current.find((i) => i.currentRound?.number === 5)!;
    expect(r5.races).toBe(0);
    // R6 ist die nächste Runde
    const r6 = current.find((i) => i.currentRound?.number === 6)!;
    expect(r6.next?.id).toBe(roundAt(2, 6).id);
  });
});

describe('Rekorde', () => {
  it('schnellste Rennrunde und beste Quali-Zeit aus den gewerteten Ergebnissen', () => {
    const track = trackBySlug('suzuka');
    const rec = trackRecords(league, track.id);
    const round = roundAt(2, 2);
    const sessions = league.sessionsOf(round.id);
    const lapsOf = (type: string) =>
      sessions
        .filter((s) => (type === 'race' ? s.type !== 'qualifying' : s.type === 'qualifying'))
        .flatMap((s) => league.resultsOf(s.id))
        .filter((r) => r.status !== 'dsq' && r.best_lap_ms != null)
        .map((r) => r.best_lap_ms!);
    expect(rec.races).toBe(1);
    expect(rec.fastestRaceLap?.ms).toBe(Math.min(...lapsOf('race')));
    expect(rec.bestQualifying?.ms).toBe(Math.min(...lapsOf('qualifying')));
    expect(rec.fastestRaceLap?.round.id).toBe(round.id);
    expect(rec.first?.round.id).toBe(round.id);
    expect(rec.history).toHaveLength(1);
    const winner = rec.history[0]!.winner!;
    expect(winner.position).toBe(1);
    expect(rec.wins).toEqual([{ driverId: winner.driver_id, value: 1 }]);
    expect(rec.poles).toHaveLength(1);
    expect(rec.history[0]!.pole?.is_pole).toBe(true);
    expect(rec.history[0]!.fastestLap?.is_fastest_lap).toBe(true);
  });

  it('ignoriert Ergebnisse nicht gewerteter Runden (Aufstellung steht / geplant)', () => {
    const data = demoDataset(NOW);
    const r5 = data.rounds!.find((r) => r.season_id === 2 && r.number === 5)!;
    const race = data.sessions!.find((s) => s.round_id === r5.id && s.type === 'race')!;
    const template = data.results![0]!;
    data.results!.push({ ...template, id: 99_001, session_id: race.id, position: 1, best_lap_ms: 1000, status: 'classified', is_fastest_lap: true } as ResultRow);
    const l = leagueFrom(data);
    const rec = trackRecords(l, r5.track_id!);
    expect(rec.races).toBe(0);
    expect(rec.fastestRaceLap).toBeNull();
    expect(rec.wins).toEqual([]);
    expect(rec.history).toEqual([]);
  });

  it('disqualifizierte Ergebnisse zählen nicht für Zeit-Rekorde', () => {
    const data = demoDataset(NOW);
    const suzuka = data.tracks!.find((t) => t.slug === 'suzuka')!;
    const round = data.rounds!.find((r) => r.track_id === suzuka.id)!;
    const race = data.sessions!.find((s) => s.round_id === round.id && s.type === 'race')!;
    const victim = data.results!.find((r) => r.session_id === race.id && r.position === 10)!;
    victim.best_lap_ms = 60_000;
    victim.status = 'dsq';
    victim.position = null;
    const rec = trackRecords(leagueFrom(data), suzuka.id!);
    expect(rec.fastestRaceLap?.ms).toBeGreaterThan(60_000);
    // ohne DSQ wäre es der Rekord
    victim.status = 'classified';
    victim.position = 10;
    expect(trackRecords(leagueFrom(data), suzuka.id!).fastestRaceLap?.ms).toBe(60_000);
  });

  it('bei gleicher Zeit gilt, wer sie zuerst gefahren ist', () => {
    const data = demoDataset(NOW);
    const suzuka = data.tracks!.find((t) => t.slug === 'suzuka')!;
    const round = data.rounds!.find((r) => r.track_id === suzuka.id)!;
    const race = data.sessions!.find((s) => s.round_id === round.id && s.type === 'race')!;
    const rows = data.results!.filter((r) => r.session_id === race.id && r.status === 'classified');
    rows[3]!.best_lap_ms = 50_000;
    rows[1]!.best_lap_ms = 50_000;
    const rec = trackRecords(leagueFrom(data), suzuka.id!);
    // gleiche Runde → kleinere eingegebene Position zuerst
    expect(rec.fastestRaceLap?.result.id).toBe(rows[1]!.id);
  });

  it('Strecken ohne gewertetes Rennen haben leere Rekorde, aber die nächste Runde', () => {
    const r7 = roundAt(2, 7);
    const rec = trackRecords(league, r7.track_id);
    expect(rec.races).toBe(0);
    expect(rec.fastestRaceLap).toBeNull();
    expect(rec.bestQualifying).toBeNull();
    expect(rec.first).toBeNull();
    expect(rec.next?.id).toBe(r7.id);
  });

  it('Ranglisten: Gleichstand an der Spitze und an der Top-N-Grenze', () => {
    const entries = [
      { driverId: 1, value: 3 },
      { driverId: 2, value: 3 },
      { driverId: 3, value: 2 },
      { driverId: 4, value: 1 },
      { driverId: 5, value: 1 },
    ];
    expect(leaders(entries).map((e) => e.driverId)).toEqual([1, 2]);
    expect(leaders([])).toEqual([]);
    expect(topEntries(entries, 4).map((e) => e.driverId)).toEqual([1, 2, 3, 4, 5]);
    expect(topEntries(entries, 2).map((e) => e.driverId)).toEqual([1, 2]);
  });
});

describe('Hilfen', () => {
  it('Renndistanz = Länge × Standard-Runden', () => {
    expect(raceDistanceKm({ length_km: 5.807, laps_default: 53 })).toBe(307.771);
    expect(raceDistanceKm({ length_km: null, laps_default: 53 })).toBeNull();
    expect(raceDistanceKm({ length_km: 5, laps_default: 0 })).toBeNull();
  });

  it('JSON-LD Place mit Land und optionaler Karte', () => {
    const ld = trackPlaceJsonLd(trackBySlug('suzuka'), 'en', 'https://liga.example/en/tracks/suzuka', 'https://liga.example/maps/suzuka.svg');
    expect(ld).toMatchObject({
      '@type': 'Place',
      name: 'Suzuka',
      url: 'https://liga.example/en/tracks/suzuka',
      address: { '@type': 'PostalAddress', addressCountry: 'JP' },
      hasMap: 'https://liga.example/maps/suzuka.svg',
    });
    expect(trackPlaceJsonLd(trackBySlug('jeddah'), 'de', 'x')).not.toHaveProperty('hasMap');
    expect(trackPlaceJsonLd(trackBySlug('jeddah'), 'de', 'x').name).toBe('Dschidda');
  });

  it('Sitemap: Übersicht plus alle Streckenseiten in beiden Sprachen', () => {
    const pages = trackSitemapPages(league);
    expect(pages).toHaveLength(calendarTracks(league).length + 1);
    expect(pages[0]!.alternates).toEqual({ de: '/strecken', en: '/en/tracks' });
    expect(pages.some((p) => p.alternates.de === '/strecken/suzuka' && p.alternates.en === '/en/tracks/suzuka')).toBe(true);
  });
});
