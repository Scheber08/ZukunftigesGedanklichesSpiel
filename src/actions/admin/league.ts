/**
 * Admin-Actions: Liga-Kern (Plan §5) – Saisons, Punkteschemata, Kalender & Strecken,
 * Teams & Cockpits, Fahrer & Startnummern, Anmeldungen, Einstellungen, Kontaktanfragen.
 *
 * Jede Action prüft die Rolle (`staffFrom`), schreibt über den Service-Store, protokolliert
 * im Audit-Log und fordert bei öffentlich sichtbaren Änderungen einen gebündelten Rebuild an.
 * Die Fachlogik steckt in src/lib/admin/league (getestet). Rückgabe immer `AdminActionData`
 * (Erfolgscode + Ziel), die Seiten leiten danach um (Post/Redirect/Get).
 */
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { batchDates, localStartFrom, parseTrackList } from '~/lib/admin/league/calendar';
import { driverSlug, findGamertagDuplicate, nextReserveOrder, confirmsGamertag } from '~/lib/admin/league/drivers';
import {
  isDiscordWebhookUrl,
  isGaMeasurementId,
  isIsoDate,
  isNonIncreasing,
  isTime,
  maskSecret,
  normalizeHex,
  parseIntList,
  parseSnowflakes,
  parseTwitchChannel,
  textOrNull,
} from '~/lib/admin/league/forms';
import { lobbyFromFields, parseLobbyJson } from '~/lib/admin/league/lobby';
import { nextRoundStart, planNumberAssign, planNumberChange, planNumberRelease } from '~/lib/admin/league/numbers';
import {
  acceptRegistration,
  applyNumberOps,
  applySeatPlan,
  cloneSeason,
  createRound,
  finishSeason,
  OpError,
  pseudonymizeDriver,
  roundHasResults,
  syncSessions,
} from '~/lib/admin/league/ops';
import type { AdminActionData } from '~/lib/admin/league/page';
import { FROZEN_MESSAGE, isSeasonFrozen, openRoundsBeforeFinish } from '~/lib/admin/league/season';
import { planSeatChange } from '~/lib/admin/league/seats';
import { insertOne, selectOne, UNIQUE_VIOLATION, type Store } from '~/lib/db/store';
import {
  DRIVER_STATUSES,
  INPUT_DEVICES,
  PLATFORMS,
  REGISTRATION_STATUSES,
  ROUND_FORMATS,
  type DriverRow,
  type Id,
  type SeasonRow,
} from '~/lib/db/types';
import { isHttpUrl, normalizeGamertag, slugify } from '~/lib/domain/text';
import type { PrivateSettings, PublicSettings } from '~/lib/settings';
import { audit } from '~/lib/server/audit';
import { getServiceStore } from '~/lib/server/db';
import { EMBED_TEAL, inviteCodeFromUrl, sendWebhook, type WebhookChannel } from '~/lib/server/discord';
import { isDemoMode } from '~/lib/server/env';
import { requestRebuild } from '~/lib/server/rebuild';
import { readPrivateSettings, readPublicSettings, writeSetting } from '~/lib/server/settings';
import { staffFrom, toActionError } from '../_helpers';

// ============================================================================ Helfer

const done = (ok: string, redirect?: string, n?: number | string): AdminActionData => ({ ok, redirect, n });

/**
 * Feldbezogener Fehler aus dem Handler. Wird wie ein Zod-Eingabefehler serialisiert,
 * damit die Seite die Meldung am Feld anzeigen kann.
 */
function fieldError(fields: Record<string, string>): ActionError {
  const err = new ActionError({ code: 'BAD_REQUEST', message: Object.values(fields).join(' ') });
  Object.assign(err, {
    type: 'AstroActionInputError',
    issues: Object.entries(fields).map(([key, message]) => ({ code: 'custom', path: [key], message })),
  });
  return err;
}

const bad = (message: string) => new ActionError({ code: 'BAD_REQUEST', message });
const conflict = (message: string) => new ActionError({ code: 'CONFLICT', message });
const notFound = (what: string) => new ActionError({ code: 'NOT_FOUND', message: `${what} nicht gefunden.` });

/** OpError (Fachfehler aus ops.ts) und Store-Fehler in Action-Fehler übersetzen. */
function fail(err: unknown, conflictMessage = 'Eintrag existiert bereits.'): never {
  if (err instanceof ActionError) throw err;
  // per Name statt instanceof: nach Hot-Reloads im Dev-Server können Klassen doppelt existieren
  if (err instanceof Error && err.name === 'OpError') {
    throw new ActionError({ code: (err as OpError).code, message: err.message });
  }
  if (err instanceof Error && (err as { code?: unknown }).code === UNIQUE_VIOLATION) {
    throw new ActionError({ code: 'CONFLICT', message: conflictMessage });
  }
  return toActionError(err, conflictMessage);
}

/** Saisonnummer und Slug müssen eindeutig sein. */
async function checkSeasonUnique(store: Store, number: number, slug: string, exceptId?: Id): Promise<void> {
  const all = await store.select('seasons');
  if (all.some((s) => s.number === number && s.id !== exceptId)) throw fieldError({ number: `Saison ${number} gibt es schon.` });
  if (all.some((s) => s.slug === slug && s.id !== exceptId)) throw fieldError({ slug: `Der Slug „${slug}“ ist schon vergeben.` });
}

function requireConfirm(confirm: boolean | undefined): void {
  if (!confirm) throw fieldError({ confirm: 'Bitte bestätige den Vorgang mit dem Häkchen.' });
}

async function loadSeason(store: Store, id: Id): Promise<SeasonRow> {
  const season = await selectOne(store, 'seasons', { id });
  if (!season) throw notFound('Saison');
  return season;
}

function assertNotFrozen(season: SeasonRow): void {
  if (isSeasonFrozen(season)) throw conflict(FROZEN_MESSAGE);
}

// ---------------------------------------------------------------------------- Zod-Bausteine (deutsche Meldungen)

const id = z.number({ error: 'Ungültige Auswahl.' }).int().positive();
const optId = z.number({ error: 'Ungültige Auswahl.' }).int().positive().optional();
const req = (label: string, max = 200) =>
  z
    .string({ error: `${label} fehlt.` })
    .trim()
    .min(1, `${label} fehlt.`)
    .max(max, `${label}: höchstens ${max} Zeichen.`);
const opt = (label: string, max = 2000) => z.string().trim().max(max, `${label}: höchstens ${max} Zeichen.`).optional();
const int = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label}: bitte eine Zahl eintragen.` })
    .int(`${label}: bitte eine ganze Zahl eintragen.`)
    .min(min, `${label}: mindestens ${min}.`)
    .max(max, `${label}: höchstens ${max}.`);
const optInt = (label: string, min: number, max: number) => int(label, min, max).optional();
const bool = z.boolean();
const optDate = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isIsoDate(v), `${label}: bitte ein gültiges Datum (JJJJ-MM-TT).`);
const reqDate = (label: string) =>
  z.string({ error: `${label} fehlt.` }).trim().refine((v) => isIsoDate(v), `${label}: bitte ein gültiges Datum (JJJJ-MM-TT).`);
const reqTime = (label: string) =>
  z.string({ error: `${label} fehlt.` }).trim().refine((v) => isTime(v), `${label}: bitte im Format HH:MM.`);
const optUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(500, `${label}: höchstens 500 Zeichen.`)
    .optional()
    .refine((v) => !v || isHttpUrl(v), `${label}: bitte eine vollständige Adresse mit https:// eintragen.`);
const slugField = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), `${label}: nur Kleinbuchstaben, Ziffern und Bindestriche.`);
const hexField = (label: string) =>
  z.string({ error: `${label} fehlt.` }).refine((v) => normalizeHex(v) != null, `${label}: Hex-Wert wie #FF8000.`);
const countryField = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^[A-Za-z]{2}$/.test(v), 'Land: zweistelliger ISO-Code.');
const pointsList = (label: string, required: boolean) =>
  z
    .string()
    .optional()
    .superRefine((v, ctx) => {
      const r = parseIntList(v, { allowEmpty: !required, max: 1000 });
      if (r.error) ctx.addIssue({ code: 'custom', message: `${label}: ${r.error}` });
    });
