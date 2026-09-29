/**
 * robots.txt (Plan §4.10): alles erlauben außer Admin und APIs, dazu die Sitemap.
 * Im Demo-Modus bzw. mit SITE_NOINDEX wird komplett gesperrt.
 */
import type { APIRoute } from 'astro';
import { buildRobotsTxt } from '~/lib/content/robots';
import { env, isDemoMode } from '~/lib/server/env';

export const GET: APIRoute = ({ site, url }) => {
  const base = site ?? new URL(url.origin);
  const body = buildRobotsTxt({
    disallowAll: isDemoMode() || env.noindex,
    sitemapUrl: new URL('/sitemap.xml', base).href,
  });
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
