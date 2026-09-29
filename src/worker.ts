/**
 * Worker-Einstieg: Astro für alle Anfragen, dazu Cron-Trigger (Plan §7.3):
 * jede Minute Twitch-Status, geplante News und gebündelter Rebuild,
 * täglich Keep-alive und Löschfristen.
 */
import { handle } from '@astrojs/cloudflare/handler';

interface WorkerEnv {
  [key: string]: unknown;
}
interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

/**
 * Alte URLs nach Umbenennungen (Plan §2.2). Statische Seiten existieren nur für aktuelle
 * Slugs; Anfragen auf alte Slugs kommen als 404 aus Astro zurück (die vorgerenderte
 * 404-Seite läuft ohne Middleware) – hier wird dann per 301 weitergeleitet.
 */
async function redirectRenamed(request: Request, response: Response): Promise<Response> {
  if (response.status !== 404 || (request.method !== 'GET' && request.method !== 'HEAD')) return response;
  try {
    const url = new URL(request.url);
    const [{ findRedirect }, { getPublicStore }] = await Promise.all([import('./lib/server/redirects'), import('./lib/server/db')]);
    const target = await findRedirect(getPublicStore(), url.pathname);
    if (!target) return response;
    return new Response(null, { status: 301, headers: { location: target + url.search, 'cache-control': 'public, max-age=3600' } });
  } catch (err) {
    console.error('Weiterleitungs-Prüfung fehlgeschlagen', err);
    return response;
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerContext) {
    const response = (await handle(request as never, env as never, ctx as never)) as unknown as Response;
    return redirectRenamed(request, response);
  },
  async scheduled(event: ScheduledEvent, _env: WorkerEnv, ctx: WorkerContext) {
    const { runScheduled } = await import('./lib/server/cron');
    ctx.waitUntil(runScheduled(event.cron, new Date(event.scheduledTime)));
  },
};
