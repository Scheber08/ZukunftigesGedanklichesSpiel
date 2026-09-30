/**
 * Admin-Actions: Social-Grafiken (Plan Phase 2): im Admin-Browser erzeugte PNGs an Discord schicken.
 *
 * Jede Action prüft die Rolle mit staffFrom(...), schreibt über getServiceStore(),
 * protokolliert mit audit(...) und fordert bei öffentlich sichtbaren Änderungen einen Rebuild an.
 * (Der Discord-Post ändert nichts an der Website – deshalb kein Rebuild.)
 */
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { checkPngUpload, formatBytes, safePngName } from '~/lib/graphics/files';
import { audit } from '~/lib/server/audit';
import { getServiceStore } from '~/lib/server/db';
import { EMBED_GREEN, notifyWithFile } from '~/lib/server/discord';
import { readPrivateSettings } from '~/lib/server/settings';
import { staffFrom, toActionError } from '../_helpers';

const sendInput = z.object({
  file: z.instanceof(File, { error: 'Bitte eine PNG-Grafik mitschicken.' }),
  title: z.string({ error: 'Titel fehlt.' }).trim().min(1, 'Titel fehlt.').max(200, 'Titel zu lang (höchstens 200 Zeichen).'),
  description: z.string().trim().max(1500, 'Beschreibung zu lang (höchstens 1500 Zeichen).').optional(),
});

export const graphicsActions = {
  /** Grafik (PNG) als Bild-Embed in den Channel „Grafiken“ posten. Rolle: Redaktion oder Admin. */
  graphicsSend: defineAction({
    accept: 'form',
    input: sendInput,
    handler: async (input, context) => {
      const staff = staffFrom(context, 'redakteur');
      try {
        const file = input.file;
        const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
        const check = checkPngUpload({ size: file.size, type: file.type }, head);
        if (!check.ok) throw new ActionError({ code: check.code, message: check.message });

        const store = getServiceStore();
        const settings = await readPrivateSettings(store);
        if (!settings.webhooks.graphics) {
          throw new ActionError({
            code: 'PRECONDITION_FAILED',
            message: 'Für den Channel „Grafiken“ ist kein Discord-Webhook hinterlegt (Einstellungen → Webhooks).',
          });
        }

        const name = safePngName(file.name);
        const sent = await notifyWithFile(
          store,
          'graphics',
          {
            title: input.title,
            description: input.description || undefined,
            color: EMBED_GREEN,
            image: { url: `attachment://${name}` },
          },
          { name, data: await file.arrayBuffer(), contentType: 'image/png' },
        );

        await audit(store, staff, 'publish', 'graphics', name, null, {
          channel: 'graphics',
          file: name,
          size: formatBytes(file.size),
          width: check.width,
          height: check.height,
          title: input.title,
          sent,
        });

        if (!sent) {
          throw new ActionError({
            code: 'BAD_GATEWAY',
            message: 'Discord hat die Grafik nicht angenommen. Bitte den Webhook in den Einstellungen prüfen oder später erneut versuchen.',
          });
        }
        return { sent: true, file: name };
      } catch (err) {
        toActionError(err);
      }
    },
  }),
};
