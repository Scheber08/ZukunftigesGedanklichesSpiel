import { describe, expect, it } from 'vitest';
import type { ContactMessageRow, RegistrationRow } from '~/lib/db/types';
import { contactEmbed, discordSafeUrl, escapeDiscord, incidentEmbed, registrationEmbed } from '~/lib/forms/discord';

const registration: RegistrationRow = {
  id: 7,
  gamertag: 'Box_Box_Bruno',
  discord_username: 'geheim.discord',
  ea_id: 'Geheim_EA',
  platform: 'playstation',
  input_device: 'wheel',
  nationality: 'DE',
  desired_number: 42,
  wanted_role: 'any',
  availability: 'regular',
  experience: 'Privat',
  reference_time: '1:29.812',
  consents: { age16: true, rules: true, at: '2026-09-29T12:00:00Z', rules_version: '1.0' },
  status: 'new',
  admin_notes: null,
  ip_hash: 'abc',
  driver_id: null,
  processed_by: null,
  processed_at: null,
  created_at: '2026-09-29T12:00:00Z',
  updated_at: '2026-09-29T12:00:00Z',
};

const message: ContactMessageRow = {
  id: 3,
  name: 'Anna',
  email: 'anna@example.org',
  subject: 'Frage [hier klicken](https://evil.example)',
  message: 'Vertraulicher Inhalt',
  status: 'new',
  ip_hash: 'abc',
  created_at: '2026-09-29T12:00:00Z',
  updated_at: '2026-09-29T12:00:00Z',
};

describe('Discord-Benachrichtigungen der Formulare', () => {
  it('Anmeldung: nur Gamertag, Plattform, Wunschnummer und Link', () => {
    const embed = registrationEmbed(registration, 'https://liga.example/admin/anmeldungen/7');
    const json = JSON.stringify(embed);
    expect(json).not.toContain('geheim.discord');
    expect(json).not.toContain('Geheim_EA');
    expect(json).not.toContain('1:29.812');
    expect(embed.title).toContain('Box\\_Box\\_Bruno');
    expect(embed.fields.map((f) => f.value)).toEqual(['PlayStation', '42', 'https://liga.example/admin/anmeldungen/7']);
  });

  it('Kontakt: keine E-Mail-Adresse und keine Nachricht, Betreff entschärft', () => {
    const embed = contactEmbed(message, 'https://liga.example/admin/kontakt/3');
    const json = JSON.stringify(embed);
    expect(json).not.toContain('anna@example.org');
    expect(json).not.toContain('Vertraulicher');
    expect(embed.fields[0]?.value).toBe('Frage \\[hier klicken\\]\\(https\\://evil.example\\)');
  });

  it('Vorfall: Runde, Session, Ort, Beteiligte, Clip und Link', () => {
    const embed = incidentEmbed({
      round: 'R4 · Miami',
      session: 'race',
      lap: 5,
      corner: 'Kurve 1',
      involved: ['#4 ApexAnna', '#22 Box_Box_Bruno'],
      clipUrl: 'https://youtu.be/abc?t=83',
      clipTimestamp: '01:23',
      adminUrl: 'https://liga.example/admin/stewards/5',
    });
    expect(embed.title).toBe('Neuer Vorfall · R4 · Miami');
    const values = embed.fields.map((f) => f.value);
    expect(values[0]).toBe('Rennen');
    expect(values[1]).toBe('Runde 5 · Kurve 1');
    expect(values[2]).toBe('#4 ApexAnna, #22 Box\\_Box\\_Bruno');
    expect(values[3]).toBe('https://youtu.be/abc?t=83 (01:23)');
    expect(values[4]).toBe('https://liga.example/admin/stewards/5');
  });

  it('Vorfall ohne Rennrunde', () => {
    const embed = incidentEmbed({
      round: 'R1 · Sakhir',
      session: 'qualifying',
      lap: null,
      corner: 'T4',
      involved: [],
      clipUrl: 'https://medal.tv/x',
      clipTimestamp: '0:12',
      adminUrl: 'https://liga.example/admin/stewards/1',
    });
    expect(embed.fields[1]?.value).toBe('T4');
    expect(embed.fields[2]?.value).toBe('–');
  });

  it('entschärft Markdown und Zeilenumbrüche', () => {
    expect(escapeDiscord('**fett**\n# Titel')).toBe('\\*\\*fett\\*\\* # Titel');
    expect(escapeDiscord('# Titel')).toBe('\\# Titel');
    expect(escapeDiscord('- Liste > Zitat')).toBe('\\- Liste > Zitat');
    expect(escapeDiscord('  a   b  ')).toBe('a b');
  });

  it('kodiert Zeichen, die in Links Markdown bilden könnten', () => {
    expect(discordSafeUrl('https://youtu.be/a[x](https://evil.example)')).toBe('https://youtu.be/a%5Bx%5D%28https://evil.example%29');
    expect(discordSafeUrl(' https://twitch.tv/videos/1 ')).toBe('https://twitch.tv/videos/1');
  });
});
