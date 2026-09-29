/**
 * Spam-Schutz für öffentliche Formulare ohne Login (Plan §4.6, §4.9):
 * Honeypot, Zeitfalle (signierter Zeitstempel), Cloudflare Turnstile, Rate-Limit pro IP-Hash.
 * IP-Adressen werden nie gespeichert – nur ein gesalzener Hash (gelöscht nach 30 Tagen).
 */
import type { Store } from '../db/store';
import { env, isDemoMode } from './env';

export const HONEYPOT_FIELD = 'website';
export const TIMESTAMP_FIELD = 'form_ts';
export const TURNSTILE_FIELD = 'cf-turnstile-response';

/** Mindestdauer zwischen Formularaufruf und Absenden (Menschen brauchen länger). */
const MIN_FILL_MS = 3_000;
const MAX_FILL_MS = 24 * 3_600_000;

const encoder = new TextEncoder();

function salt(): string {
  if (env.ipHashSalt) return env.ipHashSalt;
  if (import.meta.env.DEV || isDemoMode()) return 'dev-only-salt';
  throw new Error('IP_HASH_SALT ist nicht gesetzt');
}

async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Gesalzener Hash der IP-Adresse (nicht umkehrbar ohne Salt). */
export async function hashIp(ip: string | null | undefined): Promise<string> {
  return (await hmacHex(salt(), `ip:${ip ?? 'unknown'}`)).slice(0, 32);
}

/** IP aus dem Request (Cloudflare setzt cf-connecting-ip). */
export function clientIp(request: Request, fallback?: string): string {
  return request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? fallback ?? 'unknown';
}

/** Signierter Zeitstempel für die Zeitfalle – beim Rendern des Formulars erzeugen. */
export async function createFormToken(now = Date.now()): Promise<string> {
  const ts = String(now);
  return `${ts}.${(await hmacHex(salt(), `ts:${ts}`)).slice(0, 24)}`;
}

export type SpamCheckResult = { ok: true } | { ok: false; reason: 'honeypot' | 'too_fast' | 'expired' | 'invalid_token' | 'turnstile' | 'rate_limited' };

/** Honeypot und Zeitfalle prüfen. */
export async function checkFormToken(form: { honeypot?: string | null; token?: string | null }, now = Date.now()): Promise<SpamCheckResult> {
  if (form.honeypot && form.honeypot.trim() !== '') return { ok: false, reason: 'honeypot' };
  const [ts, sig] = (form.token ?? '').split('.');
  if (!ts || !sig || !/^\d+$/.test(ts)) return { ok: false, reason: 'invalid_token' };
  const expected = (await hmacHex(salt(), `ts:${ts}`)).slice(0, 24);
  if (expected !== sig) return { ok: false, reason: 'invalid_token' };
  const age = now - Number(ts);
  if (age < MIN_FILL_MS) return { ok: false, reason: 'too_fast' };
  if (age > MAX_FILL_MS) return { ok: false, reason: 'expired' };
  return { ok: true };
}

/** Cloudflare Turnstile serverseitig prüfen. Ohne Secret (lokal/Demo) wird übersprungen. */
export async function verifyTurnstile(token: string | null | undefined, ip?: string): Promise<boolean> {
  if (!env.turnstileSecret) {
    if (import.meta.env.DEV || isDemoMode()) return true;
    console.error('TURNSTILE_SECRET_KEY fehlt – Formular abgelehnt');
    return false;
  }
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.turnstileSecret);
  body.append('response', token);
  if (ip && ip !== 'unknown') body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error('Turnstile nicht erreichbar', err);
    return false;
  }
}

/**
 * Rate-Limit: höchstens `max` Einsendungen pro `windowMinutes` und IP-Hash je Formular.
 * Zählt und protokolliert in einem Schritt.
 */
export async function rateLimit(store: Store, bucket: string, ipHash: string, max: number, windowMinutes: number): Promise<boolean> {
  const since = Date.now() - windowMinutes * 60_000;
  const recent = await store.select('rate_limit_events', { eq: { bucket, ip_hash: ipHash }, order: { column: 'created_at', desc: true }, limit: max + 1 });
  const inWindow = recent.filter((e) => new Date(e.created_at).getTime() >= since).length;
  if (inWindow >= max) return false;
  await store.insert('rate_limit_events', { bucket, ip_hash: ipHash });
  return true;
}

/** Alles in einem: Honeypot, Zeitfalle, Turnstile, Rate-Limit. */
export async function guardPublicForm(
  store: Store,
  request: Request,
  input: { honeypot?: string | null; token?: string | null; turnstile?: string | null },
  limit: { bucket: string; max: number; windowMinutes: number },
): Promise<SpamCheckResult & { ipHash?: string }> {
  const token = await checkFormToken({ honeypot: input.honeypot, token: input.token });
  if (!token.ok) return token;
  const ip = clientIp(request);
  if (!(await verifyTurnstile(input.turnstile, ip))) return { ok: false, reason: 'turnstile' };
  const ipHash = await hashIp(ip);
  if (!(await rateLimit(store, limit.bucket, ipHash, limit.max, limit.windowMinutes))) return { ok: false, reason: 'rate_limited' };
  return { ok: true, ipHash };
}
