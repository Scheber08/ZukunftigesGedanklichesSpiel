/**
 * Renntags-Freeze (Plan §7.6) in .github/workflows/deploy.yml: Das Entscheidungs-Skript des Jobs
 * „plan“ wird mit gefälschtem Datum und gefälschtem Git-Tag in einer echten Bash ausgeführt.
 * Geprüft wird: Code-Deploys sind am Renntag gesperrt, Inhalts-Rebuilds laufen weiter – aber mit
 * dem zuletzt ausgerollten Code-Stand (Tag „production“) –, und ohne Secrets wird übersprungen.
 *
 * Ohne Bash (z. B. Windows ohne Git Bash) wird der Test übersprungen; in der CI (Ubuntu) läuft er.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

type YamlModule = { parse: (s: string) => unknown };
const yaml = (await import('yaml').catch(() => null)) as YamlModule | null;

/** Eine Bash, die Umgebungsvariablen sieht (WSL-bash.exe unter Windows tut das nicht). */
function findBash(): string | null {
  const candidates =
    process.platform === 'win32'
      ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe', 'bash']
      : ['bash'];
  for (const c of candidates) {
    if (c.includes('\\') && !existsSync(c)) continue;
    const probe = spawnSync(c, ['-c', 'echo "$PROBE"'], { env: { ...process.env, PROBE: 'ok' }, encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim() === 'ok') return c;
  }
  return null;
}

const bash = findBash();

interface Step {
  id?: string;
  run?: string;
}
function decideScript(): string {
  const wf = yaml!.parse(readFileSync(join(process.cwd(), '.github', 'workflows', 'deploy.yml'), 'utf8')) as {
    jobs: { plan: { steps: Step[] } };
  };
  const step = wf.jobs.plan.steps.find((s) => s.id === 'decide');
  if (!step?.run) throw new Error('Schritt „decide“ im Job „plan“ nicht gefunden');
  return step.run;
}

// Ersetzt `date` und `git rev-parse` – alles andere läuft unverändert.
const SHIMS = `
date() {
  case "$*" in
    *%u*) echo "$FAKE_WEEKDAY" ;;
    *%F*) echo "$FAKE_DATE" ;;
    *) command date "$@" ;;
  esac
}
git() {
  if [ "$1" = "rev-parse" ]; then
    if [ -n "\${FAKE_PROD_TAG:-}" ]; then echo "$FAKE_PROD_TAG"; return 0; fi
    return 1
  fi
  command git "$@"
}
`;

const tmp = mkdtempSync(join(tmpdir(), 'liga-freeze-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

interface Scenario {
  event: 'push' | 'workflow_dispatch' | 'repository_dispatch' | 'schedule';
  weekday: number;
  date?: string;
  racedays?: string;
  freezeDates?: string;
  ignoreFreeze?: boolean;
  productionTag?: string;
  secrets?: boolean;
}

let counter = 0;
function run(s: Scenario): { status: number | null; outputs: Record<string, string>; summary: string; log: string } {
  const n = ++counter;
  const scriptFile = join(tmp, `decide-${n}.sh`);
  const outFile = join(tmp, `out-${n}.txt`);
  const summaryFile = join(tmp, `summary-${n}.md`);
  writeFileSync(scriptFile, SHIMS + decideScript());
  writeFileSync(outFile, '');
  writeFileSync(summaryFile, '');
  const res = spawnSync(bash!, [scriptFile.replaceAll('\\', '/')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EVENT: s.event,
      IGNORE_FREEZE: s.ignoreFreeze ? 'true' : 'false',
      RACEDAY_WEEKDAY: s.racedays ?? '',
      FREEZE_DATES: s.freezeDates ?? '',
      HAS_CF_TOKEN: s.secrets === false ? 'false' : 'true',
      HAS_SUPABASE: s.secrets === false ? 'false' : 'true',
      DISPATCH_REASON: s.event === 'repository_dispatch' ? 'Ergebnis R5 Suzuka' : '',
      GITHUB_SHA: 'a'.repeat(40),
      GITHUB_OUTPUT: outFile,
      GITHUB_STEP_SUMMARY: summaryFile,
      FAKE_WEEKDAY: String(s.weekday),
      FAKE_DATE: s.date ?? '2026-10-08',
      FAKE_PROD_TAG: s.productionTag ?? '',
    },
  });
  const outputs = Object.fromEntries(
    readFileSync(outFile, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  return { status: res.status, outputs, summary: readFileSync(summaryFile, 'utf8'), log: `${res.stdout}${res.stderr}` };
}

const MAIN = 'a'.repeat(40);
const PROD = 'b'.repeat(40);

describe.skipIf(!bash || !yaml)('deploy.yml – Renntags-Freeze', () => {
  it('Push an einem normalen Tag rollt den Code aus', () => {
    const r = run({ event: 'push', weekday: 2, racedays: '4' });
    expect(r.status, r.log).toBe(0);
    expect(r.outputs).toMatchObject({ deploy: 'true', kind: 'code', ref: MAIN });
  });

  it('Push am Renntag wird abgelehnt (Code-Freeze)', () => {
    const r = run({ event: 'push', weekday: 4, racedays: '4' });
    expect(r.status).not.toBe(0);
    expect(r.log).toContain('Renntags-Freeze');
    expect(r.outputs.deploy).toBeUndefined();
  });

  it('mehrere Renntage mit Leerzeichen und zusätzliche Freeze-Tage', () => {
    expect(run({ event: 'push', weekday: 7, racedays: '4, 7' }).status).not.toBe(0);
    expect(run({ event: 'push', weekday: 5, racedays: '4, 7' }).status).toBe(0);
    expect(run({ event: 'push', weekday: 6, date: '2026-12-19', freezeDates: '2026-12-19, 2026-12-20' }).status).not.toBe(0);
    expect(run({ event: 'push', weekday: 1, date: '2026-12-21', freezeDates: '2026-12-19,2026-12-20' }).status).toBe(0);
  });

  it('ohne RACEDAY_WEEKDAY gibt es keinen Freeze', () => {
    for (let weekday = 1; weekday <= 7; weekday++) {
      expect(run({ event: 'push', weekday }).outputs.deploy).toBe('true');
    }
  });

  it('Notfall: manueller Start mit „Freeze ignorieren“ rollt auch am Renntag aus', () => {
    expect(run({ event: 'workflow_dispatch', weekday: 4, racedays: '4' }).status).not.toBe(0);
    const r = run({ event: 'workflow_dispatch', weekday: 4, racedays: '4', ignoreFreeze: true });
    expect(r.status, r.log).toBe(0);
    expect(r.outputs).toMatchObject({ deploy: 'true', kind: 'code', ref: MAIN });
  });

  it('Inhalts-Rebuild am Renntag baut den ausgerollten Code-Stand (Tag production)', () => {
    const r = run({ event: 'repository_dispatch', weekday: 4, racedays: '4', productionTag: PROD });
    expect(r.status, r.log).toBe(0);
    expect(r.outputs).toMatchObject({ deploy: 'true', kind: 'content', ref: PROD });
    expect(r.summary).toContain('repository_dispatch (Ergebnis R5 Suzuka)');
  });

  it('Inhalts-Rebuild am Renntag ohne Tag baut main (mit Warnung)', () => {
    const r = run({ event: 'repository_dispatch', weekday: 4, racedays: '4' });
    expect(r.status, r.log).toBe(0);
    expect(r.outputs).toMatchObject({ deploy: 'true', kind: 'content', ref: MAIN });
    expect(r.log).toContain('production');
  });

  it('Inhalts-Rebuild und täglicher Build an normalen Tagen bauen main', () => {
    for (const event of ['repository_dispatch', 'schedule'] as const) {
      const r = run({ event, weekday: 2, racedays: '4', productionTag: PROD });
      expect(r.outputs, event).toMatchObject({ deploy: 'true', kind: 'content', ref: MAIN });
    }
  });

  it('ohne Secrets wird übersprungen statt fehlzuschlagen – auch am Renntag', () => {
    for (const event of ['push', 'repository_dispatch'] as const) {
      const r = run({ event, weekday: 4, racedays: '4', secrets: false });
      expect(r.status, r.log).toBe(0);
      expect(r.outputs.deploy, event).toBe('false');
    }
  });
});
