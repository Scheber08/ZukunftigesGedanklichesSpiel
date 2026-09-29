/**
 * Fehlende englische Übersetzungen erkennen (Plan §7.4): Ein Feld gilt als fehlend,
 * wenn die deutsche Fassung Text hat, die englische aber leer ist.
 */
import type { OpenPositionRow } from '~/lib/db/types';
import { localizedEffort } from '~/lib/content/text';

export type FieldLabels = ReadonlyArray<readonly [field: string, label: string]>;

function filled(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** Beschriftungen der Felder, deren EN-Fassung fehlt. */
export function missingEn(row: object, fields: FieldLabels): string[] {
  const rec = row as Record<string, unknown>;
  return fields.filter(([field]) => filled(rec[`${field}_de`]) && !filled(rec[`${field}_en`])).map(([, label]) => label);
}

export const NEWS_EN_FIELDS: FieldLabels = [
  ['title', 'Titel'],
  ['excerpt', 'Teaser'],
  ['body', 'Text'],
  ['cover_alt', 'Alt-Text'],
];

export const RULES_SECTION_EN_FIELDS: FieldLabels = [
  ['title', 'Titel'],
  ['body', 'Text'],
];

export const FAQ_EN_FIELDS: FieldLabels = [
  ['question', 'Frage'],
  ['answer', 'Antwort'],
];

export const STAFF_EN_FIELDS: FieldLabels = [['role', 'Rolle']];

export const POSITION_EN_FIELDS: FieldLabels = [
  ['title', 'Titel'],
  ['description', 'Beschreibung'],
];

export const PARTNER_EN_FIELDS: FieldLabels = [['text', 'Text']];

/**
 * Englische Anzeige des Zeitaufwands einer offenen Rolle: eigener EN-Text, sonst die
 * automatische Übersetzung gängiger Muster („ca. 1–2 h pro Woche“), sonst der deutsche
 * Text als Fallback.
 */
export function effortEnPreview(effort: string | null | undefined, effortEn: string | null | undefined): { text: string; source: 'manual' | 'auto' | 'fallback' | 'none' } {
  if (filled(effortEn)) return { text: effortEn!.trim(), source: 'manual' };
  if (!filled(effort)) return { text: '', source: 'none' };
  const auto = localizedEffort(effort!, 'en');
  return { text: auto.text, source: auto.fallback ? 'fallback' : 'auto' };
}

/**
 * Fehlende EN-Felder einer offenen Rolle. Der Zeitaufwand (Spalten `effort`/`effort_en`)
 * fehlt nur, wenn es keinen EN-Text gibt und die automatische Übersetzung nicht greift.
 */
export function missingPositionTranslations(
  row: Pick<OpenPositionRow, 'title_de' | 'title_en' | 'description_de' | 'description_en' | 'effort' | 'effort_en'>,
): string[] {
  const out = missingEn(row, POSITION_EN_FIELDS);
  if (effortEnPreview(row.effort, row.effort_en).source === 'fallback') out.push('Zeitaufwand');
  return out;
}

/** Anzahl der Einträge mit mindestens einer fehlenden Übersetzung. */
export function countMissing(rows: readonly object[], fields: FieldLabels): number {
  return rows.filter((r) => missingEn(r, fields).length > 0).length;
}
