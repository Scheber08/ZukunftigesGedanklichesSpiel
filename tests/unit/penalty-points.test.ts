import { describe, expect, it } from 'vitest';
import type { RoundStatus } from '~/lib/db/types';
import {
  completedThroughRound,
  DEFAULT_BAN_THRESHOLD,
  defaultWarningThreshold,
  expiryRoundFor,
  penaltyPointsAccount,
  penaltyPointsAccounts,
  penaltyPointsImpact,
  penaltyPointsStatus,
  pointsExpiredOnArrival,
  resolvePenaltyPointsConfig,
  validatePenaltyPointsConfig,
  type PenaltyDecision,
  type PenaltyRound,
} from '~/lib/domain/penalty-points';

/** Runden 1–n der Saison; die ersten `done` sind gewertet. */
function season(n: number, done: number, cancelled: number[] = []): PenaltyRound[] {
  return Array.from({ length: n }, (_, i) => {
    const number = i + 1;
    const status: RoundStatus = cancelled.includes(number) ? 'cancelled' : number <= done ? 'final' : 'scheduled';
    return { id: 100 + number, number, status };
  });
}

let nextId = 1;
function dec(driver: number, round: number, points: number | null, status: PenaltyDecision['status'] = 'published'): PenaltyDecision {
  const id = nextId++;
  return { id, public_ref: `S2-R${String(round).padStart(2, '0')}-${String(id).padStart(2, '0')}`, round_id: 100 + round, driver_id: driver, penalty_points: points, status };
}

const CFG = { warning_threshold: 6, ban_threshold: 10, expiry_rounds: null };

describe('Konfiguration', () => {
  it('Standardwerte bei leerer Konfiguration', () => {
    expect(resolvePenaltyPointsConfig({})).toEqual({ warningThreshold: 8, banThreshold: DEFAULT_BAN_THRESHOLD, expiryRounds: null });
    expect(resolvePenaltyPointsConfig(null)).toEqual({ warningThreshold: 8, banThreshold: 12, expiryRounds: null });
  });

  it('übernimmt gültige Werte', () => {
    expect(resolvePenaltyPointsConfig({ warning_threshold: 6, ban_threshold: 10, expiry_rounds: 4 })).toEqual({
      warningThreshold: 6,
      banThreshold: 10,
      expiryRounds: 4,
    });
  });

  it('leitet fehlende oder widersprüchliche Werte ab', () => {
    // nur Sperrschwelle → Verwarnschwelle zwei Drittel, aufgerundet
    expect(resolvePenaltyPointsConfig({ ban_threshold: 9 })).toMatchObject({ warningThreshold: 6, banThreshold: 9 });
    expect(resolvePenaltyPointsConfig({ ban_threshold: 10 })).toMatchObject({ warningThreshold: 7, banThreshold: 10 });
    // nur Verwarnschwelle → Standard-Sperrschwelle (mindestens eins darüber)
    expect(resolvePenaltyPointsConfig({ warning_threshold: 5 })).toMatchObject({ warningThreshold: 5, banThreshold: 12 });
    expect(resolvePenaltyPointsConfig({ warning_threshold: 20 })).toMatchObject({ warningThreshold: 20, banThreshold: 21 });
    // Verwarnschwelle ≥ Sperrschwelle → Sperrschwelle gilt, Verwarnschwelle wird abgeleitet
    expect(resolvePenaltyPointsConfig({ warning_threshold: 10, ban_threshold: 10 })).toMatchObject({ warningThreshold: 7, banThreshold: 10 });
    // Unsinn wird ignoriert
    expect(resolvePenaltyPointsConfig({ warning_threshold: -1, ban_threshold: 2.5, expiry_rounds: 0 })).toEqual({
      warningThreshold: 8,
      banThreshold: 12,
      expiryRounds: null,
    });
    expect(defaultWarningThreshold(1)).toBe(1);
  });

  it('prüft die Admin-Eingabe', () => {
    expect(validatePenaltyPointsConfig({ warning_threshold: 6, ban_threshold: 10, expiry_rounds: null })).toEqual({
      ok: true,
      config: { warning_threshold: 6, ban_threshold: 10, expiry_rounds: null },
    });
    expect(validatePenaltyPointsConfig({ warning_threshold: 6, ban_threshold: 10, expiry_rounds: 3 })).toMatchObject({ ok: true });

    const same = validatePenaltyPointsConfig({ warning_threshold: 10, ban_threshold: 10, expiry_rounds: null });
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.errors.ban_threshold).toMatch(/größer als die Verwarnschwelle/);

    const bad = validatePenaltyPointsConfig({ warning_threshold: 0, ban_threshold: 100, expiry_rounds: 31 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['ban_threshold', 'expiry_rounds', 'warning_threshold']);

    const missing = validatePenaltyPointsConfig({ warning_threshold: undefined, ban_threshold: null, expiry_rounds: undefined });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(Object.keys(missing.errors).sort()).toEqual(['ban_threshold', 'warning_threshold']);

    // keine ganze Zahl
    expect(validatePenaltyPointsConfig({ warning_threshold: 2.5, ban_threshold: 10, expiry_rounds: null }).ok).toBe(false);
  });
});

