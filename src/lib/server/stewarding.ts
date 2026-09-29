/**
 * Server-Dienst Steward-Werkzeug (Plan §5.3, §6.4, §8.1): Vorfälle bearbeiten, Entscheidungen
 * anlegen, abstimmen (Vier-Augen-Prinzip), veröffentlichen und zurücknehmen, eigene Untersuchungen.
 *
 * Befangenheit wird hier erzwungen (isConflicted). Zeit-, Positions- und DSQ-Strafen fließen beim
 * Veröffentlichen/Zurücknehmen automatisch ins Ergebnis ein – ist die Runde schon final, als Korrektur.
 */
import { url } from '~/i18n/routes';
import {
  addVote,
  decisionContentChanged,
  enoughVotes,
  isHttpsUrl,
  normalizeDecision,
  type DecisionInput,
} from '../admin/raceday/decision-input';
import { decisionEmbed } from '../admin/raceday/embeds';
import { notFound, RacedayError } from '../admin/raceday/errors';
import { verdictText } from '../admin/raceday/labels';
import { selectOne, StoreError, UNIQUE_VIOLATION, type Store } from '../db/store';
import type { DecisionRow, Id, IncidentRow, IncidentStatus, RoundRow, SeasonRow, SessionType } from '../db/types';
import { formatDecisionRef, isConflicted, nextDecisionSequence, RESULT_AFFECTING_VERDICTS } from '../domain/decisions';
import { roundLabel } from '../view';
import { audit } from './audit';
import type { Staff } from './auth';
import { EMBED_GREEN, EMBED_WARNING, notify, siteUrl } from './discord';
import { requestRebuild } from './rebuild';
import { correctRound, displayName, isFrozen, isResultVisible, loadRoundBasics, recomputeRound } from './results';

export type StewardActor = Pick<Staff, 'userId' | 'name' | 'driverId'>;

const CONFLICT_MESSAGE = 'Du bist an diesem Vorfall beteiligt (befangen) und kannst hier nicht entscheiden.';

/** Befangenheit nur bezogen auf einen Vorfall (Status setzen, Untersuchung). */
export function incidentConflict(staff: Pick<StewardActor, 'driverId'>, incident: Pick<IncidentRow, 'involved_driver_ids' | 'reporter_driver_id'> | null): boolean {
  return isConflicted(staff.driverId, incident, Number.NaN);
}

function assertNotConflicted(staff: StewardActor, incident: IncidentRow | null, driverId: Id): void {
  if (isConflicted(staff.driverId, incident, driverId)) throw new RacedayError('FORBIDDEN', CONFLICT_MESSAGE);
}

async function loadDecision(store: Store, id: Id): Promise<DecisionRow> {
  const d = await selectOne(store, 'decisions', { id });
  if (!d) throw notFound('Entscheidung');
  return d;
}

async function incidentOf(store: Store, d: Pick<DecisionRow, 'incident_id'>): Promise<IncidentRow | null> {
  return d.incident_id != null ? await selectOne(store, 'incidents', { id: d.incident_id }) : null;
}

async function roundAndSeason(store: Store, roundId: Id): Promise<{ round: RoundRow; season: SeasonRow }> {
  const round = await selectOne(store, 'rounds', { id: roundId });
  if (!round) throw notFound('Runde');
  const season = await selectOne(store, 'seasons', { id: round.season_id });
  if (!season) throw notFound('Saison');
  return { round, season };
}

// ---------------------------------------------------------------------------- Vorfälle

export async function setIncidentStatus(store: Store, staff: StewardActor, incidentId: Id, status: IncidentStatus): Promise<IncidentRow> {
  const incident = await selectOne(store, 'incidents', { id: incidentId });
  if (!incident) throw notFound('Vorfall');
  if (incidentConflict(staff, incident)) throw new RacedayError('FORBIDDEN', CONFLICT_MESSAGE);
  if (incident.status === status) return incident;
  const [updated] = await store.update('incidents', { id: incidentId }, { status });
  await audit(store, staff, 'update', 'incidents', incidentId, { status: incident.status }, { status });
  return updated ?? incident;
}

