/**
 * Sichten für Fahrer, Teams, Hall of Fame und Archiv (src/lib/people) gegen den Demo-Datensatz:
 * Profilseiten, Rollen, Ergebnisgruppen, Nummern-Historie, Duelle, Punkteverlauf, Ranglisten
 * und Archiv. Dazu Datenschutz: pseudonymisierte Fahrer bekommen keine Profilseite.
 */
import { describe, expect, it } from 'vitest';
import type { Dataset } from '~/lib/db/memory-store';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
import {
  archiveOverview,
  constructorTitles,
  driverDuels,
  driverProfileSlugs,
  driverRole,
  hasProfile,
  numberPeriods,
  platformCounts,
  profileDrivers,
  progressionSteps,
  rankByValue,
  regularsByTeam,
  resultsBySeason,
  safeExternalUrl,
  seasonTitle,
  signed,
  teamDrivers,
  teamDuel,
  teamPageSlugs,
  teamReserveBySeason,
  teamSeasonDrivers,
} from '~/lib/people';
import { demoDataset } from '~/lib/seed/demo';

const NOW = new Date('2026-10-15T12:00:00Z');
const STAMP = '2026-01-01T00:00:00.000Z';

/** Demo-Datensatz wie ihn der Loader liefert (öffentliche Tabellen mit Zeitstempeln). */
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
const byTag = (tag: string) => league.drivers.find((d) => d.gamertag === tag)!;

describe('Anzeige', () => {
  it('übersetzt das Standardmuster des Saisonnamens, eigene Namen bleiben', () => {
    expect(seasonTitle({ number: 2, name: 'Saison 2' }, 'en')).toBe('Season 2');
    expect(seasonTitle({ number: 2, name: 'Saison 2' }, 'de')).toBe('Saison 2');
    expect(seasonTitle({ number: 3, name: '' }, 'de')).toBe('Saison 3');
    expect(seasonTitle({ number: 4, name: 'Winter Cup' }, 'en')).toBe('Winter Cup');
  });
});

describe('Profilseiten', () => {
  it('erzeugt Profile für alle Fahrer mit Ergebnis, Nummer oder Cockpit', () => {
    const slugs = driverProfileSlugs(league);
    expect(slugs).toHaveLength(30);
    expect(slugs).toContain(byTag('ApexAnna').slug);
    expect(slugs).toContain(byTag('Retired_Ralf').slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('erzeugt für pseudonymisierte Fahrer keine Profilseite und keinen Link', () => {
    const dataset = demoDataset(NOW);
    dataset.drivers = dataset.drivers!.map((d) => (d.id === 29 ? { ...d, anonymized: true, gamertag: 'geloescht', slug: 'geloescht' } : d));
    const anon = leagueFrom(dataset);
    expect(profileDrivers(anon).some((d) => d.id === 29)).toBe(false);
    expect(driverProfileSlugs(anon)).not.toContain('geloescht');
    expect(hasProfile(anon.driver(29))).toBe(false);
    expect(hasProfile(anon.driver(1))).toBe(true);
    expect(anon.driverName(29, 'de')).toBe('Ehemaliger Fahrer #29');
  });

  it('erzeugt Teamseiten für alle Teams, die in einer Saison vorkommen', () => {
    const slugs = teamPageSlugs(league);
    expect(slugs).toHaveLength(11);
    expect(slugs).toContain('mclaren');
    expect(slugs).toContain('cadillac');
  });
});

describe('Fahrerliste', () => {
  it('bestimmt die Rolle aus Cockpit bzw. Status', () => {
    expect(driverRole(league, byTag('ApexAnna'), season.id)).toBe('regular');
    expect(driverRole(league, byTag('Reserve_Rico'), season.id)).toBe('reserve');
    expect(driverRole(league, byTag('Retired_Ralf'), season.id)).toBe('former');
  });

  it('gruppiert die Stammfahrer nach Team in Saison-Reihenfolge', () => {
    const groups = regularsByTeam(league, season.id);
    expect(groups).toHaveLength(11);
    expect(groups.every((g) => g.drivers.length === 2)).toBe(true);
    expect(groups[0]!.team.slug).toBe('mclaren');
    // Transfer ab Runde 3: ChicaneCharlie fährt jetzt für Red Bull Racing
    const rbr = groups.find((g) => g.team.slug === 'red-bull-racing')!;
    expect(rbr.drivers.map((d) => d.driver.gamertag)).toContain('ChicaneCharlie');
  });

  it('zählt Plattformen (PC zusammengefasst)', () => {
    const counts = platformCounts(league.drivers);
    expect(counts.pc + counts.playstation + counts.xbox).toBe(30);
    expect(counts.pc).toBe(league.drivers.filter((d) => d.platform.startsWith('pc_')).length);
  });
});

describe('Fahrerprofil', () => {
  it('gruppiert Ergebnisse nach Saison, neueste Saison zuerst und chronologisch', () => {
    const groups = resultsBySeason(league.driverResults(byTag('ApexAnna').id));
    expect(groups.map((g) => g.season.number)).toEqual([2, 1]);
    const rounds = groups[0]!.rows.map((r) => r.round.number);
    expect(rounds).toEqual([...rounds].sort((a, b) => a - b));
    // Qualifying vor Rennen innerhalb einer Runde
    const first = groups[0]!.rows.filter((r) => r.round.number === 1).map((r) => r.session.type);
    expect(first).toEqual(['qualifying', 'race']);
    expect(groups[0]!.points).toBe(groups[0]!.rows.reduce((s, r) => s + r.result.points, 0));
  });

  it('kennzeichnet die Nummern-Historie (aktuell/früher), neueste zuerst', () => {
    const periods = numberPeriods(league, byTag('Slipstream_Sam').id);
    expect(periods.map((p) => p.row.number)).toEqual([8, 44]);
    expect(periods.map((p) => p.state)).toEqual(['current', 'past']);
  });

  it('liefert das Teamkollegen-Duell nur über gemeinsame Runden', () => {
    const [duel] = driverDuels(league, byTag('ApexAnna').id, season.id);
    expect(duel?.mate.gamertag).toBe('KerbKiller77');
    expect(duel!.duel.rounds.length).toBeGreaterThan(0);
    // Reservefahrer ohne Cockpit haben kein Duell
    expect(driverDuels(league, byTag('Reserve_Rico').id, season.id)).toEqual([]);
  });

  it('baut den Punkteverlauf kumuliert bis zum aktuellen Stand', () => {
    const anna = byTag('ApexAnna');
    const steps = progressionSteps(league, 'driver', season.id, anna.id);
    expect(steps).toHaveLength(league.countedRounds(season.id).length);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!.total).toBeGreaterThanOrEqual(steps[i - 1]!.total);
    expect(steps.reduce((s, x) => s + x.delta, 0)).toBe(steps.at(-1)!.total);
    const standing = league.driverStandings(season.id).find((s) => s.driverId === anna.id)!;
    expect(steps.at(-1)!.total).toBe(standing.points);
    expect(steps.at(-1)!.position).toBe(standing.position);
  });

  it('lässt nur http(s)-Links nach außen zu', () => {
    expect(safeExternalUrl('https://www.twitch.tv/beispiel')).toBe('https://www.twitch.tv/beispiel');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('kein link')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });

  it('formatiert Differenzen mit echtem Minuszeichen', () => {
    expect(signed(12)).toBe('+12');
    expect(signed(0)).toBe('0');
    expect(signed(-3)).toBe(`${String.fromCharCode(0x2212)}3`);
  });
});

describe('Teamseite', () => {
  const rbr = league.teamBySlug('red-bull-racing')!;

  it('liefert die aktuellen Fahrer in Cockpit-Reihenfolge', () => {
    expect(teamDrivers(league, rbr.id, season.id).map((d) => d.seatNo)).toEqual([1, 2]);
  });

  it('zählt im internen Duell nur Runden, in denen beide für das Team fuhren', () => {
    const duel = teamDuel(league, rbr.id, season.id)!;
    expect(duel.a.gamertag).toBe('ChicaneCharlie');
    const numbers = duel.duel.rounds.map((r) => league.round(r.roundId)!.number).sort();
    expect(numbers.every((n) => n >= 3)).toBe(true);
  });

  it('listet alle Stammfahrer einer Saison einmal (auch nach Transfer)', () => {
    const names = teamSeasonDrivers(league, rbr.id, season.id).map((d) => d.gamertag);
    expect(names).toEqual(expect.arrayContaining(['DRS_Dani', 'ChicaneCharlie', 'TurboTobi']));
    expect(new Set(names).size).toBe(names.length);
  });

  it('gruppiert Reserve-Einsätze nach Saison', () => {
    const merc = league.teamBySlug('mercedes')!;
    const groups = teamReserveBySeason(league, merc.id);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.items.every((i) => i.entry.role === 'reserve' && i.entry.team_id === merc.id))).toBe(true);
  });
});

