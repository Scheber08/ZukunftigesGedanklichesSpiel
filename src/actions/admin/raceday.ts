/**
 * Admin-Actions Renntag (Plan §5.1–5.3, §11.1): Grid-Builder, Ergebnis-Eingabe, Steward-Werkzeug.
 *
 * - JSON-Actions für die Svelte-Islands (Grid-Builder, Ergebnis-Eingabe): Rolle „admin“.
 * - Formular-Actions für das Steward-Werkzeug (funktioniert ohne JavaScript): Rolle „steward“
 *   (Admins sehen das Werkzeug, entscheiden aber nicht).
 *
 * Die Fachlogik steckt in src/lib/server/results.ts und src/lib/server/stewarding.ts.
 */
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { RacedayError } from '~/lib/admin/raceday/errors';
import { ENTRY_ROLES, INCIDENT_STATUSES, RESULT_STATUSES, SESSION_TYPES, VERDICTS } from '~/lib/db/types';
import { getServiceStore } from '~/lib/server/db';
import {
  correctRound,
  finalizeRound,
  previewStandings,
  publishLineup,
  publishProvisional,
  saveLineup,
  saveResults,
} from '~/lib/server/results';
import {
  discardDecision,
  openInvestigation,
  publishDecision,
  revokeDecision,
  saveDecision,
  setIncidentStatus,
  voteDecision,
} from '~/lib/server/stewarding';
import { staffFrom, toActionError } from '../_helpers';

/** Fachliche Fehler → ActionError (Details zeilenweise in der Meldung). */
async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RacedayError) throw new ActionError({ code: err.code, message: err.uiMessage });
    return toActionError(err);
  }
}

const id = z.number().int().positive();
const optionalText = (max: number) => z.string().max(max).nullish();

// ---------------------------------------------------------------------------- Schemas

const lineupInput = z.object({
  roundId: id,
  entries: z
    .array(z.object({ teamId: id, seatNo: z.union([z.literal(1), z.literal(2)]), driverId: id }))
    .max(30),
  absences: z
    .array(z.object({ driverId: id, reportedInTime: z.boolean(), note: optionalText(200) }))
    .max(40),
});

const resultRow = z.object({
  driverId: id,
  teamId: id,
  role: z.enum(ENTRY_ROLES),
  roundEntryId: id.nullable(),
  raceNumber: z.number().int().min(1).max(99).nullable(),
  status: z.enum(RESULT_STATUSES),
  gridPosition: z.number().int().min(1).max(40).nullable(),
  laps: z.number().int().min(0).max(500).nullable(),
  bestLapMs: z.number().int().positive().max(3_600_000).nullable(),
  totalTimeMs: z.number().int().positive().max(86_400_000).nullable(),
  gapMs: z.number().int().min(0).max(86_400_000).nullable(),
  gapLaps: z.number().int().min(0).max(500).nullable(),
  pitStops: z.number().int().min(0).max(50).nullable(),
  ingamePenaltyS: z.number().int().min(0).max(600),
});

const sessionsInput = z.array(z.object({ sessionId: id, rows: z.array(resultRow).max(30) })).min(1).max(3);

// ---------------------------------------------------------------------------- Actions

