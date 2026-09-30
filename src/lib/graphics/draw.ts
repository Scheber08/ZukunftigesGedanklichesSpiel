/**
 * Canvas-Rendering der Social-Grafiken im Admin-Browser (Plan Phase 2, §3 Marke):
 * dunkler Hintergrund aus den Tokens, Akzent-Verlauf Grün → Türkis, Wirbel aus dem Logo als
 * Hintergrundmotiv, Titillium Web für Überschriften/Zahlen, Inter für Text, Teamfarben nur als
 * Streifen, keine Team-/F1-/Konsolen-Logos. Alle Maße kommen aus layout.ts (rein, getestet).
 */
import { canvasFont, type FontFamilies } from './fonts';
import { FORMATS, type FormatId } from './formats';
import { backgroundGlows, glowPixels } from './glow';
import { fitFontSize, fitTextBlock, frameLayout, tableLayout, truncateText, wrapText, type Frame, type Rect } from './layout';
import type { GraphicModel, GridModel, LineupModel, NewcomerModel, PoleModel, RaceWeekModel, TableModel, TableRowModel } from './motifs';
import type { Lang } from './strings';

/** Design-Tokens (src/styles/global.css, Plan §3.2) */
export const COLORS = {
  bg: '#050505',
  surface1: '#0E0E10',
  surface2: '#16161A',
  border: '#26262C',
  text: '#FFFFFF',
  muted: '#A1A1AA',
  green: '#37BE89',
  teal: '#34C4D0',
  greenDeep: '#0B6043',
  tealDeep: '#0E5A61',
  danger: '#FF6B6B',
  warning: '#F5B94A',
} as const;

/** Verhältnis Versalhöhe/Schriftgröße (für optisch zentrierte Zeilen) */
const CAP = { display: 0.69, text: 0.73 } as const;

/** Platzhalter-Logo (wie src/components/ui/Logo.astro), falls /brand nicht lädt */
const LOGO_PATHS = [
  'M32 4C32 4 54 23 54 38a22 22 0 1 1-44 0C10 23 32 4 32 4Z',
  'M32 40a3 3 0 0 1 3-3a6 6 0 0 1 6 6a9 9 0 0 1-9 9a12 12 0 0 1-12-12a15 15 0 0 1 15-15',
];

export interface DrawAssets {
  logo: CanvasImageSource | null;
  /** Breite/Höhe des Logos */
  logoAspect: number;
  flags: Record<string, CanvasImageSource>;
  /** Aquarell-/Steintextur (SITE.heroTexture), dezent hinter dem Glow */
  texture?: { image: CanvasImageSource; width: number; height: number } | null;
}

export interface DrawOptions {
  brand: { name: string; host: string };
  fonts: FontFamilies;
  assets: DrawAssets;
}

type FontKind = 'display' | 'text';

interface TextStyle {
  kind: FontKind;
  weight: number;
  size: number;
  color?: string | CanvasGradient;
  /** Laufweite in em */
  spacing?: number;
  upper?: boolean;
  align?: CanvasTextAlign;
}

/**
 * Wirbel aus dem Logo als SVG-Pfad: Viertelbögen im Uhrzeigersinn, deren Radius je Bogen um
 * `step` wächst (wie der Innenwirbel des Logos: 3, 6, 9, 12, 15 …). Start im Ursprung.
 */
export function swirlPathData(turns: number, step: number): string {
  const dirs: Array<[number, number]> = [
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ];
  let d = 'M0 0';
  for (let k = 1; k <= turns; k++) {
    const r = k * step;
    const [dx, dy] = dirs[(k - 1) % 4]!;
    d += ` a${r} ${r} 0 0 1 ${dx * r} ${dy * r}`;
  }
  return d;
}

