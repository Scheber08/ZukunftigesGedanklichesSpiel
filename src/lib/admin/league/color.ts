/**
 * Farbkontrast nach WCAG 2.2 (relative Leuchtdichte), für Teamfarben im Admin:
 * Hinweis, ob Text in der Textfarbe auf der Teamfarbe lesbar ist (≥ 4,5:1), und ob
 * der 4-px-Streifen auf dem dunklen Hintergrund sichtbar ist (≥ 3:1 für Grafiken).
 */
import { normalizeHex } from './forms';

/** Hintergrund der Seite (Token --color-bg) und der Karten (--color-surface-1). */
export const PAGE_BG = '#050505';
export const SURFACE_BG = '#0E0E10';

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const n = normalizeHex(hex);
  if (!n) throw new Error(`Ungültige Farbe: ${hex}`);
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Kontrastverhältnis 1..21 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Schwarz oder Weiß – je nachdem, was auf der Farbe besser lesbar ist. */
export function bestTextColor(background: string): '#000000' | '#FFFFFF' {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#FFFFFF') ? '#000000' : '#FFFFFF';
}

export interface ContrastReport {
  /** Textfarbe auf Teamfarbe */
  text: number;
  textOk: boolean;
  /** Teamfarbe (Streifen) auf dem Seitenhintergrund */
  stripe: number;
  stripeOk: boolean;
  suggestion: '#000000' | '#FFFFFF';
}

export function contrastReport(color: string, textColor: string): ContrastReport | null {
  if (!normalizeHex(color) || !normalizeHex(textColor)) return null;
  const text = contrastRatio(color, textColor);
  const stripe = contrastRatio(color, PAGE_BG);
  return { text, textOk: text >= 4.5, stripe, stripeOk: stripe >= 3, suggestion: bestTextColor(color) };
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1).replace('.', ',')}:1`;
}
