/**
 * Öffentliche Formulare ohne Login: Anmeldung, Vorfall melden, Kontakt (Plan §4.6, §4.9, §4.10).
 *
 * Jede Action: Spam-Schutz (Honeypot, Zeitfalle, Turnstile, Rate-Limit pro IP-Hash),
 * Validierung (Zod, Fehlercodes → forms.error.*), Speichern mit dem Service-Store und
 * ein Discord-Webhook mit minimalen Daten (Plan §8.1). Fehler, die zu einem Feld gehören,
 * kommen als ActionError mit Code (siehe src/lib/forms/errors.ts).
 */
import { ActionError, defineAction, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import { t } from '~/i18n';
import type { Store } from '~/lib/db/store';
import { insertOne } from '~/lib/db/store';
import { isNumberAvailable, MIN_PUBLIC_NUMBER } from '~/lib/domain/numbers';
import { contactSchema, incidentSchema, registrationSchema } from '~/lib/forms/schemas';
import { findRegistrationDuplicate } from '~/lib/forms/registration';
import { contactEmbed, incidentEmbed, registrationEmbed } from '~/lib/forms/discord';
import { checkParticipants, isProtestOpen, uniqueIds } from '~/lib/forms/incident';
import { currentRulesVersion, loadRoundGrid, loadRoundSessions } from '~/lib/forms/server';
import { getServiceStore } from '~/lib/server/db';
import { EMBED_GREEN, EMBED_TEAL, EMBED_WARNING, notify, siteUrl } from '~/lib/server/discord';
import { readPublicSettings } from '~/lib/server/settings';
import { guardPublicForm, HONEYPOT_FIELD, TIMESTAMP_FIELD, TURNSTILE_FIELD, type SpamCheckResult } from '~/lib/server/spam';
import { roundLabel } from '~/lib/view';
import { toActionError } from './_helpers';

/** Spam-Felder, die jedes öffentliche Formular zusätzlich sendet. */
const spamFields = {
  [HONEYPOT_FIELD]: z.string().nullish(),
  [TIMESTAMP_FIELD]: z.string().nullish(),
  [TURNSTILE_FIELD]: z.string().nullish(),
};

type SpamInput = { [HONEYPOT_FIELD]?: string | null; [TIMESTAMP_FIELD]?: string | null; [TURNSTILE_FIELD]?: string | null };

/** Rate-Limits je Formular (Plan §4.6, §4.9). */
const LIMITS = {
  incident: { bucket: 'incident', max: 5, windowMinutes: 60 },
  registration: { bucket: 'registration', max: 3, windowMinutes: 60 },
  contact: { bucket: 'contact', max: 5, windowMinutes: 60 },
} as const;

function spamCode(reason: Exclude<SpamCheckResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'too_fast':
      return 'spam_too_fast';
    case 'expired':
      return 'spam_expired';
    case 'turnstile':
      return 'spam_turnstile';
    case 'rate_limited':
      return 'spam_rate_limited';
    default:
      return 'spam';
  }
}

/** Spam-Schutz ausführen; liefert den IP-Hash oder wirft einen ActionError mit Code. */
async function guard(store: Store, context: ActionAPIContext, input: SpamInput, limit: (typeof LIMITS)[keyof typeof LIMITS]): Promise<string | null> {
  const result = await guardPublicForm(
    store,
    context.request,
    { honeypot: input[HONEYPOT_FIELD], token: input[TIMESTAMP_FIELD], turnstile: input[TURNSTILE_FIELD] },
    limit,
  );
  if (!result.ok) {
    throw new ActionError({ code: result.reason === 'rate_limited' ? 'TOO_MANY_REQUESTS' : 'FORBIDDEN', message: spamCode(result.reason) });
  }
  return result.ipHash ?? null;
}

function fail(code: 'BAD_REQUEST' | 'CONFLICT' | 'FORBIDDEN', message: string): never {
  throw new ActionError({ code, message });
}

// ---------------------------------------------------------------------------- Vorfall melden

