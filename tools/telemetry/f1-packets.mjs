// @ts-check
/**
 * Parser für die UDP-Telemetrie von EA SPORTS F1® 25 (Plan Phase 2, §7.3).
 *
 * Reine Funktionen ohne Abhängigkeiten: Buffer rein, Objekte raus. Alle Werte sind
 * little-endian und „packed“ (keine Auffüllbytes). Gelesen werden nur die Pakete, die
 * der Import braucht:
 *
 *   Id 1  Session              – Session-Typ, Strecke, Rundenzahl
 *   Id 4  Participants         – Startnummer, Name, Team, KI-Flag, Plattform
 *   Id 8  Final Classification – Endergebnis (Position, Status, Zeiten, Stopps, Strafen)
 *   Id 11 Session History      – Rundenzeiten je Auto (beste Runde, optional)
 *
 * Byte-Layouts (Header immer 29 Bytes):
 *
 *   Format 2024: Participants 1350 B (Eintrag 60 B, Name 48 B)
 *                Final Classification 1020 B (Eintrag 45 B)
 *   Format 2025: Participants 1284 B (Eintrag 57 B, Name 32 B, + Lackierungsfarben)
 *                Final Classification 1042 B (Eintrag 46 B, + m_resultReason)
 *   Session History 1460 B in beiden Formaten.
 *
 * Format 2026 (2026 Season Pack) ist noch nicht dokumentiert: Es wird mit dem Layout von
 * 2025 gelesen, solange die Paketgrößen passen – sonst gibt es eine klare Fehlermeldung.
 * Genau das soll der Feldtest klären (docs/TELEMETRIE.md).
 */

export const HEADER_SIZE = 29;
export const MAX_CARS = 22;

/** Paket-IDs laut Spezifikation (F1 24/25). */
export const PACKET_ID = Object.freeze({
  motion: 0,
  session: 1,
  lapData: 2,
  event: 3,
  participants: 4,
  carSetups: 5,
  carTelemetry: 6,
  carStatus: 7,
  finalClassification: 8,
  lobbyInfo: 9,
  carDamage: 10,
  sessionHistory: 11,
  tyreSets: 12,
  motionEx: 13,
  timeTrial: 14,
  lapPositions: 15,
});

/**
 * @typedef {object} PacketLayout
 * @property {number} format            UDP-Format (packetFormat)
 * @property {boolean} tentative        Layout nur angenommen (noch nicht dokumentiert)
 * @property {number} participantEntry  Bytes je Teilnehmer
 * @property {number} nameLength        Länge des Namensfelds
 * @property {boolean} hasTechLevel     uint16 m_techLevel vor m_platform
 * @property {number} classificationEntry Bytes je Eintrag der Final Classification
 * @property {boolean} hasResultReason  uint8 m_resultReason nach m_resultStatus
 * @property {{ session: number, participants: number, finalClassification: number, sessionHistory: number }} sizes
 *   Mindestgrößen der Pakete
 */

/** @type {Readonly<Record<number, PacketLayout>>} */
export const LAYOUTS = Object.freeze({
  2024: {
    format: 2024,
    tentative: false,
    participantEntry: 60,
    nameLength: 48,
    hasTechLevel: true,
    classificationEntry: 45,
    hasResultReason: false,
    sizes: { session: 155, participants: 1350, finalClassification: 1020, sessionHistory: 1460 },
  },
  2025: {
    format: 2025,
    tentative: false,
    participantEntry: 57,
    nameLength: 32,
    hasTechLevel: true,
    classificationEntry: 46,
    hasResultReason: true,
    sizes: { session: 155, participants: 1284, finalClassification: 1042, sessionHistory: 1460 },
  },
});

export const SUPPORTED_FORMATS = Object.freeze([2024, 2025, 2026]);

/** Fehler bei unbekanntem oder unpassendem UDP-Format – Meldung ist für Menschen gedacht. */
export class UnsupportedFormatError extends Error {
  /**
   * @param {string} message
   * @param {number} packetFormat
   */
  constructor(message, packetFormat) {
    super(message);
    this.name = 'UnsupportedFormatError';
    this.packetFormat = packetFormat;
  }
}

