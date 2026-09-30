/**
 * SVG-Helfer für das Canvas-Rendering: Firefox zeichnet SVG-Bilder ohne width/height nicht
 * auf ein Canvas – deshalb bekommt das Wurzelelement vor dem Laden feste Maße.
 */

/** Setzt width/height am <svg>-Wurzelelement (vorhandene Angaben werden ersetzt). */
export function withSvgSize(svg: string, width: number, height: number): string {
  const open = /<svg\b[^>]*>/i.exec(svg);
  if (!open) return svg;
  const tag = open[0]
    .replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/^<svg\b/i, `<svg width="${Math.round(width)}" height="${Math.round(height)}"`);
  let out = svg.slice(0, open.index) + tag + svg.slice(open.index + open[0].length);
  if (!/\sxmlns\s*=/.test(tag)) out = out.replace(/^([\s\S]*?)<svg\b/i, '$1<svg xmlns="http://www.w3.org/2000/svg"');
  return out;
}

/** Seitenverhältnis aus viewBox bzw. width/height (Standard 1). */
export function svgAspect(svg: string): number {
  const open = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(open);
  if (vb) {
    const w = Number(vb[1]);
    const h = Number(vb[2]);
    if (w > 0 && h > 0) return w / h;
  }
  const w = Number(/\swidth\s*=\s*["']([\d.]+)/i.exec(open)?.[1]);
  const h = Number(/\sheight\s*=\s*["']([\d.]+)/i.exec(open)?.[1]);
  return w > 0 && h > 0 ? w / h : 1;
}
