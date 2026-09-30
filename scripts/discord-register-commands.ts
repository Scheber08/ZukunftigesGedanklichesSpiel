/**
 * Registriert die Slash-Befehle des Liga-Bots bei Discord (Plan Phase 3):
 * /naechstes-rennen, /wertung, /fahrer, /rolle (Definitionen: src/lib/discord-bot/commands.ts).
 *
 * Aufruf (Node 22.6+ mit Type-Stripping):
 *   DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… npm run discord:register
 *        → global (alle Server, bis zu ~1 h bis sichtbar)
 *   npm run discord:register -- --guild 123456789012345678
 *        → nur auf einem Server (sofort sichtbar, zum Testen)
 *   npm run discord:register -- --guild 123456789012345678 --clear
 *        → Befehle auf dem Test-Server wieder entfernen (sonst doppelt neben den globalen)
 *   npm run discord:register -- --dry-run
 *        → nur ausgeben, was gesendet würde (ohne Token)
 *
 * PUT ersetzt die komplette Befehlsliste: alte, nicht mehr definierte Befehle verschwinden.
 * Die Werte kommen aus der Umgebung (z. B. `.dev.vars` bzw. Shell), nie aus dem Repository.
 */

import { COMMANDS } from '../src/lib/discord-bot/commands.ts';

const API = 'https://discord.com/api/v10';

interface Args {
  guild: string | null;
  dryRun: boolean;
  clear: boolean;
  help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { guild: null, dryRun: false, clear: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--guild' || a === '-g') args.guild = argv[++i] ?? '';
    else if (a.startsWith('--guild=')) args.guild = a.slice('--guild='.length);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--clear') args.clear = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unbekanntes Argument: ${a}`);
  }
  return args;
}

const SNOWFLAKE = /^\d{17,20}$/;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Aufruf: npm run discord:register [-- --guild <Server-ID>] [--clear] [--dry-run]');
    console.log('Umgebung: DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN');
    return;
  }
  if (args.guild != null && !SNOWFLAKE.test(args.guild)) throw new Error('--guild erwartet eine Server-ID (17–20 Ziffern).');

  const commands = args.clear ? [] : COMMANDS;
  if (args.dryRun) {
    console.log(JSON.stringify(commands, null, 2));
    console.log(`\n${commands.length} Befehle (Probelauf, nichts gesendet).`);
    return;
  }

  const appId = process.env.DISCORD_APPLICATION_ID?.trim();
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!appId || !SNOWFLAKE.test(appId)) throw new Error('DISCORD_APPLICATION_ID fehlt oder ist ungültig (Developer Portal → General Information → Application ID).');
  if (!token) throw new Error('DISCORD_BOT_TOKEN fehlt (Developer Portal → Bot → Reset Token).');

  const target = args.guild ? `${API}/applications/${appId}/guilds/${args.guild}/commands` : `${API}/applications/${appId}/commands`;
  const res = await fetch(target, {
    method: 'PUT',
    headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Discord antwortet ${res.status}: ${text.slice(0, 2000)}`);
  }
  const created = JSON.parse(text) as Array<{ name: string; name_localizations?: Record<string, string> | null }>;
  const where = args.guild ? `auf Server ${args.guild}` : 'global';
  if (args.clear) {
    console.log(`✓ Alle Befehle ${where} entfernt.`);
    return;
  }
  console.log(`✓ ${created.length} Befehle ${where} registriert:`);
  for (const c of created) console.log(`  /${c.name}${c.name_localizations?.de ? `  (DE: /${c.name_localizations.de})` : ''}`);
  if (!args.guild) console.log('Globale Befehle können bis zu einer Stunde brauchen, bis sie überall erscheinen.');
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