/** Fehler bei zu kurzen/kaputten Paketen. */
export class PacketError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'PacketError';
  }
}

/**
 * Layout für ein UDP-Format. 2026 wird vorläufig wie 2025 gelesen.
 * @param {number} packetFormat
 * @returns {PacketLayout}
 */
export function layoutFor(packetFormat) {
  if (packetFormat === 2024 || packetFormat === 2025) return /** @type {PacketLayout} */ (LAYOUTS[packetFormat]);
  if (packetFormat === 2026) return { .../** @type {PacketLayout} */ (LAYOUTS[2025]), format: 2026, tentative: true };
  throw new UnsupportedFormatError(
    `UDP-Format ${packetFormat} wird nicht unterstützt. Bitte im Spiel unter Einstellungen → Telemetrie das UDP-Format 2025 wählen ` +
      `(unterstützt: ${SUPPORTED_FORMATS.join(', ')}).`,
    packetFormat,
  );
}

/**
 * @param {Uint8Array} buf
 * @returns {DataView}
 */
function view(buf) {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * @param {Uint8Array} buf
 * @param {number} min
 * @param {string} what
 */
function need(buf, min, what) {
  if (buf.byteLength < min) throw new PacketError(`${what}: Paket zu kurz (${buf.byteLength} statt mindestens ${min} Bytes)`);
}

/**
 * @typedef {object} PacketHeader
 * @property {number} packetFormat
 * @property {number} gameYear
 * @property {number} gameMajorVersion
 * @property {number} gameMinorVersion
 * @property {number} packetVersion
 * @property {number} packetId
 * @property {string} sessionUid  uint64 als Dezimal-String (zu groß für Number)
 * @property {number} sessionTime
 * @property {number} frameIdentifier
 * @property {number} overallFrameIdentifier
 * @property {number} playerCarIndex
 * @property {number} secondaryPlayerCarIndex
 */

/**
 * Kopf eines Pakets (29 Bytes, gleich für 2023–2025).
 * @param {Uint8Array} buf
 * @returns {PacketHeader}
 */
export function parseHeader(buf) {
  need(buf, HEADER_SIZE, 'Header');
  const v = view(buf);
  return {
    packetFormat: v.getUint16(0, true),
    gameYear: v.getUint8(2),
    gameMajorVersion: v.getUint8(3),
    gameMinorVersion: v.getUint8(4),
    packetVersion: v.getUint8(5),
    packetId: v.getUint8(6),
    sessionUid: v.getBigUint64(7, true).toString(),
    sessionTime: v.getFloat32(15, true),
    frameIdentifier: v.getUint32(19, true),
    overallFrameIdentifier: v.getUint32(23, true),
    playerCarIndex: v.getUint8(27),
    secondaryPlayerCarIndex: v.getUint8(28),
  };
}

/**
 * @typedef {object} SessionInfo
 * @property {number} weather
 * @property {number} totalLaps
 * @property {number} trackLength   Meter
 * @property {number} sessionType   Spielcode (siehe SESSION_TYPE_NAMES)
 * @property {number} trackId       Spielcode (-1 = unbekannt)
 * @property {number} formula
 * @property {number} networkGame   0 = offline, 1 = online
 */

/**
 * Session-Paket (Id 1) – nur die vorderen Felder, deren Lage seit F1 23 gleich ist.
 * @param {Uint8Array} buf
 * @returns {SessionInfo}
 */
export function parseSession(buf) {
  need(buf, 155, 'Session');
  const v = view(buf);
  return {
    weather: v.getUint8(29),
    totalLaps: v.getUint8(32),
    trackLength: v.getUint16(33, true),
    sessionType: v.getUint8(35),
    trackId: v.getInt8(36),
    formula: v.getUint8(37),
    networkGame: v.getUint8(154),
  };
}

const utf8 = new TextDecoder('utf-8');

/**
 * Nullterminierten UTF-8-Namen lesen (Steuerzeichen entfernt).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function decodeName(bytes) {
  let end = bytes.indexOf(0);
  if (end < 0) end = bytes.length;
  let out = '';
  for (const ch of utf8.decode(bytes.subarray(0, end))) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127 && code !== 0xfffd) out += ch;
  }
  return out.trim();
}

/**
 * @typedef {object} Participant
 * @property {number} carIndex
 * @property {boolean} aiControlled
 * @property {number} driverId
 * @property {number} networkId
 * @property {number} teamId
 * @property {boolean} myTeam
 * @property {number} raceNumber
 * @property {number} nationality
 * @property {string} name
 * @property {boolean} yourTelemetry  Telemetrie öffentlich
 * @property {boolean} showOnlineNames
 * @property {number} platform  1 Steam, 3 PlayStation, 4 Xbox, 6 Origin/EA, 255 unbekannt
 */

/**
 * Teilnehmer (Id 4). Liefert alle 22 Plätze; `numActiveCars` sagt, wie viele belegt sind.
 * @param {Uint8Array} buf
 * @param {PacketLayout} layout
 * @returns {{ numActiveCars: number, participants: Participant[] }}
 */
export function parseParticipants(buf, layout) {
  checkSize(buf, layout.sizes.participants, 'Participants', layout);
  const v = view(buf);
  const numActiveCars = v.getUint8(29);
  /** @type {Participant[]} */
  const participants = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = 30 + i * layout.participantEntry;
    const n = o + 7 + layout.nameLength;
    participants.push({
      carIndex: i,
      aiControlled: v.getUint8(o) === 1,
      driverId: v.getUint8(o + 1),
      networkId: v.getUint8(o + 2),
      teamId: v.getUint8(o + 3),
      myTeam: v.getUint8(o + 4) === 1,
      raceNumber: v.getUint8(o + 5),
      nationality: v.getUint8(o + 6),
      name: decodeName(buf.subarray(o + 7, n)),
      yourTelemetry: v.getUint8(n) === 1,
      showOnlineNames: v.getUint8(n + 1) === 1,
      platform: v.getUint8(layout.hasTechLevel ? n + 4 : n + 2),
    });
  }
  return { numActiveCars, participants };
}

