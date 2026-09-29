/**
 * Cron-Jobs des Workers (wrangler.jsonc → triggers.crons):
 * - "* * * * *"  jede Minute: Twitch-Status, geplante News, gebündelter Rebuild,
 *                alle 10 Minuten Discord-Mitgliederzahlen
 * - "17 3 * * *" täglich: Löschfristen (Plan §6.7) und Supabase-Keep-alive
 */
import { getServiceStore } from './db';
import { fetchInviteCounts, inviteCodeFromUrl, notify, siteUrl, EMBED_TEAL } from './discord';
import { processRebuildQueue, requestRebuild } from './rebuild';
import { patchSetting, readPublicSettings } from './settings';
import { refreshLiveStatus } from './twitch';

async function safely(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`Cron-Aufgabe „${name}“ fehlgeschlagen`, err);
  }
}

/** Geplante News veröffentlichen, sobald publish_at erreicht ist. */
export async function publishScheduledNews(now = new Date()): Promise<number> {
  const store = getServiceStore();
  const due = (await store.select('news', { eq: { status: 'scheduled' } })).filter(
    (n) => n.publish_at != null && new Date(n.publish_at) <= now,
  );
  for (const n of due) {
    await store.update('news', { id: n.id }, { status: 'published' });
    await notify(store, 'news', {
      title: n.title_de,
      description: n.excerpt_de,
      url: siteUrl(`/news/${n.slug_de}`),
      color: EMBED_TEAL,
      image: n.cover_image ? { url: n.cover_image } : undefined,
    });
  }
  if (due.length > 0) await requestRebuild(store, `${due.length} geplante News veröffentlicht`);
  return due.length;
}

/**
 * Protestfrist abgelaufen → statische Seiten neu bauen, damit Banner und „Vorfall melden“
 * den neuen Stand zeigen (Plan §11.1). Prüft Fristen, die in den letzten zwei Minuten endeten.
 */
export async function rebuildAfterProtestDeadline(now = new Date()): Promise<boolean> {
  const store = getServiceStore();
  const since = now.getTime() - 2 * 60_000;
  const ended = (await store.select('rounds', { eq: { status: 'provisional' } })).filter((r) => {
    if (!r.protest_deadline) return false;
    const t = new Date(r.protest_deadline).getTime();
    return t <= now.getTime() && t > since;
  });
  if (ended.length === 0) return false;
  await requestRebuild(store, `Protestfrist abgelaufen (${ended.map((r) => 'R' + r.number).join(', ')})`);
  return true;
}

/** Discord-Mitglieder/online für die Discord-Karte cachen. */
export async function refreshDiscordCounts(): Promise<void> {
  const store = getServiceStore();
  const settings = await readPublicSettings(store);
  const code = settings.discord_invite.code ?? inviteCodeFromUrl(settings.discord_invite.url);
  if (!code) return;
  const counts = await fetchInviteCounts(code);
  await patchSetting(store, 'discord_counts', { ...counts, checked_at: new Date().toISOString() });
}

export async function runScheduled(cron: string, now: Date): Promise<void> {
  const store = getServiceStore();
  if (cron === '17 3 * * *') {
    await safely('Löschfristen', () => store.rpc('run_retention'));
    await safely('Keep-alive', () => store.select('seasons', { limit: 1 }));
    return;
  }
  await safely('Twitch-Status', () => refreshLiveStatus(store));
  await safely('Geplante News', () => publishScheduledNews(now));
  await safely('Protestfristen', () => rebuildAfterProtestDeadline(now));
  if (now.getUTCMinutes() % 10 === 0) await safely('Discord-Zahlen', () => refreshDiscordCounts());
  await safely('Rebuild', () => processRebuildQueue(store, now));
}
