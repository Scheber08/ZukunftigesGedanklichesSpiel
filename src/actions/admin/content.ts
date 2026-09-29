/**
 * Admin-Actions: Inhalte (Plan §5 – News, Regelwerk, Seiten-Inhalte).
 *
 * Rollen: News und Seiten-Inhalte → Redaktion oder Admin (`hasRole('redakteur')` schließt
 * Admins ein), Regelwerk → nur Admin. Jede Action prüft die Rolle selbst, schreibt ins
 * Audit-Log und fordert bei öffentlich sichtbaren Änderungen einen (gebündelten) Rebuild an.
 * Die Fachlogik steckt in src/lib/admin/content (getestet).
 */
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { insertOne, selectOne, type Store } from '~/lib/db/store';
import {
  FAQ_CATEGORIES,
  NEWS_CATEGORIES,
  NEWS_STATUSES,
  type NewsRow,
  type Row,
} from '~/lib/db/types';
import { localInputToDate, orNull } from '~/lib/admin/content/form';
import { DEMO_MAX_DATA_URL_CHARS, normalizeImageValue, redactDataUrl } from '~/lib/admin/content/media';
import { decideNewsStatus, isPublicNews, publishProblems, resolveNewsSlugs } from '~/lib/admin/content/news';
import { moveInList, nextSort, type SortUpdate } from '~/lib/admin/content/order';
import { exclusionHits, normalizePartnerUrl } from '~/lib/admin/content/partners';
import {
  anchorFromNumber,
  copyLevels,
  copySectionRow,
  descendantIds,
  isInvalidParent,
  moveSection,
  nextSectionSort,
  normalizeAnchor,
  normalizeNumber,
  publishChecks,
  sectionConflicts,
  VERSION_RE,
  versionsToArchive,
} from '~/lib/admin/content/rules';
import { audit, type AuditAction } from '~/lib/server/audit';
import type { Staff } from '~/lib/server/auth';
import { getServiceStore } from '~/lib/server/db';
import { EMBED_TEAL, notify, siteUrl } from '~/lib/server/discord';
import { isDemoMode } from '~/lib/server/env';
import { requestRebuild } from '~/lib/server/rebuild';
import { patchSetting, readPublicSettings } from '~/lib/server/settings';
import { staffFrom, toActionError } from '../_helpers';

// ---------------------------------------------------------------------------- Helfer

/**
 * Feldbezogener Fehler aus dem Handler (z. B. Slug/Anker schon vergeben). Wird wie ein
 * Zod-Eingabefehler serialisiert, damit die Seite die Meldung am Feld anzeigen kann.
 */
function fieldError(fields: Record<string, string>): ActionError {
  const err = new ActionError({ code: 'BAD_REQUEST', message: Object.values(fields).join(' ') });
  Object.assign(err, {
    type: 'AstroActionInputError',
    issues: Object.entries(fields).map(([key, message]) => ({ code: 'custom', path: [key], message })),
  });
  return err;
}

const req = (label: string, max: number) =>
  z
    .string({ error: `${label} fehlt.` })
    .trim()
    .min(1, `${label} fehlt.`)
    .max(max, `${label}: höchstens ${max} Zeichen.`);
const opt = (label: string, max: number) => z.string().trim().max(max, `${label}: höchstens ${max} Zeichen.`).optional();
const markdown = (label: string, max = 60_000) => z.string().max(max, `${label}: höchstens ${max} Zeichen.`).optional();
const id = z.number({ error: 'Ungültige ID.' }).int().positive();
const direction = z.enum(['up', 'down']);

/** Markdown behält Einrückungen, nur Leerraum am Ende weg; leer → null. */
function mdOrNull(value: string | undefined): string | null {
  const v = value?.replace(/\s+$/, '');
  return v && v.trim() !== '' ? v : null;
}

