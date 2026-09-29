/**
 * Audit-Log (Plan §5): Wer hat was wann geändert, mit Vorher/Nachher.
 */
import type { Store } from '../db/store';
import type { TableName } from '../db/types';
import type { Staff } from './auth';

export type AuditAction = 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'finalize' | 'correct' | 'login' | 'import';

/** Nur geänderte Felder speichern, damit das Log lesbar bleibt. */
export function diffRows(before: object | null | undefined, after: object | null | undefined): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  if (!before || !after) return { before: (before as Record<string, unknown>) ?? null, after: (after as Record<string, unknown>) ?? null };
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const outB: Record<string, unknown> = {};
  const outA: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (key === 'updated_at' || key === 'created_at') continue;
    if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) {
      outB[key] = b[key];
      outA[key] = a[key];
    }
  }
  return { before: outB, after: outA };
}

export async function audit(
  store: Store,
  staff: Pick<Staff, 'userId' | 'name'> | null,
  action: AuditAction,
  entity: TableName | string,
  entityId: string | number | null,
  before?: object | null,
  after?: object | null,
): Promise<void> {
  try {
    await store.insert('audit_log', {
      actor_id: staff?.userId ?? null,
      actor_name: staff?.name ?? 'System',
      action,
      entity,
      entity_id: entityId == null ? null : String(entityId),
      diff: before !== undefined || after !== undefined ? diffRows(before, after) : null,
    });
  } catch (err) {
    // Protokollfehler dürfen die eigentliche Änderung nicht verhindern
    console.error('Audit-Log fehlgeschlagen', err);
  }
}
