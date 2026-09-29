/**
 * Fehlende englische Übersetzungen erkennen (Plan §7.4): Ein Feld gilt als fehlend,
 * wenn die deutsche Fassung Text hat, die englische aber leer ist.
 */

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

/** Anzahl der Einträge mit mindestens einer fehlenden Übersetzung. */
export function countMissing(rows: readonly object[], fields: FieldLabels): number {
  return rows.filter((r) => missingEn(r, fields).length > 0).length;
}
