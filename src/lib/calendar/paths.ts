/**
 * getStaticPaths für Rennseiten und Einzel-ICS: alle Runden aller Saisons
 * (season = season.slug, round = Rundennummer).
 */

import { loadLeague } from '~/lib/server/league';

export interface RacePathProps {
  roundId: number;
}

export async function racePaths(): Promise<Array<{ params: { season: string; round: string }; props: RacePathProps }>> {
  const league = await loadLeague();
  return league.data.rounds.flatMap((round) => {
    const season = league.season(round.season_id);
    if (!season) return [];
    return [{ params: { season: season.slug, round: String(round.number) }, props: { roundId: round.id } }];
  });
}
