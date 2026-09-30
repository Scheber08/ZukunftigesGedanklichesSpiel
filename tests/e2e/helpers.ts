/**
 * Gemeinsame Helfer für die E2E-Tests: axe (WCAG 2.2 AA), Überschriften, horizontales
 * Scrollen, Demo-Login und das Warten auf Svelte-Islands.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

/** axe-Regelsätze bis WCAG 2.2 AA (Plan §10). */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/**
 * Endzustand der Seite herstellen, wie ihn Besucher nach dem Scrollen sehen: Scroll-Einblendungen
 * (`[data-reveal]`, starten mit Deckkraft 0) auslösen und alle endlichen Animationen/Übergänge
 * abwarten. Sonst misst axe Kontraste mitten im Einblenden (halbe Deckkraft) oder überspringt
 * noch unsichtbare Abschnitte. Endlos-Animationen (Logo-Glow) laufen weiter.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (const el of document.querySelectorAll('[data-reveal]')) el.classList.add('is-visible');
    // Übergänge starten erst im nächsten Frame
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const finite = document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime ?? Infinity));
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
  });
}

/** Prüft die Seite mit axe; meldet Verstöße lesbar (Regel, Wirkung, betroffene Elemente). */
export async function expectNoA11yViolations(page: Page, options: { exclude?: string[] } = {}): Promise<void> {
  await settleAnimations(page);
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

/**
 * Genau eine h1 pro Seite (Plan §10). Gezählt wird das Dokument selbst: Playwright-Locators
 * durchdringen Shadow-DOM, und gegen den Dev-Server (E2E_LIVE) bringt die Astro-Dev-Toolbar
 * eigene h1 in ihrem Shadow-DOM mit. Unsere Seiten und Islands nutzen kein Shadow-DOM.
 */
export async function expectSingleH1(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('h1').length), { message: 'Anzahl h1 im Dokument' }).toBe(1);
  // Die Toolbar hängt am Ende von <body> – die erste h1 ist die der Seite
  await expect(page.locator('h1').first()).toBeVisible();
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

/**
 * Wartet, bis alle Astro-Islands hydriert sind (Astro entfernt dann das ssr-Attribut).
 *
 * Erst muss das Dokument vollständig geparst sein: Direkt nach einer Weiterleitung (z. B. dem
 * Demo-Login) ist die neue URL schon gesetzt, das HTML aber noch nicht da. Ohne diese Bedingung
 * fände die Prüfung noch KEINE Islands und wäre sofort „erfüllt“ – der Test klickte dann auf das
 * serverseitig gerenderte, noch nicht hydrierte Markup (unter Last flaky, z. B. der
 * Grid-Builder-Tastaturtest). `min` verlangt zusätzlich eine Mindestanzahl Islands.
 */
export async function waitForIslands(page: Page, options: { min?: number } = {}): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForFunction(
    (min) => {
      if (document.readyState !== 'complete') return false;
      const islands = [...document.querySelectorAll('astro-island')];
      return islands.length >= min && islands.every((el) => !el.hasAttribute('ssr'));
    },
    options.min ?? 0,
    { timeout: 20_000 },
  );
}

/**
 * Sichtbare Erfolgsmeldung (`.alert-success`). Der Text steht zusätzlich in einer sr-only-Live-Region
 * (role="status") für Screenreader – getByText allein fände deshalb zwei Elemente.
 */
export function successAlert(page: Page, text: RegExp): Locator {
  return page.locator('.alert-success').filter({ hasText: text });
}

/** Tab einer Tab-Leiste öffnen (Rennseite, Wertung) – Inhalte anderer Tabs sind verborgen. */
export async function openTab(page: Page, name: string | RegExp): Promise<void> {
  const tab = page.getByRole('tab', { name, exact: typeof name === 'string' });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

export type DemoRole = 'Admin' | 'Steward' | 'Redaktion';

/**
 * Demo-Login (nur im Demo-Modus) über die Knöpfe auf /admin/login. Kehrt erst zurück, wenn die
 * Zielseite nach der Weiterleitung vollständig geladen ist (nicht schon beim URL-Wechsel).
 */
export async function demoLogin(page: Page, role: DemoRole, next = '/admin'): Promise<void> {
  await page.goto(`/admin/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('button', { name: `Als Demo-${role} anmelden`, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/admin/login'), { waitUntil: 'load' });
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
