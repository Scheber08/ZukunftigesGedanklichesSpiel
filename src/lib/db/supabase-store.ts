/**
 * Store-Implementierung über supabase-js (PostgREST).
 * - `select` blättert automatisch (PostgREST liefert max. 1000 Zeilen pro Anfrage).
 * - Service-Client nur serverseitig; der öffentliche Client (anon key) sieht per RLS
 *   ausschließlich veröffentlichte Daten.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { StoreError, type Filter, type Insert, type Patch, type Store } from './store';
import { PRIMARY_KEYS, type Row, type TableName } from './types';

const PAGE_SIZE = 1000;

type Query = {
  eq(column: string, value: unknown): Query;
  is(column: string, value: null): Query;
  in(column: string, values: readonly unknown[]): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  range(from: number, to: number): Query;
  limit(n: number): Query;
};

function applyFilter(query: Query, filter?: Filter<Record<string, unknown>>): Query {
  let q = query;
  for (const [col, val] of Object.entries(filter?.eq ?? {})) {
    q = val === null ? q.is(col, null) : q.eq(col, val);
  }
  for (const [col, vals] of Object.entries(filter?.in ?? {})) {
    q = q.in(col, vals as unknown[]);
  }
  return q;
}

function fail(table: string, op: string, error: { message: string; code?: string; details?: unknown }): never {
  throw new StoreError(`${op} ${table}: ${error.message}`, error.code, error.details);
}

export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  readonly client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-client-info': 'liga-web' } },
    });
  }

  async select<T extends TableName>(table: T, filter?: Filter<Row<T>>): Promise<Row<T>[]> {
    const f = filter as Filter<Record<string, unknown>> | undefined;
    const orderColumn = f?.order?.column ?? (PRIMARY_KEYS[table][0] as string);
    const ascending = !f?.order?.desc;
    const out: Row<T>[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const want = f?.limit != null ? Math.min(PAGE_SIZE, f.limit - out.length) : PAGE_SIZE;
      if (want <= 0) break;
      let q = this.client.from(table).select('*') as unknown as Query;
      q = applyFilter(q, f).order(orderColumn, { ascending }).range(from, from + want - 1);
      const { data, error } = (await (q as unknown as PromiseLike<{ data: Row<T>[] | null; error: { message: string; code?: string } | null }>));
      if (error) fail(table, 'select', error);
      const rows = data ?? [];
      out.push(...rows);
      if (rows.length < want) break;
    }
    return out;
  }

  async insert<T extends TableName>(table: T, rows: Insert<T> | Insert<T>[]): Promise<Row<T>[]> {
    const { data, error } = await this.client.from(table).insert(rows as never).select('*');
    if (error) fail(table, 'insert', error);
    return (data ?? []) as Row<T>[];
  }

  async update<T extends TableName>(table: T, match: Partial<Row<T>>, patch: Patch<T>): Promise<Row<T>[]> {
    if (Object.keys(match).length === 0) throw new StoreError(`update ${table} ohne Bedingung verweigert`);
    let q = this.client.from(table).update(patch as never) as unknown as Query;
    q = applyFilter(q, { eq: match as Record<string, unknown> });
    const { data, error } = await (q as unknown as { select(c: string): PromiseLike<{ data: Row<T>[] | null; error: { message: string; code?: string } | null }> }).select('*');
    if (error) fail(table, 'update', error);
    return data ?? [];
  }

  async upsert<T extends TableName>(
    table: T,
    rows: Insert<T>[],
    onConflict?: ReadonlyArray<keyof Row<T> & string>,
  ): Promise<Row<T>[]> {
    if (rows.length === 0) return [];
    const conflict = (onConflict ?? PRIMARY_KEYS[table]).join(',');
    const { data, error } = await this.client
      .from(table)
      .upsert(rows as never, { onConflict: conflict })
      .select('*');
    if (error) fail(table, 'upsert', error);
    return (data ?? []) as Row<T>[];
  }

  async remove<T extends TableName>(table: T, match: Partial<Row<T>>): Promise<number> {
    if (Object.keys(match).length === 0) throw new StoreError(`delete ${table} ohne Bedingung verweigert`);
    let q = this.client.from(table).delete({ count: 'exact' }) as unknown as Query;
    q = applyFilter(q, { eq: match as Record<string, unknown> });
    const { error, count } = await (q as unknown as PromiseLike<{ error: { message: string; code?: string } | null; count: number | null }>);
    if (error) fail(table, 'delete', error);
    return count ?? 0;
  }

  async rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.client.rpc(fn, args ?? {});
    if (error) fail(fn, 'rpc', error);
    return data;
  }
}
