/**
 * Barrierefreiheit (Plan §10, WCAG 2.2 AA): axe auf den wichtigsten Seiten in beiden Sprachen,
 * jeweils nach der Hydrierung der Islands, dazu genau eine h1 pro Seite.
 */
import { expect, test } from '@playwright/test';
import { demoLogin, expectNoA11yViolations, expectSingleH1, waitForIslands, type DemoRole } from './helpers';

const PUBLIC_PAGES = [
  '/',
  '/kalender',
  '/wertung',
  '/rennen/2/4',
  '/rennen/2/5',
  '/ergebnisse',
  '/fahrer',
  '/fahrer/apexanna',
  '/teams',
  '/teams/mclaren',
  '/stewards',
  '/stewards/S2-R03-01',
  '/stewards/melden',
  '/mitfahren',
  '/news',
  '/news/saison-2-startet',
  '/liga/regelwerk',
  '/liga/lobby',
  '/liga/faq',
  '/liga/ueber-uns',
  '/hall-of-fame',
  '/archiv',
  '/kontakt',
  '/impressum',
  '/datenschutz',
  '/en',
  '/en/calendar',
  '/en/standings',
  '/en/races/2/4',
  '/en/drivers/apexanna',
  '/en/join',
  '/en/league/rules',
];

test.describe('axe – öffentliche Seiten', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} ohne WCAG-2.2-AA-Verstöße`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `HTTP-Status von ${path}`).toBe(200);
      await waitForIslands(page);
      await expectSingleH1(page);
      await expectNoA11yViolations(page);
    });
  }
});

test.describe('axe – Admin-Bereich', () => {
  test('/admin/login', async ({ page }) => {
    await page.goto('/admin/login');
    await expectSingleH1(page);
    await expectNoA11yViolations(page);
  });

  // WCAG 2.2 AA gilt auch im Admin (Plan §10, inkl. Grid-Builder und Editor). Nur lesende Aufrufe;
  // R4 der Demo-Saison (Runde 12) hat ein vorläufiges Ergebnis und bleibt vom Renntag-Test unberührt.
  const ADMIN_PAGES: Array<[DemoRole, string]> = [
    ['Admin', '/admin'],
    ['Admin', '/admin/runden'],
    ['Admin', '/admin/runden/12/grid'],
    ['Admin', '/admin/runden/12/ergebnisse'],
    ['Admin', '/admin/fahrer'],
    ['Admin', '/admin/kalender'],
    ['Admin', '/admin/anmeldungen'],
    ['Admin', '/admin/einstellungen'],
    ['Steward', '/admin/stewards'],
    ['Steward', '/admin/stewards/neu'],
    ['Redaktion', '/admin/news'],
    ['Redaktion', '/admin/news/neu'],
    ['Redaktion', '/admin/regelwerk'],
  ];

  for (const [role, path] of ADMIN_PAGES) {
    test(`${path} (Demo-${role})`, async ({ page }) => {
      await demoLogin(page, role, path);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
      await waitForIslands(page);
      await expectSingleH1(page);
      await expectNoA11yViolations(page);
    });
  }
});

test.describe('Tastatur', () => {
  test('sichtbarer Fokus auf Links und Buttons', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab'); // Skip-Link
    await page.keyboard.press('Tab'); // Logo
    const focused = page.locator(':focus');
    await expect(focused).toHaveCount(1);
    const outline = await focused.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow };
    });
    expect(outline.style !== 'none' && outline.width >= 2 ? true : outline.shadow !== 'none').toBe(true);
  });
});
