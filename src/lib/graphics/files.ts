/**
 * Dateinamen und PNG-Prüfung für Social-Grafiken (rein, im Browser und im Worker nutzbar).
 */
import { formatBySize } from './formats';

/** Höchstgröße einer Grafik für den Discord-Versand (Discord erlaubt ohne Boost 10 MB). */
export const MAX_GRAPHIC_BYTES = 8 * 1024 * 1024;
export const PNG_TYPE = 'image/png';
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Nur Kleinbuchstaben, Ziffern und Bindestriche (Umlaute umschreiben). */
export function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/**
 * Dateiname nach dem Muster motiv-saison-runde-format.png, z. B. `ergebnis-s2-r4-instagram.png`;
 * englische Fassungen bekommen `-en` angehängt, damit DE und EN nebeneinander liegen können.
 */
export function graphicFileName(parts: { motif: string; season: number; key: string; format: string; lang: 'de' | 'en' }): string {
  const segments = [slugPart(parts.motif), `s${Math.max(0, Math.trunc(parts.season))}`, slugPart(parts.key), slugPart(parts.format)];
  if (parts.lang === 'en') segments.push('en');
  return `${segments.filter(Boolean).join('-')}.png`;
}

/** Hochgeladenen Dateinamen für Discord absichern (sonst `grafik.png`). */
export function safePngName(name: string | null | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const stem = slugPart(base.replace(/\.png$/i, ''));
  return stem ? `${stem}.png` : 'grafik.png';
}

export function hasPngSignature(bytes: ArrayLike<number>): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Breite/Höhe aus dem IHDR-Chunk (Bytes 16–23), sonst null. */
export function pngDimensions(bytes: ArrayLike<number>): { width: number; height: number } | null {
  if (bytes.length < 24 || !hasPngSignature(bytes)) return null;
  // Länge 13 + Typ "IHDR"
  const isIhdr = bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
  if (!isIhdr) return null;
  const u32 = (o: number) => ((bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!) >>> 0;
  return { width: u32(16), height: u32(20) };
}

export type PngCheck =
  | { ok: true; width: number; height: number }
  | { ok: false; code: 'BAD_REQUEST' | 'CONTENT_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE'; message: string };

/**
 * Prüft eine hochgeladene Grafik: Größe (nicht leer, höchstens 8 MB), MIME-Typ image/png,
 * PNG-Signatur und ein bekanntes Grafik-Format (Pixelmaße aus dem IHDR-Chunk).
 * `head` sind die ersten Bytes der Datei (mindestens 24).
 */
export function checkPngUpload(file: { size: number; type: string }, head: ArrayLike<number>, maxBytes = MAX_GRAPHIC_BYTES): PngCheck {
  if (!file.size) return { ok: false, code: 'BAD_REQUEST', message: 'Die Datei ist leer.' };
  if (file.size > maxBytes) {
    return { ok: false, code: 'CONTENT_TOO_LARGE', message: `Die Grafik ist größer als ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  }
  if (file.type !== PNG_TYPE) return { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Nur PNG-Grafiken (image/png) können gesendet werden.' };
  if (!hasPngSignature(head)) return { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Die Datei ist kein gültiges PNG.' };
  const dims = pngDimensions(head);
  if (!dims) return { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Die Datei ist kein gültiges PNG.' };
  if (!formatBySize(dims.width, dims.height)) {
    return { ok: false, code: 'BAD_REQUEST', message: `Unbekanntes Grafik-Format (${dims.width} × ${dims.height} px).` };
  }
  return { ok: true, ...dims };
}

/** Größe für Statusmeldungen, z. B. „412 KB“ bzw. „1,6 MB“. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`;
}