const confirmField = z.boolean().optional();

// ============================================================================ Saisons

const seasonFields = {
  number: int('Saisonnummer', 1, 999),
  name: req('Name', 80),
  slug: slugField('Slug'),
  game_version: req('Spielversion', 80),
  points_scheme_id: id,
  reserve_points_for_constructors: bool,
  protest_window_hours: int('Protestfrist', 1, 336),
  two_steward_rule: bool,
  penalty_points_enabled: bool,
  rules_version_id: optId,
  starts_on: optDate('Start'),
  ends_on: optDate('Ende'),
};

async function checkSeasonRefs(store: Store, schemeId: Id, rulesId: Id | undefined): Promise<void> {
  if (!(await selectOne(store, 'points_schemes', { id: schemeId }))) throw fieldError({ points_scheme_id: 'Punkteschema nicht gefunden.' });
  if (rulesId != null && !(await selectOne(store, 'rules_versions', { id: rulesId }))) {
    throw fieldError({ rules_version_id: 'Regelwerk-Version nicht gefunden.' });
  }
}

function checkDateOrder(start?: string, end?: string): void {
  if (start && end && end < start) throw fieldError({ ends_on: 'Ende liegt vor dem Start.' });
}

async function activeSeasonOther(store: Store, exceptId?: Id): Promise<SeasonRow | undefined> {
  const active = await store.select('seasons', { eq: { status: 'active' } });
  return active.find((s) => s.id !== exceptId);
}

const seasonSave = defineAction({
  accept: 'form',
  input: z.object({ id: optId, status: z.enum(['planned', 'active'], { error: 'Ungültiger Status.' }), ...seasonFields }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      checkDateOrder(input.starts_on, input.ends_on);
      await checkSeasonRefs(store, input.points_scheme_id, input.rules_version_id);
      await checkSeasonUnique(store, input.number, input.slug || String(input.number), input.id);
      const before = input.id ? await loadSeason(store, input.id) : null;
      if (before) assertNotFrozen(before);
      if (input.status === 'active') {
        const other = await activeSeasonOther(store, input.id);
        if (other) {
          throw fieldError({
            status: `${other.name} ist bereits aktiv. Schließe sie zuerst ab oder setze sie auf „geplant“ – es kann nur eine Saison aktiv sein.`,
          });
        }
      }
      const row = {
        number: input.number,
        name: input.name,
        slug: input.slug || String(input.number),
        game_version: input.game_version,
        status: input.status,
        points_scheme_id: input.points_scheme_id,
        reserve_points_for_constructors: input.reserve_points_for_constructors,
        protest_window_hours: input.protest_window_hours,
        two_steward_rule: input.two_steward_rule,
        penalty_points_enabled: input.penalty_points_enabled,
        rules_version_id: input.rules_version_id ?? null,
        starts_on: input.starts_on || null,
        ends_on: input.ends_on || null,
      };
      if (before) {
        const [saved] = await store.update('seasons', { id: before.id }, row);
        await audit(store, staff, 'update', 'seasons', before.id, before, saved);
        await requestRebuild(store, `Saison ${row.name} geändert`);
        return done(before.status !== 'active' && row.status === 'active' ? 'season_activated' : 'saved', `/admin/saisons/${before.id}`);
      }
      const created = await insertOne(store, 'seasons', { ...row, lobby_settings: {} });
      await audit(store, staff, 'create', 'seasons', created.id, null, created);
      await requestRebuild(store, `Saison ${row.name} angelegt`);
      return done('season_created', `/admin/saisons/${created.id}`);
    } catch (err) {
      fail(err, 'Saisonnummer oder Slug ist schon vergeben.');
    }
  },
});

const seasonClone = defineAction({
  accept: 'form',
  input: z.object({
    source_id: id,
    number: int('Saisonnummer', 1, 999),
    name: req('Name', 80),
    slug: slugField('Slug'),
    game_version: req('Spielversion', 80),
    rules_version_id: optId,
    starts_on: optDate('Start'),
    ends_on: optDate('Ende'),
    copy_seats: bool,
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      checkDateOrder(input.starts_on, input.ends_on);
      await checkSeasonUnique(store, input.number, input.slug || String(input.number));
      if (input.rules_version_id != null && !(await selectOne(store, 'rules_versions', { id: input.rules_version_id }))) {
        throw fieldError({ rules_version_id: 'Regelwerk-Version nicht gefunden.' });
      }
      const res = await cloneSeason(store, input.source_id, {
        number: input.number,
        name: input.name,
        slug: input.slug || String(input.number),
        game_version: input.game_version,
        rules_version_id: input.rules_version_id,
        starts_on: input.starts_on || null,
        ends_on: input.ends_on || null,
        copySeats: input.copy_seats,
      });
      await audit(store, staff, 'create', 'seasons', res.season.id, null, {
        ...res.season,
        cloned_from: res.source.id,
        teams: res.teams,
        seats: res.seats,
        skipped_seats: res.skippedSeats.length,
      });
      await requestRebuild(store, `Saison ${res.season.name} geklont`);
      return done('season_cloned', `/admin/saisons/${res.season.id}`, res.seats);
    } catch (err) {
      fail(err, 'Saisonnummer oder Slug ist schon vergeben.');
    }
  },
});

const seasonFinish = defineAction({
  accept: 'form',
  input: z.object({ season_id: id, confirm: confirmField, force: z.boolean().optional() }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const season = await loadSeason(store, input.season_id);
      if (season.status === 'finished') throw conflict('Die Saison ist bereits abgeschlossen.');
      const rounds = await store.select('rounds', { eq: { season_id: season.id } });
      const open = openRoundsBeforeFinish(rounds);
      if (open.length > 0 && !input.force) {
        throw fieldError({
          force: `Runde${open.length > 1 ? 'n' : ''} ${open.map((n) => `R${n}`).join(', ')} ${open.length > 1 ? 'sind' : 'ist'} noch nicht final oder abgesagt. Setze das Häkchen „Trotzdem abschließen“, wenn das so gewollt ist.`,
        });
      }
      const res = await finishSeason(store, season.id);
      await audit(store, staff, 'finalize', 'seasons', season.id, res.before, res.season);
      for (const a of res.awards) await audit(store, staff, 'create', 'awards', a.id, null, a);
      await requestRebuild(store, `Saison ${season.name} abgeschlossen`);
      return done('season_finished', `/admin/saisons/${season.id}`);
    } catch (err) {
      fail(err);
    }
  },
});

const seasonReopen = defineAction({
  accept: 'form',
  input: z.object({ season_id: id, confirm: confirmField }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const season = await loadSeason(store, input.season_id);
      if (season.status !== 'finished') throw conflict('Die Saison ist nicht abgeschlossen.');
      const other = await activeSeasonOther(store, season.id);
      const [saved] = await store.update('seasons', { id: season.id }, { status: other ? 'planned' : 'active' });
      await audit(store, staff, 'update', 'seasons', season.id, season, saved);
      await requestRebuild(store, `Saison ${season.name} wieder geöffnet`);
      return done('season_reopened', `/admin/saisons/${season.id}`);
    } catch (err) {
      fail(err);
    }
  },
});

const seasonDelete = defineAction({
  accept: 'form',
  input: z.object({ season_id: id, confirm: confirmField }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const season = await loadSeason(store, input.season_id);
      if (season.status !== 'planned') throw conflict('Nur geplante Saisons können gelöscht werden.');
      const rounds = await store.select('rounds', { eq: { season_id: season.id }, limit: 1 });
      if (rounds.length > 0) throw conflict('Die Saison hat bereits Runden im Kalender – lösche zuerst die Runden.');
      // Fahrer, die „seit dieser Saison“ dabei sind, verlieren nur den Verweis
      const joined = await store.select('drivers', { eq: { joined_season_id: season.id } });
      for (const d of joined) await store.update('drivers', { id: d.id }, { joined_season_id: null });
      await store.remove('seasons', { id: season.id });
      await audit(store, staff, 'delete', 'seasons', season.id, season, null);
      await requestRebuild(store, `Saison ${season.name} gelöscht`);
      return done('deleted', '/admin/saisons');
    } catch (err) {
      fail(err);
    }
  },
});

