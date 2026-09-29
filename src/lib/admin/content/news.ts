/**
 * News-Redaktion (Plan §4.7, §5): Slugs, Status-Logik (Entwurf / geplant / veröffentlicht)
 * und Veröffentlichungs-Prüfung. Reine Funktionen, getestet in tests/unit/admin-content-news.test.ts.
 */
import type { NewsRow, NewsStatus } from '~/lib/db/types';
import { slugify, uniqueSlug } from '~/lib/domain/text';
import { missingEn, NEWS_EN_FIELDS } from './translations';

const SLUG_FALLBACK = 'news';
export const SLUG_MAX = 80;

/** Slug aus Titel oder Eingabe; ohne verwertbare Zeichen „news“. */
export function newsSlug(input: string | null | undefined): string {
  const text = (input ?? '').trim();
  if (!/[\p{L}\p{N}]/u.test(text)) return SLUG_FALLBACK;
  const slug = slugify(text);
  // slugify() fällt bei leerem Ergebnis auf „fahrer“ zurück – für News unpassend
  if (slug === 'fahrer' && !/fahrer/i.test(text)) return SLUG_FALLBACK;
  return slug.slice(0, SLUG_MAX).replace(/-+$/g, '');
}

/**
 * Eindeutige Slugs für DE und EN. Eingetragene Slugs haben Vorrang vor dem Titel;
 * EN fällt auf den deutschen Titel zurück. Vergebene Slugs (ohne den eigenen Artikel)
 * werden mit -2, -3 … umgangen.
 */
export function resolveNewsSlugs(
  input: { slugDe?: string | null; slugEn?: string | null; titleDe: string; titleEn?: string | null },
  existing: ReadonlyArray<Pick<NewsRow, 'id' | 'slug_de' | 'slug_en'>>,
  selfId?: number | null,
): { slug_de: string; slug_en: string } {
  const others = existing.filter((n) => n.id !== selfId);
  const baseDe = newsSlug(input.slugDe?.trim() || input.titleDe);
  const baseEn = newsSlug(input.slugEn?.trim() || input.titleEn?.trim() || input.titleDe);
  return {
    slug_de: uniqueSlug(baseDe, others.map((n) => n.slug_de)),
    slug_en: uniqueSlug(baseEn, others.map((n) => n.slug_en)),
  };
}

export type StatusDecision =
  | { ok: true; status: NewsStatus; publish_at: string | null; note?: string }
  | { ok: false; field: 'publish_at'; message: string };

/**
 * Gewünschten Status und Zeitpunkt in einen gültigen Zustand übersetzen:
 * - Entwurf: Zeitpunkt bleibt als Plan-Datum erhalten (optional).
 * - Geplant: braucht einen Zeitpunkt in der Zukunft; der Cron veröffentlicht dann.
 * - Veröffentlicht: ohne Zeitpunkt „jetzt“ (bzw. das bisherige Datum); ein Zeitpunkt in
 *   der Zukunft macht daraus „geplant“.
 */
export function decideNewsStatus(
  requested: NewsStatus,
  publishAt: Date | null,
  now: Date,
  previous?: Pick<NewsRow, 'status' | 'publish_at'> | null,
): StatusDecision {
  const iso = publishAt ? publishAt.toISOString() : null;
  if (requested === 'draft') return { ok: true, status: 'draft', publish_at: iso };
  if (requested === 'scheduled') {
    if (!publishAt) return { ok: false, field: 'publish_at', message: 'Für „geplant“ brauchst du Datum und Uhrzeit.' };
    if (publishAt.getTime() <= now.getTime()) {
      return {
        ok: false,
        field: 'publish_at',
        message: 'Der Zeitpunkt liegt in der Vergangenheit – wähle „veröffentlicht“ oder einen späteren Zeitpunkt.',
      };
    }
    return { ok: true, status: 'scheduled', publish_at: iso };
  }
  // published
  if (publishAt && publishAt.getTime() > now.getTime()) {
    return { ok: true, status: 'scheduled', publish_at: iso, note: 'Der Zeitpunkt liegt in der Zukunft – der Artikel ist jetzt geplant.' };
  }
  if (publishAt) return { ok: true, status: 'published', publish_at: iso };
  const keep = previous?.status === 'published' && previous.publish_at ? previous.publish_at : null;
  return { ok: true, status: 'published', publish_at: keep ?? now.toISOString() };
}

export type NewsListState = 'draft' | 'scheduled' | 'due' | 'published';

/** Anzeige-Zustand in der Liste; „due“ = geplant, Zeitpunkt erreicht, Cron steht noch aus. */
export function newsListState(row: Pick<NewsRow, 'status' | 'publish_at'>, now: Date): NewsListState {
  if (row.status === 'published') return 'published';
  if (row.status === 'scheduled') {
    return row.publish_at && new Date(row.publish_at).getTime() <= now.getTime() ? 'due' : 'scheduled';
  }
  return 'draft';
}

export const NEWS_STATE_LABELS: Record<NewsListState, string> = {
  draft: 'Entwurf',
  scheduled: 'Geplant',
  due: 'Geplant (fällig)',
  published: 'Veröffentlicht',
};

export const NEWS_STATUS_LABELS: Record<NewsStatus, string> = {
  draft: 'Entwurf',
  scheduled: 'Geplant',
  published: 'Veröffentlicht',
};

/** Ist der Artikel öffentlich sichtbar (bzw. wird er es beim nächsten Build)? */
export function isPublicNews(row: Pick<NewsRow, 'status'> | null | undefined): boolean {
  return row?.status === 'published';
}

/** Pflichtangaben für „geplant“/„veröffentlicht“ (DE ist verbindlich, EN optional). */
export function publishProblems(
  row: Pick<NewsRow, 'title_de' | 'excerpt_de' | 'body_de' | 'cover_image' | 'cover_alt_de'>,
): Array<{ field: string; message: string }> {
  const problems: Array<{ field: string; message: string }> = [];
  const empty = (v: string | null | undefined) => !v || v.trim() === '';
  if (empty(row.title_de)) problems.push({ field: 'title_de', message: 'Titel (DE) fehlt.' });
  if (empty(row.excerpt_de)) problems.push({ field: 'excerpt_de', message: 'Teaser (DE) fehlt – er erscheint auf der News-Karte.' });
  if (empty(row.body_de)) problems.push({ field: 'body_de', message: 'Text (DE) fehlt.' });
  if (!empty(row.cover_image) && empty(row.cover_alt_de)) {
    problems.push({ field: 'cover_alt_de', message: 'Alt-Text (DE) für das Titelbild fehlt (Barrierefreiheit).' });
  }
  return problems;
}

/** Fehlende EN-Felder eines Artikels (Alt-Text nur, wenn es ein Titelbild gibt). */
export function missingNewsTranslations(row: Pick<NewsRow, 'title_de' | 'title_en' | 'excerpt_de' | 'excerpt_en' | 'body_de' | 'body_en' | 'cover_image' | 'cover_alt_de' | 'cover_alt_en'>): string[] {
  const fields = row.cover_image ? NEWS_EN_FIELDS : NEWS_EN_FIELDS.filter(([f]) => f !== 'cover_alt');
  return missingEn(row, fields);
}
