/**
 * Zentrale Stammdaten der Liga. `[LIGANAME]` und `[KÜRZEL]` sind Platzhalter, bis der
 * Name feststeht (Plan §0, §9.1: kein „F1“ im Namen, vorher Marken-/Domain-Check).
 */
export const SITE = {
  name: '[LIGANAME]',
  shortName: '[KÜRZEL]',
  /** Beschreibend – so ist „F1“ erlaubt (Plan §9.1). */
  gameName: 'EA SPORTS F1® 25',
  contactEmail: 'kontakt@liga.example',
  foundingYear: 2026,
  gridSize: 22,
  teamCount: 11,
  themeColor: '#050505',
} as const;

/** Hinweis im <title>: „Seite · [LIGANAME]“ (Plan §10). */
export function pageTitle(title?: string, lang: 'de' | 'en' = 'de'): string {
  if (title) return `${title} · ${SITE.name}`;
  return lang === 'de' ? `${SITE.name} – Online-Liga für ${SITE.gameName}` : `${SITE.name} – Online league for ${SITE.gameName}`;
}
