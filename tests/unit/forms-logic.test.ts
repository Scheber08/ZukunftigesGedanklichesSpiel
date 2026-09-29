import { describe, expect, it } from 'vitest';
import { countryOptions, isKnownCountry } from '~/lib/forms/countries';
import { collectErrors, errorText, fieldForCode, translateFieldErrors } from '~/lib/forms/errors';
import { checkParticipants, isProtestOpen, isValidClipTimestamp, mergeGrid, normalizeClipTimestamp, openProtestRounds } from '~/lib/forms/incident';
import { discordKey, findRegistrationDuplicate, isValidDiscordName, normalizeDiscordName } from '~/lib/forms/registration';
import { positiveInt } from '~/lib/forms/values';

const now = new Date('2026-09-29T12:00:00Z');

describe('Protestfrist', () => {
  it('ist nur bei vorläufigem Ergebnis und Frist in der Zukunft offen', () => {
    expect(isProtestOpen({ status: 'provisional', protest_deadline: '2026-09-30T12:00:00Z' }, now)).toBe(true);
    expect(isProtestOpen({ status: 'provisional', protest_deadline: '2026-09-29T11:59:59Z' }, now)).toBe(false);
    expect(isProtestOpen({ status: 'final', protest_deadline: '2026-09-30T12:00:00Z' }, now)).toBe(false);
    expect(isProtestOpen({ status: 'provisional', protest_deadline: null }, now)).toBe(false);
  });

  it('sortiert offene Runden nach Fristende', () => {
    const rounds = [
      { id: 1, status: 'provisional' as const, protest_deadline: '2026-10-01T10:00:00Z' },
      { id: 2, status: 'final' as const, protest_deadline: '2026-09-30T10:00:00Z' },
      { id: 3, status: 'provisional' as const, protest_deadline: '2026-09-30T10:00:00Z' },
    ];
    expect(openProtestRounds(rounds, now).map((r) => r.id)).toEqual([3, 1]);
  });
});

describe('Zeitstempel im Clip', () => {
  it.each(['0:42', '01:23', '1:02:10', '83:10', ' 12.34 '])('akzeptiert %s', (s) => {
    expect(isValidClipTimestamp(s)).toBe(true);
  });
  it.each(['', 'abc', '1:60', '1:61:00', '12', '1:2'])('lehnt %s ab', (s) => {
    expect(isValidClipTimestamp(s)).toBe(false);
  });
  it('normalisiert Punkte und Leerraum', () => {
    expect(normalizeClipTimestamp(' 1.02.10 ')).toBe('1:02:10');
  });
});

describe('Beteiligte eines Vorfalls', () => {
  const grid = [1, 2, 3];
  it('verlangt Melder und Beteiligte aus dem Grid', () => {
    expect(checkParticipants(grid, 9, [1])).toEqual({ field: 'reporter_driver_id', code: 'reporter_invalid' });
    expect(checkParticipants(grid, 1, [2, 9])).toEqual({ field: 'involved_driver_ids', code: 'involved_invalid' });
  });
  it('verlangt mindestens einen anderen Fahrer', () => {
    expect(checkParticipants(grid, 1, [1])).toEqual({ field: 'involved_driver_ids', code: 'involved_required' });
    expect(checkParticipants(grid, 1, [1, 2])).toBeNull();
    expect(checkParticipants(grid, 1, [2, 3])).toBeNull();
  });
});

describe('Discord-Namen', () => {
  it('normalisiert', () => {
    expect(normalizeDiscordName('  @Apex.Anna ')).toBe('apex.anna');
    expect(normalizeDiscordName('OldName#1234')).toBe('OldName#1234');
    expect(discordKey('OldName#1234')).toBe('oldname#1234');
  });
  it('prüft das Format', () => {
    expect(isValidDiscordName('apex_anna.99')).toBe(true);
    expect(isValidDiscordName('a')).toBe(false);
    expect(isValidDiscordName('two..dots')).toBe(false);
    expect(isValidDiscordName('mit leer')).toBe(false);
    expect(isValidDiscordName('OldName#1234')).toBe(true);
  });
});

