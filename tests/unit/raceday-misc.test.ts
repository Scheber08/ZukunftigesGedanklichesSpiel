import { describe, expect, it } from 'vitest';
import { catalogSnippet, CATALOG_ANCHOR, parsePenaltyCatalog, suggestVerdict } from '~/lib/admin/raceday/catalog';
import { decisionEmbed, lineupEmbed, plainShort, resultsEmbed } from '~/lib/admin/raceday/embeds';
import { isHttpsUrl } from '~/lib/admin/raceday/decision-input';
import { countText, draftDecisionsText, openIncidentsText, verdictText } from '~/lib/admin/raceday/labels';
import { standingsPreview } from '~/lib/admin/raceday/preview';
import { raceDaySteps, type RoundFacts } from '~/lib/admin/raceday/steps';
import type { StandingsInput, StandingsResult } from '~/lib/domain/standings';
import { RULES_V1, type RuleSectionSeed } from '~/lib/seed/content/rules';

function findSection(list: RuleSectionSeed[], anchor: string): RuleSectionSeed | undefined {
  for (const s of list) {
    if (s.anchor === anchor) return s;
    const hit = findSection(s.children ?? [], anchor);
    if (hit) return hit;
  }
  return undefined;
}

describe('Strafenkatalog', () => {
  const section = findSection(RULES_V1.sections, CATALOG_ANCHOR)!;

  it('liest alle 25 Codes aus dem Regelwerk', () => {
    const entries = parsePenaltyCatalog(section.body_de);
    expect(entries).toHaveLength(25);
    expect(entries[0]).toMatchObject({ code: 'V-01', standardPenalty: 'Verwarnung oder 3 s' });
    expect(entries[3]).toMatchObject({ code: 'V-04', offence: 'Unsicheres Wiedereinfahren auf die Strecke', standardPenalty: '5 s' });
  });

  it('schlägt nur eindeutige Strafarten vor', () => {
    expect(suggestVerdict('5 s')).toEqual({ verdict: 'time_penalty', timeSeconds: 5 });
    expect(suggestVerdict('Verwarnung')).toEqual({ verdict: 'warning' });
    expect(suggestVerdict('DSQ')).toEqual({ verdict: 'dsq' });
    expect(suggestVerdict('Rennsperre')).toEqual({ verdict: 'race_ban' });
    expect(suggestVerdict('Verwarnung oder 3 s')).toBeNull();
  });

  it('baut einen Textbaustein', () => {
    const [v02] = parsePenaltyCatalog(section.body_de).filter((e) => e.code === 'V-02');
    expect(catalogSnippet(v02!)).toBe('Kollision verursacht – mit Folgen (Strafenkatalog V-02, Regelstrafe: 5 s).');
  });
});

describe('Urteilstexte und Discord-Embeds', () => {
  it('beschreibt Urteile mit Einheit', () => {
    expect(verdictText({ verdict: 'time_penalty', time_seconds: 5, positions: null })).toBe('Zeitstrafe 5 s');
    expect(verdictText({ verdict: 'position_penalty', time_seconds: null, positions: 1 })).toBe('Positionsstrafe 1 Platz');
    expect(verdictText({ verdict: 'grid_penalty_next', time_seconds: null, positions: 3 })).toBe(
      'Grid-Strafe 3 Plätze (nächstes Rennen)',
    );
    expect(verdictText({ verdict: 'warning', time_seconds: null, positions: null })).toBe('Verwarnung');
  });

  it('kürzt Markdown zu Klartext', () => {
    expect(plainShort('**Fett** und [Link](https://x.y) _kursiv_')).toBe('Fett und Link kursiv');
    const long = 'Wort '.repeat(100);
    const short = plainShort(long, 50);
    expect(short.length).toBeLessThanOrEqual(50);
    expect(short.endsWith('…')).toBe(true);
  });

  it('baut das Ergebnis-Embed mit Protestfrist bzw. Korrekturgrund', () => {
    const base = {
      roundLabel: 'R4 · Miami',
      seasonName: 'Saison 2',
      url: 'https://liga.example/rennen/2/4',
      podium: [{ name: 'A', number: 4, team: 'McLaren' }, { name: 'B' }, { name: 'C' }],
      pole: { name: 'A', number: 4 },
      fastestLap: { name: 'B', time: '1:30.123' },
    };
    const prov = resultsEmbed({ ...base, kind: 'provisional', protestDeadline: '02.10.2026, 22:30' });
    expect(prov.title).toBe('Vorläufiges Ergebnis: R4 · Miami');
    expect(prov.fields?.map((f) => f.name)).toEqual(['Podium', 'Pole', 'Schnellste Runde', 'Protestfrist']);
    expect(prov.fields?.[0]?.value).toContain('P1  #4 A (McLaren)');
    const corr = resultsEmbed({ ...base, kind: 'corrected', reason: 'Urteil S2-R04-01' });
    expect(corr.fields?.at(-1)).toEqual({ name: 'Grund der Korrektur', value: 'Urteil S2-R04-01' });
  });

  it('markiert Ersatzfahrer in der Aufstellung', () => {
    const e = lineupEmbed({
      roundLabel: 'R5 · Montreal',
      seasonName: 'Saison 2',
      startText: '05.11.2026, 20:00',
      url: 'https://liga.example/rennen/2/5',
      teams: [{ team: 'McLaren', seats: [{ name: 'A', number: 4, reserve: false, replaces: null }, { name: 'R', number: 24, reserve: true, replaces: 'B' }] }],
    });
    expect(e.fields?.[0]?.value).toBe('#4 A\n#24 R (R, für B)');
    expect(e.description).toContain('1 Ersatzfahrer');
  });

  it('baut das Urteils-Embed', () => {
    const e = decisionEmbed({
      ref: 'S2-R04-01',
      roundLabel: 'R4 · Miami',
      driver: { name: 'NightRace_Nils', number: 99 },
      verdict: 'Zeitstrafe 5 s',
      reasoning: 'Unsicheres **Wiedereinfahren**.',
      url: 'https://liga.example/stewards/S2-R04-01',
    });
    expect(e.title).toBe('Urteil S2-R04-01');
    expect(e.description).toBe('Unsicheres Wiedereinfahren.');
    expect(e.fields?.[1]?.value).toBe('#99 NightRace_Nils');
  });
});

