/**
 * sitemap.xml (Plan §4.10, §10): alle öffentlichen, indexierbaren Seiten in DE und EN
 * mit hreflang-Alternativen. Statisch beim Build erzeugt.
 */
import type { APIRoute } from 'astro';
import { legalStatus } from '~/lib/content/legal';
import { buildSitemapXml, collectSitemapPages } from '~/lib/content/sitemap';
import { normalizeTwitchChannel } from '~/lib/content/stream';
import { loadLeague } from '~/lib/server/league';

export const GET: APIRoute = async ({ site, url }) => {
  const league = await loadLeague();
  const pages = collectSitemapPages(league, {
    includeStream: normalizeTwitchChannel(league.settings.twitch_channel) != null,
    legal: await legalStatus('de'),
  });
  return new Response(buildSitemapXml(pages, site ?? new URL(url.origin)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