/** Zeilen für Audit/Discord ohne lange Data-URLs (Demo-Bilder). */
function redacted<T extends object | null>(row: T): T {
  if (!row) return row;
  const copy = { ...(row as Record<string, unknown>) };
  for (const key of ['cover_image', 'logo', 'avatar']) {
    if (typeof copy[key] === 'string') copy[key] = redactDataUrl(copy[key] as string);
  }
  return copy as T;
}

type SortableTable = 'faq_items' | 'staff_members' | 'open_positions' | 'partners';

async function applySortUpdates(store: Store, table: SortableTable | 'rules_sections', updates: SortUpdate[]): Promise<void> {
  for (const u of updates) await store.update(table, { id: u.id } as never, { sort: u.sort } as never);
}

/** Speichern (Insert am Listenende oder Update) mit Audit und Rebuild. */
async function saveSortable<T extends SortableTable>(
  staff: Staff,
  table: T,
  rowId: number | undefined,
  row: Partial<Row<T>>,
  label: string,
): Promise<Row<T>> {
  const store = getServiceStore();
  const before = rowId ? await selectOne(store, table, { id: rowId } as Partial<Row<T>>) : null;
  if (rowId && !before) throw new ActionError({ code: 'NOT_FOUND', message: `${label} nicht gefunden.` });
  let saved: Row<T>;
  if (before) {
    const [updated] = await store.update(table, { id: rowId } as Partial<Row<T>>, row);
    if (!updated) throw new ActionError({ code: 'NOT_FOUND', message: `${label} nicht gefunden.` });
    saved = updated;
  } else {
    const all = (await store.select(table)) as unknown as Array<{ id: number; sort: number }>;
    saved = await insertOne(store, table, { ...row, sort: nextSort(all) } as Partial<Row<T>>);
  }
  const savedId = (saved as { id: number }).id;
  await audit(store, staff, before ? 'update' : 'create', table, savedId, redacted(before), redacted(saved));
  await requestRebuild(store, `${label} gespeichert`);
  return saved;
}

async function deleteSortable(staff: Staff, table: SortableTable, rowId: number, label: string): Promise<void> {
  const store = getServiceStore();
  const before = await selectOne(store, table, { id: rowId } as never);
  if (!before) throw new ActionError({ code: 'NOT_FOUND', message: `${label} nicht gefunden.` });
  await store.remove(table, { id: rowId } as never);
  await audit(store, staff, 'delete', table, rowId, redacted(before), null);
  await requestRebuild(store, `${label} gelöscht`);
}

async function moveSortable(
  staff: Staff,
  table: SortableTable,
  rowId: number,
  dir: 'up' | 'down',
  label: string,
  sameGroup?: (a: Record<string, unknown>, b: Record<string, unknown>) => boolean,
): Promise<{ moved: boolean }> {
  const store = getServiceStore();
  const all = (await store.select(table)) as unknown as Array<Record<string, unknown> & { id: number; sort: number }>;
  const self = all.find((r) => r.id === rowId);
  if (!self) throw new ActionError({ code: 'NOT_FOUND', message: `${label} nicht gefunden.` });
  const scope = sameGroup ? all.filter((r) => sameGroup(r, self)) : all;
  const updates = moveInList(scope, rowId, dir);
  if (!updates) return { moved: false };
  await applySortUpdates(store, table, updates);
  await audit(store, staff, 'update', table, rowId, { sort: self.sort }, { sort: updates.find((u) => u.id === rowId)?.sort ?? self.sort });
  await requestRebuild(store, `${label} verschoben`);
  return { moved: true };
}

// ---------------------------------------------------------------------------- News

