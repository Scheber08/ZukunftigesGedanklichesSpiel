/**
 * Regelwerk-Redaktion (Plan §4.8, §5): Versionen, §-Struktur, Anker, Reihenfolge,
 * Kopie einer Version und Prüfungen vor dem Veröffentlichen.
 * Reine Funktionen, getestet in tests/unit/admin-content-rules.test.ts.
 *
 * Reihenfolge: `sort` ordnet Abschnitte innerhalb ihrer Geschwister (wie `League.rulesTree`).
 * Nach jeder Änderung wird in Baum-Reihenfolge (Tiefensuche) auf 10, 20, 30 … normalisiert.
 */
import type { RulesSectionRow, RulesVersionRow } from '~/lib/db/types';
import type { MoveDirection, SortUpdate } from './order';
import { SORT_STEP } from './order';

export type SectionLike = Pick<RulesSectionRow, 'id' | 'parent_id' | 'number' | 'anchor' | 'sort'>;

export const ANCHOR_RE = /^[a-z][a-z0-9-]{0,62}$/;
export const VERSION_RE = /^\d{1,3}(\.\d{1,3}){0,2}$/;
export const NUMBER_RE = /^§\s?\d{1,3}(\.\d{1,3}){0,3}[a-z]?$/;

// --------------------------------------------------------------------------- Nummer & Anker

/** „3.2“ oder „§ 3.2“ → „§3.2“. */
export function normalizeNumber(input: string): string {
  const trimmed = input.trim().replace(/^§\s*/, '').replace(/\s+/g, '');
  return trimmed === '' ? '' : `§${trimmed}`;
}