export interface InvestigationInput {
  roundId: Id;
  sessionType: SessionType | null;
  involvedDriverIds: Id[];
  lap: number | null;
  corner: string | null;
  description: string;
  clipUrl: string | null;
  clipTimestamp: string | null;
}

/** Eigene Untersuchung der Stewards ohne Meldung (source „steward“). */
export async function openInvestigation(store: Store, staff: StewardActor, input: InvestigationInput): Promise<IncidentRow> {
  const { round } = await roundAndSeason(store, input.roundId);
  const description = input.description.trim();
  if (description.length < 10) throw new RacedayError('BAD_REQUEST', 'Bitte beschreibe den Vorfall (mindestens 10 Zeichen).');
  const involved = [...new Set(input.involvedDriverIds)];
  if (involved.length === 0) throw new RacedayError('BAD_REQUEST', 'Bitte mindestens einen beteiligten Fahrer auswählen.');
  const drivers = await store.select('drivers', { in: { id: involved } });
  if (drivers.length !== involved.length) throw new RacedayError('BAD_REQUEST', 'Unbekannter Fahrer ausgewählt.');
  if (staff.driverId != null && involved.includes(staff.driverId)) throw new RacedayError('FORBIDDEN', CONFLICT_MESSAGE);
  const clipUrl = input.clipUrl?.trim() || null;
  if (clipUrl && !isHttpsUrl(clipUrl)) throw new RacedayError('BAD_REQUEST', 'Der Clip-Link muss mit https:// beginnen.');
  const session = input.sessionType
    ? await selectOne(store, 'sessions', { round_id: round.id, type: input.sessionType })
    : null;
  const [incident] = await store.insert('incidents', {
    round_id: round.id,
    session_id: session?.id ?? null,
    reporter_driver_id: null,
    reporter_contact: null,
    involved_driver_ids: involved,
    lap: input.lap,
    corner: input.corner?.trim() || null,
    description,
    clip_url: clipUrl,
    clip_timestamp: input.clipTimestamp?.trim() || null,
    submitted_at: new Date().toISOString(),
    ip_hash: null,
    source: 'steward',
    status: 'in_review',
  });
  if (!incident) throw new RacedayError('BAD_REQUEST', 'Untersuchung konnte nicht angelegt werden.');
  await audit(store, staff, 'create', 'incidents', incident.id, null, { source: 'steward', round_id: round.id, involved });
  return incident;
}

// ---------------------------------------------------------------------------- Entscheidungen

