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

const EFFORT_PREFIX: Record<string, string> = { 'ca.': 'approx. ', etwa: 'approx. ', 'bis zu': 'up to ', mindestens: 'at least ' };
const EFFORT_PERIOD: Record<string, string> = { renntag: 'race day', rennen: 'race', woche: 'week', monat: 'month', saison: 'season' };
const EFFORT_NOTES: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^inkl\.?\s+Vorbereitung$/i, () => 'incl. preparation'],
  [/^innerhalb von (\d+)\s*h nach Ende der Protestfrist$/i, (m) => `within ${m[1]} h after the protest deadline`],
];
const EFFORT_RE =
  /^(ca\.|etwa|bis zu|mindestens)?\s*(\d+(?:,\d+)?(?:\s*[–-]\s*\d+(?:,\d+)?)?)\s*(?:h|Std\.?|Stunden?)\s*(?:pro|je|\/)\s*(Renntag|Rennen|Woche|Monat|Saison)\s*(?:\((.+)\))?$/i;

/**
 * Zeitaufwand einer offenen Rolle (`open_positions.effort`, nur auf Deutsch gepflegt) für die
 * Anzeige. Auf Englisch werden gängige Muster übersetzt („ca. 1–2 h pro Woche“ →
 * „approx. 1–2 h per week“); alles andere bleibt Deutsch und wird als Fallback markiert.
 */
export function localizedEffort(effort: string, lang: 'de' | 'en'): { text: string; fallback: boolean } {
  const text = effort.trim();
  if (lang === 'de') return { text, fallback: false };
  const m = EFFORT_RE.exec(text);
  if (!m) return { text, fallback: true };
  const [, prefix, amount, period, note] = m;
  let noteEn = '';
  if (note != null) {
    const hit = EFFORT_NOTES.map(([re, fn]) => {
      const nm = re.exec(note.trim());
      return nm ? fn(nm) : null;
    }).find((v) => v != null);
    if (!hit) return { text, fallback: true };
    noteEn = ` (${hit})`;
  }
  const pre = prefix ? EFFORT_PREFIX[prefix.toLowerCase()]! : '';
  const num = amount!.replace(/,/g, '.').replace(/\s*[–-]\s*/, '–');
  return { text: `${pre}${num} h per ${EFFORT_PERIOD[period!.toLowerCase()]!}${noteEn}`, fallback: false };
}
