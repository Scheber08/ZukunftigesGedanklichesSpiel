// @ts-check
/**
 * Mitschnitt roher UDP-Pakete als NDJSON (eine Zeile je Paket), damit sich eine Session
 * später ohne Spiel abspielen lässt (`--record` / `--replay`).
 *
 *   {"liga-telemetry-recording":1,"startedAt":"2026-10-01T18:00:00.000Z"}
 *   {"t":0,"d":"<Base64>"}
 *   {"t":16,"d":"<Base64>"}
 *
 * `t` = Millisekunden seit Beginn des Mitschnitts.
 */

export const RECORDING_VERSION = 1;

/**
 * @param {Date} [startedAt]
 * @returns {string}
 */
export function recordingHeaderLine(startedAt = new Date()) {
  return `${JSON.stringify({ 'liga-telemetry-recording': RECORDING_VERSION, startedAt: startedAt.toISOString() })}\n`;
}

/**
 * @param {Uint8Array} buf
 * @param {number} t
 * @returns {string}
 */
export function recordingLine(buf, t) {
  return `${JSON.stringify({ t: Math.max(0, Math.round(t)), d: Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('base64') })}\n`;
}

/**
 * Ganzen Mitschnitt kodieren.
 * @param {Array<{ t: number, buf: Uint8Array }>} packets
 * @param {Date} [startedAt]
 */
export function encodeRecording(packets, startedAt) {
  return recordingHeaderLine(startedAt) + packets.map((p) => recordingLine(p.buf, p.t)).join('');
}

/**
 * Mitschnitt lesen. Kaputte Zeilen werden gezählt und übersprungen.
 * @param {string} text
 * @returns {{ packets: Array<{ t: number, buf: Uint8Array }>, skipped: number }}
 */
export function parseRecording(text) {
  /** @type {Array<{ t: number, buf: Uint8Array }>} */
  const packets = [];
  let skipped = 0;
  let sawHeader = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }
    if (obj && typeof obj === 'object' && 'liga-telemetry-recording' in obj) {
      sawHeader = true;
      continue;
    }
    if (!obj || typeof obj.d !== 'string' || typeof obj.t !== 'number') {
      skipped++;
      continue;
    }
    packets.push({ t: obj.t, buf: new Uint8Array(Buffer.from(obj.d, 'base64')) });
  }
  if (!sawHeader && packets.length === 0) throw new Error('Keine Pakete gefunden – ist das ein Mitschnitt des Companion-Programms (--record)?');
  return { packets, skipped };
}