/** Lobby-Einstellungen: einfache Formularfelder (mode=form) oder JSON (mode=json). */
const seasonLobbySave = defineAction({
  accept: 'form',
  handler: async (form: FormData, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const seasonId = Number(form.get('season_id'));
      if (!Number.isInteger(seasonId) || seasonId <= 0) throw bad('Ungültige Saison.');
      const season = await loadSeason(store, seasonId);
      assertNotFrozen(season);
      const mode = form.get('mode') === 'json' ? 'json' : 'form';
      let result;
      if (mode === 'json') {
        result = parseLobbyJson(String(form.get('json') ?? ''));
        if (result.errors.length > 0) throw fieldError({ json: result.errors.slice(0, 8).join(' ') });
      } else {
        const fields = new Map<string, string>();
        for (const [k, v] of form.entries()) if (typeof v === 'string') fields.set(k, v);
        result = lobbyFromFields(fields);
        if (result.errors.length > 0) throw fieldError({ lobby: result.errors.slice(0, 8).join(' ') });
      }
      const [saved] = await store.update('seasons', { id: season.id }, { lobby_settings: result.value! });
      await audit(store, staff, 'update', 'seasons', season.id, { lobby_settings: season.lobby_settings }, { lobby_settings: saved?.lobby_settings });
      await requestRebuild(store, `Lobby-Einstellungen ${season.name}`);
      return done('lobby_saved', `/admin/saisons/${season.id}?lobby=${mode}#lobby`);
    } catch (err) {
      fail(err);
    }
  },
});

// ============================================================================ Punkteschemata

const schemeFields = {
  name: req('Name', 60),
  race_points: pointsList('Punkte Rennen', true),
  sprint_points: pointsList('Punkte Sprint', false),
  fastest_lap_bonus: int('Bonus schnellste Runde', 0, 50),
  fastest_lap_max_pos: optInt('Nur bis Platz', 1, 99),
  pole_bonus: int('Pole-Bonus', 0, 50),
};

const schemeSave = defineAction({
  accept: 'form',
  input: z.object({ id: optId, ...schemeFields }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const race = parseIntList(input.race_points, { allowEmpty: false }).values;
      const sprint = parseIntList(input.sprint_points).values;
      const row = {
        name: input.name,
        race_points: race,
        sprint_points: sprint,
        fastest_lap_bonus: input.fastest_lap_bonus,
        fastest_lap_max_pos: input.fastest_lap_bonus > 0 ? (input.fastest_lap_max_pos ?? null) : null,
        pole_bonus: input.pole_bonus,
      };
      if (!isNonIncreasing(race)) throw fieldError({ race_points: 'Punkte Rennen: Die Werte sollten mit dem Platz fallen (P1 zuerst).' });
      if (!isNonIncreasing(sprint)) throw fieldError({ sprint_points: 'Punkte Sprint: Die Werte sollten mit dem Platz fallen (P1 zuerst).' });
      const taken = (await store.select('points_schemes')).find((s) => s.name.toLowerCase() === input.name.toLowerCase() && s.id !== input.id);
      if (taken) throw fieldError({ name: 'Diesen Namen gibt es schon.' });
      if (input.id) {
        const before = await selectOne(store, 'points_schemes', { id: input.id });
        if (!before) throw notFound('Punkteschema');
        const [saved] = await store.update('points_schemes', { id: input.id }, row);
        await audit(store, staff, 'update', 'points_schemes', input.id, before, saved);
        await requestRebuild(store, `Punkteschema ${row.name} geändert`);
        return done('saved', `/admin/punkteschemata/${input.id}`);
      }
      const created = await insertOne(store, 'points_schemes', row);
      await audit(store, staff, 'create', 'points_schemes', created.id, null, created);
      await requestRebuild(store, `Punkteschema ${row.name} angelegt`);
      return done('scheme_created', `/admin/punkteschemata/${created.id}`);
    } catch (err) {
      fail(err, 'Diesen Namen gibt es schon.');
    }
  },
});

const schemeDelete = defineAction({
  accept: 'form',
  input: z.object({ id, confirm: confirmField }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const before = await selectOne(store, 'points_schemes', { id: input.id });
      if (!before) throw notFound('Punkteschema');
      const used = await store.select('seasons', { eq: { points_scheme_id: input.id } });
      if (used.length > 0) throw conflict(`Wird noch verwendet von: ${used.map((s) => s.name).join(', ')}.`);
      await store.remove('points_schemes', { id: input.id });
      await audit(store, staff, 'delete', 'points_schemes', input.id, before, null);
      await requestRebuild(store, `Punkteschema ${before.name} gelöscht`);
      return done('deleted', '/admin/punkteschemata');
    } catch (err) {
      fail(err);
    }
  },
});

// ============================================================================ Kalender & Strecken

async function checkTrack(store: Store, trackId: Id): Promise<void> {
  if (!(await selectOne(store, 'tracks', { id: trackId }))) throw fieldError({ track_id: 'Strecke nicht gefunden.' });
}

const roundSave = defineAction({
  accept: 'form',
  input: z.object({
    id: optId,
    season_id: id,
    number: optInt('Rundennummer', 1, 99),
    track_id: id,
    date: reqDate('Datum'),
    time: reqTime('Uhrzeit'),
    format: z.enum(ROUND_FORMATS, { error: 'Ungültiges Format.' }),
    vod_url: optUrl('VOD-Link'),
    highlights_url: optUrl('Highlights-Link'),
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const season = await loadSeason(store, input.season_id);
      assertNotFrozen(season);
      await checkTrack(store, input.track_id);
      const local_start = localStartFrom(input.date, input.time);
      if (input.id) {
        const before = await selectOne(store, 'rounds', { id: input.id });
        if (!before) throw notFound('Runde');
        if (before.season_id !== season.id) throw bad('Die Runde gehört zu einer anderen Saison.');
        const number = input.number ?? before.number;
        const clash = (await store.select('rounds', { eq: { season_id: season.id, number } })).find((r) => r.id !== before.id);
        if (clash) throw fieldError({ number: `R${number} gibt es in dieser Saison schon.` });
        const [saved] = await store.update(
          'rounds',
          { id: before.id },
          {
            number,
            track_id: input.track_id,
            local_start,
            format: input.format,
            vod_url: input.vod_url || null,
            highlights_url: input.highlights_url || null,
          },
        );
        let code = 'saved';
        if (before.format !== input.format) {
          const plan = await syncSessions(store, before.id, input.format);
          if (plan.keptWithResults.length > 0) code = 'sessions_kept';
        }
        await audit(store, staff, 'update', 'rounds', before.id, before, saved);
        await requestRebuild(store, `Runde R${number} geändert`);
        return done(code, `/admin/kalender/${before.id}`);
      }
      const existing = await store.select('rounds', { eq: { season_id: season.id } });
      const number = input.number ?? existing.reduce((m, r) => Math.max(m, r.number), 0) + 1;
      if (existing.some((r) => r.number === number)) throw fieldError({ number: `R${number} gibt es in dieser Saison schon.` });
      const round = await createRound(store, {
        season_id: season.id,
        number,
        track_id: input.track_id,
        local_start,
        format: input.format,
        vod_url: input.vod_url || null,
        highlights_url: input.highlights_url || null,
      });
      await audit(store, staff, 'create', 'rounds', round.id, null, round);
      await requestRebuild(store, `Runde R${number} angelegt`);
      return done('round_created', `/admin/kalender?saison=${season.id}`);
    } catch (err) {
      fail(err, 'Diese Rundennummer gibt es in der Saison schon.');
    }
  },
});

/** VOD-/Highlight-Links – auch für abgeschlossene Saisons (Archiv, Plan §8.2). */
const roundMediaSave = defineAction({
  accept: 'form',
  input: z.object({ id, vod_url: optUrl('VOD-Link'), highlights_url: optUrl('Highlights-Link') }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const before = await selectOne(store, 'rounds', { id: input.id });
      if (!before) throw notFound('Runde');
      const [saved] = await store.update('rounds', { id: before.id }, { vod_url: input.vod_url || null, highlights_url: input.highlights_url || null });
      await audit(store, staff, 'update', 'rounds', before.id, before, saved);
      await requestRebuild(store, `Links R${before.number}`);
      return done('saved', `/admin/kalender/${before.id}`);
    } catch (err) {
      fail(err);
    }
  },
});

