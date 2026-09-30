/**
 * Fahrer des Tages (src/lib/people/awards.ts) und Daten des Fahrer-Vergleichs
 * (src/lib/people/compare.ts) gegen den Demo-Datensatz. Dazu reservierte Slugs
 * (/fahrer/vergleich darf nie von einer Profilseite überdeckt werden).
 */
import { describe, expect, it } from 'vitest';
import { useT } from '~/i18n';
import type { Dataset } from '~/lib/db/memory-store';
import type { AwardRow } from '~/lib/db/types';
import { decodeResults } from '~/lib/domain/h2h';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
import { driverProfileSlugs, isReservedDriverSlug, profileDrivers } from '~/lib/people';
import { dotdAwards, dotdCount, dotdLeaderboard, dotdOfRound, dotdRoundIds, hasDotd } from '~/lib/people/awards';
import { comparableDrivers, compareDefaults, compareOptionGroups, comparePayload, compareText } from '~/lib/people/compare';
import { demoDataset } from '~/lib/seed/demo';

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

const league = leagueFrom(demoDataset(NOW));
const season = league.currentSeason!;
const round = (n: number) => league.roundByNumber(season.id, n)!;

function withAwards(extra: Array<Partial<AwardRow>>): League {
  const dataset = demoDataset(NOW);
  dataset.awards = [...(dataset.awards ?? []), ...extra];
  return leagueFrom(dataset);
}

describe('Fahrer des Tages', () => {
  it('liefert eine Auszeichnung je gewerteter Runde, chronologisch', () => {
    const list = dotdAwards(league);
    expect(list.map((e) => e.round.number)).toEqual([1, 2, 3]);
    expect(list.map((e) => e.driverId)).toEqual([14, 9, 21]);
    expect(hasDotd(league)).toBe(true);
  });

  it('Team aus dem Rennergebnis, wenn die Auszeichnung keins hat', () => {
    const dotd = dotdOfRound(league, round(1).id)!;
    const race = league.sessionOf(round(1).id, 'race')!;
    const result = league.resultsOf(race.id).find((r) => r.driver_id === 14)!;
    expect(dotd).toEqual({ driverId: 14, teamId: result.team_id, reserve: result.role === 'reserve' });
    expect(dotdOfRound(league, round(6).id)).toBeNull();
  });

  it('Team aus der Auszeichnung hat Vorrang', () => {
    const l = withAwards([]);
    const award = l.data.awards.find((a) => a.type === 'driver_of_the_day' && a.round_id === round(2).id)!;
    award.team_id = 999;
    expect(dotdOfRound(l, round(2).id)!.teamId).toBe(999);
  });

  it('ignoriert Runden ohne veröffentlichtes Ergebnis und nimmt bei Dubletten die neueste', () => {
    const l = withAwards([
      { id: 90, season_id: season.id, round_id: round(6).id, type: 'driver_of_the_day', driver_id: 1, team_id: null },
      { id: 91, season_id: season.id, round_id: round(1).id, type: 'driver_of_the_day', driver_id: 2, team_id: null, updated_at: '2026-09-30T00:00:00.000Z' },
    ]);
    const list = dotdAwards(l);
    expect(list.some((e) => e.round.id === round(6).id)).toBe(false);
    expect(list.find((e) => e.round.id === round(1).id)!.driverId).toBe(2);
    expect(list).toHaveLength(3);
  });

  it('zählt je Fahrer (Karriere und Saison) und markiert die Runden', () => {
    expect(dotdCount(league, 14)).toBe(1);
    expect(dotdCount(league, 14, season.id)).toBe(1);
    const firstSeason = league.seasons.find((s) => s.status === 'finished')!;
    expect(dotdCount(league, 14, firstSeason.id)).toBe(0);
    expect([...dotdRoundIds(league, 9)]).toEqual([round(2).id]);
    expect(dotdCount(league, 1)).toBe(0);
  });

  it('Rangliste: absteigend, bei Gleichstand alphabetisch', () => {
    const l = withAwards([{ id: 92, season_id: season.id, round_id: round(4).id, type: 'driver_of_the_day', driver_id: 21, team_id: null }]);
    const board = dotdLeaderboard(l);
    expect(board[0]).toEqual({ driverId: 21, value: 2 });
    const rest = board.slice(1).map((e) => l.driverName(e.driverId));
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'de')));
  });

  it('ohne Auszeichnungen: keine Kennzahl, leere Rangliste', () => {
    const dataset = demoDataset(NOW);
    dataset.awards = (dataset.awards ?? []).filter((a) => a.type !== 'driver_of_the_day');
    const l = leagueFrom(dataset);
    expect(hasDotd(l)).toBe(false);
    expect(dotdLeaderboard(l)).toEqual([]);
  });
});

