/**
 * Audit-Log lesbar machen (Plan §5 „Audit-Log“): Vorher/Nachher je Feld.
 */

export interface AuditChange {
  field: string;
  before: string;
  after: string;
}

const MAX_VALUE_LENGTH = 160;

/** Wert kompakt als Text (Objekte als JSON, lange Werte gekürzt). */
export function formatAuditValue(value: unknown): string {
  if (value === undefined) return '–';
  if (value === null) return 'leer';
  if (typeof value === 'boolean') return value ? 'ja' : 'nein';
  if (typeof value === 'number') return String(value);
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  text = text.replace(/\s+/g, ' ').trim();
  if (text === '') return '„“';
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text;
}

/**
 * `diff` aus audit() → Liste geänderter Felder. Bei Anlegen/Löschen enthält eine Seite
 * das ganze Objekt, die andere ist null.
 */
export function auditChanges(diff: unknown): AuditChange[] {
  if (diff == null || typeof diff !== 'object') return [];
  const d = diff as { before?: unknown; after?: unknown };
  const before = d.before && typeof d.before === 'object' ? (d.before as Record<string, unknown>) : null;
  const after = d.after && typeof d.after === 'object' ? (d.after as Record<string, unknown>) : null;
  if (!before && !after) return [];
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter(
    (k) => k !== 'created_at' && k !== 'updated_at',
  );
  return keys.map((field) => ({
    field,
    before: before ? formatAuditValue(before[field]) : '–',
    after: after ? formatAuditValue(after[field]) : '–',
  }));
}
