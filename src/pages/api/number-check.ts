/**
 * Live-Prüfung der Wunsch-Startnummer im Anmeldeformular (Plan §4.9):
 * GET /api/number-check?n=42 → { number: 42, available: true }
 * Gültig sind 2–99 (die 1 bleibt ggf. dem Champion vorbehalten).
 */
import type { APIRoute } from 'astro';
import { isNumberAvailable, MAX_NUMBER, MIN_PUBLIC_NUMBER } from '~/lib/domain/numbers';
import { getServiceStore } from '~/lib/server/db';

export const prerender = false;

function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const raw = url.searchParams.get('n')?.trim() ?? '';
  const n = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < MIN_PUBLIC_NUMBER || n > MAX_NUMBER) {
    return json({ number: null, available: false, error: 'invalid' }, 400, 'public, max-age=3600');
  }
  try {
    const rows = await getServiceStore().select('driver_numbers', { eq: { number: n } });
    return json({ number: n, available: isNumberAvailable(n, rows, new Date()) }, 200, 'public, max-age=30, s-maxage=30');
  } catch (err) {
    console.error('Nummernprüfung fehlgeschlagen', err);
    return json({ number: n, available: null, error: 'unavailable' }, 503, 'no-store');
  }
};
