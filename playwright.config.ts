/**
 * Playwright – Browser-Tests der Hauptabläufe (Plan §7.6) mit axe-Prüfung (WCAG 2.2 AA).
 *
 * Getestet wird der PRODUKTIONS-BUILD im Demo-Modus: `astro build` (DEMO_MODE=true) und danach
 * `astro preview` auf Port 4322 (Cloudflare-Worker lokal über workerd). So sieht der Test genau
 * das, was ausgeliefert wird – statische Seiten plus Worker für Formulare, Admin und APIs –, und
 * kommt einem laufenden `npm run dev` (Port 4321) nicht in die Quere: Astro 7 erlaubt nur EINEN
 * Dev-Server pro Projekt, ein zweiter `astro dev` würde abgelehnt.
 *
 * Folge für die Admin-Tests: Öffentliche Seiten sind (wie in Produktion) beim Build eingefroren.
 * Veröffentlichungen im Admin fordern nur einen Rebuild an; die Wirkung auf die Wertung prüft der
 * Test deshalb über die serverseitige Wertungs-Vorschau im Admin (siehe admin-raceday.spec.ts).
 *
 *   npm run test:e2e                                         Build + Preview auf :4322
 *   E2E_SKIP_BUILD=true npm run test:e2e                     vorhandenen Build in dist/ benutzen
 *   E2E_BASE_URL=http://localhost:4322 npm run test:e2e      gegen einen laufenden Preview-Server
 *   E2E_BASE_URL=http://localhost:4321 E2E_LIVE=true …       gegen einen Dev-Server (öffentliche
 *                                                            Seiten werden dort live gerendert)
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4322);
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);
const skipBuild = process.env.E2E_SKIP_BUILD === 'true';

// Eigene Astro-Konfiguration nur mit separatem Vite-Cache (siehe tests/e2e/astro.config.e2e.mjs),
// damit der Build die vorgebündelten Module eines laufenden Dev-Servers nicht austauscht.
const config = '--config tests/e2e/astro.config.e2e.mjs';
// --ignore-lock: kein Konflikt mit einem anderen Preview-/Dev-Server und kein automatisches
// Wechseln in den Hintergrund (Astro erkennt KI-Agenten und würde den Server sonst abkoppeln).
const preview = `npx astro preview ${config} --port ${PORT} --host 127.0.0.1 --ignore-lock`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : 3,
  reporter: CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: external
    ? undefined
    : {
        command: skipBuild ? preview : `npx astro build ${config} && ${preview}`,
        url: `${baseURL}/`,
        env: { DEMO_MODE: 'true', SITE_NOINDEX: 'true', ASTRO_TELEMETRY_DISABLED: '1' },
        reuseExistingServer: !CI,
        // Build (ca. 1–3 Minuten) + Start von workerd
        timeout: 420_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
