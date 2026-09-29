import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '~/lib/db/memory-store';
import { baseDataset } from '~/lib/seed/base';
import { env } from '~/lib/server/env';
import { dispatchBuild, processRebuildQueue, REBUILD_DEBOUNCE_MS, rebuildDecision, requestRebuild } from '~/lib/server/rebuild';
import { readPrivateSettings } from '~/lib/server/settings';
import { setMockEnv } from '../mocks/astro-env';

const at = (iso: string) => new Date(iso);

describe('rebuildDecision (gebündelter Rebuild, Plan §7.2)', () => {
  it('ist untätig ohne Anforderung', () => {
    expect(rebuildDecision({ requested_at: null, dispatched_at: null }, at('2026-10-01T12:00:00Z'))).toBe('idle');
    expect(rebuildDecision({ requested_at: null, dispatched_at: '2026-10-01T11:00:00Z' }, at('2026-10-01T12:00:00Z'))).toBe('idle');
  });

  it('wartet 60 s nach der letzten Anforderung', () => {
    const state = { requested_at: '2026-10-01T12:00:00Z', dispatched_at: null };
    expect(rebuildDecision(state, at('2026-10-01T12:00:00Z'))).toBe('waiting');
    expect(rebuildDecision(state, at('2026-10-01T12:00:59.999Z'))).toBe('waiting');
    expect(rebuildDecision(state, at('2026-10-01T12:01:00Z'))).toBe('dispatch');
    expect(REBUILD_DEBOUNCE_MS).toBe(60_000);
  });

  it('löst nicht erneut aus, wenn seit der Anforderung schon gebaut wurde', () => {
    const state = { requested_at: '2026-10-01T12:00:00Z', dispatched_at: '2026-10-01T12:01:05Z' };
    expect(rebuildDecision(state, at('2026-10-01T12:10:00Z'))).toBe('idle');
    // gleiche Zeit zählt als erledigt
    expect(rebuildDecision({ requested_at: state.requested_at, dispatched_at: state.requested_at }, at('2026-10-01T12:10:00Z'))).toBe('idle');
  });

  it('bündelt eine neue Anforderung nach dem letzten Build', () => {
    const state = { requested_at: '2026-10-01T12:05:00Z', dispatched_at: '2026-10-01T12:01:05Z' };
    expect(rebuildDecision(state, at('2026-10-01T12:05:30Z'))).toBe('waiting');
    expect(rebuildDecision(state, at('2026-10-01T12:06:00Z'))).toBe('dispatch');
  });

  it('respektiert eine eigene Wartezeit', () => {
    const state = { requested_at: '2026-10-01T12:00:00Z', dispatched_at: null };
    expect(rebuildDecision(state, at('2026-10-01T12:00:10Z'), 5_000)).toBe('dispatch');
    expect(rebuildDecision(state, at('2026-10-01T12:00:10Z'), 30_000)).toBe('waiting');
  });
});

describe('Rebuild-Warteschlange', () => {
  const original = { repo: env.githubRepository, token: env.githubDispatchToken };

  afterEach(() => {
    env.githubRepository = original.repo;
    env.githubDispatchToken = original.token;
    setMockEnv({ DEMO_MODE: true, SUPABASE_URL: undefined });
  });

  it('fordert im Demo-Modus keinen Build an (der Dev-Server rendert live)', async () => {
    const store = new MemoryStore(baseDataset());
    await requestRebuild(store, 'Test');
    const { rebuild } = await readPrivateSettings(store);
    expect(rebuild.requested_at).toBeNull();
  });

  it('merkt sich die Anforderung außerhalb des Demo-Modus', async () => {
    setMockEnv({ DEMO_MODE: false, SUPABASE_URL: 'https://example.supabase.co' });
    const store = new MemoryStore(baseDataset());
    await requestRebuild(store, 'Ergebnis R5');
    const { rebuild } = await readPrivateSettings(store);
    expect(rebuild.requested_at).not.toBeNull();
    expect(rebuild.reason).toBe('Ergebnis R5');
  });

  it('meldet fehlende GitHub-Konfiguration ohne Request', async () => {
    env.githubRepository = undefined;
    env.githubDispatchToken = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await dispatchBuild('x')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('löst nach der Wartezeit genau einen repository_dispatch aus', async () => {
    env.githubRepository = 'liga/website';
    env.githubDispatchToken = 'test-token';
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const store = new MemoryStore(baseDataset());
    await store.upsert('settings', [
      { key: 'rebuild', value: { requested_at: '2026-10-01T12:00:00Z', dispatched_at: null, reason: 'News' }, is_public: false },
    ]);

    expect(await processRebuildQueue(store, at('2026-10-01T12:00:30Z'))).toBe('waiting');
    expect(fetchMock).not.toHaveBeenCalled();

    expect(await processRebuildQueue(store, at('2026-10-01T12:01:30Z'))).toBe('dispatch');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [urlArg, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(urlArg).toBe('https://api.github.com/repos/liga/website/dispatches');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-token');
    expect(JSON.parse(String(init.body))).toEqual({ event_type: 'publish', client_payload: { reason: 'News' } });

    const { rebuild } = await readPrivateSettings(store);
    expect(rebuild.dispatched_at).toBe('2026-10-01T12:01:30.000Z');
    // zweiter Cron-Lauf: nichts mehr zu tun
    expect(await processRebuildQueue(store, at('2026-10-01T12:02:30Z'))).toBe('idle');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('versucht es beim nächsten Lauf erneut, wenn GitHub ablehnt', async () => {
    env.githubRepository = 'liga/website';
    env.githubDispatchToken = 'test-token';
    const fetchMock = vi.fn(async () => new Response('nope', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const store = new MemoryStore(baseDataset());
    await store.upsert('settings', [
      { key: 'rebuild', value: { requested_at: '2026-10-01T12:00:00Z', dispatched_at: null, reason: null }, is_public: false },
    ]);
    expect(await processRebuildQueue(store, at('2026-10-01T12:05:00Z'))).toBe('dispatch');
    const { rebuild } = await readPrivateSettings(store);
    expect(rebuild.dispatched_at).toBeNull();
    expect(await processRebuildQueue(store, at('2026-10-01T12:06:00Z'))).toBe('dispatch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
