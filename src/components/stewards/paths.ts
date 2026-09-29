/**
 * Statische Pfade für einzelne Entscheidungen (/stewards/[ref], /en/stewards/[ref]).
 * Die Referenz (z. B. „S2-R03-01“) wird unverändert als URL-Segment benutzt.
 */
import { loadLeague } from '~/lib/server/league';

export async function decisionStaticPaths() {
  const league = await loadLeague();
  return league.decisions.map((d) => ({ params: { ref: d.public_ref } }));
}
