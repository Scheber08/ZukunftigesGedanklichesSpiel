/**
 * Hintergrund-Glow der Social-Grafiken (Plan §3.4: radialer Verlauf Grün/Türkis) als eigene
 * Pixelberechnung: Canvas-Verläufe werden vom Browser gedithert – das Rauschen bläht PNGs auf
 * (Story > 1 MB). Hier entsteht der Glow ohne Rauschen in niedriger Auflösung und wird danach
 * hochskaliert. Rein, ohne DOM.
 */

export interface Glow {
  /** Mittelpunkt relativ zur Bildgröße (0–1) */
  cx: number;
  cy: number;
  /** Radius relativ zur längeren Bildseite */
  r: number;
  color: string;
  /** Deckkraft in der Mitte, nach außen linear bis 0 */
  alpha: number;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** RGBA-Pixel (Breite × Höhe) mit Grundfarbe und übereinandergelegten radialen Glows. */
export function glowPixels(width: number, height: number, background: string, glows: readonly Glow[]): Uint8ClampedArray {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const out = new Uint8ClampedArray(w * h * 4);
  const bg = hexToRgb(background);
  const long = Math.max(w, h);
  const layers = glows.map((g) => ({ x: g.cx * w, y: g.cy * h, r: Math.max(1e-6, g.r * long), rgb: hexToRgb(g.color), a: Math.min(1, Math.max(0, g.alpha)) }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = bg[0];
      let g = bg[1];
      let b = bg[2];
      for (const l of layers) {
        const d = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y);
        const t = 1 - d / l.r;
        if (t <= 0) continue;
        const a = l.a * t;
        r += (l.rgb[0] - r) * a;
        g += (l.rgb[1] - g) * a;
        b += (l.rgb[2] - b) * a;
      }
      const i = (y * w + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Glows der Grafiken: Grün oben rechts, Türkis unten links (wie der Hero-Glow der Website). */
export function backgroundGlows(hero: boolean): Glow[] {
  return [
    { cx: 0.92, cy: 0.06, r: 0.62, color: '#0B6043', alpha: hero ? 0.62 : 0.55 },
    { cx: 0.04, cy: 0.98, r: 0.55, color: '#0E5A61', alpha: hero ? 0.5 : 0.42 },
  ];
}
