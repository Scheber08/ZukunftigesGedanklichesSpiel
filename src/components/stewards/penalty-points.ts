/**
 * Strafpunkte-Konten aus der League (öffentliche, statisch gebaute Seiten): Register /stewards,
 * Entscheidungsseite, Regelwerk-Hinweis und Fahrerprofil (PenaltyPointsPanel).
 * Die Rechenlogik steckt in src/lib/domain/penalty-points.ts.
 */
import type { UiKey } from '~/i18n';
import type { Id, SeasonRow } from '~/lib/db/types';
import {
  penaltyPointsAccount,
  penaltyPointsAccounts,
  resolvePenaltyPointsConfig,
  type PenaltyPointsAccount,
  type PenaltyPointsEntry,
  type PenaltyPointsStatus,
  type ResolvedPenaltyPointsConfig,
} from '~/lib/domain/penalty-points';
import type { League } from '~/lib/league/league';

export interface SeasonPenaltyPoints {
  season: SeasonRow;
  config: ResolvedPenaltyPointsConfig;
  /** Fahrer mit mindestens einem Strafpunkt, meiste aktive Punkte zuerst */
  accounts: PenaltyPointsAccount[];
}

function inputFor(league: League, season: SeasonRow) {
  return { config: season.penalty_points_config, rounds: league.roundsOf(season.id), decisions: league.decisions };
}

/** Konten einer Saison – null, wenn das Strafpunkte-System dort nicht aktiv ist. */
export function seasonPenaltyPoints(league: League, season: SeasonRow | undefined): SeasonPenaltyPoints | null {
  if (!season?.penalty_points_enabled) return null;
  return { season, config: resolvePenaltyPointsConfig(season.penalty_points_config), accounts: penaltyPointsAccounts(inputFor(league, season)) };
}

/** Konto eines Fahrers in einer Saison – null, wenn das System dort nicht aktiv ist. */
export function driverPenaltyAccount(league: League, season: SeasonRow | undefined, driverId: Id): PenaltyPointsAccount | null {
  if (!season?.penalty_points_enabled) return null;
  return penaltyPointsAccount(inputFor(league, season), driverId);
}

/** Eintrag einer Entscheidung im Konto ihres Fahrers (für die Entscheidungsseite). */
export function decisionPenaltyEntry(league: League, season: SeasonRow, decision: { id: Id; driver_id: Id }): PenaltyPointsEntry | null {
  return driverPenaltyAccount(league, season, decision.driver_id)?.entries.find((e) => e.decisionId === decision.id) ?? null;
}

export const PENALTY_STATUS_KEY: Record<PenaltyPointsStatus, UiKey> = {
  ok: 'stewards.points.status.ok',
  warning: 'stewards.points.status.warning',
  ban: 'stewards.points.status.ban',
};

/** Badge-Farbe je Status – immer zusammen mit dem Text. */
export const PENALTY_STATUS_VARIANT: Record<PenaltyPointsStatus, 'muted' | 'warning' | 'danger'> = {
  ok: 'muted',
  warning: 'warning',
  ban: 'danger',
};

/** „1 Strafpunkt“ / „3 Strafpunkte“ */
export function pointsKey(n: number): UiKey {
  return n === 1 ? 'stewards.points.one' : 'stewards.points.many';
}

/** Verfall-Regel der Saison als Text-Schlüssel mit Parameter. */
export function expiryRuleKey(config: ResolvedPenaltyPointsConfig): { key: UiKey; n: number } {
  if (config.expiryRounds == null) return { key: 'stewards.points.expiry.season', n: 0 };
  return { key: config.expiryRounds === 1 ? 'stewards.points.expiry.rounds1' : 'stewards.points.expiry.roundsN', n: config.expiryRounds };
}

/** Verfall eines Eintrags als Text-Schlüssel mit Parameter. */
export function entryExpiryKey(entry: Pick<PenaltyPointsEntry, 'expired' | 'expiresAfterRound'>): { key: UiKey; n: number } {
  if (entry.expired) return { key: 'stewards.points.entry.expired', n: entry.expiresAfterRound ?? 0 };
  if (entry.expiresAfterRound == null) return { key: 'stewards.points.entry.untilSeasonEnd', n: 0 };
  return { key: 'stewards.points.entry.expiresAfter', n: entry.expiresAfterRound };
}
