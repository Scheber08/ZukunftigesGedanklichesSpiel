/**
 * Vorschau der neuen Wertung nach „Speichern als vorläufig“ (Plan §5.2 Ablauf 1):
 * Top 10 der Fahrerwertung mit Punkte- und Positionsveränderung durch diese Runde.
 */
import type { Id } from '../../db/types';
import { RESULT_VISIBLE_STATUSES } from '../../db/types';
import { driverStandings, type StandingsInput } from '../../domain/standings';

export interface StandingsPreviewRow {
  driverId: Id;
  teamId: Id | null;
  position: number;
  tied: boolean;
  points: number;
  /** Punkte aus dieser Runde. */
  pointsDelta: number;
  previousPosition: number | null;
  /** Positive Zahl = Plätze gewonnen, null = neu in der Wertung. */
  positionDelta: number | null;
}

/**
 * `input.results` muss die (noch nicht veröffentlichten) Ergebnisse der Runde enthalten.
 * Die Runde wird für „vorher“ ausgeblendet und für „nachher“ als gewertet behandelt.
 */
export function standingsPreview(input: StandingsInput, roundId: Id, limit = 10): StandingsPreviewRow[] {
  const withStatus = (visible: boolean) => ({
    ...input,
    rounds: input.rounds.map((r) => {
      if (r.id !== roundId) return r;
      if (!visible) return { ...r, status: 'scheduled' as const };
      return RESULT_VISIBLE_STATUSES.includes(r.status) ? r : { ...r, status: 'provisional' as const };
    }),
  });
  const before = driverStandings(withStatus(false));
  const after = driverStandings(withStatus(true));
  const prev = new Map(before.map((s) => [s.driverId, s]));
  return after.slice(0, limit).map((s) => {
    const p = prev.get(s.driverId);
    return {
      driverId: s.driverId,
      teamId: s.teamId,
      position: s.position,
      tied: s.tied,
      points: s.points,
      pointsDelta: s.points - (p?.points ?? 0),
      previousPosition: p?.position ?? null,
      positionDelta: p ? p.position - s.position : null,
    };
  });
}
