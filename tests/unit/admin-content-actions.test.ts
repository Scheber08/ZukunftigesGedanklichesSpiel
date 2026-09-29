/**
 * Admin-Actions des Inhalte-Bereichs (News, Regelwerk, Seiten-Inhalte) gegen den Memory-Store
 * mit Demo-Daten. `astro:actions` wird durch eine schlanke Nachbildung ersetzt, damit die
 * Handler direkt aufrufbar sind; Discord und Rebuild sind gemockt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(async (..._args: unknown[]) => true),
  requestRebuild: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('astro:actions', () => {
  class ActionError extends Error {
    code: string;
    type = 'AstroActionError';
    constructor({ code, message }: { code: string; message?: string }) {
      super(message ?? code);
      this.code = code;
    }
  }
  return { ActionError, defineAction: (config: unknown) => config };
});
vi.mock('~/lib/server/discord', () => ({
  notify: mocks.notify,
  siteUrl: (path: string) => `https://liga.example${path}`,
  EMBED_TEAL: 2,
}));
vi.mock('~/lib/server/rebuild', () => ({ requestRebuild: mocks.requestRebuild }));

import { contentActions } from '~/actions/admin/content';
import { MemoryStore } from '~/lib/db/memory-store';
import { demoStaff } from '~/lib/server/auth';
import { getServiceStore } from '~/lib/server/db';
import { findRedirect } from '~/lib/server/redirects';
import { demoDataset } from '~/lib/seed/demo';
import type { StaffRole } from '~/lib/db/types';

type Handler = (input: Record<string, unknown>, context: unknown) => Promise<unknown>;
type ActionName = keyof typeof contentActions;

function ctx(role: StaffRole | null) {
  return { locals: { staff: role ? demoStaff(role) : null } };
}

async function run<T = Record<string, unknown>>(name: ActionName, input: Record<string, unknown>, role: StaffRole | null = 'admin'): Promise<T> {
  const handler = (contentActions[name] as unknown as { handler: Handler }).handler;
  return (await handler(input, ctx(role))) as T;
}

async function fails(name: ActionName, input: Record<string, unknown>, role: StaffRole | null = 'admin') {
  try {
    await run(name, input, role);
  } catch (err) {
    const e = err as { code?: string; message: string; issues?: Array<{ path: string[]; message: string }> };
    return { code: e.code, message: e.message, fields: Object.fromEntries((e.issues ?? []).map((i) => [i.path[0], i.message])) };
  }
  throw new Error(`${name} hätte scheitern müssen`);
}

beforeEach(() => {
  globalThis.__ligaMemoryStore = new MemoryStore(demoDataset());
  mocks.notify.mockClear();
  mocks.requestRebuild.mockClear();
});

describe('Rollen', () => {
  it('lässt Stewards und Gäste nichts ändern, Redaktion kein Regelwerk', async () => {
    expect((await fails('newsSave', { title_de: 'x', category: 'community', status: 'draft' }, 'steward')).code).toBe('FORBIDDEN');
    expect((await fails('faqDelete', { id: 1 }, null)).code).toBe('UNAUTHORIZED');
    expect((await fails('rulesVersionCreate', { version: '9.9' }, 'redakteur')).code).toBe('FORBIDDEN');
    expect((await fails('pageTextsSave', { claim_de: 'a', claim_en: 'b', registration_state: 'open', free_seats: 1, free_reserve: 1 }, 'steward')).code).toBe('FORBIDDEN');
    // Admins haben auch Redaktionsrechte
    const faq = await run<{ id: number }>('faqSave', { category: 'general', question_de: 'Frage?', answer_de: 'Antwort.' }, 'admin');
    expect(faq.id).toBeGreaterThan(0);
  });
});

describe('Regelwerk veröffentlichen', () => {
  it('kopiert die gültige Fassung, archiviert sie beim Veröffentlichen und stellt die aktive Saison um', async () => {
    const store = getServiceStore();
    const current = (await store.select('rules_versions')).find((v) => v.status === 'published')!;
    const sourceSections = await store.select('rules_sections', { eq: { version_id: current.id } });

    const created = await run<{ id: number; copied: number }>('rulesVersionCreate', { version: '9.1', copy_from: current.id });
    expect(created.copied).toBe(sourceSections.length);
    const copies = await store.select('rules_sections', { eq: { version_id: created.id } });
    // Baum bleibt erhalten: jede Eltern-ID zeigt auf einen Abschnitt der neuen Version
    const ids = new Set(copies.map((s) => s.id));
    expect(copies.filter((s) => s.parent_id != null).every((s) => ids.has(s.parent_id!))).toBe(true);
    expect(copies.filter((s) => s.parent_id != null).length).toBe(sourceSections.filter((s) => s.parent_id != null).length);

    // Ohne Changelog und „gilt ab“: Feldfehler, nichts ändert sich
    const missing = await fails('rulesVersionPublish', { id: created.id, version: '9.1', set_season: true });
    expect(Object.keys(missing.fields).sort()).toEqual(['changelog_de', 'effective_from']);
    expect((await store.select('rules_versions')).find((v) => v.id === current.id)?.status).toBe('published');

    const published = await run<{ archived: string[]; season: string | null }>('rulesVersionPublish', {
      id: created.id,
      version: '9.1',
      effective_from: '2026-10-01',
      changelog_de: '- Track Limits präzisiert',
      set_season: true,
    });
    expect(published.archived).toEqual([current.version]);
    const versions = await store.select('rules_versions');
    expect(versions.find((v) => v.id === current.id)?.status).toBe('archived');
    expect(versions.find((v) => v.id === created.id)).toMatchObject({ status: 'published', effective_from: '2026-10-01' });
    const active = (await store.select('seasons')).find((s) => s.status === 'active');
    if (active) expect(active.rules_version_id).toBe(created.id);
    expect(mocks.requestRebuild).toHaveBeenCalled();

    // Veröffentlichte Versionen sind eingefroren
    expect((await fails('rulesSectionDelete', { version_id: created.id, id: copies[0]!.id })).code).toBe('CONFLICT');
  });

  it('lehnt eine schon vergebene Versionsnummer beim Veröffentlichen ab', async () => {
    const store = getServiceStore();
    const current = (await store.select('rules_versions')).find((v) => v.status === 'published')!;
    const created = await run<{ id: number }>('rulesVersionCreate', { version: '9.2', copy_from: current.id });
    const res = await fails('rulesVersionPublish', { id: created.id, version: current.version, effective_from: '2026-10-01', changelog_de: 'x' });
    expect(res.fields.version).toMatch(/gibt es schon/);
  });

  it('löscht beim Löschen eines Kapitels die Unterabschnitte mit', async () => {
    const store = getServiceStore();
    const current = (await store.select('rules_versions')).find((v) => v.status === 'published')!;
    const created = await run<{ id: number }>('rulesVersionCreate', { version: '9.3', copy_from: current.id });
    const sections = await store.select('rules_sections', { eq: { version_id: created.id } });
    const chapter = sections.find((s) => s.parent_id == null && sections.some((c) => c.parent_id === s.id))!;
    const children = sections.filter((s) => s.parent_id === chapter.id).length;
    const res = await run<{ removed: number }>('rulesSectionDelete', { version_id: created.id, id: chapter.id });
    expect(res.removed).toBeGreaterThanOrEqual(children + 1);
    expect(await store.select('rules_sections', { eq: { version_id: created.id } })).toHaveLength(sections.length - res.removed);
  });
});

describe('News', () => {
  it('leitet nach dem Umbenennen eines veröffentlichten Artikels per 301 weiter und räumt beim Löschen auf', async () => {
    const store = getServiceStore();
    const saved = await run<{ id: number }>(
      'newsSave',
      { title_de: 'Prüfartikel', excerpt_de: 'Kurz', body_de: 'Text', category: 'community', status: 'published' },
      'redakteur',
    );
    const before = (await store.select('news', { eq: { id: saved.id } }))[0]!;
    const res = await run<{ redirected: boolean }>(
      'newsSave',
      { id: saved.id, title_de: 'Prüfartikel', slug_de: 'pruefartikel-neu', excerpt_de: 'Kurz', body_de: 'Text', category: 'community', status: 'published' },
      'redakteur',
    );
    expect(res.redirected).toBe(true);
    expect(await findRedirect(store, `/news/${before.slug_de}`)).toBe('/news/pruefartikel-neu');
    // EN-Slug leer gelassen → bleibt gleich, keine Weiterleitung
    expect(await findRedirect(store, `/en/news/${before.slug_en}`)).toBeNull();

    // Ein neuer Artikel mit dem alten Titel bekommt nicht die alte Adresse (sie leitet weiter)
    const other = await run<{ id: number }>('newsSave', { title_de: 'Prüfartikel', category: 'community', status: 'draft' }, 'redakteur');
    expect((await store.select('news', { eq: { id: other.id } }))[0]!.slug_de).not.toBe(before.slug_de);
    await run('newsDelete', { id: other.id }, 'redakteur');

    // Zurück zum alten Slug: keine Schleife, die Weiterleitung kehrt sich um
    await run('newsSave', { id: saved.id, title_de: 'Prüfartikel', slug_de: before.slug_de, excerpt_de: 'Kurz', body_de: 'Text', category: 'community', status: 'published' }, 'redakteur');
    expect(await findRedirect(store, `/news/${before.slug_de}`)).toBeNull();
    expect(await findRedirect(store, '/news/pruefartikel-neu')).toBe(`/news/${before.slug_de}`);

    await run('newsDelete', { id: saved.id }, 'redakteur');
    expect(await findRedirect(store, `/news/${before.slug_de}`)).toBeNull();
    expect(await findRedirect(store, '/news/pruefartikel-neu')).toBeNull();
  });

  it('postet nur beim ersten Veröffentlichen und nur mit Häkchen in #news', async () => {
    const base = { title_de: 'Discord-Test', excerpt_de: 'Kurz', body_de: 'Text', category: 'announcement' };
    const draft = await run<{ id: number }>('newsSave', { ...base, status: 'draft', discord_post: true }, 'redakteur');
    expect(mocks.notify).not.toHaveBeenCalled();
    const pub = await run<{ discord: boolean }>('newsSave', { ...base, id: draft.id, status: 'published', discord_post: true }, 'redakteur');
    expect(pub.discord).toBe(true);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    await run('newsSave', { ...base, id: draft.id, status: 'published', discord_post: true }, 'redakteur');
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
});

describe('Seiten-Inhalte', () => {
  it('verlangt bei Treffern der Ausschlussliste eine Bestätigung', async () => {
    const input = { name: 'Casino Royal', url: 'https://casino.example', text_de: 'Spiel mit', label_ad: true, active: true };
    expect((await fails('partnerSave', input, 'redakteur')).fields.exclusion_confirmed).toMatch(/Ausschlussliste/);
    const ok = await run<{ id: number }>('partnerSave', { ...input, exclusion_confirmed: true }, 'redakteur');
    expect(ok.id).toBeGreaterThan(0);
  });

  it('verschiebt FAQ-Einträge nur innerhalb ihrer Kategorie', async () => {
    const store = getServiceStore();
    const items = await store.select('faq_items');
    const byCat = (cat: string) => items.filter((i) => i.category === cat).sort((a, b) => a.sort - b.sort || a.id - b.id);
    const cat = items[0]!.category;
    const [first, second] = byCat(cat);
    expect(second).toBeDefined();
    await run('faqMove', { id: first!.id, direction: 'down' }, 'redakteur');
    const after = (await store.select('faq_items')).filter((i) => i.category === cat).sort((a, b) => a.sort - b.sort || a.id - b.id);
    expect(after[0]!.id).toBe(second!.id);
    expect(after[1]!.id).toBe(first!.id);
  });
});