describe('Reservierte Slugs', () => {
  it('„vergleich“ und „compare“ werden nie als Profil erzeugt', () => {
    expect(isReservedDriverSlug('vergleich')).toBe(true);
    expect(isReservedDriverSlug('Compare')).toBe(true);
    expect(isReservedDriverSlug('apexanna')).toBe(false);
    const dataset = demoDataset(NOW);
    dataset.drivers = dataset.drivers!.map((d) => (d.id === 1 ? { ...d, slug: 'vergleich' } : d.id === 2 ? { ...d, slug: 'compare' } : d));
    const l = leagueFrom(dataset);
    expect(driverProfileSlugs(l)).not.toContain('vergleich');
    expect(driverProfileSlugs(l)).not.toContain('compare');
    expect(profileDrivers(l).some((d) => d.id === 1 || d.id === 2)).toBe(false);
  });
});

describe('Fahrer-Vergleich: Daten', () => {
  const t = useT('de');
  const payload = comparePayload(league, 'de', t);

  it('nur Fahrer mit Profil und Ergebnis, pseudonymisierte nie', () => {
    const dataset = demoDataset(NOW);
    dataset.drivers = dataset.drivers!.map((d) => (d.id === 29 ? { ...d, anonymized: true, gamertag: 'geloescht', slug: 'geloescht' } : d));
    const l = leagueFrom(dataset);
    const p = comparePayload(l, 'de', t);
    expect(p.drivers.some(([id]) => id === 29)).toBe(false);
    expect(p.results.some(([driverId]) => driverId === 29)).toBe(false);
    expect(JSON.stringify(p)).not.toContain('geloescht');
    expect(comparableDrivers(league).every((d) => league.driverResults(d.id).length > 0)).toBe(true);
  });

  it('enthält nur öffentliche Felder', () => {
    const json = JSON.stringify(payload);
    for (const secret of ['discord', 'ea_id', 'notes', 'email', 'reporter']) expect(json).not.toContain(secret);
    expect(payload.drivers[0]).toHaveLength(6);
  });

  it('Ergebnisse vollständig und dekodierbar', () => {
    const ids = new Set(payload.drivers.map(([id]) => id));
    const expected = league.standingsResults().filter((r) => ids.has(r.driverId));
    const decoded = decodeResults(payload.results, new Map(payload.rounds.map(([id, seasonId]) => [id, seasonId])));
    expect(decoded).toHaveLength(expected.length);
    expect(decoded.reduce((s, r) => s + r.points, 0)).toBe(expected.reduce((s, r) => s + r.points, 0));
    expect(payload.rounds.every(([, , label, href]) => label.startsWith('R') && href.startsWith('/rennen/'))).toBe(true);
    expect(payload.dotd).toHaveLength(3);
  });

  it('Saisons neueste zuerst, Vorauswahl = Platz 1 und 2', () => {
    expect(payload.seasons.map((s) => s.id)).toEqual(league.archiveSeasons.map((s) => s.id));
    const [first, second] = league.driverStandings(season.id);
    expect(compareDefaults(league)).toEqual({ a: league.driver(first!.driverId)!.slug, b: league.driver(second!.driverId)!.slug });
  });

  it('Auswahlgruppen: Fahrer der aktuellen Saison und frühere, ohne Überschneidung', () => {
    const groups = compareOptionGroups(league);
    const cur = groups.current.map((o) => o.driver.id);
    const earlier = groups.earlier.map((o) => o.driver.id);
    expect(cur.length).toBeGreaterThan(0);
    expect(earlier).toContain(29);
    expect(cur.filter((id) => earlier.includes(id))).toEqual([]);
    expect(cur.length + earlier.length).toBe(payload.drivers.length);
  });

  it('Texte behalten die Platzhalter fürs Skript', () => {
    const text = compareText(t);
    expect(text.pos).toBe('P{n}');
    expect(text.heading).toBe('{a} gegen {b}');
    expect(useT('en')('people.compare.heading', { a: 'X', b: 'Y' })).toBe('X vs Y');
  });
});
