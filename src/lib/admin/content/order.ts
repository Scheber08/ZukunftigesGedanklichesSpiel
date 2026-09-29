/**
 * Reihenfolge von Listen (FAQ, Orga-Team, offene Rollen, Partner): Hoch/Runter-Verschieben
 * mit anschließender Normalisierung der `sort`-Werte in Zehnerschritten.
 * Reine Funktionen ohne I/O – die Actions schreiben nur die geänderten Zeilen.
 */

export type MoveDirection = 'up' | 'down';

export interface Sortable {
  id: number;
  sort: number;
}

export interface SortUpdate {
  id: number;
  sort: number;
}

export const SORT_STEP = 10;

/** Stabile Sortierung nach `sort`, bei Gleichstand nach `id`. */
export function bySort<T extends Sortable>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.sort - b.sort || a.id - b.id);
}

/** `sort`-Wert für einen neuen Eintrag am Listenende. */
export function nextSort(items: readonly Sortable[]): number {
  const max = items.reduce((m, i) => Math.max(m, i.sort), -SORT_STEP);
  return Math.floor(max / SORT_STEP) * SORT_STEP + SORT_STEP;
}

/** Nur die Einträge, deren `sort` sich gegenüber der Ausgangslage ändert. */
export function diffSorts(items: readonly Sortable[], ordered: readonly Sortable[]): SortUpdate[] {
  const before = new Map(items.map((i) => [i.id, i.sort]));
  return ordered
    .map((item, index) => ({ id: item.id, sort: (index + 1) * SORT_STEP }))
    .filter((u) => before.get(u.id) !== u.sort);
}

/**
 * Verschiebt einen Eintrag um eine Position. Liefert die nötigen Updates
 * (normalisiert auf 10, 20, 30 …) oder `null`, wenn nichts zu tun ist
 * (unbekannte ID oder schon am Anfang/Ende).
 */
export function moveInList(items: readonly Sortable[], id: number, direction: MoveDirection): SortUpdate[] | null {
  const ordered = bySort(items);
  const index = ordered.findIndex((i) => i.id === id);
  if (index < 0) return null;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return null;
  const moved = [...ordered];
  [moved[index], moved[target]] = [moved[target]!, moved[index]!];
  return diffSorts(items, moved);
}

/** Position eines Eintrags für die Anzeige der Hoch/Runter-Knöpfe. */
export function positionInfo(items: readonly Sortable[], id: number): { first: boolean; last: boolean } {
  const ordered = bySort(items);
  const index = ordered.findIndex((i) => i.id === id);
  return { first: index <= 0, last: index < 0 || index === ordered.length - 1 };
}
