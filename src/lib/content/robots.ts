/**
 * robots.txt (Plan §4.10): normal alles erlauben außer Admin und APIs, dazu die Sitemap.
 * Im Demo-Modus bzw. mit SITE_NOINDEX (Vorschau, Staging) wird komplett gesperrt.
 */

export interface RobotsOptions {
  /** true = Demo-Modus oder SITE_NOINDEX: nichts indexieren */
  disallowAll: boolean;
  /** Absolute URL der Sitemap */
  sitemapUrl: string;
}

export const ROBOTS_DISALLOWED_PATHS = ['/admin', '/api', '/_actions', '/_server-islands'] as const;

export function buildRobotsTxt(opts: RobotsOptions): string {
  if (opts.disallowAll) {
    return ['# Vorschau/Demo – bitte nicht indexieren', 'User-agent: *', 'Disallow: /', ''].join('\n');
  }
  return [
    'User-agent: *',
    'Allow: /',
    ...ROBOTS_DISALLOWED_PATHS.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${opts.sitemapUrl}`,
    '',
  ].join('\n');
}
