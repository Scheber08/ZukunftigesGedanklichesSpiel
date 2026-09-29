/**
 * Zahlen für die Discord-Karte (Plan §8.1): GET /api/discord-card → { members, online }.
 * Der Cron-Job fragt die Invite-API ab und speichert das Ergebnis; kein iframe, keine Besucherdaten.
 */
import type { APIRoute } from 'astro';
import { loadPublicSettings } from '~/lib/server/league';

export const prerender = false;

export const GET: APIRoute = async () => {
  let body: { members: number | null; online: number | null };
  try {
    const { discord_counts: counts } = await loadPublicSettings();
    body = { members: counts.members ?? null, online: counts.online ?? null };
  } catch (err) {
    console.error('Discord-Zahlen nicht lesbar', err);
    body = { members: null, online: null };
  }
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600, s-maxage=600' },
  });
};
