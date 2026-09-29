/**
 * Gemeinsame Helfer für die E2E-Tests: axe (WCAG 2.2 AA), Überschriften, horizontales
 * Scrollen, Demo-Login und das Warten auf Svelte-Islands.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** axe-Regelsätze bis WCAG 2.2 AA (Plan §10). */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/** Prüft die Seite mit axe; meldet Verstöße lesbar (Regel, Wirkung, betroffene Elemente). */
export async function expectNoA11yViolations(page: Page, options: { exclude?: string[] } = {}): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const report = violations.map(
    (v) =>
      `${v.id} [${v.impact ?? 'n/a'}] ${v.help} → ${v.nodes
        .slice(0, 4)
        .map((n) => n.target.join(' '))
        .join(' | ')}${v.nodes.length > 4 ? ` (+${v.nodes.length - 4})` : ''}`,
  );
  expect(report, `axe-Verstöße auf ${new URL(page.url()).pathname}`).toEqual([]);
}

/** Genau eine h1 pro Seite (Plan §10). */
export async function expectSingleH1(page: Page): Promise<void> {
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toBeVisible();
}

/** Die Seite darf nicht breiter als das Fenster sein (Tabellen scrollen in .table-wrap). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > doc.clientWidth + 1 && getComputedStyle(el).position !== 'fixed';
      })
      .filter((el) => !el.closest('.table-wrap, [data-scroll-x]'))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].slice(0, 3).join('.')}`);
    return { extra: doc.scrollWidth - doc.clientWidth, offenders };
  });
  expect(overflow.extra, `horizontal scrollbar – zu breit: ${overflow.offenders.join(', ')}`).toBeLessThanOrEqual(0);
}

/** Wartet, bis alle Astro-Islands hydriert sind (Astro entfernt dann das ssr-Attribut). */
export async function waitForIslands(page: Page): Promise<void> {
  await page.waitForFunction(() => [...document.querySelectorAll('astro-island')].every((el) => !el.hasAttribute('ssr')), null, {
    timeout: 20_000,
  });
}

export type DemoRole = 'Admin' | 'Steward' | 'Redaktion';

/** Demo-Login (nur im Demo-Modus) über die Knöpfe auf /admin/login. */
export async function demoLogin(page: Page, role: DemoRole, next = '/admin'): Promise<void> {
  await page.goto(`/admin/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('button', { name: new RegExp(`Als Demo-${role}`) }).click();
  await expect(page).not.toHaveURL(/\/admin\/login/);
}

/** Punkte eines Fahrers aus der Fahrerwertung (/wertung) lesen. */
export async function standingsPoints(page: Page, gamertag: string): Promise<number | null> {
  const table = page.getByRole('table', { name: /^Fahrerwertung/ });
  await expect(table).toBeVisible();
  const headers = (await table.locator('thead th').allInnerTexts()).map((h) => h.trim());
  const pointsIndex = headers.findIndex((h) => /^Punkte$/i.test(h));
  if (pointsIndex < 0) throw new Error(`Spalte „Punkte“ nicht gefunden: ${headers.join(', ')}`);
  const row = table.locator('tbody tr').filter({ hasText: gamertag }).first();
  if ((await row.count()) === 0) return null;
  const cells = row.locator('th, td');
  const text = (await cells.nth(pointsIndex).innerText()).replace(/[^\d-]/g, '');
  return text === '' ? null : Number(text);
}