const roundsBatchCreate = defineAction({
  accept: 'form',
  input: z.object({
    season_id: id,
    start_date: reqDate('Startdatum'),
    weekday: optInt('Wochentag', 0, 6),
    interval_days: int('Abstand', 1, 60),
    time: reqTime('Uhrzeit'),
    tracks: req('Strecken', 4000),
    skip_dates: opt('Pausen', 1000),
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const season = await loadSeason(store, input.season_id);
      assertNotFrozen(season);
      const tracks = await store.select('tracks');
      const list = parseTrackList(input.tracks, tracks);
      if (list.unknown.length > 0) throw fieldError({ tracks: `Unbekannte Strecken: ${list.unknown.join(', ')}.` });
      if (list.items.length === 0) throw fieldError({ tracks: 'Bitte mindestens eine Strecke eintragen.' });
      if (list.items.length > 30) throw fieldError({ tracks: 'Höchstens 30 Runden auf einmal.' });
      const skip = (input.skip_dates ?? '').split(/[\s,;]+/).filter((s) => s !== '');
      const badSkip = skip.filter((s) => !isIsoDate(s));
      if (badSkip.length > 0) throw fieldError({ skip_dates: `Ungültige Daten: ${badSkip.join(', ')} (Format JJJJ-MM-TT).` });
      const dates = batchDates({
        startDate: input.start_date,
        weekday: input.weekday ?? null,
        intervalDays: input.interval_days,
        time: input.time,
        count: list.items.length,
        skipDates: skip,
      });
      const existing = await store.select('rounds', { eq: { season_id: season.id } });
      let number = existing.reduce((m, r) => Math.max(m, r.number), 0);
      const created = [];
      for (const [i, item] of list.items.entries()) {
        number += 1;
        created.push(
          await createRound(store, { season_id: season.id, number, track_id: item.track!.id, local_start: dates[i]!, format: item.format }),
        );
      }
      await audit(store, staff, 'create', 'rounds', null, null, {
        season_id: season.id,
        rounds: created.map((r) => ({ id: r.id, number: r.number, track_id: r.track_id, local_start: r.local_start, format: r.format })),
      });
      await requestRebuild(store, `${created.length} Runden angelegt`);
      return done('rounds_created', `/admin/kalender?saison=${season.id}`, created.length);
    } catch (err) {
      fail(err, 'Eine der Rundennummern gibt es schon.');
    }
  },
});

const roundCancel = defineAction({
  accept: 'form',
  input: z.object({ id, confirm: confirmField, restore: z.boolean().optional() }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const before = await selectOne(store, 'rounds', { id: input.id });
      if (!before) throw notFound('Runde');
      assertNotFrozen(await loadSeason(store, before.season_id));
      if (input.restore) {
        if (before.status !== 'cancelled') throw conflict('Die Runde ist nicht abgesagt.');
        const [saved] = await store.update('rounds', { id: before.id }, { status: 'scheduled' });
        await audit(store, staff, 'update', 'rounds', before.id, before, saved);
        await requestRebuild(store, `Absage R${before.number} zurückgenommen`);
        return done('round_restored', `/admin/kalender/${before.id}`);
      }
      requireConfirm(input.confirm);
      if (before.status !== 'scheduled' && before.status !== 'lineup_published') {
        throw conflict('Nur geplante Runden (ohne veröffentlichtes Ergebnis) können abgesagt werden.');
      }
      if (await roundHasResults(store, before.id)) throw conflict('Die Runde hat bereits Ergebnisse und kann nicht abgesagt werden.');
      const [saved] = await store.update('rounds', { id: before.id }, { status: 'cancelled' });
      await audit(store, staff, 'update', 'rounds', before.id, before, saved);
      await requestRebuild(store, `R${before.number} abgesagt`);
      return done('round_cancelled', `/admin/kalender/${before.id}`);
    } catch (err) {
      fail(err);
    }
  },
});

const roundDelete = defineAction({
  accept: 'form',
  input: z.object({ id, confirm: confirmField }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const before = await selectOne(store, 'rounds', { id: input.id });
      if (!before) throw notFound('Runde');
      assertNotFrozen(await loadSeason(store, before.season_id));
      if (before.status !== 'scheduled' && before.status !== 'cancelled') {
        throw conflict('Nur geplante oder abgesagte Runden ohne veröffentlichte Aufstellung können gelöscht werden.');
      }
      if (await roundHasResults(store, before.id)) throw conflict('Die Runde hat bereits Ergebnisse.');
      const incidents = await store.select('incidents', { eq: { round_id: before.id }, limit: 1 });
      if (incidents.length > 0) throw conflict('Zu dieser Runde gibt es Vorfälle – sag sie stattdessen ab.');
      await store.remove('rounds', { id: before.id });
      await audit(store, staff, 'delete', 'rounds', before.id, before, null);
      await requestRebuild(store, `R${before.number} gelöscht`);
      return done('deleted', `/admin/kalender?saison=${before.season_id}`);
    } catch (err) {
      fail(err);
    }
  },
});

/** Länge „5,278“ oder „5.278“ → Zahl mit 3 Nachkommastellen. */
function parseLength(value: string | undefined): number | null {
  const v = (value ?? '').trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= 100) throw fieldError({ length_km: 'Länge in km, z. B. 5,278.' });
  return Math.round(n * 1000) / 1000;
}

const trackSave = defineAction({
  accept: 'form',
  input: z.object({
    id: optId,
    name_de: req('Name (DE)', 60),
    name_en: req('Name (EN)', 60),
    slug: slugField('Slug'),
    country_code: z.string({ error: 'Land fehlt.' }).trim().regex(/^[A-Za-z]{2}$/, 'Land: zweistelliger ISO-Code.'),
    game_track_id: optInt('Spiel-ID', 0, 999),
    length_km: opt('Länge', 12),
    laps_default: optInt('Runden', 1, 200),
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const all = await store.select('tracks');
      const slug = input.slug || slugify(input.name_en);
      if (all.some((t) => t.slug === slug && t.id !== input.id)) throw fieldError({ slug: `Der Slug „${slug}“ ist schon vergeben.` });
      const row = {
        slug,
        name_de: input.name_de,
        name_en: input.name_en,
        country_code: input.country_code.toUpperCase(),
        game_track_id: input.game_track_id ?? null,
        length_km: parseLength(input.length_km),
        laps_default: input.laps_default ?? null,
      };
      if (input.id) {
        const before = all.find((t) => t.id === input.id);
        if (!before) throw notFound('Strecke');
        const [saved] = await store.update('tracks', { id: before.id }, row);
        await audit(store, staff, 'update', 'tracks', before.id, before, saved);
        await requestRebuild(store, `Strecke ${row.name_de} geändert`);
        return done('saved', `/admin/kalender/strecken/${before.id}`);
      }
      const created = await insertOne(store, 'tracks', row);
      await audit(store, staff, 'create', 'tracks', created.id, null, created);
      await requestRebuild(store, `Strecke ${row.name_de} angelegt`);
      return done('track_created', '/admin/kalender/strecken');
    } catch (err) {
      fail(err, 'Diesen Slug gibt es schon.');
    }
  },
});

const trackDelete = defineAction({
  accept: 'form',
  input: z.object({ id, confirm: confirmField }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const before = await selectOne(store, 'tracks', { id: input.id });
      if (!before) throw notFound('Strecke');
      const used = await store.select('rounds', { eq: { track_id: input.id }, limit: 1 });
      if (used.length > 0) throw conflict('Die Strecke wird im Kalender verwendet und kann nicht gelöscht werden.');
      await store.remove('tracks', { id: input.id });
      await audit(store, staff, 'delete', 'tracks', input.id, before, null);
      await requestRebuild(store, `Strecke ${before.name_de} gelöscht`);
      return done('deleted', '/admin/kalender/strecken');
    } catch (err) {
      fail(err);
    }
  },
});

// ============================================================================ Teams & Cockpits