const newsInput = z.object({
  id: id.optional(),
  title_de: req('Titel (DE)', 160),
  title_en: opt('Titel (EN)', 160),
  slug_de: opt('Slug (DE)', 90),
  slug_en: opt('Slug (EN)', 90),
  excerpt_de: opt('Teaser (DE)', 320),
  excerpt_en: opt('Teaser (EN)', 320),
  body_de: markdown('Text (DE)'),
  body_en: markdown('Text (EN)'),
  cover_image: z.string().max(DEMO_MAX_DATA_URL_CHARS + 100, 'Das Bild ist zu groß.').optional(),
  cover_alt_de: opt('Alt-Text (DE)', 200),
  cover_alt_en: opt('Alt-Text (EN)', 200),
  category: z.enum(NEWS_CATEGORIES, { error: 'Bitte eine Kategorie wählen.' }),
  round_id: id.optional(),
  author_name: opt('Autor', 60),
  status: z.enum(NEWS_STATUSES, { error: 'Bitte einen Status wählen.' }),
  publish_at: z.string().max(25).optional(),
  discord_post: z.boolean().optional(),
});

function newsEmbed(n: NewsRow) {
  return {
    title: n.title_de,
    description: n.excerpt_de,
    url: siteUrl(`/news/${n.slug_de}`),
    color: EMBED_TEAL,
    image: n.cover_image && /^https:/.test(n.cover_image) ? { url: n.cover_image } : undefined,
  };
}

const newsActions = {
  newsSave: defineAction({
    accept: 'form',
    input: newsInput,
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      const store = getServiceStore();
      try {
        const before = input.id ? await selectOne(store, 'news', { id: input.id }) : null;
        if (input.id && !before) throw new ActionError({ code: 'NOT_FOUND', message: 'Artikel nicht gefunden.' });

        let cover: string | null;
        try {
          cover = normalizeImageValue(input.cover_image, { demo: isDemoMode() });
        } catch (e) {
          throw fieldError({ cover_image: e instanceof Error ? e.message : 'Ungültiges Bild.' });
        }

        const publishAt = localInputToDate(input.publish_at);
        if (input.publish_at && !publishAt) throw fieldError({ publish_at: 'Ungültiges Datum.' });
        const decision = decideNewsStatus(input.status, publishAt, new Date(), before);
        if (!decision.ok) throw fieldError({ [decision.field]: decision.message });

        if (input.round_id && !(await selectOne(store, 'rounds', { id: input.round_id }))) {
          throw fieldError({ round_id: 'Diese Runde gibt es nicht.' });
        }

        const existing = await store.select('news');
        const slugs = resolveNewsSlugs(
          { slugDe: input.slug_de, slugEn: input.slug_en, titleDe: input.title_de, titleEn: input.title_en },
          existing,
          before?.id ?? null,
        );

        const row = {
          ...slugs,
          title_de: input.title_de,
          title_en: orNull(input.title_en),
          excerpt_de: input.excerpt_de ?? '',
          excerpt_en: orNull(input.excerpt_en),
          body_de: mdOrNull(input.body_de) ?? '',
          body_en: mdOrNull(input.body_en),
          cover_image: cover,
          cover_alt_de: cover ? orNull(input.cover_alt_de) : null,
          cover_alt_en: cover ? orNull(input.cover_alt_en) : null,
          category: input.category,
          round_id: input.round_id ?? null,
          author_name: orNull(input.author_name) ?? before?.author_name ?? staff.name,
          status: decision.status,
          publish_at: decision.publish_at,
        } satisfies Partial<NewsRow>;

        if (decision.status !== 'draft') {
          const problems = publishProblems(row);
          if (problems.length > 0) throw fieldError(Object.fromEntries(problems.map((p) => [p.field, p.message])));
        }

        let saved: NewsRow;
        if (before) {
          const [updated] = await store.update('news', { id: before.id }, row);
          if (!updated) throw new ActionError({ code: 'NOT_FOUND', message: 'Artikel nicht gefunden.' });
          saved = updated;
        } else {
          saved = await insertOne(store, 'news', { ...row, author_id: staff.userId });
        }

        const wasPublic = isPublicNews(before);
        const isPublic = isPublicNews(saved);
        const action: AuditAction = !before ? 'create' : isPublic && !wasPublic ? 'publish' : wasPublic && !isPublic ? 'unpublish' : 'update';
        await audit(store, staff, action, 'news', saved.id, redacted(before), redacted(saved));
        if (wasPublic || isPublic) await requestRebuild(store, `News „${saved.title_de}“`);

        let discord = false;
        if (input.discord_post && isPublic && !wasPublic) discord = await notify(store, 'news', newsEmbed(saved));

        return {
          id: saved.id,
          status: saved.status,
          note: decision.note ?? null,
          discord,
          slugChanged: Boolean(before && (before.slug_de !== saved.slug_de || before.slug_en !== saved.slug_en)),
        };
      } catch (err) {
        toActionError(err, 'Dieser Slug ist schon vergeben.');
      }
    },
  }),

  newsDelete: defineAction({
    accept: 'form',
    input: z.object({ id }),
    handler: async ({ id: newsId }, context) => {
      const staff = staffFrom(context, 'redakteur');
      const store = getServiceStore();
      try {
        const before = await selectOne(store, 'news', { id: newsId });
        if (!before) throw new ActionError({ code: 'NOT_FOUND', message: 'Artikel nicht gefunden.' });
        await store.remove('news', { id: newsId });
        await audit(store, staff, 'delete', 'news', newsId, redacted(before), null);
        if (isPublicNews(before)) await requestRebuild(store, `News „${before.title_de}“ gelöscht`);
        return { title: before.title_de };
      } catch (err) {
        toActionError(err);
      }
    },
  }),
};

