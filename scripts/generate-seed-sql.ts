/**
 * Erzeugt die SQL-Seeds aus den TypeScript-Datensätzen (eine Datenquelle für Demo-Modus und DB):
 *
 *   supabase/seed.sql  ← baseDataset()  (Teams, Strecken, Punkteschemata, Regelwerk v1, FAQ,
 *                                        offene Rollen, Einstellungen) – für jede frische Datenbank
 *   supabase/demo.sql  ← demoDataset()  (nur mit --demo: fiktive Saisons, Fahrer, Ergebnisse,
 *                                        Urteile, News) – für eine Staging-/Beta-Datenbank (Plan M7)
 *
 * Aufruf (Node 24, TypeScript wird nativ ausgeführt):
 *   npm run db:seed:generate                      → seed.sql
 *   npm run db:seed:generate -- --demo            → seed.sql + demo.sql
 *   npm run db:seed:generate -- --demo --now=2026-11-01T12:00:00Z
 *                                                 → Demo-Termine relativ zu diesem Zeitpunkt
 *   npm run db:seed:generate -- --check           → nur prüfen, ob seed.sql aktuell ist (CI)
 *
 * Die Spaltentypen (jsonb, Arrays) werden aus supabase/migrations/*.sql gelesen. Spalten, die es
 * in der Datenbank nicht gibt, brechen die Erzeugung ab – so fällt ein Auseinanderlaufen von
 * src/lib/db/types.ts und den Migrationen sofort auf.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type AnyRow = Record<string, unknown>;
export type SeedDataset = Record<string, ReadonlyArray<AnyRow> | undefined>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------- Schema aus den Migrationen

export interface ColumnInfo {
  /** Postgres-Typ in Kleinbuchstaben, z. B. "jsonb", "integer[]", "timestamptz" */
  type: string;
}
export type Schema = Map<string, Map<string, ColumnInfo>>;

const CONSTRAINT_WORDS = new Set(['primary', 'unique', 'check', 'constraint', 'foreign', 'exclude']);

/** Liest `create table public.x (…)` und `alter table public.x add column …` aus SQL-Texten. */
export function parseSchema(sqlFiles: readonly string[]): Schema {
  const schema: Schema = new Map();
  for (const raw of sqlFiles) {
    // Kommentare entfernen (Zeilenkommentare reichen für unsere Migrationen)
    const sql = raw.replace(/--[^\n]*/g, '');
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(sql))) {
      const table = m[1]!.toLowerCase();
      const body = extractParenBody(sql, createRe.lastIndex - 1);
      const columns = schema.get(table) ?? new Map<string, ColumnInfo>();
      for (const part of splitTopLevel(body)) {
        const col = parseColumn(part);
        if (col) columns.set(col.name, { type: col.type });
      }
      schema.set(table, columns);
    }
    const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?(\w+)\s+([\s\S]*?);/gi;
    while ((m = alterRe.exec(sql))) {
      const table = m[1]!.toLowerCase();
      const columns = schema.get(table);
      if (!columns) continue;
      for (const action of splitTopLevel(m[2]!)) {
        const add = /^add\s+column\s+(?:if\s+not\s+exists\s+)?([\s\S]+)$/i.exec(action.trim());
        if (add) {
          const col = parseColumn(add[1]!);
          if (col) columns.set(col.name, { type: col.type });
        }
        const drop = /^drop\s+column\s+(?:if\s+exists\s+)?(\w+)/i.exec(action.trim());
        if (drop) columns.delete(drop[1]!.toLowerCase());
      }
    }
  }
  return schema;
}

