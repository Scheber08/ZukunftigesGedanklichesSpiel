/**
 * Entscheidungsformular (Plan §5.3): Eingaben je Art prüfen und vereinheitlichen.
 * Zeitstrafe braucht Sekunden, Positions- und Grid-Strafe brauchen Plätze;
 * Strafpunkte nur, wenn das System in der Saison aktiv ist (nicht bei „Keine Strafe“).
 */
import type { Store } from '../../db/store';
import type { DecisionRow, Id, SeasonRow, Verdict } from '../../db/types';
import {
  MAX_POINTS_PER_DECISION,
  penaltyPointsAccounts,
  penaltyPointsImpact,
  pointsExpiredOnArrival,
  resolvePenaltyPointsConfig,
  type PenaltyPointsAccount,
  type PenaltyPointsStatus,
  type ResolvedPenaltyPointsConfig,
} from '../../domain/penalty-points';

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
    if (!Number.isInteger(input.penaltyPoints) || input.penaltyPoints < 0 || input.penaltyPoints > MAX_POINTS_PER_DECISION) {
      errors.penaltyPoints = `Strafpunkte als ganze Zahl (0–${MAX_POINTS_PER_DECISION}).`;
    } else if (input.verdict === 'no_action' && input.penaltyPoints > 0) {
      errors.penaltyPoints = 'Bei „Keine Strafe“ gibt es keine Strafpunkte.';
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

// ---------------------------------------------------------------------------- Strafpunkte (Plan Phase 2)

export interface PenaltyPointsWarning {
  level: 'warning' | 'ban';
  /** aktive Punkte nach der Entscheidung */
  after: number;
  text: string;
}

/**
 * Deutliche Warnung im Steward-Werkzeug, wenn eine neue Entscheidung eine Schwelle erreicht
 * (oder ein Fahrer über der Sperrschwelle weitere Punkte bekommt). `activeBefore` sind die
 * aktiven Punkte ohne diese Entscheidung. null = keine Warnung.
 */
export function penaltyPointsWarning(
  activeBefore: number,
  newPoints: number | null | undefined,
  config: ResolvedPenaltyPointsConfig,
): PenaltyPointsWarning | null {
  const impact = penaltyPointsImpact(activeBefore, newPoints, config);
  if (impact.after === impact.before) return null;
  const detail = `${impact.after} aktive Punkte, Sperre ab ${config.banThreshold}`;
  if (impact.reached === 'ban') {
    return { level: 'ban', after: impact.after, text: `Sperrschwelle erreicht – Rennsperre prüfen (${detail}).` };
  }
  if (impact.statusAfter === 'ban') {
    return { level: 'ban', after: impact.after, text: `Sperrschwelle schon vorher erreicht – Rennsperre prüfen (${detail}).` };
  }
  if (impact.reached === 'warning') {
    return {
      level: 'warning',
      after: impact.after,
      text: `Verwarnschwelle erreicht (${impact.after} aktive Punkte, Verwarnung ab ${config.warningThreshold}, Sperre ab ${config.banThreshold}).`,
    };
  }
  return null;
}

/** Hinweis, wenn die Punkte einer späten Entscheidung schon beim Eintragen verfallen sind. */
export function expiredOnArrivalText(config: Pick<ResolvedPenaltyPointsConfig, 'expiryRounds'>): string {
  const n = config.expiryRounds ?? 0;
  return `Die Punkte dieser Runde sind bereits verfallen (Verfall nach ${n === 1 ? '1 Runde' : `${n} Runden`}, die Verfallsrunde ist gewertet) – sie erscheinen im Konto, zählen aber nicht mehr.`;
}

/**
 * Hinweis unter dem Strafpunkte-Feld: Warnung bei Schwelle, sonst der neue Kontostand.
 * `expiredOnArrival`: Die Runde der Entscheidung liegt schon hinter dem Verfall – dann gibt es
 * keine Schwellen-Warnung, nur den Hinweis, dass die Punkte nicht mehr zählen.
 */
export function penaltyPointsNote(
  activeBefore: number,
  newPoints: number | null | undefined,
  config: ResolvedPenaltyPointsConfig,
  expiredOnArrival = false,
): { level: 'info' | 'warning' | 'ban'; text: string } | null {
  if (expiredOnArrival) {
    return newPoints != null && Number.isFinite(newPoints) && newPoints > 0 ? { level: 'info', text: expiredOnArrivalText(config) } : null;
  }
  const warning = penaltyPointsWarning(activeBefore, newPoints, config);
  if (warning) return warning;
  const impact = penaltyPointsImpact(activeBefore, newPoints, config);
  if (impact.after === impact.before) return null;
  return {
    level: 'info',
    text: `Konto danach: ${impact.after} aktive Punkte (Verwarnung ab ${config.warningThreshold}, Sperre ab ${config.banThreshold}).`,
  };
}

/** Konto eines beteiligten Fahrers für die Anzeige im Steward-Werkzeug. */
export interface PenaltyAccountRow {
  id: Id;
  label: string;
  active: number;
  expired: number;
  status: 'ok' | 'warning' | 'ban';
  nextExpiry: { afterRound: number; points: number } | null;
}

/** Strafpunkte-Daten fürs Entscheidungsformular (nur bei aktivem System). */
export interface DecisionFormPenalty {
  config: ResolvedPenaltyPointsConfig;
  /** Aktive Punkte je Fahrer-ID (nur Fahrer mit Konto; fehlend = 0) */
  active: Record<string, number>;
  /** Konten der Beteiligten */
  involved: PenaltyAccountRow[];
  seasonName: string;
  /** Punkte aus der Runde dieser Entscheidung sind schon verfallen (späte Entscheidung) */
  roundExpired: boolean;
}

// ---------------------------------------------------------------------------- Strafpunkte im Steward-Werkzeug

/*
 * Konten einer Saison per gezielter Store-Abfrage (kein loadLeague()) plus Anzeigedaten für
 * Formular und Entscheidungskarten. Nur nach der Rollenprüfung der Seite mit dem Service-Store aufrufen.
 */

export interface StewardPenaltyPoints {
  config: ResolvedPenaltyPointsConfig;
  /** Konten aller Fahrer mit Strafpunkten in der Saison, meiste aktive Punkte zuerst */
  accounts: PenaltyPointsAccount[];
  /** Aktive Punkte je Fahrer-ID (0, wenn nicht vorhanden) */
  activeOf(driverId: Id): number;
  accountOf(driverId: Id): PenaltyPointsAccount | undefined;
  /** Sind Punkte aus dieser Runde schon beim Eintragen verfallen? (unbekannte Runde: nein) */
  expiredInRound(roundId: Id): boolean;
}

/** Konten der Saison – null, wenn das Strafpunkte-System dort nicht aktiv ist. */
export async function loadStewardPenaltyPoints(store: Store, season: SeasonRow): Promise<StewardPenaltyPoints | null> {
  if (!season.penalty_points_enabled) return null;
  const rounds = await store.select('rounds', { eq: { season_id: season.id } });
  const decisions = rounds.length > 0 ? await store.select('decisions', { in: { round_id: rounds.map((r) => r.id) } }) : [];
  const accounts = penaltyPointsAccounts({ config: season.penalty_points_config, rounds, decisions });
  const byDriver = new Map(accounts.map((a) => [a.driverId, a]));
  const config = resolvePenaltyPointsConfig(season.penalty_points_config);
  return {
    config,
    accounts,
    activeOf: (driverId) => byDriver.get(driverId)?.active ?? 0,
    accountOf: (driverId) => byDriver.get(driverId),
    expiredInRound: (roundId) => {
      const round = rounds.find((r) => r.id === roundId);
      return round != null && pointsExpiredOnArrival(round.number, rounds, config);
    },
  };
}

export const PENALTY_STATUS_LABEL: Record<PenaltyPointsStatus, string> = {
  ok: 'unauffällig',
  warning: 'Verwarnschwelle erreicht',
  ban: 'Sperrschwelle erreicht',
};

export const PENALTY_STATUS_BADGE: Record<PenaltyPointsStatus, 'muted' | 'warning' | 'danger'> = {
  ok: 'muted',
  warning: 'warning',
  ban: 'danger',
};

/** Konto-Zeilen für die beteiligten Fahrer (Reihenfolge wie übergeben, ohne Doppelte). */
export function involvedAccounts(pp: StewardPenaltyPoints, driverIds: readonly Id[], label: (id: Id) => string): PenaltyAccountRow[] {
  return [...new Set(driverIds)].map((id) => {
    const a = pp.accountOf(id);
    return {
      id,
      label: label(id),
      active: a?.active ?? 0,
      expired: a?.expired ?? 0,
      status: a?.status ?? 'ok',
      nextExpiry: a?.nextExpiry ?? null,
    };
  });
}

/**
 * Daten fürs Entscheidungsformular: Schwellen, aktive Punkte aller Fahrer, Konten der Beteiligten
 * und ob Punkte aus der Runde der Entscheidung (`roundId`) schon verfallen sind.
 */
export function formPenalty(
  pp: StewardPenaltyPoints | null,
  season: Pick<SeasonRow, 'name'>,
  involvedIds: readonly Id[],
  label: (id: Id) => string,
  roundId?: Id | null,
): DecisionFormPenalty | null {
  if (!pp) return null;
  return {
    config: pp.config,
    active: Object.fromEntries(pp.accounts.filter((a) => a.active > 0).map((a) => [String(a.driverId), a.active])),
    involved: involvedAccounts(pp, involvedIds, label),
    seasonName: season.name,
    roundExpired: roundId != null && pp.expiredInRound(roundId),
  };
}

/**
 * Warnung für einen Entwurf: Welche Schwelle erreicht er beim Veröffentlichen?
 * Veröffentlichte Entscheidungen stecken schon im Konto – dort keine Warnung. Ebenso keine
 * Warnung, wenn die Punkte der Runde schon verfallen sind (späte Entscheidung).
 */
export function draftWarning(
  pp: StewardPenaltyPoints | null,
  d: Pick<DecisionRow, 'status' | 'driver_id' | 'penalty_points'> & Partial<Pick<DecisionRow, 'round_id'>>,
): PenaltyPointsWarning | null {
  if (!pp || d.status !== 'draft') return null;
  if (d.round_id != null && pp.expiredInRound(d.round_id)) return null;
  return penaltyPointsWarning(pp.activeOf(d.driver_id), d.penalty_points, pp.config);
}
