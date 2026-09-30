/**
 * Admin-Actions: Auszeichnungen (Plan Phase 2) – Driver of the Day je Runde, Saison-Awards.
 *
 * Jede Action prüft die Rolle mit staffFrom(...), schreibt über getServiceStore(),
 * protokolliert mit audit(...) und fordert bei öffentlich sichtbaren Änderungen einen Rebuild an.
 * Formular-Actions (funktionieren ohne JavaScript); die Seite /admin/auszeichnungen leitet
 * danach mit `?ok=<code>` um (Post/Redirect/Get). Planung in src/lib/people/awards-admin.ts.
 */
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { url } from '~/i18n';
import type { AdminActionData } from '~/lib/admin/league/page';
import { insertOne, selectOne, type Store } from '~/lib/db/store';
import type { AwardRow, Id, RoundRow, SeasonRow } from '~/lib/db/types';
import { awardsAt, canHaveDotd, dotdEmbed, planAward, rookieCandidates, type AwardPlan } from '~/lib/people/awards-admin';
import { audit } from '~/lib/server/audit';
import type { Staff } from '~/lib/server/auth';
import { getServiceStore } from '~/lib/server/db';
import { EMBED_TEAL, notify, siteUrl } from '~/lib/server/discord';
import { requestRebuild } from '~/lib/server/rebuild';
import { roundLabel, seasonLabel } from '~/lib/view';
import { staffFrom, toActionError } from '../_helpers';

const id = z.number({ error: 'Bitte eine Auswahl treffen.' }).int().positive();
const driverId = z.number({ error: 'Bitte einen Fahrer wählen.' }).int('Bitte einen Fahrer wählen.').positive('Bitte einen Fahrer wählen.');

/** Rücksprung auf die Seite, zur Saison und ggf. zur Runde. */
function awardsPage(seasonId: Id, anchor?: string): string {
  return `/admin/auszeichnungen?saison=${seasonId}${anchor ? `#${anchor}` : ''}`;
}

const done = (ok: string, redirect: string): AdminActionData => ({ ok, redirect });
const bad = (message: string) => new ActionError({ code: 'BAD_REQUEST', message });
const notFound = (what: string) => new ActionError({ code: 'NOT_FOUND', message: `${what} nicht gefunden.` });

async function loadRound(store: Store, roundId: Id): Promise<{ round: RoundRow; season: SeasonRow }> {
  const round = await selectOne(store, 'rounds', { id: roundId });
  if (!round) throw notFound('Runde');
  const season = await selectOne(store, 'seasons', { id: round.season_id });
  if (!season) throw notFound('Saison');
  return { round, season };
}

/** Plan ausführen: Dubletten entfernen, dann anlegen bzw. ändern – jeweils mit Audit-Eintrag. */
async function applyPlan(store: Store, staff: Staff, existing: readonly AwardRow[], plan: AwardPlan): Promise<AwardRow | null> {
  for (const removeId of plan.removeIds) {
    const before = existing.find((a) => a.id === removeId) ?? null;
    await store.remove('awards', { id: removeId });
    await audit(store, staff, 'delete', 'awards', removeId, before, null);
  }
  if (plan.kind === 'insert') {
    const created = await insertOne(store, 'awards', plan.row);
    await audit(store, staff, 'create', 'awards', created.id, null, created);
    return created;
  }
  if (plan.kind === 'update') {
    const [saved] = await store.update('awards', { id: plan.id }, plan.patch);
    await audit(store, staff, 'update', 'awards', plan.id, plan.before, saved ?? null);
    return saved ?? null;
  }
  return existing.find((a) => a.id === plan.id) ?? null;
}

/** Discord-Post in #results; liefert false, wenn kein Webhook eingerichtet ist oder Discord streikt. */
async function postDotd(store: Store, round: RoundRow, season: SeasonRow, driverIdValue: Id, teamId: Id | null): Promise<boolean> {
  const [track, driver, team] = await Promise.all([
    selectOne(store, 'tracks', { id: round.track_id }),
    selectOne(store, 'drivers', { id: driverIdValue }),
    teamId != null ? selectOne(store, 'teams', { id: teamId }) : Promise.resolve(null),
  ]);
  const embed = dotdEmbed({
    roundLabel: roundLabel(round, track ?? undefined, 'de'),
    seasonName: seasonLabel(season, 'de'),
    driverName: driver?.gamertag ?? '?',
    teamName: team?.name ?? null,
    url: siteUrl(url('de', 'race', { season: season.slug, round: round.number })),
  });
  return notify(store, 'results', { ...embed, color: EMBED_TEAL });
}

function rethrow(err: unknown): never {
  if (err instanceof ActionError) throw err;
  return toActionError(err);
}

