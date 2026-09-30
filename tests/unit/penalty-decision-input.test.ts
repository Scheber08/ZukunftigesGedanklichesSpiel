import { describe, expect, it } from 'vitest';
import { normalizeDecision, penaltyPointsNote, penaltyPointsWarning, type DecisionInput } from '~/lib/admin/raceday/decision-input';
import { resolvePenaltyPointsConfig } from '~/lib/domain/penalty-points';

const base: DecisionInput = {
  incidentId: null,
  roundId: 1,
  sessionId: null,
  driverId: 7,
  verdict: 'warning',
  timeSeconds: null,
  positions: null,
  penaltyPoints: 2,
  reasoningDe: 'Begründung mit genug Zeichen.',
  reasoningEn: null,
  ruleRef: null,
  clipUrl: null,
};

describe('Strafpunkte im Entscheidungsformular', () => {
  it('nur bei aktivem System gespeichert', () => {
    const off = normalizeDecision(base, { penaltyPointsEnabled: false });
    expect(off.ok && off.fields.penalty_points).toBeNull();
    const on = normalizeDecision(base, { penaltyPointsEnabled: true });
    expect(on.ok && on.fields.penalty_points).toBe(2);
  });

  it('Bereich 0–12, ganze Zahlen', () => {
    expect(normalizeDecision({ ...base, penaltyPoints: 13 }, { penaltyPointsEnabled: true })).toMatchObject({ ok: false, errors: { penaltyPoints: expect.any(String) } });
    expect(normalizeDecision({ ...base, penaltyPoints: 1.5 }, { penaltyPointsEnabled: true }).ok).toBe(false);
    expect(normalizeDecision({ ...base, penaltyPoints: 12 }, { penaltyPointsEnabled: true }).ok).toBe(true);
    expect(normalizeDecision({ ...base, penaltyPoints: 0 }, { penaltyPointsEnabled: true })).toMatchObject({ ok: true, fields: { penalty_points: 0 } });
  });

  it('„Keine Strafe“ ohne Strafpunkte', () => {
    const r = normalizeDecision({ ...base, verdict: 'no_action', penaltyPoints: 2 }, { penaltyPointsEnabled: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.penaltyPoints).toMatch(/Keine Strafe/);
    expect(normalizeDecision({ ...base, verdict: 'no_action', penaltyPoints: 0 }, { penaltyPointsEnabled: true }).ok).toBe(true);
    // System aus: Feld wird ignoriert, kein Fehler
    expect(normalizeDecision({ ...base, verdict: 'no_action', penaltyPoints: 2 }, { penaltyPointsEnabled: false }).ok).toBe(true);
  });
});

describe('Warnung bei erreichter Schwelle', () => {
  const cfg = resolvePenaltyPointsConfig({ warning_threshold: 6, ban_threshold: 10 });

  it('keine Warnung unter der Schwelle oder ohne Punkte', () => {
    expect(penaltyPointsWarning(2, 3, cfg)).toBeNull();
    expect(penaltyPointsWarning(8, 0, cfg)).toBeNull();
    expect(penaltyPointsWarning(8, null, cfg)).toBeNull();
    // schon verwarnt, bleibt darunter → keine neue Warnung
    expect(penaltyPointsWarning(6, 2, cfg)).toBeNull();
  });

  it('Verwarnschwelle genau erreicht', () => {
    const w = penaltyPointsWarning(4, 2, cfg);
    expect(w).toMatchObject({ level: 'warning', after: 6 });
    expect(w?.text).toMatch(/^Verwarnschwelle erreicht/);
  });

  it('Sperrschwelle erreicht → Rennsperre prüfen', () => {
    const w = penaltyPointsWarning(7, 3, cfg);
    expect(w).toMatchObject({ level: 'ban', after: 10 });
    expect(w?.text).toMatch(/^Sperrschwelle erreicht – Rennsperre prüfen/);
    // über beide Schwellen auf einmal
    expect(penaltyPointsWarning(0, 12, cfg)).toMatchObject({ level: 'ban', after: 12 });
  });

  it('über der Sperrschwelle weitere Punkte → weiter deutlich warnen', () => {
    const w = penaltyPointsWarning(10, 1, cfg);
    expect(w).toMatchObject({ level: 'ban', after: 11 });
    expect(w?.text).toMatch(/schon vorher erreicht/);
  });
});

describe('Hinweis unter dem Strafpunkte-Feld', () => {
  const cfg = resolvePenaltyPointsConfig({ warning_threshold: 6, ban_threshold: 10 });
  it('Kontostand ohne Schwelle, Warnung mit Schwelle, nichts ohne Punkte', () => {
    expect(penaltyPointsNote(1, 2, cfg)).toEqual({ level: 'info', text: 'Konto danach: 3 aktive Punkte (Verwarnung ab 6, Sperre ab 10).' });
    expect(penaltyPointsNote(5, 1, cfg)?.level).toBe('warning');
    expect(penaltyPointsNote(9, 1, cfg)?.level).toBe('ban');
    expect(penaltyPointsNote(9, 0, cfg)).toBeNull();
  });
});