/** Entwurf anlegen oder bearbeiten. Speichern zählt als Stimme; inhaltliche Änderungen setzen andere Stimmen zurück. */
export async function saveDecision(store: Store, staff: StewardActor, decisionId: Id | null, input: DecisionInput): Promise<DecisionRow> {
  const { round, season } = await roundAndSeason(store, input.roundId);
  const incident = input.incidentId != null ? await selectOne(store, 'incidents', { id: input.incidentId }) : null;
  if (input.incidentId != null && !incident) throw notFound('Vorfall');
  if (incident && incident.round_id !== round.id) throw new RacedayError('BAD_REQUEST', 'Der Vorfall gehört zu einer anderen Runde.');
  if (input.sessionId != null) {
    const session = await selectOne(store, 'sessions', { id: input.sessionId });
    if (!session || session.round_id !== round.id) throw new RacedayError('BAD_REQUEST', 'Die Session gehört nicht zu dieser Runde.');
  }
  const driver = await selectOne(store, 'drivers', { id: input.driverId });
  if (!driver) throw notFound('Fahrer');
  assertNotConflicted(staff, incident, input.driverId);

  const normalized = normalizeDecision(input, { penaltyPointsEnabled: season.penalty_points_enabled });
  if (!normalized.ok) throw new RacedayError('BAD_REQUEST', 'Bitte prüfe die Angaben:', Object.values(normalized.errors));
  const fields = normalized.fields;

  let saved: DecisionRow;
  if (decisionId != null) {
    const existing = await loadDecision(store, decisionId);
    if (existing.status !== 'draft') throw new RacedayError('CONFLICT', 'Nur Entwürfe können bearbeitet werden. Veröffentlichte Entscheidungen bitte zurücknehmen.');
    assertNotConflicted(staff, await incidentOf(store, existing), existing.driver_id);
    const changed = decisionContentChanged(existing, fields);
    const decided_by = changed ? [staff.userId] : addVote(existing.decided_by, staff.userId);
    const [updated] = await store.update('decisions', { id: decisionId }, { ...fields, decided_by });
    saved = updated ?? existing;
    await audit(store, staff, 'update', 'decisions', decisionId, existing, saved);
  } else {
    const existingRefs = (await store.select('decisions', { eq: { round_id: round.id } })).map((d) => d.public_ref);
    let created: DecisionRow | undefined;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      const seq = nextDecisionSequence(existingRefs, season.number, round.number) + attempt;
      try {
        [created] = await store.insert('decisions', {
          ...fields,
          public_ref: formatDecisionRef(season.number, round.number, seq),
          decided_by: [staff.userId],
          status: 'draft',
          published_at: null,
        });
      } catch (err) {
        if (!(err instanceof StoreError && err.code === UNIQUE_VIOLATION)) throw err;
      }
    }
    if (!created) throw new RacedayError('CONFLICT', 'Referenz konnte nicht vergeben werden – bitte erneut versuchen.');
    saved = created;
    await audit(store, staff, 'create', 'decisions', saved.id, null, saved);
  }

  if (incident && incident.status === 'new') {
    await store.update('incidents', { id: incident.id }, { status: 'in_review' });
  }
  return saved;
}

/** Zustimmung eines Stewards (Vier-Augen-Prinzip). */
export async function voteDecision(store: Store, staff: StewardActor, decisionId: Id): Promise<DecisionRow> {
  const d = await loadDecision(store, decisionId);
  if (d.status !== 'draft') throw new RacedayError('CONFLICT', 'Abstimmen ist nur bei Entwürfen möglich.');
  assertNotConflicted(staff, await incidentOf(store, d), d.driver_id);
  if (d.decided_by.includes(staff.userId)) return d;
  const decided_by = addVote(d.decided_by, staff.userId);
  const [updated] = await store.update('decisions', { id: decisionId }, { decided_by });
  await audit(store, staff, 'update', 'decisions', decisionId, { decided_by: d.decided_by }, { decided_by });
  return updated ?? { ...d, decided_by };
}

/** Entwurf verwerfen; liefert die gelöschte Zeile (z. B. für den Rücksprung zum Vorfall). */
export async function discardDecision(store: Store, staff: StewardActor, decisionId: Id): Promise<DecisionRow> {
  const d = await loadDecision(store, decisionId);
  if (d.status !== 'draft') throw new RacedayError('CONFLICT', 'Nur Entwürfe können verworfen werden.');
  assertNotConflicted(staff, await incidentOf(store, d), d.driver_id);
  await store.remove('decisions', { id: decisionId });
  await audit(store, staff, 'delete', 'decisions', decisionId, d, null);
  return d;
}

export type DecisionEffect = 'none' | 'recomputed' | 'corrected';

/**
 * Wirkung auf das Ergebnis: Neuberechnung, bei finaler Runde als Korrektur mit Grund „Urteil <ref>“.
 * Beim Zurücknehmen einer DSQ wird der Status der betroffenen Zeile wieder auf „gewertet“ gesetzt.
 */
