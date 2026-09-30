/**
 * Admin-Actions: Telemetrie-/CSV-Import (Plan Phase 2): Import-Token, Import-Stapel prüfen, verwerfen, übernehmen.
 *
 * Jede Action prüft die Rolle mit staffFrom(...), schreibt über getServiceStore(),
 * protokolliert mit audit(...) und fordert bei öffentlich sichtbaren Änderungen einen Rebuild an.
 *
 * Import-Stapel und Token sind nicht öffentlich – ein Rebuild entsteht erst, wenn die übernommenen
 * Werte in der Ergebnis-Eingabe gespeichert werden (actions.admin.resultsSave, markiert den Stapel
 * dann als „übernommen“). Die Logik steckt in src/lib/import/service.ts.
 */
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { RacedayError } from '~/lib/admin/raceday/errors';
import { CSV_MAX_CHARS } from '~/lib/import/csv';
import { createCsvBatch, createImportToken, discardImportBatch, revokeImportToken } from '~/lib/import/service';
import { getServiceStore } from '~/lib/server/db';
import { staffFrom, toActionError } from '../_helpers';

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RacedayError) throw new ActionError({ code: err.code, message: err.uiMessage });
    return toActionError(err);
  }
}

const id = z.number().int().positive();

export const importActions = {
  /** Neues Import-Token (ersetzt das alte). Klartext nur in dieser Antwort – gespeichert wird der SHA-256-Hash. */
  importTokenCreate: defineAction({
    input: z.object({ confirm: z.literal(true) }),
    handler: async (_input, context) => {
      const staff = staffFrom(context, 'admin');
      return run(async () => {
        const res = await createImportToken(getServiceStore(), staff);
        return { token: res.token, createdAt: res.createdAt, fingerprint: res.fingerprint };
      });
    },
  }),

  /** Import-Token widerrufen – das Companion-Programm bekommt danach 503. */
  importTokenRevoke: defineAction({
    input: z.object({ confirm: z.literal(true) }),
    handler: async (_input, context) => {
      const staff = staffFrom(context, 'admin');
      return run(async () => ({ revoked: await revokeImportToken(getServiceStore(), staff) }));
    },
  }),

  /** CSV als Import-Stapel speichern (Server ordnet mit der aktuellen Aufstellung neu zu). */
  importCsvSave: defineAction({
    input: z.object({
      roundId: id,
      sessionId: id,
      csv: z.string().min(1, 'Die CSV ist leer.').max(CSV_MAX_CHARS, `Die CSV ist zu groß (höchstens ${CSV_MAX_CHARS / 1024} KB).`),
      fileName: z.string().max(200).nullish(),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      return run(async () => {
        const { batch, mapping } = await createCsvBatch(getServiceStore(), staff, input);
        return {
          batchId: batch.id,
          matched: mapping.matched,
          total: mapping.total,
          warnings: mapping.warnings.length,
          reviewUrl: `/admin/runden/${input.roundId}/ergebnisse?session=${batch.session_id}&import=${batch.id}`,
        };
      });
    },
  }),

  /** Import-Stapel verwerfen (Formular, Post/Redirect/Get). */
  importDiscard: defineAction({
    accept: 'form',
    input: z.object({ roundId: id, batchId: id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      return run(async () => {
        await discardImportBatch(getServiceStore(), staff, input.roundId, input.batchId);
        return { ok: 'import_discarded', redirect: `/admin/runden/${input.roundId}/import#stapel` };
      });
    },
  }),
};
