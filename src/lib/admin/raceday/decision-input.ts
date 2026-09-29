/**
 * Entscheidungsformular (Plan §5.3): Eingaben je Art prüfen und vereinheitlichen.
 * Zeitstrafe braucht Sekunden, Positions- und Grid-Strafe brauchen Plätze;
 * Strafpunkte nur, wenn das System in der Saison aktiv ist.
 */
import type { DecisionRow, Id, Verdict } from '../../db/types';

export interface DecisionInput {
  incidentId: Id | null;
  roundId: Id;
  sessionId: Id | null;
  driverId: Id;
  verdict: Verdict;
  timeSeconds: number | null;
  positions: number | null;
  penaltyPoints: number | null;
  reasoningDe: string;
  reasoningEn: string | null;
  ruleRef: string | null;
  clipUrl: string | null;
}

export type DecisionFields = Pick<
  DecisionRow,
  | 'incident_id'
  | 'round_id'
  | 'session_id'
  | 'driver_id'
  | 'verdict'
  | 'time_seconds'
  | 'positions'
  | 'penalty_points'
  | 'reasoning_de'
  | 'reasoning_en'
  | 'rule_ref'
  | 'clip_url'
>;

export const MAX_TIME_PENALTY_S = 120;
export const MAX_POSITIONS = 22;

/** Nur https-Links ohne Leerzeichen werden als Link gezeigt bzw. gespeichert (kein javascript: o. Ä.). */
export function isHttpsUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value.trim());
}

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
};

/** Prüft die Eingabe; liefert Fehler je Feld oder die Datenbankfelder. */
export function normalizeDecision(
  input: DecisionInput,
  opts: { penaltyPointsEnabled: boolean },
): { ok: true; fields: DecisionFields } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const reasoningDe = (input.reasoningDe ?? '').trim();
  if (reasoningDe.length < 10) errors.reasoningDe = 'Bitte begründe die Entscheidung (mindestens 10 Zeichen).';

  let timeSeconds: number | null = null;
  let positions: number | null = null;
  if (input.verdict === 'time_penalty') {
    if (!Number.isInteger(input.timeSeconds) || (input.timeSeconds ?? 0) < 1 || (input.timeSeconds ?? 0) > MAX_TIME_PENALTY_S) {
      errors.timeSeconds = `Zeitstrafe in ganzen Sekunden (1–${MAX_TIME_PENALTY_S}).`;
    } else timeSeconds = input.timeSeconds;
  }
  if (input.verdict === 'position_penalty' || input.verdict === 'grid_penalty_next') {
    if (!Number.isInteger(input.positions) || (input.positions ?? 0) < 1 || (input.positions ?? 0) > MAX_POSITIONS) {
      errors.positions = `Anzahl Plätze (1–${MAX_POSITIONS}).`;
    } else positions = input.positions;
  }

  let penaltyPoints: number | null = null;
  if (opts.penaltyPointsEnabled && input.penaltyPoints != null) {
    if (!Number.isInteger(input.penaltyPoints) || input.penaltyPoints < 0 || input.penaltyPoints > 12) {
      errors.penaltyPoints = 'Strafpunkte als ganze Zahl (0–12).';
    } else penaltyPoints = input.penaltyPoints;
  }

  const clipUrl = clean(input.clipUrl);
  if (clipUrl && !isHttpsUrl(clipUrl)) errors.clipUrl = 'Bitte einen https-Link angeben.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      incident_id: input.incidentId,
      round_id: input.roundId,
      session_id: input.sessionId,
      driver_id: input.driverId,
      verdict: input.verdict,
      time_seconds: timeSeconds,
      positions,
      penalty_points: penaltyPoints,
      reasoning_de: reasoningDe,
      reasoning_en: clean(input.reasoningEn),
      rule_ref: clean(input.ruleRef),
      clip_url: clipUrl,
    },
  };
}

/** Hat sich der Inhalt eines Entwurfs geändert? (Dann zählen bisherige Stimmen nicht mehr.) */
export function decisionContentChanged(before: DecisionFields, after: DecisionFields): boolean {
  const keys: Array<keyof DecisionFields> = [
    'session_id',
    'driver_id',
    'verdict',
    'time_seconds',
    'positions',
    'penalty_points',
    'reasoning_de',
    'reasoning_en',
    'rule_ref',
  ];
  return keys.some((k) => (before[k] ?? null) !== (after[k] ?? null));
}

/** Stimmen (decided_by) um eine Person ergänzen, ohne Duplikate. */
export function addVote(decidedBy: readonly string[], userId: string): string[] {
  return decidedBy.includes(userId) ? [...decidedBy] : [...decidedBy, userId];
}

/** Vier-Augen-Prinzip: genug verschiedene Stimmen zum Veröffentlichen? */
export function enoughVotes(decidedBy: readonly string[], twoStewardRule: boolean): boolean {
  return new Set(decidedBy).size >= (twoStewardRule ? 2 : 1);
}
