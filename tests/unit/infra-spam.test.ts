/**
 * Spam-Schutz öffentlicher Formulare (Plan §4.6, §4.9): Honeypot, Zeitfalle (signierter
 * Zeitstempel), Turnstile, Rate-Limit pro IP-Hash – gegen den astro:env-Mock getestet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '~/lib/db/memory-store';
import { env } from '~/lib/server/env';
import { checkFormToken, clientIp, createFormToken, guardPublicForm, hashIp, rateLimit, verifyTurnstile } from '~/lib/server/spam';

const T0 = Date.parse('2026-10-01T12:00:00Z');
const original = { salt: env.ipHashSalt, turnstile: env.turnstileSecret };

beforeEach(() => {
  env.ipHashSalt = 'test-salt-1';
});

afterEach(() => {
  env.ipHashSalt = original.salt;
  env.turnstileSecret = original.turnstile;
});

describe('Zeitfalle (createFormToken/checkFormToken)', () => {
  it('lehnt zu schnelles Absenden ab (< 3 s)', async () => {
    const token = await createFormToken(T0);
    expect(await checkFormToken({ token }, T0)).toEqual({ ok: false, reason: 'too_fast' });
    expect(await checkFormToken({ token }, T0 + 2_999)).toEqual({ ok: false, reason: 'too_fast' });
  });

  it('akzeptiert nach 3 s (die E2E-Tests warten 4 s)', async () => {
    const token = await createFormToken(T0);
    expect(await checkFormToken({ token }, T0 + 3_000)).toEqual({ ok: true });
    expect(await checkFormToken({ token }, T0 + 4_000)).toEqual({ ok: true });
  });

  it('läuft nach 24 h ab', async () => {
    const token = await createFormToken(T0);
    expect(await checkFormToken({ token }, T0 + 24 * 3_600_000)).toEqual({ ok: true });
    expect(await checkFormToken({ token }, T0 + 24 * 3_600_000 + 1)).toEqual({ ok: false, reason: 'expired' });
  });

  it('erkennt manipulierte oder fehlende Tokens', async () => {
    const token = await createFormToken(T0);
    const [ts, sig] = token.split('.');
    const earlier = `${Number(ts) - 60_000}.${sig}`;
    expect(await checkFormToken({ token: earlier }, T0 + 10_000)).toEqual({ ok: false, reason: 'invalid_token' });
    expect(await checkFormToken({ token: `${ts}.${'0'.repeat(24)}` }, T0 + 10_000)).toEqual({ ok: false, reason: 'invalid_token' });
    for (const bad of [null, undefined, '', 'abc', '123', 'abc.def', `${ts}.`]) {
      expect(await checkFormToken({ token: bad }, T0 + 10_000), String(bad)).toEqual({ ok: false, reason: 'invalid_token' });
    }
  });

  it('bindet das Token an das Salt (anderes Salt = ungültig)', async () => {
    const token = await createFormToken(T0);
    env.ipHashSalt = 'anderes-salt';
    expect(await checkFormToken({ token }, T0 + 10_000)).toEqual({ ok: false, reason: 'invalid_token' });
  });

  it('prüft den Honeypot vor allem anderen', async () => {
    const token = await createFormToken(T0);
    expect(await checkFormToken({ token, honeypot: 'https://spam.example' }, T0 + 10_000)).toEqual({ ok: false, reason: 'honeypot' });
    expect(await checkFormToken({ token, honeypot: '   ' }, T0 + 10_000)).toEqual({ ok: true });
  });
});

describe('IP-Hash', () => {
  it('ist deterministisch, 32 Hex-Zeichen und enthält die IP nicht', async () => {
    const a = await hashIp('203.0.113.7');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await hashIp('203.0.113.7')).toBe(a);
    expect(await hashIp('203.0.113.8')).not.toBe(a);
    expect(a).not.toContain('203');
  });

  it('hängt vom Salt ab', async () => {
    const a = await hashIp('203.0.113.7');
    env.ipHashSalt = 'anderes-salt';
    expect(await hashIp('203.0.113.7')).not.toBe(a);
  });

  it('liest die IP bevorzugt aus cf-connecting-ip', () => {
    const req = (headers: Record<string, string>) => new Request('https://liga.example/mitfahren', { headers });
    expect(clientIp(req({ 'cf-connecting-ip': '198.51.100.1', 'x-forwarded-for': '10.0.0.1' }))).toBe('198.51.100.1');
    expect(clientIp(req({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }))).toBe('198.51.100.2');
    expect(clientIp(req({}))).toBe('unknown');
    expect(clientIp(req({}), '127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('Turnstile', () => {
  it('wird ohne Secret im Demo-/Dev-Modus übersprungen', async () => {
    env.turnstileSecret = undefined;
    expect(await verifyTurnstile(null)).toBe(true);
  });

  it('prüft mit Secret serverseitig bei Cloudflare', async () => {
    env.turnstileSecret = 'secret';
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await verifyTurnstile('token-123', '198.51.100.1')).toBe(true);
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(target).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = init.body as FormData;
    expect(body.get('secret')).toBe('secret');
    expect(body.get('response')).toBe('token-123');
    expect(body.get('remoteip')).toBe('198.51.100.1');
  });

  it('lehnt mit Secret ohne Token, bei success=false und bei Netzfehlern ab', async () => {
    env.turnstileSecret = 'secret';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await verifyTurnstile(null)).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: false })));
    expect(await verifyTurnstile('x')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await verifyTurnstile('x')).toBe(false);
  });
});

describe('Rate-Limit', () => {
  it('erlaubt max Einsendungen pro Fenster und Formular', async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 3; i++) expect(await rateLimit(store, 'registration', 'hash-a', 3, 60)).toBe(true);
    expect(await rateLimit(store, 'registration', 'hash-a', 3, 60)).toBe(false);
    // anderes Formular und andere IP sind unabhängig
    expect(await rateLimit(store, 'incident', 'hash-a', 3, 60)).toBe(true);
    expect(await rateLimit(store, 'registration', 'hash-b', 3, 60)).toBe(true);
  });

  it('zählt nur Einsendungen im Zeitfenster', async () => {
    const store = new MemoryStore();
    const old = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await store.insert('rate_limit_events', [
      { bucket: 'contact', ip_hash: 'h', created_at: old },
      { bucket: 'contact', ip_hash: 'h', created_at: old },
    ]);
    expect(await rateLimit(store, 'contact', 'h', 2, 60)).toBe(true);
  });
});

describe('guardPublicForm', () => {
  it('liefert den IP-Hash, wenn alle Prüfungen bestehen', async () => {
    env.turnstileSecret = undefined;
    const store = new MemoryStore();
    const token = await createFormToken(Date.now() - 5_000);
    const request = new Request('https://liga.example/mitfahren', { method: 'POST', headers: { 'cf-connecting-ip': '198.51.100.9' } });
    const result = await guardPublicForm(store, request, { token, honeypot: '' }, { bucket: 'registration', max: 1, windowMinutes: 60 });
    expect(result.ok).toBe(true);
    expect(result.ipHash).toBe(await hashIp('198.51.100.9'));
    // zweites Absenden aus derselben Quelle → Rate-Limit
    const again = await guardPublicForm(store, request, { token }, { bucket: 'registration', max: 1, windowMinutes: 60 });
    expect(again).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('stoppt bei zu schnellem Absenden, bevor etwas gezählt wird', async () => {
    const store = new MemoryStore();
    const token = await createFormToken(Date.now());
    const request = new Request('https://liga.example/kontakt', { method: 'POST' });
    expect(await guardPublicForm(store, request, { token }, { bucket: 'contact', max: 5, windowMinutes: 60 })).toEqual({
      ok: false,
      reason: 'too_fast',
    });
    expect(await store.select('rate_limit_events')).toHaveLength(0);
  });
});