/** „§3.2“ → „p3-2“ (stabiler URL-Anker wie im Seed). */
export function anchorFromNumber(number: string): string {
  const core = normalizeNumber(number).replace(/^§/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return core === '' ? '' : `p${core}`;
}

/** Eingabe in einen gültigen Anker umformen (Kleinbuchstaben, Ziffern, Bindestriche). */
export function normalizeAnchor(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface SectionConflicts {
  number?: string;
  anchor?: string;
}

/** Nummer und Anker müssen je Version eindeutig sein (DB: unique (version_id, number|anchor)). */
export function sectionConflicts(
  sections: readonly SectionLike[],
  candidate: { id?: number | null; number: string; anchor: string },
): SectionConflicts {
  const out: SectionConflicts = {};
  if (!NUMBER_RE.test(candidate.number)) out.number = 'Nummer im Format „§3“ oder „§3.2“ angeben.';
  if (!ANCHOR_RE.test(candidate.anchor)) {
    out.anchor = 'Anker: Kleinbuchstaben, Ziffern und Bindestriche, beginnend mit einem Buchstaben (z. B. „p3-2“).';
  }
  const others = sections.filter((s) => s.id !== candidate.id);
  const sameNumber = others.find((s) => s.number === candidate.number);
  if (!out.number && sameNumber) out.number = `Die Nummer ${candidate.number} ist in dieser Version schon vergeben.`;
  const sameAnchor = others.find((s) => s.anchor === candidate.anchor);
  if (!out.anchor && sameAnchor) out.anchor = `Der Anker „${candidate.anchor}“ gehört schon zu ${sameAnchor.number}.`;
  return out;
}

/** Doppelte Anker/Nummern in einer ganzen Version (Prüfung vor dem Veröffentlichen). */
export function duplicateKeys(sections: readonly SectionLike[]): { anchors: string[]; numbers: string[] } {
  const dup = (values: string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
  return { anchors: dup(sections.map((s) => s.anchor)), numbers: dup(sections.map((s) => s.number)) };
}

// --------------------------------------------------------------------------- Baum

export interface FlatSection<T extends SectionLike = SectionLike> {
  section: T;
  depth: number;
  /** Position unter den Geschwistern */
  index: number;
  siblings: number;
}

function childrenOf<T extends SectionLike>(sections: readonly T[]): Map<number | null, T[]> {
  const ids = new Set(sections.map((s) => s.id));
  const map = new Map<number | null, T[]>();
  for (const s of sections) {
    // Verwaiste Abschnitte (Eltern gelöscht) wie Kapitel behandeln
    const parent = s.parent_id != null && ids.has(s.parent_id) ? s.parent_id : null;
    const list = map.get(parent);
    if (list) list.push(s);
    else map.set(parent, [s]);
  }
  for (const list of map.values()) list.sort((a, b) => a.sort - b.sort || a.id - b.id);
  return map;
}

/** Baum in Tiefensuche-Reihenfolge mit Tiefe und Geschwister-Position (für Listen). */
export function flattenSections<T extends SectionLike>(sections: readonly T[]): FlatSection<T>[] {
  const children = childrenOf(sections);
  const out: FlatSection<T>[] = [];
  const seen = new Set<number>();
  const walk = (parent: number | null, depth: number) => {
    const list = children.get(parent) ?? [];
    list.forEach((section, index) => {
      if (seen.has(section.id)) return; // Schutz vor Zyklen
      seen.add(section.id);
      out.push({ section, depth, index, siblings: list.length });
      walk(section.id, depth + 1);
    });
  };
  walk(null, 0);
  return out;
}

/** Alle Nachfahren eines Abschnitts (ohne ihn selbst). */
export function descendantIds(sections: readonly SectionLike[], id: number): number[] {
  const children = childrenOf(sections);
  const out: number[] = [];
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const s = stack.pop()!;
    if (out.includes(s.id) || s.id === id) continue;
    out.push(s.id);
    stack.push(...(children.get(s.id) ?? []));
  }
  return out;
}

/** Mögliche Eltern-Abschnitte: nicht der Abschnitt selbst und keiner seiner Nachfahren. */
export function parentOptions<T extends SectionLike>(sections: readonly T[], selfId?: number | null): FlatSection<T>[] {
  const excluded = new Set(selfId != null ? [selfId, ...descendantIds(sections, selfId)] : []);
  return flattenSections(sections).filter((f) => !excluded.has(f.section.id));
}

/** Würde der neue Eltern-Abschnitt einen Zyklus erzeugen? */
export function isInvalidParent(sections: readonly SectionLike[], selfId: number | null | undefined, parentId: number | null): boolean {
  if (parentId == null) return false;
  if (!sections.some((s) => s.id === parentId)) return true;
  if (selfId == null) return false;
  return parentId === selfId || descendantIds(sections, selfId).includes(parentId);
}

/** Sort-Werte in Baum-Reihenfolge (10, 20, 30 …) – nur geänderte Zeilen. */
export function normalizeSectionSorts(sections: readonly SectionLike[]): SortUpdate[] {
  return flattenSections(sections)
    .map((f, i) => ({ id: f.section.id, sort: (i + 1) * SORT_STEP, before: f.section.sort }))
    .filter((u) => u.sort !== u.before)
    .map(({ id, sort }) => ({ id, sort }));
}

/** `sort` für einen neuen Abschnitt am Ende seiner Geschwister. */
export function nextSectionSort(sections: readonly SectionLike[]): number {
  return sections.reduce((m, s) => Math.max(m, s.sort), 0) + SORT_STEP;
}

/**
 * Abschnitt unter seinen Geschwistern hoch/runter schieben. Liefert die normalisierten
 * Sort-Updates für die ganze Version oder null, wenn es nicht geht.
 */
export function moveSection(sections: readonly SectionLike[], id: number, direction: MoveDirection): SortUpdate[] | null {
  const self = sections.find((s) => s.id === id);
  if (!self) return null;
  const children = childrenOf(sections);
  const key = parentKey(self, sections);
  const siblings = [...(children.get(key) ?? [])];
  const pos = siblings.findIndex((s) => s.id === id);
  const target = direction === 'up' ? pos - 1 : pos + 1;
  if (pos < 0 || target < 0 || target >= siblings.length) return null;
  const a = siblings[pos]!;
  const b = siblings[target]!;
  // Normalfall: Sort-Werte der beiden Nachbarn tauschen – nur zwei Zeilen ändern sich
  const tie = siblings.some((s) => s.id !== a.id && s.id !== b.id && (s.sort === a.sort || s.sort === b.sort));
  if (a.sort !== b.sort && !tie) {
    return [
      { id: a.id, sort: b.sort },
      { id: b.id, sort: a.sort },
    ];
  }
  // Gleiche Sort-Werte (Altbestand): ganze Version in Baum-Reihenfolge normalisieren
  [siblings[pos], siblings[target]] = [b, a];
  children.set(key, siblings);
  const original = new Map(sections.map((s) => [s.id, s.sort]));
  return dfsOrder(children)
    .map((s, i) => ({ id: s.id, sort: (i + 1) * SORT_STEP }))
    .filter((u) => original.get(u.id) !== u.sort);
}

function dfsOrder<T extends SectionLike>(children: Map<number | null, T[]>): T[] {
  const out: T[] = [];
  const seen = new Set<number>();
  const walk = (parent: number | null) => {
    for (const s of children.get(parent) ?? []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
      walk(s.id);
    }
  };
  walk(null);
  return out;
}

function parentKey(section: SectionLike, sections: readonly SectionLike[]): number | null {
  return section.parent_id != null && sections.some((s) => s.id === section.parent_id) ? section.parent_id : null;
}

// --------------------------------------------------------------------------- Versionen

/** Abschnitte in Ebenen (Kapitel zuerst), damit beim Kopieren Eltern vor Kindern angelegt werden. */
export function copyLevels<T extends SectionLike>(sections: readonly T[]): T[][] {
  const levels: T[][] = [];
  for (const f of flattenSections(sections)) {
    (levels[f.depth] ??= []).push(f.section);
  }
  return levels;
}

/** Kopie-Zeile eines Abschnitts für eine neue Version (Eltern-ID über die ID-Zuordnung). */
export function copySectionRow(
  section: Pick<RulesSectionRow, 'parent_id' | 'number' | 'anchor' | 'title_de' | 'title_en' | 'body_de' | 'body_en' | 'sort'>,
  versionId: number,
  idMap: ReadonlyMap<number, number>,
): Omit<RulesSectionRow, 'id' | 'created_at' | 'updated_at'> {
  const parent = section.parent_id != null ? (idMap.get(section.parent_id) ?? null) : null;
  return {
    version_id: versionId,
    parent_id: parent,
    number: section.number,
    anchor: section.anchor,
    title_de: section.title_de,
    title_en: section.title_en,
    body_de: section.body_de,
    body_en: section.body_en,
    sort: section.sort,
  };
}

/** Nächste Versionsnummer vorschlagen: höchste „x.y“ + 0.1 (bzw. „1.0“ ohne Versionen). */
export function suggestNextVersion(existing: readonly string[]): string {
  const parsed = existing
    .map((v) => /^(\d+)(?:\.(\d+))?/.exec(v.trim()))
    .filter((m): m is RegExpExecArray => m != null)
    .map((m) => [Number(m[1]), Number(m[2] ?? 0)] as const)
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const top = parsed[0];
  if (!top) return '1.0';
  let candidate = `${top[0]}.${top[1] + 1}`;
  const taken = new Set(existing.map((v) => v.trim()));
  for (let minor = top[1] + 2; taken.has(candidate); minor++) candidate = `${top[0]}.${minor}`;
  return candidate;
}

export const RULES_STATUS_LABELS: Record<RulesVersionRow['status'], string> = {
  draft: 'Entwurf',
  published: 'Veröffentlicht',
  archived: 'Archiviert',
};

/** Pflichtangaben und Prüfungen vor dem Veröffentlichen. */
export function publishChecks(
  input: { changelog_de: string | null | undefined; effective_from: string | null | undefined },
  sections: readonly (SectionLike & Pick<RulesSectionRow, 'title_de'>)[],
): { fields: Record<string, string>; problems: string[] } {
  const fields: Record<string, string> = {};
  const problems: string[] = [];
  if (!input.changelog_de || input.changelog_de.trim() === '') fields.changelog_de = 'Der Changelog (DE) ist Pflicht.';
  if (!input.effective_from || !/^\d{4}-\d{2}-\d{2}$/.test(input.effective_from)) fields.effective_from = 'Bitte das Datum „gilt ab“ angeben.';
  if (sections.length === 0) problems.push('Die Version hat noch keine Abschnitte.');
  const { anchors, numbers } = duplicateKeys(sections);
  if (anchors.length > 0) problems.push(`Doppelte Anker: ${anchors.join(', ')}`);
  if (numbers.length > 0) problems.push(`Doppelte Nummern: ${numbers.join(', ')}`);
  const badAnchors = sections.filter((s) => !ANCHOR_RE.test(s.anchor)).map((s) => s.number);
  if (badAnchors.length > 0) problems.push(`Ungültige Anker bei ${badAnchors.join(', ')}`);
  const noTitle = sections.filter((s) => !s.title_de || s.title_de.trim() === '').map((s) => s.number);
  if (noTitle.length > 0) problems.push(`Titel (DE) fehlt bei ${noTitle.join(', ')}`);
  return { fields, problems };
}

/** Ist die Versionsnummer schon an eine andere Version vergeben? */
export function versionTaken(versions: ReadonlyArray<Pick<RulesVersionRow, 'id' | 'version'>>, version: string, selfId?: number | null): boolean {
  const wanted = version.trim();
  return versions.some((v) => v.id !== selfId && v.version.trim() === wanted);
}

/**
 * Anker der bisher gültigen Fassung, die es im Entwurf nicht mehr gibt. Geteilte Links wie
 * /liga/regelwerk#p3-2 landen nach dem Veröffentlichen sonst oben auf der Seite
 * (Hinweis, keine Sperre – Kapitel dürfen wegfallen).
 */
export function removedAnchors(
  previous: readonly Pick<RulesSectionRow, 'anchor' | 'number' | 'title_de'>[],
  draft: readonly Pick<RulesSectionRow, 'anchor'>[],
): Array<{ anchor: string; number: string; title: string }> {
  const kept = new Set(draft.map((s) => s.anchor));
  return previous.filter((s) => !kept.has(s.anchor)).map((s) => ({ anchor: s.anchor, number: s.number, title: s.title_de }));
}

/** IDs der bisher veröffentlichten Versionen, die beim Veröffentlichen archiviert werden. */
export function versionsToArchive(versions: ReadonlyArray<Pick<RulesVersionRow, 'id' | 'status'>>, publishId: number): number[] {
  return versions.filter((v) => v.status === 'published' && v.id !== publishId).map((v) => v.id);
}
