/**
 * Discord-Bot: Ablauf der Interactions (src/lib/discord-bot/handler.ts) gegen den Demo-Datensatz
 * mit Test-Abhängigkeiten – PING, /naechstes-rennen, /wertung, /fahrer, /rolle (nur konfigurierte
 * Rollen, nie Staff-Rollen, nur auf dem Liga-Server), Autocomplete, Sprache aus dem Locale,
 * allowed_mentions ohne Pings, ephemere Antworten.
 */
import { describe, expect, it, vi } from 'vitest';
import { InteractionType, ResponseType } from '~/lib/discord-bot/commands';
import { handleInteraction, matchSelfRole, type BotDeps, type Interaction, type InteractionOption, type SelfRole } from '~/lib/discord-bot/handler';
import type { InteractionResponse, MessageData } from '~/lib/discord-bot/messages';
import { MemoryStore } from '~/lib/db/memory-store';
import { loadLiveSnapshot, type SnapshotPart } from '~/lib/server/live-data';
import { demoDataset } from '~/lib/seed/demo';

const NOW = new Date('2026-10-15T12:00:00Z');
const GUILD = '111111111111111111';
const USER = '222222222222222222';
const PING_ROLE = '333333333333333333';
const STREAM_ROLE = '444444444444444444';
const ADMIN_ROLE = '555555555555555555';

const ROLES: SelfRole[] = [
  { role_id: PING_ROLE, label_de: 'Renntag-Ping', label_en: 'Race day ping' },
  { role_id: STREAM_ROLE, label_de: 'Stream-Info', label_en: 'Stream info' },
  // Fehlkonfiguration: Staff-Rolle als Selbstrolle – darf trotzdem nie vergeben werden
  { role_id: ADMIN_ROLE, label_de: 'Admin', label_en: 'Admin' },
];

function makeDeps(overrides: Partial<BotDeps> = {}) {
  const store = new MemoryStore(demoDataset(NOW));
  const setRole = vi.fn<BotDeps['setRole']>(async () => 'ok');
  const deps: BotDeps = {
    siteUrl: (path) => new URL(path, 'https://liga.example').href,
    siteName: '[LIGANAME]',
    guildId: GUILD,
    snapshot: (parts: SnapshotPart[]) => loadLiveSnapshot(store, parts, NOW),
    selfRoles: async () => ({ roles: ROLES, blocked: [ADMIN_ROLE] }),
    setRole,
    ...overrides,
  };
  return { deps, setRole };
}

const command = (name: string, options: InteractionOption[] = [], extra: Partial<Interaction> = {}): Interaction => ({
  type: InteractionType.APPLICATION_COMMAND,
  locale: 'de',
  guild_id: GUILD,
  member: { user: { id: USER }, roles: [] },
  data: { name, options },
  ...extra,
});

const data = (r: InteractionResponse) => r.data as MessageData;

function expectNoPings(r: InteractionResponse) {
  expect(r.type).toBe(ResponseType.CHANNEL_MESSAGE);
  expect(data(r).allowed_mentions).toEqual({ parse: [] });
}

describe('Grundlagen', () => {
  it('PING → PONG', async () => {
    const { deps } = makeDeps();
    expect(await handleInteraction({ type: InteractionType.PING }, deps)).toEqual({ type: ResponseType.PONG });
  });

  it('unbekannter Befehl → ephemere Antwort', async () => {
    const { deps } = makeDeps();
    const r = await handleInteraction(command('gibtsnicht'), deps);
    expectNoPings(r);
    expect(data(r).flags).toBe(64);
  });

  it('Datenfehler → freundliche Fehlermeldung statt Absturz', async () => {
    const { deps } = makeDeps({ snapshot: async () => Promise.reject(new Error('db down')) });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await handleInteraction(command('next-race'), deps);
    expect(data(r).content).toMatch(/nicht erreichbar/);
    expect(spy).toHaveBeenCalled();
  });
});

describe('/naechstes-rennen', () => {
  it('Embed mit Discord-Zeitstempeln (F und R), Liga-Zeit und Link zur Rennseite', async () => {
    const { deps } = makeDeps();
    const r = await handleInteraction(command('next-race'), deps);
    expectNoPings(r);
    const embed = data(r).embeds![0]!;
    expect(embed.title).toMatch(/^R\d+ · /);
    expect(embed.description).toMatch(/<t:\d+:F>/);
    expect(embed.description).toMatch(/<t:\d+:R>/);
    expect(embed.url).toMatch(/^https:\/\/liga\.example\/rennen\/2\/\d+$/);
    expect(embed.fields!.some((f) => f.name === 'Liga-Zeit')).toBe(true);
    expect(data(r).components![0]!.components[0]).toMatchObject({ type: 2, style: 5, url: embed.url });
    // öffentlich im Channel
    expect(data(r).flags).toBeUndefined();
  });

  it('Englisch für alle nicht-deutschen Locales', async () => {
    const { deps } = makeDeps();
    const r = await handleInteraction(command('next-race', [], { locale: 'en-US' }), deps);
    expect(data(r).embeds![0]!.url).toMatch(/\/en\/races\/2\/\d+$/);
    expect(data(r).embeds![0]!.fields![0]!.name).toBe('League time');
    const fr = await handleInteraction(command('naechstes-rennen', [], { locale: 'fr' }), deps);
    expect(data(fr).embeds![0]!.fields![0]!.name).toBe('League time');
  });
});

