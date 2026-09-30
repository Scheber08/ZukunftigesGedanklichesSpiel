// @ts-check
/**
 * Synthetische UDP-Pakete (Gegenstück zu f1-packets.mjs) für Unit-Tests und für einen
 * Beispiel-Mitschnitt, mit dem sich das Companion-Programm ohne Spiel ausprobieren lässt
 * (`node tools/telemetry/companion.mjs --sample beispiel.ndjson`, dann `--replay`).
 */
import { HEADER_SIZE, LAYOUTS, MAX_CARS, PACKET_ID } from './f1-packets.mjs';

/**
 * @typedef {object} HeaderInput
 * @property {number} [packetFormat]
 * @property {number} packetId
 * @property {bigint | string | number} [sessionUid]
 * @property {number} [sessionTime]
 * @property {number} [frame]
 */

/**
 * Layout zum Kodieren (2026 wie 2025).
 * @param {number} packetFormat
 */
function encodingLayout(packetFormat) {
  const layout = LAYOUTS[packetFormat === 2024 ? 2024 : 2025];
  if (!layout) throw new Error(`Kein Layout für ${packetFormat}`);
  return layout;
}

/**
 * @param {Uint8Array} buf
 * @param {HeaderInput} h
 */
function writeHeader(buf, h) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const format = h.packetFormat ?? 2025;
  v.setUint16(0, format, true);
  v.setUint8(2, format % 100);
  v.setUint8(3, 1);
  v.setUint8(4, 10);
  v.setUint8(5, 1);
  v.setUint8(6, h.packetId);
  v.setBigUint64(7, BigInt(h.sessionUid ?? 1234567890123456789n), true);
  v.setFloat32(15, h.sessionTime ?? 0, true);
  v.setUint32(19, h.frame ?? 0, true);
  v.setUint32(23, h.frame ?? 0, true);
  v.setUint8(27, 0);
  v.setUint8(28, 255);
  return v;
}

/**
 * Header allein (z. B. für Motion-Pakete ohne Inhalt).
 * @param {HeaderInput & { size?: number }} h
 */
export function buildHeaderOnly(h) {
  const buf = new Uint8Array(h.size ?? HEADER_SIZE);
  writeHeader(buf, h);
  return buf;
}

/**
 * @param {Omit<HeaderInput, 'packetId'> & { sessionType?: number, trackId?: number, totalLaps?: number, networkGame?: number, size?: number }} input
 */
export function buildSession(input) {
  const buf = new Uint8Array(input.size ?? 753);
  const v = writeHeader(buf, { ...input, packetId: PACKET_ID.session });
  v.setUint8(29, 0);
  v.setUint8(32, input.totalLaps ?? 25);
  v.setUint16(33, 4361, true);
  v.setUint8(35, input.sessionType ?? 15);
  v.setInt8(36, input.trackId ?? 6);
  v.setUint8(154, input.networkGame ?? 1);
  return buf;
}

/**
 * @typedef {object} CarInput
 * @property {number} raceNumber
 * @property {string} [name]
 * @property {number} [teamId]
 * @property {boolean} [ai]
 * @property {number} [platform]
 */

/**
 * @param {Omit<HeaderInput, 'packetId'> & { cars: CarInput[], numActiveCars?: number, size?: number }} input
 */
export function buildParticipants(input) {
  const layout = encodingLayout(input.packetFormat ?? 2025);
  const buf = new Uint8Array(input.size ?? layout.sizes.participants);
  const v = writeHeader(buf, { ...input, packetId: PACKET_ID.participants });
  v.setUint8(29, input.numActiveCars ?? input.cars.length);
  const enc = new TextEncoder();
  input.cars.slice(0, MAX_CARS).forEach((car, i) => {
    const o = 30 + i * layout.participantEntry;
    v.setUint8(o, car.ai ? 1 : 0);
    v.setUint8(o + 1, 255);
    v.setUint8(o + 2, i);
    v.setUint8(o + 3, car.teamId ?? 0);
    v.setUint8(o + 4, 0);
    v.setUint8(o + 5, car.raceNumber);
    v.setUint8(o + 6, 0);
    const name = enc.encode(car.name ?? `Fahrer ${car.raceNumber}`).subarray(0, layout.nameLength - 1);
    buf.set(name, o + 7);
    const n = o + 7 + layout.nameLength;
    v.setUint8(n, 1);
    v.setUint8(n + 1, 1);
    v.setUint16(n + 2, 0, true);
    v.setUint8(n + 4, car.platform ?? 255);
  });
  return buf;
}

/**
 * @typedef {object} ClassificationInput
 * @property {number} carIndex
 * @property {number} position
 * @property {number} [numLaps]
 * @property {number} [gridPosition]
 * @property {number} [numPitStops]
 * @property {number} [resultStatus]
 * @property {number} [resultReason]
 * @property {number} [bestLapTimeMs]
 * @property {number} [totalRaceTimeS]
 * @property {number} [penaltiesTimeS]
 * @property {number} [numPenalties]
 */

/**
 * @param {Omit<HeaderInput, 'packetId'> & { entries: ClassificationInput[], size?: number }} input
 */