describe('Status und Schwellen', () => {
  const cfg = resolvePenaltyPointsConfig(CFG);

  it('genau auf der Schwelle zählt als erreicht', () => {
    expect(penaltyPointsStatus(0, cfg)).toBe('ok');
    expect(penaltyPointsStatus(5, cfg)).toBe('ok');
    expect(penaltyPointsStatus(6, cfg)).toBe('warning');
    expect(penaltyPointsStatus(9, cfg)).toBe('warning');
    expect(penaltyPointsStatus(10, cfg)).toBe('ban');
    expect(penaltyPointsStatus(14, cfg)).toBe('ban');
  });

  it('neue Entscheidung: welche Schwelle wird erreicht?', () => {
    expect(penaltyPointsImpact(3, 2, cfg)).toEqual({ before: 3, after: 5, statusBefore: 'ok', statusAfter: 'ok', reached: null });
    expect(penaltyPointsImpact(3, 3, cfg)).toMatchObject({ after: 6, statusAfter: 'warning', reached: 'warning' });
    expect(penaltyPointsImpact(7, 3, cfg)).toMatchObject({ after: 10, statusBefore: 'warning', statusAfter: 'ban', reached: 'ban' });
    // über beide Schwellen auf einmal → Sperrschwelle
    expect(penaltyPointsImpact(2, 9, cfg)).toMatchObject({ after: 11, reached: 'ban' });
    // schon gesperrt → keine neue Schwelle, Status bleibt „ban“
    expect(penaltyPointsImpact(10, 2, cfg)).toMatchObject({ statusBefore: 'ban', statusAfter: 'ban', reached: null });
    // schon verwarnt, bleibt unter der Sperre
    expect(penaltyPointsImpact(6, 1, cfg)).toMatchObject({ statusAfter: 'warning', reached: null });
    // keine oder ungültige Punkte
    expect(penaltyPointsImpact(5, null, cfg)).toMatchObject({ after: 5, reached: null });
    expect(penaltyPointsImpact(5, 0, cfg)).toMatchObject({ after: 5, reached: null });
    expect(penaltyPointsImpact(5, -3, cfg)).toMatchObject({ after: 5, reached: null });
  });
});