class Painter {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly fonts: FontFamilies,
    readonly lang: Lang,
  ) {}

  private setSpacing(px: number) {
    const c = this.ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in c) c.letterSpacing = `${Math.round(px * 100) / 100}px`;
  }

  setFont(st: TextStyle) {
    this.ctx.font = canvasFont(st.weight, st.size, st.kind === 'display' ? this.fonts.display : this.fonts.text);
    this.setSpacing((st.spacing ?? 0) * st.size);
  }

  prep(text: string, st: TextStyle): string {
    return st.upper ? text.toLocaleUpperCase(this.lang === 'de' ? 'de-DE' : 'en-GB') : text;
  }

  measure(text: string, st: TextStyle): number {
    this.setFont(st);
    return this.ctx.measureText(this.prep(text, st)).width;
  }

  /** Text (ggf. gekürzt) zeichnen; liefert die gezeichnete Breite. */
  draw(text: string, x: number, baseline: number, st: TextStyle, maxWidth?: number): number {
    if (!text) return 0;
    this.setFont(st);
    let t = this.prep(text, st);
    if (maxWidth != null) t = truncateText(t, Math.max(0, maxWidth), (s) => this.ctx.measureText(s).width);
    if (!t) return 0;
    this.ctx.fillStyle = st.color ?? COLORS.text;
    this.ctx.textAlign = st.align ?? 'left';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(t, x, baseline);
    return this.ctx.measureText(t).width;
  }

  /** Grundlinie für optisch mittig gesetzte Versalien/Ziffern */
  baseline(centerY: number, st: Pick<TextStyle, 'kind' | 'size'>): number {
    return centerY + (st.size * CAP[st.kind]) / 2;
  }

  /** Stil mit verkleinerter Schrift (bis `minFactor`), damit lange Namen möglichst ungekürzt passen */
  shrink(text: string, st: TextStyle, maxWidth: number, minFactor = 0.78): TextStyle {
    return { ...st, size: this.fitSize(text, st, Math.max(1, maxWidth), st.size * minFactor) };
  }

  /** größte Schriftgröße, bei der der Text passt */
  fitSize(text: string, st: TextStyle, maxWidth: number, minSize: number): number {
    return fitFontSize(this.prep(text, st), maxWidth, st.size, minSize, (t, size) => {
      this.setFont({ ...st, size });
      return this.ctx.measureText(t).width;
    });
  }

  gradient(x0: number, y0: number, x1: number, y1: number, alpha = 1): CanvasGradient {
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, withAlpha(COLORS.green, alpha));
    g.addColorStop(1, withAlpha(COLORS.teal, alpha));
    return g;
  }

  roundRect(r: Rect, radius: number, fill: string | CanvasGradient) {
    const { ctx } = this;
    ctx.beginPath();
    const rr = Math.min(radius, r.h / 2, r.w / 2);
    if (typeof ctx.roundRect === 'function') ctx.roundRect(r.x, r.y, r.w, r.h, rr);
    else ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

function withAlpha(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Teamfarbe absichern (nur #RRGGBB aus der DB) */
function safeColor(color: string | null | undefined): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : COLORS.border;
}

// ---------------------------------------------------------------------------- Rahmen

function drawBackground(p: Painter, f: Frame, hero: boolean, assets: DrawAssets) {
  const { ctx } = p;
  const W = f.width;
  const H = f.height;
  const s = f.scale;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Glow ohne Dithering-Rauschen: in 1/6 Auflösung berechnen und weich hochskalieren (kleine PNGs)
  const layer = glowCanvas(Math.ceil(W / 6), Math.ceil(H / 6), hero);
  if (layer) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(layer, 0, 0, W, H);
    ctx.restore();
  }

  // Aquarell-Textur (Plan §3.2: auf Social-Grafiken, etwa 25 % Deckkraft), bildfüllend
  if (assets.texture && assets.texture.width > 0 && assets.texture.height > 0) {
    const { image, width, height } = assets.texture;
    const scale = Math.max(W / width, H / height);
    const tw = width * scale;
    const th = height * scale;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.drawImage(image, (W - tw) / 2, (H - th) / 2, tw, th);
    ctx.restore();
  }

  // Wirbel-Motiv groß und dezent
  const turns = 9;
  const step = (Math.min(W, H) * (hero ? 0.1 : 0.085)) / 1;
  const cx = f.orientation === 'portrait' ? W * 0.78 : W * 0.8;
  const cy = f.orientation === 'portrait' ? H * 0.72 : H * 0.6;
  ctx.save();
  ctx.translate(cx, cy);
  const path = new Path2D(swirlPathData(turns, step));
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.lineCap = 'round';
  ctx.strokeStyle = p.gradient(-turns * step, -turns * step, turns * step, turns * step, hero ? 0.16 : 0.1);
  ctx.stroke(path);
  ctx.restore();

  // feine Verlaufskante oben
  ctx.fillStyle = p.gradient(0, 0, W, 0, 0.9);
  ctx.fillRect(0, 0, W, Math.max(3, Math.round(6 * s)));
}

function glowCanvas(width: number, height: number, hero: boolean): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(width, height);
  image.data.set(glowPixels(width, height, COLORS.bg, backgroundGlows(hero)));
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function drawLogo(p: Painter, x: number, y: number, size: number, assets: DrawAssets): number {
  const { ctx } = p;
  if (assets.logo) {
    const w = size * (assets.logoAspect || 1);
    ctx.drawImage(assets.logo, x, y, w, size);
    return w;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 64, size / 64);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = p.gradient(0, 0, 64, 64);
  for (const d of LOGO_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();
  return size;
}

function drawHeader(p: Painter, f: Frame, model: GraphicModel, opts: DrawOptions) {
  const s = f.scale;
  const h = f.header;
  const logoW = drawLogo(p, h.x, h.y, h.h, opts.assets);
  const nameX = h.x + logoW + 22 * s;
  const nameStyle: TextStyle = { kind: 'display', weight: 700, size: 36 * s, spacing: 0.04, upper: true };
  let maxName = h.x + h.w - nameX;
  if (f.orientation === 'portrait') {
    const kickerStyle: TextStyle = { kind: 'text', weight: 600, size: 24 * s, spacing: 0.08, upper: true, color: COLORS.muted, align: 'right' };
    const kw = Math.min(p.measure(model.kicker, kickerStyle), h.w * 0.5);
    p.draw(model.kicker, h.x + h.w, p.baseline(h.y + h.h / 2, kickerStyle), kickerStyle, h.w * 0.5);
    maxName -= kw + 32 * s;
  }
  p.draw(opts.brand.name, nameX, p.baseline(h.y + h.h / 2, nameStyle), nameStyle, maxName);

  // Verlaufslinie unter dem Kopf
  const lineY = h.y + h.h + 22 * s;
  p.ctx.fillStyle = p.gradient(h.x, 0, h.x + h.w, 0);
  p.ctx.fillRect(h.x, lineY, f.orientation === 'portrait' ? h.w : Math.min(h.w, 160 * s), Math.max(2, 4 * s));
}

function drawBadge(p: Painter, x: number, centerY: number, badge: NonNullable<GraphicModel['badge']>, s: number, align: 'left' | 'right'): number {
  const st: TextStyle = { kind: 'display', weight: 700, size: 26 * s, spacing: 0.06, upper: true, color: '#000000' };
  const tw = p.measure(badge.text, st);
  const padX = 18 * s;
  const w = tw + padX * 2;
  const h = 46 * s;
  const left = align === 'right' ? x - w : x;
  const fill = badge.tone === 'warning' ? COLORS.warning : badge.tone === 'green' ? COLORS.green : COLORS.teal;
  p.roundRect({ x: left, y: centerY - h / 2, w, h }, 8 * s, fill);
  p.draw(badge.text, left + padX, p.baseline(centerY, st), st);
  return w;
}

function drawTitle(p: Painter, f: Frame, model: GraphicModel) {
  const s = f.scale;
  const t = f.title;
  const titleStyle: TextStyle = { kind: 'display', weight: 900, size: 112 * s, spacing: 0.01, upper: true };
  const subStyle: TextStyle = { kind: 'display', weight: 700, size: 46 * s, spacing: 0.03, upper: true };

  if (f.orientation === 'portrait') {
    const size = p.fitSize(model.title, titleStyle, t.w, 50 * s);
    const tStyle = { ...titleStyle, size };
    const titleBase = t.y + size * CAP.display + 6 * s;
    p.draw(model.title, t.x, titleBase, tStyle, t.w);
    if (model.subtitle || model.badge) {
      const subCenter = titleBase + 30 * s + (subStyle.size * CAP.display) / 2 + 18 * s;
      let badgeW = 0;
      if (model.badge) badgeW = drawBadge(p, t.x + t.w, subCenter, model.badge, s, 'right') + 24 * s;
      if (model.subtitle) {
        const sub = p.shrink(model.subtitle, subStyle, t.w - badgeW, 0.8);
        const w = Math.min(p.measure(model.subtitle, sub), t.w - badgeW);
        p.draw(model.subtitle, t.x, p.baseline(subCenter, subStyle), { ...sub, color: p.gradient(t.x, 0, t.x + Math.max(w, 1), 0) }, t.w - badgeW);
      }
    }
    return;
  }

  // Querformat: Kennzeile, Titel (bis 3 Zeilen), Untertitel, Status untereinander
  const kickerStyle: TextStyle = { kind: 'text', weight: 600, size: 26 * s, spacing: 0.08, upper: true, color: COLORS.muted };
  let y = t.y + kickerStyle.size;
  p.draw(model.kicker, t.x, y, kickerStyle, t.w);
  y += 26 * s;
  const block = fitTextBlock(p.prep(model.title, titleStyle), t.w, { max: 116 * s, min: 40 * s, prefer: 84 * s }, (text, size) => {
    p.setFont({ ...titleStyle, size });
    return p.ctx.measureText(text).width;
  }, 3);
  const lh = block.size * 1.02;
  for (const line of block.lines) {
    y += block.size * CAP.display + (lh - block.size * CAP.display);
    p.draw(line, t.x, y, { ...titleStyle, size: block.size, upper: false }, t.w);
  }
  if (model.subtitle) {
    const sub = { ...subStyle, size: 44 * s };
    const lines = wrapText(p.prep(model.subtitle, sub), t.w, (text) => p.measure(text, { ...sub, upper: false }), 2);
    y += 24 * s;
    for (const line of lines) {
      y += sub.size * 1.08;
      const w = p.measure(line, { ...sub, upper: false });
      p.draw(line, t.x, y, { ...sub, upper: false, color: p.gradient(t.x, 0, t.x + Math.max(1, w), 0) }, t.w);
    }
  }
  if (model.badge) {
    y += 30 * s + 23 * s;
    drawBadge(p, t.x, y, model.badge, s, 'left');
  }
}

function drawFooter(p: Painter, f: Frame, opts: DrawOptions) {
  const s = f.scale;
  const st: TextStyle = { kind: 'text', weight: 600, size: 24 * s, spacing: 0.06, upper: true, color: COLORS.muted };
  if (opts.brand.host) p.draw(opts.brand.host, f.footer.x, p.baseline(f.footer.y + f.footer.h / 2, st), st, f.footer.w);
}

// ---------------------------------------------------------------------------- Icons

function drawStopwatch(p: Painter, cx: number, cy: number, size: number, color: string) {
  const { ctx } = p;
  const r = size * 0.38;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, size * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.06, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.14, cy - r - size * 0.06);
  ctx.lineTo(cx + size * 0.14, cy - r - size * 0.06);
  ctx.moveTo(cx, cy + size * 0.06);
  ctx.lineTo(cx + r * 0.55, cy - r * 0.45);
  ctx.stroke();
  ctx.restore();
}

function drawFlag(p: Painter, code: string | null | undefined, x: number, centerY: number, height: number, assets: DrawAssets): number {
  const img = code ? assets.flags[code] : undefined;
  if (!img) return 0;
  const w = height * 1.5;
  const y = centerY - height / 2;
  p.ctx.save();
  p.ctx.beginPath();
  if (typeof p.ctx.roundRect === 'function') p.ctx.roundRect(x, y, w, height, height * 0.08);
  else p.ctx.rect(x, y, w, height);
  p.ctx.clip();
  p.ctx.drawImage(img, x, y, w, height);
  p.ctx.restore();
  p.ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  p.ctx.lineWidth = 1;
  p.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, height - 1);
  return w;
}

