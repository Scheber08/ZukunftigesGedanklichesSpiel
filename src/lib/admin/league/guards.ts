/**
 * Store-basierte Prüfungen für andere Admin-Module: Ist die Saison einer Runde eingefroren?
 * (Ergebnisse, Aufstellungen und Urteile abgeschlossener Saisons dürfen sich nicht mehr ändern.)
 */
import type { Store } from '~/lib/db/store';
import type { Id } from '~/lib/db/types';
import { isSeasonFrozen } from './season';

export async function seasonFrozenById(store: Store, seasonId: Id): Promise<boolean> {
  const [season] = await store.select('seasons', { eq: { id: seasonId }, limit: 1 });
  return isSeasonFrozen(season);
}

export async function seasonFrozenForRound(store: Store, roundId: Id): Promise<boolean> {
  const [round] = await store.select('rounds', { eq: { id: roundId }, limit: 1 });
  if (!round) return false;
  return seasonFrozenById(store, round.season_id);
}
