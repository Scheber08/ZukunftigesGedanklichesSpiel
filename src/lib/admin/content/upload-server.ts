/**
 * Serverseitige Helfer der Upload-Endpunkte (/api/admin/upload-url, /api/admin/upload).
 * NUR serverseitig importieren (Service-Key).
 *
 * Die Middleware setzt `locals.staff` nur für /admin* und Admin-Actions – die Endpunkte
 * unter /api/admin prüfen die Sitzung deshalb selbst über getStaff().
 */
import type { APIContext } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseStore } from '~/lib/db/supabase-store';
import { getStaff, hasRole, type Staff } from '~/lib/server/auth';
import { getServiceStore } from '~/lib/server/db';
import { env } from '~/lib/server/env';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}

/** Schutz gegen Cross-Site-Requests (Cookie-Sitzung): Origin muss zur eigenen Seite passen. */
export function isSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  // Ohne Origin-Header (ältere Browser): Fetch-Metadaten prüfen
  const site = request.headers.get('sec-fetch-site');
  return site === 'same-origin' || site === 'none';
}

/** Staff mit Redaktions- oder Admin-Rolle – sonst eine fertige Fehlerantwort. */
export async function requireUploader(context: APIContext): Promise<{ staff: Staff } | { response: Response }> {
  if (!isSameOrigin(context.request, context.url)) {
    return { response: json({ error: 'Anfrage von fremder Herkunft abgelehnt.' }, 403) };
  }
  const staff = await getStaff(context);
  if (!staff) return { response: json({ error: 'Nicht angemeldet.' }, 401) };
  if (!hasRole(staff, 'redakteur')) return { response: json({ error: 'Keine Berechtigung für Uploads.' }, 403) };
  return { staff };
}

/** Supabase-Client mit Service-Key (Storage). */
export function storageClient(): SupabaseClient {
  const store = getServiceStore();
  if (store instanceof SupabaseStore) return store.client;
  if (!env.supabaseUrl || !env.supabaseServiceKey) throw new Error('Supabase Storage ist nicht konfiguriert.');
  return new SupabaseStore(env.supabaseUrl, env.supabaseServiceKey).client;
}
