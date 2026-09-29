/**
 * Kleine Text-Helfer für Inhaltsseiten (ohne I/O).
 */

/**
 * Zerlegt einen Schritt wie „Crossplay aktivieren: In den Einstellungen …“ in eine kurze
 * fette Überschrift und den Rest. Ohne passenden Doppelpunkt bleibt der Text unverändert.
 */
export function splitStep(step: string, maxHead = 40): { head: string | null; rest: string } {
  const idx = step.indexOf(': ');
  if (idx <= 0 || idx > maxHead) return { head: null, rest: step };
  return { head: step.slice(0, idx + 1), rest: step.slice(idx + 2) };
}

/** Initialen für einen Avatar-Platzhalter aus einem Gamertag (z. B. „RaceControl_Rene“ → „RR“). */
export function initials(gamertag: string): string {
  const parts = gamertag
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter((p) => /[A-Za-z0-9ÄÖÜäöü]/.test(p));
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