describe('/wertung', () => {
  it('Top 10 Fahrer, Gamertags ohne Markdown-Effekte', async () => {
    const { deps } = makeDeps();
    const r = await handleInteraction(command('standings'), deps);
    expectNoPings(r);
    const embed = data(r).embeds![0]!;
    expect(embed.title).toBe('Fahrerwertung · Saison 2');
    const lines = embed.description!.split('\n');
    expect(lines).toHaveLength(10);
    expect(lines[0]).toMatch(/^` {2}1` \*\*.+\*\* · .+ – \d+ Pkt\.$/);
    // Unterstriche maskiert (Slipstream_Sam)
    expect(embed.description).toContain('Slipstream\\_Sam');
    expect(embed.footer!.text).toMatch(/^Stand nach R\d+ · /);
  });

  it('Konstrukteure über die Option art', async () => {
    const { deps } = makeDeps();
    const r = await handleInteraction(command('standings', [{ name: 'type', type: 3, value: 'teams' }], { locale: 'en-GB' }), deps);
    const embed = data(r).embeds![0]!;
    expect(embed.title).toBe("Constructors' standings · Season 2");
    expect(embed.url).toBe('https://liga.example/en/standings');
    expect(embed.description!.split('\n').length).toBeLessThanOrEqual(10);
  });
});

