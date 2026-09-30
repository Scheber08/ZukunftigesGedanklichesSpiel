/**
 * Zu welcher Session gehört ein Telemetrie-Upload? (Plan Phase 2, §6.6)
 *
 * - Explizit: `target.roundId` (+ optional `target.sessionType`) aus dem Companion (--round/--session).
 * - Sonst automatisch: aktive Saison, Runde auf der Strecke (tracks.game_track_id = Track-ID des
 *   Spiels), Start innerhalb ±36 h um jetzt, nicht abgesagt.
 * - Session-Typ aus dem Spiel: Qualifying/Sprint-Shootout → Qualifying, Rennen → Rennen.
 *   In Sprint-Runden ist „Rennen“ (Typ 15) nicht eindeutig (Sprint oder Hauptrennen) – dann muss
 *   der Typ angegeben werden; „Rennen 2“ (Typ 16, Sprint-Wochenende im Spiel) ist das Hauptrennen.
 * Nicht eindeutig → Fehler mit Erklärung (Endpunkt antwortet 422).
 * Reine Funktion.
 */
import type { Id, RoundRow, SeasonRow, SessionRow, SessionType, TrackRow } from '../db/types';
import { gameSessionKind, gameSessionLabel, gameTrackLabel } from './game';

export const MATCH_WINDOW_HOURS = 36;

export interface ResolveInput {
  now: Date;
  gameSessionType: number | null;
  gameTrackId: number | null;
  target?: { roundId?: number; sessionType?: SessionType } | undefined;
  seasons: ReadonlyArray<Pick<SeasonRow, 'id' | 'status' | 'number'>>;
  rounds: ReadonlyArray<Pick<RoundRow, 'id' | 'season_id' | 'number' | 'track_id' | 'start_utc' | 'status' | 'format'>>;
  tracks: ReadonlyArray<Pick<TrackRow, 'id' | 'game_track_id' | 'name_de'>>;
  sessions: ReadonlyArray<Pick<SessionRow, 'id' | 'round_id' | 'type'>>;
}

export type ResolveResult =
  | { ok: true; roundId: Id; sessionId: Id; sessionType: SessionType; how: 'explicit' | 'auto' }
  | { ok: false; message: string; details: string[] };

const SESSION_NAME: Record<SessionType, string> = { qualifying: 'Qualifying', sprint: 'Sprint', race: 'Rennen' };

function fail(message: string, details: string[] = []): ResolveResult {
  return { ok: false, message, details };
}