function extractParenBody(sql: string, openIndex: number): string {
  let depth = 0;
  let inString = false;
  for (let i = openIndex; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") inString = !inString;
    if (inString) continue;
    if (c === '(') depth++;
    if (c === ')') {
      depth--;
      if (depth === 0) return sql.slice(openIndex + 1, i);
    }
  }
  throw new Error('Unvollständige create table-Anweisung in einer Migration');
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (const c of body) {
    if (c === "'") inString = !inString;
    if (!inString) {
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
    }
    current += c;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseColumn(definition: string): { name: string; type: string } | null {
  const m = /^\s*(\w+)\s+([a-z][a-z0-9_ ]*?(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?(?:\s*\[\])?)(?=\s|$)/i.exec(definition);
  if (!m) return null;
  const name = m[1]!.toLowerCase();
  if (CONSTRAINT_WORDS.has(name)) return null;
  // Mehrwortige Typen wie "timestamp with time zone" auf die Kurzform bringen
  let type = m[2]!.toLowerCase().replace(/\s+/g, ' ').trim();
  const rest = definition.slice(m.index + m[0].length).trimStart().toLowerCase();
  if (type === 'timestamp' && rest.startsWith('with time zone')) type = 'timestamptz';
  if (type === 'double' && rest.startsWith('precision')) type = 'double precision';
  if (type === 'character' && rest.startsWith('varying')) type = 'varchar';
  return { name, type: type.replace(/\s+\[\]$/, '[]').replace(/\s+\(/, '(') };
}

export function loadSchema(dir = join(ROOT, 'supabase', 'migrations')): Schema {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'));
  return parseSchema(files);
}

// ---------------------------------------------------------------------------- SQL-Literale

const QUOTE = "'";

/** Text-Literal mit verdoppelten Hochkommas (standard_conforming_strings = on). */
export function sqlString(value: string): string {
  if (value.includes(String.fromCharCode(0))) throw new Error('NUL-Zeichen können nicht in Postgres-Text gespeichert werden');
  return QUOTE + value.replaceAll(QUOTE, QUOTE + QUOTE) + QUOTE;
}

/** Element eines Array-Literals ('{…}'): Zahlen direkt, Text in doppelten Anführungszeichen. */
function arrayElement(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Ungültige Zahl im Array: ${value}`);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    const BACKSLASH = String.fromCharCode(92);
    return `"${value.replaceAll(BACKSLASH, BACKSLASH + BACKSLASH).replaceAll('"', BACKSLASH + '"')}"`;
  }
  throw new Error(`Nicht unterstützter Array-Wert: ${JSON.stringify(value)}`);
}

/**
 * Wert → SQL-Literal passend zum Spaltentyp.
 * - jsonb/json: immer JSON (auch `null` → 'null'::jsonb, weil settings.value NOT NULL ist)
 * - Arrays: '{1,2}' mit explizitem Cast
 * - sonst: NULL, true/false, Zahl oder Text-Literal (Postgres castet in den Spaltentyp)
 */
export function sqlValue(value: unknown, type: string): string {
  if (type === 'jsonb' || type === 'json') {
    return `${sqlString(JSON.stringify(value ?? null))}::${type}`;
  }
  if (value === null || value === undefined) return 'NULL';
  if (type.endsWith('[]')) {
    if (!Array.isArray(value)) throw new Error(`Array erwartet für Typ ${type}, erhalten: ${JSON.stringify(value)}`);
    return `${sqlString(`{${value.map(arrayElement).join(',')}}`)}::${type}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Ungültige Zahl: ${value}`);
    return String(value);
  }
  if (typeof value === 'string') return sqlString(value);
  if (value instanceof Date) return sqlString(value.toISOString());
  throw new Error(`Objekt-Wert für Nicht-JSON-Spalte (Typ ${type}): ${JSON.stringify(value)}`);
}

// ---------------------------------------------------------------------------- INSERT-Erzeugung

/** Einfüge-Reihenfolge nach Fremdschlüsseln (Eltern vor Kindern). */
export const TABLE_ORDER = [
  'rules_versions',
  'rules_sections',
  'points_schemes',
  'teams',
  'tracks',
  'seasons',
  'season_teams',
  'rounds',
  'sessions',
  'round_corrections',
  'drivers',
  'driver_private',
  'driver_numbers',
  'seats',
  'round_entries',
  'round_absences',
  'results',
  'standings_snapshots',
  'awards',
  'incidents',
  'decisions',
  'news',
  'faq_items',
  'staff_members',
  'open_positions',
  'partners',
  'settings',
  'registrations',
  'contact_messages',
  'staff_accounts',
  'audit_log',
  'rate_limit_events',
  'import_batches',
] as const;

/** Primärschlüssel für ON CONFLICT (muss zu src/lib/db/types.ts → PRIMARY_KEYS passen). */
const CONFLICT_KEYS: Record<string, string[]> = {
  season_teams: ['season_id', 'team_id'],
  round_absences: ['round_id', 'driver_id'],
  driver_private: ['driver_id'],
  settings: ['key'],
  staff_accounts: ['user_id'],
};

export type ConflictMode = 'nothing' | 'update';

const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at']);
const ROWS_PER_STATEMENT = 50;

export function insertStatements(table: string, rows: ReadonlyArray<AnyRow>, schema: Schema, conflict: ConflictMode): string[] {
  if (rows.length === 0) return [];
  const columns = schema.get(table);
  if (!columns) throw new Error(`Tabelle „${table}“ gibt es in den Migrationen nicht`);
  const present = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (TIMESTAMP_COLUMNS.has(key)) continue;
      if (!columns.has(key)) throw new Error(`Spalte „${table}.${key}“ fehlt in den Migrationen`);
      present.add(key);
    }
  }
  // Spalten in der Reihenfolge der Tabellendefinition (lesbarer, stabile Diffs)
  const names = [...columns.keys()].filter((c) => present.has(c));
  const keys = CONFLICT_KEYS[table] ?? ['id'];
  let onConflict = ' on conflict do nothing';
  if (conflict === 'update') {
    const updatable = names.filter((n) => !keys.includes(n));
    onConflict =
      updatable.length > 0
        ? ` on conflict (${keys.join(', ')}) do update set ${updatable.map((n) => `${n} = excluded.${n}`).join(', ')}`
        : ` on conflict (${keys.join(', ')}) do nothing`;
  }
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_STATEMENT) {
    const chunk = rows.slice(i, i + ROWS_PER_STATEMENT);
    const values = chunk.map(
      (row) =>
        `  (${names.map((n) => (n in row ? sqlValue(row[n], columns.get(n)!.type) : 'DEFAULT')).join(', ')})`,
    );
    out.push(`insert into public.${table} (${names.join(', ')}) values\n${values.join(',\n')}\n${onConflict.trim()};`);
  }
  return out;
}

/** Identitäts-Sequenz hinter die höchste vergebene ID setzen (sonst kollidiert das nächste Insert). */
export function setvalStatement(table: string): string {
  return `select setval(pg_get_serial_sequence('public.${table}', 'id'), coalesce(max(id), 0) + 1, false) from public.${table};`;
}

export interface BuildOptions {
  title: string;
  description: string[];
  conflict: ConflictMode;
}

export function buildSeedSql(dataset: SeedDataset, schema: Schema, options: BuildOptions): string {
  const unknown = Object.keys(dataset).filter((t) => !(TABLE_ORDER as readonly string[]).includes(t));
  if (unknown.length > 0) throw new Error(`Unbekannte Tabellen im Datensatz: ${unknown.join(', ')}`);

  const lines: string[] = [
    '-- =============================================================================',
    `-- ${options.title}`,
    '--',
    '-- AUTOMATISCH ERZEUGT von scripts/generate-seed-sql.ts – nicht von Hand bearbeiten.',
    '-- Neu erzeugen: npm run db:seed:generate' + (options.conflict === 'update' ? ' -- --demo' : ''),
    '--',
    ...options.description.map((d) => (d ? `-- ${d}` : '--')),
    '-- =============================================================================',
    '',
  ];
  const withIdentity: string[] = [];
  for (const table of TABLE_ORDER) {
    const rows = dataset[table];
    if (!rows || rows.length === 0) continue;
    lines.push(`-- ${table} (${rows.length})`);
    lines.push(...insertStatements(table, rows, schema, options.conflict));
    lines.push('');
    if (schema.get(table)?.has('id') && !CONFLICT_KEYS[table]) withIdentity.push(table);
  }
  if (withIdentity.length > 0) {
    lines.push('-- Identitäts-Sequenzen hinter die höchsten IDs setzen');
    lines.push(...withIdentity.map(setvalStatement));
    lines.push('');
  }
  return lines.join('\n');
}

/** Nur Zeilen, die im Basisdatensatz fehlen oder sich von ihm unterscheiden (für demo.sql). */
export function diffDataset(full: SeedDataset, base: SeedDataset): SeedDataset {
  const out: SeedDataset = {};
  const pk = (table: string, row: AnyRow) => (CONFLICT_KEYS[table] ?? ['id']).map((k) => JSON.stringify(row[k])).join('|');
  for (const [table, rows] of Object.entries(full)) {
    if (!rows) continue;
    const baseRows = new Map((base[table] ?? []).map((r) => [pk(table, r), JSON.stringify(r)]));
    const changed = rows.filter((r) => baseRows.get(pk(table, r)) !== JSON.stringify(r));
    if (changed.length > 0) out[table] = changed;
  }
  return out;
}

/** Inhalt von supabase/seed.sql (der Unit-Test prüft damit, ob die Datei aktuell ist). */
export function buildBaseSeed(base: SeedDataset, schema: Schema): string {
  return buildSeedSql(base, schema, {
    title: 'Basisdaten für eine frische Datenbank (Teams, Strecken, Punkteschemata, Regelwerk, FAQ, Einstellungen)',
    description: [
      'Einspielen NACH den Migrationen (supabase/migrations). Lokal: `supabase db reset`.',
      'Produktion: Inhalt im Supabase-SQL-Editor ausführen (siehe docs/SETUP.md).',
      'Bestehende Zeilen werden nie überschrieben (on conflict do nothing) – erneutes Ausführen ist gefahrlos.',
    ],
    conflict: 'nothing',
  });
}

/** Inhalt von supabase/demo.sql: nur die Zeilen, die über die Basisdaten hinausgehen. */
export function buildDemoSeed(full: SeedDataset, base: SeedDataset, schema: Schema, now: Date): string {
  return buildSeedSql(diffDataset(full, base), schema, {
    title: 'Demo-Liga für Staging/Beta (fiktive Fahrer, 2 Saisons, Ergebnisse, Urteile, News)',
    description: [
      `Termine relativ zu ${now.toISOString()} erzeugt (Option --now=…).`,
      'NUR für eine Test-Datenbank! Einspielen NACH seed.sql. Vorhandene Demo-Zeilen werden aktualisiert.',
      'Alle Gamertags sind erfunden. Nicht in der Produktionsdatenbank verwenden.',
    ],
    conflict: 'update',
  });
}

// ---------------------------------------------------------------------------- Kommandozeile

/**
 * Die Quelldateien in src/ importieren relativ und ohne Dateiendung (Vite-Stil).
 * Node braucht die Endung – dieser Hook ergänzt ".ts" bzw. "/index.ts".
 */
function registerTsResolver(): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../');
      if (relative && !/\.(?:[cm]?[jt]s|json)$/.test(specifier)) {
        for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
          try {
            return nextResolve(candidate, context);
          } catch {
            // nächste Variante probieren
          }
        }
      }
      return nextResolve(specifier, context);
    },
  });
}

async function main(argv: string[]): Promise<void> {
  const demo = argv.includes('--demo');
  const check = argv.includes('--check');
  const nowArg = argv.find((a) => a.startsWith('--now='))?.slice('--now='.length);
  const now = nowArg ? new Date(nowArg) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Ungültiges Datum für --now: ${nowArg}`);

  registerTsResolver();
  const { baseDataset } = await import('../src/lib/seed/base');
  const schema = loadSchema();
  const base = baseDataset() as SeedDataset;

  const seedSql = buildBaseSeed(base, schema);
  const seedPath = join(ROOT, 'supabase', 'seed.sql');

  if (check) {
    const current = readFileSync(seedPath, 'utf8').replace(/\r\n/g, '\n');
    if (current !== seedSql) {
      console.error('supabase/seed.sql ist veraltet – bitte `npm run db:seed:generate` ausführen und committen.');
      process.exitCode = 1;
      return;
    }
    console.log('supabase/seed.sql ist aktuell.');
    return;
  }

  writeFileSync(seedPath, seedSql);
  console.log(`supabase/seed.sql geschrieben (${(seedSql.length / 1024).toFixed(1)} KB)`);

  if (demo) {
    const { demoDataset } = await import('../src/lib/seed/demo');
    const full = demoDataset(now) as SeedDataset;
    const demoSql = buildDemoSeed(full, base, schema, now);
    writeFileSync(join(ROOT, 'supabase', 'demo.sql'), demoSql);
    console.log(`supabase/demo.sql geschrieben (${(demoSql.length / 1024).toFixed(1)} KB)`);
  }
}

const invokedDirectly = process.argv[1] != null && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
