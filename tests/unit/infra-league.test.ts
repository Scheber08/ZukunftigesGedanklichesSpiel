/**
 * League-Klasse mit dem Demo-Datensatz: Die öffentlichen Sichten müssen plausibel sein,
 * denn genau diese Daten sehen Besucher im Demo-Modus, in der Vorschau und in den E2E-Tests.
 */
import { describe, expect, it } from 'vitest';
import type { Dataset } from '~/lib/db/memory-store';
import { League, LEAGUE_TABLES, localized, type LeagueDataset } from '~/lib/league/league';
import { demoDataset } from '~/lib/seed/demo';

const NOW = new Date('2026-10-15T12:00:00Z');
const STAMP = '2026-01-01T00:00:00.000Z';

/** Demo-Datensatz wie ihn der Loader liefert (nur öffentliche Tabellen/Einstellungen, mit Zeitstempeln). */
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

const league = leagueFrom(demoDataset(NOW));
const season = league.currentSeason!;

describe('League – Saisons und Kalender', () => {
  it('erkennt die aktive Saison als aktuelle', () => {
    expect(season).toBeDefined();
    expect(season.status).toBe('active');
    expect(season.number).toBe(2);
    expect(league.seasons.map((s) => s.number)).toEqual([2, 1]);
    expect(league.archiveSeasons).toHaveLength(2);
    expect(league.seasonBySlug('1')?.status).toBe('finished');
  });

  it('findet das nächste Rennen in der Zukunft mit veröffentlichter Aufstellung', () => {
    const next = league.nextRound()!;
    expect(next).toBeDefined();
    expect(next.season_id).toBe(season.id);
    expect(next.number).toBe(5);
    expect(next.status).toBe('lineup_published');
    expect(new Date(next.start_utc).getTime()).toBeGreaterThan(NOW.getTime());
    expect(league.entriesOf(next.id)).toHaveLength(22);
    const upcoming = league.upcomingRounds(3);
    expect(upcoming.map((r) => r.number)).toEqual([5, 6, 7]);
    // aufsteigend nach Startzeit
    expect([...upcoming].sort((a, b) => a.start_utc.localeCompare(b.start_utc))).toEqual(upcoming);
  });

  it('kennt das letzte gewertete Rennen samt offener Protestfrist', () => {
    const last = league.lastResultRound(season.id)!;
    expect(last.number).toBe(4);
    expect(last.status).toBe('provisional');
    expect(league.protestOpen(last)).toBe(true);
    const summary = league.roundSummary(last.id)!;
    expect(summary.hasResults).toBe(true);
    expect(summary.podium.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(summary.pole?.is_pole).toBe(true);
    expect(summary.fastestLap?.is_fastest_lap).toBe(true);
  });

  it('zeigt keine Aufstellung und keine Ergebnisse für geplante Runden', () => {
    const r6 = league.roundByNumber(season.id, 6)!;
    expect(r6.status).toBe('scheduled');
    expect(league.entriesOf(r6.id)).toEqual([]);
    expect(league.hasResults(r6.id)).toBe(false);
    expect(league.sessionsOf(r6.id).flatMap((s) => league.resultsOf(s.id))).toEqual([]);
  });

  it('ordnet Sessions als Qualifying → Sprint → Rennen', () => {
    const sprintRound = league.roundsOf(season.id).find((r) => r.format === 'sprint')!;
    expect(league.sessionsOf(sprintRound.id).map((s) => s.type)).toEqual(['qualifying', 'sprint', 'race']);
  });
});

describe('League – Wertungen', () => {
  const drivers = league.driverStandings(season.id);
  const teams = league.teamStandings(season.id);

  it('sortiert die Fahrerwertung absteigend mit fortlaufenden Positionen', () => {
    expect(drivers.length).toBeGreaterThanOrEqual(22);
    for (let i = 1; i < drivers.length; i++) {
      expect(drivers[i - 1]!.points).toBeGreaterThanOrEqual(drivers[i]!.points);
      expect(drivers[i]!.position).toBeGreaterThanOrEqual(drivers[i - 1]!.position);
    }
    expect(drivers[0]!.position).toBe(1);
    expect(drivers[0]!.gapToLeader).toBe(0);
    expect(drivers.every((d) => d.gapToLeader === drivers[0]!.points - d.points)).toBe(true);
  });

  it('zählt Siege plausibel (ein Sieger pro gewertetem Rennen bzw. Sprint)', () => {
    const counted = league.countedRounds(season.id);
    expect(counted.map((r) => r.number)).toEqual([1, 2, 3, 4]);
    const races = counted.length + counted.filter((r) => r.format === 'sprint').length;
    expect(drivers.reduce((sum, d) => sum + d.wins, 0)).toBeLessThanOrEqual(races);
    expect(drivers.reduce((sum, d) => sum + d.wins, 0)).toBeGreaterThanOrEqual(counted.length);
    expect(drivers.reduce((sum, d) => sum + d.poles, 0)).toBe(counted.length);
  });

  it('Konstrukteurspunkte = Fahrerpunkte, wenn Reservepunkte zählen (Saison 2)', () => {
    expect(season.reserve_points_for_constructors).toBe(true);
    const driverTotal = drivers.reduce((sum, d) => sum + d.points, 0);
    const teamTotal = teams.reduce((sum, t) => sum + t.points, 0);
    expect(teamTotal).toBe(driverTotal);
    expect(teams).toHaveLength(11);
  });

  it('Reservepunkte fehlen bei den Konstrukteuren, wenn die Saison es so will (Saison 1)', () => {
    const s1 = league.seasonBySlug('1')!;
    expect(s1.reserve_points_for_constructors).toBe(false);
    const driverTotal = league.driverStandings(s1.id).reduce((sum, d) => sum + d.points, 0);
    const teamTotal = league.teamStandings(s1.id).reduce((sum, t) => sum + t.points, 0);
    const reservePoints = league
      .standingsResults(s1.id)
      .filter((r) => r.role === 'reserve')
      .reduce((sum, r) => sum + r.points, 0);
    expect(reservePoints).toBeGreaterThanOrEqual(0);
    expect(teamTotal).toBe(driverTotal - reservePoints);
  });

  it('kann den Stand nach einer früheren Runde berechnen', () => {
    const after2 = league.driverStandings(season.id, 2);
    const total = (list: typeof after2) => list.reduce((s, d) => s + d.points, 0);
    expect(total(after2)).toBeLessThan(total(drivers));
    expect(after2[0]!.position).toBe(1);
  });

  it('liefert Matrix und Punkteverlauf für alle Wertungsfahrer', () => {
    const matrix = league.matrix(season.id);
    expect(matrix.length).toBe(drivers.length);
    const progression = league.driverProgression(season.id);
    expect(progression.length).toBeGreaterThan(0);
  });
});

describe('League – Fahrer, Profile, Stewards', () => {
  it('teilt die Fahrer in Stamm, Reserve und Ehemalige', () => {
    const roster = league.roster(season.id);
    expect(roster.regulars).toHaveLength(22);
    expect(new Set(roster.regulars.map((r) => r.driver.id)).size).toBe(22);
    expect(roster.reserves.map((d) => d.reserve_order)).toEqual([...roster.reserves.map((d) => d.reserve_order)].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(roster.former.map((d) => d.gamertag)).toEqual(expect.arrayContaining(['Retired_Ralf', 'Oldtimer_Otto']));
  });

  it('berechnet Karriere-Kennzahlen konsistent mit der Wertung', () => {
    const leader = league.driverStandings(season.id)[0]!;
    const career = league.driverCareer(leader.driverId, season.id);
    expect(career.points).toBe(leader.points);
    expect(career.wins).toBe(leader.wins);
    expect(career.starts).toBeGreaterThan(0);
    expect(league.driverSeasons(leader.driverId).length).toBeGreaterThan(0);
  });

  it('zeigt nur veröffentlichte Urteile, neueste zuerst', () => {
    const refs = league.decisions.map((d) => d.public_ref);
    expect(refs).not.toContain('S2-R04-01'); // Entwurf
    expect(refs).toContain('S1-R06-01');
    expect(league.decisions.every((d) => d.status === 'published')).toBe(true);
    const published = league.decisions.map((d) => d.published_at ?? '');
    expect([...published].sort().reverse()).toEqual(published);
    expect(league.decisionByRef('s2-r03-01')?.verdict).toBe('grid_penalty_next');
  });

  it('pseudonymisiert gelöschte Fahrer', () => {
    const data = demoDataset(NOW);
    data.drivers = data.drivers!.map((d) => (d.id === 29 ? { ...d, anonymized: true } : d));
    const anon = leagueFrom(data);
    expect(anon.driverName(29, 'de')).toBe('Ehemaliger Fahrer #29');
    expect(anon.driverName(29, 'en')).toBe('Former driver #29');
    expect(anon.driverName(9999)).toBe('Unbekannt');
  });
});

describe('League – Hall of Fame und Inhalte', () => {
  it('führt den Champion der abgeschlossenen Saison', () => {
    const hof = league.hallOfFame();
    expect(hof.champions).toHaveLength(1);
    const champ = hof.champions[0]!;
    expect(champ.season.number).toBe(1);
    expect(champ.driverId).toBe(league.driverStandings(champ.season.id)[0]!.driverId);
    expect(champ.teamId).not.toBeNull();
    expect(hof.titles).toEqual([{ driverId: champ.driverId, value: 1 }]);
  });

  it('sortiert die ewigen Bestenlisten absteigend (Top 10, Gleichstand an der Grenze inklusive)', () => {
    const hof = league.hallOfFame();
    for (const list of [hof.wins, hof.podiums, hof.poles, hof.fastestLaps, hof.starts, hof.points]) {
      expect(list.length).toBeGreaterThan(0);
      // mehr als 10 nur, wenn alle weiteren denselben Wert wie Platz 10 haben
      expect(list.slice(10).every((e) => e.value === list[9]!.value)).toBe(true);
      expect(list.every((e) => e.value > 0)).toBe(true);
      for (let i = 1; i < list.length; i++) expect(list[i - 1]!.value).toBeGreaterThanOrEqual(list[i]!.value);
    }
  });

  it('zeigt nur veröffentlichte News, neueste zuerst', () => {
    expect(league.news).toHaveLength(4);
    expect(league.news.every((n) => n.status === 'published')).toBe(true);
    expect(league.newsBySlug('saison-2-startet', 'de')?.id).toBe(1);
    expect(league.newsBySlug('season-2-kicks-off', 'en')?.id).toBe(1);
    expect(league.newsBySlug('rennbericht-r4-miami', 'de')).toBeUndefined();
  });

  it('fällt bei fehlender Übersetzung auf Deutsch zurück und markiert das', () => {
    const report = league.newsBySlug('rennbericht-r3-sakhir', 'de')!;
    expect(localized(report, 'body', 'en')).toMatchObject({ fallback: true });
    expect(localized(report, 'title', 'en')).toMatchObject({ fallback: false });
    expect(localized(report, 'body', 'de')).toMatchObject({ fallback: false });
  });

  it('liefert Regelwerk als Baum und öffentliche Einstellungen', () => {
    const version = league.rulesVersion!;
    expect(version.status).toBe('published');
    const tree = league.rulesTree(version.id);
    expect(tree[0]?.number).toBe('§1');
    expect(tree[0]?.children.length).toBeGreaterThan(0);
    expect(league.faq.length).toBeGreaterThan(0);
    expect(league.settings.registration.state).toBe('open');
    expect(league.settings.discord_counts.members).toBe(214);
  });
});
