/**
 * Konsistenz der Betriebs-Konfiguration: Workflows (gültiges YAML, Pflicht-Schritte,
 * keine Secrets im Log), Env-Vorlagen passend zum env-Schema in astro.config.mjs,
 * Supabase-CLI-Konfiguration und Lighthouse-Budget laut Plan §10.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

// yaml und smol-toml kommen als Unterabhängigkeiten mit (Astro-Language-Server bzw. Astro).
// Fehlen sie einmal, werden nur die Parser-Tests übersprungen.
type YamlModule = { parse: (s: string) => unknown };
type TomlModule = { parse: (s: string) => Record<string, unknown> };
const yaml = (await import('yaml').catch(() => null)) as YamlModule | null;
const toml = (await import('smol-toml').catch(() => null)) as TomlModule | null;

/** Alle Variablen aus env.schema in astro.config.mjs mit Zugriffsart. */
function envSchema(): Map<string, { context: string; access: string }> {
  const config = read('astro.config.mjs');
  const out = new Map<string, { context: string; access: string }>();
  for (const m of config.matchAll(/(\w+):\s*envField\.\w+\(\{([^}]*)\}\)/g)) {
    const context = /context:\s*'(\w+)'/.exec(m[2]!)?.[1] ?? '';
    const access = /access:\s*'(\w+)'/.exec(m[2]!)?.[1] ?? '';
    out.set(m[1]!, { context, access });
  }
  return out;
}

function envKeys(file: string): Set<string> {
  return new Set([...read(file).matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]!));
}

type Workflow = {
  on: Record<string, unknown>;
  concurrency?: { group: string; 'cancel-in-progress'?: boolean };
  permissions?: Record<string, string>;
  jobs: Record<string, { steps?: Array<{ run?: string; uses?: string; name?: string; if?: string }>; if?: string; needs?: string | string[]; 'continue-on-error'?: boolean }>;
};