const teamSave = defineAction({
  accept: 'form',
  input: z.object({
    id: optId,
    name: req('Name', 60),
    short_name: req('Kurzname', 5).min(2, 'Kurzname: 2 bis 5 Zeichen.'),
    slug: slugField('Slug'),
    color_hex: hexField('Teamfarbe'),
    text_color_hex: hexField('Textfarbe'),
    game_team_id: optInt('Spiel-ID', 0, 255),
    active: bool,
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const all = await store.select('teams');
      const slug = input.slug || slugify(input.name);
      if (all.some((t) => t.slug === slug && t.id !== input.id)) throw fieldError({ slug: `Der Slug „${slug}“ ist schon vergeben.` });
      const row = {
        name: input.name,
        short_name: input.short_name.toUpperCase(),
        slug,
        color_hex: normalizeHex(input.color_hex)!,
        text_color_hex: normalizeHex(input.text_color_hex)!,
        game_team_id: input.game_team_id ?? null,
        active: input.active,
      };
      if (input.id) {
        const before = all.find((t) => t.id === input.id);
        if (!before) throw notFound('Team');
        const [saved] = await store.update('teams', { id: before.id }, row);
        await audit(store, staff, 'update', 'teams', before.id, before, saved);
        await requestRebuild(store, `Team ${row.name} geändert`);
        return done('saved', `/admin/teams/${before.id}`);
      }
      const created = await insertOne(store, 'teams', row);
      await audit(store, staff, 'create', 'teams', created.id, null, created);
      await requestRebuild(store, `Team ${row.name} angelegt`);
      return done('team_created', `/admin/teams/${created.id}`);
    } catch (err) {
      fail(err, 'Diesen Slug gibt es schon.');
    }
  },
});

const teamDelete = defineAction({
  accept: 'form',
  input: z.object({ id, confirm: confirmField }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const before = await selectOne(store, 'teams', { id: input.id });
      if (!before) throw notFound('Team');
      const uses = await Promise.all([
        store.select('season_teams', { eq: { team_id: input.id }, limit: 1 }),
        store.select('seats', { eq: { team_id: input.id }, limit: 1 }),
        store.select('round_entries', { eq: { team_id: input.id }, limit: 1 }),
        store.select('results', { eq: { team_id: input.id }, limit: 1 }),
        store.select('awards', { eq: { team_id: input.id }, limit: 1 }),
      ]);
      if (uses.some((u) => u.length > 0)) {
        throw conflict('Das Team ist in Saisons, Cockpits oder Ergebnissen eingetragen. Setze es stattdessen auf „inaktiv“.');
      }
      await store.remove('teams', { id: input.id });
      await audit(store, staff, 'delete', 'teams', input.id, before, null);
      await requestRebuild(store, `Team ${before.name} gelöscht`);
      return done('deleted', '/admin/teams');
    } catch (err) {
      fail(err);
    }
  },
});

/**
 * Teams einer Saison mit Reihenfolge. Felder: `season_id`, je Team `team_<id>` (Häkchen)
 * und `order_<id>` (Position).
 */
const seasonTeamsSave = defineAction({
  accept: 'form',
  handler: async (form: FormData, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const seasonId = Number(form.get('season_id'));
      if (!Number.isInteger(seasonId) || seasonId <= 0) throw bad('Ungültige Saison.');
      const season = await loadSeason(store, seasonId);
      assertNotFrozen(season);
      const [teams, before, seats] = await Promise.all([
        store.select('teams'),
        store.select('season_teams', { eq: { season_id: seasonId } }),
        store.select('seats', { eq: { season_id: seasonId } }),
      ]);
      const chosen = teams
        .filter((t) => form.has(`team_${t.id}`))
        .map((t) => {
          const raw = Number(form.get(`order_${t.id}`));
          return { team: t, order: Number.isFinite(raw) && String(form.get(`order_${t.id}`) ?? '').trim() !== '' ? raw : 999 };
        })
        .sort((a, b) => a.order - b.order || a.team.name.localeCompare(b.team.name, 'de'));
      const chosenIds = new Set(chosen.map((c) => c.team.id));
      const removedWithSeats = before
        .filter((st) => !chosenIds.has(st.team_id))
        .filter((st) => seats.some((s) => s.team_id === st.team_id));
      if (removedWithSeats.length > 0) {
        const names = removedWithSeats.map((st) => teams.find((t) => t.id === st.team_id)?.name ?? `#${st.team_id}`);
        throw conflict(`Diese Teams haben noch Cockpits in der Saison: ${names.join(', ')}. Entferne zuerst die Cockpit-Einträge.`);
      }
      const results = await store.select('results', { in: { team_id: before.filter((st) => !chosenIds.has(st.team_id)).map((st) => st.team_id) } });
      if (results.length > 0) throw conflict('Ein entferntes Team hat bereits Ergebnisse in dieser Saison.');
      if (chosen.length > 11) {
        // erlaubt, aber das Grid hat 11 Teams – nur Hinweis über die Seite
      }
      for (const st of before) if (!chosenIds.has(st.team_id)) await store.remove('season_teams', { season_id: seasonId, team_id: st.team_id });
      await store.upsert(
        'season_teams',
        chosen.map((c, i) => ({ season_id: seasonId, team_id: c.team.id, sort_order: i })),
        ['season_id', 'team_id'],
      );
      await audit(
        store,
        staff,
        'update',
        'season_teams',
        seasonId,
        { teams: before.sort((a, b) => a.sort_order - b.sort_order).map((st) => st.team_id) },
        { teams: chosen.map((c) => c.team.id) },
      );
      await requestRebuild(store, `Teams ${season.name}`);
      return done('season_teams_saved', `/admin/teams/aufstellung?saison=${seasonId}`);
    } catch (err) {
      fail(err);
    }
  },
});

const seatSave = defineAction({
  accept: 'form',
  input: z.object({
    season_id: id,
    team_id: id,
    seat_no: int('Cockpit', 1, 2),
    driver_id: optId,
    from_round: int('Gültig ab Runde', 1, 99),
    release_other: bool,
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const season = await loadSeason(store, input.season_id);
      assertNotFrozen(season);
      const [inSeason] = await store.select('season_teams', { eq: { season_id: season.id, team_id: input.team_id } });
      if (!inSeason) throw bad('Das Team gehört nicht zu dieser Saison.');
      const [seats, drivers, teams] = await Promise.all([
        store.select('seats', { eq: { season_id: season.id } }),
        store.select('drivers'),
        store.select('teams'),
      ]);
      if (input.driver_id != null) {
        const d = drivers.find((x) => x.id === input.driver_id);
        if (!d) throw fieldError({ driver_id: 'Fahrer nicht gefunden.' });
        if (d.anonymized) throw fieldError({ driver_id: 'Pseudonymisierte Fahrer können keinem Cockpit zugeordnet werden.' });
        if (d.status === 'banned') throw fieldError({ driver_id: `${d.gamertag} ist gesperrt.` });
      }
      const plan = planSeatChange(
        seats,
        {
          season_id: season.id,
          team_id: input.team_id,
          seat_no: input.seat_no as 1 | 2,
          driver_id: input.driver_id ?? null,
          from_round: input.from_round,
          releaseOtherSeat: input.release_other,
        },
        {
          driver: (x) => drivers.find((d) => d.id === x)?.gamertag ?? `Fahrer #${x}`,
          team: (x) => teams.find((t) => t.id === x)?.name ?? `Team #${x}`,
        },
      );
      if (plan.error) throw conflict(plan.error);
      const touched = new Set<Id>([...plan.deletes, ...plan.updates.map((u) => u.id)]);
      const beforeRows = seats.filter((s) => touched.has(s.id));
      await applySeatPlan(store, plan);
      await audit(store, staff, 'update', 'seats', null, { seats: beforeRows }, { deleted: plan.deletes, updated: plan.updates, inserted: plan.insert });
      await requestRebuild(store, `Cockpit ${season.name}`);
      return done(plan.notes.length > 0 ? 'seat_moved' : 'seat_saved', `/admin/teams/aufstellung?saison=${season.id}#team-${input.team_id}`);
    } catch (err) {
      fail(err);
    }
  },
});

