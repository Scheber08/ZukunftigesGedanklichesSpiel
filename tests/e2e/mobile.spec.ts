/**
 * Mobil ab 320 px (Plan §10): kein horizontales Scrollen der Seite – breite Tabellen scrollen
 * in ihrem .table-wrap –, Menü als Vollbild-Overlay, Touch-Ziele mindestens 44 px.
 */
import { expect, test } from '@playwright/test';
import { demoLogin, expectNoHorizontalScroll, waitForIslands } from './helpers';

test.use({ viewport: { width: 320, height: 720 }, hasTouch: true });

const PAGES = [
  '/',
  '/kalender',
  '/wertung',
  '/rennen/2/4',
  '/fahrer',
  '/fahrer/apexanna',
  '/teams/mclaren',
  '/stewards',
  '/stewards/melden',
  '/mitfahren',
  '/news',
  '/liga/regelwerk',
  '/liga/lobby',
  '/hall-of-fame',
  '/en',
  '/en/standings',
];

test.describe('320 px ohne horizontales Scrollen', () => {
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await waitForIslands(page);
      await expectNoHorizontalScroll(page);
    });
  }

  // Plan §10: „Admin-Bereich am Handy benutzbar“ – auch Grid-Builder und Ergebnis-Eingabe am Renntag
  test('Admin: Dashboard, Runden, Grid-Builder und Ergebnis-Eingabe am Handy', async ({ page }) => {
    await demoLogin(page, 'Admin', '/admin/runden');
    await expectNoHorizontalScroll(page);
    for (const path of ['/admin', '/admin/runden/12/grid', '/admin/runden/12/ergebnisse']) {
      await page.goto(path);
      await waitForIslands(page);
      await expectNoHorizontalScroll(page);
    }
  });

  test('Admin: Steward-Eingang am Handy', async ({ page }) => {
    await demoLogin(page, 'Steward', '/admin/stewards');
    await expectNoHorizontalScroll(page);
  });

  test('Admin: News-Editor am Handy', async ({ page }) => {
    await demoLogin(page, 'Redaktion', '/admin/news/neu');
    await waitForIslands(page);
    await expectNoHorizontalScroll(page);
  });
});

// Besucher außerhalb Deutschlands sehen zusätzlich ihre Ortszeit („deine Zeit: …“) – die längeren
// Zeitangaben dürfen am Handy nichts sprengen. (Alle anderen Tests laufen in Europe/Berlin.)
test.describe('Besucher in einer anderen Zeitzone', () => {
  test.use({ timezoneId: 'America/New_York' });

  for (const [path, hint] of [
    ['/kalender', 'deine Zeit'],
    ['/rennen/2/12', 'deine Zeit'],
    ['/en/calendar', 'your time'],
  ] as const) {
    test(`${path} zeigt die Ortszeit ohne horizontales Scrollen`, async ({ page }) => {
      await page.goto(path);
      await waitForIslands(page);
      await expect(page.locator('.localtime-hint').first()).toContainText(hint);
      await expectNoHorizontalScroll(page);
    });
  }
});

test.describe('Mobiles Menü', () => {
  test('öffnet als Overlay mit Navigation und schließt wieder', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    const open = page.getByRole('button', { name: 'Menü öffnen' });
    await expect(open).toBeVisible();
    const box = await open.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await open.click();
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Kalender', exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await menu.getByRole('button', { name: 'Menü schließen' }).click();
    await expect(menu).toBeHidden();
  });

  test('Navigation über das Menü', async ({ page }) => {
    await page.goto('/');
    await waitForIslands(page);
    await page.getByRole('button', { name: 'Menü öffnen' }).click();
    await page.locator('#mobile-menu').getByRole('link', { name: 'Wertung', exact: true }).click();
    await expect(page).toHaveURL(/\/wertung$/);
  });
});

test.describe('Touch-Ziele', () => {
  test('Buttons im Anmeldeformular sind mindestens 44 px hoch', async ({ page }) => {
    await page.goto('/mitfahren');
    const submit = page.getByRole('button', { name: 'Anmeldung absenden' });
    await submit.scrollIntoViewIfNeeded();
    const box = await submit.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
