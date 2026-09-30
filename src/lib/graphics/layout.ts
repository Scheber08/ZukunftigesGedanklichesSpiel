/**
 * Layout-Berechnung der Social-Grafiken (rein, ohne Canvas): sichere Ränder je Format,
 * Skalierung, Rahmen (Kopf, Titel, Inhalt, Fuß), Zeilen-/Spaltenraster, Textkürzung mit Ellipse,
 * Schriftgröße passend zur Breite und Zeilenumbruch. Gemessen wird über eine übergebene
 * Funktion (im Browser `ctx.measureText`, in Tests eine Attrappe).
 */
import type { FormatSpec } from './formats';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type Orientation = 'portrait' | 'landscape';

type Size = Pick<FormatSpec, 'width' | 'height'> & Partial<Pick<FormatSpec, 'id'>>;

export function orientationOf(format: Size): Orientation {
  return format.width > format.height ? 'landscape' : 'portrait';
}

/**
 * Typo-Skalierung: 1 entspricht dem Hochformat mit 1080 px Breite. Querformate richten sich
 * nach der Höhe (YouTube 0,75, OG ca. 0,66), damit Titel und Tabelle nebeneinander passen.
 */
export function scaleFor(format: Size): number {
  return orientationOf(format) === 'landscape' ? format.height / 960 : format.width / 1080;
}

/**
 * Sichere Ränder: Story/TikTok hält oben (Profilzeile) und unten (Beschriftung, Antwortfeld)
 * sowie rechts (TikTok-Buttons) Abstand, das YouTube-Thumbnail unten (Laufzeit-Anzeige unten
 * rechts, ca. 13 % der Höhe), die anderen Formate einen gleichmäßigen Rand.
 */
export function safeInsets(format: Size): Insets {
  const s = scaleFor(format);
  if (format.id === 'story' || (orientationOf(format) === 'portrait' && format.height / format.width >= 1.7)) {
    return { top: Math.round(format.height * 0.115), right: Math.round(96 * s), bottom: Math.round(format.height * 0.155), left: Math.round(72 * s) };
  }
  const m = Math.round(64 * s);
  if (format.id === 'youtube') return { top: m, right: m, bottom: Math.max(m, Math.round(format.height * 0.13)), left: m };
  return { top: m, right: m, bottom: m, left: m };
}

export interface Frame {
  width: number;
  height: number;
  scale: number;
  orientation: Orientation;
  safe: Insets;
  /** Logo + Liganame + Kennzeile */
  header: Rect;
  /** Titel, Untertitel, Status */
  title: Rect;
  /** Tabelle bzw. Hauptmotiv */
  content: Rect;
  /** Website-Adresse */
  footer: Rect;
}

/**
 * Rahmen der Grafik. Hochformat: alles untereinander. Querformat: links Kopf, Titel und Fuß,
 * rechts der Inhalt über die volle Höhe (YouTube blendet unten rechts die Laufzeit ein).
 */
export function frameLayout(format: Size): Frame {
  const s = scaleFor(format);
  const safe = safeInsets(format);
  const W = format.width;
  const H = format.height;
  const innerW = W - safe.left - safe.right;
  const innerH = H - safe.top - safe.bottom;
  const orientation = orientationOf(format);

  if (orientation === 'portrait') {
    const header: Rect = { x: safe.left, y: safe.top, w: innerW, h: Math.round(76 * s) };
    const title: Rect = { x: safe.left, y: header.y + header.h + Math.round(48 * s), w: innerW, h: Math.round(176 * s) };
    const footer: Rect = { x: safe.left, y: H - safe.bottom - Math.round(36 * s), w: innerW, h: Math.round(36 * s) };
    const contentTop = title.y + title.h + Math.round(40 * s);
    const content: Rect = { x: safe.left, y: contentTop, w: innerW, h: footer.y - Math.round(32 * s) - contentTop };
    return { width: W, height: H, scale: s, orientation, safe, header, title, content, footer };
  }

  const gap = Math.round(56 * s);
  const leftW = Math.round(innerW * 0.4);
  const header: Rect = { x: safe.left, y: safe.top, w: leftW, h: Math.round(64 * s) };
  const footer: Rect = { x: safe.left, y: H - safe.bottom - Math.round(34 * s), w: leftW, h: Math.round(34 * s) };
  const titleTop = header.y + header.h + Math.round(56 * s);
  const title: Rect = { x: safe.left, y: titleTop, w: leftW, h: footer.y - Math.round(24 * s) - titleTop };
  const content: Rect = { x: safe.left + leftW + gap, y: safe.top, w: innerW - leftW - gap, h: innerH };
  return { width: W, height: H, scale: s, orientation, safe, header, title, content, footer };
}

