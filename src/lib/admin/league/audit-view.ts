/**
 * Audit-Log lesbar machen (Plan §5 „Audit-Log“): Vorher/Nachher je Feld, Filter nach
 * Entität, Person, Aktion und Zeitraum. Reine Funktionen (getestet).
 */
import type { AuditLogRow } from '~/lib/db/types';
import { LEAGUE_TIMEZONE, zonedLocalToUtc } from '~/lib/domain/time';
import { isIsoDate } from './forms';

export interface AuditChange {
  field: string;
  before: string;
  after: string;
}

const MAX_VALUE_LENGTH = 160;
/** Verschachtelte Objekte (z. B. Einstellungen) bis zu dieser Tiefe in Einzelfelder zerlegen. */
const MAX_DEPTH = 2;

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

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length > 0;

/** { a: { b: 1 } } → { "a.b": 1 } (nur nicht-leere Objekte, Arrays bleiben ganz). */
function flatten(obj: Record<string, unknown>, prefix = '', depth = 0, out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v) && depth < MAX_DEPTH) flatten(v, key, depth + 1, out);
    else out[key] = v;
  }
  return out;
}

/**
 * `diff` aus audit() → Liste geänderter Felder. Bei Anlegen/Löschen enthält eine Seite
 * das ganze Objekt, die andere ist null. Verschachtelte Werte (Einstellungen) werden in
 * Einzelfelder zerlegt, unveränderte Unterfelder weggelassen.
 */
export function auditChanges(diff: unknown): AuditChange[] {
  if (diff == null || typeof diff !== 'object') return [];
  const d = diff as { before?: unknown; after?: unknown };
  const before = d.before && typeof d.before === 'object' ? flatten(d.before as Record<string, unknown>) : null;
  const after = d.after && typeof d.after === 'object' ? flatten(d.after as Record<string, unknown>) : null;
  if (!before && !after) return [];
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter(
    (k) => k !== 'created_at' && k !== 'updated_at',
  );
  return keys
    .filter((k) => !(before && after && JSON.stringify(before[k]) === JSON.stringify(after[k])))
    .map((field) => ({
      field,
      before: before ? formatAuditValue(before[field]) : '–',
      after: after ? formatAuditValue(after[field]) : '–',
    }));
}

// ---------------------------------------------------------------------------- Filter

export interface AuditFilter {
  entity: string | null;
  entityId: string | null;
  action: string | null;
  /** actor_id oder – bei System-Einträgen ohne ID – der Name */
  actor: string | null;
  /** Liga-Datum JJJJ-MM-TT (Europe/Berlin), jeweils einschließlich */
  from: string | null;
  to: string | null;
}

export const EMPTY_AUDIT_FILTER: AuditFilter = { entity: null, entityId: null, action: null, actor: null, from: null, to: null };

/** Query-Parameter → geprüfter Filter; Unsinniges wird ignoriert, Fehler als Text. */
export function parseAuditFilter(params: URLSearchParams): { filter: AuditFilter; errors: string[] } {
  const errors: string[] = [];
  const get = (k: string) => (params.get(k) ?? '').trim();
  const entity = get('entitaet');
  const entityId = get('id');
  const action = get('aktion');
  const actor = get('person');
  let from: string | null = get('von') || null;
  let to: string | null = get('bis') || null;
  if (from && !isIsoDate(from)) {
    errors.push('„Von“ ist kein gültiges Datum.');
    from = null;
  }
  if (to && !isIsoDate(to)) {
    errors.push('„Bis“ ist kein gültiges Datum.');
    to = null;
  }
  if (from && to && to < from) {
    errors.push('„Bis“ liegt vor „Von“ – die Daten wurden getauscht.');
    [from, to] = [to, from];
  }
  return {
    filter: {
      entity: /^[a-z_]{1,40}$/.test(entity) ? entity : null,
      entityId: /^[\w,.-]{1,60}$/.test(entityId) ? entityId : null,
      action: /^[a-z_]{1,20}$/.test(action) ? action : null,
      actor: actor !== '' && actor.length <= 100 ? actor : null,
      from,
      to,
    },
    errors,
  };
}

/** Schlüssel einer Person im Filter: ID, sonst Name (z. B. „System“). */
export function actorKey(row: Pick<AuditLogRow, 'actor_id' | 'actor_name'>): string {
  return row.actor_id ?? row.actor_name ?? 'System';
}

function dayStartUtc(date: string, timeZone: string): number {
  return zonedLocalToUtc(`${date}T00:00:00`, timeZone).getTime();
}

function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Einträge filtern, neueste zuerst. */
export function filterAudit<T extends AuditLogRow>(rows: readonly T[], filter: AuditFilter, timeZone = LEAGUE_TIMEZONE): T[] {
  const fromMs = filter.from ? dayStartUtc(filter.from, timeZone) : null;
  const toMs = filter.to ? dayStartUtc(nextDay(filter.to), timeZone) : null;
  return rows
    .filter((r) => !filter.entity || r.entity === filter.entity)
    .filter((r) => !filter.entityId || r.entity_id === filter.entityId)
    .filter((r) => !filter.action || r.action === filter.action)
    .filter((r) => !filter.actor || actorKey(r) === filter.actor)
    .filter((r) => {
      const t = new Date(r.at).getTime();
      return (fromMs == null || t >= fromMs) && (toMs == null || t < toMs);
    })
    .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id);
}

/** Personen für das Filter-Auswahlfeld (alphabetisch). */
export function auditActors(rows: ReadonlyArray<Pick<AuditLogRow, 'actor_id' | 'actor_name'>>): Array<{ key: string; name: string }> {
  const map = new Map<string, string>();
  for (const r of rows) {
    const key = actorKey(r);
    if (!map.has(key)) map.set(key, r.actor_name ?? 'System');
  }
  return [...map.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Einträge, die inzwischen gelöscht sind („Bereich:ID“) – für sie gibt es keine
 * Detailseite mehr, das Log verlinkt sie deshalb nicht.
 */
export function deletedEntries(rows: ReadonlyArray<Pick<AuditLogRow, 'action' | 'entity' | 'entity_id'>>): Set<string> {
  return new Set(rows.filter((r) => r.action === 'delete' && r.entity_id != null).map((r) => `${r.entity}:${r.entity_id}`));
}

/** Filter → Query-String (für Links, z. B. Paginierung oder „Verlauf dieses Eintrags“). */
export function auditQuery(filter: Partial<AuditFilter>): string {
  const u = new URLSearchParams();
  if (filter.entity) u.set('entitaet', filter.entity);
  if (filter.entityId) u.set('id', filter.entityId);
  if (filter.action) u.set('aktion', filter.action);
  if (filter.actor) u.set('person', filter.actor);
  if (filter.from) u.set('von', filter.from);
  if (filter.to) u.set('bis', filter.to);
  const qs = u.toString();
  return qs ? `?${qs}` : '';
}