describe('Duplikat-Erkennung', () => {
  const sources = {
    registrations: [
      { gamertag: 'Newcomer_Nele', discord_username: 'nele_racing', ea_id: null, status: 'new' as const },
      { gamertag: 'Rejected_Rudi', discord_username: 'rudi', ea_id: null, status: 'rejected' as const },
    ],
    drivers: [
      { gamertag: 'ApexAnna', anonymized: false },
      { gamertag: 'Ghost', anonymized: true },
    ],
    driverPrivate: [{ discord_username: 'apexanna', ea_id: 'Anna_EA' }],
  };

  it('findet gleichen Gamertag (Groß-/Kleinschreibung, unsichtbare Zeichen egal)', () => {
    const zw = String.fromCharCode(0x200b);
    expect(findRegistrationDuplicate({ gamertag: 'apex' + zw + 'anna', discord_username: 'neu' }, sources)).toBe('gamertag');
    expect(findRegistrationDuplicate({ gamertag: 'NEWCOMER_NELE', discord_username: 'neu' }, sources)).toBe('gamertag');
    expect(findRegistrationDuplicate({ gamertag: 'Anderer', ea_id: 'anna_ea', discord_username: 'neu' }, sources)).toBe('gamertag');
  });

  it('findet gleichen Discord-Namen bei offenen Anmeldungen und Fahrern', () => {
    expect(findRegistrationDuplicate({ gamertag: 'Neu', discord_username: '@Nele_Racing' }, sources)).toBe('discord');
    expect(findRegistrationDuplicate({ gamertag: 'Neu', discord_username: 'apexanna' }, sources)).toBe('discord');
  });

  it('ignoriert abgelehnte Anmeldungen und pseudonymisierte Fahrer', () => {
    expect(findRegistrationDuplicate({ gamertag: 'Rejected_Rudi', discord_username: 'rudi' }, sources)).toBeNull();
    expect(findRegistrationDuplicate({ gamertag: 'Ghost', discord_username: 'ghost' }, sources)).toBeNull();
  });
});

describe('Länderliste', () => {
  it('ist sortiert, lokalisiert und ohne EU/UN', () => {
    const de = countryOptions('de');
    expect(de.length).toBeGreaterThan(200);
    expect(de.find((c) => c.value === 'DE')?.label).toBe('Deutschland');
    expect(countryOptions('en').find((c) => c.value === 'DE')?.label).toBe('Germany');
    expect(de.some((c) => c.value === 'EU' || c.value === 'UN')).toBe(false);
    const labels = de.map((c) => c.label);
    expect([...labels].sort((a, b) => new Intl.Collator('de-DE', { sensitivity: 'base' }).compare(a, b))).toEqual(labels);
  });
  it('kennt gültige Codes', () => {
    expect(isKnownCountry('at')).toBe(true);
    expect(isKnownCountry('XX')).toBe(false);
    expect(isKnownCountry(null)).toBe(false);
  });
});

describe('Fehlertexte', () => {
  it('übersetzt bekannte Codes und fällt sonst zurück', () => {
    expect(errorText('de', 'number_taken')).toContain('vergeben');
    expect(errorText('en', 'number_taken')).toContain('taken');
    expect(errorText('de', 'Invalid input: expected string')).toBe(errorText('de', 'server'));
    expect(translateFieldErrors('de', { gamertag: ['unbekannt'] }).gamertag).toBe(errorText('de', 'required'));
  });

  it('ordnet Server-Codes Feldern zu', () => {
    expect(fieldForCode('number_taken')).toBe('desired_number');
    expect(collectErrors('de', { message: 'duplicate_discord' }, false).fields.discord_username).toBeDefined();
    expect(collectErrors('de', { message: 'spam_rate_limited' }, false).form).toContain('Zu viele');
    expect(collectErrors('en', { fields: { email: ['email_invalid'] } }, true).fields.email).toContain('valid email');
  });

  it('liest positive Ganzzahlen', () => {
    expect(positiveInt('12')).toBe(12);
    expect(positiveInt('0')).toBeNull();
    expect(positiveInt('1e3')).toBeNull();
    expect(positiveInt(null)).toBeNull();
  });
});

describe('Grid einer Runde', () => {
  it('nimmt die Aufstellung und ergänzt Fahrer, die nur in den Ergebnissen stehen', () => {
    const grid = mergeGrid(
      [
        { driver_id: 1, race_number: 4, team_id: 10, role: 'regular' },
        { driver_id: 2, race_number: null, team_id: 10, role: 'reserve' },
      ],
      [
        { driver_id: 1, race_number: 4, team_id: 10, role: 'regular' },
        { driver_id: 2, race_number: 31, team_id: 10, role: 'reserve' },
        { driver_id: 3, race_number: 7, team_id: 11, role: 'reserve' },
        { driver_id: 3, race_number: 7, team_id: 11, role: 'reserve' },
      ],
    );
    expect(grid).toEqual([
      { driverId: 1, number: 4, teamId: 10, reserve: false },
      { driverId: 2, number: 31, teamId: 10, reserve: true },
      { driverId: 3, number: 7, teamId: 11, reserve: true },
    ]);
  });

  it('ist leer ohne Aufstellung und Ergebnisse', () => {
    expect(mergeGrid([], [])).toEqual([]);
  });
});
