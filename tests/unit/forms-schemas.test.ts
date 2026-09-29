import { describe, expect, it } from 'vitest';
import { contactSchema, incidentSchema, registrationSchema } from '~/lib/forms/schemas';

/** Erste Meldung je Feld, wie Astro sie in ActionInputError.fields sammelt. */
function fieldErrors(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) {
    const key = String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

const ZWSP = String.fromCharCode(0x200b);

const validRegistration = {
  gamertag: '  Apex' + ZWSP + 'Anna_2  ',
  ea_id: null,
  discord_username: '@Apex.Anna',
  platform: 'playstation',
  input_device: 'wheel',
  desired_number: 42,
  nationality: 'de',
  wanted_role: 'any',
  availability: 'regular',
  experience: null,
  reference_time: '',
  age16: true,
  rules: true,
};

describe('registrationSchema', () => {
  it('normalisiert Gamertag, Discord-Name und Nationalität', () => {
    const r = registrationSchema.safeParse(validRegistration);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.gamertag).toBe('ApexAnna_2');
    expect(r.data.discord_username).toBe('apex.anna');
    expect(r.data.nationality).toBe('DE');
    expect(r.data.reference_time).toBeNull();
    expect(r.data.experience).toBeNull();
    expect(r.data.ea_id).toBeNull();
  });

  it('meldet Pflichtfelder und Einwilligungen mit Fehlercodes', () => {
    const r = registrationSchema.safeParse({
      ...validRegistration,
      gamertag: null,
      discord_username: null,
      platform: null,
      input_device: null,
      desired_number: null,
      wanted_role: null,
      availability: null,
      age16: false,
      rules: false,
    });
    expect(r.success).toBe(false);
    expect(fieldErrors(r)).toMatchObject({
      gamertag: 'gamertag_invalid',
      discord_username: 'discord_invalid',
      platform: 'choose',
      input_device: 'choose',
      desired_number: 'number_invalid',
      wanted_role: 'choose',
      availability: 'choose',
      age16: 'age16_required',
      rules: 'rules_required',
    });
  });

  it('akzeptiert nur Startnummern von 2 bis 99', () => {
    for (const n of [1, 100, 0, 4.5, Number.NaN]) {
      const r = registrationSchema.safeParse({ ...validRegistration, desired_number: n });
      expect(fieldErrors(r).desired_number, String(n)).toBe('number_invalid');
    }
    expect(registrationSchema.safeParse({ ...validRegistration, desired_number: 2 }).success).toBe(true);
    expect(registrationSchema.safeParse({ ...validRegistration, desired_number: 99 }).success).toBe(true);
  });

  it('lehnt unbekannte Länder, zu kurze Gamertags und ungültige Discord-Namen ab', () => {
    expect(fieldErrors(registrationSchema.safeParse({ ...validRegistration, nationality: 'XX' })).nationality).toBe('nationality_invalid');
    expect(fieldErrors(registrationSchema.safeParse({ ...validRegistration, gamertag: ' a ' })).gamertag).toBe('gamertag_invalid');
    expect(fieldErrors(registrationSchema.safeParse({ ...validRegistration, discord_username: 'hat leerzeichen' })).discord_username).toBe(
      'discord_invalid',
    );
    expect(registrationSchema.safeParse({ ...validRegistration, discord_username: 'OldName#1234' }).success).toBe(true);
  });

  it('begrenzt Freitexte', () => {
    const r = registrationSchema.safeParse({ ...validRegistration, experience: 'x'.repeat(1001) });
    expect(fieldErrors(r).experience).toBe('text_too_long');
  });
});

const validIncident = {
  round_id: 4,
  session_id: 12,
  reporter_driver_id: 5,
  involved_driver_ids: [5, 11],
  lap: 3,
  corner: ' Kurve 1 ',
  description: 'Beim Anbremsen wurde ich von hinten getroffen und habe mich gedreht.',
  clip_url: ' https://youtu.be/abc?t=12 ',
  clip_timestamp: '01.23',
  reporter_contact: 'drs_dani',
};

describe('incidentSchema', () => {
  it('akzeptiert eine vollständige Meldung und normalisiert Werte', () => {
    const r = incidentSchema.safeParse(validIncident);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.corner).toBe('Kurve 1');
    expect(r.data.clip_url).toBe('https://youtu.be/abc?t=12');
    expect(r.data.clip_timestamp).toBe('01:23');
  });

  it('verlangt einen Clip von erlaubten Plattformen mit Zeitstempel', () => {
    expect(fieldErrors(incidentSchema.safeParse({ ...validIncident, clip_url: null })).clip_url).toBe('clip_invalid');
    expect(fieldErrors(incidentSchema.safeParse({ ...validIncident, clip_url: 'https://example.com/video' })).clip_url).toBe('clip_invalid');
    expect(fieldErrors(incidentSchema.safeParse({ ...validIncident, clip_timestamp: null })).clip_timestamp).toBe('clip_timestamp_invalid');
    expect(fieldErrors(incidentSchema.safeParse({ ...validIncident, clip_timestamp: '1:75' })).clip_timestamp).toBe('clip_timestamp_invalid');
  });

  it('verlangt mindestens einen Beteiligten und eine sinnvolle Beschreibung', () => {
    expect(fieldErrors(incidentSchema.safeParse({ ...validIncident, involved_driver_ids: [] })).involved_driver_ids).toBe('involved_required');
    expect(fieldErrors(incidentSchema.safeParse({ ...validIncident, description: 'zu kurz' })).description).toBe('description_invalid');
  });

  it('Rennrunde ist optional, muss aber im Bereich liegen', () => {
    expect(incidentSchema.safeParse({ ...validIncident, lap: undefined }).success).toBe(true);
    expect(fieldErrors(incidentSchema.safeParse({ ...validIncident, lap: 0 })).lap).toBe('lap_invalid');
    expect(fieldErrors(incidentSchema.safeParse({ ...validIncident, lap: 201 })).lap).toBe('lap_invalid');
  });
});

describe('contactSchema', () => {
  const valid = { name: 'Anna', email: ' anna@example.com ', subject: 'Partnerschaft', message: 'Hallo, wie werden wir Partner?' };

  it('akzeptiert eine gültige Nachricht', () => {
    const r = contactSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('anna@example.com');
  });

  it('meldet ungültige Felder', () => {
    const r = contactSchema.safeParse({ name: 'A', email: 'keine-mail', subject: 'Hi', message: 'kurz' });
    expect(fieldErrors(r)).toEqual({
      name: 'name_invalid',
      email: 'email_invalid',
      subject: 'subject_invalid',
      message: 'message_invalid',
    });
  });
});