export function resolveImportSession(input: ResolveInput): ResolveResult {
  const trackName = (id: Id) => input.tracks.find((t) => t.id === id)?.name_de ?? `Strecke #${id}`;
  const roundText = (r: Pick<RoundRow, 'number' | 'track_id' | 'season_id'>) => {
    const season = input.seasons.find((s) => s.id === r.season_id);
    return `${season ? `S${season.number} ` : ''}R${r.number} · ${trackName(r.track_id)}`;
  };

  // ------------------------------------------------------------------ Runde
  let round: ResolveInput['rounds'][number] | undefined;
  let how: 'explicit' | 'auto' = 'auto';
  if (input.target?.roundId != null) {
    how = 'explicit';
    round = input.rounds.find((r) => r.id === input.target!.roundId);
    if (!round) return fail(`Runde #${input.target.roundId} gibt es nicht.`, ['Die Runden-ID steht in der Adresse der Runde im Admin (/admin/runden/<id>).']);
  } else {
    if (input.gameTrackId == null || input.gameTrackId < 0) {
      return fail('Die Strecke ist unbekannt (Session-Paket fehlte) – bitte die Runde angeben.', ['Companion mit --round <id> starten bzw. erneut hochladen (--upload … --round <id>).']);
    }
    const active = new Set(input.seasons.filter((s) => s.status === 'active').map((s) => s.id));
    if (active.size === 0) return fail('Es gibt keine aktive Saison.', ['Im Admin unter Saisons eine Saison aktivieren oder die Runde mit --round angeben.']);
    const trackIds = new Set(input.tracks.filter((t) => t.game_track_id === input.gameTrackId).map((t) => t.id));
    const windowMs = MATCH_WINDOW_HOURS * 3_600_000;
    const near = input.rounds.filter(
      (r) => active.has(r.season_id) && r.status !== 'cancelled' && Math.abs(new Date(r.start_utc).getTime() - input.now.getTime()) <= windowMs,
    );
    const candidates = near.filter((r) => trackIds.has(r.track_id));
    if (candidates.length === 0) {
      const details: string[] = [`Im Spiel gefahren: ${gameTrackLabel(input.gameTrackId)} (Strecken-ID ${input.gameTrackId}).`];
      if (near.length > 0) {
        details.push(`In ±${MATCH_WINDOW_HOURS} h geplant: ${near.map(roundText).join(', ')}.`);
        const withoutId = near.filter((r) => input.tracks.find((t) => t.id === r.track_id)?.game_track_id == null);
        if (withoutId.length > 0) details.push(`Ohne Spiel-Strecken-ID: ${withoutId.map((r) => trackName(r.track_id)).join(', ')} – im Admin unter Strecken eintragen.`);
      } else {
        details.push(`In ±${MATCH_WINDOW_HOURS} h ist keine Runde der aktiven Saison geplant.`);
      }
      details.push('Alternativ die Runde angeben: --round <id>.');
      return fail('Keine passende Runde gefunden.', details);
    }
    if (candidates.length > 1) {
      return fail('Mehrere Runden passen – bitte die Runde angeben (--round <id>).', candidates.map((r) => `#${r.id}: ${roundText(r)}`));
    }
    round = candidates[0]!;
  }
  if (round.status === 'cancelled') return fail(`${roundText(round)} ist abgesagt.`);
  const season = input.seasons.find((s) => s.id === round!.season_id);
  if (season?.status === 'finished') return fail(`${roundText(round)}: Die Saison ist abgeschlossen – Ergebnisse sind eingefroren.`);

  // ------------------------------------------------------------------ Session
  const roundSessions = input.sessions.filter((s) => s.round_id === round!.id);
  const hasSprint = roundSessions.some((s) => s.type === 'sprint');
  let type: SessionType | null = input.target?.sessionType ?? null;
  if (type != null) how = 'explicit';
  if (type == null) {
    if (input.gameSessionType == null) {
      return fail('Der Session-Typ ist unbekannt (Session-Paket fehlte) – bitte angeben.', ['--session qualifying | sprint | race']);
    }
    const kind = gameSessionKind(input.gameSessionType);
    const label = gameSessionLabel(input.gameSessionType);
    if (kind === 'practice' || kind === 'time_trial') return fail(`${label}: Training und Zeitfahren werden nicht importiert.`);
    if (kind === 'unknown') return fail(`${label}: unbekannter Session-Typ – bitte angeben (--session).`);
    if (kind === 'qualifying' || kind === 'sprint_shootout') type = 'qualifying';
    else if (input.gameSessionType === 15 && hasSprint) {
      return fail(`${roundText(round)} ist eine Sprint-Runde: „${label}“ kann Sprint oder Hauptrennen sein – bitte angeben.`, [
        'Erneut hochladen mit --session sprint bzw. --session race (die Sicherung liegt im Ordner telemetrie-export).',
        'Oder die CSV-Datei im Admin unter Import einfügen.',
      ]);
    } else type = 'race';
  }
  const session = roundSessions.find((s) => s.type === type);
  if (!session) {
    return fail(`${roundText(round)} hat keine Session „${SESSION_NAME[type]}“.`, [
      `Vorhanden: ${roundSessions.map((s) => SESSION_NAME[s.type]).join(', ') || 'keine'}.`,
    ]);
  }
  return { ok: true, roundId: round.id, sessionId: session.id, sessionType: type, how };
}