// ---------------------------------------------------------------------------- Regelwerk

async function draftVersion(store: Store, versionId: number) {
  const version = await selectOne(store, 'rules_versions', { id: versionId });
  if (!version) throw new ActionError({ code: 'NOT_FOUND', message: 'Version nicht gefunden.' });
  if (version.status !== 'draft') {
    throw new ActionError({
      code: 'CONFLICT',
      message: `Version ${version.version} ist ${version.status === 'published' ? 'veröffentlicht' : 'archiviert'} und kann nicht mehr geändert werden. Lege eine neue Version an.`,
    });
  }
  return version;
}

const rulesActions = {
  rulesVersionCreate: defineAction({
    accept: 'form',
    input: z.object({
      version: req('Versionsnummer', 20).regex(VERSION_RE, 'Versionsnummer im Format „1.1“ oder „2.0“ angeben.'),
      copy_from: z.number().int().nonnegative().optional(),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        const taken = await store.select('rules_versions', { eq: { version: input.version } });
        if (taken.length > 0) throw fieldError({ version: `Version ${input.version} gibt es schon.` });

        const source = input.copy_from ? await selectOne(store, 'rules_versions', { id: input.copy_from }) : null;
        if (input.copy_from && !source) throw fieldError({ copy_from: 'Die Vorlage gibt es nicht.' });

        const created = await insertOne(store, 'rules_versions', {
          version: input.version,
          status: 'draft',
          changelog_de: '',
          changelog_en: null,
          effective_from: null,
          published_at: null,
        });

        let copied = 0;
        if (source) {
          const sections = await store.select('rules_sections', { eq: { version_id: source.id } });
          const idMap = new Map<number, number>();
          // Ebenenweise einfügen, damit Eltern-IDs bekannt sind; Zuordnung über die (je Version eindeutige) Nummer
          for (const level of copyLevels(sections)) {
            const inserted = await store.insert(
              'rules_sections',
              level.map((s) => copySectionRow(s, created.id, idMap)),
            );
            const byNumber = new Map(inserted.map((r) => [r.number, r.id]));
            for (const s of level) {
              const newId = byNumber.get(s.number);
              if (newId != null) idMap.set(s.id, newId);
            }
            copied += inserted.length;
          }
        }
        await audit(store, staff, 'create', 'rules_versions', created.id, null, { ...created, copied_from: source?.version ?? null, sections: copied });
        return { id: created.id, copied };
      } catch (err) {
        toActionError(err, 'Diese Versionsnummer gibt es schon.');
      }
    },
  }),

  rulesVersionUpdate: defineAction({
    accept: 'form',
    input: z.object({
      id,
      version: req('Versionsnummer', 20).regex(VERSION_RE, 'Versionsnummer im Format „1.1“ oder „2.0“ angeben.'),
      effective_from: z.string().max(10).optional(),
      changelog_de: markdown('Changelog (DE)', 10_000),
      changelog_en: markdown('Changelog (EN)', 10_000),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        const before = await draftVersion(store, input.id);
        if (input.effective_from && !/^\d{4}-\d{2}-\d{2}$/.test(input.effective_from)) throw fieldError({ effective_from: 'Ungültiges Datum.' });
        const [saved] = await store.update(
          'rules_versions',
          { id: input.id },
          {
            version: input.version,
            effective_from: input.effective_from || null,
            changelog_de: mdOrNull(input.changelog_de) ?? '',
            changelog_en: mdOrNull(input.changelog_en),
          },
        );
        await audit(store, staff, 'update', 'rules_versions', input.id, before, saved);
        return { id: input.id };
      } catch (err) {
        toActionError(err, 'Diese Versionsnummer gibt es schon.');
      }
    },
  }),

  rulesVersionDelete: defineAction({
    accept: 'form',
    input: z.object({ id }),
    handler: async ({ id: versionId }, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        const version = await draftVersion(store, versionId);
        const seasons = await store.select('seasons', { eq: { rules_version_id: versionId } });
        if (seasons.length > 0) {
          throw new ActionError({ code: 'CONFLICT', message: `Die Version ist ${seasons.map((s) => s.name).join(', ')} zugeordnet und kann nicht gelöscht werden.` });
        }
        const sections = await store.select('rules_sections', { eq: { version_id: versionId } });
        // Kinder vor Eltern löschen (der Memory-Store kennt kein Cascade über parent_id)
        for (const s of [...sections].sort((a, b) => (b.parent_id ?? 0) - (a.parent_id ?? 0))) {
          await store.remove('rules_sections', { id: s.id });
        }
        await store.remove('rules_versions', { id: versionId });
        await audit(store, staff, 'delete', 'rules_versions', versionId, { ...version, sections: sections.length }, null);
        return { version: version.version };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  rulesSectionSave: defineAction({
    accept: 'form',
    input: z.object({
      version_id: id,
      id: id.optional(),
      number: req('Nummer', 20),
      anchor: opt('Anker', 63),
      parent_id: id.optional(),
      title_de: req('Titel (DE)', 200),
      title_en: opt('Titel (EN)', 200),
      body_de: markdown('Text (DE)', 40_000),
      body_en: markdown('Text (EN)', 40_000),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        await draftVersion(store, input.version_id);
        const sections = await store.select('rules_sections', { eq: { version_id: input.version_id } });
        const before = input.id ? sections.find((s) => s.id === input.id) : undefined;
        if (input.id && !before) throw new ActionError({ code: 'NOT_FOUND', message: 'Abschnitt nicht gefunden.' });

        const number = normalizeNumber(input.number);
        const anchor = normalizeAnchor(input.anchor || anchorFromNumber(number));
        const conflicts = sectionConflicts(sections, { id: input.id ?? null, number, anchor });
        const parentId = input.parent_id ?? null;
        const errors: Record<string, string> = { ...conflicts } as Record<string, string>;
        if (isInvalidParent(sections, input.id ?? null, parentId)) errors.parent_id = 'Dieser Eltern-Abschnitt ist nicht möglich (eigener Unterabschnitt oder nicht vorhanden).';
        if (Object.keys(errors).length > 0) throw fieldError(errors);

        const row = {
          number,
          anchor,
          parent_id: parentId,
          title_de: input.title_de,
          title_en: orNull(input.title_en),
          body_de: mdOrNull(input.body_de) ?? '',
          body_en: mdOrNull(input.body_en),
        };
        let savedId: number;
        if (before) {
          // Neuer Eltern-Abschnitt → ans Ende der neuen Geschwister
          const sort = before.parent_id !== parentId ? nextSectionSort(sections) : before.sort;
          const [saved] = await store.update('rules_sections', { id: before.id }, { ...row, sort });
          savedId = before.id;
          await audit(store, staff, 'update', 'rules_sections', before.id, before, saved);
        } else {
          const saved = await insertOne(store, 'rules_sections', { ...row, version_id: input.version_id, sort: nextSectionSort(sections) });
          savedId = saved.id;
          await audit(store, staff, 'create', 'rules_sections', saved.id, null, saved);
        }
        return { id: savedId, anchor };
      } catch (err) {
        toActionError(err, 'Nummer oder Anker ist in dieser Version schon vergeben.');
      }
    },
  }),

  rulesSectionMove: defineAction({
    accept: 'form',
    input: z.object({ version_id: id, id, direction }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        await draftVersion(store, input.version_id);
        const sections = await store.select('rules_sections', { eq: { version_id: input.version_id } });
        const updates = moveSection(sections, input.id, input.direction);
        if (!updates) return { moved: false, id: input.id };
        await applySortUpdates(store, 'rules_sections', updates);
        await audit(store, staff, 'update', 'rules_sections', input.id, null, { moved: input.direction });
        return { moved: true, id: input.id };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  rulesSectionDelete: defineAction({
    accept: 'form',
    input: z.object({ version_id: id, id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        await draftVersion(store, input.version_id);
        const sections = await store.select('rules_sections', { eq: { version_id: input.version_id } });
        const section = sections.find((s) => s.id === input.id);
        if (!section) throw new ActionError({ code: 'NOT_FOUND', message: 'Abschnitt nicht gefunden.' });
        const ids = descendantIds(sections, section.id);
        // Tiefste zuerst
        for (const childId of [...ids].reverse()) await store.remove('rules_sections', { id: childId });
        await store.remove('rules_sections', { id: section.id });
        await audit(store, staff, 'delete', 'rules_sections', section.id, { ...section, removed_children: ids.length }, null);
        return { number: section.number, removed: ids.length + 1 };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  rulesVersionPublish: defineAction({
    accept: 'form',
    input: z.object({
      id,
      version: req('Versionsnummer', 20).regex(VERSION_RE, 'Versionsnummer im Format „1.1“ oder „2.0“ angeben.'),
      effective_from: z.string().max(10).optional(),
      changelog_de: markdown('Changelog (DE)', 10_000),
      changelog_en: markdown('Changelog (EN)', 10_000),
      set_season: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        const before = await draftVersion(store, input.id);
        const sections = await store.select('rules_sections', { eq: { version_id: input.id } });
        const checks = publishChecks({ changelog_de: input.changelog_de, effective_from: input.effective_from }, sections);
        if (Object.keys(checks.fields).length > 0) throw fieldError(checks.fields);
        if (checks.problems.length > 0) throw new ActionError({ code: 'BAD_REQUEST', message: checks.problems.join(' · ') });

        const now = new Date().toISOString();
        const [published] = await store.update(
          'rules_versions',
          { id: input.id },
          {
            version: input.version,
            status: 'published',
            published_at: now,
            effective_from: input.effective_from!,
            changelog_de: mdOrNull(input.changelog_de) ?? '',
            changelog_en: mdOrNull(input.changelog_en),
          },
        );
        // Bisher gültige Version archivieren – sie bleibt öffentlich abrufbar
        const versions = await store.select('rules_versions');
        const archived: string[] = [];
        for (const oldId of versionsToArchive(versions, input.id)) {
          const [old] = await store.update('rules_versions', { id: oldId }, { status: 'archived' });
          if (old) archived.push(old.version);
        }
        // Aktive Saison auf die neue Version setzen
        let season: string | null = null;
        if (input.set_season) {
          const [active] = await store.select('seasons', { eq: { status: 'active' }, limit: 1 });
          if (active) {
            await store.update('seasons', { id: active.id }, { rules_version_id: input.id });
            await audit(store, staff, 'update', 'seasons', active.id, { rules_version_id: active.rules_version_id }, { rules_version_id: input.id });
            season = active.name;
          }
        }
        await audit(store, staff, 'publish', 'rules_versions', input.id, before, { ...published, archived });
        await requestRebuild(store, `Regelwerk ${input.version} veröffentlicht`);
        return { id: input.id, version: input.version, archived, season };
      } catch (err) {
        toActionError(err, 'Diese Versionsnummer gibt es schon.');
      }
    },
  }),
};

// ---------------------------------------------------------------------------- Seiten-Inhalte

const inhalteActions = {
  faqSave: defineAction({
    accept: 'form',
    input: z.object({
      id: id.optional(),
      category: z.enum(FAQ_CATEGORIES, { error: 'Bitte eine Kategorie wählen.' }),
      question_de: req('Frage (DE)', 300),
      question_en: opt('Frage (EN)', 300),
      answer_de: req('Antwort (DE)', 8000),
      answer_en: markdown('Antwort (EN)', 8000),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        const saved = await saveSortable(
          staff,
          'faq_items',
          input.id,
          {
            category: input.category,
            question_de: input.question_de,
            question_en: orNull(input.question_en),
            answer_de: input.answer_de,
            answer_en: mdOrNull(input.answer_en),
          },
          'FAQ-Eintrag',
        );
        return { id: saved.id };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  faqDelete: defineAction({
    accept: 'form',
    input: z.object({ id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        await deleteSortable(staff, 'faq_items', input.id, 'FAQ-Eintrag');
        return { id: input.id };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  faqMove: defineAction({
    accept: 'form',
    input: z.object({ id, direction }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        // Innerhalb der Kategorie verschieben (die FAQ-Seite gruppiert nach Kategorie)
        return await moveSortable(staff, 'faq_items', input.id, input.direction, 'FAQ-Eintrag', (a, b) => a.category === b.category);
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  staffMemberSave: defineAction({
    accept: 'form',
    input: z.object({
      id: id.optional(),
      gamertag: req('Gamertag', 40),
      role_de: req('Rolle (DE)', 80),
      role_en: opt('Rolle (EN)', 80),
      since_season: z.number({ error: 'Saison als Zahl angeben.' }).int().min(1).max(999).optional(),
      avatar: z.string().max(DEMO_MAX_DATA_URL_CHARS + 100, 'Das Bild ist zu groß.').optional(),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        let avatar: string | null;
        try {
          avatar = normalizeImageValue(input.avatar, { demo: isDemoMode() });
        } catch (e) {
          throw fieldError({ avatar: e instanceof Error ? e.message : 'Ungültiges Bild.' });
        }
        const saved = await saveSortable(
          staff,
          'staff_members',
          input.id,
          {
            gamertag: input.gamertag,
            role_de: input.role_de,
            role_en: orNull(input.role_en),
            since_season: input.since_season ?? null,
            avatar,
          },
          'Orga-Team-Eintrag',
        );
        return { id: saved.id };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  staffMemberDelete: defineAction({
    accept: 'form',
    input: z.object({ id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        await deleteSortable(staff, 'staff_members', input.id, 'Orga-Team-Eintrag');
        return { id: input.id };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  staffMemberMove: defineAction({
    accept: 'form',
    input: z.object({ id, direction }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        return await moveSortable(staff, 'staff_members', input.id, input.direction, 'Orga-Team-Eintrag');
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  positionSave: defineAction({
    accept: 'form',
    input: z.object({
      id: id.optional(),
      title_de: req('Titel (DE)', 120),
      title_en: opt('Titel (EN)', 120),
      description_de: req('Beschreibung (DE)', 4000),
      description_en: markdown('Beschreibung (EN)', 4000),
      effort: opt('Zeitaufwand', 120),
      active: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        const saved = await saveSortable(
          staff,
          'open_positions',
          input.id,
          {
            title_de: input.title_de,
            title_en: orNull(input.title_en),
            description_de: input.description_de,
            description_en: mdOrNull(input.description_en),
            effort: orNull(input.effort),
            active: input.active ?? false,
          },
          'Offene Rolle',
        );
        return { id: saved.id };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  positionDelete: defineAction({
    accept: 'form',
    input: z.object({ id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        await deleteSortable(staff, 'open_positions', input.id, 'Offene Rolle');
        return { id: input.id };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  positionMove: defineAction({
    accept: 'form',
    input: z.object({ id, direction }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        return await moveSortable(staff, 'open_positions', input.id, input.direction, 'Offene Rolle');
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  partnerSave: defineAction({
    accept: 'form',
    input: z.object({
      id: id.optional(),
      name: req('Name', 80),
      url: req('Link', 500),
      logo: z.string().max(DEMO_MAX_DATA_URL_CHARS + 100, 'Das Logo ist zu groß.').optional(),
      text_de: req('Text (DE)', 1000),
      text_en: opt('Text (EN)', 1000),
      label_ad: z.boolean().optional(),
      active: z.boolean().optional(),
      exclusion_confirmed: z.boolean().optional(),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        const url = normalizePartnerUrl(input.url);
        if (!url) throw fieldError({ url: 'Bitte einen gültigen https-Link angeben.' });
        let logo: string | null;
        try {
          logo = normalizeImageValue(input.logo, { demo: isDemoMode() });
        } catch (e) {
          throw fieldError({ logo: e instanceof Error ? e.message : 'Ungültiges Logo.' });
        }
        const hits = exclusionHits(input.name, input.text_de, input.text_en, url);
        if (hits.length > 0 && !input.exclusion_confirmed) {
          throw fieldError({
            exclusion_confirmed: `Hinweis auf die Ausschlussliste (${hits.join(', ')}). Prüfe den Partner und bestätige, dass er nicht darunter fällt.`,
          });
        }
        const saved = await saveSortable(
          staff,
          'partners',
          input.id,
          {
            name: input.name,
            url,
            logo,
            text_de: input.text_de,
            text_en: orNull(input.text_en),
            label_ad: input.label_ad ?? false,
            active: input.active ?? false,
          },
          'Partner',
        );
        return { id: saved.id };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  partnerDelete: defineAction({
    accept: 'form',
    input: z.object({ id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        await deleteSortable(staff, 'partners', input.id, 'Partner');
        return { id: input.id };
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  partnerMove: defineAction({
    accept: 'form',
    input: z.object({ id, direction }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        return await moveSortable(staff, 'partners', input.id, input.direction, 'Partner');
      } catch (err) {
        toActionError(err);
      }
    },
  }),

  /** Texte der Startseite und des Anmeldestatus (öffentliche Einstellungen). */
  pageTextsSave: defineAction({
    accept: 'form',
    input: z.object({
      claim_de: req('Claim (DE)', 200),
      claim_en: req('Claim (EN)', 200),
      registration_state: z.enum(['open', 'waitlist', 'closed'], { error: 'Bitte einen Anmeldestatus wählen.' }),
      free_seats: z.number({ error: 'Zahl angeben.' }).int().min(0).max(22),
      free_reserve: z.number({ error: 'Zahl angeben.' }).int().min(0).max(99),
      note_de: opt('Hinweis (DE)', 300),
      note_en: opt('Hinweis (EN)', 300),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      const store = getServiceStore();
      try {
        const before = await readPublicSettings(store);
        const home = { claim_de: input.claim_de, claim_en: input.claim_en };
        const registration = {
          state: input.registration_state,
          free_seats: input.free_seats,
          free_reserve: input.free_reserve,
          note_de: orNull(input.note_de),
          note_en: orNull(input.note_en),
        };
        await patchSetting(store, 'home', home);
        await patchSetting(store, 'registration', registration);
        await audit(store, staff, 'update', 'settings', 'home,registration', { home: before.home, registration: before.registration }, { home, registration });
        await requestRebuild(store, 'Texte der Startseite/Anmeldestatus');
        return { ok: true };
      } catch (err) {
        toActionError(err);
      }
    },
  }),
};

export const contentActions = {
  ...newsActions,
  ...rulesActions,
  ...inhalteActions,
};