describe('Hall of Fame', () => {
  it('vergibt Ränge mit Gleichstand', () => {
    const ranked = rankByValue([{ value: 9 }, { value: 5 }, { value: 5 }, { value: 2 }]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(ranked.map((r) => r.tied)).toEqual([false, true, true, false]);
  });

  it('zählt Konstrukteurstitel je Team', () => {
    expect(constructorTitles([{ teamId: 2 }, { teamId: 1 }, { teamId: 2 }, { teamId: null }])).toEqual([
      { teamId: 2, value: 2 },
      { teamId: 1, value: 1 },
    ]);
    const hof = league.hallOfFame();
    expect(constructorTitles(hof.champions)).toHaveLength(1);
  });
});

describe('Archiv', () => {
  const entries = archiveOverview(league);

  it('zeigt alle Saisons, neueste zuerst, abgeschlossene eingefroren', () => {
    expect(entries.map((e) => e.season.number)).toEqual([2, 1]);
    expect(entries.map((e) => e.frozen)).toEqual([false, true]);
  });

  it('liefert Endstand, Champion und Konstrukteurs-Champion der abgeschlossenen Saison', () => {
    const s1 = entries.find((e) => e.season.number === 1)!;
    expect(s1.top3).toHaveLength(3);
    expect(s1.completed).toBe(s1.scheduled);
    const award = league.awardsOf(s1.season.id).find((a) => a.type === 'champion')!;
    expect(s1.championId).toBe(award.driver_id);
    const constructors = league.awardsOf(s1.season.id).find((a) => a.type === 'constructors')!;
    expect(s1.constructors?.teamId).toBe(constructors.team_id);
  });

  it('führt geplante Saisons ohne Wertung', () => {
    const dataset = demoDataset(NOW);
    dataset.seasons = [...dataset.seasons!, { ...dataset.seasons![1]!, id: 3, number: 3, slug: '3', name: 'Saison 3', status: 'planned' }];
    const planned = archiveOverview(leagueFrom(dataset)).find((e) => e.season.number === 3)!;
    expect(planned.top3).toEqual([]);
    expect(planned.constructors).toBeUndefined();
    expect(planned.frozen).toBe(false);
    expect(planned.championId).toBeNull();
  });
});
