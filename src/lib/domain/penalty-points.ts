/**
 * Strafpunkte-System (Plan Phase 2, §5.3, §13 Punkt 6) – reine Logik ohne I/O.
 *
 * Konto je Fahrer und Saison aus den veröffentlichten, nicht zurückgenommenen Entscheidungen
 * der Saison (Entwürfe und zurückgenommene Entscheidungen zählen nie):
 *
 * - **Aktive Punkte** = Summe der Punkte, die noch nicht verfallen sind.
 * - **Verfall** (`expiry_rounds`): Bei N verfallen die Punkte N Runden nach der Runde des
 *   Vorfalls. Gezählt werden nur Runden, die nicht abgesagt sind. Beispiel N = 3, Vorfall in R2:
 *   Die Punkte gelten in R3, R4 und R5 und sind verfallen, sobald R5 gewertet ist
 *   („verfällt nach R5“). `null` = die Punkte gelten bis zum Saisonende. Hat die Saison nach
 *   dem Vorfall weniger als N Runden, gelten sie ebenfalls bis zum Saisonende.
 * - **Gewertet** heißt: Die Runde hat ein veröffentlichtes Ergebnis (vorläufig, final oder
 *   korrigiert). Maßgeblich ist die höchste gewertete Rundennummer der Saison.
 * - **Status**: `ban` ab der Sperrschwelle, `warning` ab der Verwarnschwelle, sonst `ok`.
 *   Das Konto zeigt nur den Stand – die Rennsperre selbst sprechen die Stewards als eigene
 *   Entscheidung aus.
 *
 * **Standardwerte**, wenn `seasons.penalty_points_config` leer ist (angelehnt an die
 * Superlizenz der Formel 1: 12 Punkte = Rennsperre):
 * - Sperrschwelle 12 Punkte,
 * - Verwarnschwelle zwei Drittel der Sperrschwelle, aufgerundet (bei 12 also 8),
 * - kein Verfall (Punkte gelten bis zum Saisonende).
 */

import type { DecisionRow, Id, PenaltyPointsConfig, RoundRow } from '../db/types';
import { RESULT_VISIBLE_STATUSES } from '../db/types';

export const DEFAULT_BAN_THRESHOLD = 12;
/** Größte erlaubte Schwelle im Admin-Formular */
export const MAX_THRESHOLD = 99;
/** Größter erlaubter Verfall in Runden im Admin-Formular */
export const MAX_EXPIRY_ROUNDS = 30;
/** Höchstens so viele Strafpunkte pro Entscheidung (siehe Entscheidungsformular) */
export const MAX_POINTS_PER_DECISION = 12;

export type PenaltyPointsStatus = 'ok' | 'warning' | 'ban';

/** Konfiguration mit eingesetzten Standardwerten. */
export interface ResolvedPenaltyPointsConfig {
  /** Verwarnung ab dieser Summe aktiver Punkte */
  warningThreshold: number;
  /** Rennsperre ab dieser Summe aktiver Punkte */
  banThreshold: number;
  /** Verfall nach so vielen Runden; null = gelten bis Saisonende */
  expiryRounds: number | null;
}

export type PenaltyRound = Pick<RoundRow, 'id' | 'number' | 'status'>;
export type PenaltyDecision = Pick<DecisionRow, 'id' | 'public_ref' | 'round_id' | 'driver_id' | 'penalty_points' | 'status'>;

export interface PenaltyPointsEntry {
  decisionId: Id;
  /** Öffentliche Referenz, z. B. „S2-R03-01“ */
  ref: string;
  roundId: Id;
  roundNumber: number;
  points: number;
  /** Rundennummer, nach der die Punkte verfallen; null = gelten bis Saisonende */
  expiresAfterRound: number | null;
  expired: boolean;
}

export interface PenaltyPointsAccount {
  driverId: Id;
  /** Summe der aktiven (nicht verfallenen) Punkte */
  active: number;
  /** Summe der verfallenen Punkte */
  expired: number;
  /** Alle Einträge mit Punkten > 0, nach Runde und Referenz sortiert */
  entries: PenaltyPointsEntry[];
  status: PenaltyPointsStatus;
  /** Punkte bis zur Verwarnschwelle (0 = erreicht) */
  toWarning: number;
  /** Punkte bis zur Sperrschwelle (0 = erreicht) */
  toBan: number;
  /** Nächster Verfall aktiver Punkte (frühester), falls es einen gibt */
  nextExpiry: { afterRound: number; points: number } | null;
  config: ResolvedPenaltyPointsConfig;
}

export interface PenaltyPointsInput {
  config: PenaltyPointsConfig | null | undefined;
  /** Runden der Saison (andere Runden werden ignoriert) */
  rounds: readonly PenaltyRound[];
  /** Entscheidungen – es zählen nur veröffentlichte aus Runden dieser Saison */
  decisions: readonly PenaltyDecision[];
  /** Stand nach dieser Rundennummer (Standard: höchste gewertete Runde der Saison) */
  completedThrough?: number;
}