// ---------------------------------------------------------------------------- Tabellen

function drawColumnHeader(p: Painter, y: number, s: number, labels: { name: string; value: string; extra: string | null }, cols: { nameX: number; valueRight: number; extraRight: number | null }) {
  const st: TextStyle = { kind: 'text', weight: 600, size: 18 * s, spacing: 0.1, upper: true, color: COLORS.muted };
  const base = y + st.size;
  p.draw(labels.name, cols.nameX, base, st, cols.valueRight - cols.nameX - 120 * s);
  p.draw(labels.value, cols.valueRight, base, { ...st, align: 'right' });
  if (labels.extra && cols.extraRight != null) p.draw(labels.extra, cols.extraRight, base, { ...st, align: 'right' });
}

interface RowGeometry {
  posW: number;
  stripeW: number;
  nameX: number;
  valueRight: number;
  extraRight: number | null;
}

function rowGeometry(p: Painter, cell: Rect, s: number, model: TableModel): RowGeometry {
  const posW = Math.round(cell.h * 1.05);
  const stripeW = Math.max(4, Math.round(7 * s));
  const pad = 18 * s;
  const hasNumber = model.rows.some((r) => r.number);
  const numStyle: TextStyle = { kind: 'display', weight: 700, size: cell.h * 0.34 };
  const numW = hasNumber ? p.measure('00', numStyle) + 14 * s : 0;
  const hasExtra = model.rows.some((r) => r.extra);
  const extraStyle: TextStyle = { kind: 'display', weight: 700, size: cell.h * 0.36 };
  const extraW = hasExtra ? Math.max(p.measure('00', extraStyle), p.measure(model.columns.extra ?? '', { kind: 'text', weight: 600, size: 18 * s, spacing: 0.1, upper: true })) : 0;
  const right = cell.x + cell.w - pad;
  const extraRight = hasExtra ? right : null;
  const valueRight = hasExtra ? right - extraW - 28 * s : right;
  return { posW, stripeW, nameX: cell.x + posW + stripeW + pad + numW, valueRight, extraRight };
}

