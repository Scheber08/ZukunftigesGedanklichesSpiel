/**
 * Leitplanken für den ganzen Quelltext (ARCHITEKTUR.md „Sicherheit“, Plan §10): statische Prüfungen,
 * die bei jedem neuen Admin-Modul, jeder neuen Seite und jeder neuen Island automatisch mitlaufen.
 *
 *  - Jede Admin-Action prüft als Erstes die Rolle (`staffFrom(context, …)`).
 *  - Jede öffentliche Formular-Action läuft durch den Spam-Schutz (`guard(…)` → guardPublicForm).
 *  - Admin-Seiten und APIs werden nie statisch vorgerendert (`export const prerender = false`).
 *  - CSP: keine `is:inline`-Skripte, keine Inline-Event-Handler (`onclick="…"`).
 *  - Client-Code (Svelte-Islands, `<script>` in .astro) importiert nichts aus `lib/server` oder
 *    `astro:env/server` – sonst landen Secrets oder Service-Key-Zugriffe im Browser-Bundle.
 *  - Keine `\u`-Escapes für unsichtbare Zeichen (Zero-Width, Bidi-Steuerzeichen).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const read = (file: string) => readFileSync(file, 'utf8');
const rel = (file: string) => relative(ROOT, file).replaceAll('\\', '/');

function walk(dir: string, filter: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, filter));
    else if (filter(path)) out.push(path);
  }
  return out.sort();
}

interface ActionDef {
  file: string;
  name: string;
  /** Quelltext des Handlers bis zur nächsten Action */
  body: string;
}