// ---------------------------------------------------------------------------- Konfiguration

const positiveInt = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max ? v : null;

/** Verwarnschwelle als Standard aus der Sperrschwelle: zwei Drittel, aufgerundet. */
export function defaultWarningThreshold(banThreshold: number): number {
  return Math.max(1, Math.ceil((banThreshold * 2) / 3));
}

/**
 * Konfiguration mit Standardwerten auffüllen. Ungültige oder widersprüchliche Werte
 * (Verwarnschwelle ≥ Sperrschwelle) werden durch den Standard ersetzt – die Sperrschwelle
 * hat dabei Vorrang.
 */
export function resolvePenaltyPointsConfig(config: PenaltyPointsConfig | null | undefined): ResolvedPenaltyPointsConfig {
  const warningRaw = positiveInt(config?.warning_threshold, MAX_THRESHOLD);
  const banRaw = positiveInt(config?.ban_threshold, MAX_THRESHOLD);
  const banThreshold = banRaw ?? (warningRaw != null ? Math.max(DEFAULT_BAN_THRESHOLD, warningRaw + 1) : DEFAULT_BAN_THRESHOLD);
  const warningThreshold = warningRaw != null && warningRaw < banThreshold ? warningRaw : defaultWarningThreshold(banThreshold);
  return {
    warningThreshold: Math.min(warningThreshold, banThreshold),
    banThreshold,
    expiryRounds: positiveInt(config?.expiry_rounds, 999),
  };
}

export type PenaltyConfigField = 'warning_threshold' | 'ban_threshold' | 'expiry_rounds';

/** Vollständig ausgefüllte, geprüfte Konfiguration (so wird sie gespeichert). */
export interface ValidPenaltyPointsConfig extends PenaltyPointsConfig {
  warning_threshold: number;
  ban_threshold: number;
  expiry_rounds: number | null;
}

/**
 * Admin-Eingabe prüfen (Plan Phase 2): Verwarnschwelle 1–98, Sperrschwelle 2–99 und größer
 * als die Verwarnschwelle, Verfall 1–30 Runden oder nie (null).
 */
export function validatePenaltyPointsConfig(input: {
  warning_threshold: number | null | undefined;
  ban_threshold: number | null | undefined;
  expiry_rounds: number | null | undefined;
}): { ok: true; config: ValidPenaltyPointsConfig } | { ok: false; errors: Partial<Record<PenaltyConfigField, string>> } {
  const errors: Partial<Record<PenaltyConfigField, string>> = {};
  const { warning_threshold: warning, ban_threshold: ban, expiry_rounds: expiry } = input;
  const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

  if (!isInt(warning) || warning < 1 || warning > MAX_THRESHOLD - 1) {
    errors.warning_threshold = `Verwarnschwelle: ganze Zahl von 1 bis ${MAX_THRESHOLD - 1}.`;
  }
  if (!isInt(ban) || ban < 2 || ban > MAX_THRESHOLD) {
    errors.ban_threshold = `Sperrschwelle: ganze Zahl von 2 bis ${MAX_THRESHOLD}.`;
  } else if (isInt(warning) && errors.warning_threshold == null && ban <= warning) {
    errors.ban_threshold = 'Die Sperrschwelle muss größer als die Verwarnschwelle sein.';
  }
  if (expiry != null && (!isInt(expiry) || expiry < 1 || expiry > MAX_EXPIRY_ROUNDS)) {
    errors.expiry_rounds = `Verfall: ganze Zahl von 1 bis ${MAX_EXPIRY_ROUNDS} Runden (oder „nie“).`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, config: { warning_threshold: warning!, ban_threshold: ban!, expiry_rounds: expiry ?? null } };
}

// ---------------------------------------------------------------------------- Konto

export function penaltyPointsStatus(active: number, config: ResolvedPenaltyPointsConfig): PenaltyPointsStatus {
  if (active >= config.banThreshold) return 'ban';
  if (active >= config.warningThreshold) return 'warning';
  return 'ok';
}

const SEVERITY: Record<PenaltyPointsStatus, number> = { ok: 0, warning: 1, ban: 2 };

/** Höchste gewertete Rundennummer (0, wenn noch keine Runde gewertet ist). */
export function completedThroughRound(rounds: readonly PenaltyRound[]): number {
  return rounds.reduce((max, r) => (RESULT_VISIBLE_STATUSES.includes(r.status) && r.number > max ? r.number : max), 0);
}

/**
 * Runde, nach der Punkte aus Runde `roundNumber` verfallen: die N-te nicht abgesagte Runde
 * danach. null bei „kein Verfall“ oder wenn die Saison vorher endet.
 */
