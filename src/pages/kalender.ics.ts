/**
 * Kalender-Abo /kalender.ics (Plan §4.3): aktuelle und geplante Saisons,
 * statisch vorgerendert – jeder Rebuild nach „Veröffentlichen“ aktualisiert das Abo.
 */
import type { APIRoute } from 'astro';
import { buildCalendarIcs, icsResponse } from '~/lib/calendar/ics';
import { loadLeague } from '~/lib/server/league';

export const prerender = true;

export const GET: APIRoute = async ({ site, url }) => {
  const league = await loadLeague();
  const base = site ?? new URL(url.origin);
  return icsResponse(buildCalendarIcs(league, base), 'kalender.ics');
};