/**
 * @typedef {object} ClassificationEntry
 * @property {number} carIndex
 * @property {number} position
 * @property {number} numLaps
 * @property {number} gridPosition
 * @property {number} points
 * @property {number} numPitStops
 * @property {number} resultStatus   0 ungültig, 1 inaktiv, 2 aktiv, 3 im Ziel, 4 DNF, 5 DSQ, 6 nicht gewertet, 7 aufgegeben
 * @property {number | null} resultReason  nur Format 2025+
 * @property {number} bestLapTimeMs
 * @property {number} totalRaceTimeS  Sekunden ohne Strafen
 * @property {number} penaltiesTimeS
 * @property {number} numPenalties
 * @property {number} numTyreStints
 */

/**
 * Endergebnis (Id 8). Liefert alle 22 Plätze; leere Plätze haben Position 0.
 * @param {Uint8Array} buf
 * @param {PacketLayout} layout
 * @returns {{ numCars: number, entries: ClassificationEntry[] }}
 */
export function parseFinalClassification(buf, layout) {
  checkSize(buf, layout.sizes.finalClassification, 'Final Classification', layout);
  const v = view(buf);
  const numCars = v.getUint8(29);
  const shift = layout.hasResultReason ? 1 : 0;
  /** @type {ClassificationEntry[]} */
  const entries = [];
  for (let i = 0; i < MAX_CARS; i++) {
    const o = 30 + i * layout.classificationEntry;
    entries.push({
      carIndex: i,
      position: v.getUint8(o),
      numLaps: v.getUint8(o + 1),
      gridPosition: v.getUint8(o + 2),
      points: v.getUint8(o + 3),
      numPitStops: v.getUint8(o + 4),
      resultStatus: v.getUint8(o + 5),
      resultReason: layout.hasResultReason ? v.getUint8(o + 6) : null,
      bestLapTimeMs: v.getUint32(o + 6 + shift, true),
      totalRaceTimeS: v.getFloat64(o + 10 + shift, true),
      penaltiesTimeS: v.getUint8(o + 18 + shift),
      numPenalties: v.getUint8(o + 19 + shift),
      numTyreStints: v.getUint8(o + 20 + shift),
    });
  }
  return { numCars, entries };
}

