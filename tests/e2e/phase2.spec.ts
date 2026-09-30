/**
 * Phase 2/3 (Plan §12): Streckenseiten, Head-to-Head, Stream-Overlays und ihre Live-Daten,
 * Discord-Interactions-Endpunkt. Nur lesend gegen den Demo-Modus.
 */
import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, expectNoHorizontalScroll, expectSingleH1 } from './helpers';

test.describe('Streckenseiten', () => {
  test('Übersicht verlinkt Strecken mit Rekorden', async ({ page }) => {
    await page.goto('/strecken');
    await expectSingleH1(page);
    const first = page.locator('main a[href^="/strecken/"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/strecken\/[a-z0-9-]+$/);
    await expectSingleH1(page);
    await expect(page.locator('main table').first()).toBeVisible();
  });

  test('englische Übersicht', async ({ page }) => {
    const response = await page.goto('/en/tracks');
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('Head-to-Head', () => {
  test('Vergleich zweier Fahrer per Link, teilbar über die URL', async ({ page }) => {
    await page.goto('/fahrer/vergleich?a=apexanna&b=kurvenkoenig');
    await expectSingleH1(page);
    await expect(page.locator('#h2h-a')).toHaveValue('apexanna');
    await expect(page.locator('#h2h-b')).toHaveValue('kurvenkoenig');
    const table = page.locator('[data-h2h-output] table').first();
    await expect(table).toBeVisible();
    await expect(table.locator('caption')).toContainText('ApexAnna');
    await expectNoA11yViolations(page);
  });

  test('am Handy ohne horizontales Scrollen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/en/drivers/compare?a=apexanna&b=kurvenkoenig');
    await expect(page.locator('[data-h2h-output] table').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('Stream-Overlays', () => {
  for (const name of ['naechstes-rennen', 'aufstellung', 'wertung', 'ergebnis', 'ticker']) {
    test(`/overlay/${name} liefert Seite und Live-Daten`, async ({ page, request }) => {
      const response = await page.goto(`/overlay/${name}?lang=de`);
      expect(response?.status()).toBe(200);
      expect(response?.headers()['x-robots-tag']).toContain('noindex');
      const api = await request.get(`/api/overlay/${name}.json?lang=de`);
      expect(api.status()).toBe(200);
      expect(api.headers()['content-type']).toContain('application/json');
      const json = await api.json();
      expect(json).toBeTruthy();
      // keine privaten Felder in den Live-Daten
      expect(JSON.stringify(json)).not.toMatch(/discord_username|ea_id|email|admin_notes/);
    });
  }

  test('unbekanntes Overlay ergibt 404', async ({ request }) => {
    expect((await request.get('/overlay/gibt-es-nicht')).status()).toBe(404);
  });
});

test.describe('Discord-Bot', () => {
  test('Interactions-Endpunkt lehnt unsignierte Anfragen ab', async ({ request }) => {
    const res = await request.post('/api/discord/interactions', { data: { type: 1 } });
    // ohne DISCORD_PUBLIC_KEY 404, mit Schlüssel 401 – nie 200 ohne gültige Signatur
    expect([401, 404]).toContain(res.status());
  });
});
