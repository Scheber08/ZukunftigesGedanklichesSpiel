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

  test('Admin-Dashboard und Rundenliste am Handy', async ({ page }) => {
    await demoLogin(page, 'Admin', '/admin/runden');
    await expectNoHorizontalScroll(page);
    await page.goto('/admin');
    await expectNoHorizontalScroll(page);
  });
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