/**
 * @typedef {object} SessionHistory
 * @property {number} carIndex
 * @property {number} numLaps
 * @property {number} bestLapTimeLapNum
 * @property {number | null} bestLapTimeMs  aus der Rundenliste (null ohne gültige Runde)
 * @property {Array<{ lapTimeMs: number, valid: boolean }>} laps
 */

const LAP_HISTORY_SIZE = 14;
const MAX_LAPS_IN_HISTORY = 100;

/**
 * Rundenhistorie eines Autos (Id 11).
 * @param {Uint8Array} buf
 * @param {PacketLayout} layout
 * @returns {SessionHistory}
 */
export function parseSessionHistory(buf, layout) {
  checkSize(buf, layout.sizes.sessionHistory, 'Session History', layout);
  const v = view(buf);
  const carIndex = v.getUint8(29);
  const numLaps = Math.min(v.getUint8(30), MAX_LAPS_IN_HISTORY);
  const bestLapTimeLapNum = v.getUint8(32);
  /** @type {Array<{ lapTimeMs: number, valid: boolean }>} */
  const laps = [];
  for (let i = 0; i < numLaps; i++) {
    const o = 36 + i * LAP_HISTORY_SIZE;
    laps.push({ lapTimeMs: v.getUint32(o, true), valid: (v.getUint8(o + 13) & 0x01) === 0x01 });
  }
  const best = bestLapTimeLapNum >= 1 && bestLapTimeLapNum <= laps.length ? laps[bestLapTimeLapNum - 1] : undefined;
  return {
    carIndex,
    numLaps,
    bestLapTimeLapNum,
    bestLapTimeMs: best && best.lapTimeMs > 0 ? best.lapTimeMs : null,
    laps,
  };
}

/**
 * @param {Uint8Array} buf
 * @param {number} expected
 * @param {string} what
 * @param {PacketLayout} layout
 */
function checkSize(buf, expected, what, layout) {
  if (buf.byteLength >= expected) return;
  if (layout.tentative) {
    throw new UnsupportedFormatError(
      `UDP-Format ${layout.format}: ${what}-Paket hat ${buf.byteLength} Bytes, das bekannte Layout (2025) braucht ${expected}. ` +
        'Das Format ist noch nicht dokumentiert – bitte im Spiel UDP-Format 2025 wählen oder einen Mitschnitt (--record) an die Liga-Technik schicken.',
      layout.format,
    );
  }
  throw new PacketError(`${what}: Paket zu kurz (${buf.byteLength} statt ${expected} Bytes)`);
}

/**
 * @typedef {{ kind: 'session', header: PacketHeader, data: SessionInfo }
 *   | { kind: 'participants', header: PacketHeader, data: { numActiveCars: number, participants: Participant[] } }
 *   | { kind: 'finalClassification', header: PacketHeader, data: { numCars: number, entries: ClassificationEntry[] } }
 *   | { kind: 'sessionHistory', header: PacketHeader, data: SessionHistory }
 *   | { kind: 'other', header: PacketHeader, data: null }} ParsedPacket
 */

/**
 * Paket dekodieren. Nicht benötigte Pakete kommen als `other` zurück (ohne Formatprüfung,
 * damit z. B. Motion-Pakete nicht bei jedem Frame eine Meldung erzeugen).
 * @param {Uint8Array} buf
 * @returns {ParsedPacket}
 */
export function parsePacket(buf) {
  const header = parseHeader(buf);
  switch (header.packetId) {
    case PACKET_ID.session:
      layoutFor(header.packetFormat);
      return { kind: 'session', header, data: parseSession(buf) };
    case PACKET_ID.participants:
      return { kind: 'participants', header, data: parseParticipants(buf, layoutFor(header.packetFormat)) };
    case PACKET_ID.finalClassification:
      return { kind: 'finalClassification', header, data: parseFinalClassification(buf, layoutFor(header.packetFormat)) };
    case PACKET_ID.sessionHistory:
      return { kind: 'sessionHistory', header, data: parseSessionHistory(buf, layoutFor(header.packetFormat)) };
    default:
      return { kind: 'other', header, data: null };
  }
}