const seatRemove = defineAction({
  accept: 'form',
  input: z.object({ id, confirm: confirmField }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const before = await selectOne(store, 'seats', { id: input.id });
      if (!before) throw notFound('Cockpit-Eintrag');
      assertNotFrozen(await loadSeason(store, before.season_id));
      await store.remove('seats', { id: before.id });
      await audit(store, staff, 'delete', 'seats', before.id, before, null);
      await requestRebuild(store, 'Cockpit-Eintrag entfernt');
      return done('seat_removed', `/admin/teams/aufstellung?saison=${before.season_id}#team-${before.team_id}`);
    } catch (err) {
      fail(err);
    }
  },
});

// ============================================================================ Fahrer & Startnummern

const driverSave = defineAction({
  accept: 'form',
  input: z.object({
    id: optId,
    gamertag: req('Gamertag', 40),
    slug: slugField('Slug'),
    platform: z.enum(PLATFORMS, { error: 'Bitte eine Plattform wählen.' }),
    input_device: z.enum(INPUT_DEVICES, { error: 'Bitte ein Eingabegerät wählen.' }),
    nationality_code: countryField,
    status: z.enum(DRIVER_STATUSES, { error: 'Ungültiger Status.' }),
    reserve_order: optInt('Reserve-Reihenfolge', 1, 999),
    joined_season_id: optId,
    twitch_url: optUrl('Twitch'),
    youtube_url: optUrl('YouTube'),
    show_links: bool,
    discord_username: opt('Discord-Name', 64),
    discord_user_id: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^\d{15,21}$/.test(v), 'Discord-ID: 15–21 Ziffern (Entwicklermodus → „ID kopieren“).'),
    ea_id: opt('EA-ID', 64),
    notes: opt('Notizen', 4000),
    number: optInt('Startnummer', 1, 99),
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const gamertag = normalizeGamertag(input.gamertag);
      if (gamertag === '') throw fieldError({ gamertag: 'Gamertag fehlt.' });
      const drivers = await store.select('drivers');
      const before = input.id ? drivers.find((d) => d.id === input.id) : undefined;
      if (input.id && !before) throw notFound('Fahrer');
      if (before?.anonymized) throw conflict('Pseudonymisierte Fahrer können nicht mehr bearbeitet werden.');
      const dup = findGamertagDuplicate(gamertag, drivers, input.id);
      if (dup) throw fieldError({ gamertag: `Diesen Gamertag gibt es schon („${dup.gamertag}“, #${dup.id}).` });
      if (input.twitch_url && !/twitch\.tv\//i.test(input.twitch_url)) throw fieldError({ twitch_url: 'Bitte einen twitch.tv-Link eintragen.' });
      if (input.youtube_url && !/(youtube\.com|youtu\.be)\//i.test(input.youtube_url)) {
        throw fieldError({ youtube_url: 'Bitte einen YouTube-Link eintragen.' });
      }
      const slugs = drivers.map((d) => d.slug);
      let slug: string;
      if (input.slug) {
        if (drivers.some((d) => d.slug === input.slug && d.id !== input.id)) throw fieldError({ slug: `Der Slug „${input.slug}“ ist schon vergeben.` });
        slug = input.slug;
      } else if (before && before.gamertag === gamertag) {
        slug = before.slug;
      } else {
        slug = driverSlug(gamertag, slugs, before?.slug);
      }
      if (input.joined_season_id != null && !(await selectOne(store, 'seasons', { id: input.joined_season_id }))) {
        throw fieldError({ joined_season_id: 'Saison nicht gefunden.' });
      }
      const reserveOrder =
        input.status === 'reserve' ? (input.reserve_order ?? before?.reserve_order ?? nextReserveOrder(drivers)) : null;
      const row: Partial<DriverRow> = {
        gamertag,
        slug,
        platform: input.platform,
        input_device: input.input_device,
        nationality_code: input.nationality_code ? input.nationality_code.toUpperCase() : null,
        status: input.status,
        reserve_order: reserveOrder,
        joined_season_id: input.joined_season_id ?? null,
        twitch_url: input.twitch_url || null,
        youtube_url: input.youtube_url || null,
        show_links: input.show_links,
      };
      const priv = {
        discord_username: textOrNull(input.discord_username),
        discord_user_id: textOrNull(input.discord_user_id),
        ea_id: textOrNull(input.ea_id),
        notes: textOrNull(input.notes),
      };

      if (before) {
        const [saved] = await store.update('drivers', { id: before.id }, row);
        const privBefore = await selectOne(store, 'driver_private', { driver_id: before.id });
        const [privSaved] = await store.upsert('driver_private', [{ driver_id: before.id, ...priv }], ['driver_id']);
        await audit(store, staff, 'update', 'drivers', before.id, before, saved);
        await audit(store, staff, 'update', 'driver_private', before.id, privBefore, privSaved);
        await requestRebuild(store, `Fahrer ${gamertag} geändert`);
        return done('saved', `/admin/fahrer/${before.id}`);
      }

      // Neuer Fahrer, optional mit Startnummer (gilt sofort)
      let numberOps: ReturnType<typeof planNumberAssign> | null = null;
      if (input.number != null) {
        const numbers = await store.select('driver_numbers');
        numberOps = planNumberAssign(-1, input.number, numbers, new Date(), 'Bei der Anlage vergeben');
        if (numberOps.error) throw fieldError({ number: numberOps.error });
      }
      const created = await insertOne(store, 'drivers', { ...row, anonymized: false });
      await store.insert('driver_private', { driver_id: created.id, ...priv });
      if (numberOps) {
        await applyNumberOps(
          store,
          numberOps.ops.map((op) => (op.kind === 'insert' ? { ...op, row: { ...op.row, driver_id: created.id } } : op)),
        );
      }
      await audit(store, staff, 'create', 'drivers', created.id, null, created);
      await requestRebuild(store, `Fahrer ${gamertag} angelegt`);
      return done('driver_created', `/admin/fahrer/${created.id}`);
    } catch (err) {
      fail(err, 'Gamertag oder Slug gibt es schon.');
    }
  },
});

async function numberContext(store: Store, driverId: Id) {
  const [driver, numbers, drivers] = await Promise.all([
    selectOne(store, 'drivers', { id: driverId }),
    store.select('driver_numbers'),
    store.select('drivers'),
  ]);
  if (!driver) throw notFound('Fahrer');
  const name = (x: Id) => {
    const d = drivers.find((y) => y.id === x);
    return d ? (d.anonymized ? `Ehemaliger Fahrer #${d.id}` : d.gamertag) : `Fahrer #${x}`;
  };
  return { driver, numbers, name };
}

const driverNumberAssign = defineAction({
  accept: 'form',
  input: z.object({ driver_id: id, number: int('Startnummer', 1, 99), note: opt('Notiz', 200) }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const { driver, numbers, name } = await numberContext(store, input.driver_id);
      if (driver.anonymized) throw conflict('Pseudonymisierte Fahrer bekommen keine Nummer.');
      const plan = planNumberAssign(driver.id, input.number, numbers, new Date(), textOrNull(input.note), name);
      if (plan.error) throw fieldError({ number: plan.error });
      await applyNumberOps(store, plan.ops);
      await audit(store, staff, 'create', 'driver_numbers', driver.id, null, { number: input.number, valid_from: plan.effectiveFrom });
      await requestRebuild(store, `Nummer ${input.number} für ${driver.gamertag}`);
      return done('number_assigned', `/admin/fahrer/${driver.id}#nummern`);
    } catch (err) {
      fail(err, 'Die Nummer ist bereits vergeben.');
    }
  },
});

const driverNumberChange = defineAction({
  accept: 'form',
  input: z.object({ driver_id: id, number: int('Neue Startnummer', 1, 99), note: opt('Notiz', 200) }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const { driver, numbers, name } = await numberContext(store, input.driver_id);
      if (driver.anonymized) throw conflict('Pseudonymisierte Fahrer bekommen keine Nummer.');
      const now = new Date();
      const rounds = await store.select('rounds');
      const plan = planNumberChange(driver.id, input.number, numbers, nextRoundStart(rounds, now), now, textOrNull(input.note) ?? 'Wechsel mit Admin-OK', name);
      if (plan.error) throw fieldError({ number: plan.error });
      await applyNumberOps(store, plan.ops);
      const reverted = plan.ops.some((o) => o.kind === 'reopen');
      await audit(store, staff, 'update', 'driver_numbers', driver.id, null, { number: input.number, valid_from: plan.effectiveFrom, ops: plan.ops });
      await requestRebuild(store, `Nummernwechsel ${driver.gamertag}`);
      return done(reverted ? 'number_change_reverted' : 'number_changed', `/admin/fahrer/${driver.id}#nummern`);
    } catch (err) {
      fail(err, 'Die Nummer ist bereits vergeben.');
    }
  },
});