function drawTableRow(p: Painter, cell: Rect, row: TableRowModel, geo: RowGeometry, s: number, model: TableModel) {
  const { ctx } = p;
  const cy = cell.y + cell.h / 2;
  // Zeile
  ctx.fillStyle = withAlpha(COLORS.surface1, 0.92);
  ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
  // Position
  const posBox: Rect = { x: cell.x, y: cell.y, w: geo.posW, h: cell.h };
  if (row.podium) {
    ctx.fillStyle = p.gradient(posBox.x, posBox.y, posBox.x + posBox.w, posBox.y + posBox.h);
  } else {
    ctx.fillStyle = COLORS.surface2;
  }
  ctx.fillRect(posBox.x, posBox.y, posBox.w, posBox.h);
  const posStyle: TextStyle = { kind: 'display', weight: 700, size: cell.h * 0.5, color: row.podium ? '#000000' : COLORS.text, align: 'center' };
  p.draw(row.pos, posBox.x + posBox.w / 2, p.baseline(cy, posStyle), posStyle, posBox.w - 6 * s);
  // Teamstreifen
  ctx.fillStyle = safeColor(row.color);
  ctx.fillRect(cell.x + geo.posW, cell.y, geo.stripeW, cell.h);
  // Startnummer
  const numStyle: TextStyle = { kind: 'display', weight: 700, size: cell.h * 0.34, color: COLORS.muted };
  if (row.number) p.draw(row.number, cell.x + geo.posW + geo.stripeW + 18 * s, p.baseline(cy, numStyle), numStyle);

  // Werte rechts
  const valueStyle: TextStyle = {
    kind: 'text',
    weight: 600,
    size: cell.h * 0.33,
    align: 'right',
    color: row.valueTone === 'danger' ? COLORS.danger : row.valueTone === 'muted' ? COLORS.muted : COLORS.text,
  };
  if (model.columns.extra === null && model.rows.every((r) => /^\d+$/.test(r.value))) {
    // Punkte in der Wertung groß in Titillium
    Object.assign(valueStyle, { kind: 'display', weight: 700, size: cell.h * 0.44 });
  }
  const valueW = p.measure(row.value, valueStyle);
  p.draw(row.value, geo.valueRight, p.baseline(cy, valueStyle), valueStyle);
  if (row.extra && geo.extraRight != null) {
    const extraStyle: TextStyle = { kind: 'display', weight: 700, size: cell.h * 0.36, align: 'right', color: COLORS.teal };
    p.draw(row.extra, geo.extraRight, p.baseline(cy, extraStyle), extraStyle);
  }
  let nameRight = geo.valueRight - valueW - 24 * s;
  if (row.mark === 'fastest') {
    const icon = cell.h * 0.42;
    drawStopwatch(p, nameRight - icon / 2, cy, icon, COLORS.teal);
    nameRight -= icon + 14 * s;
  }

  // Name und Team
  const twoLines = !model.teamsOnly && row.team && cell.h >= 58 * s;
  const maxName = nameRight - geo.nameX;
  const reserveW = row.reserve ? 34 * s : 0;
  const nameStyle = p.shrink(row.name, { kind: 'display', weight: 700, size: cell.h * (twoLines ? 0.36 : 0.42), spacing: 0.02, upper: true }, maxName - reserveW);
  if (twoLines) {
    const nameBase = cell.y + cell.h * 0.47;
    const w = p.draw(row.name, geo.nameX, nameBase, nameStyle, maxName - reserveW);
    if (row.reserve) drawReserveTag(p, geo.nameX + w + 10 * s, nameBase - (nameStyle.size * CAP.display) / 2, s);
    const teamStyle: TextStyle = { kind: 'text', weight: 500, size: cell.h * 0.24, color: COLORS.muted };
    p.draw(row.team ?? '', geo.nameX, cell.y + cell.h * 0.8, teamStyle, maxName);
  } else {
    const base = p.baseline(cy, nameStyle);
    const w = p.draw(row.name, geo.nameX, base, nameStyle, maxName - reserveW);
    if (row.reserve) drawReserveTag(p, geo.nameX + w + 10 * s, cy, s);
  }
}