const reportIncident = defineAction({
  accept: 'form',
  input: incidentSchema.extend(spamFields),
  handler: async (input, context) => {
    const store = getServiceStore();
    const ipHash = await guard(store, context, input, LIMITS.incident);
    try {
      // Frist serverseitig erneut prüfen (Plan §4.6)
      const [round] = await store.select('rounds', { eq: { id: input.round_id }, limit: 1 });
      if (!round) fail('BAD_REQUEST', 'round_invalid');
      if (!isProtestOpen(round, new Date())) fail('FORBIDDEN', 'deadline_passed');

      const sessions = await loadRoundSessions(store, round.id);
      const session = sessions.find((s) => s.id === input.session_id);
      if (!session) fail('BAD_REQUEST', 'session_invalid');

      const grid = await loadRoundGrid(store, round.id);
      const involved = uniqueIds(input.involved_driver_ids);
      const issue = checkParticipants(
        grid.map((g) => g.driverId),
        input.reporter_driver_id,
        involved,
      );
      if (issue) fail('BAD_REQUEST', issue.code);

      const incident = await insertOne(store, 'incidents', {
        round_id: round.id,
        session_id: session.id,
        reporter_driver_id: input.reporter_driver_id,
        reporter_contact: input.reporter_contact,
        involved_driver_ids: involved,
        lap: input.lap ?? null,
        corner: input.corner,
        description: input.description,
        clip_url: input.clip_url,
        clip_timestamp: input.clip_timestamp,
        submitted_at: new Date().toISOString(),
        ip_hash: ipHash,
        source: 'report',
        status: 'new',
      });

      // Discord #stewards-intern: Runde, Beteiligte, Clip, Link in den Admin-Bereich (Plan §8.1)
      const [track] = await store.select('tracks', { eq: { id: round.track_id }, limit: 1 });
      const nameOf = (id: number) => {
        const g = grid.find((x) => x.driverId === id);
        if (!g) return `#${id}`;
        const name = g.anonymized ? `${t('de', 'common.formerDriver')} #${id}` : g.gamertag;
        return g.number != null ? `#${g.number} ${name}` : name;
      };
      const adminUrl = siteUrl(`/admin/stewards/${incident.id}`, context.url.origin);
      const embed = incidentEmbed({
        round: roundLabel(round, track, 'de'),
        session: session.type,
        lap: input.lap ?? null,
        corner: input.corner,
        involved: involved.map(nameOf),
        clipUrl: input.clip_url,
        clipTimestamp: input.clip_timestamp,
        adminUrl,
      });
      await notify(store, 'incidents', { ...embed, color: EMBED_WARNING, timestamp: incident.submitted_at });

      return { id: incident.id, roundId: round.id, roundNumber: round.number, trackId: round.track_id };
    } catch (err) {
      toActionError(err);
    }
  },
});

// ---------------------------------------------------------------------------- Anmeldung

const registerDriver = defineAction({
  accept: 'form',
  input: registrationSchema.extend(spamFields),
  handler: async (input, context) => {
    const store = getServiceStore();
    const settings = await readPublicSettings(store);
    if (settings.registration.state === 'closed') fail('FORBIDDEN', 'registration_closed');

    const ipHash = await guard(store, context, input, LIMITS.registration);
    try {
      // Duplikate: gleicher Gamertag/EA-ID oder gleicher Discord-Name (Plan §4.9)
      const [registrations, drivers, driverPrivate] = await Promise.all([
        store.select('registrations'),
        store.select('drivers'),
        store.select('driver_private'),
      ]);
      const duplicate = findRegistrationDuplicate(input, { registrations, drivers, driverPrivate });
      if (duplicate) fail('CONFLICT', duplicate === 'gamertag' ? 'duplicate_gamertag' : 'duplicate_discord');

      // Wunschnummer frei? (2–99, Plan §1 „Startnummern“)
      const numbers = await store.select('driver_numbers', { eq: { number: input.desired_number } });
      if (input.desired_number < MIN_PUBLIC_NUMBER || !isNumberAvailable(input.desired_number, numbers, new Date())) {
        fail('CONFLICT', 'number_taken');
      }

      const now = new Date().toISOString();
      const registration = await insertOne(store, 'registrations', {
        gamertag: input.gamertag,
        discord_username: input.discord_username,
        ea_id: input.ea_id,
        platform: input.platform,
        input_device: input.input_device,
        nationality: input.nationality,
        desired_number: input.desired_number,
        wanted_role: input.wanted_role,
        availability: input.availability,
        experience: input.experience,
        reference_time: input.reference_time,
        consents: { age16: input.age16, rules: input.rules, at: now, rules_version: await currentRulesVersion(store) },
        status: 'new',
        admin_notes: null,
        ip_hash: ipHash,
        driver_id: null,
        processed_by: null,
        processed_at: null,
      });

      // Discord #anmeldungen: nur Gamertag, Plattform, Wunschnummer und Link – kein Discord-Name (Plan §4.9)
      const adminUrl = siteUrl(`/admin/anmeldungen/${registration.id}`, context.url.origin);
      await notify(store, 'registrations', { ...registrationEmbed(registration, adminUrl), color: EMBED_GREEN, timestamp: now });

      return { id: registration.id, gamertag: registration.gamertag, waitlist: settings.registration.state === 'waitlist' };
    } catch (err) {
      toActionError(err);
    }
  },
});

// ---------------------------------------------------------------------------- Kontakt

const sendContact = defineAction({
  accept: 'form',
  input: contactSchema.extend(spamFields),
  handler: async (input, context) => {
    const store = getServiceStore();
    const ipHash = await guard(store, context, input, LIMITS.contact);
    try {
      const message = await insertOne(store, 'contact_messages', {
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
        status: 'new',
        ip_hash: ipHash,
      });

      // Discord: nur Betreff und Link – keine E-Mail-Adresse im Klartext
      const adminUrl = siteUrl(`/admin/kontakt/${message.id}`, context.url.origin);
      await notify(store, 'contact', { ...contactEmbed(message, adminUrl), color: EMBED_TEAL, timestamp: message.created_at });

      return { id: message.id };
    } catch (err) {
      toActionError(err);
    }
  },
});

export const publicActions = {
  reportIncident,
  registerDriver,
  sendContact,
};
