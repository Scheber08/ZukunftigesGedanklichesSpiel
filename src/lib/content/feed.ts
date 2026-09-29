/**
 * News-Feed für einen RSS-Endpunkt aufbauen (lädt die Liga-Daten, nur beim Build).
 */
import { SITE } from '~/config/site';
import { t, url, type Lang } from '~/i18n';
import { loadLeague } from '~/lib/server/league';
import { localized } from '~/lib/league/league';
import { newsDate, newsHref, newsNeedsTranslation, newsTeaser } from './news';
import { buildRss } from './rss';

/** Anzahl der Einträge im Feed. */
export const FEED_LIMIT = 30;

export async function newsFeedResponse(lang: Lang, site: URL | undefined, requestUrl: URL): Promise<Response> {
  const base = site ?? new URL(requestUrl.origin);
  const abs = (path: string) => new URL(path, base).href;
  const league = await loadLeague();
  const items = league.news.slice(0, FEED_LIMIT).map((news) => {
    const link = abs(newsHref(lang, news));
    return {
      title: localized(news, 'title', lang).text,
      link,
      description: newsTeaser(news, lang, 300).text,
      pubDate: newsDate(news),
      categories: [t(lang, `news.category.${news.category}`)],
      creator: news.author_name,
      language: newsNeedsTranslation(news, lang) ? 'de-DE' : null,
    };
  });
  const xml = buildRss({
    title: t(lang, 'content.news.feedTitle', { league: SITE.name }),
    link: abs(url(lang, 'news')),
    description: t(lang, 'content.news.feedDescription', { league: SITE.name }),
    language: lang === 'de' ? 'de-DE' : 'en-GB',
    selfUrl: abs(url(lang, 'newsRss')),
    imageUrl: abs('/icon-192.png'),
    items,
  });
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