describe('/fahrer', () => {
  it('Kurzprofil mit Team, Nummer, Platz und Link', async () => {
    const { deps } = makeDeps();
    const r = await handleInteraction(command('driver', [{ name: 'name', type: 3, value: 'apexanna' }]), deps);
    expectNoPings(r);
    const embed = data(r).embeds![0]!;
    expect(embed.title).toMatch(/^#\d+ ApexAnna/);
    expect(embed.url).toBe('https://liga.example/fahrer/apexanna');
    expect(embed.fields!.map((f) => f.name)).toEqual(expect.arrayContaining(['Team', 'Startnummer', 'Platz (Saison 2)']));
  });

  it('mehrdeutig bzw. unbekannt → ephemerer Hinweis', async () => {
    const { deps } = makeDeps();
    const amb = await handleInteraction(command('driver', [{ name: 'name', type: 3, value: 'a' }]), deps);
    expect(data(amb).flags).toBe(64);
    expect(data(amb).content).toMatch(/Mehrere Fahrer/);
    const none = await handleInteraction(command('driver', [{ name: 'name', type: 3, value: '@everyone' }]), deps);
    expect(data(none).content).toMatch(/Kein Fahrer gefunden/);
    expect(data(none).allowed_mentions).toEqual({ parse: [] });
  });
});

describe('/rolle', () => {
  it('vergibt eine konfigurierte Rolle (ephemer) und entfernt sie wieder', async () => {
    const { deps, setRole } = makeDeps();
    const add = await handleInteraction(command('role', [{ name: 'role', type: 3, value: PING_ROLE }]), deps);
    expect(setRole).toHaveBeenLastCalledWith(GUILD, USER, PING_ROLE, true, expect.any(String));
    expect(data(add).flags).toBe(64);
    expect(data(add).content).toBe('Rolle „Renntag-Ping“ hinzugefügt.');
    const remove = await handleInteraction(command('role', [{ name: 'role', type: 3, value: PING_ROLE }], { member: { user: { id: USER }, roles: [PING_ROLE] }, locale: 'en-US' }), deps);
    expect(setRole).toHaveBeenLastCalledWith(GUILD, USER, PING_ROLE, false, expect.any(String));
    expect(data(remove).content).toBe('Role “Race day ping” removed.');
  });

  it('getippte Bezeichnung statt Auswahl funktioniert', () => {
    expect(matchSelfRole(ROLES, 'renntag-ping')?.role_id).toBe(PING_ROLE);
    expect(matchSelfRole(ROLES, 'Stream info')?.role_id).toBe(STREAM_ROLE);
    expect(matchSelfRole(ROLES, '')).toBeUndefined();
  });

  it('nur konfigurierte Rollen – beliebige IDs und Staff-Rollen werden abgelehnt', async () => {
    const { deps, setRole } = makeDeps();
    const other = await handleInteraction(command('role', [{ name: 'role', type: 3, value: '999999999999999999' }]), deps);
    expect(data(other).content).toMatch(/nicht selbst vergeben/);
    const admin = await handleInteraction(command('role', [{ name: 'role', type: 3, value: ADMIN_ROLE }]), deps);
    expect(data(admin).content).toMatch(/nicht selbst vergeben/);
    expect(setRole).not.toHaveBeenCalled();
  });

  it('nur auf dem Liga-Server (nicht per DM, nicht auf fremden Servern)', async () => {
    const { deps, setRole } = makeDeps();
    const dm = await handleInteraction(command('role', [{ name: 'role', type: 3, value: PING_ROLE }], { guild_id: undefined, member: undefined, user: { id: USER } }), deps);
    expect(data(dm).content).toMatch(/nur auf dem Liga-Server/);
    const foreign = await handleInteraction(command('role', [{ name: 'role', type: 3, value: PING_ROLE }], { guild_id: '999999999999999998' }), deps);
    expect(data(foreign).content).toMatch(/nur auf dem Liga-Server/);
    expect(setRole).not.toHaveBeenCalled();
  });

  it('ohne DISCORD_GUILD_ID ist /rolle aus (auch kein Autocomplete)', async () => {
    const { deps, setRole } = makeDeps({ guildId: null });
    const r = await handleInteraction(command('role', [{ name: 'role', type: 3, value: PING_ROLE }]), deps);
    expect(data(r).content).toMatch(/noch nicht eingerichtet/);
    expect(data(r).flags).toBe(64);
    const auto = await handleInteraction(
      { type: InteractionType.AUTOCOMPLETE, locale: 'de', guild_id: GUILD, member: { user: { id: USER }, roles: [] }, data: { name: 'role', options: [{ name: 'role', type: 3, value: '', focused: true }] } },
      deps,
    );
    expect((auto.data as { choices: unknown[] }).choices).toEqual([]);
    expect(setRole).not.toHaveBeenCalled();
  });

  it('Fehler der Discord-API und fehlendes Token werden verständlich gemeldet', async () => {
    for (const [result, text] of [
      ['forbidden', /darf diese Rolle gerade nicht/],
      ['no_token', /noch nicht eingerichtet/],
      ['error', /nicht geklappt/],
    ] as const) {
      const { deps } = makeDeps({ setRole: async () => result });
      const r = await handleInteraction(command('role', [{ name: 'role', type: 3, value: STREAM_ROLE }]), deps);
      expect(data(r).content).toMatch(text);
      expect(data(r).flags).toBe(64);
    }
  });

  it('ohne eingerichtete Selbstrollen', async () => {
    const { deps } = makeDeps({ selfRoles: async () => ({ roles: [], blocked: [] }) });
    const r = await handleInteraction(command('role', [{ name: 'role', type: 3, value: PING_ROLE }]), deps);
    expect(data(r).content).toMatch(/keine Selbstrollen/);
  });
});

describe('Autocomplete', () => {
  const auto = (name: string, value: string, extra: Partial<Interaction> = {}): Interaction => ({
    type: InteractionType.AUTOCOMPLETE,
    locale: 'de',
    guild_id: GUILD,
    member: { user: { id: USER }, roles: [PING_ROLE] },
    data: { name, options: [{ name: name === 'role' ? 'role' : 'name', type: 3, value, focused: true }] },
    ...extra,
  });
  const choices = (r: InteractionResponse) => (r.data as { choices: Array<{ name: string; value: string }> }).choices;

  it('/fahrer: Gamertags als Vorschläge, Slug als Wert, höchstens 25', async () => {
    const { deps } = makeDeps();
    const r = await handleInteraction(auto('driver', 'apex'), deps);
    expect(r.type).toBe(ResponseType.AUTOCOMPLETE_RESULT);
    expect(choices(r)[0]).toEqual({ name: 'ApexAnna', value: 'apexanna' });
    expect(choices(await handleInteraction(auto('driver', ''), deps)).length).toBeLessThanOrEqual(25);
  });

  it('/rolle: nur erlaubte Rollen, mit „hinzufügen“/„entfernen“ je nach Mitgliedschaft', async () => {
    const { deps } = makeDeps();
    const r = choices(await handleInteraction(auto('role', ''), deps));
    expect(r).toEqual([
      { name: 'Renntag-Ping – entfernen', value: PING_ROLE },
      { name: 'Stream-Info – hinzufügen', value: STREAM_ROLE },
    ]);
    expect(choices(await handleInteraction(auto('role', 'stream', { locale: 'en-US' }), deps))).toEqual([{ name: 'Stream info – add', value: STREAM_ROLE }]);
    expect(choices(await handleInteraction(auto('role', '', { guild_id: '999999999999999998' }), deps))).toEqual([]);
  });
});