/** `name: defineAction({` und `const name = defineAction({` – Handler-Rumpf bis zur nächsten Action. */
function actionsIn(file: string, source: string): ActionDef[] {
  const re = /(?:^|\s)(?:const\s+)?(\w+)\s*[:=]\s*defineAction\(/g;
  const hits = [...source.matchAll(re)].map((m) => ({ name: m[1]!, index: m.index! }));
  return hits.map((hit, i) => {
    const block = source.slice(hit.index, hits[i + 1]?.index ?? source.length);
    const handler = block.indexOf('handler');
    return { file, name: hit.name, body: handler >= 0 ? block.slice(handler) : '' };
  });
}

/**
 * Rollenprüfung vor jedem Datenzugriff: `staffFrom(context, 'rolle')` steht in den ersten Zeilen des
 * Handlers und vor dem ersten `getServiceStore()`/`store.`/`fetch(`.
 */
function checksRoleFirst(body: string): boolean {
  const role = /staffFrom\(\s*context\s*,\s*'(?:admin|steward|redakteur)'/.exec(body);
  if (!role || role.index > 260) return false;
  const access = /getServiceStore\(|getPublicStore\(|\bstore\.\w+\(|\bfetch\(/.exec(body);
  return !access || role.index < access.index;
}

describe('Admin-Actions prüfen die Rolle', () => {
  const dir = join(SRC, 'actions', 'admin');
  const files = walk(dir, (f) => f.endsWith('.ts'));
  const actions = files.flatMap((f) => actionsIn(rel(f), read(f)));

  it('findet die Admin-Actions', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(actions.length).toBeGreaterThanOrEqual(50);
    expect(actions.every((a) => a.body !== ''), 'Action ohne handler').toBe(true);
  });

  it('jede Admin-Action ruft zuerst staffFrom(context, …) auf', () => {
    const missing = actions.filter((a) => !checksRoleFirst(a.body));
    expect(missing.map((a) => `${a.file} › ${a.name}`)).toEqual([]);
  });

  it('Admin-Actions sind im Action-Index unter admin.* registriert (nicht öffentlich erreichbar ohne Präfix)', () => {
    const index = read(join(SRC, 'actions', 'index.ts'));
    expect(index).toMatch(/admin:\s*\{/);
    for (const f of files) {
      const exported = /export const (\w+Actions)\b/.exec(read(f))?.[1];
      if (exported) expect(index, `${rel(f)} (${exported})`).toMatch(new RegExp(`admin:\\s*\\{[^}]*\\.\\.\\.${exported}`));
    }
  });
});

describe('Öffentliche Formulare haben Spam-Schutz', () => {
  const file = join(SRC, 'actions', 'public.ts');
  const source = read(file);
  const actions = actionsIn(rel(file), source);

  it('findet Vorfall, Anmeldung und Kontakt', () => {
    expect(actions.length).toBeGreaterThanOrEqual(3);
  });

  it('jede öffentliche Action ruft guard(…) bzw. guardPublicForm(…) auf', () => {
    expect(source).toContain('guardPublicForm(');
    const missing = actions.filter((a) => !/\bguard(PublicForm)?\(\s*store/.test(a.body));
    expect(missing.map((a) => a.name)).toEqual([]);
  });

  it('öffentliche Actions nehmen Formulardaten an (funktionieren ohne JavaScript, Origin-Prüfung von Astro)', () => {
    const missing = actions.filter((a) => !/accept:\s*'form'/.test(source.slice(source.indexOf(`${a.name} = defineAction`), source.indexOf(`${a.name} = defineAction`) + 200)));
    expect(missing.map((a) => a.name)).toEqual([]);
  });
});

describe('Dynamische Routen', () => {
  const dynamic = [join(SRC, 'pages', 'admin'), join(SRC, 'pages', 'api')].flatMap((d) => walk(d, (f) => /\.(astro|ts)$/.test(f)));

  it('Admin-Seiten und APIs sind nie vorgerendert (prerender = false)', () => {
    expect(dynamic.length).toBeGreaterThan(20);
    const missing = dynamic.filter((f) => !/export const prerender = false/.test(read(f)));
    expect(missing.map(rel)).toEqual([]);
  });

  it('jede Admin-Seite und Admin-API prüft die Rolle (Middleware prüft nur die Anmeldung)', () => {
    // Ausnahmen: Login und Auth-Rückrufe (vor der Anmeldung erreichbar)
    const open = /^src\/pages\/admin\/(login\.astro|auth\/)/;
    const guarded = dynamic
      .map(rel)
      .filter((f) => (f.startsWith('src/pages/admin/') || f.startsWith('src/pages/api/admin/')) && !open.test(f));
    expect(guarded.length).toBeGreaterThan(20);
    const missing = guarded.filter((f) => !/\b(?:hasRole|requireRole|staffFrom|requireUploader)\(/.test(read(join(ROOT, f))));
    expect(missing).toEqual([]);
  });
});

describe('CSP und Client-Code', () => {
  const astro = walk(SRC, (f) => f.endsWith('.astro'));
  const svelte = walk(SRC, (f) => f.endsWith('.svelte'));

  it('keine is:inline-Skripte und keine Inline-Event-Handler', () => {
    const offenders: string[] = [];
    for (const f of astro) {
      const src = read(f);
      // Ausnahmen: Zeitzonen- und Ortszeit-Skript (tz-inline.mjs), per SHA-256-Hash in der CSP freigegeben
      for (const tag of src.match(/<script\b[^>]*>/g) ?? []) {
        if (/\bis:inline\b/.test(tag) && !/\bset:html=\{(TZ_SCRIPT|LOCALTIME_SCRIPT)\}/.test(tag)) offenders.push(`${rel(f)}: is:inline`);
      }
      // HTML-Attribut mit String-Wert, z. B. onclick="…" (Svelte-Handler onclick={…} sind kein Inline-Skript)
      const handler = /<[a-zA-Z][^>]*\son[a-z]+\s*=\s*["']/.exec(src);
      if (handler) offenders.push(`${rel(f)}: ${handler[0].slice(0, 60)}`);
    }
    for (const f of svelte) {
      const handler = /<[a-zA-Z][^>]*\son[a-z]+\s*=\s*["']/.exec(read(f));
      if (handler) offenders.push(`${rel(f)}: ${handler[0].slice(0, 60)}`);
    }
    expect(offenders).toEqual([]);
  });

  it('Islands und Client-Skripte importieren nichts Serverseitiges', () => {
    const serverImport = /import[^;]*from\s*['"](?:~\/lib\/server\/|[./]+(?:lib\/)?server\/|astro:env\/server|astro:actions\/server)/;
    const offenders: string[] = [];
    for (const f of svelte) if (serverImport.test(read(f))) offenders.push(rel(f));
    for (const f of astro) {
      // nur Client-Skripte (<script> ohne type=application/json bzw. ld+json), nicht das Frontmatter
      for (const m of read(f).matchAll(/<script\b(?![^>]*type=["']application\/(?:ld\+)?json)[^>]*>([\s\S]*?)<\/script>/g)) {
        if (serverImport.test(m[1]!)) offenders.push(`${rel(f)} (<script>)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keine \\u-Escapes für unsichtbare Zeichen im Quelltext', () => {
    const invisible = /\\u(?:200[b-f]|202[a-e]|206[0-9]|feff|00ad|180e|\{(?:200[b-f]|feff)\})/i;
    const files = walk(SRC, (f) => /\.(ts|astro|svelte|js|mjs)$/.test(f));
    expect(files.filter((f) => invisible.test(read(f))).map(rel)).toEqual([]);
  });
});
