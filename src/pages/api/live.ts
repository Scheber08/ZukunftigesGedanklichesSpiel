/**
 * LIVE-Status für Badge und Banner (Plan §8.2): GET /api/live → { live, title }.
 * Den Status pflegt der Cron-Job; hier nur lesen, 60 s cachen.
 */
import type { APIRoute } from 'astro';
import { loadPublicSettings } from '~/lib/server/league';

export const prerender = false;

export const GET: APIRoute = async () => {
  let body: { live: boolean; title: string | null };
  try {
    const settings = await loadPublicSettings();
    // Ohne eingetragenen Kanal ist die Live-Anzeige komplett aus
    const live = Boolean(settings.twitch_channel) && settings.live_status.live === true;
    body = { live, title: live ? settings.live_status.title : null };
  } catch (err) {
    console.error('Live-Status nicht lesbar', err);
    body = { live: false, title: null };
  }
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=60' },
  });
};
