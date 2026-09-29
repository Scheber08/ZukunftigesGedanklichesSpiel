/**
 * Gezielte Store-Abfragen für die Admin-Seiten des Renntags (dynamisch, kein loadLeague()).
 * Nur mit dem Service-Store nach Rollenprüfung aufrufen.
 */
import type { Store } from '../../db/store';
import type {
  DecisionRow,
  DriverRow,
  Id,
  IncidentRow,
  IncidentStatus,
  RoundCorrectionRow,
  RoundRow,
  SeasonRow,
  SessionRow,
  TrackRow,
} from '../../db/types';
import { RULES_V1, type RuleSectionSeed } from '../../seed/content/rules';
import { CATALOG_ANCHOR, parsePenaltyCatalog, type CatalogEntry } from './catalog';
import type { RoundFacts } from './steps';

export async function listSeasons(store: Store): Promise<SeasonRow[]> {
  return store.select('seasons', { order: { column: 'number', desc: true } });
}

/** Saison aus `?saison=<id>`, sonst die aktive, sonst die neueste. */
export function pickSeason(seasons: readonly SeasonRow[], param: string | null): SeasonRow | undefined {
  const byParam = param && /^\d{1,6}$/.test(param) ? seasons.find((s) => s.id === Number(param)) : undefined;
  return byParam ?? seasons.find((s) => s.status === 'active') ?? seasons[0];
}

export interface RoundOverview {
  round: RoundRow;
  track: TrackRow | undefined;
  facts: RoundFacts;
}

function factsFor(
  round: RoundRow,
  season: SeasonRow,
  sessions: readonly SessionRow[],
  entries: number,
  incidents: readonly IncidentRow[],
  decisions: readonly DecisionRow[],
  now: Date,
): RoundFacts {
  const own = sessions.filter((s) => s.round_id === round.id);
  return {
    roundId: round.id,
    status: round.status,
    entries,
    sessionsTotal: own.length,
    sessionsEntered: own.filter((s) => s.status === 'entered').length,
    openIncidents: incidents.filter((i) => i.round_id === round.id && (i.status === 'new' || i.status === 'in_review')).length,
    draftDecisions: decisions.filter((d) => d.round_id === round.id && d.status === 'draft').length,
    protestOpen: round.status === 'provisional' && round.protest_deadline != null && new Date(round.protest_deadline) > now,
    frozen: season.status === 'finished',
  };
}

/** Runden einer Saison mit Kennzahlen für Liste und Checkliste. */
export async function roundsOverview(store: Store, season: SeasonRow, now = new Date()): Promise<RoundOverview[]> {
  const rounds = (await store.select('rounds', { eq: { season_id: season.id } })).sort((a, b) => a.number - b.number);
  if (rounds.length === 0) return [];
  const ids = rounds.map((r) => r.id);
  const [tracks, sessions, entries, incidents, decisions] = await Promise.all([
    store.select('tracks', { in: { id: [...new Set(rounds.map((r) => r.track_id))] } }),
    store.select('sessions', { in: { round_id: ids } }),
    store.select('round_entries', { in: { round_id: ids } }),
    store.select('incidents', { in: { round_id: ids } }),
    store.select('decisions', { in: { round_id: ids } }),
  ]);
  return rounds.map((round) => ({
    round,
    track: tracks.find((t) => t.id === round.track_id),
    facts: factsFor(round, season, sessions, entries.filter((e) => e.round_id === round.id).length, incidents, decisions, now),
  }));
}

export interface RoundHub extends RoundOverview {
  season: SeasonRow;
  sessions: SessionRow[];
  corrections: RoundCorrectionRow[];
  absences: number;
  reserves: number;
  publishedDecisions: number;
  incidents: number;
}

export async function roundHub(store: Store, roundId: Id, now = new Date()): Promise<RoundHub | null> {
  const [round] = await store.select('rounds', { eq: { id: roundId } });
  if (!round) return null;
  const [[season], [track], sessions, entries, absences, incidents, decisions, corrections] = await Promise.all([
    store.select('seasons', { eq: { id: round.season_id } }),
    store.select('tracks', { eq: { id: round.track_id } }),
    store.select('sessions', { eq: { round_id: roundId } }),
    store.select('round_entries', { eq: { round_id: roundId } }),
    store.select('round_absences', { eq: { round_id: roundId } }),
    store.select('incidents', { eq: { round_id: roundId } }),
    store.select('decisions', { eq: { round_id: roundId } }),
    store.select('round_corrections', { eq: { round_id: roundId } }),
  ]);
  if (!season) return null;
  const order = { qualifying: 0, sprint: 1, race: 2 } as const;
  return {
    round,
    season,
    track,
    sessions: sessions.sort((a, b) => order[a.type] - order[b.type]),
    facts: factsFor(round, season, sessions, entries.length, incidents, decisions, now),
    corrections: corrections.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    absences: absences.length,
    reserves: entries.filter((e) => e.role === 'reserve').length,
    publishedDecisions: decisions.filter((d) => d.status === 'published').length,
    incidents: incidents.length,
  };
}

export interface IncidentListItem {
  incident: IncidentRow;
  round: RoundRow | undefined;
  track: TrackRow | undefined;
  session: SessionRow | undefined;
  decisions: DecisionRow[];
}

export interface StewardInbox {
  items: IncidentListItem[];
  /** Entscheidungen ohne Vorfall (eigene Untersuchungen alter Art, Altdaten) im Filter. */
  looseDecisions: DecisionRow[];
  rounds: RoundRow[];
  tracks: TrackRow[];
  drivers: Map<Id, DriverRow>;
  counts: Record<IncidentStatus | 'all', number>;
}

