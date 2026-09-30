/**
 * Discord-Bot: Befehlsdefinitionen für die Registrierung (Discord-Regeln für Namen und Längen,
 * deutsche Lokalisierung) und kleine Nachrichten-Helfer (Sprache, Markdown, Zeitstempel, Flaggen).
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_NAMES, COMMANDS, commandKey, OPTION_NAMES } from '~/lib/discord-bot/commands';
import { colorInt, discordTimestamp, escapeMarkdown, flagEmoji, localeLang, message } from '~/lib/discord-bot/messages';

/** Discord: 1–32 Zeichen, klein, Buchstaben/Ziffern/-/_ */
const NAME_RE = /^[-_\p{L}\p{N}]{1,32}$/u;

describe('Befehlsdefinitionen', () => {
  it('vier Befehle mit gültigen Namen und deutscher Lokalisierung', () => {
    expect(COMMANDS.map((c) => c.name)).toEqual(['next-race', 'standings', 'driver', 'role']);
    expect(COMMANDS.map((c) => c.name_localizations.de)).toEqual(['naechstes-rennen', 'wertung', 'fahrer', 'rolle']);
    for (const c of COMMANDS) {
      for (const name of [c.name, ...Object.values(c.name_localizations)]) {
        expect(name).toMatch(NAME_RE);
        expect(name).toBe(name.toLowerCase());
      }
      for (const d of [c.description, ...Object.values(c.description_localizations)]) {
        expect(d.length).toBeGreaterThan(0);
        expect(d.length).toBeLessThanOrEqual(100);
      }
      expect(c.description_localizations.de).toBeTruthy();
      for (const o of c.options ?? []) {
        expect(o.name).toMatch(NAME_RE);
        expect(o.description.length).toBeLessThanOrEqual(100);
        for (const ch of o.choices ?? []) expect(ch.name.length).toBeLessThanOrEqual(100);
      }
    }
  });

  it('Optionen: art (Fahrer/Konstrukteure), name und rolle mit Autocomplete', () => {
    const byName = Object.fromEntries(COMMANDS.map((c) => [c.name, c]));
    expect(byName.standings!.options![0]).toMatchObject({ name: OPTION_NAMES.standingsType, name_localizations: { de: 'art' }, required: false });
    expect(byName.standings!.options![0]!.choices!.map((c) => c.value)).toEqual(['drivers', 'teams']);
    expect(byName.driver!.options![0]).toMatchObject({ name: OPTION_NAMES.driverName, required: true, autocomplete: true });
    expect(byName.role!.options![0]).toMatchObject({ name: OPTION_NAMES.role, name_localizations: { de: 'rolle' }, required: true, autocomplete: true });
    // Rollen nur auf dem Server, nicht per Direktnachricht
    expect(byName.role!.contexts).toEqual([0]);
  });

  it('commandKey kennt Standard- und deutsche Namen', () => {
    expect(commandKey(COMMAND_NAMES.nextRace)).toBe('nextRace');
    expect(commandKey('naechstes-rennen')).toBe('nextRace');
    expect(commandKey('wertung')).toBe('standings');
    expect(commandKey('rolle')).toBe('role');
    expect(commandKey('ban')).toBeNull();
    expect(commandKey(undefined)).toBeNull();
  });
});

describe('Nachrichten-Helfer', () => {
  it('Sprache: de* → Deutsch, sonst Englisch', () => {
    expect(localeLang('de')).toBe('de');
    expect(localeLang('de-AT')).toBe('de');
    expect(localeLang('en-US')).toBe('en');
    expect(localeLang('fr')).toBe('en');
    expect(localeLang(undefined)).toBe('en');
  });

  it('Markdown-Zeichen in Gamertags werden maskiert', () => {
    expect(escapeMarkdown('Slipstream_Sam')).toBe('Slipstream\\_Sam');
    expect(escapeMarkdown('**x** ~~y~~ `z` |a| >b')).toBe('\\*\\*x\\*\\* \\~\\~y\\~\\~ \\`z\\` \\|a\\| \\>b');
    expect(escapeMarkdown('[klick](https://evil.example)')).toBe('\\[klick\\](https://evil.example)');
    expect(escapeMarkdown('<@123>')).toBe('\\<@123\\>');
    expect(escapeMarkdown('Box-Box Bruno')).toBe('Box-Box Bruno');
  });

  it('Discord-Zeitstempel und Flaggen-Emoji', () => {
    expect(discordTimestamp('2026-10-07T18:00:00.000Z', 'F')).toBe('<t:1791396000:F>');
    expect(discordTimestamp('2026-10-07T18:00:00.000Z', 'R')).toBe('<t:1791396000:R>');
    expect(discordTimestamp('kaputt')).toBe('');
    expect(flagEmoji('de')).toBe(String.fromCodePoint(0x1f1e9, 0x1f1ea));
    expect(flagEmoji('XYZ')).toBe('');
    expect(flagEmoji(null)).toBe('');
  });

  it('Teamfarbe als Embed-Farbe, sonst Liga-Grün', () => {
    expect(colorInt('#FF8000')).toBe(0xff8000);
    expect(colorInt('rot')).toBe(0x37be89);
  });

  it('jede Nachricht verbietet Pings; ephemer setzt Flag 64', () => {
    expect(message({ content: '@everyone' })).toEqual({ type: 4, data: { content: '@everyone', allowed_mentions: { parse: [] } } });
    expect(message({ content: 'x' }, true).data).toMatchObject({ flags: 64, allowed_mentions: { parse: [] } });
  });
});
