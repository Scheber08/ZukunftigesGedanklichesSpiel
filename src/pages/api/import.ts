/**
 * Telemetrie-Import (Plan Phase 2, §6.6, §7.3): Das Companion-Programm lädt nach jeder Session
 * das Endergebnis hoch (POST JSON, Format liga-telemetry/1, Authorization: Bearer <Import-Token>).
 *
 * Ablauf: Rate-Limit → Token (SHA-256, konstante Zeit) → Größe/JSON/zod → Session zuordnen
 * (aktive Saison, Strecke, ±36 h bzw. explizit) → Import-Stapel (source „udp“, status „draft“).
 * Antwort 201 { batchId, reviewUrl } – bzw. 200 mit dem vorhandenen Stapel, wenn dasselbe Endergebnis
 * derselben Session schon hochgeladen wurde (Neuversuch). Nichts wird veröffentlicht – übernommen
 * wird erst im Admin.
 * Worker-Endpunkt: nur gezielte Store-Abfragen, kein loadLeague().
 */
import type { APIRoute } from 'astro';
import { RacedayError } from '~/lib/admin/raceday/errors';
import type { RoundRow, SessionRow } from '~/lib/db/types';
import { describeZodIssues, MAX_IMPORT_BYTES, telemetryPayloadSchema } from '~/lib/import/payload';
import { resolveImportSession } from '~/lib/import/resolve';
import { createTelemetryBatch } from '~/lib/import/service';
import { bearerToken, verifyImportToken } from '~/lib/import/token';
import { getServiceStore } from '~/lib/server/db';
import { readPrivateSettings } from '~/lib/server/settings';
import { clientIp, hashIp, rateLimit } from '~/lib/server/spam';

export const prerender = false;

/** Anfragen je IP in 10 Minuten (auch Fehlversuche – bremst Token-Raten aus) */
const RATE_MAX = 30;
const RATE_WINDOW_MIN = 10;

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** Body mit Größenlimit lesen; null = zu groß. */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(all);
}

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const store = getServiceStore();
    const ipHash = await hashIp(clientIp(request));
    if (!(await rateLimit(store, 'telemetry_import', ipHash, RATE_MAX, RATE_WINDOW_MIN))) {
      return json({ error: 'Zu viele Anfragen – bitte in ein paar Minuten erneut versuchen.' }, 429, { 'retry-after': String(RATE_WINDOW_MIN * 60) });
    }

    const settings = await readPrivateSettings(store);
    if (!settings.import_token.hash) {
      return json({ error: 'Auf der Website ist kein Import-Token eingerichtet (Admin → Runde → Import).' }, 503);
    }
    const token = bearerToken(request.headers.get('authorization'));
    if (!(await verifyImportToken(token, settings.import_token.hash))) {
      return json({ error: 'Import-Token fehlt oder ist ungültig.' }, 401, { 'www-authenticate': 'Bearer realm="liga-import"' });
    }

    if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) {
      return json({ error: 'Bitte JSON senden (Content-Type: application/json).' }, 415);
    }
    const text = await readLimited(request, MAX_IMPORT_BYTES);
    if (text == null) return json({ error: `Die Daten sind zu groß (höchstens ${MAX_IMPORT_BYTES / 1024} KB).` }, 413);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ error: 'Kein gültiges JSON.' }, 400);
    }
    const parsed = telemetryPayloadSchema.safeParse(data);
    if (!parsed.success) {
      return json({ error: 'Die Daten passen nicht zum Format liga-telemetry/1.', details: describeZodIssues(parsed.error) }, 400);
    }
    const payload = parsed.data;

    // Kandidaten gezielt laden: explizite Runde bzw. Runden der aktiven Saisons
    const [seasons, tracks] = await Promise.all([store.select('seasons'), store.select('tracks')]);
    const targetRound = payload.target?.roundId;
    const activeIds = seasons.filter((s) => s.status === 'active').map((s) => s.id);
    const rounds: RoundRow[] =
      targetRound != null
        ? await store.select('rounds', { eq: { id: targetRound } })
        : activeIds.length > 0
          ? await store.select('rounds', { in: { season_id: activeIds } })
          : [];
    const sessions: SessionRow[] = rounds.length > 0 ? await store.select('sessions', { in: { round_id: rounds.map((r) => r.id) } }) : [];
    const resolved = resolveImportSession({
      now: new Date(),
      gameSessionType: payload.session?.gameSessionType ?? null,
      gameTrackId: payload.session?.trackId ?? null,
      target: payload.target,
      seasons,
      rounds,
      tracks,
      sessions,
    });
    if (!resolved.ok) return json({ error: resolved.message, details: resolved.details }, 422);

    const { batch, mapping, duplicate } = await createTelemetryBatch(store, payload, resolved, settings.import_token.created_by);
    const reviewUrl = new URL(`/admin/runden/${resolved.roundId}/ergebnisse?session=${resolved.sessionId}&import=${batch.id}`, url).href;
    const listUrl = new URL(`/admin/runden/${resolved.roundId}/import#stapel-${batch.id}`, url).href;
    return json(
      {
        batchId: batch.id,
        reviewUrl,
        listUrl,
        roundId: resolved.roundId,
        sessionId: resolved.sessionId,
        sessionType: resolved.sessionType,
        matched: mapping.matched,
        total: mapping.total,
        warnings: mapping.warnings.length,
        duplicate,
        message: duplicate
          ? `Dieses Endergebnis ist schon als Stapel #${batch.id} vorhanden (${batch.status === 'applied' ? 'übernommen' : 'Entwurf'}) – nichts Neues angelegt.`
          : `Entwurf gespeichert: ${mapping.matched} von ${mapping.total} Zeilen zugeordnet${mapping.warnings.length > 0 ? `, ${mapping.warnings.length} Hinweise` : ''}.`,
      },
      // Wiederholter Upload (z. B. Neuversuch des Companions): 200 mit dem vorhandenen Stapel
      duplicate ? 200 : 201,
      { location: reviewUrl },
    );
  } catch (err) {
    if (err instanceof RacedayError) return json({ error: err.headline, details: err.details }, err.code === 'NOT_FOUND' ? 404 : 422);
    console.error('Telemetrie-Import fehlgeschlagen', err);
    return json({ error: 'Interner Fehler beim Import.' }, 500);
  }
};

export const ALL: APIRoute = () => json({ error: 'Nur POST ist erlaubt.' }, 405, { allow: 'POST' });
