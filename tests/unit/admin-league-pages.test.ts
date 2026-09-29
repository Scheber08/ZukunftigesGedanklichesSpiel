import { describe, expect, it } from 'vitest';
import { formatHoursLeft, formatTimeUntil } from '~/lib/admin/league/dashboard';
import { sameAction } from '~/lib/admin/league/forms';

/** Nachbau des Astro-Action-Proxys: jeder Zugriff liefert ein neues Funktionsobjekt. */
function actionProxy(name: string) {
  const fn = () => undefined;
  const queryString = `?_action=${name}`;
  return Object.assign(fn, { queryString, toString: () => queryString });
}

describe('Formular-Zuordnung (sameAction)', () => {
  it('erkennt dieselbe Action trotz neuer Proxy-Objekte', () => {
    const a = actionProxy('admin.registrationUpdate');
    const b = actionProxy('admin.registrationUpdate');
    expect(a === b).toBe(false);
    expect(sameAction(a, b)).toBe(true);
  });

  it('unterscheidet verschiedene Actions und leere Werte', () => {
    expect(sameAction(actionProxy('admin.seasonSave'), actionProxy('admin.seasonLobbySave'))).toBe(false);
    expect(sameAction(null, actionProxy('admin.seasonSave'))).toBe(false);
    expect(sameAction(actionProxy('admin.seasonSave'), undefined)).toBe(false);
  });

  it('vergleicht keine beliebigen Objekte als gleich', () => {
    expect(sameAction({}, {})).toBe(false);
  });
});

describe('Dashboard: Zeitangaben', () => {
  it('nennt Termine in der Zukunft im Dativ', () => {
    expect(formatTimeUntil(0.25)).toBe('in 15 Min.');
    expect(formatTimeUntil(5)).toBe('in 5 Std.');
    expect(formatTimeUntil(13 * 24)).toBe('in 13 Tagen');
  });

  it('beschreibt laufende und abgelaufene Fristen', () => {
    expect(formatHoursLeft(3)).toBe('noch 3 Std.');
    expect(formatHoursLeft(72)).toBe('noch 3 Tage');
    expect(formatHoursLeft(-72)).toBe('seit 3 Tagen abgelaufen');
  });
});
