import { describe, expect, it } from 'vitest';
import type { ResultRow } from '~/lib/db/types';
import { computeSession, POINTS_TEMPLATES } from '~/lib/domain/points';
import {
  computedToPatch,
  entryToEditor,
  formatGapInput,
  inputToEntered,
  inputToResultInsert,
  linkRowsToEntries,
  moveItem,
  parseEditorRow,
  parseGap,
  positionChange,
  prefillRows,
  resultRowToEditor,
  resultRowToEntered,
  validateSessionInput,
  type EditorRow,
} from '~/lib/admin/raceday/results-map';

function resultRow(over: Partial<ResultRow> = {}): ResultRow {
  return {
    id: 1,
    session_id: 10,
    round_entry_id: 5,
    driver_id: 7,
    team_id: 3,
    race_number: 23,
    role: 'regular',
    entered_position: 2,
    position: 2,
    status: 'classified',
    entered_status: 'classified',
    grid_position: 4,
    laps: 25,
    total_time_ms: 2_345_678,
    gap_ms: 5_123,
    gap_laps: 0,
    best_lap_ms: 83_456,
    pit_stops: 1,
    ingame_penalty_s: 5,
    steward_penalty_s: 0,
    is_fastest_lap: false,
    is_pole: false,
    points: 18,
    counts_for_constructors: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function editor(driverId: number, over: Partial<EditorRow> = {}): EditorRow {
  return { ...entryToEditor({ id: driverId * 10, driver_id: driverId, team_id: Math.ceil(driverId / 2), role: 'regular', race_number: driverId }), ...over };
}

describe('Zeiten im Editor', () => {
  it('wandelt gespeicherte Zeilen in Texte und zurück', () => {
    const row = resultRow();
    const e = resultRowToEditor(row);
    expect(e.bestLap).toBe('1:23.456');
    expect(e.totalTime).toBe('39:05.678');
    expect(e.gap).toBe('5.123');
    const { input, errors } = parseEditorRow(e);
    expect(errors).toEqual({});
    expect(input.bestLapMs).toBe(83_456);
    expect(input.totalTimeMs).toBe(2_345_678);
    expect(input.gapMs).toBe(5_123);
    expect(input.ingamePenaltyS).toBe(5);
  });

  it('meldet ungültige Zeiten je Feld', () => {
    const { input, errors } = parseEditorRow(editor(1, { bestLap: '1:75.000', gap: 'abc', totalTime: '' }));
    expect(errors.bestLap).toBeTruthy();
    expect(errors.gap).toBeTruthy();
    expect(errors.totalTime).toBeUndefined();
    expect(input.bestLapMs).toBeNull();
  });

  it('versteht Abstände mit Plus, Komma und Minuten', () => {
    expect(parseGap('+5,1')).toBe(5_100);
    expect(parseGap('1:05.200')).toBe(65_200);
    expect(parseGap('0')).toBe(0);
    expect(parseGap('')).toBeNull();
    expect(parseGap('x')).toBeUndefined();
    expect(formatGapInput(65_200)).toBe('1:05.200');
    expect(formatGapInput(null)).toBe('');
  });
});

describe('Zuordnung zur Punktelogik', () => {
  it('nutzt die Eingabe-Reihenfolge als enteredPosition', () => {
    const rows = [editor(1), editor(2), editor(3)].map((r) => parseEditorRow(r).input);
    const entered = rows.map(inputToEntered);
    expect(entered.map((e) => e.enteredPosition)).toEqual([1, 2, 3]);
    const insert = inputToResultInsert(rows[1]!, 99, 1);
    expect(insert).toMatchObject({ session_id: 99, driver_id: 2, entered_position: 2, round_entry_id: 20 });
  });

  it('übernimmt berechnete Felder inkl. DSQ-Status', () => {
    const rows = [resultRow({ driver_id: 1, entered_position: 1 }), resultRow({ driver_id: 2, entered_position: 2 })];
    const { results } = computeSession(rows.map(resultRowToEntered), [{ driverId: 1, kind: 'dsq' }], {
      type: 'race',
      scheme: POINTS_TEMPLATES.f1_current,
      reservePointsForConstructors: true,
    });
    const patch = computedToPatch(results.find((r) => r.driverId === 1)!);
    expect(patch).toMatchObject({ status: 'dsq', position: null, points: 0 });
    expect(computedToPatch(results.find((r) => r.driverId === 2)!)).toMatchObject({ position: 1, points: 25 });
  });
});

describe('Prüfung und Vorbelegung', () => {
  it('findet doppelte Fahrer und doppelte Startplätze', () => {
    const rows = [editor(1, { gridPosition: 1 }), editor(2, { gridPosition: 1 }), editor(1)].map((r) => parseEditorRow(r).input);
    const issues = validateSessionInput(rows, (id) => `F${id}`);
    expect(issues.map((i) => i.code).sort()).toEqual(['duplicate_driver', 'grid_duplicate']);
  });

  it('meldet negative oder gebrochene Zahlen', () => {
    const rows = [editor(1, { laps: -1 }), editor(2, { pitStops: 1.5 })].map((r) => parseEditorRow(r).input);
    expect(validateSessionInput(rows).filter((i) => i.code === 'invalid_number')).toHaveLength(2);
  });

  it('sortiert die Vorbelegung nach Startplatz', () => {
    const entries = [1, 2, 3].map((id) => ({ id, driver_id: id, team_id: 1, role: 'regular' as const, race_number: id }));
    const rows = prefillRows(entries, new Map([[3, 1], [1, 2], [2, 3]]));
    expect(rows.map((r) => r.driverId)).toEqual([3, 1, 2]);
    expect(rows.map((r) => r.gridPosition)).toEqual([1, 2, 3]);
    expect(prefillRows(entries, null).map((r) => r.driverId)).toEqual([1, 2, 3]);
  });

  it('berechnet Positionsänderungen nur für Rennen und Sprint', () => {
    expect(positionChange('race', 8, 3)).toBe(5);
    expect(positionChange('sprint', 2, 4)).toBe(-2);
    expect(positionChange('qualifying', 2, 1)).toBeNull();
    expect(positionChange('race', null, 1)).toBeNull();
  });

  it('verknüpft Zeilen mit der Aufstellung der Runde', () => {
    const entries = [{ id: 50, driver_id: 7, team_id: 4, role: 'reserve' as const, race_number: 33 }];
    const rows = [
      parseEditorRow(editor(7, { role: 'regular', roundEntryId: 999, raceNumber: 1 })).input,
      parseEditorRow(editor(8, { roundEntryId: 998 })).input,
    ];
    const [linked, loose] = linkRowsToEntries(rows, entries);
    expect(linked).toMatchObject({ driverId: 7, roundEntryId: 50, teamId: 4, role: 'reserve', raceNumber: 33 });
    expect(loose).toMatchObject({ driverId: 8, roundEntryId: null, teamId: 4, role: 'regular' });
  });

  it('verschiebt Zeilen innerhalb der Grenzen', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2, 3], 2, -5)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 1, 99)).toEqual([1, 3, 2]);
  });
});