async function applyDecisionEffect(store: Store, staff: StewardActor, d: DecisionRow, mode: 'publish' | 'revoke'): Promise<DecisionEffect> {
  if (!RESULT_AFFECTING_VERDICTS.includes(d.verdict)) return 'none';
  const b = await loadRoundBasics(store, d.round_id);
  const sessionIds = b.sessions.map((s) => s.id);
  if (sessionIds.length === 0) return 'none';
  const results = await store.select('results', { in: { session_id: sessionIds } });
  if (results.length === 0) return 'none';

  if (mode === 'revoke' && d.verdict === 'dsq') {
    const target = d.session_id ?? b.sessions.find((s) => s.type === 'race')?.id ?? null;
    const others = (await store.select('decisions', { eq: { round_id: d.round_id, driver_id: d.driver_id, verdict: 'dsq', status: 'published' } })).filter(
      (x) => x.id !== d.id && (x.session_id ?? target) === target,
    );
    if (target != null && others.length === 0) {
      await store.update('results', { session_id: target, driver_id: d.driver_id, status: 'dsq' }, { status: 'classified' });
    }
  }

  if (b.round.status === 'final' || b.round.status === 'corrected') {
    const [de, en] =
      mode === 'publish' ? [`Urteil ${d.public_ref}`, `Decision ${d.public_ref}`] : [`Urteil ${d.public_ref} zurückgenommen`, `Decision ${d.public_ref} revoked`];
    await correctRound(store, d.round_id, staff, de, en);
    return 'corrected';
  }
  await recomputeRound(store, d.round_id);
  return 'recomputed';
}

async function postDecision(store: Store, d: DecisionRow, revoked: boolean): Promise<boolean> {
  const b = await loadRoundBasics(store, d.round_id);
  const driver = await selectOne(store, 'drivers', { id: d.driver_id });
  const race = b.sessions.find((s) => s.type === 'race');
  const sessionId = d.session_id ?? race?.id;
  const result = sessionId != null ? await selectOne(store, 'results', { session_id: sessionId, driver_id: d.driver_id }) : null;
  const embed = decisionEmbed({
    ref: d.public_ref,
    roundLabel: roundLabel(b.round, b.track, 'de'),
    driver: { name: displayName(driver ?? undefined, d.driver_id), number: result?.race_number ?? null },
    verdict: verdictText(d),
    reasoning: d.reasoning_de,
    url: siteUrl(url('de', revoked ? 'stewards' : 'decision', revoked ? {} : { ref: d.public_ref })),
    revoked,
  });
  return notify(store, 'decisions', { ...embed, color: revoked ? EMBED_WARNING : EMBED_GREEN });
}

export interface PublishOutcome {
  published: boolean;
  decision: DecisionRow;
  effect: DecisionEffect;
  discord: boolean;
  message: string;
}

const EFFECT_TEXT: Record<DecisionEffect, string> = {
  none: '',
  recomputed: ' Ergebnis und Wertung wurden neu berechnet.',
  corrected: ' Das finale Ergebnis wurde korrigiert (öffentlicher Hinweis, Snapshots neu).',
};

