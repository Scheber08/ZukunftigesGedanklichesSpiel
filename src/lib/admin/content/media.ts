/**
 * Uploads (Plan §7.5): Bilder werden im Browser des Admins auf 1600 px und 800 px
 * verkleinert, als WebP neu kodiert (dabei fallen EXIF-Daten weg) und im öffentlichen
 * Supabase-Storage-Bucket `media` abgelegt. Hier stehen die reinen Regeln dafür –
 * Pfade, Größen, Prüfungen –, die Browser-Code und Server-Endpunkte gemeinsam nutzen.
 */

export const MEDIA_BUCKET = 'media';
export const MEDIA_KINDS = ['news', 'partners', 'staff'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Zielbreiten bzw. -höhen (längste Kante) – größte zuerst. */
export const MEDIA_SIZES = [1600, 800] as const;
export type MediaSize = (typeof MEDIA_SIZES)[number];

export const UPLOAD_CONTENT_TYPE = 'image/webp';
/** Wie im Bucket (supabase/migrations: file_size_limit 2 MB). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const WEBP_QUALITY = 0.82;
/** Demo-Modus: Bild als Data-URL in der Zeile – klein halten (Action-Limit 1 MB). */
export const DEMO_MAX_DATA_URL_CHARS = 400_000;
/** Obergrenze für gespeicherte Bild-URLs (Storage-URLs sind kurz). */
export const MAX_IMAGE_URL_CHARS = 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PATH_RE = /^(news|partners|staff)\/\d{4}\/[0-9a-f-]{36}-(1600|800)\.webp$/;
const SIZE_SUFFIX_RE = /-(1600|800)\.webp(\?.*)?$/;

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === 'string' && (MEDIA_KINDS as readonly string[]).includes(value);
}

/** Speicherpfad im Bucket, z. B. `news/2026/<uuid>-1600.webp`. */
export function mediaPath(kind: MediaKind, id: string, size: MediaSize, at: Date = new Date()): string {
  if (!UUID_RE.test(id)) throw new Error('Ungültige Upload-ID');
  return `${kind}/${at.getUTCFullYear()}/${id}-${size}.webp`;
}

export function isValidMediaPath(path: string): boolean {
  return PATH_RE.test(path);
}

/** Öffentliche URL einer Datei im Bucket `media`. */
export function publicMediaUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

/**
 * URL einer anderen Größe desselben Bildes. In der Datenbank steht die 1600er-URL;
 * die 800er liegt daneben (`…-800.webp`). Data-URLs (Demo) und fremde URLs bleiben unverändert.
 */
export function mediaVariantUrl(url: string | null | undefined, size: MediaSize): string | null {
  if (!url) return null;
  if (!SIZE_SUFFIX_RE.test(url)) return url;
  return url.replace(SIZE_SUFFIX_RE, (_m, _s, query: string | undefined) => `-${size}.webp${query ?? ''}`);
}

/** Maße für die Verkleinerung auf die längste Kante `max` – nie vergrößern. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new Error('Ungültige Bildmaße');
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Prüfung einer Upload-Anfrage (Typ und Größe je Variante). Liefert eine Fehlermeldung oder null. */
export function validateUploadRequest(input: { kind?: unknown; contentType?: unknown; sizes?: unknown }): string | null {
  if (!isMediaKind(input.kind)) return 'Unbekannter Upload-Bereich.';
  if (input.contentType !== UPLOAD_CONTENT_TYPE) return 'Nur WebP-Bilder sind erlaubt.';
  const sizes = input.sizes as Record<string, unknown> | null | undefined;
  if (!sizes || typeof sizes !== 'object') return 'Dateigrößen fehlen.';
  for (const size of MEDIA_SIZES) {
    const bytes = sizes[String(size)];
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return `Dateigröße für ${size} px fehlt.`;
    if (bytes > MAX_UPLOAD_BYTES) return `Das Bild (${size} px) ist größer als 2 MB.`;
  }
  return null;
}

/** WebP-Signatur prüfen: "RIFF" …. "WEBP". */
export function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
}

export function isDataImageUrl(value: string): boolean {
  return /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value);
}

/**
 * Bildwert aus einem Formular prüfen: leer, eine https-URL oder – nur im Demo-Modus –
 * eine kleine Data-URL. Liefert den bereinigten Wert oder wirft mit einer Meldung.
 *
 * Mit `storageUrl` (Supabase-URL, Produktion) sind nur Bilder aus dem eigenen Bucket
 * „media“ erlaubt: Fremd eingebundene Bilder würden Besucherdaten an Dritte senden.
 * Ein unveränderter Altwert (`previous`) bleibt gültig, damit Speichern nie daran scheitert.
 */
export function normalizeImageValue(
  value: string | null | undefined,
  opts: { demo: boolean; storageUrl?: string | null; previous?: string | null },
): string | null {
  const v = (value ?? '').trim();
  if (v === '') return null;
  if (opts.previous && v === opts.previous) return v;
  if (v.startsWith('data:')) {
    if (!opts.demo) throw new Error('Bilder bitte über den Upload hochladen.');
    if (v.length > DEMO_MAX_DATA_URL_CHARS || !isDataImageUrl(v)) throw new Error('Das Demo-Bild ist zu groß oder ungültig.');
    return v;
  }
  if (v.length > MAX_IMAGE_URL_CHARS) throw new Error('Die Bild-URL ist zu lang.');
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw new Error('Die Bild-URL ist ungültig.');
  }
  if (!opts.demo && opts.storageUrl) {
    // Eigener Bucket (lokal mit der Supabase-CLI auch http://127.0.0.1:54321)
    if (!isOwnMediaUrl(url.href, opts.storageUrl)) throw new Error('Bitte das Bild über den Upload hochladen – externe Bilder sind nicht erlaubt.');
    return url.href;
  }
  if (url.protocol !== 'https:') throw new Error('Die Bild-URL muss mit https:// beginnen.');
  return url.href;
}

/** Liegt die URL im eigenen Bucket „media“ (mit gültigem Upload-Pfad)? */
export function isOwnMediaUrl(url: string, storageUrl: string): boolean {
  const prefix = publicMediaUrl(storageUrl, '');
  if (!url.startsWith(prefix)) return false;
  return isValidMediaPath(url.slice(prefix.length).replace(/[?#].*$/, ''));
}

/** Für Audit-Log und Discord: Data-URLs nicht in voller Länge speichern. */
export function redactDataUrl(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return value.startsWith('data:') ? `[Data-URL, ${value.length} Zeichen]` : value;
}
