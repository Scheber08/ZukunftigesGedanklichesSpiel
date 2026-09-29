import { describe, expect, it } from 'vitest';
import { checkGrid, hasBlockingIssues } from '~/lib/domain/grid';
import {
  assignSeat,
  clearSeat,
  initialLineup,
  markAbsent,
  reservePool,
  resetToSeason,
  setReportedInTime,
  toGridEntries,
  unmarkAbsent,
} from '~/lib/admin/raceday/lineup';
import { gridIssueText } from '~/lib/admin/raceday/labels';

const teamIds = [1, 2];
const seats = [
  { team_id: 1, seat_no: 1 as const, driver_id: 11 },
  { team_id: 1, seat_no: 2 as const, driver_id: 12 },
  { team_id: 2, seat_no: 1 as const, driver_id: 21 },
  { team_id: 2, seat_no: 2 as const, driver_id: 22 },
];
const numberOf = (id: number) => id;

describe('Grid-Builder-Zustand', () => {
  it('belegt die Cockpits aus der Saisonaufstellung ohne Abgemeldete', () => {
    const s = initialLineup(teamIds, seats, [], [{ driverId: 12, reportedInTime: true }]);
    expect(s.seats.map((x) => x.driverId)).toEqual([11, null, 21, 22]);
    expect(s.seats.map((x) => x.regularId)).toEqual([11, 12, 21, 22]);
  });

  it('übernimmt eine gespeicherte Aufstellung', () => {
    const entries = [
      { team_id: 1, seat_no: 1 as const, driver_id: 11 },
      { team_id: 1, seat_no: 2 as const, driver_id: 99 },
    ];
    const s = initialLineup(teamIds, seats, entries, [{ driverId: 12, reportedInTime: false }]);
    expect(s.seats.map((x) => x.driverId)).toEqual([11, 99, null, null]);
  });

  it('abmelden macht das Cockpit frei, zurücknehmen setzt den Stammfahrer wieder ein', () => {
    let s = initialLineup(teamIds, seats, [], []);
    s = markAbsent(s, 21, false);
    expect(s.seats[2]!.driverId).toBeNull();
    expect(s.absences).toEqual([{ driverId: 21, reportedInTime: false }]);
    s = setReportedInTime(s, 21, true);
    expect(s.absences[0]!.reportedInTime).toBe(true);
    s = unmarkAbsent(s, 21);
    expect(s.seats[2]!.driverId).toBe(21);
    expect(s.absences).toEqual([]);
  });

  it('setzt einen Ersatzfahrer mit „ersetzt X“ und Nummer', () => {
    let s = markAbsent(initialLineup(teamIds, seats, [], []), 12, true);
    s = assignSeat(s, 1, 2, 50);
    const entries = toGridEntries(s, numberOf);
    expect(entries.find((e) => e.driverId === 50)).toEqual({
      teamId: 1,
      seatNo: 2,
      driverId: 50,
      role: 'reserve',
      replacesDriverId: 12,
      raceNumber: 50,
    });
    expect(entries.find((e) => e.driverId === 11)?.role).toBe('regular');
  });

  it('verschiebt einen bereits gesetzten Fahrer statt ihn doppelt einzutragen', () => {
    let s = markAbsent(markAbsent(initialLineup(teamIds, seats, [], []), 12, true), 22, true);
    s = assignSeat(s, 1, 2, 50);
    s = assignSeat(s, 2, 2, 50);
    expect(s.seats.map((x) => x.driverId)).toEqual([11, null, 21, 50]);
    s = clearSeat(s, 2, 2);
    expect(s.seats[3]!.driverId).toBeNull();
  });

  it('setzt auf die Saisonaufstellung zurück, Abmeldungen bleiben', () => {
    let s = markAbsent(initialLineup(teamIds, seats, [], []), 11, true);
    s = assignSeat(s, 1, 1, 50);
    s = resetToSeason(s);
    expect(s.seats.map((x) => x.driverId)).toEqual([null, 12, 21, 22]);
  });

  it('sortiert den Reservepool nach Warteliste und blendet Gesetzte aus', () => {
    const drivers = [
      { id: 50, gamertag: 'Zed', status: 'reserve' as const, reserve_order: 2 },
      { id: 51, gamertag: 'Amy', status: 'reserve' as const, reserve_order: 1 },
      { id: 52, gamertag: 'Old', status: 'inactive' as const, reserve_order: null },
      { id: 11, gamertag: 'Stamm', status: 'active' as const, reserve_order: null },
      { id: 12, gamertag: 'Abwesend', status: 'active' as const, reserve_order: null },
    ];
    let s = markAbsent(initialLineup(teamIds, seats, [], []), 12, true);
    s = assignSeat(s, 1, 2, 50);
    const pool = reservePool(drivers, s);
    expect(pool.reserves.map((d) => d.id)).toEqual([51]);
    expect(pool.others.map((d) => d.id)).toEqual([52]);
    expect(pool.regulars).toEqual([]);
  });

  it('bietet versehentlich entfernte Stammfahrer wieder an, abgemeldete nicht', () => {
    const drivers = [
      { id: 11, gamertag: 'Stamm', status: 'active' as const, reserve_order: null },
      { id: 12, gamertag: 'Abwesend', status: 'active' as const, reserve_order: null },
    ];
    let s = markAbsent(initialLineup(teamIds, seats, [], []), 12, true);
    s = clearSeat(s, 1, 1);
    const pool = reservePool(drivers, s);
    expect(pool.regulars.map((d) => d.id)).toEqual([11]);
    expect(pool.others).toEqual([]);
    s = assignSeat(s, 1, 1, 11);
    expect(reservePool(drivers, s).regulars).toEqual([]);
  });

  it('liefert prüfbare Einträge für checkGrid mit verständlichen Meldungen', () => {
    let s = markAbsent(initialLineup(teamIds, seats, [], []), 12, true);
    s = assignSeat(s, 1, 2, 21); // Stammfahrer von Team 2 wechselt → Cockpit 2/1 leer
    const issues = checkGrid(toGridEntries(s, () => 7), {
      driverStatus: () => 'active',
      absentDriverIds: new Set([12]),
      bannedForRound: new Set([22]),
      teamIds,
    });
    expect(hasBlockingIssues(issues)).toBe(true);
    const names = { driver: (id: number) => `F${id}`, team: (id: number) => `T${id}` };
    const texts = issues.map((i) => gridIssueText(i, names));
    expect(texts).toContain('F22 hat eine Rennsperre aus der Vorrunde');
    expect(texts).toContain('T2, Cockpit 1: Cockpit ist leer');
    expect(texts.some((t) => t.includes('Startnummer 7'))).toBe(true);
  });
});