function drawReserveTag(p: Painter, x: number, centerY: number, s: number) {
  const st: TextStyle = { kind: 'display', weight: 700, size: 18 * s, color: COLORS.text, align: 'center' };
  const w = 26 * s;
  const h = 26 * s;
  p.roundRect({ x, y: centerY - h / 2, w, h }, 5 * s, COLORS.border);
  p.draw('R', x + w / 2, p.baseline(centerY, st), st);
}

function drawTable(p: Painter, f: Frame, model: TableModel) {
  const s = f.scale;
  const c = f.content;
  const headerH = 34 * s;
  const noteH = model.note ? 84 * s : 0;
  const noteGap = model.note ? 22 * s : 0;
  const box: Rect = { x: c.x, y: c.y + headerH, w: c.w, h: c.h - headerH - noteH - noteGap };
  const layout = tableLayout(box, model.rows.length, { minRow: 52 * s, maxRow: 96 * s, gapRatio: 0.12, colGap: 28 * s, maxCols: 2 });
  const firstCells = layout.cells.filter((cell) => cell.row === 0);
  for (const cell of layout.cells) {
    const geo = rowGeometry(p, cell, s, model);
    drawTableRow(p, cell, model.rows[cell.index]!, geo, s, model);
  }
  for (const cell of firstCells) {
    const geo = rowGeometry(p, cell, s, model);
    drawColumnHeader(p, c.y, s, model.columns, { nameX: cell.x, valueRight: geo.valueRight, extraRight: geo.extraRight });
  }
  if (model.note) {
    const used = layout.rowsPerCol * layout.rowH + (layout.rowsPerCol - 1) * layout.gap;
    const note: Rect = { x: c.x, y: box.y + used + noteGap, w: c.w, h: noteH };
    drawNote(p, note, model.note, s);
  }
}

function drawNote(p: Painter, r: Rect, note: NonNullable<TableModel['note']>, s: number) {
  const { ctx } = p;
  const cy = r.y + r.h / 2;
  ctx.fillStyle = withAlpha(COLORS.surface2, 0.95);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = p.gradient(r.x, r.y, r.x, r.y + r.h);
  ctx.fillRect(r.x, r.y, Math.max(3, 5 * s), r.h);
  const icon = r.h * 0.46;
  drawStopwatch(p, r.x + 28 * s + icon / 2, cy, icon, COLORS.teal);
  const labelStyle: TextStyle = { kind: 'text', weight: 600, size: 18 * s, spacing: 0.1, upper: true, color: COLORS.teal };
  const nameStyle: TextStyle = { kind: 'display', weight: 700, size: r.h * 0.34, spacing: 0.02, upper: true };
  const valueStyle: TextStyle = { kind: 'display', weight: 700, size: r.h * 0.4, align: 'right', color: COLORS.teal };
  const textX = r.x + 28 * s + icon + 22 * s;
  const valueW = p.draw(note.value, r.x + r.w - 24 * s, p.baseline(cy, valueStyle), valueStyle);
  p.draw(note.label, textX, r.y + r.h * 0.38, labelStyle, r.w * 0.5);
  const nameMax = r.x + r.w - 24 * s - valueW - 24 * s - textX;
  const nameW = p.draw(note.name, textX, r.y + r.h * 0.8, nameStyle, nameMax);
  if (note.team && nameW + 200 * s < nameMax) {
    const teamStyle: TextStyle = { kind: 'text', weight: 500, size: r.h * 0.24, color: COLORS.muted };
    p.draw(note.team, textX + nameW + 16 * s, r.y + r.h * 0.8, teamStyle, nameMax - nameW - 16 * s);
  }
}

// ---------------------------------------------------------------------------- Startaufstellung

function drawGrid(p: Painter, f: Frame, model: GridModel) {
  const s = f.scale;
  const c = f.content;
  const layout = tableLayout(c, model.slots.length, { minRow: 40 * s, maxRow: 118 * s, gapRatio: 0.2, colGap: 44 * s, minCols: 2, maxCols: 2, order: 'row', stagger: true });
  const { ctx } = p;
  for (const cell of layout.cells) {
    const slot = model.slots[cell.index]!;
    const cy = cell.y + cell.h / 2;
    // Startbox: Linie oben und seitlich (wie auf dem Asphalt)
    ctx.fillStyle = withAlpha(COLORS.surface1, 0.9);
    ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = Math.max(2, 3 * s);
    ctx.beginPath();
    ctx.moveTo(cell.x, cell.y + cell.h * 0.55);
    ctx.lineTo(cell.x, cell.y);
    ctx.lineTo(cell.x + cell.w, cell.y);
    ctx.lineTo(cell.x + cell.w, cell.y + cell.h * 0.55);
    ctx.stroke();

    const posW = cell.h * 1.05;
    const posStyle: TextStyle = { kind: 'display', weight: 900, size: cell.h * 0.52, align: 'center', color: slot.pos === '1' ? p.gradient(cell.x, cell.y, cell.x + posW, cell.y + cell.h) : COLORS.text };
    p.draw(slot.pos, cell.x + posW / 2, p.baseline(cy, posStyle), posStyle, posW);
    const stripeX = cell.x + posW;
    const stripeW = Math.max(4, Math.round(7 * s));
    ctx.fillStyle = safeColor(slot.color);
    ctx.fillRect(stripeX, cell.y + cell.h * 0.18, stripeW, cell.h * 0.64);
    const textX = stripeX + stripeW + 16 * s;
    const pad = 16 * s;
    const numStyle: TextStyle = { kind: 'display', weight: 700, size: cell.h * 0.3, color: COLORS.muted, align: 'right' };
    const numW = slot.number ? p.draw(slot.number, cell.x + cell.w - pad, p.baseline(cy, numStyle), numStyle) + 14 * s : 0;
    const maxW = cell.x + cell.w - pad - numW - textX;
    const twoLines = cell.h >= 56 * s;
    const reserveW = slot.reserve ? 34 * s : 0;
    const nameStyle = p.shrink(slot.name, { kind: 'display', weight: 700, size: cell.h * (twoLines ? 0.32 : 0.38), spacing: 0.02, upper: true }, maxW - reserveW);
    if (twoLines) {
      const base = cell.y + cell.h * 0.48;
      const w = p.draw(slot.name, textX, base, nameStyle, maxW - reserveW);
      if (slot.reserve) drawReserveTag(p, textX + w + 8 * s, base - (nameStyle.size * CAP.display) / 2, s);
      p.draw(slot.team, textX, cell.y + cell.h * 0.8, { kind: 'text', weight: 500, size: cell.h * 0.22, color: COLORS.muted }, maxW);
    } else {
      const w = p.draw(slot.name, textX, p.baseline(cy, nameStyle), nameStyle, maxW - reserveW);
      if (slot.reserve) drawReserveTag(p, textX + w + 8 * s, cy, s);
    }
  }
}

