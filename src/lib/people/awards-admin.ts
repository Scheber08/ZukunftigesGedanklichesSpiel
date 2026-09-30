/**
 * Auszeichnungen im Admin (/admin/auszeichnungen, Plan Phase 2): Driver of the Day je Runde,
 * Rookie of the Year je Saison. Reine Logik ohne I/O – die Actions in
 * src/actions/admin/awards.ts laden die Zeilen, planen hier und schreiben dann.
 * Getestet in tests/unit/awards-admin.test.ts.
 */

import type { AwardRow, AwardType, EntryRole, Id, ResultRow, ResultStatus, RoundRow, SeasonRow } from '../db/types';
import { RESULT_VISIBLE_STATUSES } from '../db/types';

// ---------------------------------------------------------------------------
// Driver of the Day
// ---------------------------------------------------------------------------

/** Driver of the Day nur für Runden mit veröffentlichtem Ergebnis (vorläufig, final, korrigiert). */
export function canHaveDotd(round: Pick<RoundRow, 'status'>): boolean {
  return RESULT_VISIBLE_STATUSES.includes(round.status);
}

export interface DotdCandidate {
  driverId: Id;
  teamId: Id;
  position: number | null;
  status: ResultStatus;
  role: EntryRole;
}

/** Auswahl aus dem Rennergebnis: gewertete nach Position, dann die übrigen in Eingabe-Reihenfolge. */
export function dotdCandidates(raceResults: ReadonlyArray<Pick<ResultRow, 'driver_id' | 'team_id' | 'position' | 'entered_position' | 'status' | 'role'>>): DotdCandidate[] {
  const seen = new Set<Id>();
  return [...raceResults]
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.entered_position - b.entered_position)
    .filter((r) => (seen.has(r.driver_id) ? false : (seen.add(r.driver_id), true)))
    .map((r) => ({ driverId: r.driver_id, teamId: r.team_id, position: r.position, status: r.status, role: r.role }));
}

// ---------------------------------------------------------------------------
// Speichern (eine Auszeichnung je Runde bzw. je Saison und Typ)
// ---------------------------------------------------------------------------

export type AwardTarget = Pick<AwardRow, 'season_id' | 'round_id' | 'type' | 'driver_id' | 'team_id'>;

export type AwardPlan =
  | { kind: 'insert'; row: AwardTarget; removeIds: Id[] }
  | { kind: 'update'; id: Id; before: AwardRow; patch: Pick<AwardRow, 'driver_id' | 'team_id'>; removeIds: Id[] }
  | { kind: 'noop'; id: Id; removeIds: Id[] };

/**
 * Vorhandene Auszeichnungen desselben Platzes (Runde bzw. Saison + Typ) auf genau eine bringen:
 * die älteste Zeile wird aktualisiert, weitere Dubletten entfernt.
 */
export function planAward(existing: readonly AwardRow[], target: AwardTarget): AwardPlan {
  const same = existing
    .filter((a) => a.type === target.type && a.season_id === target.season_id && (a.round_id ?? null) === (target.round_id ?? null))
    .sort((a, b) => a.id - b.id);
  const [keep, ...dupes] = same;
  const removeIds = dupes.map((a) => a.id);
  if (!keep) return { kind: 'insert', row: target, removeIds };
  if (keep.driver_id === target.driver_id && keep.team_id === target.team_id) return { kind: 'noop', id: keep.id, removeIds };
  return { kind: 'update', id: keep.id, before: keep, patch: { driver_id: target.driver_id, team_id: target.team_id }, removeIds };
}

/** Auszeichnungen eines Platzes (zum Entfernen). */
export function awardsAt(existing: readonly AwardRow[], type: AwardType, seasonId: Id, roundId: Id | null): AwardRow[] {
  return existing.filter((a) => a.type === type && a.season_id === seasonId && (a.round_id ?? null) === roundId);
}

// ---------------------------------------------------------------------------
// Rookie of the Year
// ---------------------------------------------------------------------------

export interface RookieCandidate {
  driverId: Id;
  /** Erste Saison mit Rennergebnis */
  debut: boolean;
  /** Team des letzten Rennens in der Saison */
  teamId: Id | null;
  races: number;
}

