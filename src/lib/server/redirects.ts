/**
 * 301-Weiterleitungen bei Umbenennungen (Plan §2.2: stabile URLs).
 *
 * Ändert der Admin einen Slug (Fahrer, Team, Saison, News), wird der alte Slug in
 * `slug_redirects` gespeichert. Statische Seiten gibt es nur für aktuelle Slugs –
 * Anfragen auf alte URLs landen deshalb im Worker, und die Middleware leitet um.
 */
import type { Store } from '../db/store';
import type { SlugRedirectRow } from '../db/types';

type Entity = SlugRedirectRow['entity'];

/** Beim Umbenennen aufrufen (Admin-Actions). Ketten werden aufgelöst: a→b, b→c ⇒ a→c. */
export async function recordSlugChange(
  store: Store,
  entity: Entity,
  oldSlug: string,
  newSlug: string,
  lang: 'de' | 'en' | null = null,
): Promise<void> {
  if (!oldSlug || oldSlug === newSlug) return;
  // Bestehende Weiterleitungen auf den alten Slug direkt aufs neue Ziel umbiegen
  const pointing = await store.select('slug_redirects', { eq: { entity, new_slug: oldSlug } });
  for (const r of pointing) {
    if ((r.lang ?? null) !== lang) continue;
    if (r.old_slug === newSlug) await store.remove('slug_redirects', { id: r.id });
    else await store.update('slug_redirects', { id: r.id }, { new_slug: newSlug });
  }
  // Wird ein früherer Slug wieder vergeben, darf er nicht mehr weiterleiten
  const reused = await store.select('slug_redirects', { eq: { entity, old_slug: newSlug } });
  for (const r of reused) if ((r.lang ?? null) === lang) await store.remove('slug_redirects', { id: r.id });

  const existing = (await store.select('slug_redirects', { eq: { entity, old_slug: oldSlug } })).find(
    (r) => (r.lang ?? null) === lang,
  );
  if (existing) await store.update('slug_redirects', { id: existing.id }, { new_slug: newSlug });
  else await store.insert('slug_redirects', { entity, old_slug: oldSlug, new_slug: newSlug, lang });
}

interface Pattern {
  entity: Entity;
  lang: 'de' | 'en' | null;
  re: RegExp;
}

/** Pfad-Muster mit dem Slug als erster Gruppe; der Rest des Pfads bleibt erhalten. */
const PATTERNS: Pattern[] = [
  { entity: 'driver', lang: null, re: /^\/fahrer\/([^/]+)(\/.*)?$/ },
  { entity: 'driver', lang: null, re: /^\/en\/drivers\/([^/]+)(\/.*)?$/ },
  { entity: 'team', lang: null, re: /^\/teams\/([^/]+)(\/.*)?$/ },
  { entity: 'team', lang: null, re: /^\/en\/teams\/([^/]+)(\/.*)?$/ },
  { entity: 'season', lang: null, re: /^\/saison\/([^/]+)(\/.*)?$/ },
  { entity: 'season', lang: null, re: /^\/en\/season\/([^/]+)(\/.*)?$/ },
  { entity: 'season', lang: null, re: /^\/rennen\/([^/]+)(\/.*)?$/ },
  { entity: 'season', lang: null, re: /^\/en\/races\/([^/]+)(\/.*)?$/ },
  { entity: 'news', lang: 'de', re: /^\/news\/([^/]+)$/ },
  { entity: 'news', lang: 'en', re: /^\/en\/news\/([^/]+)$/ },
];

export function matchRedirectPattern(pathname: string): { entity: Entity; lang: 'de' | 'en' | null; slug: string; build: (slug: string) => string } | null {
  for (const p of PATTERNS) {
    const m = p.re.exec(pathname);
    if (!m?.[1]) continue;
    let slug: string;
    try {
      slug = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
    const rest = m[2] ?? '';
    // Muster sind verankert (^…$): alles vor Slug + Rest ist das feste Präfix
    const prefix = pathname.slice(0, pathname.length - m[1].length - rest.length);
    return { entity: p.entity, lang: p.lang, slug, build: (next) => `${prefix}${encodeURIComponent(next)}${rest}` };
  }
  return null;
}

/** Ziel-Pfad für eine alte URL oder null. */
export async function findRedirect(store: Store, pathname: string): Promise<string | null> {
  const match = matchRedirectPattern(pathname);
  if (!match) return null;
  const rows = await store.select('slug_redirects', { eq: { entity: match.entity, old_slug: match.slug } });
  const hit = rows.find((r) => match.lang == null || (r.lang ?? null) === match.lang);
  return hit ? match.build(hit.new_slug) : null;
}
