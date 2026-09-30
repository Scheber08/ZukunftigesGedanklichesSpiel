// @ts-check
/**
 * Sammelt die Pakete einer Session und baut nach der Final Classification das kompakte
 * Export-JSON für die Website (`POST /api/import`). Reine Logik ohne Netzwerk/Dateien –
 * die Zeit kommt als Parameter, damit sich alles testen lässt.
 *
 * Ablauf je Session (erkannt an der sessionUID):
 *   Session-Paket     → Strecke, Session-Typ, Rundenzahl
 *   Participants      → Startnummern, Namen, KI-Flag (alle ~5 s)
 *   Session History   → beste Runde je Auto (Ersatz, falls sie im Endergebnis fehlt)
 *   Final Classification → Export. Fehlt noch das Teilnehmer-Paket, wird bis zu
 *                          PARTICIPANTS_WAIT_MS darauf gewartet.
 * Das Spiel schickt das Endergebnis teils mehrfach: gleiche Inhalte werden nur einmal exportiert.
 */
import {
  layoutFor,
  PacketError,
  parsePacket,
  RESULT_REASON_NAMES,
  RESULT_STATUS_NAMES,
  SESSION_TYPE_NAMES,
  sessionKind,
  TRACK_NAMES,
  UnsupportedFormatError,
} from './f1-packets.mjs';

export const EXPORT_FORMAT = 'liga-telemetry/1';
export const COMPANION_VERSION = '1.0.0';
export const PARTICIPANTS_WAIT_MS = 8_000;

/** Kombinierende Akzente (nach NFD), z. B. „São“ → „Sao“ */
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/**
 * @typedef {import('./f1-packets.mjs').SessionInfo} SessionInfo
 * @typedef {import('./f1-packets.mjs').Participant} Participant
 * @typedef {import('./f1-packets.mjs').ClassificationEntry} ClassificationEntry
 */

/**
 * @typedef {object} ExportResult
 * @property {number} carIndex
 * @property {number} position
 * @property {number | null} raceNumber
 * @property {string | null} name
 * @property {number | null} teamId
 * @property {boolean} aiControlled
 * @property {number | null} platform
 * @property {number} resultStatus
 * @property {number | null} resultReason
 * @property {number | null} gridPosition
 * @property {number | null} numLaps
 * @property {number | null} bestLapMs
 * @property {number | null} totalRaceTimeMs  ohne Ingame-Strafen (wie vom Spiel geliefert)
 * @property {number} penaltiesS
 * @property {number} numPenalties
 * @property {number | null} numPitStops
 */

/**
 * @typedef {object} ExportPayload
 * @property {string} format
 * @property {string} companion
 * @property {string} createdAt
 * @property {{ packetFormat: number, gameYear: number, version: string }} game
 * @property {string} sessionUid
 * @property {{ gameSessionType: number, trackId: number, totalLaps: number, networkGame: number } | null} session
 * @property {{ roundId?: number, sessionType?: 'qualifying' | 'sprint' | 'race' }} [target]
 * @property {string[]} warnings
 * @property {ExportResult[]} results
 */

/**
 * @typedef {object} SessionState
 * @property {string} sessionUid
 * @property {number} packetFormat
 * @property {number} gameYear
 * @property {string} version
 * @property {SessionInfo | null} session
 * @property {Participant[] | null} participants
 * @property {Map<number, number>} historyBest
 * @property {ClassificationEntry[] | null} classification
 * @property {number | null} pendingSince
 * @property {Set<string>} exported
 * @property {number} lastSeen
 */

/**
 * @typedef {{ type: 'session', sessionUid: string, text: string }
 *   | { type: 'error', message: string }
 *   | { type: 'final', sessionUid: string, payload: ExportPayload, text: string }} CollectorEvent
 */

/**
 * @param {{ target?: ExportPayload['target'] }} [options]
 */