/** Eingang der Stewards: Vorfälle (optional nach Runde/Status gefiltert), neueste zuerst. */
export async function stewardInbox(
  store: Store,
  filter: { seasonId: Id | null; roundId: Id | null; status: IncidentStatus | null },
): Promise<StewardInbox> {
  const rounds = (filter.seasonId != null ? await store.select('rounds', { eq: { season_id: filter.seasonId } }) : await store.select('rounds')).sort(
    (a, b) => a.season_id - b.season_id || a.number - b.number,
  );
  const roundIds = filter.roundId != null ? [filter.roundId] : rounds.map((r) => r.id);
  if (roundIds.length === 0) {
    return { items: [], looseDecisions: [], rounds, tracks: [], drivers: new Map(), counts: { all: 0, new: 0, in_review: 0, decided: 0, rejected: 0, late: 0 } };
  }
  const [incidents, decisions, sessions, tracks, drivers] = await Promise.all([
    store.select('incidents', { in: { round_id: roundIds } }),
    store.select('decisions', { in: { round_id: roundIds } }),
    store.select('sessions', { in: { round_id: roundIds } }),
    store.select('tracks'),
    store.select('drivers'),
  ]);
  const counts: StewardInbox['counts'] = { all: incidents.length, new: 0, in_review: 0, decided: 0, rejected: 0, late: 0 };
  for (const i of incidents) counts[i.status] += 1;
  const allRounds = filter.roundId != null && !rounds.some((r) => r.id === filter.roundId) ? await store.select('rounds', { eq: { id: filter.roundId } }) : rounds;
  const items = incidents
    .filter((i) => filter.status == null || i.status === filter.status)
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at) || b.id - a.id)
    .map((incident) => {
      const round = allRounds.find((r) => r.id === incident.round_id);
      return {
        incident,
        round,
        track: tracks.find((t) => t.id === round?.track_id),
        session: sessions.find((s) => s.id === incident.session_id),
        decisions: decisions.filter((d) => d.incident_id === incident.id).sort((a, b) => a.public_ref.localeCompare(b.public_ref)),
      };
    });
  return {
    items,
    looseDecisions: decisions.filter((d) => d.incident_id == null).sort((a, b) => a.public_ref.localeCompare(b.public_ref)),
    rounds,
    tracks,
    drivers: new Map(drivers.map((d) => [d.id, d])),
    counts,
  };
}

// ---------------------------------------------------------------------------- Steward-Seiten

export interface StewardContext {
  round: RoundRow;
  season: SeasonRow;
  track: TrackRow | undefined;
  sessions: SessionRow[];
  drivers: Map<Id, DriverRow>;
  /** Auswahl für das Entscheidungsformular (Aufstellung der Runde + Beteiligte). */
  driverOptions: Array<{ id: Id; label: string }>;
  catalog: CatalogEntry[];
}

/** Strafenkatalog aus dem Regelwerk der Saison (§8.3), sonst aus dem mitgelieferten Regelwerk v1. */
export async function loadCatalog(store: Store, rulesVersionId: Id | null): Promise<CatalogEntry[]> {
  let versionId = rulesVersionId;
  if (versionId == null) {
    const published = await store.select('rules_versions', { eq: { status: 'published' }, order: { column: 'published_at', desc: true }, limit: 1 });
    versionId = published[0]?.id ?? null;
  }
  if (versionId != null) {
    const [section] = await store.select('rules_sections', { eq: { version_id: versionId, anchor: CATALOG_ANCHOR } });
    const parsed = section ? parsePenaltyCatalog(section.body_de) : [];
    if (parsed.length > 0) return parsed;
  }
  const find = (list: RuleSectionSeed[]): RuleSectionSeed | undefined => {
    for (const s of list) {
      if (s.anchor === CATALOG_ANCHOR) return s;
      const hit = find(s.children ?? []);
      if (hit) return hit;
    }
    return undefined;
  };
  return parsePenaltyCatalog(find(RULES_V1.sections)?.body_de ?? '');
}

export async function stewardContext(store: Store, roundId: Id, extraDriverIds: readonly Id[] = []): Promise<StewardContext | null> {
  const [round] = await store.select('rounds', { eq: { id: roundId } });
  if (!round) return null;
  const [[season], [track], sessions, entries, drivers] = await Promise.all([
    store.select('seasons', { eq: { id: round.season_id } }),
    store.select('tracks', { eq: { id: round.track_id } }),
    store.select('sessions', { eq: { round_id: roundId } }),
    store.select('round_entries', { eq: { round_id: roundId } }),
    store.select('drivers'),
  ]);
  if (!season) return null;
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const ids = new Set<Id>([...entries.map((e) => e.driver_id), ...extraDriverIds]);
  const pool = ids.size > 0 ? [...ids].map((id) => byId.get(id)).filter((d): d is DriverRow => d != null) : drivers.filter((d) => d.status === 'active' || d.status === 'reserve');
  const numberOf = new Map(entries.map((e) => [e.driver_id, e.race_number]));
  const order = { qualifying: 0, sprint: 1, race: 2 } as const;
  return {
    round,
    season,
    track,
    sessions: sessions.sort((a, b) => order[a.type] - order[b.type]),
    drivers: byId,
    driverOptions: pool
      .map((d) => ({ id: d.id, label: `${numberOf.get(d.id) != null ? `#${numberOf.get(d.id)} ` : ''}${d.anonymized ? `Ehemaliger Fahrer #${d.id}` : d.gamertag}` }))
      .sort((a, b) => a.label.replace(/^#\d+ /, '').localeCompare(b.label.replace(/^#\d+ /, ''), 'de')),
    catalog: await loadCatalog(store, season.rules_version_id),
  };
}
