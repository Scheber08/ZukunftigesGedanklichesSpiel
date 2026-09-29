/**
 * Signierte Upload-URLs für Bilder (Plan §7.5).
 *
 * POST /api/admin/upload-url
 *   { kind: "news" | "partners" | "staff", contentType: "image/webp", sizes: { 1600: bytes, 800: bytes } }
 * → { demo: false, url, url800, uploads: [{ size, path, signedUrl }], headers }
 *
 * Der Browser hat das Bild schon verkleinert und als WebP kodiert (ohne EXIF). Der Server
 * prüft Rolle, Typ und Größe und stellt für einen zufälligen Pfad `<kind>/<jahr>/<uuid>-<größe>.webp`
 * je Größe eine signierte Upload-URL für den öffentlichen Bucket „media“ aus.
 * Im Demo-Modus gibt es kein Supabase: Antwort { demo: true }, der Browser speichert eine Data-URL.
 */
import type { APIRoute } from 'astro';
import { MEDIA_BUCKET, MEDIA_SIZES, mediaPath, publicMediaUrl, validateUploadRequest, type MediaKind } from '~/lib/admin/content/media';
import { json, requireUploader, storageClient } from '~/lib/admin/content/upload-server';
import { env, isDemoMode } from '~/lib/server/env';

export const prerender = false;

const MAX_REQUEST_BYTES = 2048;

export const POST: APIRoute = async (context) => {
  const auth = await requireUploader(context);
  if ('response' in auth) return auth.response;

  const type = context.request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) return json({ error: 'JSON erwartet.' }, 415);
  const length = Number(context.request.headers.get('content-length') ?? 0);
  if (length > MAX_REQUEST_BYTES) return json({ error: 'Anfrage zu groß.' }, 413);

  let body: { kind?: unknown; contentType?: unknown; sizes?: unknown };
  try {
    const text = await context.request.text();
    if (text.length > MAX_REQUEST_BYTES) return json({ error: 'Anfrage zu groß.' }, 413);
    body = JSON.parse(text) as typeof body;
  } catch {
    return json({ error: 'Ungültige Anfrage.' }, 400);
  }

  const problem = validateUploadRequest(body);
  if (problem) return json({ error: problem }, 400);

  if (isDemoMode()) return json({ demo: true });

  try {
    const kind = body.kind as MediaKind;
    const id = crypto.randomUUID();
    const now = new Date();
    const bucket = storageClient().storage.from(MEDIA_BUCKET);
    const uploads: Array<{ size: number; path: string; signedUrl: string }> = [];
    for (const size of MEDIA_SIZES) {
      const path = mediaPath(kind, id, size, now);
      const { data, error } = await bucket.createSignedUploadUrl(path);
      if (error || !data) throw new Error(error?.message ?? 'Keine signierte URL erhalten');
      uploads.push({ size, path, signedUrl: data.signedUrl });
    }
    const base = env.supabaseUrl!;
    return json({
      demo: false,
      url: publicMediaUrl(base, uploads[0]!.path),
      url800: publicMediaUrl(base, uploads[1]!.path),
      uploads,
      // Der öffentliche anon-Key ist für das Supabase-Gateway nötig und kein Geheimnis
      headers: env.supabaseAnonKey ? { apikey: env.supabaseAnonKey } : {},
    });
  } catch (err) {
    console.error('Signierte Upload-URL fehlgeschlagen', err);
    return json({ error: 'Der Upload-Speicher ist gerade nicht erreichbar.' }, 502);
  }
};

export const ALL: APIRoute = () => json({ error: 'Nur POST.' }, 405);
