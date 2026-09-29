import { beforeAll, describe, expect, it } from 'vitest';
import { useT } from '~/i18n';
import { MemoryStore } from '~/lib/db/memory-store';
import type { RulesVersionRow } from '~/lib/db/types';
import type { DriverStanding, TeamStanding } from '~/lib/domain/standings';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
import { demoDataset } from '~/lib/seed/demo';
import { BOM, csvCell, csvDocument, csvFileName, csvHref, csvResponse, csvRow, driverStandingsCsv } from '~/lib/standings/csv';
import {
  movements,
  roundNeighbours,
  ruleNumber,
  schemeSummary,
  seasonChampions,
  seasonStandingsPaths,
  standingsAfterPaths,
  standingsNumber,
  standingsNumbersAt,
  TAB_ANCHORS,
  tieRuleLink,
} from '~/lib/standings/page';
import { seasonLabel } from '~/lib/view';

const tally = { wins: 0, podiums: 0, poles: 0, fastestLaps: 0, starts: 0, dnfs: 0, bestFinish: null, raceFinishes: [], sprintFinishes: [] };
const ds = (driverId: number, position: number, points: number): DriverStanding => ({
  ...tally,
  driverId,
  teamId: 1,
  position,
  points,
  tied: false,
  gapToLeader: 0,
  reserveStarts: 0,
});
const ts = (teamId: number, position: number, points: number): TeamStanding => ({ ...tally, teamId, position, points, tied: false, gapToLeader: 0 });

