/**
 * Signaturprüfung für den Discord-Interactions-Endpunkt (Ed25519 über WebCrypto).
 * Discord signiert `timestamp + rawBody` mit dem privaten Schlüssel der Application; geprüft wird
 * gegen den öffentlichen Schlüssel aus dem Developer Portal (DISCORD_PUBLIC_KEY, hex).
 * Ungültige Signaturen MÜSSEN mit 401 beantwortet werden – Discord testet das beim Eintragen der URL.
 */

/** Hex-String → Bytes; null bei ungültiger Eingabe. */
export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim();
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Discord-Zeitstempel (Sekunden) darf höchstens so weit abweichen (Schutz gegen Wiederholung). */
export const MAX_TIMESTAMP_SKEW_S = 600;

const keyCache = new Map<string, Promise<CryptoKey>>();

function importPublicKey(publicKeyHex: string, bytes: Uint8Array): Promise<CryptoKey> {
  let key = keyCache.get(publicKeyHex);
  if (!key) {
    const raw = bytes.slice().buffer;
    key = crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']).catch(() =>
      // Ältere Workers-Laufzeiten kennen Ed25519 nur unter diesem Namen
      crypto.subtle.importKey('raw', raw, { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' } as unknown as AlgorithmIdentifier, false, ['verify']),
    );
    key.catch(() => keyCache.delete(publicKeyHex));
    keyCache.set(publicKeyHex, key);
  }
  return key;
}

export interface VerifyOptions {
  /** Aktuelle Zeit in ms (Tests) */
  now?: number;
  /** Zeitstempel-Prüfung abschalten (nur Tests) */
  skipTimestampCheck?: boolean;
}

/**
 * Prüft eine Discord-Anfrage. Liefert nie einen Fehler, sondern false bei allem, was nicht
 * eindeutig gültig ist (fehlende Header, kaputtes Hex, falscher Schlüssel, alter Zeitstempel).
 */
export async function verifyDiscordRequest(
  publicKeyHex: string,
  signatureHex: string | null | undefined,
  timestamp: string | null | undefined,
  rawBody: string,
  options: VerifyOptions = {},
): Promise<boolean> {
  if (!signatureHex || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (!options.skipTimestampCheck) {
    const now = options.now ?? Date.now();
    if (Math.abs(now / 1000 - Number(timestamp)) > MAX_TIMESTAMP_SKEW_S) return false;
  }
  const signature = hexToBytes(signatureHex);
  const publicKey = hexToBytes(publicKeyHex);
  if (!signature || signature.length !== 64 || !publicKey || publicKey.length !== 32) return false;
  try {
    const key = await importPublicKey(publicKeyHex.trim().toLowerCase(), publicKey);
    const message = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify({ name: key.algorithm.name }, key, signature.slice().buffer, message);
  } catch {
    return false;
  }
}
