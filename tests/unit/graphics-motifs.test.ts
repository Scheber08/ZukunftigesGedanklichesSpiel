/**
 * Social-Grafiken: Datenquelle aus der League (nur öffentliche Daten) und Motiv-Modelle
 * (Ergebnis, Wertung, Startaufstellung, Race-Week, Pole, Neuzugang) mit dem Demo-Datensatz.
 */
import { describe, expect, it } from 'vitest';
import type { Dataset } from '~/lib/db/memory-store';
import {
  availableRounds,
  buildModel,
  defaultRoundId,
  driverOptions,
  MOTIF_IDS,
  normalizeSelection,
  roundOptions,
  selectionFromParams,
  selectionToParams,
  type GraphicModel,
  type Selection,
} from '~/lib/graphics/motifs';
import { buildGraphicsSource, type GraphicsSource } from '~/lib/graphics/source';
import { League, LEAGUE_TABLES, type LeagueDataset } from '~/lib/league/league';
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

const dataset = demoDataset(NOW);
const league = leagueFrom(dataset);
const source: GraphicsSource = buildGraphicsSource(league, {
  brand: { name: 'Testliga', shortName: 'TL', host: 'liga.example' },
  flagSvg: (code) => (code === 'DE' ? '<svg viewBox="0 0 5 3"></svg>' : undefined),
});
const s2 = source.seasons.find((s) => s.number === 2)!;
const r = (n: number) => s2.rounds.find((x) => x.number === n)!;

function model(sel: Partial<Selection>): GraphicModel {
  const res = buildModel(source, normalizeSelection(source, { seasonId: s2.id, ...sel }));
  if (!res.ok) throw new Error(res.message);
  return res.model;
}

describe('Datenquelle (buildGraphicsSource)', () => {
  it('enthält Saisons (neueste zuerst), Teams und Fahrer', () => {
    expect(source.seasons.map((s) => s.number)).toEqual([2, 1]);
    expect(source.currentSeasonId).toBe(s2.id);
    expect(source.teams.length).toBeGreaterThanOrEqual(11);
    expect(source.brand.host).toBe('liga.example');
    expect(source.now).toBe(NOW.toISOString());
  });

  it('gibt nur öffentliche Daten weiter (keine E-Mails, Discord-Namen, EA-IDs, Notizen)', () => {
    const json = JSON.stringify(source);
    expect(json).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(json).not.toMatch(/discord_user|discord_username|ea_id|admin_notes|notes|ip_hash|reporter_contact|decided_by/);
    const driverKeys = new Set(source.drivers.flatMap((d) => Object.keys(d)));
    expect([...driverKeys].sort()).toEqual(['id', 'joined', 'nat', 'num', 'slug', 'status', 'tag']);
    // Private Tabellen tauchen nicht auf – auch nicht, wenn sie im Datensatz stehen
    const secret = {
      ...dataset,
      driver_private: (dataset.driver_private ?? []).map((p) => ({ ...p, discord_username: `geheim_${p.driver_id}`, ea_id: `EA-GEHEIM-${p.driver_id}`, notes: 'Interne Notiz' })),
    } as Dataset;
    const secretJson = JSON.stringify(buildGraphicsSource(leagueFrom(secret), { brand: source.brand }));
    expect(secretJson).not.toMatch(/geheim_|EA-GEHEIM|Interne Notiz/);
  });

  it('Ergebnisse nur veröffentlichter Runden, Aufstellung ab Veröffentlichung', () => {
    expect(r(4).status).toBe('provisional');
    expect(r(4).race.length).toBeGreaterThanOrEqual(20);
    expect(r(4).quali.length).toBeGreaterThan(0);
    expect(r(5).status).toBe('lineup_published');
    expect(r(5).race).toEqual([]);
    expect(r(5).lineup).toHaveLength(22);
    expect(r(6).lineup).toEqual([]);
    expect(r(6).race).toEqual([]);
  });

  it('Wertungsstand nach jeder gewerteten Runde (Top 22, alle Teams)', () => {
    expect(s2.standings.map((st) => st.after)).toEqual([1, 2, 3, 4]);
    const after4 = s2.standings.at(-1)!;
    expect(after4.drivers.length).toBeLessThanOrEqual(22);
    expect(after4.drivers[0]!.pos).toBe(1);
    expect(after4.teams.length).toBe(s2.teams.length);
    expect(after4.drivers[0]!.points).toBeGreaterThanOrEqual(after4.drivers[1]!.points);
  });

  it('nur benötigte Flaggen', () => {
    expect(Object.keys(source.flags)).toEqual(['DE']);
  });

  it('pseudonymisierte Fahrer ohne Namen und Slug', () => {
    const anon = { ...dataset, drivers: dataset.drivers!.map((d) => (d.id === 1 ? { ...d, anonymized: true } : d)) } as Dataset;
    const src = buildGraphicsSource(leagueFrom(anon), { brand: source.brand });
    const d1 = src.drivers.find((d) => d.id === 1)!;
    expect(d1).toMatchObject({ tag: null, slug: '', nat: null, num: null });
    expect(JSON.stringify(src)).not.toContain(dataset.drivers!.find((d) => d.id === 1)!.gamertag!);
  });
});

