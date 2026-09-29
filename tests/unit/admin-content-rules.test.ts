import { describe, expect, it } from 'vitest';
import {
  anchorFromNumber,
  copyLevels,
  copySectionRow,
  descendantIds,
  duplicateKeys,
  flattenSections,
  isInvalidParent,
  moveSection,
  nextSectionSort,
  normalizeAnchor,
  normalizeNumber,
  normalizeSectionSorts,
  parentOptions,
  publishChecks,
  sectionConflicts,
  suggestNextVersion,
  versionsToArchive,
} from '~/lib/admin/content/rules';

type S = { id: number; parent_id: number | null; number: string; anchor: string; sort: number; title_de: string };

// §1 (1.1, 1.2), §2 (2.1), §3 – Sort-Werte wie im Seed (fortlaufend in Baum-Reihenfolge)
const SECTIONS: S[] = [
  { id: 1, parent_id: null, number: '§1', anchor: 'p1', sort: 0, title_de: 'Grundlagen' },
  { id: 2, parent_id: 1, number: '§1.1', anchor: 'p1-1', sort: 1, title_de: 'Geltung' },
  { id: 3, parent_id: 1, number: '§1.2', anchor: 'p1-2', sort: 2, title_de: 'Begriffe' },
  { id: 4, parent_id: null, number: '§2', anchor: 'p2', sort: 3, title_de: 'Anmeldung' },
  { id: 5, parent_id: 4, number: '§2.1', anchor: 'p2-1', sort: 4, title_de: 'Ablauf' },
  { id: 6, parent_id: null, number: '§3', anchor: 'p3', sort: 5, title_de: 'Fahrverhalten' },
];

const order = (list: S[]) => flattenSections(list).map((f) => f.section.number);
const apply = (list: S[], updates: Array<{ id: number; sort: number }>) =>
  list.map((s) => ({ ...s, sort: updates.find((u) => u.id === s.id)?.sort ?? s.sort }));

describe('Nummern und Anker', () => {
  it('normalisiert Nummern und leitet Anker ab', () => {
    expect(normalizeNumber('3.2')).toBe('§3.2');
    expect(normalizeNumber(' § 3.2 ')).toBe('§3.2');
    expect(normalizeNumber('')).toBe('');
    expect(anchorFromNumber('§3.2')).toBe('p3-2');
    expect(anchorFromNumber('§10')).toBe('p10');
    expect(normalizeAnchor('#P3.2 Track Limits')).toBe('p3-2-track-limits');
  });

  it('prüft Format und Eindeutigkeit je Version', () => {
    expect(sectionConflicts(SECTIONS, { number: '§4', anchor: 'p4' })).toEqual({});
    expect(sectionConflicts(SECTIONS, { number: '§1.1', anchor: 'p1-1' })).toMatchObject({
      number: expect.stringContaining('schon vergeben'),
      anchor: expect.stringContaining('§1.1'),
    });
    // eigener Abschnitt kollidiert nicht mit sich selbst
    expect(sectionConflicts(SECTIONS, { id: 2, number: '§1.1', anchor: 'p1-1' })).toEqual({});
    expect(sectionConflicts(SECTIONS, { number: 'drei', anchor: '3-a' })).toMatchObject({ number: expect.any(String), anchor: expect.any(String) });
  });

  it('findet doppelte Anker und Nummern', () => {
    const dup = [...SECTIONS, { id: 7, parent_id: null, number: '§3', anchor: 'p1', sort: 9, title_de: 'x' }];
    expect(duplicateKeys(dup)).toEqual({ anchors: ['p1'], numbers: ['§3'] });
  });
});