export const awardsActions = {
  /** Driver of the Day einer Runde setzen oder ändern (Fahrer aus dem Rennergebnis), optional in Discord posten. */
  awardDotdSet: defineAction({
    accept: 'form',
    input: z.object({ round_id: id, driver_id: driverId, discord: z.boolean().optional() }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        const { round, season } = await loadRound(store, input.round_id);
        if (!canHaveDotd(round)) throw bad('Fahrer des Tages gibt es erst, wenn das Ergebnis der Runde veröffentlicht ist.');
        const race = await selectOne(store, 'sessions', { round_id: round.id, type: 'race' });
        const result = race ? await selectOne(store, 'results', { session_id: race.id, driver_id: input.driver_id }) : null;
        if (!result) throw bad('Der Fahrer steht nicht im Rennergebnis dieser Runde.');

        const existing = await store.select('awards', { eq: { round_id: round.id, type: 'driver_of_the_day' } });
        const plan = planAward(existing, {
          season_id: round.season_id,
          round_id: round.id,
          type: 'driver_of_the_day',
          driver_id: result.driver_id,
          team_id: result.team_id,
        });
        await applyPlan(store, staff, existing, plan);
        if (plan.kind !== 'noop' || plan.removeIds.length > 0) {
          await requestRebuild(store, `Fahrer des Tages R${round.number} (${season.name})`);
        }
        const target = awardsPage(season.id, `runde-${round.number}`);
        if (input.discord) {
          const posted = await postDotd(store, round, season, result.driver_id, result.team_id);
          return done(posted ? 'dotd_posted' : 'dotd_post_failed', target);
        }
        return done(plan.kind === 'noop' ? 'dotd_unchanged' : 'dotd_saved', target);
      } catch (err) {
        rethrow(err);
      }
    },
  }),

  /** Driver of the Day einer Runde entfernen. */
  awardDotdRemove: defineAction({
    accept: 'form',
    input: z.object({ round_id: id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        const { round, season } = await loadRound(store, input.round_id);
        const existing = awardsAt(await store.select('awards', { eq: { round_id: round.id } }), 'driver_of_the_day', round.season_id, round.id);
        for (const a of existing) {
          await store.remove('awards', { id: a.id });
          await audit(store, staff, 'delete', 'awards', a.id, a, null);
        }
        if (existing.length > 0) await requestRebuild(store, `Fahrer des Tages R${round.number} entfernt (${season.name})`);
        return done('dotd_removed', awardsPage(season.id, `runde-${round.number}`));
      } catch (err) {
        rethrow(err);
      }
    },
  }),

  /** Rookie of the Year einer Saison setzen oder ändern (Fahrer mit Rennergebnis in der Saison). */
  awardRookieSet: defineAction({
    accept: 'form',
    input: z.object({ season_id: id, driver_id: driverId }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        const season = await selectOne(store, 'seasons', { id: input.season_id });
        if (!season) throw notFound('Saison');
        const rounds = (await store.select('rounds', { eq: { season_id: season.id } })).filter(canHaveDotd);
        const races = rounds.length
          ? await store.select('sessions', { in: { round_id: rounds.map((r) => r.id) }, eq: { type: 'race' } })
          : [];
        const results = races.length
          ? await store.select('results', { in: { session_id: races.map((s) => s.id) }, eq: { driver_id: input.driver_id } })
          : [];
        const roundOf = new Map(races.map((s) => [s.id, rounds.find((r) => r.id === s.round_id)!]));
        const [candidate] = rookieCandidates(
          season.id,
          [season],
          results.map((r) => ({ driverId: r.driver_id, teamId: r.team_id, seasonId: season.id, roundStart: roundOf.get(r.session_id)?.start_utc ?? '' })),
          () => '',
        );
        if (!candidate) throw bad('Der Fahrer ist in dieser Saison noch kein gewertetes Rennen gefahren.');

        const existing = await store.select('awards', { eq: { season_id: season.id, type: 'rookie_of_the_year' } });
        const plan = planAward(existing, {
          season_id: season.id,
          round_id: null,
          type: 'rookie_of_the_year',
          driver_id: candidate.driverId,
          team_id: candidate.teamId,
        });
        await applyPlan(store, staff, existing, plan);
        if (plan.kind !== 'noop' || plan.removeIds.length > 0) await requestRebuild(store, `Rookie of the Year (${season.name})`);
        return done(plan.kind === 'noop' ? 'rookie_unchanged' : 'rookie_saved', awardsPage(season.id, 'saison-awards'));
      } catch (err) {
        rethrow(err);
      }
    },
  }),

  /** Rookie of the Year einer Saison entfernen. */
  awardRookieRemove: defineAction({
    accept: 'form',
    input: z.object({ season_id: id }),
    handler: async (input, context) => {
      const staff = staffFrom(context, 'admin');
      const store = getServiceStore();
      try {
        const season = await selectOne(store, 'seasons', { id: input.season_id });
        if (!season) throw notFound('Saison');
        const existing = awardsAt(await store.select('awards', { eq: { season_id: season.id } }), 'rookie_of_the_year', season.id, null);
        for (const a of existing) {
          await store.remove('awards', { id: a.id });
          await audit(store, staff, 'delete', 'awards', a.id, a, null);
        }
        if (existing.length > 0) await requestRebuild(store, `Rookie of the Year entfernt (${season.name})`);
        return done('rookie_removed', awardsPage(season.id, 'saison-awards'));
      } catch (err) {
        rethrow(err);
      }
    },
  }),
};