/** Veröffentlichen – beim Vier-Augen-Prinzip erst mit zwei verschiedenen Stewards. */
export async function publishDecision(store: Store, staff: StewardActor, decisionId: Id): Promise<PublishOutcome> {
  const d = await loadDecision(store, decisionId);
  if (d.status !== 'draft') throw new RacedayError('CONFLICT', 'Diese Entscheidung ist kein Entwurf.');
  const incident = await incidentOf(store, d);
  assertNotConflicted(staff, incident, d.driver_id);
  const { round, season } = await roundAndSeason(store, d.round_id);
  if (isFrozen(season) && RESULT_AFFECTING_VERDICTS.includes(d.verdict)) {
    throw new RacedayError('PRECONDITION_FAILED', 'Die Saison ist abgeschlossen – Strafen mit Wirkung aufs Ergebnis sind nicht mehr möglich.');
  }
  if (d.reasoning_de.trim().length < 10) throw new RacedayError('BAD_REQUEST', 'Die deutsche Begründung fehlt.');

  const decided_by = addVote(d.decided_by, staff.userId);
  if (!enoughVotes(decided_by, season.two_steward_rule)) {
    const [voted] = await store.update('decisions', { id: decisionId }, { decided_by });
    await audit(store, staff, 'update', 'decisions', decisionId, { decided_by: d.decided_by }, { decided_by });
    return {
      published: false,
      decision: voted ?? { ...d, decided_by },
      effect: 'none',
      discord: false,
      message: 'Vier-Augen-Prinzip: Deine Stimme ist gespeichert. Veröffentlichen kann erst ein zweiter Steward.',
    };
  }

  const [updated] = await store.update('decisions', { id: decisionId }, { status: 'published', published_at: new Date().toISOString(), decided_by });
  const decision = updated ?? { ...d, status: 'published' as const, decided_by };
  if (incident && (incident.status === 'new' || incident.status === 'in_review')) {
    await store.update('incidents', { id: incident.id }, { status: 'decided' });
  }
  await audit(store, staff, 'publish', 'decisions', decisionId, { status: 'draft' }, { status: 'published', public_ref: d.public_ref, decided_by });
  const effect = await applyDecisionEffect(store, staff, decision, 'publish');
  const discord = await postDecision(store, decision, false);
  await requestRebuild(store, `Urteil ${d.public_ref}`);
  const visible = isResultVisible(round.status);
  return {
    published: true,
    decision,
    effect,
    discord,
    message: `Urteil ${d.public_ref} veröffentlicht.${EFFECT_TEXT[effect]}${effect === 'recomputed' && !visible ? ' (Ergebnis ist noch nicht öffentlich.)' : ''}`,
  };
}

/** Zurücknehmen einer veröffentlichten Entscheidung inkl. Neuberechnung. */
export async function revokeDecision(store: Store, staff: StewardActor, decisionId: Id, note: string | null): Promise<PublishOutcome> {
  const d = await loadDecision(store, decisionId);
  if (d.status !== 'published') throw new RacedayError('CONFLICT', 'Nur veröffentlichte Entscheidungen können zurückgenommen werden.');
  const incident = await incidentOf(store, d);
  assertNotConflicted(staff, incident, d.driver_id);
  const { season } = await roundAndSeason(store, d.round_id);
  if (isFrozen(season) && RESULT_AFFECTING_VERDICTS.includes(d.verdict)) {
    throw new RacedayError('PRECONDITION_FAILED', 'Die Saison ist abgeschlossen – das Ergebnis ist eingefroren.');
  }
  const [updated] = await store.update('decisions', { id: decisionId }, { status: 'revoked' });
  const decision = updated ?? { ...d, status: 'revoked' as const };
  await audit(store, staff, 'unpublish', 'decisions', decisionId, { status: 'published' }, { status: 'revoked', note: note?.trim() || null });
  // Ohne weitere veröffentlichte Entscheidung ist der Vorfall wieder offen (neu entscheiden oder ablehnen)
  if (incident && incident.status === 'decided') {
    const others = await store.select('decisions', { eq: { incident_id: incident.id, status: 'published' } });
    if (others.every((x) => x.id === decisionId)) await store.update('incidents', { id: incident.id }, { status: 'in_review' });
  }
  const effect = await applyDecisionEffect(store, staff, decision, 'revoke');
  const discord = await postDecision(store, decision, true);
  await requestRebuild(store, `Urteil ${d.public_ref} zurückgenommen`);
  return { published: false, decision, effect, discord, message: `Urteil ${d.public_ref} zurückgenommen.${EFFECT_TEXT[effect]}` };
}

/** Anzeigenamen der Stimmen (staff_accounts), Fallback für Demo-Konten. */
export async function voterNames(store: Store, userIds: readonly string[], current?: Pick<Staff, 'userId' | 'name'> | null): Promise<string[]> {
  if (userIds.length === 0) return [];
  const accounts = await store.select('staff_accounts', { in: { user_id: [...userIds] } });
  const byId = new Map(accounts.map((a) => [a.user_id, a.display_name]));
  return userIds.map((id) => byId.get(id) ?? (current && current.userId === id ? current.name : `Steward …${id.slice(-4)}`));
}