describe('Renntag-Checkliste', () => {
  const facts: RoundFacts = {
    roundId: 7,
    status: 'scheduled',
    entries: 0,
    sessionsEntered: 0,
    sessionsTotal: 2,
    openIncidents: 0,
    draftDecisions: 0,
    protestOpen: false,
    frozen: false,
  };

  it('beginnt mit der Aufstellung', () => {
    const steps = raceDaySteps(facts);
    expect(steps.map((s) => s.state)).toEqual(['current', 'open', 'blocked', 'blocked', 'blocked']);
    expect(steps[0]!.href).toBe('/admin/runden/7/grid');
  });

  it('wartet nach vorläufig auf die Stewards', () => {
    const steps = raceDaySteps({ ...facts, status: 'provisional', entries: 22, sessionsEntered: 2, openIncidents: 2, draftDecisions: 1, protestOpen: true });
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current', 'open']);
    expect(steps[3]!.href).toBe('/admin/stewards?runde=7');
    expect(steps[3]!.detail).toBe('Protestfrist läuft · 2 offene Vorfälle');
    const late = raceDaySteps({ ...facts, status: 'provisional', entries: 22, sessionsEntered: 2, openIncidents: 1, draftDecisions: 1 });
    expect(late[3]!.detail).toBe('1 offener Vorfall, 1 Entwurf');
  });

  it('ist nach final erledigt und bei gesperrter Saison blockiert', () => {
    expect(raceDaySteps({ ...facts, status: 'final', entries: 22, sessionsEntered: 2 }).every((s) => s.state === 'done')).toBe(true);
    expect(raceDaySteps({ ...facts, frozen: true }).every((s) => s.state === 'blocked')).toBe(true);
  });
});

describe('Wertungsvorschau', () => {
  const r = (roundId: number, driverId: number, position: number, points: number): StandingsResult => ({
    roundId,
    sessionType: 'race',
    driverId,
    teamId: driverId,
    role: 'regular',
    position,
    status: 'classified',
    points,
    isPole: false,
    isFastestLap: false,
    countsForConstructors: true,
    gridPosition: null,
  });

  it('zeigt Punkte- und Positionsveränderung durch die neue Runde', () => {
    const input: StandingsInput = {
      rounds: [
        { id: 1, number: 1, status: 'final', format: 'standard' },
        { id: 2, number: 2, status: 'lineup_published', format: 'standard' },
      ],
      results: [r(1, 1, 1, 25), r(1, 2, 2, 18), r(2, 2, 1, 25), r(2, 3, 2, 18)],
      driverName: (id) => `F${id}`,
      teamName: (id) => `T${id}`,
    };
    const rows = standingsPreview(input, 2);
    expect(rows.map((x) => [x.driverId, x.position, x.points, x.pointsDelta, x.positionDelta])).toEqual([
      [2, 1, 43, 25, 1],
      [1, 2, 25, 0, -1],
      [3, 3, 18, 18, null],
    ]);
  });
});

describe('Texte und Links', () => {
  it('wählt Einzahl oder Mehrzahl', () => {
    expect(countText(1, 'Entwurf', 'Entwürfe')).toBe('1 Entwurf');
    expect(countText(0, 'Entwurf', 'Entwürfe')).toBe('0 Entwürfe');
    expect(openIncidentsText(1)).toBe('1 offener Vorfall');
    expect(openIncidentsText(3)).toBe('3 offene Vorfälle');
    expect(draftDecisionsText(2)).toBe('2 Entscheidungs-Entwürfe');
  });

  it('lässt nur https-Links als Clip zu', () => {
    expect(isHttpsUrl('https://youtu.be/abc?t=12')).toBe(true);
    expect(isHttpsUrl(' https://medal.tv/x ')).toBe(true);
    expect(isHttpsUrl('http://youtu.be/abc')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('https://a b')).toBe(false);
    expect(isHttpsUrl(null)).toBe(false);
  });
});
