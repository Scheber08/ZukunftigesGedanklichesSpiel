/**
 * Discord-Bot: Interactions-Endpunkt POST /api/discord/interactions (Demo-Store, Test-Schlüsselpaar).
 * Ohne DISCORD_PUBLIC_KEY 404, ungültige Signatur 401, gültiger PING → PONG, Befehl → Embed.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '~/lib/server/env';
import { POST } from '~/pages/api/discord/interactions';

const toHex = (buf: ArrayBuffer) => Buffer.from(new Uint8Array(buf)).toString('hex');
let publicKeyHex = '';
let privateKey: CryptoKey;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  privateKey = pair.privateKey;
  publicKeyHex = toHex(await crypto.subtle.exportKey('raw', pair.publicKey));
});

afterEach(() => {
  env.discordPublicKey = undefined;
});

async function call(body: string, opts: { sign?: boolean; tamper?: boolean } = {}): Promise<Response> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-signature-timestamp': timestamp };
  if (opts.sign !== false) {
    const sig = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(timestamp + body));
    headers['x-signature-ed25519'] = toHex(sig);
  }
  const request = new Request('https://liga.example/api/discord/interactions', {
    method: 'POST',
    headers,
    body: opts.tamper ? body.replace('1', '2') : body,
  });
  return POST({ request } as unknown as Parameters<typeof POST>[0]);
}

describe('POST /api/discord/interactions', () => {
  it('ohne öffentlichen Schlüssel ist der Bot aus (404)', async () => {
    const res = await call(JSON.stringify({ type: 1 }));
    expect(res.status).toBe(404);
  });

  it('ungültige oder fehlende Signatur → 401', async () => {
    env.discordPublicKey = publicKeyHex;
    expect((await call(JSON.stringify({ type: 1 }), { sign: false })).status).toBe(401);
    expect((await call(JSON.stringify({ type: 1 }), { tamper: true })).status).toBe(401);
  });

  it('gültiger PING → PONG', async () => {
    env.discordPublicKey = publicKeyHex;
    const res = await call(JSON.stringify({ type: 1, id: '1', token: 't' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ type: 1 });
  });

  it('gültiger Befehl → Antwort mit Embed ohne Pings', async () => {
    env.discordPublicKey = publicKeyHex;
    const res = await call(JSON.stringify({ type: 2, locale: 'de', data: { name: 'standings' } }));
    const json = (await res.json()) as { type: number; data: { embeds: Array<{ title: string }>; allowed_mentions: unknown } };
    expect(json.type).toBe(4);
    expect(json.data.allowed_mentions).toEqual({ parse: [] });
    expect(json.data.embeds[0]!.title).toMatch(/^Fahrerwertung/);
  });

  it('kaputtes JSON mit gültiger Signatur → 400', async () => {
    env.discordPublicKey = publicKeyHex;
    expect((await call('{kein json')).status).toBe(400);
  });
});
