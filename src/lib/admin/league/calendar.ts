/**
 * Kalender-Logik (Plan §5 „Kalender“): Termine im Stapel, Sessions je Format,
 * Ortszeit-Felder. Reine Funktionen ohne I/O.
 */
import type { Id, RoundFormat, SessionRow, SessionType, TrackRow } from '~/lib/db/types';
import { isIsoDate, isTime } from './forms';

/** Sessions je Rennformat (Plan §6.1). */
export function sessionTypesFor(format: RoundFormat): SessionType[] {
  return format === 'sprint' ? ['qualifying', 'sprint', 'race'] : ['qualifying', 'race'];
}

/** „2026-11-05“ + „20:00“ → „2026-11-05T20:00:00“ (Ortszeit ohne Zone). */
export function localStartFrom(date: string, time: string): string {
  if (!isIsoDate(date)) throw new Error(`Ungültiges Datum: ${date}`);
  if (!isTime(time)) throw new Error(`Ungültige Uhrzeit: ${time}`);
  return `${date}T${time}:00`;
}

/** „2026-11-05T20:00:00“ → { date: "2026-11-05", time: "20:00" } */
export function splitLocalStart(local: string): { date: string; time: string } {
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

/** Wochentag (0 = Sonntag) eines Kalenderdatums. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface BatchInput {
  /** Erstes mögliches Datum (YYYY-MM-DD) */
  startDate: string;
  /** Wochentag 0–6 oder null = genau das Startdatum verwenden */
  weekday: number | null;
  /** Abstand in Tagen zwischen den Runden (7 = wöchentlich, 14 = alle zwei Wochen) */
  intervalDays: number;
  time: string;
  count: number;
  /** Termine, die übersprungen werden (z. B. Feiertage/Pausen) */
  skipDates?: readonly string[];
}

/**
 * Termine für die Stapel-Anlage: ab dem Startdatum (bzw. dem nächsten passenden
 * Wochentag) im festen Abstand; ausgelassene Termine verschieben die Serie um ein Intervall.
 */
export function batchDates(input: BatchInput): string[] {
  const { startDate, weekday, intervalDays, time, count } = input;
  if (!isIsoDate(startDate)) throw new Error('Ungültiges Startdatum');
  if (!isTime(time)) throw new Error('Ungültige Uhrzeit');
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 60) throw new Error('Ungültiger Abstand');
  if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error('Ungültige Anzahl');
  let first = startDate;
  if (weekday != null) {
    const diff = (weekday - weekdayOf(startDate) + 7) % 7;
    first = addDaysIso(startDate, diff);
  }
  const skip = new Set(input.skipDates ?? []);
  const out: string[] = [];
  let current = first;
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    if (!skip.has(current)) out.push(localStartFrom(current, time));
    current = addDaysIso(current, intervalDays);
  }
  return out;
}

export interface TrackLine {
  line: number;
  input: string;
  track: TrackRow | null;
  format: RoundFormat;
}

/**
 * Streckenliste der Stapel-Anlage: je Zeile eine Strecke (Name DE/EN oder Kürzel),
 * ein „*“ am Ende markiert ein Sprint-Wochenende.
 */
export function parseTrackList(text: string, tracks: readonly TrackRow[]): { items: TrackLine[]; unknown: string[] } {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '');
  const index = new Map<string, TrackRow>();
  for (const t of tracks) {
    for (const k of [t.slug, t.name_de, t.name_en]) if (k) index.set(norm(k), t);
  }
  const items: TrackLine[] = [];
  const unknown: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    let s = raw.trim();
    if (s === '') return;
    let format: RoundFormat = 'standard';
    if (s.endsWith('*')) {
      format = 'sprint';
      s = s.slice(0, -1).trim();
    }
    const track = index.get(norm(s)) ?? null;
    if (!track) unknown.push(`Zeile ${i + 1}: „${s}“`);
    items.push({ line: i + 1, input: s, track, format });
  });
  return { items, unknown };
}

export interface SessionPlan {
  create: SessionType[];
  /** Sessions ohne Ergebnisse, die zum neuen Format nicht mehr passen */
  remove: Id[];
  /** Überzählige Sessions mit Ergebnissen – werden nie gelöscht */
  keptWithResults: SessionType[];
}

/**
 * Sessions an ein (neues) Format anpassen: fehlende anlegen, überzählige löschen –
 * außer sie haben bereits Ergebnisse.
 */
export function planSessions(
  existing: ReadonlyArray<Pick<SessionRow, 'id' | 'type'>>,
  format: RoundFormat,
  sessionIdsWithResults: ReadonlySet<Id>,
): SessionPlan {
  const wanted = sessionTypesFor(format);
  const have = new Set(existing.map((s) => s.type));
  const create = wanted.filter((t) => !have.has(t));
  const remove: Id[] = [];
  const keptWithResults: SessionType[] = [];
  for (const s of existing) {
    if (wanted.includes(s.type)) continue;
    if (sessionIdsWithResults.has(s.id)) keptWithResults.push(s.type);
    else remove.push(s.id);
  }
  return { create, remove, keptWithResults };
}

export function nextRoundNumber(rounds: ReadonlyArray<{ number: number }>): number {
  return rounds.reduce((m, r) => Math.max(m, r.number), 0) + 1;
}
