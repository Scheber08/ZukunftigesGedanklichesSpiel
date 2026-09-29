import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTER,
  filterToSearch,
  isFilterActive,
  matchesFilter,
  parseFilter,
  penaltyOf,
  roundFilterValue,
  ruleAnchor,
  VERDICT_VARIANT,
} from '~/components/stewards/utils';
import { VERDICTS } from '~/lib/db/types';
import { DICTIONARIES } from '~/i18n';

describe('ruleAnchor', () => {
  it('wandelt Paragraphen in Regelwerk-Anker', () => {
    expect(ruleAnchor('§8')).toBe('p8');
    expect(ruleAnchor('§3.2')).toBe('p3-2');
    expect(ruleAnchor(' § 10.4 ')).toBe('p10-4');
    expect(ruleAnchor('3.4')).toBe('p3-4');
  });
  it('liefert null ohne Nummer', () => {
    expect(ruleAnchor(null)).toBeNull();
    expect(ruleAnchor('')).toBeNull();
    expect(ruleAnchor('Strafenkatalog')).toBeNull();
  });
});

describe('penaltyOf', () => {
  it('beschreibt jede Strafart', () => {
    expect(penaltyOf({ verdict: 'time_penalty', time_seconds: 5, positions: null })).toEqual({ key: 'stewards.penalty.time', n: 5 });
    expect(penaltyOf({ verdict: 'position_penalty', time_seconds: null, positions: 2 })).toEqual({ key: 'stewards.penalty.positions', n: 2 });
    expect(penaltyOf({ verdict: 'grid_penalty_next', time_seconds: null, positions: 3 })).toEqual({ key: 'stewards.penalty.grid', n: 3 });
    expect(penaltyOf({ verdict: 'dsq', time_seconds: null, positions: null }).key).toBe('stewards.penalty.dsq');
    expect(penaltyOf({ verdict: 'race_ban', time_seconds: null, positions: null }).key).toBe('stewards.penalty.raceBan');
    expect(penaltyOf({ verdict: 'warning', time_seconds: null, positions: null }).key).toBe('stewards.penalty.warning');
    expect(penaltyOf({ verdict: 'no_action', time_seconds: null, positions: null }).key).toBe('stewards.penalty.none');
  });
  it('fällt ohne Wert auf „keine Strafe“ zurück', () => {
    expect(penaltyOf({ verdict: 'time_penalty', time_seconds: null, positions: null }).key).toBe('stewards.penalty.none');
  });
});

describe('Übersetzungen', () => {
  it('gibt es für alle Verdikte in beiden Sprachen', () => {
    for (const v of VERDICTS) {
      expect(DICTIONARIES.de[`stewards.verdict.${v}`]).toBeTruthy();
      expect(DICTIONARIES.en[`stewards.verdict.${v}`]).toBeTruthy();
      expect(DICTIONARIES.de[`stewards.decision.effect.${v}`]).toBeTruthy();
      expect(VERDICT_VARIANT[v]).toBeTruthy();
    }
  });
});

describe('Register-Filter', () => {
  it('liest und schreibt die URL-Query', () => {
    const f = parseFilter('?season=2&round=2-3&driver=oversteer-olli&verdict=time_penalty&x=1');
    expect(f).toEqual({ season: '2', round: '2-3', driver: 'oversteer-olli', verdict: 'time_penalty' });
    expect(filterToSearch(f)).toBe('?season=2&round=2-3&driver=oversteer-olli&verdict=time_penalty');
    expect(filterToSearch(EMPTY_FILTER)).toBe('');
  });

  it('ignoriert unsichere Werte', () => {
    expect(parseFilter('?driver=%3Cscript%3E&season=2').driver).toBe('');
    expect(parseFilter('').season).toBe('');
  });

  it('filtert nach allen gesetzten Kriterien', () => {
    const item = { season: '2', round: roundFilterValue('2', 3), driver: 'anna', verdict: 'warning' };
    expect(matchesFilter(item, EMPTY_FILTER)).toBe(true);
    expect(matchesFilter(item, { ...EMPTY_FILTER, season: '2', verdict: 'warning' })).toBe(true);
    expect(matchesFilter(item, { ...EMPTY_FILTER, round: '2-4' })).toBe(false);
    expect(matchesFilter(item, { ...EMPTY_FILTER, driver: 'ben' })).toBe(false);
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_FILTER, driver: 'anna' })).toBe(true);
  });
});
