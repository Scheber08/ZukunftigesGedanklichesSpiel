/**
 * Calendar subscription /en/calendar.ics – English texts, same UIDs as /kalender.ics.
 */
import type { APIRoute } from 'astro';
import { buildCalendarIcs, icsResponse } from '~/lib/calendar/ics';
import { loadLeague } from '~/lib/server/league';

export const prerender = true;

export const GET: APIRoute = async ({ site, url }) => {
  const league = await loadLeague();
  const base = site ?? new URL(url.origin);
  return icsResponse(buildCalendarIcs(league, base, 'en'), 'calendar.ics');
};
