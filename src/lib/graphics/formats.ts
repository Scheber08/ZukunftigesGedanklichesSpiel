/**
 * Formate der Social-Grafiken (Plan Phase 2). Reine Daten, auch im Browser nutzbar.
 */

export const FORMAT_IDS = ['instagram', 'story', 'youtube', 'og'] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

export interface FormatSpec {
  id: FormatId;
  /** Beschriftung im Admin */
  label: string;
  /** Kurzform für Dateinamen */
  slug: string;
  width: number;
  height: number;
  /** Verwendung als Hinweis im Admin */
  hint: string;
}

export const FORMATS: Record<FormatId, FormatSpec> = {
  instagram: { id: 'instagram', label: 'Instagram', slug: 'instagram', width: 1080, height: 1350, hint: 'Feed-Beitrag 4:5' },
  story: { id: 'story', label: 'Story / TikTok', slug: 'story', width: 1080, height: 1920, hint: 'Hochformat 9:16' },
  youtube: { id: 'youtube', label: 'YouTube-Thumbnail', slug: 'youtube', width: 1280, height: 720, hint: 'Querformat 16:9' },
  og: { id: 'og', label: 'OG / Link-Vorschau', slug: 'og', width: 1200, height: 630, hint: 'Link-Vorschau 1,91:1' },
};

export function isFormatId(value: unknown): value is FormatId {
  return typeof value === 'string' && (FORMAT_IDS as readonly string[]).includes(value);
}

/** Formatangabe „1080 × 1350“ (mit schmalem Leerzeichen-freiem Malzeichen). */
export function formatSize(format: Pick<FormatSpec, 'width' | 'height'>): string {
  return `${format.width} × ${format.height}`;
}

/** Bekanntes Format zu Pixelmaßen (z. B. zur Prüfung hochgeladener PNGs). */
export function formatBySize(width: number, height: number): FormatSpec | undefined {
  return Object.values(FORMATS).find((f) => f.width === width && f.height === height);
}
