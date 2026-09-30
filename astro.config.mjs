// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { LOCALTIME_SCRIPT, TZ_SCRIPT } from './src/lib/tz-inline.mjs';

/**
 * Öffentliche Basis-URL der Liga. Solange die Domain nicht feststeht (Phase 0),
 * greift ein Platzhalter auf der reservierten TLD `.example`.
 */
const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://liga.example';

/** CSP-Hashes der beiden Inline-Skripte (Zeitzone im <head>, Ortszeit am Ende von <body>). */
const inlineHash = (/** @type {string} */ code) => /** @type {`sha256-${string}`} */ (`sha256-${createHash('sha256').update(code).digest('base64')}`);

/** Supabase-Herkunft für direkte Uploads über signierte URLs (Plan §7.5). */
const SUPABASE_ORIGIN = (() => {
  try {
    return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : '';
  } catch {
    return '';
  }
})();

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'never',
  build: {
    // `/kalender` statt `/kalender/` – passt zum `auto-trailing-slash` der Cloudflare Static Assets.
    format: 'file',
  },

  adapter: cloudflare({
    // Bilder werden im Admin-Browser verkleinert (siehe Plan §7.5) – keine Bild-Pipeline im Worker.
    imageService: 'passthrough',
  }),

  // Staff-Sitzungen laufen über Supabase-Auth-Cookies, Astro-Sessions (KV) werden nicht gebraucht.
  session: false,

  // Markdown kommt aus der DB und wird zur Laufzeit gerendert; Shiki verträgt sich nicht mit der CSP.
  markdown: {
    syntaxHighlight: false,
  },

  integrations: [svelte()],

  vite: {
    plugins: [tailwindcss()],
    // Icons werden einzeln importiert; ohne Vorbündelung löst ein neues Icon im Dev-Server
    // keine Neu-Optimierung (und damit keine veralteten Chunks) aus.
    // Laufzeit-Abhängigkeiten gleich beim Start vorbündeln: Späte Entdeckung löst im
    // Worker-Runner eine Neu-Optimierung aus, die laufende Anfragen ins Leere laufen lässt.
    optimizeDeps: {
      include: [
        'astro/content/runtime',
        '@supabase/supabase-js',
        '@supabase/ssr',
        'marked',
        'simple-icons',
        'country-flag-icons/string/3x2',
      ],
      exclude: ['@lucide/astro', '@lucide/svelte'],
    },
    ssr: { optimizeDeps: { exclude: ['@lucide/astro', '@lucide/svelte'] } },
  },

  i18n: {
    defaultLocale: 'de',
    locales: ['de', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  // Selbst gehostete Schriften (OFL) – kein Google-Fonts-CDN zur Laufzeit.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Titillium Web',
      cssVariable: '--font-titillium',
      weights: [600, 700, 900],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      display: 'swap',
      fallbacks: ['system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Inter',
      cssVariable: '--font-inter',
      weights: ['400 700'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      display: 'swap',
      fallbacks: ['system-ui', 'sans-serif'],
    },
  ],

  security: {
    checkOrigin: true,
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob: https:",
        "font-src 'self'",
        `connect-src ${[
          "'self'",
          'https://*.supabase.co',
          SUPABASE_ORIGIN,
          'https://*.google-analytics.com',
          'https://*.analytics.google.com',
          'https://www.googletagmanager.com',
          'https://challenges.cloudflare.com',
        ]
          .filter(Boolean)
          .join(' ')}`,
        "frame-src https://challenges.cloudflare.com https://player.twitch.tv https://www.youtube-nocookie.com",
        "object-src 'none'",
        "base-uri 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://www.googletagmanager.com', 'https://challenges.cloudflare.com'],
        hashes: [inlineHash(TZ_SCRIPT), inlineHash(LOCALTIME_SCRIPT)],
      },
      // Teamfarben kommen als CSS-Variable im style-Attribut aus der DB.
      styleDirective: {
        resources: ["'self'", "'unsafe-inline'"],
      },
    },
  },

  env: {
    schema: {
      PUBLIC_SITE_URL: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
      SUPABASE_URL: envField.string({ context: 'server', access: 'public', optional: true }),
      SUPABASE_ANON_KEY: envField.string({ context: 'server', access: 'public', optional: true }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      DISCORD_GUILD_ID: envField.string({ context: 'server', access: 'public', optional: true }),
      DISCORD_BOT_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Discord-Bot über Interactions-Endpunkt (Plan Phase 3): öffentlicher Schlüssel + App-ID
      DISCORD_PUBLIC_KEY: envField.string({ context: 'server', access: 'public', optional: true }),
      DISCORD_APPLICATION_ID: envField.string({ context: 'server', access: 'public', optional: true }),
      TWITCH_CLIENT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      TWITCH_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      IP_HASH_SALT: envField.string({ context: 'server', access: 'secret', optional: true }),
      GITHUB_REPOSITORY: envField.string({ context: 'server', access: 'public', optional: true }),
      GITHUB_DISPATCH_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      DEMO_MODE: envField.boolean({ context: 'server', access: 'public', optional: true, default: false }),
      SITE_NOINDEX: envField.boolean({ context: 'server', access: 'public', optional: true, default: false }),
    },
  },
});