function drawLineup(p: Painter, f: Frame, model: LineupModel) {
  const s = f.scale;
  const c = f.content;
  const layout = tableLayout(c, model.teams.length, { minRow: 60 * s, maxRow: 112 * s, gapRatio: 0.14, colGap: 28 * s, maxCols: 2 });
  const { ctx } = p;
  for (const cell of layout.cells) {
    const team = model.teams[cell.index]!;
    ctx.fillStyle = withAlpha(COLORS.surface1, 0.92);
    ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
    const stripeW = Math.max(5, Math.round(9 * s));
    ctx.fillStyle = safeColor(team.color);
    ctx.fillRect(cell.x, cell.y, stripeW, cell.h);
    const pad = 20 * s;
    const x0 = cell.x + stripeW + pad;
    const innerW = cell.w - stripeW - pad * 2;
    const teamStyle: TextStyle = { kind: 'text', weight: 600, size: Math.min(20 * s, cell.h * 0.24), spacing: 0.1, upper: true, color: COLORS.muted };
    p.draw(team.name, x0, cell.y + cell.h * 0.34, teamStyle, innerW);
    const colW = innerW / 2;
    team.drivers.slice(0, 2).forEach((d, i) => {
      const x = x0 + i * colW;
      const base = cell.y + cell.h * 0.8;
      const numStyle: TextStyle = { kind: 'display', weight: 700, size: cell.h * 0.3, color: COLORS.teal };
      const numW = d.number ? p.draw(d.number, x, base, numStyle) + 10 * s : 0;
      const reserveW = d.reserve ? 34 * s : 0;
      const maxW = colW - numW - 16 * s - reserveW;
      const nameStyle = p.shrink(d.name, { kind: 'display', weight: 700, size: cell.h * 0.32, spacing: 0.02, upper: true }, maxW);
      const w = p.draw(d.name, x + numW, base, nameStyle, maxW);
      if (d.reserve) drawReserveTag(p, x + numW + w + 8 * s, base - (nameStyle.size * CAP.display) / 2, s);
    });
  }
}

// ---------------------------------------------------------------------------- Hero-Motive

/** Blöcke untereinander setzen und im Inhaltsbereich vertikal verteilen. */
function stack(c: Rect, blocks: Array<{ h: number; gap?: number; draw: (y: number) => void }>, align: 'center' | 'start' = 'center') {
  const total = blocks.reduce((sum, b, i) => sum + b.h + (i > 0 ? (b.gap ?? 0) : 0), 0);
  let y = align === 'center' ? c.y + Math.max(0, (c.h - total) / 2) : c.y;
  blocks.forEach((b, i) => {
    if (i > 0) y += b.gap ?? 0;
    b.draw(y);
    y += b.h;
  });
}

