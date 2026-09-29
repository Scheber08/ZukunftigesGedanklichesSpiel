/**
 * Lobby-Einstellungen einer Saison (Plan §2.1, §6.1 `seasons.lobby_settings`):
 * Gruppen mit Einträgen (DE/EN) plus „So trittst du bei“-Schritte.
 * Zwei Eingabewege im Admin: einfache Formularfelder oder JSON – beide landen hier.
 */
import type { LobbySettings } from '~/lib/db/types';
import { lines, textOrNull } from './forms';

type Group = NonNullable<LobbySettings['groups']>[number];
type Item = Group['items'][number];

export interface LobbyParseResult {
  value: LobbySettings | null;
  errors: string[];
}

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Schlüssel einer Gruppe aus dem Titel ableiten, falls leer. */
export function groupKey(title: string, taken: ReadonlySet<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'gruppe';
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;
  return key;
}

/** Strukturprüfung eines beliebigen Werts (z. B. aus JSON). */
export function validateLobby(input: unknown): LobbyParseResult {
  const errors: string[] = [];
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: ['Erwartet wird ein JSON-Objekt mit „groups“ (Liste).'] };
  }
  const obj = input as Record<string, unknown>;
  const allowed = new Set(['groups', 'join_steps_de', 'join_steps_en']);
  for (const k of Object.keys(obj)) if (!allowed.has(k)) errors.push(`Unbekanntes Feld „${k}“.`);

  const groups: Group[] = [];
  if (obj.groups !== undefined) {
    if (!Array.isArray(obj.groups)) errors.push('„groups“ muss eine Liste sein.');
    else {
      const keys = new Set<string>();
      obj.groups.forEach((g, gi) => {
        const where = `Gruppe ${gi + 1}`;
        if (g == null || typeof g !== 'object' || Array.isArray(g)) {
          errors.push(`${where}: muss ein Objekt sein.`);
          return;
        }
        const gr = g as Record<string, unknown>;
        const title_de = str(gr.title_de)?.trim() ?? '';
        if (!title_de) errors.push(`${where}: „title_de“ fehlt.`);
        let key = str(gr.key)?.trim() ?? '';
        if (!key) key = groupKey(title_de, keys);
        if (!KEY_RE.test(key)) errors.push(`${where}: Schlüssel „${key}“ – nur a–z, 0–9, - und _.`);
        if (keys.has(key)) errors.push(`${where}: Schlüssel „${key}“ ist doppelt.`);
        keys.add(key);
        if (!Array.isArray(gr.items)) {
          errors.push(`${where}: „items“ muss eine Liste sein.`);
          return;
        }
        const items: Item[] = [];
        gr.items.forEach((it, ii) => {
          const w = `${where}, Eintrag ${ii + 1}`;
          if (it == null || typeof it !== 'object' || Array.isArray(it)) {
            errors.push(`${w}: muss ein Objekt sein.`);
            return;
          }
          const r = it as Record<string, unknown>;
          const label_de = str(r.label_de)?.trim() ?? '';
          const value_de = str(r.value_de)?.trim() ?? '';
          if (!label_de) errors.push(`${w}: „label_de“ fehlt.`);
          if (!value_de) errors.push(`${w}: „value_de“ fehlt.`);
          for (const f of ['label_en', 'value_en'] as const) {
            if (r[f] != null && typeof r[f] !== 'string') errors.push(`${w}: „${f}“ muss Text sein.`);
          }
          items.push({
            label_de,
            label_en: textOrNull(str(r.label_en)),
            value_de,
            value_en: textOrNull(str(r.value_en)),
          });
        });
        groups.push({ key, title_de, title_en: textOrNull(str(gr.title_en)), items });
      });
    }
  }

  const steps = (field: 'join_steps_de' | 'join_steps_en'): string[] | undefined => {
    const v = obj[field];
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.some((s) => typeof s !== 'string')) {
      errors.push(`„${field}“ muss eine Liste von Texten sein.`);
      return undefined;
    }
    return (v as string[]).map((s) => s.trim()).filter((s) => s !== '');
  };
  const join_steps_de = steps('join_steps_de');
  const join_steps_en = steps('join_steps_en');

  if (errors.length > 0) return { value: null, errors };
  const value: LobbySettings = { groups };
  if (join_steps_de) value.join_steps_de = join_steps_de;
  if (join_steps_en) value.join_steps_en = join_steps_en;
  return { value, errors: [] };
}

export function parseLobbyJson(text: string): LobbyParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { value: null, errors: [`Kein gültiges JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }
  return validateLobby(data);
}

/**
 * Einfache Formular-Oberfläche → Lobby-Einstellungen. Feldnamen:
 * `g{i}.key`, `g{i}.title_de`, `g{i}.title_en`, `g{i}.remove`,
 * `g{i}.i{j}.label_de|label_en|value_de|value_en|remove`, `join_steps_de`, `join_steps_en` (je Zeile ein Schritt).
 * Komplett leere Zeilen werden ignoriert, damit das Formular Platz für neue Einträge bieten kann.
 */
export function lobbyFromFields(fields: ReadonlyMap<string, string>): LobbyParseResult {
  const groupIdx = new Set<number>();
  for (const k of fields.keys()) {
    const m = /^g(\d+)\./.exec(k);
    if (m) groupIdx.add(Number(m[1]));
  }
  const get = (k: string) => (fields.get(k) ?? '').trim();
  const groups: unknown[] = [];
  for (const gi of [...groupIdx].sort((a, b) => a - b)) {
    if (fields.has(`g${gi}.remove`)) continue;
    const itemIdx = new Set<number>();
    for (const k of fields.keys()) {
      const m = new RegExp(`^g${gi}\\.i(\\d+)\\.`).exec(k);
      if (m) itemIdx.add(Number(m[1]));
    }
    const items: unknown[] = [];
    for (const ii of [...itemIdx].sort((a, b) => a - b)) {
      const p = `g${gi}.i${ii}.`;
      if (fields.has(`${p}remove`)) continue;
      const item = {
        label_de: get(`${p}label_de`),
        label_en: get(`${p}label_en`),
        value_de: get(`${p}value_de`),
        value_en: get(`${p}value_en`),
      };
      if (Object.values(item).every((v) => v === '')) continue;
      items.push(item);
    }
    const title_de = get(`g${gi}.title_de`);
    const title_en = get(`g${gi}.title_en`);
    const key = get(`g${gi}.key`);
    if (!title_de && !title_en && !key && items.length === 0) continue;
    groups.push({ key, title_de, title_en, items });
  }
  const value: Record<string, unknown> = { groups };
  if (fields.has('join_steps_de')) value.join_steps_de = lines(fields.get('join_steps_de'));
  if (fields.has('join_steps_en')) value.join_steps_en = lines(fields.get('join_steps_en'));
  return validateLobby(value);
}

export function lobbyStats(lobby: LobbySettings | null | undefined): { groups: number; items: number; missingEn: number } {
  const groups = lobby?.groups ?? [];
  let items = 0;
  let missingEn = 0;
  for (const g of groups) {
    if (!g.title_en) missingEn++;
    for (const it of g.items) {
      items++;
      if (!it.label_en || !it.value_en) missingEn++;
    }
  }
  return { groups: groups.length, items, missingEn };
}
