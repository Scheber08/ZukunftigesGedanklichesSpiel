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

export default {
  fetch(request: Request, env: WorkerEnv, ctx: WorkerContext) {
    return handle(request as never, env as never, ctx as never);
  },
  async scheduled(event: ScheduledEvent, _env: WorkerEnv, ctx: WorkerContext) {
    const { runScheduled } = await import('./lib/server/cron');
    ctx.waitUntil(runScheduled(event.cron, new Date(event.scheduledTime)));
  },
};