const workflowFiles = readdirSync(join(ROOT, '.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f));

describe('Env-Vorlagen', () => {
  const schema = envSchema();

  it('findet das env-Schema', () => {
    expect(schema.size).toBeGreaterThanOrEqual(10);
    expect(schema.get('SUPABASE_SERVICE_ROLE_KEY')?.access).toBe('secret');
  });

  it('.env.example erklärt jede Variable aus astro.config.mjs', () => {
    const keys = envKeys('.env.example');
    expect([...schema.keys()].filter((k) => !keys.has(k))).toEqual([]);
  });

  it('.dev.vars.example enthält genau die geheimen Variablen', () => {
    const keys = envKeys('.dev.vars.example');
    const secrets = [...schema.entries()].filter(([, v]) => v.access === 'secret').map(([k]) => k);
    expect(secrets.filter((k) => !keys.has(k))).toEqual([]);
    const publicInDevVars = [...keys].filter((k) => schema.get(k)?.access === 'public');
    expect(publicInDevVars).toEqual([]);
  });

  it('enthält keine echten Werte für Geheimnisse', () => {
    for (const file of ['.env.example', '.dev.vars.example']) {
      for (const m of read(file).matchAll(/^([A-Z][A-Z0-9_]+)=(.*)$/gm)) {
        if (schema.get(m[1]!)?.access === 'secret') expect(m[2], `${file}: ${m[1]}`).toBe('');
      }
    }
  });
});

describe.skipIf(!yaml)('GitHub-Workflows', () => {
  const workflows = Object.fromEntries(workflowFiles.map((f) => [f, yaml!.parse(read('.github', 'workflows', f)) as Workflow]));

  it('sind gültiges YAML mit Jobs', () => {
    expect(Object.keys(workflows).sort()).toEqual(expect.arrayContaining(['backup.yml', 'ci.yml', 'deploy.yml']));
    for (const [file, wf] of Object.entries(workflows)) {
      expect(wf.jobs, file).toBeTypeOf('object');
      expect(Object.keys(wf.jobs).length, file).toBeGreaterThan(0);
    }
  });

  it('geben nie Secrets im Log aus', () => {
    for (const [file, wf] of Object.entries(workflows)) {
      for (const [job, def] of Object.entries(wf.jobs)) {
        for (const step of def.steps ?? []) {
          expect(step.run ?? '', `${file} › ${job} › ${step.name ?? step.uses}`).not.toMatch(/\$\{\{\s*secrets\./);
        }
      }
    }
  });

  it('CI prüft Lint, Tests, Seed, Build, Links, E2E, Lighthouse und Datenbank', () => {
    const ci = workflows['ci.yml']!;
    expect(Object.keys(ci.on)).toEqual(expect.arrayContaining(['push', 'pull_request']));
    const runs = Object.values(ci.jobs).flatMap((j) => (j.steps ?? []).map((s) => s.run ?? ''));
    // Der Link-Check ist Teil von test:e2e (tests/e2e/links.spec.ts gegen den echten Server)
    for (const cmd of ['npm run lint', 'npm test', 'npm run db:seed:check', 'npm run build', 'npm run test:e2e', '@lhci/cli', 'wrangler versions upload']) {
      expect(runs.some((r) => r.includes(cmd)), cmd).toBe(true);
    }
    expect(ci.jobs.lighthouse?.['continue-on-error']).toBe(true);
    expect(ci.jobs.preview?.if).toContain('pull_request');
  });

  it('Deploy: drei Auslöser, eine Warteschlange, Renntags-Freeze', () => {
    const deploy = workflows['deploy.yml']!;
    expect(Object.keys(deploy.on)).toEqual(expect.arrayContaining(['push', 'repository_dispatch', 'schedule']));
    expect((deploy.on.repository_dispatch as { types: string[] }).types).toEqual(['publish']);
    expect(deploy.concurrency?.group).toBeTruthy();
    expect(deploy.concurrency?.['cancel-in-progress']).toBe(false);
    const all = JSON.stringify(deploy);
    expect(all).toContain('RACEDAY_WEEKDAY');
    expect(all).toContain('wrangler deploy');
  });

  it('Backup: nächtlich, verschlüsselt, nach R2, mit Saison-Snapshots', () => {
    const backup = workflows['backup.yml']!;
    expect(backup.on.schedule).toBeTruthy();
    expect((backup.on.workflow_dispatch as { inputs: Record<string, unknown> }).inputs.snapshot_name).toBeTruthy();
    const all = JSON.stringify(backup);
    expect(all).toContain('age --encrypt');
    expect(all).toContain('r2.cloudflarestorage.com');
    expect(all).toContain('RETENTION_DAYS');
  });

  it('laufen mit minimalen Standardrechten', () => {
    for (const [file, wf] of Object.entries(workflows)) {
      expect(wf.permissions, file).toEqual({ contents: 'read' });
    }
  });

  it('Preview pro Pull Request nur mit Cloudflare-Zugang, sonst übersprungen', () => {
    const steps = workflows['ci.yml']!.jobs.preview?.steps ?? [];
    expect(steps[0]?.run).toContain('CLOUDFLARE_API_TOKEN');
    for (const step of steps.slice(1)) {
      expect(step.if, step.name ?? step.uses).toContain("steps.cf.outputs.enabled == 'true'");
    }
  });

  it('Datenbank-Job prüft die öffentliche Fahrer-Sicht und die Weiterleitungen', () => {
    const check = read('.github', 'scripts', 'db-check-demo.sql');
    expect(check).toContain('public.drivers_public');
    expect(check).toContain('public.slug_redirects');
    const ci = JSON.stringify(workflows['ci.yml']!.jobs.database);
    for (const script of ['db-supabase-stub.sql', 'db-check-base.sql', 'db-check-demo.sql', 'supabase/migrations/*.sql']) {
      expect(ci, script).toContain(script);
    }
  });

  it('Dependabot aktualisiert npm und GitHub Actions wöchentlich', () => {
    const dep = yaml!.parse(read('.github', 'dependabot.yml')) as { updates: Array<{ 'package-ecosystem': string; schedule: { interval: string } }> };
    expect(dep.updates.map((u) => u['package-ecosystem']).sort()).toEqual(['github-actions', 'npm']);
    expect(dep.updates.every((u) => u.schedule.interval === 'weekly')).toBe(true);
  });
});

describe.skipIf(!toml)('supabase/config.toml', () => {
  const config = toml ? toml.parse(read('supabase', 'config.toml')) : {};
  const auth = config.auth as { site_url: string; additional_redirect_urls: string[]; external: { discord: Record<string, unknown> } } | undefined;

  it('aktiviert den Discord-Login mit Zugangsdaten aus der Umgebung', () => {
    expect(auth?.external.discord.enabled).toBe(true);
    expect(auth?.external.discord.client_id).toBe('env(SUPABASE_AUTH_DISCORD_CLIENT_ID)');
    expect(auth?.external.discord.secret).toBe('env(SUPABASE_AUTH_DISCORD_SECRET)');
  });

  it('leitet nach dem Login in den Admin-Bereich zurück', () => {
    expect(auth?.site_url).toBe('http://localhost:4321');
    expect(auth?.additional_redirect_urls).toContain('http://localhost:4321/admin/auth/callback');
  });

  it('spielt seed.sql nach den Migrationen ein', () => {
    const db = config.db as { seed: { enabled: boolean; sql_paths: string[] } };
    expect(db.seed.enabled).toBe(true);
    expect(db.seed.sql_paths).toContain('./seed.sql');
    expect(existsSync(join(ROOT, 'supabase', 'seed.sql'))).toBe(true);
  });
});

describe('Playwright (E2E)', () => {
  const config = read('playwright.config.ts');

  it('startet keinen zweiten Dev-Server, sondern Build + Preview im Demo-Modus auf eigenem Port', () => {
    // Astro 7 erlaubt nur einen `astro dev` pro Projekt – ein laufender Dev-Server bleibt unberührt.
    expect(config).not.toMatch(/npx astro dev|astro dev --port/);
    expect(config).toMatch(/npx astro build \$\{config\} && \$\{preview\}/);
    expect(config).toMatch(/npx astro preview \$\{config\} --port \$\{PORT\} --host 127\.0\.0\.1 --ignore-lock/);
    expect(config).toMatch(/E2E_PORT \?\? 4322/);
    expect(config).toMatch(/env: \{ DEMO_MODE: 'true'/);
  });

  it('E2E-Build nutzt die normale Konfiguration mit eigenem Vite-Cache', () => {
    const e2e = read('tests', 'e2e', 'astro.config.e2e.mjs');
    expect(config).toContain("'--config tests/e2e/astro.config.e2e.mjs'");
    expect(e2e).toContain("from '../../astro.config.mjs'");
    expect(e2e).toContain("cacheDir: 'node_modules/.vite-e2e'");
  });

  it('npm-Skripte für Tests und Seeds sind vorhanden', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['test']).toBe('vitest run');
    expect(scripts['test:e2e']).toBe('playwright test');
    expect(scripts['db:seed:check']).toContain('--check');
    expect(scripts['test:links']).toBe('playwright test tests/e2e/links.spec.ts');
    expect(existsSync(join(ROOT, 'tests', 'e2e', 'links.spec.ts'))).toBe(true);
  });
});

describe('Lighthouse-Budget (Plan §10)', () => {
  const lhci = JSON.parse(read('lighthouserc.json')) as {
    ci: { collect: { staticDistDir: string; url: string[] }; assert: { assertions: Record<string, [string, Record<string, number>]> } };
  };
  const a = lhci.ci.assert.assertions;

  it('prüft die Zielwerte aus dem Plan', () => {
    expect(a['resource-summary:script:size']?.[1].maxNumericValue).toBe(50 * 1024);
    expect(a['resource-summary:total:size']?.[1].maxNumericValue).toBe(300 * 1024);
    expect(a['largest-contentful-paint']?.[1].maxNumericValue).toBe(2000);
    expect(a['cumulative-layout-shift']?.[1].maxNumericValue).toBe(0.05);
  });

  it('lädt vor der Einwilligung nichts von Dritten', () => {
    expect(a['resource-summary:third-party:count']).toEqual(['error', { maxNumericValue: 0 }]);
  });

  it('testet gebaute Seiten aus dist/client', () => {
    expect(lhci.ci.collect.staticDistDir).toBe('./dist/client');
    expect(lhci.ci.collect.url.length).toBeGreaterThanOrEqual(3);
  });
});