const driverNumberRelease = defineAction({
  accept: 'form',
  input: z.object({ driver_id: id, confirm: confirmField }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const { driver, numbers } = await numberContext(store, input.driver_id);
      const plan = planNumberRelease(driver, numbers, new Date());
      if (plan.error) throw conflict(plan.error);
      await applyNumberOps(store, plan.ops);
      await audit(store, staff, 'update', 'driver_numbers', driver.id, null, { released: true, ops: plan.ops });
      await requestRebuild(store, `Nummer von ${driver.gamertag} freigegeben`);
      return done('number_released', `/admin/fahrer/${driver.id}#nummern`);
    } catch (err) {
      fail(err);
    }
  },
});

const driverPseudonymize = defineAction({
  accept: 'form',
  input: z.object({ driver_id: id, confirm: confirmField, confirm_text: z.string().optional() }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const driver = await selectOne(store, 'drivers', { id: input.driver_id });
      if (!driver) throw notFound('Fahrer');
      if (!confirmsGamertag(input.confirm_text, driver.gamertag)) {
        throw fieldError({ confirm_text: 'Zur Sicherheit bitte den aktuellen Gamertag genau eintippen.' });
      }
      const res = await pseudonymizeDriver(store, driver.id);
      // Bewusst ohne alte Werte im Protokoll (Löschwunsch)
      await audit(store, staff, 'update', 'drivers', driver.id, null, {
        anonymized: true,
        gamertag: res.driver.gamertag,
        removed_registrations: res.removedRegistrations,
      });
      await requestRebuild(store, `Fahrer #${driver.id} pseudonymisiert`);
      return done('pseudonymized', `/admin/fahrer/${driver.id}`);
    } catch (err) {
      fail(err);
    }
  },
});

// ============================================================================ Anmeldungen

const registrationUpdate = defineAction({
  accept: 'form',
  input: z.object({
    id,
    status: z.enum(REGISTRATION_STATUSES, { error: 'Ungültiger Status.' }),
    admin_notes: opt('Notizen', 4000),
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const before = await selectOne(store, 'registrations', { id: input.id });
      if (!before) throw notFound('Anmeldung');
      if (input.status === 'accepted' && before.driver_id == null) {
        throw fieldError({ status: 'Nutze „Annehmen & Fahrer anlegen“, damit der Fahrer angelegt wird.' });
      }
      const statusChanged = before.status !== input.status;
      const [saved] = await store.update(
        'registrations',
        { id: before.id },
        {
          status: input.status,
          admin_notes: textOrNull(input.admin_notes),
          ...(statusChanged ? { processed_by: staff.userId, processed_at: new Date().toISOString() } : {}),
        },
      );
      await audit(store, staff, 'update', 'registrations', before.id, before, saved);
      return done('reg_saved', `/admin/anmeldungen/${before.id}`);
    } catch (err) {
      fail(err);
    }
  },
});

const registrationAccept = defineAction({
  accept: 'form',
  input: z.object({ id }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const res = await acceptRegistration(store, input.id, staff.userId);
      await audit(store, staff, 'create', 'drivers', res.driver.id, null, { ...res.driver, from_registration: input.id });
      await audit(store, staff, 'update', 'registrations', input.id, res.before, res.registration);
      await requestRebuild(store, `Neuer Fahrer ${res.driver.gamertag}`);
      return res.number != null
        ? done('reg_accepted', `/admin/anmeldungen/${input.id}`, res.number)
        : done('reg_accepted_nonumber', `/admin/anmeldungen/${input.id}`);
    } catch (err) {
      fail(err, 'Diesen Gamertag gibt es schon bei einem Fahrer.');
    }
  },
});

const registrationDelete = defineAction({
  accept: 'form',
  input: z.object({ id, confirm: confirmField }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const before = await selectOne(store, 'registrations', { id: input.id });
      if (!before) throw notFound('Anmeldung');
      await store.remove('registrations', { id: input.id });
      // Datenschutz: keine Kontaktdaten im Protokoll
      await audit(store, staff, 'delete', 'registrations', input.id, null, { status: before.status });
      return done('deleted', '/admin/anmeldungen');
    } catch (err) {
      fail(err);
    }
  },
});

// ============================================================================ Einstellungen (nur Admin)

const WEBHOOK_CHANNELS = ['registrations', 'lineup', 'results', 'incidents', 'decisions', 'news', 'contact'] as const satisfies readonly WebhookChannel[];

async function savePublic<K extends keyof PublicSettings>(
  store: Store,
  staff: Parameters<typeof audit>[1],
  key: K,
  value: PublicSettings[K],
): Promise<void> {
  const before = (await readPublicSettings(store))[key];
  await writeSetting(store, key, value as never);
  await audit(store, staff, 'update', 'settings', key, { [key]: before }, { [key]: value });
  await requestRebuild(store, `Einstellung ${key}`);
}

async function savePrivate<K extends keyof PrivateSettings>(
  store: Store,
  staff: Parameters<typeof audit>[1],
  key: K,
  value: PrivateSettings[K],
  mask?: (v: PrivateSettings[K]) => unknown,
): Promise<void> {
  const before = (await readPrivateSettings(store))[key];
  await writeSetting(store, key, value as never);
  const m = mask ?? ((v: PrivateSettings[K]) => v);
  await audit(store, staff, 'update', 'settings', key, { [key]: m(before) }, { [key]: m(value) });
}

const inviteField = (label: string) =>
  z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine((v) => !v || inviteCodeFromUrl(v) != null || /^[A-Za-z0-9-]{2,32}$/.test(v), `${label}: Invite-Link (discord.gg/…) oder Code.`);

const settingsDiscord = defineAction({
  accept: 'form',
  input: z.object({
    invite_url: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || inviteCodeFromUrl(v) != null, 'Bitte einen Discord-Invite-Link wie https://discord.gg/abc eintragen.'),
    invite_website: inviteField('Website'),
    invite_instagram: inviteField('Instagram'),
    invite_tiktok: inviteField('TikTok'),
    invite_youtube: inviteField('YouTube'),
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const url = input.invite_url || null;
      await savePublic(store, staff, 'discord_invite', { url, code: inviteCodeFromUrl(url) });
      await savePrivate(store, staff, 'discord_invites', {
        website: input.invite_website || null,
        instagram: input.invite_instagram || null,
        tiktok: input.invite_tiktok || null,
        youtube: input.invite_youtube || null,
      });
      return done('settings_saved', '/admin/einstellungen#discord');
    } catch (err) {
      fail(err);
    }
  },
});

/** Webhook-URLs: leeres Feld = unverändert, Häkchen „entfernen“ löscht die URL. */
const settingsWebhooks = defineAction({
  accept: 'form',
  handler: async (form: FormData, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const current = (await readPrivateSettings(store)).webhooks;
      const next = { ...current };
      const errors: Record<string, string> = {};
      for (const ch of WEBHOOK_CHANNELS) {
        const raw = String(form.get(`wh_${ch}`) ?? '').trim();
        if (form.has(`clear_${ch}`)) next[ch] = null;
        else if (raw !== '') {
          if (!isDiscordWebhookUrl(raw)) errors[`wh_${ch}`] = 'Keine gültige Discord-Webhook-URL (https://discord.com/api/webhooks/…).';
          else next[ch] = raw;
        }
      }
      if (Object.keys(errors).length > 0) throw fieldError(errors);
      await savePrivate(store, staff, 'webhooks', next, (v) =>
        Object.fromEntries(Object.entries(v).map(([k, url]) => [k, url ? maskSecret(url) : null])),
      );
      return done('settings_saved', '/admin/einstellungen#webhooks');
    } catch (err) {
      fail(err);
    }
  },
});

