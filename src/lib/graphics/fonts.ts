/**
 * Schriften für das Canvas-Rendering (Plan §3.3): Titillium Web für Überschriften und Zahlen,
 * Inter für Text. Astro vergibt eigene Familiennamen (z. B. „Titillium Web-634993bb…“) – der
 * tatsächliche Name steht als erster Eintrag in den CSS-Variablen --font-titillium/--font-inter.
 */

export const DISPLAY_FONT_VAR = '--font-titillium';
export const TEXT_FONT_VAR = '--font-inter';
export const DISPLAY_FALLBACK = 'Titillium Web';
export const TEXT_FALLBACK = 'Inter';
const GENERIC_FALLBACK = 'system-ui, sans-serif';

/** Schnitte, die vor dem Zeichnen geladen werden (Astro stellt Titillium 600/700/900 und Inter 400–700 bereit). */
export const DISPLAY_WEIGHTS = [600, 700, 900] as const;
export const TEXT_WEIGHTS = [400, 500, 600, 700] as const;

export interface FontFamilies {
  display: string;
  text: string;
}

/**
 * Erster Familienname aus einer CSS-`font-family`-Liste, ohne Anführungszeichen.
 * `"Titillium Web-6349", "… fallback: Arial", system-ui` → `Titillium Web-6349`.
 */
export function firstFontFamily(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  const quote = s[0];
  if (quote === '"' || quote === "'") {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === '\\' && i + 1 < s.length) {
        out += s[++i];
        continue;
      }
      if (ch === quote) return out.trim() || null;
      out += ch;
    }
    return out.trim() || null;
  }
  const first = s.split(',')[0]!.trim();
  // generische Familien sind kein Webfont-Name
  if (!first || /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+)$/i.test(first)) return null;
  return first;
}

/** Familiennamen aus den CSS-Variablen ermitteln (mit Fallback auf die bekannten Namen). */
export function resolveFamilies(read: (cssVar: string) => string | null | undefined): FontFamilies {
  return {
    display: firstFontFamily(read(DISPLAY_FONT_VAR)) ?? DISPLAY_FALLBACK,
    text: firstFontFamily(read(TEXT_FONT_VAR)) ?? TEXT_FALLBACK,
  };
}

/** Familienname für CSS/Canvas in Anführungszeichen (Backslash und Anführungszeichen maskiert). */
export function quoteFamily(family: string): string {
  return `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Canvas-`font`-Angabe, z. B. `900 96px "Titillium Web-…", system-ui, sans-serif`. */
export function canvasFont(weight: number, sizePx: number, family: string): string {
  const size = Math.max(1, Math.round(sizePx * 100) / 100);
  return `${weight} ${size}px ${quoteFamily(family)}, ${GENERIC_FALLBACK}`;
}

/** Angaben für `document.fonts.load(...)`: jeder benötigte Schnitt beider Familien. */
export function fontLoadSpecs(families: FontFamilies): string[] {
  return [
    ...DISPLAY_WEIGHTS.map((w) => `${w} 64px ${quoteFamily(families.display)}`),
    ...TEXT_WEIGHTS.map((w) => `${w} 32px ${quoteFamily(families.text)}`),
  ];
}