function drawRaceWeek(p: Painter, f: Frame, model: RaceWeekModel, opts: DrawOptions) {
  const s = f.scale;
  const c = f.content;
  const hero = f.orientation === 'portrait' ? 1 : 0.9;
  const roundStyle: TextStyle = { kind: 'display', weight: 900, size: 260 * s * hero };
  const trackStyle: TextStyle = { kind: 'display', weight: 900, size: 140 * s * hero, spacing: 0.01, upper: true };
  const trackSize = p.fitSize(model.track, trackStyle, c.w, 64 * s);
  const countryStyle: TextStyle = { kind: 'text', weight: 600, size: 38 * s, color: COLORS.muted };
  const dateStyle: TextStyle = { kind: 'display', weight: 700, size: 50 * s, spacing: 0.02 };
  const timeStyle: TextStyle = { kind: 'display', weight: 900, size: 128 * s * hero };
  const chipStyle: TextStyle = { kind: 'display', weight: 700, size: 30 * s, spacing: 0.06, upper: true };
  const factStyle: TextStyle = { kind: 'text', weight: 500, size: 30 * s, color: COLORS.muted };
  const chipH = 60 * s;

  stack(c, [
    {
      h: roundStyle.size * CAP.display,
      draw: (y) => {
        const w = p.measure(model.roundNo, roundStyle);
        p.draw(model.roundNo, c.x, y + roundStyle.size * CAP.display, { ...roundStyle, color: p.gradient(c.x, y, c.x + w, y + roundStyle.size) });
      },
    },
    {
      h: trackSize * CAP.display,
      gap: 44 * s,
      draw: (y) => p.draw(model.track, c.x, y + trackSize * CAP.display, { ...trackStyle, size: trackSize }, c.w),
    },
    {
      h: 44 * s,
      gap: 26 * s,
      draw: (y) => {
        const flagW = drawFlag(p, model.countryCode, c.x, y + 22 * s, 36 * s, opts.assets);
        p.draw(model.country, c.x + (flagW ? flagW + 16 * s : 0), p.baseline(y + 22 * s, countryStyle), countryStyle, c.w - flagW - 16 * s);
      },
    },
    {
      h: Math.max(3, 4 * s),
      gap: 44 * s,
      draw: (y) => {
        p.ctx.fillStyle = p.gradient(c.x, 0, c.x + c.w, 0);
        p.ctx.fillRect(c.x, y, Math.min(c.w, 220 * s), Math.max(3, 4 * s));
      },
    },
    {
      h: dateStyle.size * CAP.display,
      gap: 44 * s,
      draw: (y) => p.draw(model.date, c.x, y + dateStyle.size * CAP.display, dateStyle, c.w),
    },
    {
      h: timeStyle.size * CAP.display,
      gap: 30 * s,
      draw: (y) => {
        const base = y + timeStyle.size * CAP.display;
        const w = p.draw(model.time, c.x, base, timeStyle);
        const tzStyle: TextStyle = { kind: 'display', weight: 700, size: 44 * s, color: COLORS.teal, upper: true };
        const tzW = p.draw(model.timeZone, c.x + w + 20 * s, base, tzStyle);
        const labelStyle: TextStyle = { kind: 'text', weight: 600, size: 20 * s, spacing: 0.1, upper: true, color: COLORS.muted };
        p.draw(leagueTimeLabel(model.lang), c.x + w + 20 * s, base - 50 * s, labelStyle, Math.max(tzW, 200 * s));
      },
    },
    {
      h: chipH,
      gap: 40 * s,
      draw: (y) => {
        let x = c.x;
        for (const label of model.sessions) {
          const w = p.measure(label, chipStyle) + 44 * s;
          if (x + w > c.x + c.w) break;
          p.ctx.strokeStyle = COLORS.teal;
          p.ctx.lineWidth = Math.max(2, 2 * s);
          p.ctx.beginPath();
          if (typeof p.ctx.roundRect === 'function') p.ctx.roundRect(x, y, w, chipH, 8 * s);
          else p.ctx.rect(x, y, w, chipH);
          p.ctx.stroke();
          p.draw(label, x + 22 * s, p.baseline(y + chipH / 2, chipStyle), chipStyle);
          x += w + 14 * s;
        }
      },
    },
    ...(model.facts.length
      ? [
          {
            h: factStyle.size,
            gap: 28 * s,
            draw: (y: number) => p.draw(model.facts.join(' · '), c.x, y + factStyle.size * CAP.text, factStyle, c.w),
          },
        ]
      : []),
  ]);
}

function leagueTimeLabel(lang: Lang): string {
  return lang === 'de' ? 'Liga-Zeit' : 'League time';
}

function drawPole(p: Painter, f: Frame, model: PoleModel) {
  const s = f.scale;
  const c = f.content;
  const numStyle: TextStyle = { kind: 'display', weight: 900, size: 230 * s };
  const nameStyle: TextStyle = { kind: 'display', weight: 900, size: 124 * s, spacing: 0.01, upper: true };
  const nameSize = p.fitSize(model.driver.name, nameStyle, c.w, 60 * s);
  const teamStyle: TextStyle = { kind: 'text', weight: 600, size: 38 * s, color: COLORS.muted };
  const timeStyle: TextStyle = { kind: 'display', weight: 900, size: 132 * s };
  const labelStyle: TextStyle = { kind: 'text', weight: 600, size: 22 * s, spacing: 0.1, upper: true, color: COLORS.muted };
  const chaserH = 64 * s;

  const blocks: Array<{ h: number; gap?: number; draw: (y: number) => void }> = [];
  if (model.driver.number) {
    blocks.push({
      h: numStyle.size * CAP.display,
      draw: (y) => {
        const text = `#${model.driver.number}`;
        const w = p.measure(text, numStyle);
        p.draw(text, c.x, y + numStyle.size * CAP.display, { ...numStyle, color: p.gradient(c.x, y, c.x + w, y + numStyle.size) });
      },
    });
  }
  blocks.push(
    {
      h: nameSize * CAP.display,
      gap: 40 * s,
      draw: (y) => p.draw(model.driver.name, c.x, y + nameSize * CAP.display, { ...nameStyle, size: nameSize }, c.w),
    },
    {
      h: 44 * s,
      gap: 22 * s,
      draw: (y) => {
        p.ctx.fillStyle = safeColor(model.driver.color);
        p.ctx.fillRect(c.x, y, Math.max(4, 7 * s), 44 * s);
        p.draw(model.driver.team, c.x + 24 * s, p.baseline(y + 22 * s, teamStyle), teamStyle, c.w - 24 * s);
      },
    },
    {
      h: 24 * s + 18 * s + timeStyle.size * CAP.display,
      gap: 52 * s,
      draw: (y) => {
        p.draw(model.lang === 'de' ? 'Qualifying-Zeit' : 'Qualifying time', c.x, y + labelStyle.size, labelStyle, c.w);
        p.draw(model.time, c.x, y + 24 * s + 18 * s + timeStyle.size * CAP.display, timeStyle, c.w);
      },
    },
  );
  if (model.gap) {
    const gapStyle: TextStyle = { kind: 'display', weight: 700, size: 44 * s, color: COLORS.teal };
    blocks.push({
      h: gapStyle.size * CAP.display,
      gap: 28 * s,
      draw: (y) => {
        const base = y + gapStyle.size * CAP.display;
        const w = p.draw(model.gapLabel, c.x, base, { ...labelStyle, size: 26 * s }, c.w * 0.6);
        p.draw(model.gap!, c.x + w + 18 * s, base, gapStyle);
      },
    });
  }
  if (model.chasers.length) {
    blocks.push({
      h: model.chasers.length * chaserH + (model.chasers.length - 1) * 10 * s,
      gap: 44 * s,
      draw: (y) => {
        model.chasers.forEach((ch, i) => {
          const r: Rect = { x: c.x, y: y + i * (chaserH + 10 * s), w: c.w, h: chaserH };
          const cy = r.y + r.h / 2;
          p.ctx.fillStyle = withAlpha(COLORS.surface1, 0.92);
          p.ctx.fillRect(r.x, r.y, r.w, r.h);
          const posStyle: TextStyle = { kind: 'display', weight: 700, size: r.h * 0.44, align: 'center' };
          p.ctx.fillStyle = COLORS.surface2;
          p.ctx.fillRect(r.x, r.y, r.h * 1.3, r.h);
          p.draw(ch.pos, r.x + (r.h * 1.3) / 2, p.baseline(cy, posStyle), posStyle);
          p.ctx.fillStyle = safeColor(ch.color);
          p.ctx.fillRect(r.x + r.h * 1.3, r.y, Math.max(4, 7 * s), r.h);
          const valueStyle: TextStyle = { kind: 'text', weight: 600, size: r.h * 0.36, align: 'right' };
          const vw = p.draw(ch.value, r.x + r.w - 20 * s, p.baseline(cy, valueStyle), valueStyle);
          const nameSt: TextStyle = { kind: 'display', weight: 700, size: r.h * 0.4, spacing: 0.02, upper: true };
          p.draw(ch.name, r.x + r.h * 1.3 + 28 * s, p.baseline(cy, nameSt), nameSt, r.w - r.h * 1.3 - 28 * s - vw - 40 * s);
        });
      },
    });
  }
  stack(c, blocks);
}