export function createCollector(options = {}) {
  /** @type {Map<string, SessionState>} */
  const sessions = new Map();
  /** @type {Set<string>} */
  const reportedErrors = new Set();

  /**
   * @param {string} message
   * @returns {CollectorEvent[]}
   */
  function errorOnce(message) {
    if (reportedErrors.has(message)) return [];
    reportedErrors.add(message);
    return [{ type: 'error', message }];
  }

  /**
   * @param {SessionState} s
   * @param {number} now
   * @returns {CollectorEvent[]}
   */
  function tryExport(s, now) {
    if (!s.classification) return [];
    const key = JSON.stringify(s.classification.filter((e) => e.position > 0));
    if (s.exported.has(key)) {
      s.pendingSince = null;
      return [];
    }
    if (!s.participants && s.pendingSince != null && now - s.pendingSince < PARTICIPANTS_WAIT_MS) return [];
    s.exported.add(key);
    s.pendingSince = null;
    const payload = buildPayload(s, now, options.target);
    return [{ type: 'final', sessionUid: s.sessionUid, payload, text: describePayload(payload) }];
  }

  return {
    sessions,

    /**
     * Ein UDP-Paket verarbeiten.
     * @param {Uint8Array} buf
     * @param {number} [now]
     * @returns {CollectorEvent[]}
     */
    handle(buf, now = Date.now()) {
      let packet;
      try {
        packet = parsePacket(buf);
      } catch (err) {
        if (err instanceof UnsupportedFormatError || err instanceof PacketError) return errorOnce(err.message);
        throw err;
      }
      if (packet.kind === 'other') {
        // Unbekanntes Format schon am ersten (häufigen) Paket melden
        try {
          layoutFor(packet.header.packetFormat);
        } catch (err) {
          if (err instanceof UnsupportedFormatError) return errorOnce(err.message);
          throw err;
        }
        return [];
      }
      const h = packet.header;
      /** @type {CollectorEvent[]} */
      const events = [];
      let s = sessions.get(h.sessionUid);
      if (!s) {
        s = {
          sessionUid: h.sessionUid,
          packetFormat: h.packetFormat,
          gameYear: h.gameYear,
          version: `${h.gameMajorVersion}.${String(h.gameMinorVersion).padStart(2, '0')}`,
          session: null,
          participants: null,
          historyBest: new Map(),
          classification: null,
          pendingSince: null,
          exported: new Set(),
          lastSeen: now,
        };
        sessions.set(h.sessionUid, s);
      }
      s.lastSeen = now;

      switch (packet.kind) {
        case 'session': {
          const first = s.session == null;
          s.session = packet.data;
          if (first) events.push({ type: 'session', sessionUid: s.sessionUid, text: describeSession(s) });
          break;
        }
        case 'participants':
          s.participants = packet.data.participants;
          events.push(...tryExport(s, now));
          break;
        case 'sessionHistory':
          if (packet.data.bestLapTimeMs != null) s.historyBest.set(packet.data.carIndex, packet.data.bestLapTimeMs);
          break;
        case 'finalClassification':
          s.classification = packet.data.entries;
          if (s.pendingSince == null) s.pendingSince = now;
          events.push(...tryExport(s, now));
          break;
      }
      return events;
    },

    /**
     * Wartende Exporte nach Ablauf der Wartezeit abschließen (regelmäßig aufrufen).
     * @param {number} [now]
     * @returns {CollectorEvent[]}
     */
    tick(now = Date.now()) {
      /** @type {CollectorEvent[]} */
      const events = [];
      for (const s of sessions.values()) {
        if (s.pendingSince != null && now - s.pendingSince >= PARTICIPANTS_WAIT_MS) events.push(...tryExport(s, now));
      }
      return events;
    },

    /** Wartet noch ein Export auf das Teilnehmer-Paket? */
    hasPending() {
      for (const s of sessions.values()) if (s.pendingSince != null) return true;
      return false;
    },
  };
}

/**
 * Export-JSON aus dem Sitzungszustand.
 * @param {SessionState} s
 * @param {number} now
 * @param {ExportPayload['target']} [target]
 * @returns {ExportPayload}
 */
