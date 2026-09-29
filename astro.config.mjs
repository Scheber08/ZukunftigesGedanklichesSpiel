// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

/**
 * Öffentliche Basis-URL der Liga. Solange die Domain nicht feststeht (Phase 0),
 * greift ein Platzhalter auf der reservierten TLD `.example`.
 */
const SITE_URL = process.env.PUBLIC_SITE_URL || 'https://liga.example';

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
        "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://challenges.cloudflare.com",
        "frame-src https://challenges.cloudflare.com https://player.twitch.tv https://www.youtube-nocookie.com",
        "object-src 'none'",
        "base-uri 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://www.googletagmanager.com', 'https://challenges.cloudflare.com'],
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