describe('Verfall', () => {
  it('N Runden nach der Runde des Vorfalls, abgesagte Runden zählen nicht', () => {
    const rounds = season(10, 4, [4]);
    expect(expiryRoundFor(2, rounds, 3)).toBe(6); // R3, R5, R6 (R4 abgesagt)
    expect(expiryRoundFor(2, rounds, 1)).toBe(3);
    expect(expiryRoundFor(2, rounds, null)).toBeNull();
    // Saison endet vorher → gilt bis Saisonende
    expect(expiryRoundFor(8, rounds, 3)).toBeNull();
    expect(expiryRoundFor(7, rounds, 3)).toBe(10);
  });

  it('gewertete Runden: höchste Runde mit veröffentlichtem Ergebnis', () => {
    expect(completedThroughRound(season(10, 0))).toBe(0);
    expect(completedThroughRound(season(10, 4))).toBe(4);
    const rounds: PenaltyRound[] = [
      { id: 1, number: 1, status: 'final' },
      { id: 2, number: 2, status: 'corrected' },
      { id: 3, number: 3, status: 'provisional' },
      { id: 4, number: 4, status: 'lineup_published' },
    ];
    expect(completedThroughRound(rounds)).toBe(3);
  });

  it('Punkte verfallen, sobald die Verfallsrunde gewertet ist', () => {
    const cfg = { ...CFG, expiry_rounds: 2 };
    const early = [dec(1, 1, 3), dec(1, 2, 4)];
    const decisions = [...early, dec(1, 4, 2)];
    // nach R2: noch nichts verfallen (R1-Punkte verfallen nach R3)
    let acc = penaltyPointsAccount({ config: cfg, rounds: season(8, 2), decisions: early }, 1);
    expect(acc).toMatchObject({ active: 7, expired: 0 });
    expect(acc.entries.map((e) => e.expiresAfterRound)).toEqual([3, 4]);
    expect(acc.nextExpiry).toEqual({ afterRound: 3, points: 3 });

    // genau nach R3: R1-Punkte verfallen
    acc = penaltyPointsAccount({ config: cfg, rounds: season(8, 3), decisions: early }, 1);
    expect(acc).toMatchObject({ active: 4, expired: 3 });
    expect(acc.entries[0]).toMatchObject({ roundNumber: 1, expired: true });

    // nach R4: R1 und R2 verfallen, R4-Punkte aktiv bis R6
    acc = penaltyPointsAccount({ config: cfg, rounds: season(8, 4), decisions }, 1);
    expect(acc).toMatchObject({ active: 2, expired: 7, status: 'ok' });
    expect(acc.entries.at(-1)).toMatchObject({ roundNumber: 4, expiresAfterRound: 6, expired: false });
    expect(acc.nextExpiry).toEqual({ afterRound: 6, points: 2 });

    // Stand nach einer bestimmten Runde erzwingen
    acc = penaltyPointsAccount({ config: cfg, rounds: season(8, 4), decisions, completedThrough: 2 }, 1);
    expect(acc).toMatchObject({ active: 9, expired: 0, status: 'warning' });
  });

  it('späte Entscheidung: Punkte sind schon beim Eintragen verfallen', () => {
    const rounds = season(8, 6);
    // Verfall nach 1 Runde: R5-Punkte verfallen nach R6 – R6 ist gewertet
    expect(pointsExpiredOnArrival(5, rounds, { expiryRounds: 1 })).toBe(true);
    expect(pointsExpiredOnArrival(6, rounds, { expiryRounds: 1 })).toBe(false);
    expect(pointsExpiredOnArrival(5, rounds, { expiryRounds: 2 })).toBe(false);
    expect(pointsExpiredOnArrival(5, rounds, { expiryRounds: null })).toBe(false);
    // Stand vor R6 erzwingen
    expect(pointsExpiredOnArrival(5, rounds, { expiryRounds: 1 }, 5)).toBe(false);
    // abgesagte Runde zählt nicht: Verfall nach R7, noch nicht gewertet
    expect(pointsExpiredOnArrival(5, season(8, 6, [6]), { expiryRounds: 1 })).toBe(false);
    // im Konto erscheint der Eintrag als verfallen und zählt nicht
    const acc = penaltyPointsAccount({ config: { ...CFG, expiry_rounds: 1 }, rounds, decisions: [dec(1, 5, 7)] }, 1);
    expect(acc).toMatchObject({ active: 0, expired: 7, status: 'ok' });
  });

  it('ohne Verfall gelten Punkte bis Saisonende', () => {
    const acc = penaltyPointsAccount({ config: CFG, rounds: season(8, 8), decisions: [dec(1, 1, 3), dec(1, 8, 3)] }, 1);
    expect(acc).toMatchObject({ active: 6, expired: 0, status: 'warning', nextExpiry: null });
    expect(acc.entries.every((e) => e.expiresAfterRound == null && !e.expired)).toBe(true);
  });

  it('mehrere Einträge mit gleicher Verfallsrunde werden im nächsten Verfall zusammengefasst', () => {
    const acc = penaltyPointsAccount({ config: { ...CFG, expiry_rounds: 3 }, rounds: season(8, 2), decisions: [dec(1, 2, 2), dec(1, 2, 1), dec(1, 1, 1)] }, 1);
    expect(acc.nextExpiry).toEqual({ afterRound: 4, points: 1 });
    const acc2 = penaltyPointsAccount({ config: { ...CFG, expiry_rounds: 3 }, rounds: season(8, 2), decisions: [dec(1, 2, 2), dec(1, 2, 1)] }, 1);
    expect(acc2.nextExpiry).toEqual({ afterRound: 5, points: 3 });
  });
});

