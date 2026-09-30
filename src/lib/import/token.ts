/**
 * Import-Token für das Telemetrie-Companion (Plan Phase 2): zufällig erzeugt, einmal im Klartext
 * angezeigt, gespeichert wird nur der SHA-256-Hash (settings.import_token). Geprüft wird in
 * konstanter Zeit. Nur WebCrypto – läuft im Worker, im Browser und in Node.
 */

export const TOKEN_PREFIX = 'liga_imp_';
const TOKEN_BYTES = 32;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Neues Token, z. B. „liga_imp_3q2…“ (256 Bit Zufall). */
export function generateImportToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + toBase64Url(bytes);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(new Uint8Array(digest));
}

/** Vergleich in konstanter Zeit (Länge wird mitverglichen, ohne früh abzubrechen). */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** „Authorization: Bearer <token>“ → Token (sonst null). */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S{16,256})\s*$/i.exec(header);
  return m ? m[1]! : null;
}

/** Stimmt das Token mit dem gespeicherten Hash überein? */
export async function verifyImportToken(token: string | null, storedHash: string | null | undefined): Promise<boolean> {
  if (!storedHash) return false;
  // Auch ohne Token hashen, damit die Antwortzeit nichts verrät
  const hash = await sha256Hex(token ?? '');
  return token != null && timingSafeEqual(hash, storedHash.toLowerCase());
}

/** Kürzel zum Wiedererkennen in der Oberfläche (erste Zeichen des Hashes, nicht des Tokens). */
export function tokenFingerprint(hash: string | null | undefined): string | null {
  return hash ? hash.slice(0, 8) : null;
}
