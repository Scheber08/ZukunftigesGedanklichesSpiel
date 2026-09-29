/**
 * Helfer für News-Übersicht, Artikel, RSS und Sitemap (Plan §4.7). Ohne I/O.
 */
import { SITE } from '~/config/site';
import { alternates, url, type Alternates, type Lang } from '~/i18n';
import type { NewsRow } from '~/lib/db/types';
import { localized } from '~/lib/league/league';
import { markdownToText } from '~/lib/util/markdown';

/** Slug eines Artikels in einer Sprache (DE nutzt slug_de, EN slug_en). */
export function newsSlug(news: Pick<NewsRow, 'slug_de' | 'slug_en'>, lang: Lang): string {
  return lang === 'de' ? news.slug_de : news.slug_en || news.slug_de;
}

export function newsHref(lang: Lang, news: Pick<NewsRow, 'slug_de' | 'slug_en'>): string {
  return url(lang, 'newsArticle', { slug: newsSlug(news, lang) });
}

/** Sprachvarianten mit dem jeweils eigenen Slug. */
export function newsAlternates(news: Pick<NewsRow, 'slug_de' | 'slug_en'>): Alternates {
  return alternates('newsArticle', { de: { slug: newsSlug(news, 'de') }, en: { slug: newsSlug(news, 'en') } });
}

/** Veröffentlichungszeitpunkt (publish_at, sonst Anlage). */
export function newsDate(news: Pick<NewsRow, 'publish_at' | 'created_at'>): string {
  return news.publish_at ?? news.created_at;
}

/** Wurde der Artikel nach der Veröffentlichung nennenswert (> 1 h) geändert? */
export function newsWasUpdated(news: Pick<NewsRow, 'publish_at' | 'created_at' | 'updated_at'>): boolean {
  const published = new Date(newsDate(news)).getTime();
  const updated = new Date(news.updated_at).getTime();
  return Number.isFinite(updated) && updated - published > 3_600_000;
}

/** Teaser als reiner Text: Auszug, sonst der Anfang des Textes. */
export function newsTeaser(news: NewsRow, lang: Lang, maxLength = 280): { text: string; fallback: boolean } {
  const excerpt = localized(news, 'excerpt', lang);
  if (excerpt.text.trim() !== '') return { text: markdownToText(excerpt.text, maxLength), fallback: excerpt.fallback };
  const body = localized(news, 'body', lang);
  return { text: markdownToText(body.text, maxLength), fallback: body.fallback };
}

/** Fehlt irgendein Teil der EN-Fassung (Titel oder Text)? */
export function newsNeedsTranslation(news: NewsRow, lang: Lang): boolean {
  if (lang === 'de') return false;
  return localized(news, 'title', lang).fallback || localized(news, 'body', lang).fallback;
}

/** Alt-Text des Titelbilds in der Sprache (fällt auf DE zurück). */
export function newsCoverAlt(news: NewsRow, lang: Lang): string {
  return (lang === 'en' ? news.cover_alt_en : null) ?? news.cover_alt_de ?? '';
}

export interface NewsJsonLdInput {
  news: NewsRow;
  lang: Lang;
  site: URL;
  title: string;
  description: string;
  categoryLabel: string;
  imagePath: string;
  about?: Record<string, unknown> | null;
}

/** JSON-LD `NewsArticle` (Plan §10). */
export function newsArticleJsonLd(input: NewsJsonLdInput): Record<string, unknown> {
  const { news, lang, site, title, description, categoryLabel, imagePath, about } = input;
  const abs = (path: string) => new URL(path, site).href;
  const contentLang = newsNeedsTranslation(news, lang) ? 'de' : lang;
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title.length > 110 ? `${title.slice(0, 109).trimEnd()}…` : title,
    description,
    datePublished: newsDate(news),
    dateModified: news.updated_at > newsDate(news) ? news.updated_at : newsDate(news),
    inLanguage: contentLang === 'de' ? 'de-DE' : 'en-GB',
    articleSection: categoryLabel,
    image: [abs(imagePath)],
    mainEntityOfPage: { '@type': 'WebPage', '@id': abs(newsHref(lang, news)) },
    url: abs(newsHref(lang, news)),
    author: news.author_name
      ? { '@type': 'Person', name: news.author_name }
      : { '@type': 'Organization', name: SITE.name, url: abs(url(lang, 'home')) },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      url: abs(url(lang, 'home')),
      logo: { '@type': 'ImageObject', url: abs('/icon-512-maskable.png') },
    },
    isAccessibleForFree: true,
    ...(about ? { about } : {}),
  };
}