// ---------------------------------------------------------------------------- Raster

export interface TableLayoutOptions {
  /** Mindesthöhe einer Zeile; wird sie unterschritten, kommt eine weitere Spalte dazu */
  minRow: number;
  /** Höchsthöhe einer Zeile (wenige Einträge werden nicht riesig) */
  maxRow: number;
  /** Abstand zwischen Zeilen relativ zur Zeilenhöhe */
  gapRatio?: number;
  /** Abstand zwischen Spalten in px */
  colGap?: number;
  maxCols?: number;
  /** Mindestens so viele Spalten (z. B. 2 für die Startaufstellung) */
  minCols?: number;
  /**
   * 'column': Spalten von oben nach unten füllen (1–5 links, 6–10 rechts).
   * 'row': abwechselnd links/rechts (Startaufstellung: ungerade links, gerade rechts).
   */
  order?: 'column' | 'row';
  /** Rechte Spalte um eine halbe Zeile versetzt (Startaufstellung) */
  stagger?: boolean;
  /** Freien Platz unter der Tabelle verteilen */
  align?: 'start' | 'center';
}

export interface TableCell extends Rect {
  index: number;
  col: number;
  row: number;
}

export interface TableLayout {
  cols: number;
  rowsPerCol: number;
  rowH: number;
  gap: number;
  colW: number;
  /** false, wenn selbst mit der Höchstzahl an Spalten die Mindesthöhe nicht erreicht wird */
  fits: boolean;
  cells: TableCell[];
}

function rowHeightFor(height: number, rows: number, gapRatio: number, stagger: boolean): number {
  // n Zeilen + (n-1) Abstände (+ halbe Zeile Versatz)
  const units = rows + (rows - 1) * gapRatio + (stagger ? 0.5 * (1 + gapRatio) : 0);
  return units > 0 ? height / units : height;
}

/** Zeilen/Spalten für `count` Einträge in `box` verteilen. */
export function tableLayout(box: Rect, count: number, options: TableLayoutOptions): TableLayout {
  const gapRatio = options.gapRatio ?? 0.14;
  const colGap = options.colGap ?? 24;
  const maxCols = Math.max(1, options.maxCols ?? 2);
  const minCols = Math.min(maxCols, Math.max(1, options.minCols ?? 1));
  const order = options.order ?? 'column';
  const n = Math.max(0, count);

  let cols = minCols;
  let rowsPerCol = 1;
  let rowH = 0;
  let fits = false;
  for (let c = minCols; c <= maxCols; c++) {
    const rows = Math.max(1, Math.ceil(n / c));
    const h = rowHeightFor(box.h, rows, gapRatio, !!options.stagger && c > 1);
    cols = c;
    rowsPerCol = rows;
    rowH = h;
    fits = h >= options.minRow;
    if (fits) break;
  }
  rowH = Math.min(rowH, options.maxRow);
  const gap = rowH * gapRatio;
  const colW = (box.w - colGap * (cols - 1)) / cols;
  const pitch = rowH + gap;
  const staggerOffset = options.stagger && cols > 1 ? pitch / 2 : 0;
  const used = rowsPerCol * rowH + (rowsPerCol - 1) * gap + staggerOffset;
  const top = options.align === 'center' ? box.y + Math.max(0, (box.h - used) / 2) : box.y;

  const cells: TableCell[] = [];
  for (let i = 0; i < n; i++) {
    const col = order === 'row' ? i % cols : Math.floor(i / rowsPerCol);
    const row = order === 'row' ? Math.floor(i / cols) : i % rowsPerCol;
    cells.push({
      index: i,
      col,
      row,
      x: box.x + col * (colW + colGap),
      y: top + row * pitch + (col % 2 === 1 ? staggerOffset : 0),
      w: colW,
      h: rowH,
    });
  }
  return { cols, rowsPerCol, rowH, gap, colW, fits, cells };
}

// ---------------------------------------------------------------------------- Text

export type Measure = (text: string) => number;
export type MeasureAt = (text: string, size: number) => number;

export const ELLIPSIS = '…';