describe('Baum und Struktur', () => {
  it('liefert Tiefensuche mit Tiefe und Geschwister-Position', () => {
    const flat = flattenSections(SECTIONS);
    expect(flat.map((f) => [f.section.number, f.depth, f.index, f.siblings])).toEqual([
      ['§1', 0, 0, 3],
      ['§1.1', 1, 0, 2],
      ['§1.2', 1, 1, 2],
      ['§2', 0, 1, 3],
      ['§2.1', 1, 0, 1],
      ['§3', 0, 2, 3],
    ]);
  });

  it('behandelt verwaiste Abschnitte wie Kapitel', () => {
    const orphan = [...SECTIONS, { id: 9, parent_id: 99, number: '§9', anchor: 'p9', sort: 1, title_de: 'x' }];
    expect(flattenSections(orphan).find((f) => f.section.id === 9)?.depth).toBe(0);
  });

  it('verhindert Zyklen bei der Wahl des Eltern-Abschnitts', () => {
    expect(descendantIds(SECTIONS, 1).sort()).toEqual([2, 3]);
    expect(parentOptions(SECTIONS, 1).map((f) => f.section.id)).toEqual([4, 5, 6]);
    expect(isInvalidParent(SECTIONS, 1, 2)).toBe(true);
    expect(isInvalidParent(SECTIONS, 1, 1)).toBe(true);
    expect(isInvalidParent(SECTIONS, 2, 4)).toBe(false);
    expect(isInvalidParent(SECTIONS, null, 99)).toBe(true);
    expect(isInvalidParent(SECTIONS, 2, null)).toBe(false);
  });

  it('verschiebt Kapitel samt Unterabschnitten', () => {
    const updates = moveSection(SECTIONS, 4, 'up')!;
    expect(order(apply(SECTIONS, updates))).toEqual(['§2', '§2.1', '§1', '§1.1', '§1.2', '§3']);
    // Nur die beiden Nachbarn tauschen ihre Sort-Werte
    expect(updates).toEqual([
      { id: 4, sort: 0 },
      { id: 1, sort: 3 },
    ]);
  });

  it('verschiebt nur innerhalb der Geschwister', () => {
    const down = moveSection(SECTIONS, 2, 'down')!;
    expect(order(apply(SECTIONS, down))).toEqual(['§1', '§1.2', '§1.1', '§2', '§2.1', '§3']);
    expect(moveSection(SECTIONS, 3, 'down')).toBeNull(); // letzter in §1
    expect(moveSection(SECTIONS, 1, 'up')).toBeNull();
    expect(moveSection(SECTIONS, 5, 'up')).toBeNull(); // einziges Kind
    expect(moveSection(SECTIONS, 42, 'up')).toBeNull();
  });

  it('löst gleiche Sort-Werte beim Verschieben auf', () => {
    const same = SECTIONS.map((s) => ({ ...s, sort: 0 }));
    const updates = moveSection(same, 6, 'up')!;
    expect(order(apply(same, updates))).toEqual(['§1', '§1.1', '§1.2', '§3', '§2', '§2.1']);
    // normalisiert auf 10er-Schritte
    expect(apply(same, updates).map((s) => s.sort).sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('normalisiert Sort-Werte und hängt neue Abschnitte hinten an', () => {
    const updates = normalizeSectionSorts(SECTIONS);
    expect(updates).toHaveLength(6);
    expect(normalizeSectionSorts(apply(SECTIONS, updates))).toEqual([]);
    expect(nextSectionSort(SECTIONS)).toBe(15);
    const added = [...SECTIONS, { id: 7, parent_id: 1, number: '§1.3', anchor: 'p1-3', sort: nextSectionSort(SECTIONS), title_de: 'Neu' }];
    expect(order(added)).toEqual(['§1', '§1.1', '§1.2', '§1.3', '§2', '§2.1', '§3']);
  });
});

describe('Versionen', () => {
  it('kopiert Abschnitte ebenenweise mit neuen Eltern-IDs', () => {
    const levels = copyLevels(SECTIONS);
    expect(levels.map((l) => l.map((s) => s.id))).toEqual([
      [1, 4, 6],
      [2, 3, 5],
    ]);
    // Simulierter Insert: neue IDs 101, 104, 106 für Kapitel
    const idMap = new Map<number, number>([
      [1, 101],
      [4, 104],
      [6, 106],
    ]);
    const full = { title_en: null, body_de: '', body_en: null };
    const row = copySectionRow({ ...SECTIONS[1]!, ...full }, 7, idMap);
    expect(row).toMatchObject({ version_id: 7, parent_id: 101, number: '§1.1', anchor: 'p1-1', sort: 1 });
    expect(copySectionRow({ ...SECTIONS[0]!, ...full }, 7, idMap).parent_id).toBeNull();
  });

  it('schlägt die nächste Versionsnummer vor', () => {
    expect(suggestNextVersion([])).toBe('1.0');
    expect(suggestNextVersion(['1.0'])).toBe('1.1');
    expect(suggestNextVersion(['1.0', '1.1', '2.0'])).toBe('2.1');
    expect(suggestNextVersion(['1.9', '1.10'])).toBe('1.11');
    expect(suggestNextVersion(['1.0', '1.2', '1.1'])).toBe('1.3');
  });

  it('prüft Pflichtangaben vor dem Veröffentlichen', () => {
    expect(publishChecks({ changelog_de: 'Neu', effective_from: '2026-11-01' }, SECTIONS)).toEqual({ fields: {}, problems: [] });
    const bad = publishChecks({ changelog_de: ' ', effective_from: '' }, []);
    expect(Object.keys(bad.fields).sort()).toEqual(['changelog_de', 'effective_from']);
    expect(bad.problems).toContain('Die Version hat noch keine Abschnitte.');
    const dup = publishChecks({ changelog_de: 'x', effective_from: '2026-11-01' }, [...SECTIONS, { ...SECTIONS[0]!, id: 8, number: '§8', title_de: '' }]);
    expect(dup.problems.join(' ')).toContain('Doppelte Anker: p1');
    expect(dup.problems.join(' ')).toContain('Titel (DE) fehlt bei §8');
  });

  it('archiviert beim Veröffentlichen die bisher gültige Version', () => {
    const versions = [
      { id: 1, status: 'archived' as const },
      { id: 2, status: 'published' as const },
      { id: 3, status: 'draft' as const },
    ];
    expect(versionsToArchive(versions, 3)).toEqual([2]);
    expect(versionsToArchive(versions, 2)).toEqual([]);
  });
});