export const racedayActions = {
  // ------------------------------------------------------------------ Grid-Builder

  /** Aufstellung als Entwurf speichern (Abmeldungen + Cockpits). */
  lineupSave: defineAction({
    input: lineupInput,
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      return run(async () => {
        const res = await saveLineup(getServiceStore(), input.roundId, input, staff);
        return {
          saved: res.entries.length,
          issues: res.issues.map((issue, i) => ({ ...issue, message: res.messages[i] ?? issue.code })),
          status: res.ctx.basics.round.status,
        };
      });
    },
  }),

  /** Aufstellung veröffentlichen (Rennseite, optional Discord „lineup“). Fehler blockieren. */
  lineupPublish: defineAction({
    input: lineupInput.extend({ discord: z.boolean().default(false) }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      return run(async () => {
        const res = await publishLineup(getServiceStore(), input.roundId, input, staff, { discord: input.discord });
        return { status: res.round.status, warnings: res.messages, discord: res.discord };
      });
    },
  }),

  // ------------------------------------------------------------------ Ergebnisse

  /** Ergebnis speichern (vor „final“), neu berechnen, Vorschau der neuen Wertung. */
  resultsSave: defineAction({
    input: z.object({ roundId: id, sessions: sessionsInput }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      return run(async () => {
        const store = getServiceStore();
        const res = await saveResults(store, input.roundId, input.sessions, staff);
        const preview = await previewStandings(store, input.roundId);
        return { warnings: res.warnings.map((w) => w.message), preview, status: res.round.status };
      });
    },
  }),

  /** Nur die Wertungsvorschau (ohne zu speichern). */
  resultsPreview: defineAction({
    input: z.object({ roundId: id }),
    handler: async (input, context) => {
      staffFrom(context, 'admin');
      return run(async () => ({ preview: await previewStandings(getServiceStore(), input.roundId) }));
    },
  }),

  /** Vorläufig veröffentlichen: Protestfrist startet, Discord „results“. */
  resultsPublishProvisional: defineAction({
    input: z.object({ roundId: id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      return run(async () => {
        const res = await publishProvisional(getServiceStore(), input.roundId, staff);
        return {
          status: res.round.status,
          protestDeadline: res.round.protest_deadline,
          warnings: res.warnings.map((w) => w.message),
          discord: res.discord,
          alreadyPublic: res.alreadyPublic,
        };
      });
    },
  }),

  /** Final setzen (Snapshot, Discord). Offene Vorfälle/Entwürfe nur mit force. */
  resultsFinalize: defineAction({
    input: z.object({ roundId: id, force: z.boolean().default(false) }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      return run(async () => {
        const res = await finalizeRound(getServiceStore(), input.roundId, staff, { force: input.force });
        return { status: res.round.status, snapshots: res.snapshots, warnings: res.warnings.map((w) => w.message), discord: res.discord };
      });
    },
  }),

  /** Korrektur nach „final“: optional geänderte Eingaben, Pflicht-Grund (öffentlich). */
  resultsCorrect: defineAction({
    input: z.object({
      roundId: id,
      sessions: sessionsInput.optional(),
      reasonDe: z.string().trim().min(5, 'Bitte gib einen Grund an (mindestens 5 Zeichen).').max(500),
      reasonEn: optionalText(500),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      return run(async () => {
        const store = getServiceStore();
        if (input.sessions) await saveResults(store, input.roundId, input.sessions, staff, { allowFinal: true });
        const res = await correctRound(store, input.roundId, staff, input.reasonDe, input.reasonEn ?? null);
        const preview = await previewStandings(store, input.roundId);
        return { status: res.round.status, snapshots: res.snapshots, warnings: res.warnings.map((w) => w.message), discord: res.discord, preview };
      });
    },
  }),

  // ------------------------------------------------------------------ Stewards (Formulare)

  /** Status eines Vorfalls setzen (neu, in Prüfung, entschieden, abgelehnt, verspätet). */
  incidentUpdate: defineAction({
    accept: 'form',
    input: z.object({ incidentId: id, status: z.enum(INCIDENT_STATUSES) }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'steward');
      return run(async () => {
        const incident = await setIncidentStatus(getServiceStore(), staff, input.incidentId, input.status);
        return { incidentId: incident.id, status: incident.status };
      });
    },
  }),

  /** Eigene Untersuchung ohne Meldung eröffnen. */
  investigationOpen: defineAction({
    accept: 'form',
    input: z.object({
      roundId: id,
      sessionType: z.enum(SESSION_TYPES).nullish(),
      involvedDriverIds: z.array(id).min(1, 'Bitte mindestens einen Fahrer auswählen.').max(22),
      lap: z.number().int().min(0).max(500).nullish(),
      corner: optionalText(80),
      description: z.string().trim().min(10, 'Bitte beschreibe den Vorfall (mindestens 10 Zeichen).').max(4000),
      clipUrl: z.string().trim().max(500).nullish(),
      clipTimestamp: optionalText(20),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'steward');
      return run(async () => {
        const incident = await openInvestigation(getServiceStore(), staff, {
          roundId: input.roundId,
          sessionType: input.sessionType ?? null,
          involvedDriverIds: input.involvedDriverIds,
          lap: input.lap ?? null,
          corner: input.corner ?? null,
          description: input.description,
          clipUrl: input.clipUrl ?? null,
          clipTimestamp: input.clipTimestamp ?? null,
        });
        return { incidentId: incident.id };
      });
    },
  }),

  /** Entscheidung anlegen oder Entwurf bearbeiten (zählt als Stimme). */
  decisionSave: defineAction({
    accept: 'form',
    input: z.object({
      decisionId: id.nullish(),
      incidentId: id.nullish(),
      roundId: id,
      sessionId: id.nullish(),
      driverId: id,
      verdict: z.enum(VERDICTS),
      timeSeconds: z.number().int().nullish(),
      positions: z.number().int().nullish(),
      penaltyPoints: z.number().int().nullish(),
      reasoningDe: z.string().trim().min(10, 'Bitte begründe die Entscheidung (mindestens 10 Zeichen).').max(8000),
      reasoningEn: z.string().max(8000).nullish(),
      ruleRef: optionalText(80),
      clipUrl: z.string().trim().max(500).nullish(),
    }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'steward');
      return run(async () => {
        const d = await saveDecision(getServiceStore(), staff, input.decisionId ?? null, {
          incidentId: input.incidentId ?? null,
          roundId: input.roundId,
          sessionId: input.sessionId ?? null,
          driverId: input.driverId,
          verdict: input.verdict,
          timeSeconds: input.timeSeconds ?? null,
          positions: input.positions ?? null,
          penaltyPoints: input.penaltyPoints ?? null,
          reasoningDe: input.reasoningDe,
          reasoningEn: input.reasoningEn ?? null,
          ruleRef: input.ruleRef ?? null,
          clipUrl: input.clipUrl ?? null,
        });
        return { decisionId: d.id, ref: d.public_ref, created: input.decisionId == null };
      });
    },
  }),

  /** Zustimmung eines Stewards (Vier-Augen-Prinzip). */
  decisionVote: defineAction({
    accept: 'form',
    input: z.object({ decisionId: id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'steward');
      return run(async () => {
        const d = await voteDecision(getServiceStore(), staff, input.decisionId);
        return { decisionId: d.id, votes: d.decided_by.length };
      });
    },
  }),

  /** Veröffentlichen: Register, Discord „decisions“, Strafen ins Ergebnis. */
  decisionPublish: defineAction({
    accept: 'form',
    input: z.object({ decisionId: id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'steward');
      return run(async () => {
        const res = await publishDecision(getServiceStore(), staff, input.decisionId);
        return { decisionId: res.decision.id, ref: res.decision.public_ref, published: res.published, effect: res.effect, discord: res.discord, message: res.message };
      });
    },
  }),

  /** Veröffentlichte Entscheidung zurücknehmen (mit Neuberechnung). */
  decisionRevoke: defineAction({
    accept: 'form',
    input: z.object({ decisionId: id, note: optionalText(500) }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'steward');
      return run(async () => {
        const res = await revokeDecision(getServiceStore(), staff, input.decisionId, input.note ?? null);
        return { decisionId: res.decision.id, ref: res.decision.public_ref, effect: res.effect, discord: res.discord, message: res.message };
      });
    },
  }),

  /** Entwurf verwerfen. */
  decisionDiscard: defineAction({
    accept: 'form',
    input: z.object({ decisionId: id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'steward');
      return run(async () => {
        await discardDecision(getServiceStore(), staff, input.decisionId);
        return { decisionId: input.decisionId, message: 'Entwurf verworfen.' };
      });
    },
  }),
};
