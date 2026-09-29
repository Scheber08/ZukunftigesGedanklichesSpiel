/**
 * Upload über den eigenen Server – Ausweichweg, falls der direkte Upload zur signierten
 * Supabase-URL im Browser scheitert (z. B. weil die Content-Security-Policy die Verbindung
 * zu Supabase nicht erlaubt). Nimmt die im Browser erzeugten WebP-Dateien entgegen
 * (je max. 2 MB, Signatur geprüft) und legt sie mit dem Service-Key im Bucket „media“ ab.
 *
 * POST /api/admin/upload  (multipart: kind, file_1600, file_800) → { url, url800 }
 */
import type { APIRoute } from 'astro';
import {
  isMediaKind,
  isWebp,
  MAX_UPLOAD_BYTES,
  MEDIA_BUCKET,
  MEDIA_SIZES,
  mediaPath,
  publicMediaUrl,
  UPLOAD_CONTENT_TYPE,
} from '~/lib/admin/content/media';
import { json, requireUploader, storageClient } from '~/lib/admin/content/upload-server';
import { env, isDemoMode } from '~/lib/server/env';

export const prerender = false;

/** Zwei Dateien à 2 MB plus Formular-Overhead */
const MAX_REQUEST_BYTES = 2 * MAX_UPLOAD_BYTES + 64 * 1024;

export const POST: APIRoute = async (context) => {
  const auth = await requireUploader(context);
  if ('response' in auth) return auth.response;
  if (isDemoMode()) return json({ demo: true, error: 'Im Demo-Modus gibt es keinen Speicher – das Bild wird als Data-URL übernommen.' }, 409);

  const length = Number(context.request.headers.get('content-length') ?? 0);
  if (!length || length > MAX_REQUEST_BYTES) return json({ error: 'Die Dateien sind zu groß (max. 2 MB je Größe).' }, 413);

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ error: 'Ungültige Anfrage.' }, 400);
  }
  const kind = form.get('kind');
  if (!isMediaKind(kind)) return json({ error: 'Unbekannter Upload-Bereich.' }, 400);

  const files: Array<{ size: number; bytes: Uint8Array }> = [];
  for (const size of MEDIA_SIZES) {
    const file = form.get(`file_${size}`);
    if (!(file instanceof File)) return json({ error: `Datei für ${size} px fehlt.` }, 400);
    if (file.type !== UPLOAD_CONTENT_TYPE) return json({ error: 'Nur WebP-Bilder sind erlaubt.' }, 415);
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return json({ error: `Das Bild (${size} px) ist größer als 2 MB.` }, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isWebp(bytes)) return json({ error: 'Die Datei ist kein gültiges WebP-Bild.' }, 415);
    files.push({ size, bytes });
  }

  try {
    const id = crypto.randomUUID();
    const now = new Date();
    const bucket = storageClient().storage.from(MEDIA_BUCKET);
    const paths: string[] = [];
    for (const f of files) {
      const path = mediaPath(kind, id, f.size as (typeof MEDIA_SIZES)[number], now);
      const { error } = await bucket.upload(path, f.bytes, { contentType: UPLOAD_CONTENT_TYPE, cacheControl: '31536000', upsert: false });
      if (error) throw new Error(error.message);
      paths.push(path);
    }
    return json({ url: publicMediaUrl(env.supabaseUrl!, paths[0]!), url800: publicMediaUrl(env.supabaseUrl!, paths[1]!) });
  } catch (err) {
    console.error('Upload fehlgeschlagen', err);
    return json({ error: 'Der Upload-Speicher ist gerade nicht erreichbar.' }, 502);
  }
};

export const ALL: APIRoute = () => json({ error: 'Nur POST.' }, 405);
