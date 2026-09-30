/**
 * Reservierte Slugs (Plan §4.1 Sitemap): Feste Unterseiten wie /fahrer/vergleich bzw.
 * /en/drivers/compare teilen sich den Pfad mit den Profilseiten /fahrer/{slug}. Ein Fahrer
 * oder Team mit so einem Slug würde die feste Seite überdecken (oder umgekehrt). Die Liste
 * wird aus den Routen abgeleitet und um Namen ergänzt, die für künftige Unterseiten frei
 * bleiben sollen. Reine Funktionen (getestet).
 */
import { ROUTES } from '~/i18n/routes';
import { slugify, uniqueSlug } from '~/lib/domain/text';

export type SlugKind = 'driver' | 'team';

/** Listen-Routen, unter denen die Profilseiten liegen (DE und EN). */
const PROFILE_BASES: Record<SlugKind, readonly string[]> = {
  driver: [ROUTES.drivers.de, ROUTES.drivers.en],
  team: [ROUTES.teams.de, ROUTES.teams.en],
};

/**
 * Zusätzlich freigehaltene Unterseiten (noch ohne eigene Route), damit spätere Seiten wie
 * ein Team-Vergleich oder eine Statistik-Übersicht nicht mit bestehenden Slugs kollidieren.
 */
const EXTRA_RESERVED: Record<SlugKind, readonly string[]> = {
  driver: ['vergleich', 'compare', 'head-to-head', 'h2h', 'statistik', 'stats', 'index'],
  team: ['vergleich', 'compare', 'head-to-head', 'h2h', 'statistik', 'stats', 'index'],
};

/**
 * Erstes festes Pfadsegment unter einer Listen-Route, z. B. „/fahrer/vergleich“ → „vergleich“.
 * Platzhalter wie {slug} zählen nicht.
 */
function fixedChildSegments(bases: readonly string[]): string[] {
  const out = new Set<string>();
  for (const route of Object.values(ROUTES)) {
    for (const path of Object.values(route) as string[]) {
      for (const base of bases) {
        if (!path.startsWith(`${base}/`)) continue;
        const segment = path.slice(base.length + 1).split('/')[0] ?? '';
        if (segment !== '' && !segment.includes('{')) out.add(segment.toLowerCase());
      }
    }
  }
  return [...out];
}

function buildReserved(kind: SlugKind): readonly string[] {
  return [...new Set([...fixedChildSegments(PROFILE_BASES[kind]), ...EXTRA_RESERVED[kind]])].sort();
}

/** Reservierte Fahrer-Slugs (u. a. „vergleich“ und „compare“ aus /fahrer/vergleich, /en/drivers/compare). */
export const RESERVED_DRIVER_SLUGS: readonly string[] = buildReserved('driver');
/** Reservierte Team-Slugs. */
export const RESERVED_TEAM_SLUGS: readonly string[] = buildReserved('team');

export function reservedSlugs(kind: SlugKind): readonly string[] {
  return kind === 'driver' ? RESERVED_DRIVER_SLUGS : RESERVED_TEAM_SLUGS;
}

export function isReservedSlug(kind: SlugKind, slug: string | null | undefined): boolean {
  return !!slug && reservedSlugs(kind).includes(slug.trim().toLowerCase());
}

/** Fehlermeldung für einen selbst eingetragenen, reservierten Slug. */
export function reservedSlugMessage(kind: SlugKind, slug: string): string {
  const [de, en] = PROFILE_BASES[kind];
  const example = kind === 'driver' ? ` wie ${ROUTES.driverCompare.de}` : '';
  return `Der Slug „${slug}“ ist reserviert: Unter ${de}/… und ${en}/… liegen feste Unterseiten${example}. Bitte einen anderen wählen, z. B. „${slug}-2“.`;
}

/**
 * Automatischer Slug aus einem Namen: eindeutig gegenüber vergebenen Slugs und nie reserviert
 * (dann mit Zähler, z. B. „vergleich-2“). Der eigene aktuelle Slug zählt nicht als belegt.
 */
export function autoSlug(kind: SlugKind, name: string, takenSlugs: Iterable<string>, ownSlug?: string): string {
  const taken = new Set(takenSlugs);
  if (ownSlug) taken.delete(ownSlug);
  for (const r of reservedSlugs(kind)) taken.add(r);
  return uniqueSlug(slugify(name), taken);
}

/**
 * Prüfung eines Slugs vor dem Speichern: `null` = in Ordnung, sonst die Fehlermeldung.
 * Ein unveränderter Slug (`previous`) bleibt erlaubt – ältere Einträge sollen sich trotzdem
 * bearbeiten lassen; die Seite weist dann gesondert darauf hin.
 */
export function slugProblem(
  kind: SlugKind,
  slug: string,
  takenByOthers: Iterable<string>,
  previous?: string | null,
): string | null {
  if (previous != null && slug === previous) return null;
  if (isReservedSlug(kind, slug)) return reservedSlugMessage(kind, slug);
  if (new Set(takenByOthers).has(slug)) return `Der Slug „${slug}“ ist schon vergeben.`;
  return null;
}
