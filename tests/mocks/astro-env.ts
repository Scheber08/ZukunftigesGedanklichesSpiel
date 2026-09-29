/**
 * Ersatz für die virtuellen Module `astro:env/server` und `astro:env/client` in Vitest
 * (Alias in vitest.config.ts). Die Werte kommen beim Laden aus process.env und lassen sich
 * in Tests mit `setMockEnv()` ändern – ES-Module-Exports sind Live-Bindings, Funktionen wie
 * `isDemoMode()` sehen die Änderung sofort. Achtung: `env` aus src/lib/server/env.ts kopiert
 * die Werte beim ersten Import; dort Felder direkt setzen (z. B. `env.ipHashSalt = '…'`).
 */

const str = (v: string | undefined): string | undefined => (v == null || v === '' ? undefined : v);
const bool = (v: string | undefined): boolean => v === 'true' || v === '1';

export let PUBLIC_SITE_URL = str(process.env.PUBLIC_SITE_URL);
export let PUBLIC_TURNSTILE_SITE_KEY = str(process.env.PUBLIC_TURNSTILE_SITE_KEY);
export let SUPABASE_URL = str(process.env.SUPABASE_URL);
export let SUPABASE_ANON_KEY = str(process.env.SUPABASE_ANON_KEY);
export let SUPABASE_SERVICE_ROLE_KEY = str(process.env.SUPABASE_SERVICE_ROLE_KEY);
export let DISCORD_GUILD_ID = str(process.env.DISCORD_GUILD_ID);
export let DISCORD_BOT_TOKEN = str(process.env.DISCORD_BOT_TOKEN);
export let TWITCH_CLIENT_ID = str(process.env.TWITCH_CLIENT_ID);
export let TWITCH_CLIENT_SECRET = str(process.env.TWITCH_CLIENT_SECRET);
export let TURNSTILE_SECRET_KEY = str(process.env.TURNSTILE_SECRET_KEY);
export let IP_HASH_SALT = str(process.env.IP_HASH_SALT);
export let GITHUB_REPOSITORY = str(process.env.GITHUB_REPOSITORY);
export let GITHUB_DISPATCH_TOKEN = str(process.env.GITHUB_DISPATCH_TOKEN);
export let DEMO_MODE = bool(process.env.DEMO_MODE);
export let SITE_NOINDEX = bool(process.env.SITE_NOINDEX);

export interface MockEnv {
  PUBLIC_SITE_URL?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_BOT_TOKEN?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  IP_HASH_SALT?: string;
  GITHUB_REPOSITORY?: string;
  GITHUB_DISPATCH_TOKEN?: string;
  DEMO_MODE?: boolean;
  SITE_NOINDEX?: boolean;
}

/** Einzelne Werte für einen Test setzen (undefined = Variable nicht gesetzt). */
export function setMockEnv(values: MockEnv): void {
  if ('PUBLIC_SITE_URL' in values) PUBLIC_SITE_URL = values.PUBLIC_SITE_URL;
  if ('PUBLIC_TURNSTILE_SITE_KEY' in values) PUBLIC_TURNSTILE_SITE_KEY = values.PUBLIC_TURNSTILE_SITE_KEY;
  if ('SUPABASE_URL' in values) SUPABASE_URL = values.SUPABASE_URL;
  if ('SUPABASE_ANON_KEY' in values) SUPABASE_ANON_KEY = values.SUPABASE_ANON_KEY;
  if ('SUPABASE_SERVICE_ROLE_KEY' in values) SUPABASE_SERVICE_ROLE_KEY = values.SUPABASE_SERVICE_ROLE_KEY;
  if ('DISCORD_GUILD_ID' in values) DISCORD_GUILD_ID = values.DISCORD_GUILD_ID;
  if ('DISCORD_BOT_TOKEN' in values) DISCORD_BOT_TOKEN = values.DISCORD_BOT_TOKEN;
  if ('TWITCH_CLIENT_ID' in values) TWITCH_CLIENT_ID = values.TWITCH_CLIENT_ID;
  if ('TWITCH_CLIENT_SECRET' in values) TWITCH_CLIENT_SECRET = values.TWITCH_CLIENT_SECRET;
  if ('TURNSTILE_SECRET_KEY' in values) TURNSTILE_SECRET_KEY = values.TURNSTILE_SECRET_KEY;
  if ('IP_HASH_SALT' in values) IP_HASH_SALT = values.IP_HASH_SALT;
  if ('GITHUB_REPOSITORY' in values) GITHUB_REPOSITORY = values.GITHUB_REPOSITORY;
  if ('GITHUB_DISPATCH_TOKEN' in values) GITHUB_DISPATCH_TOKEN = values.GITHUB_DISPATCH_TOKEN;
  if ('DEMO_MODE' in values) DEMO_MODE = values.DEMO_MODE ?? false;
  if ('SITE_NOINDEX' in values) SITE_NOINDEX = values.SITE_NOINDEX ?? false;
}
