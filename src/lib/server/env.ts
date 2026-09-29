/**
 * Serverseitige Konfiguration. Secrets kommen aus den Worker-Secrets (`wrangler secret put`)
 * bzw. lokal aus `.dev.vars`/`.env` – niemals ins Client-Bundle.
 */
import {
  DEMO_MODE,
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  GITHUB_DISPATCH_TOKEN,
  GITHUB_REPOSITORY,
  IP_HASH_SALT,
  SITE_NOINDEX,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  TURNSTILE_SECRET_KEY,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
} from 'astro:env/server';

export const env = {
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_ANON_KEY,
  supabaseServiceKey: SUPABASE_SERVICE_ROLE_KEY,
  discordGuildId: DISCORD_GUILD_ID,
  discordBotToken: DISCORD_BOT_TOKEN,
  twitchClientId: TWITCH_CLIENT_ID,
  twitchClientSecret: TWITCH_CLIENT_SECRET,
  turnstileSecret: TURNSTILE_SECRET_KEY,
  ipHashSalt: IP_HASH_SALT,
  githubRepository: GITHUB_REPOSITORY,
  githubDispatchToken: GITHUB_DISPATCH_TOKEN,
  noindex: SITE_NOINDEX ?? false,
};

/**
 * Demo-Modus: In-Memory-Daten statt Supabase. Aktiv, wenn DEMO_MODE=true gesetzt ist
 * oder (nur in der Entwicklung) keine Supabase-URL konfiguriert ist.
 */
export function isDemoMode(): boolean {
  if (DEMO_MODE) return true;
  if (!SUPABASE_URL) {
    if (import.meta.env.DEV) return true;
    throw new Error(
      'SUPABASE_URL ist nicht gesetzt. Für einen Build mit Demo-Daten DEMO_MODE=true setzen (siehe .env.example).',
    );
  }
  return false;
}
