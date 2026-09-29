/**
 * ICS-Download pro Runde /rennen/[saison]/[runde].ics (Plan §4.3) –
 * gleiche UID wie im Abo, damit sich Einzeltermin und Abo nicht doppeln.
 */
import type { APIRoute } from 'astro';
import { buildRoundIcs, icsResponse, roundIcsFilename } from '~/lib/calendar/ics';
import { racePaths, type RacePathProps } from '~/lib/calendar/paths';
import { loadLeague } from '~/lib/server/league';

export const prerender = true;

export async function getStaticPaths() {
  return racePaths();
}

export const GET: APIRoute = async ({ props, site, url }) => {
  const { roundId } = props as RacePathProps;
  const league = await loadLeague();
  const round = league.round(roundId);
  const season = round ? league.season(round.season_id) : undefined;
  if (!round || !season) return new Response('Not found', { status: 404 });
  const base = site ?? new URL(url.origin);
  const filename = roundIcsFilename(season, round, league.track(round.track_id)?.slug);
  return icsResponse(buildRoundIcs(league, round, base), filename, 'attachment');
};