export function expiryRoundFor(roundNumber: number, rounds: readonly PenaltyRound[], expiryRounds: number | null): number | null {
  if (expiryRounds == null) return null;
  const after = rounds
    .filter((r) => r.status !== 'cancelled' && r.number > roundNumber)
    .map((r) => r.number)
    .sort((a, b) => a - b);
  return after[expiryRounds - 1] ?? null;
}

function emptyAccount(driverId: Id, config: ResolvedPenaltyPointsConfig): PenaltyPointsAccount {
  return {
    driverId,
    active: 0,
    expired: 0,
    entries: [],
    status: 'ok',
    toWarning: config.warningThreshold,
    toBan: config.banThreshold,
    nextExpiry: null,
    config,
  };
}

function finish(account: PenaltyPointsAccount): PenaltyPointsAccount {
  const { config } = account;
  account.entries.sort((a, b) => a.roundNumber - b.roundNumber || a.ref.localeCompare(b.ref));
  account.status = penaltyPointsStatus(account.active, config);
  account.toWarning = Math.max(0, config.warningThreshold - account.active);
  account.toBan = Math.max(0, config.banThreshold - account.active);
  let next: PenaltyPointsAccount['nextExpiry'] = null;
  for (const e of account.entries) {
    if (e.expired || e.expiresAfterRound == null) continue;
    if (next == null || e.expiresAfterRound < next.afterRound) next = { afterRound: e.expiresAfterRound, points: e.points };
    else if (e.expiresAfterRound === next.afterRound) next.points += e.points;
  }
  account.nextExpiry = next;
  return account;
}

/**
 * Konten aller Fahrer mit mindestens einem Strafpunkt in der Saison, sortiert nach aktiven
 * Punkten (absteigend), dann verfallenen Punkten, dann Fahrer-ID.
 */
export function penaltyPointsAccounts(input: PenaltyPointsInput): PenaltyPointsAccount[] {
  const config = resolvePenaltyPointsConfig(input.config);
  const roundById = new Map(input.rounds.map((r) => [r.id, r]));
  const completed = input.completedThrough ?? completedThroughRound(input.rounds);
  const accounts = new Map<Id, PenaltyPointsAccount>();

  for (const d of input.decisions) {
    if (d.status !== 'published') continue;
    const points = d.penalty_points ?? 0;
    if (!Number.isFinite(points) || points <= 0) continue;
    const round = roundById.get(d.round_id);
    if (!round) continue;
    const expiresAfterRound = expiryRoundFor(round.number, input.rounds, config.expiryRounds);
    const expired = expiresAfterRound != null && completed >= expiresAfterRound;
    let account = accounts.get(d.driver_id);
    if (!account) {
      account = emptyAccount(d.driver_id, config);
      accounts.set(d.driver_id, account);
    }
    account.entries.push({ decisionId: d.id, ref: d.public_ref, roundId: round.id, roundNumber: round.number, points, expiresAfterRound, expired });
    if (expired) account.expired += points;
    else account.active += points;
  }

  return [...accounts.values()].map(finish).sort((a, b) => b.active - a.active || b.expired - a.expired || a.driverId - b.driverId);
}

/** Konto eines Fahrers (leer, wenn er keine Strafpunkte hat). */
export function penaltyPointsAccount(input: PenaltyPointsInput, driverId: Id): PenaltyPointsAccount {
  return (
    penaltyPointsAccounts({ ...input, decisions: input.decisions.filter((d) => d.driver_id === driverId) })[0] ??
    emptyAccount(driverId, resolvePenaltyPointsConfig(input.config))
  );
}

export interface PenaltyPointsImpact {
  before: number;
  after: number;
  statusBefore: PenaltyPointsStatus;
  statusAfter: PenaltyPointsStatus;
  /** Schwelle, die durch die neuen Punkte erstmals erreicht wird (null = keine neue Schwelle) */
  reached: Exclude<PenaltyPointsStatus, 'ok'> | null;
}

/**
 * Welche Schwelle erreicht eine neue Entscheidung? `activeBefore` sind die aktiven Punkte
 * ohne diese Entscheidung. Springt ein Fahrer direkt über beide Schwellen, ist `reached` „ban“.
 */
export function penaltyPointsImpact(
  activeBefore: number,
  newPoints: number | null | undefined,
  config: ResolvedPenaltyPointsConfig,
): PenaltyPointsImpact {
  const add = newPoints != null && Number.isFinite(newPoints) && newPoints > 0 ? newPoints : 0;
  const before = Math.max(0, activeBefore);
  const after = before + add;
  const statusBefore = penaltyPointsStatus(before, config);
  const statusAfter = penaltyPointsStatus(after, config);
  const reached = SEVERITY[statusAfter] > SEVERITY[statusBefore] ? (statusAfter as Exclude<PenaltyPointsStatus, 'ok'>) : null;
  return { before, after, statusBefore, statusAfter, reached };
}