export function buildFinalClassification(input) {
  const layout = encodingLayout(input.packetFormat ?? 2025);
  const buf = new Uint8Array(input.size ?? layout.sizes.finalClassification);
  const v = writeHeader(buf, { ...input, packetId: PACKET_ID.finalClassification });
  v.setUint8(29, input.entries.length);
  const shift = layout.hasResultReason ? 1 : 0;
  for (const e of input.entries) {
    const o = 30 + e.carIndex * layout.classificationEntry;
    v.setUint8(o, e.position);
    v.setUint8(o + 1, e.numLaps ?? 0);
    v.setUint8(o + 2, e.gridPosition ?? 0);
    v.setUint8(o + 3, 0);
    v.setUint8(o + 4, e.numPitStops ?? 0);
    v.setUint8(o + 5, e.resultStatus ?? 3);
    if (layout.hasResultReason) v.setUint8(o + 6, e.resultReason ?? 2);
    v.setUint32(o + 6 + shift, e.bestLapTimeMs ?? 0, true);
    v.setFloat64(o + 10 + shift, e.totalRaceTimeS ?? 0, true);
    v.setUint8(o + 18 + shift, e.penaltiesTimeS ?? 0);
    v.setUint8(o + 19 + shift, e.numPenalties ?? 0);
    v.setUint8(o + 20 + shift, 1);
  }
  return buf;
}

/**
 * @param {Omit<HeaderInput, 'packetId'> & { carIndex: number, lapTimesMs: number[], bestLapNum?: number, size?: number }} input
 */
export function buildSessionHistory(input) {
  const layout = encodingLayout(input.packetFormat ?? 2025);
  const buf = new Uint8Array(input.size ?? layout.sizes.sessionHistory);
  const v = writeHeader(buf, { ...input, packetId: PACKET_ID.sessionHistory });
  v.setUint8(29, input.carIndex);
  v.setUint8(30, input.lapTimesMs.length);
  let best = input.bestLapNum ?? 0;
  if (best === 0 && input.lapTimesMs.length > 0) {
    const min = Math.min(...input.lapTimesMs);
    best = input.lapTimesMs.indexOf(min) + 1;
  }
  v.setUint8(32, best);
  input.lapTimesMs.slice(0, 100).forEach((ms, i) => {
    const o = 36 + i * 14;
    v.setUint32(o, ms, true);
    v.setUint8(o + 13, 0x0f);
  });
  return buf;
}

/** Startnummern der Demo-Saison 2 (Runde 5) – passt zum Demo-Modus der Website. */
export const DEMO_NUMBERS = [4, 77, 16, 8, 55, 12, 23, 30, 31, 10, 27, 5, 63, 14, 7, 18, 22, 87, 43, 6, 11, 99];

/**
 * Kompletter kurzer Mitschnitt einer Session: Session, Teilnehmer, Rundenhistorie und
 * Final Classification. Ein zusätzliches KI-Auto (#2) testet die Warnungen.
 * @param {{ packetFormat?: number, sessionUid?: bigint | string, trackId?: number, sessionType?: number, totalLaps?: number, numbers?: number[], seed?: number }} [opts]
 * @returns {Array<{ t: number, buf: Uint8Array }>}
 */
export function sampleSession(opts = {}) {
  const packetFormat = opts.packetFormat ?? 2025;
  const sessionUid = opts.sessionUid ?? 9876543210123456789n;
  const sessionType = opts.sessionType ?? 15;
  const quali = sessionType >= 5 && sessionType <= 14;
  const totalLaps = opts.totalLaps ?? (quali ? 0 : 25);
  const numbers = (opts.numbers ?? DEMO_NUMBERS).slice(0, MAX_CARS - 1);
  let seed = opts.seed ?? 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  /** @type {CarInput[]} */
  // Team 41 = „F1 Generic“ – wird beim Import nicht mit der Aufstellung verglichen
  const cars = numbers.map((n, i) => ({ raceNumber: n, name: `Fahrer ${n}`, teamId: 41, platform: [1, 3, 4, 6][i % 4] }));
  cars.push({ raceNumber: 2, name: 'KI-Fahrer', teamId: 104, ai: true, platform: 255 });
  const common = { packetFormat, sessionUid };

  /** @type {Array<{ t: number, buf: Uint8Array }>} */
  const out = [];
  let t = 0;
  out.push({ t, buf: buildSession({ ...common, sessionType, trackId: opts.trackId ?? 6, totalLaps }) });
  out.push({ t: (t += 50), buf: buildParticipants({ ...common, cars }) });

  const baseLap = 76_000;
  const lapTimes = cars.map((_, i) => Array.from({ length: quali ? 3 : 5 }, () => baseLap + i * 110 + Math.round(random() * 900)));
  lapTimes.forEach((laps, carIndex) => out.push({ t: (t += 20), buf: buildSessionHistory({ ...common, carIndex, lapTimesMs: laps }) }));

  const order = cars.map((_, i) => i);
  /** @type {ClassificationInput[]} */
  const entries = order.map((carIndex, k) => {
    const best = Math.min(...(lapTimes[carIndex] ?? [baseLap]));
    const dnf = !quali && k === order.length - 2;
    const lapped = !quali && k >= order.length - 5 && !dnf;
    return {
      carIndex,
      position: k + 1,
      numLaps: quali ? 3 : dnf ? 12 : lapped ? totalLaps - 1 : totalLaps,
      gridPosition: quali ? 0 : ((k + 3) % order.length) + 1,
      numPitStops: quali ? 0 : dnf ? 0 : 1 + (k % 2),
      resultStatus: dnf ? 4 : 3,
      resultReason: dnf ? 3 : 2,
      bestLapTimeMs: best,
      totalRaceTimeS: quali || dnf ? 0 : totalLaps * 78.5 + k * 7 + random(),
      penaltiesTimeS: k === 3 ? 5 : 0,
      numPenalties: k === 3 ? 1 : 0,
    };
  });
  out.push({ t: (t += 500), buf: buildFinalClassification({ ...common, entries }) });
  // Das Spiel schickt das Endergebnis mitunter mehrfach – das Companion-Programm entdoppelt
  out.push({ t: (t += 200), buf: buildFinalClassification({ ...common, entries }) });
  return out;
}