describe('Konten', () => {
  it('zählt nur veröffentlichte Entscheidungen mit Punkten > 0 (Zurücknahme, Entwurf, 0 Punkte)', () => {
    const rounds = season(8, 4);
    const acc = penaltyPointsAccount(
      {
        config: CFG,
        rounds,
        decisions: [dec(1, 1, 3), dec(1, 2, 4, 'revoked'), dec(1, 3, 5, 'draft'), dec(1, 3, 0), dec(1, 4, null), dec(1, 4, 2)],
      },
      1,
    );
    expect(acc.active).toBe(5);
    expect(acc.entries.map((e) => e.points)).toEqual([3, 2]);
    expect(acc.status).toBe('ok');
    expect(acc).toMatchObject({ toWarning: 1, toBan: 5 });
  });

  it('Zurücknahme senkt das Konto unter die Schwelle', () => {
    const rounds = season(8, 4);
    const d1 = dec(1, 1, 4);
    const d2 = dec(1, 2, 3);
    const d3 = dec(1, 3, 3);
    expect(penaltyPointsAccount({ config: CFG, rounds, decisions: [d1, d2, d3] }, 1)).toMatchObject({ active: 10, status: 'ban', toBan: 0, toWarning: 0 });
    const revoked = { ...d3, status: 'revoked' as const };
    expect(penaltyPointsAccount({ config: CFG, rounds, decisions: [d1, d2, revoked] }, 1)).toMatchObject({ active: 7, status: 'warning' });
  });

  it('ignoriert Entscheidungen anderer Saisons', () => {
    const rounds = season(4, 4);
    const other: PenaltyDecision = { id: 999, public_ref: 'S1-R01-01', round_id: 1, driver_id: 1, penalty_points: 8, status: 'published' };
    expect(penaltyPointsAccount({ config: CFG, rounds, decisions: [other, dec(1, 2, 2)] }, 1).active).toBe(2);
  });

  it('mehrere Fahrer: sortiert nach aktiven, dann verfallenen Punkten', () => {
    const rounds = season(8, 5);
    const accounts = penaltyPointsAccounts({
      config: { ...CFG, expiry_rounds: 2 },
      rounds,
      decisions: [
        dec(7, 4, 3),
        dec(3, 5, 3),
        dec(3, 1, 4), // verfallen nach R3
        dec(5, 4, 6),
        dec(5, 5, 4),
        dec(9, 2, 2), // verfallen nach R4
        dec(4, 1, 0),
      ],
    });
    expect(accounts.map((a) => [a.driverId, a.active, a.expired, a.status])).toEqual([
      [5, 10, 0, 'ban'],
      [3, 3, 4, 'ok'],
      [7, 3, 0, 'ok'],
      [9, 0, 2, 'ok'],
    ]);
    // Fahrer ohne Punkte tauchen nicht auf, haben aber ein leeres Konto
    expect(accounts.some((a) => a.driverId === 4)).toBe(false);
    expect(penaltyPointsAccount({ config: CFG, rounds, decisions: [] }, 4)).toMatchObject({
      active: 0,
      expired: 0,
      entries: [],
      status: 'ok',
      toWarning: 6,
      toBan: 10,
      nextExpiry: null,
    });
  });

  it('Einträge nach Runde und Referenz sortiert; Konfiguration steckt im Konto', () => {
    const acc = penaltyPointsAccount({ config: {}, rounds: season(6, 3), decisions: [dec(2, 3, 1), dec(2, 1, 2), dec(2, 1, 1)] }, 2);
    expect(acc.entries.map((e) => e.roundNumber)).toEqual([1, 1, 3]);
    expect(acc.entries[0]!.ref < acc.entries[1]!.ref).toBe(true);
    expect(acc.config).toEqual({ warningThreshold: 8, banThreshold: 12, expiryRounds: null });
  });
});