const WEBHOOK_LABELS: Record<WebhookChannel, string> = {
  registrations: 'Anmeldungen',
  lineup: 'Aufstellung',
  results: 'Ergebnisse',
  incidents: 'Vorfälle (Stewards intern)',
  decisions: 'Urteile',
  news: 'News',
  contact: 'Kontaktanfragen',
};

const settingsWebhookTest = defineAction({
  accept: 'form',
  input: z.object({ channel: z.enum(WEBHOOK_CHANNELS, { error: 'Unbekannter Channel.' }) }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const url = (await readPrivateSettings(store)).webhooks[input.channel];
      if (!url) throw conflict(`Für „${WEBHOOK_LABELS[input.channel]}“ ist keine Webhook-URL hinterlegt.`);
      const ok = await sendWebhook(url, {
        embeds: [
          {
            title: 'Test-Nachricht der Website',
            description: `Dieser Channel ist für „${WEBHOOK_LABELS[input.channel]}“ verbunden. Ausgelöst von ${staff.name} im Admin-Bereich.`,
            color: EMBED_TEAL,
            timestamp: new Date().toISOString(),
          },
        ],
      });
      if (!ok) throw new ActionError({ code: 'BAD_GATEWAY', message: 'Discord hat die Test-Nachricht nicht angenommen. Prüfe die URL (Webhook gelöscht?).' });
      return done('webhook_ok', '/admin/einstellungen#webhooks');
    } catch (err) {
      fail(err);
    }
  },
});

const socialUrl = (label: string, host: RegExp) =>
  optUrl(label).refine((v) => !v || host.test(v), `${label}: bitte einen passenden Profil-Link eintragen.`);

const settingsSocial = defineAction({
  accept: 'form',
  input: z.object({
    instagram: socialUrl('Instagram', /instagram\.com\//i),
    tiktok: socialUrl('TikTok', /tiktok\.com\//i),
    youtube: socialUrl('YouTube', /(youtube\.com|youtu\.be)\//i),
    twitch_channel: opt('Twitch-Kanal', 100),
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const twitch = parseTwitchChannel(input.twitch_channel);
      if (twitch.error) throw fieldError({ twitch_channel: twitch.error });
      await savePublic(store, staff, 'socials', {
        instagram: input.instagram || null,
        tiktok: input.tiktok || null,
        youtube: input.youtube || null,
      });
      await savePublic(store, staff, 'twitch_channel', twitch.channel);
      return done('settings_saved', '/admin/einstellungen#social');
    } catch (err) {
      fail(err);
    }
  },
});

const settingsAnalytics = defineAction({
  accept: 'form',
  input: z.object({
    ga_measurement_id: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || isGaMeasurementId(v.toUpperCase()), 'Messungs-ID im Format G-XXXXXXXXXX (GA4).'),
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      await savePublic(store, staff, 'ga_measurement_id', input.ga_measurement_id ? input.ga_measurement_id.toUpperCase() : null);
      return done('settings_saved', '/admin/einstellungen#analytics');
    } catch (err) {
      fail(err);
    }
  },
});

const settingsRoles = defineAction({
  accept: 'form',
  input: z.object({ admin: opt('Admin', 1000), steward: opt('Steward', 1000), redakteur: opt('Redaktion', 1000) }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const parsed = {
        admin: parseSnowflakes(input.admin),
        steward: parseSnowflakes(input.steward),
        redakteur: parseSnowflakes(input.redakteur),
      };
      const errors: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v.invalid.length > 0) errors[k] = `Keine gültigen Rollen-IDs: ${v.invalid.join(', ')} (nur Ziffern).`;
      }
      if (Object.keys(errors).length > 0) throw fieldError(errors);
      if (!isDemoMode() && parsed.admin.ids.length === 0) {
        throw fieldError({ admin: 'Mindestens eine Admin-Rolle ist nötig – sonst sperrst du dich selbst aus.' });
      }
      await savePrivate(store, staff, 'discord_role_map', {
        admin: parsed.admin.ids,
        steward: parsed.steward.ids,
        redakteur: parsed.redakteur.ids,
      });
      return done('settings_saved', '/admin/einstellungen#rollen');
    } catch (err) {
      fail(err);
    }
  },
});

const settingsRegistration = defineAction({
  accept: 'form',
  input: z.object({
    state: z.enum(['open', 'waitlist', 'closed'], { error: 'Ungültiger Status.' }),
    free_seats: int('Freie Cockpits', 0, 22),
    free_reserve: int('Freie Reserveplätze', 0, 99),
    note_de: opt('Hinweis (DE)', 300),
    note_en: opt('Hinweis (EN)', 300),
  }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      await savePublic(store, staff, 'registration', {
        state: input.state,
        free_seats: input.free_seats,
        free_reserve: input.free_reserve,
        note_de: textOrNull(input.note_de),
        note_en: textOrNull(input.note_en),
      });
      return done('settings_saved', '/admin/einstellungen#anmeldung');
    } catch (err) {
      fail(err);
    }
  },
});

const settingsHome = defineAction({
  accept: 'form',
  input: z.object({ claim_de: req('Claim (DE)', 160), claim_en: req('Claim (EN)', 160) }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      await savePublic(store, staff, 'home', { claim_de: input.claim_de, claim_en: input.claim_en });
      return done('settings_saved', '/admin/einstellungen#startseite');
    } catch (err) {
      fail(err);
    }
  },
});

const settingsRebuild = defineAction({
  accept: 'form',
  handler: async (_form: FormData, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      if (isDemoMode()) return done('rebuild_demo', '/admin/einstellungen#rebuild');
      await requestRebuild(store, `Manuell von ${staff.name}`);
      await audit(store, staff, 'publish', 'settings', 'rebuild', null, { reason: 'manuell' });
      return done('rebuild_requested', '/admin/einstellungen#rebuild');
    } catch (err) {
      fail(err);
    }
  },
});

// ============================================================================ Kontaktanfragen

const contactUpdate = defineAction({
  accept: 'form',
  input: z.object({ id, status: z.enum(['new', 'done'], { error: 'Ungültiger Status.' }) }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      const before = await selectOne(store, 'contact_messages', { id: input.id });
      if (!before) throw notFound('Anfrage');
      await store.update('contact_messages', { id: input.id }, { status: input.status });
      await audit(store, staff, 'update', 'contact_messages', input.id, { status: before.status }, { status: input.status });
      return done(input.status === 'done' ? 'contact_done' : 'contact_open', `/admin/kontakt/${input.id}`);
    } catch (err) {
      fail(err);
    }
  },
});

const contactDelete = defineAction({
  accept: 'form',
  input: z.object({ id, confirm: confirmField }),
  handler: async (input, context) => {
    const staff = staffFrom(context, 'admin');
    const store = getServiceStore();
    try {
      requireConfirm(input.confirm);
      const before = await selectOne(store, 'contact_messages', { id: input.id });
      if (!before) throw notFound('Anfrage');
      await store.remove('contact_messages', { id: input.id });
      await audit(store, staff, 'delete', 'contact_messages', input.id, null, { subject: before.subject });
      return done('deleted', '/admin/kontakt');
    } catch (err) {
      fail(err);
    }
  },
});

// ============================================================================ Export

export const leagueActions = {
  seasonSave,
  seasonClone,
  seasonFinish,
  seasonReopen,
  seasonDelete,
  seasonLobbySave,
  schemeSave,
  schemeDelete,
  roundSave,
  roundMediaSave,
  roundsBatchCreate,
  roundCancel,
  roundDelete,
  trackSave,
  trackDelete,
  teamSave,
  teamDelete,
  seasonTeamsSave,
  seatSave,
  seatRemove,
  driverSave,
  driverNumberAssign,
  driverNumberChange,
  driverNumberRelease,
  driverPseudonymize,
  registrationUpdate,
  registrationAccept,
  registrationDelete,
  settingsDiscord,
  settingsWebhooks,
  settingsWebhookTest,
  settingsSocial,
  settingsAnalytics,
  settingsRoles,
  settingsRegistration,
  settingsHome,
  settingsRebuild,
  contactUpdate,
  contactDelete,
};
