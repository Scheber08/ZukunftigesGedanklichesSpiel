/**
 * Auszeichnungen im Admin (src/lib/people/awards-admin.ts): Driver of the Day je Runde,
 * Rookie of the Year, Speichern ohne Dubletten, Meldungen und Discord-Embed.
 */
import { describe, expect, it } from 'vitest';
import type { AwardRow, ResultRow } from '~/lib/db/types';
import {
  AWARD_FLASH,
  awardFlash,
  awardsAt,
  canHaveDotd,
  dotdCandidates,
  dotdEmbed,
  escapeDiscord,
  planAward,
  rookieCandidates,
} from '~/lib/people/awards-admin';

const STAMP = '2026-01-01T00:00:00.000Z';

function award(id: number, extra: Partial<AwardRow>): AwardRow {
  return {
    id,
    season_id: 2,
    round_id: null,
    type: 'driver_of_the_day',
    driver_id: null,
    team_id: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...extra,
  };
}

type Res = Pick<ResultRow, 'driver_id' | 'team_id' | 'position' | 'entered_position' | 'status' | 'role'>;
const res = (driver_id: number, position: number | null, entered_position: number, extra: Partial<Res> = {}): Res => ({
  driver_id,
  team_id: driver_id * 10,
  position,
  entered_position,
  status: position == null ? 'dnf' : 'classified',
  role: 'regular',
  ...extra,
});

describe('Driver of the Day: Runde und Kandidaten', () => {
  it('nur Runden mit veröffentlichtem Ergebnis', () => {
    expect(canHaveDotd({ status: 'provisional' })).toBe(true);
    expect(canHaveDotd({ status: 'final' })).toBe(true);
    expect(canHaveDotd({ status: 'corrected' })).toBe(true);
    for (const status of ['scheduled', 'lineup_published', 'cancelled'] as const) expect(canHaveDotd({ status })).toBe(false);
  });

  it('Kandidaten: gewertete nach Position, dann Ausfälle, ohne Dubletten', () => {
    const list = dotdCandidates([res(3, null, 19), res(1, 2, 2), res(2, 1, 1), res(4, null, 18, { status: 'dsq' }), res(1, 2, 2), res(5, 3, 3, { role: 'reserve' })]);
    expect(list.map((c) => c.driverId)).toEqual([2, 1, 5, 4, 3]);
    expect(list[2]).toEqual({ driverId: 5, teamId: 50, position: 3, status: 'classified', role: 'reserve' });
  });
});

describe('planAward', () => {
  const target = { season_id: 2, round_id: 7, type: 'driver_of_the_day' as const, driver_id: 3, team_id: 30 };

  it('legt an, wenn es noch keine gibt', () => {
    expect(planAward([award(1, { round_id: 8, driver_id: 3 })], target)).toEqual({ kind: 'insert', row: target, removeIds: [] });
  });

  it('ändert die vorhandene und entfernt Dubletten', () => {
    const existing = [award(5, { round_id: 7, driver_id: 1 }), award(2, { round_id: 7, driver_id: 9 }), award(3, { round_id: 7, type: 'champion', driver_id: 1 })];
    const plan = planAward(existing, target);
    expect(plan.kind).toBe('update');
    if (plan.kind !== 'update') return;
    expect(plan.id).toBe(2);
    expect(plan.patch).toEqual({ driver_id: 3, team_id: 30 });
    expect(plan.removeIds).toEqual([5]);
  });

  it('nichts zu tun, wenn Fahrer und Team schon stimmen', () => {
    expect(planAward([award(4, { round_id: 7, driver_id: 3, team_id: 30 })], target)).toEqual({ kind: 'noop', id: 4, removeIds: [] });
  });

  it('Saison-Awards (ohne Runde) getrennt je Saison und Typ', () => {
    const rookie = { season_id: 2, round_id: null, type: 'rookie_of_the_year' as const, driver_id: 21, team_id: null };
    const existing = [
      award(1, { type: 'rookie_of_the_year', season_id: 1, driver_id: 5 }),
      award(2, { type: 'rookie_of_the_year', season_id: 2, round_id: 3, driver_id: 5 }),
      award(3, { type: 'champion', season_id: 2, driver_id: 5 }),
    ];
    expect(planAward(existing, rookie).kind).toBe('insert');
    expect(planAward([...existing, award(9, { type: 'rookie_of_the_year', season_id: 2, driver_id: 4 })], rookie)).toMatchObject({ kind: 'update', id: 9 });
  });

  it('awardsAt findet die Einträge eines Platzes', () => {
    const existing = [award(1, { round_id: 7 }), award(2, { round_id: 7, type: 'rookie_of_the_year' }), award(3, { round_id: 8 }), award(4, { round_id: 7, season_id: 3 })];
    expect(awardsAt(existing, 'driver_of_the_day', 2, 7).map((a) => a.id)).toEqual([1]);
    expect(awardsAt([award(5, { type: 'rookie_of_the_year' })], 'rookie_of_the_year', 2, null).map((a) => a.id)).toEqual([5]);
  });
});

