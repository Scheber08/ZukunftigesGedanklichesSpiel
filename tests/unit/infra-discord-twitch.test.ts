import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '~/lib/db/memory-store';
import { baseDataset } from '~/lib/seed/base';
import { env } from '~/lib/server/env';
import { fetchMemberRoleIds, inviteCodeFromUrl, mapRoles, notify, sendWebhook, siteUrl } from '~/lib/server/discord';
import { twitchLogin } from '~/lib/server/twitch';

const ROLE_MAP = { admin: ['100', '101'], steward: ['200'], redakteur: ['300'] };

describe('mapRoles (Discord-Rollen → App-Rollen, Plan §5)', () => {
  it('ordnet Rollen-IDs laut Zuordnung zu', () => {
    expect(mapRoles(['100'], ROLE_MAP)).toEqual(['admin']);
    expect(mapRoles(['101', '200'], ROLE_MAP)).toEqual(['admin', 'steward']);
    expect(mapRoles(['300', '200', '100'], ROLE_MAP)).toEqual(['admin', 'steward', 'redakteur']);
  });

  it('gibt ohne passende Rolle keinen Zugang', () => {
    expect(mapRoles([], ROLE_MAP)).toEqual([]);
    expect(mapRoles(['999', '1000'], ROLE_MAP)).toEqual([]);
    expect(mapRoles(['100'], { admin: [], steward: [], redakteur: [] })).toEqual([]);
  });

  it('vergleicht IDs exakt (kein Teilstring)', () => {
    expect(mapRoles(['10', '1000', '2000'], ROLE_MAP)).toEqual([]);
  });
});

describe('inviteCodeFromUrl', () => {
  it('liest Codes aus allen üblichen Invite-Formen', () => {
    expect(inviteCodeFromUrl('https://discord.gg/abcDEF12')).toBe('abcDEF12');
    expect(inviteCodeFromUrl('https://discord.com/invite/liga-2026')).toBe('liga-2026');
    expect(inviteCodeFromUrl('https://discordapp.com/invite/xyz')).toBe('xyz');
    expect(inviteCodeFromUrl('discord.gg/kurz')).toBe('kurz');
    expect(inviteCodeFromUrl('https://discord.gg/abc?event=1')).toBe('abc');
  });

  it('liefert null für leere oder fremde URLs', () => {
    expect(inviteCodeFromUrl(null)).toBeNull();
    expect(inviteCodeFromUrl(undefined)).toBeNull();
    expect(inviteCodeFromUrl('')).toBeNull();
    expect(inviteCodeFromUrl('https://example.com/invite/abc')).toBeNull();
  });
});

describe('Discord-Webhooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sendet nichts ohne URL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendWebhook(null, { content: 'x' })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendet ohne Erwähnungen und kürzt auf Discord-Limits', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const ok = await sendWebhook('https://discord.com/api/webhooks/1/abc', {
      content: '@everyone Ergebnis',
      embeds: [{ title: 'T'.repeat(300), description: 'D', fields: [{ name: 'Leer', value: '' }] }],
    });
    expect(ok).toBe(true);
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(target).toBe('https://discord.com/api/webhooks/1/abc?wait=false');
    const body = JSON.parse(String(init.body));
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds[0].title).toHaveLength(256);
    expect(body.embeds[0].title.endsWith('…')).toBe(true);
    expect(body.embeds[0].fields[0].value).toBe('–');
    expect(body.embeds[0].footer.text).toBeTruthy();
  });

  it('wirft nie – ein Discord-Ausfall darf nichts blockieren', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    await expect(sendWebhook('https://discord.com/api/webhooks/1/abc', { content: 'x' })).resolves.toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));
    await expect(sendWebhook('https://discord.com/api/webhooks/1/abc', { content: 'x' })).resolves.toBe(false);
  });

  it('notify nutzt die Webhook-URL des Channels aus den privaten Einstellungen', async () => {
    const store = new MemoryStore(baseDataset());
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await notify(store, 'results', { title: 'R1' })).toBe(false);
    await store.upsert('settings', [
      { key: 'webhooks', value: { results: 'https://discord.com/api/webhooks/9/results' }, is_public: false },
    ]);
    expect(await notify(store, 'results', { title: 'R1' })).toBe(true);
    const [target] = fetchMock.mock.calls[0] as unknown as [string];
    expect(target).toBe('https://discord.com/api/webhooks/9/results?wait=false');
  });
});

describe('Rollenabfrage per Bot-Token', () => {
  const original = { token: env.discordBotToken, guild: env.discordGuildId };
  afterEach(() => {
    env.discordBotToken = original.token;
    env.discordGuildId = original.guild;
  });

  it('liefert null ohne Bot-Konfiguration', async () => {
    env.discordBotToken = undefined;
    env.discordGuildId = undefined;
    expect(await fetchMemberRoleIds('123')).toBeNull();
  });

  it('fragt das Mitglied auf dem Liga-Server ab (404 = kein Mitglied)', async () => {
    env.discordBotToken = 'bot-token';
    env.discordGuildId = 'guild-1';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ roles: ['100', '200'] }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchMemberRoleIds('42')).toEqual(['100', '200']);
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(target).toBe('https://discord.com/api/v10/guilds/guild-1/members/42');
    expect((init.headers as Record<string, string>).authorization).toBe('Bot bot-token');
    expect(await fetchMemberRoleIds('43')).toEqual([]);
    await expect(fetchMemberRoleIds('44')).rejects.toThrow();
  });
});

describe('siteUrl', () => {
  it('baut absolute Links für Embeds', () => {
    expect(siteUrl('/stewards/S2-R03-01', 'https://liga.example')).toBe('https://liga.example/stewards/S2-R03-01');
    expect(siteUrl('/news', 'https://liga.example/')).toBe('https://liga.example/news');
  });
});

describe('twitchLogin (Plan §8.2)', () => {
  it('normalisiert Kanal-Angaben', () => {
    expect(twitchLogin('https://www.twitch.tv/LigaKanal')).toBe('ligakanal');
    expect(twitchLogin('https://twitch.tv/liga_kanal/')).toBe('liga_kanal');
    expect(twitchLogin('twitch.tv/abc123')).toBe('abc123');
    expect(twitchLogin('@Streamer_01')).toBe('streamer_01');
    expect(twitchLogin('  kanal  ')).toBe('kanal');
  });

  it('liefert null für leere oder ungültige Kanäle', () => {
    expect(twitchLogin(null)).toBeNull();
    expect(twitchLogin(undefined)).toBeNull();
    expect(twitchLogin('')).toBeNull();
    expect(twitchLogin('ab')).toBeNull();
    expect(twitchLogin('https://www.twitch.tv/')).toBeNull();
    expect(twitchLogin('kanal mit leerzeichen!')).toBeNull();
  });
});
