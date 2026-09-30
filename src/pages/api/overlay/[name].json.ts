/**
 * Live-Daten der OBS-Overlays (Plan Phase 2): GET /api/overlay/<name>.json?lang=de|en&n=10&art=fahrer|teams
 * – naechstes-rennen, aufstellung, wertung, ergebnis, ticker.
 *
 * Gezielte Abfragen über den öffentlichen Store (kein loadLeague() pro Anfrage), nur öffentliche
 * Daten. 15 s cachebar; in Produktion zusätzlich über die Cloudflare-Cache-API, damit viele
 * Zuschauer-/OBS-Abfragen nicht jedes Mal die Datenbank erreichen.
 */
import type { APIRoute } from 'astro';
import { isOverlayName, overlayApiPath, parseOverlayParams } from '~/components/overlay/params';
import { isDemoMode } from '~/lib/server/env';
import { buildOverlayPayload, liveSnapshot, overlayParts } from '~/lib/server/live-data';

export const prerender = false;

const MAX_AGE = 15;

const baseHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'x-robots-tag': 'noindex, nofollow',
  // Öffentliche Daten: auch für eigene Widgets anderer Stream-Tools abrufbar
  'access-control-allow-origin': '*',
};

function json(body: unknown, status = 200, cache = true): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...baseHeaders, 'cache-control': cache ? `public, max-age=${MAX_AGE}, s-maxage=${MAX_AGE}` : 'no-store' },
  });
}

/** Cloudflare-Cache des Rechenzentrums (im Demo-Modus und lokal aus). */
function edgeCache(): Cache | null {
  if (isDemoMode()) return null;
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ params, url }) => {
  const name = params.name;
  if (!isOverlayName(name)) return json({ error: 'not_found' }, 404, false);
  const p = parseOverlayParams(name, url.searchParams);

  // Fester Cache-Schlüssel aus den ausgewerteten Parametern (unbekannte Parameter ändern nichts)
  const cacheKey = new Request(new URL(overlayApiPath(name, p), url.origin).href, { method: 'GET' });
  const cache = edgeCache();
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch {
      // Cache nicht verfügbar – normal weiter
    }
  }

  try {
    const snap = await liveSnapshot(overlayParts(name));
    const res = json(buildOverlayPayload(name, snap, p));
    if (cache) {
      try {
        await cache.put(cacheKey, res.clone());
      } catch {
        // egal – nächste Anfrage rechnet neu
      }
    }
    return res;
  } catch (err) {
    console.error('Overlay-Daten nicht lesbar', err);
    return json({ error: 'unavailable' }, 503, false);
  }
};
