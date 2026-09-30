/**
 * Admin-Actions: Strafpunkte-System (Plan Phase 2) – Schalter und Konfiguration je Saison
 * (Verwarnschwelle, Sperrschwelle, Verfall nach N Runden oder nie).
 *
 * Jede Action prüft die Rolle mit staffFrom(...), schreibt über getServiceStore(),
 * protokolliert mit audit(...) und fordert bei öffentlich sichtbaren Änderungen einen Rebuild an.
 * Die Prüf- und Rechenlogik steckt in src/lib/domain/penalty-points.ts (getestet).
 */
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import type { AdminActionData } from '~/lib/admin/league/page';
import { FROZEN_MESSAGE, isSeasonFrozen } from '~/lib/admin/league/season';
import { selectOne } from '~/lib/db/store';
import { validatePenaltyPointsConfig } from '~/lib/domain/penalty-points';
import { audit } from '~/lib/server/audit';
import { getServiceStore } from '~/lib/server/db';
import { requestRebuild } from '~/lib/server/rebuild';
import { staffFrom, toActionError } from '../_helpers';

/** Feldbezogener Fehler – wird wie ein Zod-Eingabefehler serialisiert (Meldung am Feld). */
function fieldError(fields: Record<string, string>): ActionError {
  const err = new ActionError({ code: 'BAD_REQUEST', message: Object.values(fields).join(' ') });
  Object.assign(err, {
    type: 'AstroActionInputError',
    issues: Object.entries(fields).map(([key, message]) => ({ code: 'custom', path: [key], message })),
  });
  return err;
}

const optCount = (label: string) =>
  z
    .number({ error: `${label}: bitte eine Zahl eintragen.` })
    .int(`${label}: bitte eine ganze Zahl eintragen.`)
    .optional();

const penaltyPointsSave = defineAction({
  accept: 'form',
  input: z.object({
    season_id: z.number({ error: 'Ungültige Saison.' }).int().positive(),
    penalty_points_enabled: z.boolean(),
    warning_threshold: optCount('Verwarnschwelle'),
    ban_threshold: optCount('Sperrschwelle'),
    expiry_mode: z.enum(['season', 'rounds'], { error: 'Bitte wähle, ob Strafpunkte verfallen.' }),
    expiry_rounds: optCount('Verfall'),
  }),
  handler: async (input, context): Promise<AdminActionData> => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const season = await selectOne(store, 'seasons', { id: input.season_id });
      if (!season) throw new ActionError({ code: 'NOT_FOUND', message: 'Saison nicht gefunden.' });
      if (isSeasonFrozen(season)) throw new ActionError({ code: 'CONFLICT', message: FROZEN_MESSAGE });

      const checked = validatePenaltyPointsConfig({
        warning_threshold: input.warning_threshold,
        ban_threshold: input.ban_threshold,
        expiry_rounds: input.expiry_mode === 'rounds' ? input.expiry_rounds : null,
      });
      // Alle Fehler auf einmal melden (auch „Verfall nach … Runden“ ohne Zahl)
      const errors: Record<string, string> = checked.ok ? {} : { ...checked.errors };
      if (input.expiry_mode === 'rounds' && input.expiry_rounds == null) {
        errors.expiry_rounds = 'Verfall: bitte die Anzahl Runden eintragen (oder „nie“ wählen).';
      }
      if (!checked.ok || Object.keys(errors).length > 0) throw fieldError(errors);

      const before = { penalty_points_enabled: season.penalty_points_enabled, penalty_points_config: season.penalty_points_config ?? {} };
      const after = { penalty_points_enabled: input.penalty_points_enabled, penalty_points_config: checked.config };
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await store.update('seasons', { id: season.id }, after);
        await audit(store, staff, 'update', 'seasons', season.id, before, after);
        await requestRebuild(store, `Strafpunkte ${season.name} geändert`);
      }
      return { ok: 'saved', redirect: `/admin/saisons/${season.id}#strafpunkte` };
    } catch (err) {
      return toActionError(err);
    }
  },
});

export const extrasActions = { penaltyPointsSave };