describe('CSV-Felder', () => {
  it('lässt einfache Werte und Zahlen unverändert', () => {
    expect(csvCell('ApexAnna')).toBe('ApexAnna');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });

  it('quotet Semikolon, Anführungszeichen, Zeilenumbrüche und Rand-Leerzeichen', () => {
    expect(csvCell('Red Bull; Racing')).toBe('"Red Bull; Racing"');
    expect(csvCell('Der "Pilot"')).toBe('"Der ""Pilot"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(' leer ')).toBe('" leer "');
  });

  it('entschärft Formeln am Textanfang', () => {
    expect(csvCell('=SUMME(A1)')).toBe("'=SUMME(A1)");
    expect(csvCell('+49')).toBe("'+49");
    expect(csvCell('-rf')).toBe("'-rf");
    expect(csvCell('@home')).toBe("'@home");
    // Zahlen bleiben Zahlen, auch negative
    expect(csvCell(-3)).toBe('-3');
    // Formel mit Semikolon: erst entschärfen, dann quoten
    expect(csvCell('=A1;B1')).toBe(`"'=A1;B1"`);
  });

  it('baut Zeilen mit Semikolon und Dokumente mit BOM und CRLF', () => {
    expect(csvRow(['a', 1, null, 'b;c'])).toBe('a;1;;"b;c"');
    const doc = csvDocument([
      ['x', 'y'],
      [1, 2],
    ]);
    expect(doc.charCodeAt(0)).toBe(0xfeff);
    expect(doc.startsWith(BOM)).toBe(true);
    expect(doc.slice(1)).toBe('x;y\r\n1;2\r\n');
  });

  it('erzeugt sichere Dateinamen je Sprache', () => {
    expect(csvFileName('2')).toBe('wertung-saison-2.csv');
    expect(csvFileName('Saison 3/../x')).toBe('wertung-saison-saison-3-x.csv');
    expect(csvFileName('')).toBe('wertung-saison-saison.csv');
    expect(csvFileName('2', 'en')).toBe('standings-season-2.csv');
    expect(csvFileName('', 'en')).toBe('standings-season-season.csv');
  });

  it('verlinkt je Sprache die passende CSV-Datei', () => {
    expect(csvHref('de', '2')).toBe('/saison/2/wertung.csv');
    expect(csvHref('en', '2')).toBe('/en/season/2/standings.csv');
  });
});

describe('Positionsveränderung', () => {
  it('liefert ohne Vorrunde keine Veränderung', () => {
    expect(movements([{ id: 1, position: 1 }], null).size).toBe(0);
  });

  it('erkennt gewonnene, verlorene, gehaltene und neue Plätze', () => {
    const prev = [
      { id: 1, position: 1 },
      { id: 2, position: 2 },
      { id: 3, position: 5 },
    ];
    const cur = [
      { id: 3, position: 1 },
      { id: 1, position: 2 },
      { id: 2, position: 2 },
      { id: 4, position: 4 },
    ];
    const m = movements(cur, prev);
    expect(m.get(3)).toEqual({ kind: 'up', n: 4 });
    expect(m.get(1)).toEqual({ kind: 'down', n: 1 });
    expect(m.get(2)).toEqual({ kind: 'same', n: 0 });
    expect(m.get(4)).toEqual({ kind: 'new', n: 0 });
  });
});

describe('Saisons und Punkteschema', () => {
  it('nutzt den zentralen Saisonnamen (Standardmuster übersetzt, eigene Namen bleiben)', () => {
    expect(seasonLabel({ number: 2, name: 'Saison 2' }, 'en')).toBe('Season 2');
    expect(seasonLabel({ number: 2, name: 'Saison 2' }, 'de')).toBe('Saison 2');
    expect(seasonLabel({ number: 3, name: '' }, 'de')).toBe('Saison 3');
    expect(seasonLabel({ number: 4, name: 'Winter Cup 2027' }, 'en')).toBe('Winter Cup 2027');
  });

  it('fasst das Punkteschema zusammen (inkl. Bedingung für die schnellste Runde)', () => {
    const s = schemeSummary({
      name: 'Test',
      race_points: [25, 18, 15],
      sprint_points: [8, 7, 6, 5],
      fastest_lap_bonus: 1,
      fastest_lap_max_pos: 10,
      pole_bonus: 0,
    });
    expect(s.places).toEqual([1, 2, 3, 4]);
    expect(s.race).toEqual([25, 18, 15, null]);
    expect(s.sprint).toEqual([8, 7, 6, 5]);
    expect(s.fastestLap).toEqual({ bonus: 1, maxPos: 10 });
    expect(s.pole).toBeNull();
  });

  it('blendet Sprint und Boni aus, wenn es keine gibt', () => {
    const s = schemeSummary({ name: 'x', race_points: [10, 5], sprint_points: [0, 0], fastest_lap_bonus: 0, fastest_lap_max_pos: null, pole_bonus: 2 });
    expect(s.places).toEqual([1, 2]);
    expect(s.sprint).toBeNull();
    expect(s.fastestLap).toBeNull();
    expect(s.pole).toBe(2);
  });

  it('findet die §-Nummer der Gleichstands-Regel in der gültigen Version', () => {
    const sections = [
      { version_id: 1, anchor: 'p1-6', number: '§1.6' },
      { version_id: 2, anchor: 'p1-6', number: '§1.7' },
    ];
    expect(ruleNumber(sections, 2)).toBe('§1.7');
    expect(ruleNumber(sections, 3)).toBeNull();
    expect(ruleNumber(sections, undefined)).toBeNull();
  });

  it('verlinkt die Gleichstands-Regel in der Fassung der Saison', () => {
    const v1 = { id: 1, version: '1.0' } as RulesVersionRow;
    const v2 = { id: 2, version: '2.0' } as RulesVersionRow;
    const league = {
      rulesVersion: v2,
      rulesVersions: [v2, v1],
      data: {
        rules_sections: [
          { version_id: 1, anchor: 'p1-6', number: '§1.6' },
          { version_id: 2, anchor: 'p1-6', number: '§1.7' },
        ],
      },
    } as unknown as Pick<League, 'rulesVersion' | 'rulesVersions' | 'data'>;
    // Aktuelle Fassung → /liga/regelwerk
    expect(tieRuleLink(league, 'de', { rules_version_id: 2 })).toEqual({ href: '/liga/regelwerk#p1-6', number: '§1.7' });
    expect(tieRuleLink(league, 'en', undefined)).toEqual({ href: '/en/league/rules#p1-6', number: '§1.7' });
    // Archiv-Saison mit älterer Fassung → versionierte Adresse und deren §-Nummer
    expect(tieRuleLink(league, 'de', { rules_version_id: 1 })).toEqual({ href: '/liga/regelwerk/v/1.0#p1-6', number: '§1.6' });
    expect(tieRuleLink(league, 'en', { rules_version_id: 1 })).toEqual({ href: '/en/league/rules/v/1.0#p1-6', number: '§1.6' });
    // Unbekannte/unveröffentlichte Fassung → gültige Fassung
    expect(tieRuleLink(league, 'de', { rules_version_id: 99 }).number).toBe('§1.7');
    // Abschnitt fehlt → Regelwerk ohne Anker
    const bare = { ...league, data: { rules_sections: [] } } as unknown as typeof league;
    expect(tieRuleLink(bare, 'de', undefined)).toEqual({ href: '/liga/regelwerk', number: null });
  });
});

describe('Champions', () => {
  const drivers = [ds(7, 1, 120), ds(8, 2, 100)];
  const teams = [ts(1, 1, 200), ts(2, 2, 150)];

  it('gibt für laufende Saisons keine Champions aus', () => {
    expect(seasonChampions({ id: 1, status: 'active' }, [], drivers, teams)).toBeNull();
  });

  it('nimmt Platz 1 der Wertung, wenn keine Auszeichnung gespeichert ist', () => {
    expect(seasonChampions({ id: 1, status: 'finished' }, [], drivers, teams)).toEqual({
      driverId: 7,
      driverPoints: 120,
      teamId: 1,
      teamPoints: 200,
    });
  });

  it('bevorzugt gespeicherte Auszeichnungen', () => {
    const awards = [
      { season_id: 1, type: 'champion' as const, driver_id: 8, team_id: null },
      { season_id: 1, type: 'constructors' as const, driver_id: null, team_id: 2 },
      { season_id: 2, type: 'champion' as const, driver_id: 99, team_id: null },
    ];
    expect(seasonChampions({ id: 1, status: 'finished' }, awards, drivers, teams)).toEqual({
      driverId: 8,
      driverPoints: 100,
      teamId: 2,
      teamPoints: 150,
    });
  });
});

describe('Wertungsseiten mit Demo-Daten', () => {
  let league: League;

  beforeAll(async () => {
    const store = new MemoryStore(demoDataset(new Date('2026-09-29T12:00:00Z')));
    const entries = await Promise.all(LEAGUE_TABLES.map(async (table) => [table, await store.select(table)] as const));
    league = new League(Object.fromEntries(entries) as unknown as LeagueDataset, new Date('2026-09-29T12:00:00Z'));
  });

  it('erzeugt Pfade für jede Saison mit Wertung und jede gewertete Runde', () => {
    const seasons = seasonStandingsPaths(league);
    expect(seasons.map((p) => p.params.season).sort()).toEqual(league.archiveSeasons.map((s) => s.slug).sort());
    const after = standingsAfterPaths(league);
    const expected = league.archiveSeasons.reduce((n, s) => n + league.countedRounds(s.id).length, 0);
    expect(after).toHaveLength(expected);
    expect(after.every((p) => /^\d+$/.test(p.params.round))).toBe(true);
  });

  it('findet Vor- und Folgerunde nur unter gewerteten Runden', () => {
    const season = league.archiveSeasons.find((s) => league.countedRounds(s.id).length >= 2)!;
    const counted = league.countedRounds(season.id);
    const first = roundNeighbours(league, season.id, counted[0]!.number);
    expect(first.previous).toBeUndefined();
    expect(first.next?.number).toBe(counted[1]!.number);
    const last = roundNeighbours(league, season.id, counted.at(-1)!.number);
    expect(last.next).toBeUndefined();
    expect(roundNeighbours(league, season.id, 999).current).toBeUndefined();
  });

  it('exportiert die Fahrerwertung als Excel-taugliche CSV', () => {
    const season = league.archiveSeasons[0]!;
    const csv = driverStandingsCsv(league, season.id, useT('de'));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines.at(-1)).toBe('');
    expect(lines[0]).toBe('Position;Nummer;Gamertag;Team;Punkte;Rückstand;Siege;Podien;Poles;Schnellste Runden;Reserve');
    const standings = league.driverStandings(season.id);
    expect(lines).toHaveLength(standings.length + 2);
    const rows = lines.slice(1, -1).map((l) => l.split(';'));
    expect(rows.every((r) => r.length === 11)).toBe(true);
    expect(rows[0]![0]).toBe(String(standings[0]!.position));
    expect(rows[0]![4]).toBe(String(standings[0]!.points));
    // Rückstand als positive Zahl (auf der Seite „−29“), der Führende hat 0
    expect(rows[0]![5]).toBe('0');
    rows.forEach((r, i) => expect(r[5]).toBe(String(standings[i]!.gapToLeader)));
    // Reserve-Kennzeichen wie auf der Seite
    expect(rows.some((r) => r[10] === 'ja')).toBe(true);
  });

  it('exportiert auf Englisch mit englischen Spaltenköpfen und Dateinamen', async () => {
    const season = league.archiveSeasons[0]!;
    const csv = driverStandingsCsv(league, season.id, useT('en'), 'en');
    expect(csv.slice(1).split('\r\n')[0]).toBe('Position;Number;Gamertag;Team;Points;Points behind;Wins;Podiums;Poles;Fastest laps;Reserve');
    const res = csvResponse(league, season.slug, 'en');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(`attachment; filename="standings-season-${season.slug}.csv"`);
    const body = new Uint8Array(await res.arrayBuffer());
    expect([...body.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csvResponse(league, 'gibt-es-nicht', 'de').status).toBe(404);
  });

  it('nimmt Startnummern im Archiv zum Stand der letzten Runde – auf der Seite wie im CSV', () => {
    const finished = league.archiveSeasons.find((s) => s.status === 'finished')!;
    const active = league.archiveSeasons.find((s) => s.status === 'active')!;
    const last = league.countedRounds(finished.id).at(-1)!;
    expect(standingsNumbersAt(league, finished)?.toISOString()).toBe(new Date(last.start_utc).toISOString());
    expect(standingsNumbersAt(league, active)).toBeNull();

    const at = standingsNumbersAt(league, finished);
    const standings = league.driverStandings(finished.id);
    const rows = driverStandingsCsv(league, finished.id, useT('de')).slice(1).split('\r\n').slice(1, -1);
    expect(rows).toHaveLength(standings.length);
    rows.forEach((row, i) => {
      const expected = standingsNumber(league, standings[i]!.driverId, at);
      expect(row.split(';')[1]).toBe(expected == null ? '' : String(expected));
    });
    // Ehemalige Fahrer ohne aktuelle Nummer haben im Archiv trotzdem ihre damalige
    const historic = standings.filter((s) => league.numberOf(s.driverId) == null && league.numberAt(s.driverId, at!) != null);
    expect(historic.length).toBeGreaterThan(0);
    for (const s of historic) expect(standingsNumber(league, s.driverId, at)).toBe(league.numberAt(s.driverId, at!));
    // Gewechselte Nummern: im Archiv die damalige
    const changed = standings.filter((s) => league.numberOf(s.driverId) != null && league.numberAt(s.driverId, at!) !== league.numberOf(s.driverId));
    expect(changed.length).toBeGreaterThan(0);
    for (const s of changed) expect(standingsNumber(league, s.driverId, at)).toBe(league.numberAt(s.driverId, at!));
  });

  it('greift mit Stichtag nie auf eine später vergebene Nummer zurück (wie DriverStandingsTable)', () => {
    const before = new Date('2026-04-01T00:00:00Z');
    const late = league.drivers.find((d) => {
      const first = league.numberHistory(d.id)[0];
      return first != null && new Date(first.valid_from) > before;
    });
    expect(late).toBeDefined();
    expect(league.numberOf(late!.id)).not.toBeNull();
    expect(standingsNumber(league, late!.id, before)).toBeNull();
    expect(standingsNumber(league, late!.id, null)).toBe(league.numberOf(late!.id));
  });

  it('hat für jede Sprache eigene Tab-Anker', () => {
    expect(new Set(Object.values(TAB_ANCHORS.de)).size).toBe(3);
    expect(new Set(Object.values(TAB_ANCHORS.en)).size).toBe(3);
  });
});
