/**
 * Live-Daten für Overlays und Discord-Bot (src/lib/server/live-data.ts) gegen den Demo-Datensatz:
 * gleiche Wertung wie die League (statische Seiten), nur gewertete Ergebnisse, nur öffentliche
 * Tabellen (gezielte Abfragen statt loadLeague), Aufstellung, Ergebnis, Laufband, Fahrersuche.
 */
import { describe, expect, it } from 'vitest';
import { MemoryStore, type Dataset } from '~/lib/db/memory-store';
import type { Store } from '~/lib/db/store';
import type { ResultRow, TableName } from '~/lib/db/types';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
import { demoDataset } from '~/lib/seed/demo';
import {
  buildOverlayPayload,
  driverProfile,
  driverSuggestions,
  findDriver,
  lineupPayload,
  liveDriverStandings,
  liveTeamStandings,
  loadLiveSnapshot,
  nextRacePayload,
  overlayParts,
  pickCurrentSeason,
  pickLineupRound,
  pickNextRound,
  resultDetail,
  resultPayload,
  standingsPayload,
  tickerPayload,
} from '~/lib/server/live-data';

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

/** Store, der mitschreibt, welche Tabellen gelesen werden. */
function spyStore(inner: Store): { store: Store; tables: TableName[] } {
  const tables: TableName[] = [];
  const store = new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'select') {
        return (table: TableName, filter?: unknown) => {
          tables.push(table);
          return (target.select as (t: TableName, f?: unknown) => Promise<unknown>).call(target, table, filter);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return { store, tables };
}

const dataset = demoDataset(NOW);
const league = leagueFrom(dataset);
const season = league.currentSeason!;

async function snapshot(parts = ['results', 'entries', 'seats'] as const, data: Dataset = demoDataset(NOW), now = NOW) {
  return loadLiveSnapshot(new MemoryStore(data), parts, now);
}

describe('Snapshot', () => {
  it('liest nur öffentliche Tabellen – nie private Fahrerdaten, Anmeldungen, Kontakt, Einstellungen', async () => {
    const { store, tables } = spyStore(new MemoryStore(demoDataset(NOW)));
    await loadLiveSnapshot(store, ['results', 'entries', 'seats'], NOW);
    const allowed: TableName[] = ['seasons', 'rounds', 'tracks', 'teams', 'season_teams', 'drivers', 'driver_numbers', 'sessions', 'results', 'round_entries', 'seats'];
    expect(tables.every((t) => allowed.includes(t))).toBe(true);
    expect(tables).not.toContain('driver_private');
    expect(tables).not.toContain('registrations');
    expect(tables).not.toContain('settings');
    // Countdown braucht weder Ergebnisse noch Aufstellungen
    const light = spyStore(new MemoryStore(demoDataset(NOW)));
    await loadLiveSnapshot(light.store, overlayParts('naechstes-rennen'), NOW);
    expect(light.tables).not.toContain('results');
    expect(light.tables).not.toContain('round_entries');
  });

  it('aktuelle und nächste Runde wie die League', async () => {
    const snap = await snapshot();
    expect(pickCurrentSeason(snap.seasons)?.id).toBe(season.id);
    expect(snap.season?.id).toBe(season.id);
    expect(pickNextRound(snap.rounds, NOW)?.id).toBe(league.nextRound()?.id);
  });

  it('Ergebnisse nicht gewerteter Runden werden verworfen (zusätzlich zur RLS)', async () => {
    const data = demoDataset(NOW);
    const r5 = data.rounds!.find((r) => r.season_id === 2 && r.number === 5)!;
    const race = data.sessions!.find((s) => s.round_id === r5.id && s.type === 'race')!;
    data.results!.push({ ...data.results![0]!, id: 99_001, session_id: race.id, position: 1, points: 500 } as ResultRow);
    // Ergebnis-Runde der aktuellen Saison auch als „letzte Runde“ laden lassen
    const snap = await snapshot(['results'], data);
    expect(snap.results.some((r) => r.id === 99_001)).toBe(false);
    expect(liveDriverStandings(snap)[0]!.points).toBeLessThan(500);
  });
});

describe('Wertung', () => {
  it('Fahrer- und Teamwertung identisch zur League (statische Seiten)', async () => {
    const snap = await snapshot();
    const pick = (s: { position: number; points: number; tied: boolean }) => [s.position, s.points, s.tied];
    expect(liveDriverStandings(snap).map((s) => [s.driverId, ...pick(s)])).toEqual(league.driverStandings(season.id).map((s) => [s.driverId, ...pick(s)]));
    expect(liveTeamStandings(snap).map((s) => [s.teamId, ...pick(s)])).toEqual(league.teamStandings(season.id).map((s) => [s.teamId, ...pick(s)]));
  });

  it('Top N mit Abstand, Teamfarbe und Stand nach Runde X', async () => {
    const snap = await snapshot();
    const p = standingsPayload(snap, 'de', 'drivers', 5);
    expect(p.rows).toHaveLength(5);
    expect(p.afterRound).toBe(league.countedRounds(season.id).at(-1)!.number);
    expect(p.seasonName).toBe('Saison 2');
    const leader = league.driverStandings(season.id)[0]!;
    expect(p.rows[0]).toMatchObject({ pos: '1', name: league.driverName(leader.driverId), detail: null });
    expect(p.rows[1]!.detail).toMatch(/^−\d+$/);
    expect(p.rows[0]!.color).toMatch(/^#[0-9A-F]{6}$/i);
    const teams = standingsPayload(snap, 'en', 'teams', 22);
    expect(teams.rows).toHaveLength(league.teamsOf(season.id).length);
    expect(teams.rows[0]!.number).toBeNull();
    expect(teams.seasonName).toBe('Season 2');
  });
});

describe('Nächstes Rennen und Aufstellung', () => {
  it('nächstes Rennen mit Label, Liga-Zeit und Rennseite', async () => {
    const snap = await snapshot([]);
    const next = league.nextRound()!;
    const p = nextRacePayload(snap, 'de');
    expect(p.round).toMatchObject({ number: next.number, startUtc: next.start_utc, path: `/rennen/2/${next.number}` });
    expect(p.round!.label).toMatch(/^R\d+ · /);
    expect(p.round!.dateText).toMatch(/\d{2}:\d{2} MES?Z$/);
    expect(nextRacePayload(snap, 'en').round!.path).toBe(`/en/races/2/${next.number}`);
  });

  it('Aufstellung der laufenden Runde (bis 12 h nach Start) nach Team, Ersatz mit „für …“', async () => {
    // Demo: R5 ist vor ~3 h gestartet, Aufstellung veröffentlicht
    const snap = await snapshot(['entries']);
    const r5 = league.data.rounds.find((r) => r.season_id === 2 && r.number === 5)!;
    expect(pickLineupRound(snap.rounds, NOW)?.id).toBe(r5.id);
    const p = lineupPayload(snap, 'de');
    expect(p.published).toBe(true);
    expect(p.round?.number).toBe(5);
    expect(p.teams.map((t) => t.name)).toEqual(league.teamsOf(season.id).map((t) => t.name));
    expect(p.teams.flatMap((t) => t.drivers)).toHaveLength(league.entriesOf(r5.id).length);
    const reserve = p.teams.flatMap((t) => t.drivers).find((d) => d.reserve)!;
    expect(reserve.replaces).toBeTruthy();
    // 13 h nach dem Start gilt die nächste (noch geplante) Runde → noch keine Aufstellung
    const later = new Date(new Date(r5.start_utc).getTime() + 13 * 3_600_000);
    const snapLater = await snapshot(['entries'], demoDataset(NOW), later);
    const pl = lineupPayload(snapLater, 'de');
    expect(pl.round?.number).toBe(6);
    expect(pl.published).toBe(false);
    expect(pl.teams).toEqual([]);
  });
});

describe('Ergebnis und Laufband', () => {
  it('Ergebnis der zuletzt gewerteten Runde (Hauptrennen) mit Pole/schnellster Runde', async () => {
    const snap = await snapshot();
    const last = league.lastResultRound()!;
    const p = resultPayload(snap, 'de', 22);
    expect(p.round?.number).toBe(last.number);
    expect(p.statusText).toBe(last.status === 'provisional' ? 'vorläufig' : expect.any(String));
    const race = league.resultsOf(league.sessionOf(last.id, 'race')!.id);
    expect(p.rows.map((r) => r.name)).toEqual(race.map((r) => league.driverName(r.driver_id)));
    expect(p.rows.filter((r) => r.marks.includes('fastestLap'))).toHaveLength(1);
    expect(p.rows.filter((r) => r.marks.includes('pole')).length).toBeLessThanOrEqual(1);
    expect(p.rows[0]!.detail).toMatch(/^\d+:\d{2}(:\d{2})?\.\d{3}$/);
    expect(resultPayload(snap, 'de', 3).rows).toHaveLength(3);
  });

  it('Abstand/Status-Text', () => {
    const base = { status: 'classified' as const, position: 2, total_time_ms: null, gap_ms: 1234, gap_laps: null };
    expect(resultDetail(base, 'de')).toBe('+1.234');
    expect(resultDetail({ ...base, gap_laps: 1 }, 'de')).toBe('+1 Rd.');
    expect(resultDetail({ ...base, status: 'dnf', position: null }, 'en')).toBe('DNF');
    expect(resultDetail({ ...base, position: 1, total_time_ms: 3_000_000 }, 'de')).toBe('50:00.000');
  });

  it('Laufband: nächstes Rennen, Wertungen, letztes Podium', async () => {
    const snap = await snapshot();
    const p = tickerPayload(snap, 'de', 3);
    expect(p.items).toHaveLength(4);
    expect(p.items[0]).toMatch(/^Nächstes Rennen: R\d+ · /);
    expect(p.items[1]).toMatch(/^Fahrerwertung nach R\d+: 1\. /);
    expect(p.items[1]!.split(' · ').length).toBeGreaterThanOrEqual(3);
    expect(p.items[2]).toMatch(/^Konstrukteure: 1\. /);
    expect(p.items[3]).toMatch(/^Ergebnis R\d+ · .+ \(.+\): 1\. /);
    expect(tickerPayload(snap, 'en', 3).items[0]).toMatch(/^Next race: /);
  });

  it('Overlay-Daten enthalten keine privaten Felder', async () => {
    const snap = await snapshot();
    const json = JSON.stringify(
      (['naechstes-rennen', 'aufstellung', 'wertung', 'ergebnis', 'ticker'] as const).map((n) =>
        buildOverlayPayload(n, snap, { lang: 'de', n: 22, scale: 1, art: 'drivers' }),
      ),
    );
    expect(json).not.toMatch(/discord|ea_id|email|notes|admin|ip_hash/i);
  });
});

describe('Fahrersuche (Discord /fahrer)', () => {
  it('findet exakt (ohne Groß/Klein), per Slug und eindeutigem Teiltreffer', async () => {
    const snap = await snapshot();
    expect(findDriver(snap, 'apexanna').driver?.gamertag).toBe('ApexAnna');
    expect(findDriver(snap, '  ApexAnna ').driver?.gamertag).toBe('ApexAnna');
    expect(findDriver(snap, 'slipstream-sam').driver?.gamertag).toBe('Slipstream_Sam');
    expect(findDriver(snap, 'killer').driver?.gamertag).toBe('KerbKiller77');
    const ambiguous = findDriver(snap, 'a');
    expect(ambiguous.driver).toBeNull();
    expect(ambiguous.candidates.length).toBeGreaterThan(1);
    expect(findDriver(snap, 'gibt-es-nicht-xyz')).toEqual({ driver: null, candidates: [] });
    expect(findDriver(snap, '   ').driver).toBeNull();
  });

  it('pseudonymisierte Fahrer sind nicht auffindbar', async () => {
    const data = demoDataset(NOW);
    const anna = data.drivers!.find((d) => d.gamertag === 'ApexAnna')!;
    anna.anonymized = true;
    const snap = await snapshot(['results', 'seats'], data);
    expect(findDriver(snap, 'ApexAnna').driver).toBeNull();
    expect(driverSuggestions(snap, 'Apex')).toEqual([]);
  });

  it('Vorschläge: Anfang vor Teiltreffer, höchstens 25', async () => {
    const snap = await snapshot();
    const s = driverSuggestions(snap, 's');
    const firstContains = s.findIndex((d) => !d.gamertag.toLowerCase().startsWith('s'));
    expect(s.slice(0, firstContains === -1 ? s.length : firstContains).every((d) => d.gamertag.toLowerCase().startsWith('s'))).toBe(true);
    expect(driverSuggestions(snap, '').length).toBeLessThanOrEqual(25);
  });

  it('Kurzprofil: Team, Nummer, Platz und Punkte wie auf der Website', async () => {
    const snap = await snapshot();
    const driver = findDriver(snap, 'ApexAnna').driver!;
    const p = driverProfile(snap, driver, 'de');
    const standing = league.driverStandings(season.id).find((s) => s.driverId === driver.id)!;
    expect(p).toMatchObject({
      name: 'ApexAnna',
      number: league.numberOf(driver.id),
      points: standing.points,
      position: String(standing.position),
      team: { name: league.driverTeam(driver.id, season.id)!.name },
      path: `/fahrer/${driver.slug}`,
    });
    expect(driverProfile(snap, driver, 'en').path).toBe(`/en/drivers/${driver.slug}`);
  });
});