/** Kürzt auf `maxWidth` und hängt eine Ellipse an (nach Codepoints, ohne Leerzeichen vor der Ellipse). */
export function truncateText(text: string, maxWidth: number, measure: Measure, ellipsis = ELLIPSIS): string {
  if (measure(text) <= maxWidth) return text;
  if (measure(ellipsis) > maxWidth) return '';
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  // größtes n, bei dem Präfix + Ellipse passt
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = chars.slice(0, mid).join('').trimEnd() + ellipsis;
    if (measure(candidate) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join('').trimEnd() + ellipsis;
}

/**
 * Größte Schriftgröße zwischen `minSize` und `maxSize`, bei der der Text in `maxWidth` passt
 * (Textbreite wächst linear mit der Schriftgröße). Passt er selbst bei `minSize` nicht,
 * kommt `minSize` zurück – der Aufrufer kürzt dann mit `truncateText`.
 */
export function fitFontSize(text: string, maxWidth: number, maxSize: number, minSize: number, measureAt: MeasureAt): number {
  const w = measureAt(text, maxSize);
  if (w <= maxWidth || w <= 0) return maxSize;
  const size = Math.floor(((maxSize * maxWidth) / w) * 100) / 100;
  // Rundung/Kerning: nachmessen und notfalls einen Schritt kleiner
  let fitted = Math.max(minSize, size);
  while (fitted > minSize && measureAt(text, fitted) > maxWidth) fitted = Math.max(minSize, fitted - Math.max(0.5, fitted * 0.02));
  return fitted;
}

/** Zeilenumbruch an Leerzeichen; überzählige Zeilen werden in der letzten Zeile mit Ellipse gekürzt. */
export function wrapText(text: string, maxWidth: number, measure: Measure, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) {
      current = words.slice(i).join(' ');
      break;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines).map((line) => truncateText(line, maxWidth, measure));
}

export interface FittedBlock {
  size: number;
  lines: string[];
  /** true, wenn der Text vollständig (ohne Ellipse) passt */
  complete: boolean;
}

/**
 * Titel einpassen: zuerst einzeilig so groß wie möglich (mindestens `preferSize`), sonst auf bis zu
 * `maxLines` Zeilen umbrechen und die Größe verkleinern, bis alles passt; zuletzt kürzen.
 */
export function fitTextBlock(
  text: string,
  maxWidth: number,
  sizes: { max: number; min: number; prefer?: number },
  measureAt: MeasureAt,
  maxLines = 2,
): FittedBlock {
  const single = fitFontSize(text, maxWidth, sizes.max, sizes.min, measureAt);
  const singleFits = measureAt(text, single) <= maxWidth;
  const prefer = sizes.prefer ?? sizes.min;
  if (singleFits && (single >= prefer || maxLines === 1)) {
    return { size: single, lines: [text], complete: true };
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (maxLines > 1 && words.length > 1) {
    const normalized = words.join(' ');
    for (const size of sizeSteps(sizes.max, sizes.min)) {
      const measure = (t: string) => measureAt(t, size);
      const lines = wrapText(text, maxWidth, measure, maxLines);
      if (lines.join(' ') === normalized && lines.every((l) => measure(l) <= maxWidth)) {
        // umbrechen nur, wenn die Schrift dadurch größer wird als einzeilig
        if (singleFits && single >= size) break;
        return { size, lines, complete: true };
      }
    }
  }
  // ein langes Wort (z. B. „Konstrukteurswertung“): so groß wie einzeilig möglich
  if (singleFits) return { size: single, lines: [text], complete: true };
  const measure = (t: string) => measureAt(t, sizes.min);
  const lines = maxLines > 1 ? wrapText(text, maxWidth, measure, maxLines) : [truncateText(text, maxWidth, measure)];
  return { size: sizes.min, lines, complete: false };
}

/** Schriftgrößen von `max` in 5-%-Schritten bis `min` (einschließlich). */
export function sizeSteps(max: number, min: number): number[] {
  const out: number[] = [];
  for (let size = max; size > min; size = Math.floor(size * 0.95 * 100) / 100) out.push(size);
  out.push(min);
  return out;
}

/** Zeilenhöhe zu einer Schriftgröße (Titillium/Inter, großzügig für Umlaute und Unterlängen). */
export function lineHeight(size: number, factor = 1.12): number {
  return Math.round(size * factor);
}