// ---------------------------------------------------------------------------- Spielcodes

/** Session-Typen laut Spezifikation F1 24/25. */
export const SESSION_TYPE_NAMES = Object.freeze(
  /** @type {Record<number, string>} */ ({
    0: 'Unbekannt',
    1: 'Training 1',
    2: 'Training 2',
    3: 'Training 3',
    4: 'Kurzes Training',
    5: 'Q1',
    6: 'Q2',
    7: 'Q3',
    8: 'Kurzes Qualifying',
    9: 'Ein-Runden-Qualifying',
    10: 'Sprint-Shootout 1',
    11: 'Sprint-Shootout 2',
    12: 'Sprint-Shootout 3',
    13: 'Kurzes Sprint-Shootout',
    14: 'Ein-Runden-Sprint-Shootout',
    15: 'Rennen',
    16: 'Rennen 2',
    17: 'Rennen 3',
    18: 'Zeitfahren',
  }),
);

/** Status der Final Classification. */
export const RESULT_STATUS_NAMES = Object.freeze(
  /** @type {Record<number, string>} */ ({
    0: 'ungültig',
    1: 'inaktiv',
    2: 'aktiv',
    3: 'im Ziel',
    4: 'nicht im Ziel (DNF)',
    5: 'disqualifiziert',
    6: 'nicht gewertet',
    7: 'aufgegeben',
  }),
);

/** Grund zum Status (nur Format 2025+). */
export const RESULT_REASON_NAMES = Object.freeze(
  /** @type {Record<number, string>} */ ({
    0: 'ungültig',
    1: 'aufgegeben',
    2: 'im Ziel',
    3: 'Totalschaden',
    4: 'inaktiv',
    5: 'zu wenige Runden',
    6: 'schwarze Flagge',
    7: 'rote Flagge',
    8: 'technischer Defekt',
    9: 'Session übersprungen',
    10: 'Session simuliert',
  }),
);

/** Strecken-IDs laut Spezifikation (Auszug für Meldungen). */
export const TRACK_NAMES = Object.freeze(
  /** @type {Record<number, string>} */ ({
    0: 'Melbourne',
    1: 'Paul Ricard',
    2: 'Shanghai',
    3: 'Sakhir',
    4: 'Barcelona',
    5: 'Monaco',
    6: 'Montreal',
    7: 'Silverstone',
    8: 'Hockenheim',
    9: 'Budapest',
    10: 'Spa-Francorchamps',
    11: 'Monza',
    12: 'Singapur',
    13: 'Suzuka',
    14: 'Abu Dhabi',
    15: 'Austin',
    16: 'São Paulo',
    17: 'Spielberg',
    18: 'Sotschi',
    19: 'Mexiko-Stadt',
    20: 'Baku',
    21: 'Sakhir (kurz)',
    22: 'Silverstone (kurz)',
    23: 'Austin (kurz)',
    24: 'Suzuka (kurz)',
    25: 'Hanoi',
    26: 'Zandvoort',
    27: 'Imola',
    28: 'Portimão',
    29: 'Dschidda',
    30: 'Miami',
    31: 'Las Vegas',
    32: 'Lusail',
    39: 'Silverstone (rückwärts)',
    40: 'Spielberg (rückwärts)',
    41: 'Zandvoort (rückwärts)',
  }),
);

/**
 * Art der Session für den Import.
 * @param {number} sessionType
 * @returns {'practice' | 'qualifying' | 'sprint_shootout' | 'race' | 'time_trial' | 'unknown'}
 */
export function sessionKind(sessionType) {
  if (sessionType >= 1 && sessionType <= 4) return 'practice';
  if (sessionType >= 5 && sessionType <= 9) return 'qualifying';
  if (sessionType >= 10 && sessionType <= 14) return 'sprint_shootout';
  if (sessionType >= 15 && sessionType <= 17) return 'race';
  if (sessionType === 18) return 'time_trial';
  return 'unknown';
}
