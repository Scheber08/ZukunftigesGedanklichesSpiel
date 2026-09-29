/**
 * Gebündelter Rebuild nach dem Veröffentlichen (Plan §7.2):
 * Admin-Aktionen setzen nur `rebuild.requested_at`. Der Cron-Job (jede Minute) löst
 * frühestens 60 s nach der letzten Anforderung einen GitHub-Actions-Deploy aus –
 * mehrere Änderungen kurz hintereinander ergeben so einen einzigen Build.
 */
import type { Store } from '../db/store';
import { env, isDemoMode } from './env';
import { patchSetting, readPrivateSettings } from './settings';

export const REBUILD_DEBOUNCE_MS = 60_000;

export async function requestRebuild(store: Store, reason: string): Promise<void> {
  // Im Demo-Modus rendert der Dev-Server ohnehin live aus dem Speicher.
  if (isDemoMode()) return;
  await patchSetting(store, 'rebuild', { requested_at: new Date().toISOString(), reason });
}

export type RebuildDecision = 'idle' | 'waiting' | 'dispatch';

/** Reine Entscheidungslogik (getestet): Soll jetzt ein Build ausgelöst werden? */
export function rebuildDecision(
  state: { requested_at: string | null; dispatched_at: string | null },
  now: Date,
  debounceMs = REBUILD_DEBOUNCE_MS,
): RebuildDecision {
  if (!state.requested_at) return 'idle';
  const requested = new Date(state.requested_at).getTime();
  const dispatched = state.dispatched_at ? new Date(state.dispatched_at).getTime() : 0;
  if (dispatched >= requested) return 'idle';
  if (now.getTime() - requested < debounceMs) return 'waiting';
  return 'dispatch';
}

/** GitHub `repository_dispatch` → Workflow „deploy.yml“ baut und deployt die Seite. */
export async function dispatchBuild(reason: string): Promise<boolean> {
  if (!env.githubRepository || !env.githubDispatchToken) {
    console.warn('Rebuild angefordert, aber GITHUB_REPOSITORY/GITHUB_DISPATCH_TOKEN fehlen');
    return false;
  }
  const res = await fetch(`https://api.github.com/repos/${env.githubRepository}/dispatches`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.githubDispatchToken}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'liga-web-cron',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'publish', client_payload: { reason } }),
  });
  if (!res.ok) console.error(`GitHub-Dispatch fehlgeschlagen: ${res.status}`);
  return res.ok;
}

/** Vom Cron-Job aufgerufen. */
export async function processRebuildQueue(store: Store, now = new Date()): Promise<RebuildDecision> {
  const { rebuild } = await readPrivateSettings(store);
  const decision = rebuildDecision(rebuild, now);
  if (decision === 'dispatch') {
    const ok = await dispatchBuild(rebuild.reason ?? 'publish');
    if (ok) await patchSetting(store, 'rebuild', { dispatched_at: now.toISOString() });
  }
  return decision;
}
