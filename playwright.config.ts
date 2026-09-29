/**
 * Playwright – Browser-Tests der Hauptabläufe (Plan §7.6) mit axe-Prüfung (WCAG 2.2 AA).
 *
 * Standard: Playwright startet einen EIGENEN Dev-Server im Demo-Modus auf Port 4322 – so kommt er
 * einem laufenden `npm run dev` (Port 4321) nicht in die Quere, und die Admin-Tests verändern nur
 * die Demo-Daten dieses Test-Servers. Der Dev-Server (statt Build + Preview) ist Absicht: Im
 * Demo-Modus rendert er öffentliche Seiten live aus dem Speicher, sodass ein im Admin
 * veröffentlichtes Ergebnis sofort in der Wertung sichtbar ist.
 *
 *   npm run test:e2e                              eigener Server auf :4322
 *   E2E_BASE_URL=http://localhost:4321 npm run test:e2e   gegen einen laufenden Server
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4322);
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);

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
        command: `npx astro dev --port ${PORT} --host 127.0.0.1`,
        url: `${baseURL}/`,
        env: { DEMO_MODE: 'true', SITE_NOINDEX: 'true', ASTRO_TELEMETRY_DISABLED: '1' },
        reuseExistingServer: !CI,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
