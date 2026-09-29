/**
 * Minimale Datenzugriffs-Schnittstelle für Supabase (Produktion) und einen
 * In-Memory-Store (Demo-Modus/Entwicklung/E2E-Tests ohne Datenbank).
 *
 * Bewusst klein gehalten: Die Liga hat wenig Daten, die Logik steckt in reinen
 * TypeScript-Funktionen (src/lib/domain) statt in SQL.
 */

import type { Row, TableName } from './types';

export type Insert<T extends TableName> = Partial<Row<T>>;
export type Patch<T extends TableName> = Partial<Row<T>>;

export interface Filter<T> {
  /** Spalte = Wert (null → IS NULL) */
  eq?: Partial<T>;
  /** Spalte IN (…) */
  in?: { [K in keyof T]?: ReadonlyArray<T[K]> };
  /** Sortierung (aufsteigend, sonst `desc: true`) */
  order?: { column: keyof T & string; desc?: boolean };
  limit?: number;
}

export interface Store {
  readonly kind: 'supabase' | 'memory';
  select<T extends TableName>(table: T, filter?: Filter<Row<T>>): Promise<Row<T>[]>;
  insert<T extends TableName>(table: T, rows: Insert<T> | Insert<T>[]): Promise<Row<T>[]>;
  update<T extends TableName>(table: T, match: Partial<Row<T>>, patch: Patch<T>): Promise<Row<T>[]>;
  /** Insert oder Update anhand der Konfliktspalten (Standard: Primärschlüssel). */
  upsert<T extends TableName>(table: T, rows: Insert<T>[], onConflict?: ReadonlyArray<keyof Row<T> & string>): Promise<Row<T>[]>;
  remove<T extends TableName>(table: T, match: Partial<Row<T>>): Promise<number>;
  /** Postgres-Funktion aufrufen (nur Service-Store). */
  rpc(fn: string, args?: Record<string, unknown>): Promise<unknown>;
}

export async function selectOne<T extends TableName>(store: Store, table: T, eq: Partial<Row<T>>): Promise<Row<T> | null> {
  const rows = await store.select(table, { eq, limit: 1 });
  return rows[0] ?? null;
}

export async function insertOne<T extends TableName>(store: Store, table: T, row: Insert<T>): Promise<Row<T>> {
  const [created] = await store.insert(table, row);
  if (!created) throw new Error(`Insert in ${table} lieferte keine Zeile`);
  return created;
}

export class StoreError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

/** Postgres-Fehlercode für Unique-Verletzungen. */
export const UNIQUE_VIOLATION = '23505';