export function buildPayload(s, now, target) {
  /** @type {string[]} */
  const warnings = [];
  if (!s.session) warnings.push('Session-Paket fehlte – Strecke und Session-Typ sind unbekannt.');
  if (!s.participants) warnings.push('Teilnehmer-Paket fehlte – Startnummern und Namen sind unbekannt.');
  const participants = s.participants ?? [];
  const results = (s.classification ?? [])
    .filter((e) => e.position >= 1 && e.resultStatus !== 0)
    .sort((a, b) => a.position - b.position)
    .map((e) => {
      const p = participants[e.carIndex];
      const bestLap = e.bestLapTimeMs > 0 ? e.bestLapTimeMs : (s.historyBest.get(e.carIndex) ?? null);
      const total = Number.isFinite(e.totalRaceTimeS) && e.totalRaceTimeS > 0 ? Math.round(e.totalRaceTimeS * 1000) : null;
      /** @type {ExportResult} */
      const r = {
        carIndex: e.carIndex,
        position: e.position,
        raceNumber: p ? p.raceNumber : null,
        name: p ? p.name || null : null,
        teamId: p ? p.teamId : null,
        aiControlled: p ? p.aiControlled : false,
        platform: p ? p.platform : null,
        resultStatus: e.resultStatus,
        resultReason: e.resultReason,
        gridPosition: e.gridPosition > 0 ? e.gridPosition : null,
        numLaps: e.numLaps,
        bestLapMs: bestLap,
        totalRaceTimeMs: total,
        penaltiesS: e.penaltiesTimeS,
        numPenalties: e.numPenalties,
        numPitStops: e.numPitStops,
      };
      return r;
    });
  /** @type {ExportPayload} */
  const payload = {
    format: EXPORT_FORMAT,
    companion: COMPANION_VERSION,
    createdAt: new Date(now).toISOString(),
    game: { packetFormat: s.packetFormat, gameYear: s.gameYear, version: s.version },
    sessionUid: s.sessionUid,
    session: s.session
      ? { gameSessionType: s.session.sessionType, trackId: s.session.trackId, totalLaps: s.session.totalLaps, networkGame: s.session.networkGame }
      : null,
    warnings,
    results,
  };
  if (target && (target.roundId != null || target.sessionType != null)) payload.target = { ...target };
  return payload;
}

/**
 * @param {SessionState} s
 */
function describeSession(s) {
  const info = s.session;
  if (!info) return `Session ${s.sessionUid}`;
  const type = SESSION_TYPE_NAMES[info.sessionType] ?? `Typ ${info.sessionType}`;
  const track = TRACK_NAMES[info.trackId] ?? `Strecke ${info.trackId}`;
  const kind = sessionKind(info.sessionType);
  const note = kind === 'practice' || kind === 'time_trial' ? ' (wird nicht importiert)' : '';
  return `${type} in ${track}${info.totalLaps > 0 && kind === 'race' ? `, ${info.totalLaps} Runden` : ''} · UDP-Format ${s.packetFormat}${note}`;
}

/**
 * Kurzfassung für die Konsole.
 * @param {ExportPayload} p
 */
export function describePayload(p) {
  const type = p.session ? (SESSION_TYPE_NAMES[p.session.gameSessionType] ?? `Typ ${p.session.gameSessionType}`) : 'Session ?';
  const track = p.session ? (TRACK_NAMES[p.session.trackId] ?? `Strecke ${p.session.trackId}`) : 'Strecke ?';
  const ai = p.results.filter((r) => r.aiControlled).length;
  const lines = [`Endergebnis: ${type} in ${track} – ${p.results.length} Autos${ai > 0 ? ` (davon ${ai} KI)` : ''}`];
  for (const r of p.results.slice(0, 3)) {
    const status = RESULT_STATUS_NAMES[r.resultStatus] ?? String(r.resultStatus);
    const reason = r.resultReason != null && r.resultReason !== 2 ? `, ${RESULT_REASON_NAMES[r.resultReason] ?? r.resultReason}` : '';
    lines.push(`  P${r.position} #${r.raceNumber ?? '?'} ${r.name ?? ''} (${status}${reason})`);
  }
  for (const w of p.warnings) lines.push(`  Hinweis: ${w}`);
  return lines.join('\n');
}

/**
 * Dateiname für die lokale Sicherung, z. B. 2026-10-01T20-45-12_rennen_montreal_1234.json
 * @param {ExportPayload} p
 */
export function exportFileName(p) {
  const stamp = p.createdAt.replace(/\.\d+Z$/, '').replace(/:/g, '-');
  const kind = p.session ? sessionKind(p.session.gameSessionType) : 'unknown';
  const label = { practice: 'training', qualifying: 'quali', sprint_shootout: 'shootout', race: 'rennen', time_trial: 'zeitfahren', unknown: 'session' }[kind];
  const track = p.session ? (TRACK_NAMES[p.session.trackId] ?? `strecke-${p.session.trackId}`) : 'strecke';
  const slug = track
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${stamp}_${label}_${slug}_${p.sessionUid.slice(-4)}.json`;
}
