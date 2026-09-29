/**
 * Gezielte Store-Abfragen für die dynamischen Formularseiten und Actions
 * (keine ganze Liga laden, Plan §7.2). Nur serverseitig verwenden.
 */
import type { Store } from '../db/store';
import type { DriverRow, Id, RoundRow, SessionRow, SessionType, TrackRow } from '../db/types';
import { openProtestRounds } from './incident';

export interface OpenRound {
  round: RoundRow;
  track: TrackRow | undefined;
  seasonNumber: number | null;
}

const SESSION_ORDER: Record<SessionType, number> = { qualifying: 0, sprint: 1, race: 2 };

/** Runden mit offener Protestfrist inkl. Strecke, früheste Frist zuerst. */
export async function loadOpenRounds(store: Store, now: Date = new Date()): Promise<OpenRound[]> {
  const provisional = await store.select('rounds', { eq: { status: 'provisional' } });
  const open = openProtestRounds(provisional, now);
  if (open.length === 0) return [];
  const [tracks, seasons] = await Promise.all([
    store.select('tracks', { in: { id: [...new Set(open.map((r) => r.track_id))] } }),
    store.select('seasons', { in: { id: [...new Set(open.map((r) => r.season_id))] } }),
  ]);
  return open.map((round) => ({
    round,
    track: tracks.find((t) => t.id === round.track_id),
    seasonNumber: seasons.find((s) => s.id === round.season_id)?.number ?? null,
  }));
}

/** Sessions einer Runde in der Reihenfolge Qualifying, Sprint, Rennen. */
export async function loadRoundSessions(store: Store, roundId: Id): Promise<SessionRow[]> {
  const rows = await store.select('sessions', { eq: { round_id: roundId } });
  return rows.sort((a, b) => SESSION_ORDER[a.type] - SESSION_ORDER[b.type]);
}

export interface GridDriver {
  driverId: Id;
  gamertag: string;
  anonymized: boolean;
  number: number | null;
  teamId: Id;
  reserve: boolean;
}

/** Grid einer Runde (round_entries) mit Gamertags, alphabetisch. */
export async function loadRoundGrid(store: Store, roundId: Id): Promise<GridDriver[]> {
  const entries = await store.select('round_entries', { eq: { round_id: roundId } });
  if (entries.length === 0) return [];
  const drivers = await store.select('drivers', { in: { id: [...new Set(entries.map((e) => e.driver_id))] } });
  const byId = new Map<Id, DriverRow>(drivers.map((d) => [d.id, d]));
  return entries
    .map((e) => {
      const d = byId.get(e.driver_id);
      return {
        driverId: e.driver_id,
        gamertag: d?.gamertag ?? `#${e.driver_id}`,
        anonymized: d?.anonymized ?? false,
        number: e.race_number,
        teamId: e.team_id,
        reserve: e.role === 'reserve',
      };
    })
    .sort((a, b) => a.gamertag.localeCompare(b.gamertag, 'de', { sensitivity: 'base' }));
}

/** Gültige Regelwerk-Version (für die Einwilligung): die der aktiven Saison, sonst die neueste veröffentlichte. */
export async function currentRulesVersion(store: Store): Promise<string | null> {
  const [versions, active] = await Promise.all([
    store.select('rules_versions', { eq: { status: 'published' } }),
    store.select('seasons', { eq: { status: 'active' }, limit: 1 }),
  ]);
  const sorted = versions.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  const seasonVersion = active[0]?.rules_version_id;
  return (sorted.find((v) => v.id === seasonVersion) ?? sorted[0])?.version ?? null;
}
