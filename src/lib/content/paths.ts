/**
 * getStaticPaths-Helfer für die dynamischen Inhaltsseiten (nur beim Build/Dev-Rendering).
 */
import type { Lang } from '~/i18n';
import { loadLeague } from '~/lib/server/league';
import { newsSlug } from './news';
import { isValidVersionParam } from './rules';

/** Ein Pfad je veröffentlichtem Artikel, DE mit slug_de, EN mit slug_en. */
export async function newsStaticPaths(lang: Lang) {
  const league = await loadLeague();
  const seen = new Set<string>();
  return league.news.flatMap((news) => {
    const slug = newsSlug(news, lang);
    if (!slug || seen.has(slug)) return [];
    seen.add(slug);
    return [{ params: { slug } }];
  });
}

/** Ein Pfad je veröffentlichter oder archivierter Regelwerk-Fassung (z. B. "1.0"). */
export async function rulesVersionStaticPaths() {
  const league = await loadLeague();
  return league.rulesVersions
    .filter((v) => isValidVersionParam(v.version))
    .map((v) => ({ params: { version: v.version } }));
}