describe('rookieCandidates', () => {
  const seasons = [
    { id: 1, number: 1 },
    { id: 2, number: 2 },
    { id: 3, number: 3 },
  ];
  const ref = (driverId: number, seasonId: number, roundStart: string, teamId = driverId * 10) => ({ driverId, teamId, seasonId, roundStart });
  const names: Record<number, string> = { 1: 'Zora', 2: 'Anton', 3: 'Berta', 4: 'Carl' };

  it('Debütanten zuerst, Team des letzten Rennens, nur Fahrer der Saison', () => {
    const list = rookieCandidates(
      2,
      seasons,
      [
        ref(1, 1, '2025-01-01'),
        ref(1, 2, '2026-01-01'),
        ref(2, 2, '2026-01-01', 20),
        ref(2, 2, '2026-02-01', 21),
        ref(3, 2, '2026-01-08'),
        ref(3, 3, '2027-01-01'),
        ref(4, 3, '2027-01-01'),
      ],
      (id) => names[id]!,
    );
    expect(list).toEqual([
      { driverId: 2, debut: true, teamId: 21, races: 2 },
      { driverId: 3, debut: true, teamId: 30, races: 1 },
      { driverId: 1, debut: false, teamId: 10, races: 1 },
    ]);
  });

  it('unbekannte Saison: keine Kandidaten', () => {
    expect(rookieCandidates(9, seasons, [ref(1, 2, '2026-01-01')], () => '')).toEqual([]);
  });
});

describe('Meldungen und Discord', () => {
  it('bekannte Codes, Warnung bei fehlgeschlagenem Post', () => {
    expect(awardFlash('dotd_saved')).toEqual({ text: AWARD_FLASH.dotd_saved, warning: false });
    expect(awardFlash('dotd_post_failed')?.warning).toBe(true);
    expect(awardFlash('saved')).toBeNull();
    expect(awardFlash('toString')).toBeNull();
    expect(awardFlash(null)).toBeNull();
  });

  it('Embed mit entschärftem Markdown', () => {
    expect(escapeDiscord('Slipstream_Sam*[x]')).toBe('Slipstream\\_Sam\\*\\[x\\]');
    const embed = dotdEmbed({ roundLabel: 'R3 · Monza', seasonName: 'Saison 2', driverName: 'Box_Box_Bruno', teamName: 'Haas', url: 'https://liga.example/rennen/2/3' });
    expect(embed.title).toBe('Fahrer des Tages: R3 · Monza');
    expect(embed.description).toBe('**Box\\_Box\\_Bruno** (Haas) ist Fahrer des Tages – Saison 2, R3 · Monza.');
    expect(embed.url).toBe('https://liga.example/rennen/2/3');
    expect(dotdEmbed({ roundLabel: 'R1 · X', seasonName: 'S', driverName: 'A', teamName: null, url: 'u' }).description).toBe('**A** ist Fahrer des Tages – S, R1 · X.');
  });
});
