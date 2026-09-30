/**
 * Discord-Bot: Ed25519-Signaturprüfung (src/lib/discord-bot/verify.ts) mit einem in Node
 * erzeugten Schlüsselpaar – gültige Signatur, veränderter Text, falscher Schlüssel,
 * kaputte Header und veraltete Zeitstempel.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { hexToBytes, MAX_TIMESTAMP_SKEW_S, verifyDiscordRequest } from '~/lib/discord-bot/verify';

const toHex = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('hex');

let publicKeyHex = '';
let otherPublicKeyHex = '';
let privateKey: CryptoKey;

async function sign(timestamp: string, body: string, key: CryptoKey = privateKey): Promise<string> {
  return toHex(await crypto.subtle.sign('Ed25519', key, new TextEncoder().encode(timestamp + body)));
}

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  privateKey = pair.privateKey;
  publicKeyHex = toHex(await crypto.subtle.exportKey('raw', pair.publicKey));
  const other = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  otherPublicKeyHex = toHex(await crypto.subtle.exportKey('raw', other.publicKey));
});

const now = Date.UTC(2026, 9, 1, 12, 0, 0);
const ts = String(Math.floor(now / 1000));
const body = JSON.stringify({ type: 1, id: '123', token: 'abc' });

describe('verifyDiscordRequest', () => {
  it('akzeptiert eine gültige Signatur', async () => {
    const sig = await sign(ts, body);
    expect(publicKeyHex).toHaveLength(64);
    expect(sig).toHaveLength(128);
    expect(await verifyDiscordRequest(publicKeyHex, sig, ts, body, { now })).toBe(true);
    // Groß-/Kleinschreibung im Hex spielt keine Rolle
    expect(await verifyDiscordRequest(publicKeyHex.toUpperCase(), sig.toUpperCase(), ts, body, { now })).toBe(true);
  });

  it('lehnt veränderten Text, anderen Zeitstempel und fremden Schlüssel ab', async () => {
    const sig = await sign(ts, body);
    expect(await verifyDiscordRequest(publicKeyHex, sig, ts, body.replace('123', '124'), { now })).toBe(false);
    expect(await verifyDiscordRequest(publicKeyHex, sig, String(Number(ts) + 1), body, { now })).toBe(false);
    expect(await verifyDiscordRequest(otherPublicKeyHex, sig, ts, body, { now })).toBe(false);
  });

  it('lehnt fehlende oder kaputte Header ab (ohne Ausnahme)', async () => {
    const sig = await sign(ts, body);
    expect(await verifyDiscordRequest(publicKeyHex, null, ts, body, { now })).toBe(false);
    expect(await verifyDiscordRequest(publicKeyHex, sig, null, body, { now })).toBe(false);
    expect(await verifyDiscordRequest(publicKeyHex, 'zz' + sig.slice(2), ts, body, { now })).toBe(false);
    expect(await verifyDiscordRequest(publicKeyHex, sig.slice(0, 126), ts, body, { now })).toBe(false);
    expect(await verifyDiscordRequest(publicKeyHex, sig, 'abc', body, { now })).toBe(false);
    expect(await verifyDiscordRequest('nicht-hex', sig, ts, body, { now })).toBe(false);
    expect(await verifyDiscordRequest(publicKeyHex.slice(0, 62), sig, ts, body, { now })).toBe(false);
  });

  it('lehnt veraltete Zeitstempel ab (Wiederholungsschutz)', async () => {
    const old = String(Number(ts) - MAX_TIMESTAMP_SKEW_S - 5);
    const sig = await sign(old, body);
    expect(await verifyDiscordRequest(publicKeyHex, sig, old, body, { now })).toBe(false);
    expect(await verifyDiscordRequest(publicKeyHex, sig, old, body, { now, skipTimestampCheck: true })).toBe(true);
  });
});

describe('hexToBytes', () => {
  it('wandelt gültiges Hex, lehnt Unsinn ab', () => {
    expect([...hexToBytes('00ff10')!]).toEqual([0, 255, 16]);
    expect(hexToBytes('abc')).toBeNull();
    expect(hexToBytes('')).toBeNull();
    expect(hexToBytes('gg')).toBeNull();
  });
});
