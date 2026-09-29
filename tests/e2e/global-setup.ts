/**
 * Vor den Tests:
 *  1. Sicherheitsnetz: Die Tests legen Anmeldungen, Aufstellungen, Ergebnisse und Urteile an. Sie
 *     laufen deshalb NUR gegen einen Server im Demo-Modus (In-Memory-Daten) – nie gegen eine
 *     Website mit echter Datenbank. Erkennbar am Demo-Login auf /admin/login.
 *  2. Aufwärmen: Der erste Aufruf startet die Worker-Laufzeit (workerd) bzw. lässt einen
 *     Dev-Server Abhängigkeiten optimieren. Das passiert hier einmal vorab, damit einzelne Tests
 *     nicht an Kaltstart-Zeiten oder einem Reload mitten im Ablauf scheitern.
 */
import { chromium, type FullConfig } from '@playwright/test';

const WARMUP_PATHS = ['/', '/wertung', '/rennen/2/4', '/mitfahren', '/stewards', '/admin/login'];

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });

    const login = await page.goto('/admin/login', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const demo = await page.getByRole('button', { name: /^Als Demo-/ }).count();
    if (!login?.ok() || demo === 0) {
      throw new Error(
        `E2E-Tests verändern Daten und laufen nur gegen den Demo-Modus – ${baseURL} zeigt keinen Demo-Login ` +
          `(HTTP ${login?.status() ?? '–'}). Build/Server mit DEMO_MODE=true starten.`,
      );
    }

    for (const path of WARMUP_PATHS) {
      try {
        await page.goto(path, { waitUntil: 'networkidle', timeout: 90_000 });
      } catch {
        // Aufwärmen ist best effort – die Tests melden echte Fehler selbst
      }
    }
  } finally {
    await browser.close();
  }
}