export interface SeasonResultRef {
  driverId: Id;
  teamId: Id;
  seasonId: Id;
  /** Zum Sortieren (z. B. Startzeit der Runde) */
  roundStart: string;
}

/**
 * Kandidaten: alle mit Rennergebnis in der Saison. Debütanten (vorher in keiner früheren Saison
 * gefahren) zuerst, sonst nach Namen.
 */
export function rookieCandidates(
  seasonId: Id,
  seasons: ReadonlyArray<Pick<SeasonRow, 'id' | 'number'>>,
  raceResults: readonly SeasonResultRef[],
  name: (driverId: Id) => string,
): RookieCandidate[] {
  const numberOf = new Map(seasons.map((s) => [s.id, s.number]));
  const current = numberOf.get(seasonId);
  if (current == null) return [];
  const byDriver = new Map<Id, { races: number; last: SeasonResultRef | null; earlier: boolean }>();
  for (const r of raceResults) {
    const n = numberOf.get(r.seasonId);
    if (n == null) continue;
    let d = byDriver.get(r.driverId);
    if (!d) {
      d = { races: 0, last: null, earlier: false };
      byDriver.set(r.driverId, d);
    }
    if (n < current) d.earlier = true;
    if (r.seasonId === seasonId) {
      d.races += 1;
      if (!d.last || r.roundStart >= d.last.roundStart) d.last = r;
    }
  }
  return [...byDriver.entries()]
    .filter(([, d]) => d.races > 0)
    .map(([driverId, d]) => ({ driverId, debut: !d.earlier, teamId: d.last?.teamId ?? null, races: d.races }))
    .sort((a, b) => Number(b.debut) - Number(a.debut) || name(a.driverId).localeCompare(name(b.driverId), 'de'));
}

// ---------------------------------------------------------------------------
// Meldungen nach dem Speichern (?ok=<code>)
// ---------------------------------------------------------------------------

export const AWARD_FLASH: Readonly<Record<string, string>> = {
  dotd_saved: 'Fahrer des Tages gespeichert.',
  dotd_unchanged: 'Unverändert – dieser Fahrer ist bereits Fahrer des Tages.',
  dotd_posted: 'Fahrer des Tages gespeichert und in Discord (#results) gepostet.',
  dotd_post_failed:
    'Fahrer des Tages gespeichert. Der Discord-Post hat nicht geklappt – ist der Webhook „results“ unter Einstellungen eingetragen?',
  dotd_removed: 'Fahrer des Tages entfernt.',
  rookie_saved: 'Rookie of the Year gespeichert.',
  rookie_unchanged: 'Unverändert – dieser Fahrer ist bereits Rookie of the Year.',
  rookie_removed: 'Rookie of the Year entfernt.',
};

/** Erfolgsmeldung zu `?ok=<code>` (nur bekannte Codes, sonst null). */
export function awardFlash(code: string | null | undefined): { text: string; warning: boolean } | null {
  if (!code || !Object.hasOwn(AWARD_FLASH, code)) return null;
  return { text: AWARD_FLASH[code]!, warning: code === 'dotd_post_failed' };
}

// ---------------------------------------------------------------------------
// Discord
// ---------------------------------------------------------------------------

/** Discord-Markdown in Namen entschärfen (Gamertags wie „Slipstream_Sam“). */
export function escapeDiscord(text: string): string {
  return text.replace(/([\\*_~`|>[\]])/g, '\\$1');
}

export interface DotdEmbedInput {
  roundLabel: string;
  seasonName: string;
  driverName: string;
  teamName: string | null;
  url: string;
}

/** Embed für #results (Farbe ergänzt der Server). */
export function dotdEmbed(input: DotdEmbedInput): { title: string; description: string; url: string; timestamp: string } {
  const team = input.teamName ? ` (${escapeDiscord(input.teamName)})` : '';
  return {
    title: `Fahrer des Tages: ${input.roundLabel}`,
    description: `**${escapeDiscord(input.driverName)}**${team} ist Fahrer des Tages – ${input.seasonName}, ${input.roundLabel}.`,
    url: input.url,
    timestamp: new Date().toISOString(),
  };
}
