/**
 * Link-Check (Plan §2.2 „keine toten Links“, §7.6 CI): crawlt die gebaute Website über den echten
 * Server (statische Assets + Worker, wie auf Cloudflare) ab Startseite, englischer Startseite und
 * sitemap.xml. Geprüft werden alle internen Links, Bilder, Skripte und Stylesheets sowie Sprungziele
 * (#anker) auf anderen Seiten. Externe Adressen werden nicht abgerufen (keine Abhängigkeit von
 * Drittseiten in der CI).
 *
 * Nicht gecrawlt: Admin-Bereich, Actions und APIs (dynamisch, teils mit Anmeldung).
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

const SKIP = [/^\/admin(\/|$)/, /^\/_actions\//, /^\/api\//, /^\/cdn-cgi\//];
const MAX_URLS = 3000;
const CONCURRENCY = 8;

interface Found {
  url: string;
  from: string;
}

const decodeEntities = (s: string) =>
  s.replaceAll('&amp;', '&').replaceAll('&#38;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");

/**
 * Basis-URL, mit der gebaut wurde (Canonical, hreflang, Sitemap). Solche absoluten Links zeigen auf
 * dieselbe Website und werden gegen den Test-Server geprüft.
 */
const SITE_ORIGIN = new URL(process.env.PUBLIC_SITE_URL || 'https://liga.example').origin;

/** Interne Pfade aus href/src/srcset eines HTML-Dokuments (ohne DOM, reicht für gebautes HTML). */
function extractLinks(html: string, pageUrl: URL): string[] {
  const out: string[] = [];
  const attr = /\s(?:href|src|poster)\s*=\s*"([^"]*)"/gi;
  const srcset = /\ssrcset\s*=\s*"([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = attr.exec(html))) out.push(decodeEntities(m[1]!));
  while ((m = srcset.exec(html))) for (const part of m[1]!.split(',')) out.push(decodeEntities(part.trim().split(/\s+/)[0] ?? ''));
  return out
    .filter((raw) => raw !== '' && !/^(?:mailto|tel|webcal|javascript|data|blob):/i.test(raw))
    .map((raw) => {
      try {
        return new URL(raw, pageUrl);
      } catch {
        return null;
      }
    })
    .filter((u): u is URL => u != null && (u.origin === pageUrl.origin || u.origin === SITE_ORIGIN))
    .map((u) => u.pathname + u.search + u.hash);
}

/** ids und names eines Dokuments (für #anker-Prüfung). */
function anchorsOf(html: string): Set<string> {
  const ids = new Set<string>();
  for (const m of html.matchAll(/\s(?:id|name)\s*=\s*"([^"]+)"/gi)) ids.add(decodeEntities(m[1]!));
  return ids;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

async function sitemapPaths(request: APIRequestContext): Promise<string[]> {
  const res = await request.get('/sitemap.xml');
  expect(res.status(), '/sitemap.xml').toBe(200);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(decodeEntities(m[1]!.trim())).pathname);
}

test('keine toten internen Links, Ressourcen oder Sprungziele', async ({ request, baseURL }) => {
  test.setTimeout(300_000);
  const origin = new URL(baseURL!).origin;

  const sitemap = await sitemapPaths(request);
  expect(sitemap.length, 'Sitemap enthält Seiten').toBeGreaterThan(20);
  for (const path of ['/', '/en']) expect(sitemap, `Sitemap enthält ${path}`).toContain(path);

  const status = new Map<string, number>(); // Pfad ohne #anker → HTTP-Status
  const anchors = new Map<string, Set<string>>(); // HTML-Seite → ids
  const fragments: Found[] = [];
  const broken: string[] = [];
  const queued = new Set<string>();
  let queue: Found[] = [...new Set(['/', '/en', ...sitemap])].map((url) => ({ url, from: 'Start/Sitemap' }));

  while (queue.length > 0) {
    const batch = queue.filter((f) => {
      if (queued.has(f.url)) return false;
      queued.add(f.url);
      return true;
    });
    queue = [];
    expect(queued.size, 'zu viele Adressen – Crawler in einer Schleife?').toBeLessThan(MAX_URLS);

    await pool(batch, CONCURRENCY, async ({ url, from }) => {
      const res = await request.get(url, { failOnStatusCode: false, maxRedirects: 5 });
      status.set(url, res.status());
      if (res.status() >= 400) {
        broken.push(`${res.status()} ${url} (verlinkt von ${from})`);
        return;
      }
      const type = res.headers()['content-type'] ?? '';
      if (!type.includes('text/html')) return;
      const html = await res.text();
      anchors.set(url, anchorsOf(html));
      const pageUrl = new URL(url, origin);
      for (const link of extractLinks(html, pageUrl)) {
        const [pathAndQuery, hash] = link.split('#', 2) as [string, string | undefined];
        if (SKIP.some((re) => re.test(pathAndQuery))) continue;
        if (hash) fragments.push({ url: `${pathAndQuery || url}#${hash}`, from: url });
        if (pathAndQuery && !queued.has(pathAndQuery)) queue.push({ url: pathAndQuery, from: url });
      }
    });
  }

  // Sprungziele: #anker muss auf der Zielseite existieren (z. B. Regelwerk-Paragrafen #p3-4)
  const missingAnchors = new Set<string>();
  for (const { url, from } of fragments) {
    const [path, hash] = url.split('#', 2) as [string, string];
    const ids = anchors.get(path);
    if (!ids || hash === '' || hash === 'top') continue;
    let id = hash;
    try {
      id = decodeURIComponent(hash);
    } catch {
      // unverändert prüfen
    }
    if (!ids.has(id)) missingAnchors.add(`${url} (verlinkt von ${from})`);
  }

  console.log(`Link-Check: ${status.size} Adressen, ${anchors.size} HTML-Seiten, ${fragments.length} Sprungziele geprüft`);
  expect(status.size, 'Crawler hat die Website gefunden').toBeGreaterThan(50);
  expect(broken, 'tote Links').toEqual([]);
  expect([...missingAnchors], 'fehlende Sprungziele').toEqual([]);
});