describe('Auswahl', () => {
  it('Vorgaben: aktuelle Saison, Ergebnis, Instagram, Deutsch, letzte Runde mit Ergebnis', () => {
    const sel = normalizeSelection(source, {});
    expect(sel).toMatchObject({ motif: 'result', seasonId: s2.id, format: 'instagram', lang: 'de' });
    expect(sel.roundId).toBe(r(4).id);
  });

  it('Runden je Motiv', () => {
    expect(availableRounds(s2, 'result').map((x) => x.number)).toEqual([1, 2, 3, 4]);
    expect(availableRounds(s2, 'standings-drivers').map((x) => x.number)).toEqual([1, 2, 3, 4]);
    expect(availableRounds(s2, 'pole').map((x) => x.number)).toEqual([1, 2, 3, 4]);
    expect(availableRounds(s2, 'grid').map((x) => x.number)).toEqual([1, 2, 3, 4, 5]);
    expect(availableRounds(s2, 'raceweek').length).toBe(s2.rounds.filter((x) => x.status !== 'cancelled').length);
    expect(availableRounds(s2, 'newcomer')).toEqual([]);
    expect(roundOptions(source, s2.id, 'result')[3]!.label).toMatch(/^R4 · .+ – vorläufig$/);
  });

  it('Race-Week wählt die nächste Runde, Startaufstellung die veröffentlichte Aufstellung', () => {
    // R5 ist im Demo gerade gestartet (< 3 h) und zählt noch als „nächstes Rennen“
    const next = league.nextRound()!;
    expect(defaultRoundId(source, s2.id, 'raceweek')).toBe(next.id);
    expect(defaultRoundId(source, s2.id, 'grid')).toBe(r(5).id);
  });

  it('ersetzt ungültige Werte (fremde Runde, unbekanntes Motiv/Format)', () => {
    const s1 = source.seasons.find((s) => s.number === 1)!;
    const sel = normalizeSelection(source, { motif: 'x' as never, seasonId: s2.id, roundId: s1.rounds[0]!.id, format: 'tiktok' as never, lang: 'fr' as never });
    expect(sel.motif).toBe('result');
    expect(sel.roundId).toBe(r(4).id);
    expect(sel.format).toBe('instagram');
    expect(sel.lang).toBe('de');
    expect(normalizeSelection(source, { seasonId: 999 }).seasonId).toBe(s2.id);
  });

  it('Neuzugang: nur aktive und Reservefahrer, Neuzugänge der Saison zuerst', () => {
    const list = driverOptions(source, s2.id);
    expect(list.length).toBeGreaterThan(20);
    expect(list[0]!.isNew).toBe(true);
    const inactive = source.drivers.filter((d) => d.status === 'inactive').map((d) => d.id);
    expect(list.some((d) => inactive.includes(d.id))).toBe(false);
    const sel = normalizeSelection(source, { motif: 'newcomer', seasonId: s2.id });
    expect(sel.driverId).toBe(list[0]!.id);
  });

  it('URL-Parameter hin und zurück', () => {
    const sel = normalizeSelection(source, { motif: 'pole', seasonId: s2.id, roundId: r(3).id, format: 'youtube', lang: 'en' });
    const params = new URLSearchParams(selectionToParams(sel));
    expect(params.get('motiv')).toBe('pole');
    expect(params.get('runde')).toBe(String(r(3).id));
    expect(params.has('fahrer')).toBe(false);
    expect(normalizeSelection(source, selectionFromParams(params))).toEqual(sel);
    expect(selectionFromParams(new URLSearchParams('motiv=<x>&saison=abc&format=og&sprache=en'))).toEqual({
      motif: undefined,
      seasonId: null,
      roundId: null,
      driverId: null,
      format: 'og',
      lang: 'en',
    });
  });
});