function drawNewcomer(p: Painter, f: Frame, model: NewcomerModel, opts: DrawOptions) {
  const s = f.scale;
  const c = f.content;
  const numStyle: TextStyle = { kind: 'display', weight: 900, size: (f.orientation === 'portrait' ? 360 : 300) * s };
  const nameStyle: TextStyle = { kind: 'display', weight: 900, size: 140 * s, spacing: 0.01, upper: true };
  const nameSize = p.fitSize(model.name, nameStyle, c.w, 60 * s);
  const teamStyle: TextStyle = { kind: 'display', weight: 700, size: 48 * s, spacing: 0.02, upper: true };
  const countryStyle: TextStyle = { kind: 'text', weight: 600, size: 38 * s, color: COLORS.muted };

  const blocks: Array<{ h: number; gap?: number; draw: (y: number) => void }> = [];
  if (model.number) {
    blocks.push({
      h: numStyle.size * CAP.display,
      draw: (y) => {
        const w = p.measure(model.number!, numStyle);
        p.draw(model.number!, c.x, y + numStyle.size * CAP.display, { ...numStyle, color: p.gradient(c.x, y, c.x + w, y + numStyle.size) });
      },
    });
  }
  blocks.push(
    {
      h: nameSize * CAP.display,
      gap: 48 * s,
      draw: (y) => p.draw(model.name, c.x, y + nameSize * CAP.display, { ...nameStyle, size: nameSize }, c.w),
    },
    {
      h: 56 * s,
      gap: 36 * s,
      draw: (y) => {
        p.ctx.fillStyle = model.color ? safeColor(model.color) : COLORS.border;
        p.ctx.fillRect(c.x, y, Math.max(4, 8 * s), 56 * s);
        p.draw(model.team, c.x + 28 * s, p.baseline(y + 28 * s, teamStyle), teamStyle, c.w - 28 * s);
      },
    },
  );
  if (model.country) {
    blocks.push({
      h: 44 * s,
      gap: 26 * s,
      draw: (y) => {
        const flagW = drawFlag(p, model.countryCode, c.x, y + 22 * s, 36 * s, opts.assets);
        p.draw(model.country!, c.x + (flagW ? flagW + 16 * s : 0), p.baseline(y + 22 * s, countryStyle), countryStyle, c.w);
      },
    });
  }
  stack(c, blocks);
}

// ---------------------------------------------------------------------------- Einstieg

export function drawGraphic(ctx: CanvasRenderingContext2D, model: GraphicModel, formatId: FormatId, opts: DrawOptions): void {
  const format = FORMATS[formatId];
  const frame = frameLayout(format);
  const p = new Painter(ctx, opts.fonts, model.lang);
  const hero = model.kind === 'raceweek' || model.kind === 'pole' || model.kind === 'newcomer';
  ctx.save();
  ctx.clearRect(0, 0, format.width, format.height);
  drawBackground(p, frame, hero, opts.assets);
  drawHeader(p, frame, model, opts);
  drawTitle(p, frame, model);
  switch (model.kind) {
    case 'table':
      drawTable(p, frame, model);
      break;
    case 'grid':
      drawGrid(p, frame, model);
      break;
    case 'lineup':
      drawLineup(p, frame, model);
      break;
    case 'raceweek':
      drawRaceWeek(p, frame, model, opts);
      break;
    case 'pole':
      drawPole(p, frame, model);
      break;
    case 'newcomer':
      drawNewcomer(p, frame, model, opts);
      break;
  }
  drawFooter(p, frame, opts);
  ctx.restore();
}

// ---------------------------------------------------------------------------- Bilder laden

/** SVG-Text als Bild laden (Blob-URL, gleiche Herkunft – das Canvas bleibt exportierbar). */
export async function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }
}
