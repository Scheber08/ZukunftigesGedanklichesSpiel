/**
 * Discord-Bot über den Interactions-Endpunkt (Plan Phase 3, serverlos): POST /api/discord/interactions.
 * In der Discord-Application unter „Interactions Endpoint URL“ eintragen (Anleitung: docs/DISCORD-BOT.md).
 *
 * - Ohne DISCORD_PUBLIC_KEY ist der Bot aus → 404.
 * - Jede Anfrage wird per Ed25519 geprüft (X-Signature-Ed25519 über Timestamp + Rohtext) → sonst 401.
 * - Daten: gezielte Abfragen über den öffentlichen Store (src/lib/server/live-data.ts), nur öffentliche
 *   Angaben; die Selbstrollen kommen aus den privaten Einstellungen (Service-Store, nur lesen).
 */
import type { APIRoute } from 'astro';
import { SITE } from '~/config/site';
import { handleInteraction, type Interaction } from '~/lib/discord-bot/handler';
import { setMemberRole } from '~/lib/discord-bot/roles';
import { verifyDiscordRequest } from '~/lib/discord-bot/verify';
import { getServiceStore } from '~/lib/server/db';
import { siteUrl } from '~/lib/server/discord';
import { env } from '~/lib/server/env';
import { liveSnapshot } from '~/lib/server/live-data';
import { readPrivateSettings } from '~/lib/server/settings';

export const prerender = false;

/** Discord-Interactions sind klein; alles darüber ist kein echter Aufruf. */
const MAX_BODY = 64 * 1024;

const plain = (text: string, status: number) =>
  new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export const POST: APIRoute = async ({ request }) => {
  const publicKey = env.discordPublicKey;
  if (!publicKey) return plain('Not found', 404);

  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_BODY) return plain('Payload too large', 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return plain('Payload too large', 413);

  const valid = await verifyDiscordRequest(publicKey, request.headers.get('x-signature-ed25519'), request.headers.get('x-signature-timestamp'), raw);
  if (!valid) return plain('invalid request signature', 401);

  let interaction: Interaction;
  try {
    interaction = JSON.parse(raw) as Interaction;
    if (typeof interaction?.type !== 'number') throw new Error('type fehlt');
  } catch {
    return plain('Bad request', 400);
  }

  const response = await handleInteraction(interaction, {
    siteUrl: (path) => siteUrl(path),
    siteName: SITE.name,
    guildId: env.discordGuildId ?? null,
    snapshot: (parts) => liveSnapshot(parts),
    selfRoles: async () => {
      const settings = await readPrivateSettings(getServiceStore());
      const map = settings.discord_role_map;
      return { roles: settings.discord_self_roles.roles ?? [], blocked: [...map.admin, ...map.steward, ...map.redakteur] };
    },
    setRole: async (guildId, userId, roleId, add, reason) => {
      if (!env.discordBotToken) return 'no_token';
      return setMemberRole({ token: env.discordBotToken, guildId, userId, roleId, add, reason });
    },
  });

  return new Response(JSON.stringify(response), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
};
