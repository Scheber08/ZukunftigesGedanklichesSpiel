/**
 * Statische Prüfung der Migrationen (Plan §6, §10 Sicherheit): RLS standardmäßig „deny“ auch für
 * Tabellen aus späteren Migrationen, keine Schreib-Policies für Browser-Rollen, öffentliche Views
 * nur lesend, und Fahrer sind für Besucher nur über die View drivers_public lesbar.
 * Die echte Datenbank-Prüfung (Postgres + Seeds + RLS als anon) läuft in der CI (Job „database“).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(DIR, name), 'utf8').replace(/--[^\n]*/g, '') }));

const RLS_MIGRATION = files.findIndex((f) => /_rls\.sql$/.test(f.name));

const tablesIn = (sql: string) =>
  [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)].map((m) => m[1]!.toLowerCase());

describe('Migrationen', () => {
  it('sind nach Zeitstempel benannt und eindeutig sortierbar', () => {
    for (const f of files) expect(f.name, f.name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(new Set(files.map((f) => f.name.slice(0, 14))).size).toBe(files.length);
    expect(RLS_MIGRATION).toBeGreaterThan(0);
  });

  it('aktivieren und erzwingen RLS für jede Tabelle aus späteren Migrationen', () => {
    // Tabellen bis zur RLS-Migration erfasst deren Schleife über pg_tables.
    const missing: string[] = [];
    for (const f of files.slice(RLS_MIGRATION + 1)) {
      for (const table of tablesIn(f.sql)) {
        for (const mode of ['enable', 'force']) {
          const re = new RegExp(`alter\\s+table\\s+(?:only\\s+)?public\\.${table}\\s+${mode}\\s+row\\s+level\\s+security`, 'i');
          if (!re.test(f.sql)) missing.push(`${f.name}: ${table} (${mode})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('geben Browser-Rollen nie Schreib-Policies', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of f.sql.matchAll(/create\s+policy\s+"[^"]+"\s+on\s+public\.(\w+)([\s\S]*?);/gi)) {
        const body = m[2]!.toLowerCase();
        const command = /\bfor\s+(select|insert|update|delete|all)\b/.exec(body)?.[1] ?? 'all';
        const roles = /\bto\s+([\w\s,]+?)(?:\busing\b|\bwith\b|$)/.exec(body)?.[1] ?? 'public';
        if (command !== 'select' && /\b(anon|authenticated|public)\b/.test(roles)) offenders.push(`${f.name}: ${m[1]} (${command} → ${roles.trim()})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('öffentliche Views sind nur lesbar und schützen vor Leaks über Funktionen (security_barrier)', () => {
    const views: string[] = [];
    for (const f of files) {
      for (const m of f.sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+public\.(\w+)([\s\S]*?)\bas\b/gi)) {
        const view = m[1]!;
        views.push(view);
        expect(m[2], `${view}: security_barrier`).toMatch(/security_barrier\s*=\s*true/i);
        expect(f.sql, `${view}: revoke all from public`).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+public\\.${view}\\s+from\\s+public`, 'i'));
        const grants = [...f.sql.matchAll(new RegExp(`grant\\s+([\\w\\s,]+?)\\s+on\\s+public\\.${view}\\s+to`, 'gi'))].map((g) => g[1]!.trim().toLowerCase());
        expect(grants, `${view}: nur select`).toEqual(grants.map(() => 'select'));
      }
    }
    expect(views).toContain('drivers_public');
  });

  it('Fahrer sind für Besucher nur über drivers_public lesbar (ohne Eingabegerät, Links nur mit show_links)', () => {
    // Policies in Migrationsreihenfolge nachspielen
    const policies = new Set<string>();
    for (const f of files) {
      for (const m of f.sql.matchAll(/(create|drop)\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+public\.(\w+)/gi)) {
        const key = `${m[3]!.toLowerCase()}:${m[2]}`;
        if (m[1]!.toLowerCase() === 'create') policies.add(key);
        else policies.delete(key);
      }
    }
    expect([...policies].filter((p) => p.startsWith('drivers:'))).toEqual([]);

    const view = files.map((f) => f.sql).join('\n').match(/create\s+view\s+public\.drivers_public[\s\S]*?from\s+public\.drivers\b/i)?.[0] ?? '';
    expect(view).toMatch(/null::text\s+as\s+input_device/i);
    expect(view).toMatch(/case\s+when\s+d\.show_links\s+then\s+d\.twitch_url\s+end\s+as\s+twitch_url/i);
    expect(view).toMatch(/case\s+when\s+d\.show_links\s+then\s+d\.youtube_url\s+end\s+as\s+youtube_url/i);
  });

  it('slug_redirects: eindeutige Weiterleitung je Entität, Slug und Sprache', () => {
    const sql = files.map((f) => f.sql).join('\n');
    expect(sql).toMatch(/create\s+unique\s+index\s+\w+\s+on\s+public\.slug_redirects\s*\(\s*entity\s*,\s*old_slug\s*,\s*coalesce\(lang,\s*''\)\s*\)/i);
    expect(sql).toMatch(/check\s*\(\s*old_slug\s*<>\s*new_slug\s*\)/i);
    expect(sql).toMatch(/entity\s+in\s*\(\s*'driver',\s*'team',\s*'season',\s*'news'\s*\)/i);
  });
});
