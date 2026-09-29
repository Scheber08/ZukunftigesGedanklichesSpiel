/**
 * Aufwärmen vor den Tests: Der Dev-Server optimiert beim ersten Aufruf der Islands (Svelte)
 * Abhängigkeiten und lädt die Seite dann neu. Das passiert hier einmal vorab, damit einzelne
 * Tests nicht mitten im Ablauf von einem Reload überrascht werden.
 */
import { chromium, type FullConfig } from '@playwright/test';

const WARMUP_PATHS = ['/', '/wertung', '/rennen/2/4', '/mitfahren', '/stewards', '/admin/login'];

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
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
