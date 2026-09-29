/**
 * Anzeige-Logik fürs Steward-Register (Plan §4.6): Strafen-Text, Regel-Anker und Filter.
 * Reine Funktionen – der Filter läuft auch im Browser (kleines gebündeltes Skript).
 */
import type { DecisionRow, Verdict } from '~/lib/db/types';

/** „§3.2“ → „p3-2“ (Anker im Regelwerk, siehe rules_sections.anchor). */
export function ruleAnchor(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = /(\d+(?:\.\d+)*)/.exec(ref);
  return m?.[1] ? `p${m[1].replace(/\./g, '-')}` : null;
}

export type PenaltyKey =
  | 'stewards.penalty.time'
  | 'stewards.penalty.positions'
  | 'stewards.penalty.grid'
  | 'stewards.penalty.dsq'
  | 'stewards.penalty.raceBan'
  | 'stewards.penalty.warning'
  | 'stewards.penalty.none';

/** Übersetzungsschlüssel und Zahl für die Strafe einer Entscheidung. */
export function penaltyOf(d: Pick<DecisionRow, 'verdict' | 'time_seconds' | 'positions'>): { key: PenaltyKey; n: number | null } {
  switch (d.verdict) {
    case 'time_penalty':
      return d.time_seconds ? { key: 'stewards.penalty.time', n: d.time_seconds } : { key: 'stewards.penalty.none', n: null };
    case 'position_penalty':
      return d.positions ? { key: 'stewards.penalty.positions', n: d.positions } : { key: 'stewards.penalty.none', n: null };
    case 'grid_penalty_next':
      return d.positions ? { key: 'stewards.penalty.grid', n: d.positions } : { key: 'stewards.penalty.none', n: null };
    case 'dsq':
      return { key: 'stewards.penalty.dsq', n: null };
    case 'race_ban':
      return { key: 'stewards.penalty.raceBan', n: null };
    case 'warning':
      return { key: 'stewards.penalty.warning', n: null };
    default:
      return { key: 'stewards.penalty.none', n: null };
  }
}

export type BadgeVariant = 'muted' | 'warning' | 'teal' | 'danger';

/** Badge-Farbe je Verdikt – immer zusammen mit dem Text (Farbe nie alleiniger Träger). */
export const VERDICT_VARIANT: Record<Verdict, BadgeVariant> = {
  no_action: 'muted',
  warning: 'warning',
  time_penalty: 'teal',
  position_penalty: 'teal',
  grid_penalty_next: 'teal',
  dsq: 'danger',
  race_ban: 'danger',
};

/**
 * Kurzbegründung als Klartext fürs Register: Markdown-Auszeichnung entfernen, aber Zeichen
 * innerhalb von Wörtern erhalten – Gamertags wie „Oversteer_Olli“, „V-02“ oder „Car #10“.
 */
export function plainExcerpt(source: string | null | undefined, maxLength = 200): string {
  if (!source) return '';
  const text = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|?[\s:|-]*-{3,}[\s:|-]*$/gm, ' ')
    .replace(/^\s*(?:\*\s*){3,}$/gm, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/g, '$1$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

// ---------------------------------------------------------------------------- Filter

/** Filter-Status (leer = alle). Werte: Saison-Slug, „<saison>-<runde>“, Fahrer-Slug, Verdikt. */
export interface DecisionFilter {
  season: string;
  round: string;
  driver: string;
  verdict: string;
}

export const FILTER_KEYS = ['season', 'round', 'driver', 'verdict'] as const satisfies ReadonlyArray<keyof DecisionFilter>;

export const EMPTY_FILTER: DecisionFilter = { season: '', round: '', driver: '', verdict: '' };

const SAFE_VALUE = /^[a-z0-9_-]{1,80}$/i;

/** Filter aus der URL-Query (?season=2&round=2-3&driver=…&verdict=…); Unbekanntes wird ignoriert. */
export function parseFilter(search: string): DecisionFilter {
  const params = new URLSearchParams(search);
  const out: DecisionFilter = { ...EMPTY_FILTER };
  for (const key of FILTER_KEYS) {
    const v = params.get(key)?.trim() ?? '';
    if (SAFE_VALUE.test(v)) out[key] = v;
  }
  return out;
}

/** Query-String für Teilen-Links (nur gesetzte Filter, feste Reihenfolge). */
export function filterToSearch(filter: DecisionFilter): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) if (filter[key]) params.set(key, filter[key]);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Wert einer Runde im Filter. */
export function roundFilterValue(seasonSlug: string, roundNumber: number): string {
  return `${seasonSlug}-${roundNumber}`;
}

export function matchesFilter(item: DecisionFilter, filter: DecisionFilter): boolean {
  return FILTER_KEYS.every((key) => filter[key] === '' || filter[key] === item[key]);
}

export function isFilterActive(filter: DecisionFilter): boolean {
  return FILTER_KEYS.some((key) => filter[key] !== '');
}