describe('Motive', () => {
  it('Ergebnis: Top 10, schnellste Runde, Status vorläufig', () => {
    const m = model({ motif: 'result', roundId: r(4).id });
    if (m.kind !== 'table') throw new Error(m.kind);
    expect(m.rows).toHaveLength(10);
    expect(m.rows.map((x) => x.pos)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(m.rows.slice(0, 3).every((x) => x.podium)).toBe(true);
    expect(m.rows[3]!.podium).toBe(false);
    expect(m.rows[1]!.value).toMatch(/^\+/);
    expect(m.rows.every((x) => x.color && /^#[0-9a-f]{6}$/i.test(x.color))).toBe(true);
    expect(m.badge).toEqual({ text: 'Vorläufig', tone: 'warning' });
    expect(m.title).toBe('Rennergebnis');
    expect(m.subtitle).toMatch(/^R4 · /);
    expect(m.kicker).toMatch(/Saison 2 · Runde 4/);
    const fastest = r(4).race.find((x) => x.fastest);
    if (fastest) {
      expect(m.note?.label).toBe('Schnellste Runde');
      expect(m.note?.value).toMatch(/^\d+:\d{2}\.\d{3}$/);
    }
    expect(m.alt).toContain('Testliga – Rennergebnis R4');
    expect(m.alt).toContain(`1. ${m.rows[0]!.name}`);
    expect(m.alt).toContain('(vorläufig)');
    expect(m.fileName).toBe('ergebnis-s2-r4-instagram.png');
    expect(m.discordTitle).toMatch(/^Rennergebnis · R4 · .+ \(vorläufig\)$/);
  });

  it('Ergebnis: finale Runde auf Englisch', () => {
    const m = model({ motif: 'result', roundId: r(3).id, lang: 'en', format: 'og' });
    expect(m.badge).toEqual({ text: 'Final', tone: 'green' });
    expect(m.title).toBe('Race result');
    expect(m.kicker).toMatch(/^Season 2 · Round 3/);
    expect(m.fileName).toBe('ergebnis-s2-r3-og-en.png');
  });

  it('Fahrerwertung: Top 10 bzw. Top 22 im Story-Format', () => {
    const insta = model({ motif: 'standings-drivers', roundId: r(4).id });
    const story = model({ motif: 'standings-drivers', roundId: r(4).id, format: 'story' });
    if (insta.kind !== 'table' || story.kind !== 'table') throw new Error('Tabelle erwartet');
    expect(insta.rows).toHaveLength(10);
    expect(story.rows.length).toBe(Math.min(22, s2.standings.at(-1)!.drivers.length));
    expect(story.rows.length).toBeGreaterThan(10);
    expect(insta.rows[0]!.value).toBe(String(s2.standings.at(-1)!.drivers[0]!.points));
    expect(insta.subtitle).toMatch(/^Nach R4 · /);
    expect(insta.badge?.tone).toBe('warning');
    expect(model({ motif: 'standings-drivers', roundId: r(3).id }).badge).toBeNull();
    expect(insta.fileName).toBe('wertung-fahrer-s2-r4-instagram.png');
  });

  it('Konstrukteurswertung: alle Teams ohne Startnummern', () => {
    const m = model({ motif: 'standings-teams', roundId: r(2).id, lang: 'en' });
    if (m.kind !== 'table') throw new Error(m.kind);
    expect(m.teamsOnly).toBe(true);
    expect(m.rows).toHaveLength(s2.teams.length);
    expect(m.rows.every((x) => x.number === null && x.team === null)).toBe(true);
    expect(m.title).toBe('Constructors’ standings');
  });

  it('Gleichstand wird mit „=“ markiert', () => {
    const tied = structuredClone(source);
    const st = tied.seasons.find((s) => s.id === s2.id)!.standings.at(-1)!;
    st.drivers[1] = { ...st.drivers[1]!, pos: st.drivers[0]!.pos, tied: true };
    const res = buildModel(tied, normalizeSelection(tied, { motif: 'standings-drivers', seasonId: s2.id, roundId: r(4).id }));
    if (!res.ok || res.model.kind !== 'table') throw new Error('Tabelle erwartet');
    expect(res.model.rows[1]!.pos).toBe('=');
  });

  it('Startaufstellung: Startplätze aus dem Ergebnis (22 Plätze)', () => {
    const m = model({ motif: 'grid', roundId: r(4).id, format: 'story' });
    if (m.kind !== 'grid') throw new Error(m.kind);
    expect(m.slots).toHaveLength(22);
    expect(m.slots.map((x) => Number(x.pos))).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(m.title).toBe('Startaufstellung');
    expect(m.fileName).toBe('startaufstellung-s2-r4-story.png');
  });

  it('Startaufstellung vor dem Rennen: veröffentlichte Aufstellung nach Teams', () => {
    const m = model({ motif: 'grid', roundId: r(5).id });
    if (m.kind !== 'lineup') throw new Error(m.kind);
    expect(m.teams).toHaveLength(11);
    expect(m.teams.every((t) => t.drivers.length === 2)).toBe(true);
    expect(m.title).toBe('Aufstellung');
    expect(m.fileName).toBe('aufstellung-s2-r5-instagram.png');
    expect(m.alt).toContain(`${m.teams[0]!.name}: ${m.teams[0]!.drivers[0]!.name}`);
  });

  it('Race-Week: Datum und Uhrzeit in Liga-Zeit, Sessions', () => {
    const round = r(6);
    const de = model({ motif: 'raceweek', roundId: round.id });
    const en = model({ motif: 'raceweek', roundId: round.id, lang: 'en' });
    if (de.kind !== 'raceweek' || en.kind !== 'raceweek') throw new Error('Race-Week erwartet');
    expect(de.roundNo).toBe('R6');
    expect(de.time).toBe('20:00');
    expect(de.timeZone).toMatch(/^MES?Z$/);
    expect(en.timeZone).toMatch(/^CES?T$/);
    expect(de.date).toMatch(/2026$/);
    expect(de.sessions).toEqual(round.format === 'sprint' ? ['Qualifying', 'Sprint', 'Rennen'] : ['Qualifying', 'Rennen']);
    expect(en.sessions.at(-1)).toBe('Race');
    expect(de.alt).toContain('20:00');
    expect(de.alt).toContain('Liga-Zeit');
    expect(de.fileName).toBe('race-week-s2-r6-instagram.png');
  });

  it('Pole: Zeit und Abstand zu P2', () => {
    const m = model({ motif: 'pole', roundId: r(4).id });
    if (m.kind !== 'pole') throw new Error(m.kind);
    const q = r(4).quali;
    const pole = q.find((x) => x.pole) ?? q[0]!;
    expect(m.time).toMatch(/^\d+:\d{2}\.\d{3}$/);
    expect(m.driver.name).toBe(source.drivers.find((d) => d.id === pole.driver)!.tag);
    expect(m.gap).toMatch(/^\+\d+\.\d{3}$/);
    expect(m.chasers.map((c) => c.pos)).toEqual(['P2', 'P3']);
    expect(m.gapLabel).toBe('Abstand zu P2');
    expect(m.alt).toContain(m.time);
  });

  it('Neuzugang: Name, Nummer, Team bzw. Reserve, Nationalität', () => {
    const newbie = driverOptions(source, s2.id)[0]!;
    const m = model({ motif: 'newcomer', driverId: newbie.id });
    if (m.kind !== 'newcomer') throw new Error(m.kind);
    const d = source.drivers.find((x) => x.id === newbie.id)!;
    expect(m.name).toBe(d.tag);
    expect(m.number).toBe(d.num != null ? String(d.num) : null);
    expect(m.title).toBe('Neuzugang');
    expect(m.team.length).toBeGreaterThan(0);
    if (d.nat === 'DE') expect(m.country).toBe('Deutschland');
    expect(m.fileName).toBe(`neuzugang-s2-${d.slug}-instagram.png`);
    expect(m.discordTitle).toBe(`Neuzugang: ${d.tag}`);
    const en = model({ motif: 'newcomer', driverId: newbie.id, lang: 'en' });
    if (en.kind !== 'newcomer') throw new Error(en.kind);
    if (d.nat === 'DE') expect(en.country).toBe('Germany');
  });

  it('meldet fehlende Daten statt einer leeren Grafik', () => {
    const empty = structuredClone(source);
    const season = empty.seasons.find((s) => s.id === s2.id)!;
    season.rounds = season.rounds.map((x) => ({ ...x, race: [], quali: [], lineup: [] }));
    season.standings = [];
    for (const motif of MOTIF_IDS.filter((m) => m !== 'raceweek' && m !== 'newcomer')) {
      const res = buildModel(empty, normalizeSelection(empty, { motif, seasonId: s2.id }));
      expect(res.ok, motif).toBe(false);
      if (!res.ok) expect(res.message.length).toBeGreaterThan(10);
    }
    expect(buildModel({ ...source, seasons: [], currentSeasonId: null }, { ...normalizeSelection(source, {}), seasonId: null })).toEqual({
      ok: false,
      message: 'Es gibt noch keine Saison.',
    });
  });

  it('jedes Motiv liefert in jedem Format und jeder Sprache ein Modell mit Alt-Text', () => {
    for (const motif of MOTIF_IDS) {
      for (const format of ['instagram', 'story', 'youtube', 'og'] as const) {
        for (const lang of ['de', 'en'] as const) {
          const res = buildModel(source, normalizeSelection(source, { motif, seasonId: s2.id, format, lang }));
          expect(res.ok, `${motif}/${format}/${lang}`).toBe(true);
          if (res.ok) {
            expect(res.model.alt.length).toBeGreaterThan(20);
            expect(res.model.fileName).toMatch(new RegExp(`-${format}${lang === 'en' ? '-en' : ''}\\.png$`));
            expect(res.model.discordTitle.length).toBeLessThanOrEqual(200);
          }
        }
      }
    }
  });
});
