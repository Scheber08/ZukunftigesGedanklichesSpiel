/**
 * Steward-Entscheidungen → Wirkung auf Ergebnisse (Plan §5.3):
 * Zeit-, Positions- und DSQ-Strafen fließen automatisch ins Ergebnis ein,
 * Grid-Strafen wirken auf die Startaufstellung des nächsten Rennens.
 */

import type { DecisionRow, Id, SessionType, Verdict } from '../db/types';
import type { ResultPenalty } from './points';

type DecisionLike = Pick<
  DecisionRow,
  'driver_id' | 'verdict' | 'time_seconds' | 'positions' | 'status' | 'published_at' | 'session_id' | 'round_id' | 'id'
>;

/** Verdikte, die ein Ergebnis verändern. */
export const RESULT_AFFECTING_VERDICTS: readonly Verdict[] = ['time_penalty', 'position_penalty', 'dsq'];

function publishedInOrder<T extends DecisionLike>(decisions: readonly T[]): T[] {
  return decisions
    .filter((d) => d.status === 'published')
    .sort((a, b) => (a.published_at ?? '').localeCompare(b.published_at ?? '') || a.id - b.id);
}

/**
 * Strafen für eine Session. Entscheidungen ohne Session gelten für das Hauptrennen der Runde.
 */
export function penaltiesForSession<T extends DecisionLike>(
  decisions: readonly T[],
  session: { id: Id; round_id: Id; type: SessionType },
): ResultPenalty[] {
  const out: ResultPenalty[] = [];
  for (const d of publishedInOrder(decisions)) {
    if (d.round_id !== session.round_id) continue;
    const appliesHere = d.session_id != null ? d.session_id === session.id : session.type === 'race';
    if (!appliesHere) continue;
    if (d.verdict === 'time_penalty' && d.time_seconds) {
      out.push({ driverId: d.driver_id, kind: 'time', seconds: d.time_seconds });
    } else if (d.verdict === 'position_penalty' && d.positions) {
      out.push({ driverId: d.driver_id, kind: 'position', positions: d.positions });
    } else if (d.verdict === 'dsq') {
      out.push({ driverId: d.driver_id, kind: 'dsq' });
    }
  }
  return out;
}

/** Grid-Strafen aus der vorherigen Runde, die für die Startaufstellung dieser Runde gelten. */
export function gridPenaltiesFromPreviousRound<T extends DecisionLike>(
  decisions: readonly T[],
  previousRoundId: Id | null,
): Array<{ driverId: Id; positions: number }> {
  if (previousRoundId == null) return [];
  return publishedInOrder(decisions)
    .filter((d) => d.round_id === previousRoundId && d.verdict === 'grid_penalty_next' && d.positions)
    .map((d) => ({ driverId: d.driver_id, positions: d.positions! }));
}

/** Rennsperren aus der vorherigen Runde gelten für diese Runde. */
export function raceBansFromPreviousRound<T extends DecisionLike>(decisions: readonly T[], previousRoundId: Id | null): Set<Id> {
  if (previousRoundId == null) return new Set();
  return new Set(
    publishedInOrder(decisions)
      .filter((d) => d.round_id === previousRoundId && d.verdict === 'race_ban')
      .map((d) => d.driver_id),
  );
}

/** Öffentliche Referenz: S1-R03-02 */
export function formatDecisionRef(seasonNumber: number, roundNumber: number, sequence: number): string {
  return `S${seasonNumber}-R${String(roundNumber).padStart(2, '0')}-${String(sequence).padStart(2, '0')}`;
}

/** Nächste freie laufende Nummer einer Runde anhand vorhandener Referenzen. */
export function nextDecisionSequence(existingRefs: readonly string[], seasonNumber: number, roundNumber: number): number {
  const prefix = `S${seasonNumber}-R${String(roundNumber).padStart(2, '0')}-`;
  const used = existingRefs.filter((r) => r.startsWith(prefix)).map((r) => Number(r.slice(prefix.length)) || 0);
  return (used.length > 0 ? Math.max(...used) : 0) + 1;
}

/**
 * Befangenheit (Plan §5.3): Ein Steward, der am Vorfall beteiligt ist, darf nicht entscheiden.
 */
export function isConflicted(
  stewardDriverId: Id | null,
  incident: { involved_driver_ids: readonly Id[]; reporter_driver_id: Id | null } | null,
  decisionDriverId: Id,
): boolean {
  if (stewardDriverId == null) return false;
  if (stewardDriverId === decisionDriverId) return true;
  if (!incident) return false;
  return incident.involved_driver_ids.includes(stewardDriverId) || incident.reporter_driver_id === stewardDriverId;
}
