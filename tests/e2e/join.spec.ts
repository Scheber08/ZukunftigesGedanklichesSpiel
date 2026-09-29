/**
 * Anmeldung ohne Login (Plan §4.9): Formular ausfüllen und im Demo-Modus absenden.
 * Die Zeitfalle verlangt mindestens 3 s zwischen Seitenaufruf und Absenden – der Test wartet 4 s.
 * Turnstile ist im Demo-Modus ohne Secret abgeschaltet. Jede Einsendung zählt fürs Rate-Limit
 * (pro IP) – bei sehr vielen lokalen Wiederholungen gegen denselben Server den Server neu starten.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectSingleH1, waitForIslands } from './helpers';

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000)}`;

async function fillRegistration(page: Page, id: string, number: string): Promise<void> {
  await page.getByLabel('Gamertag / EA-ID').fill(`E2E_Tester_${id}`);
  await page.getByLabel('Discord-Benutzername').fill(`e2e_tester_${id}`);
  await page.getByLabel('Plattform').selectOption({ label: 'PlayStation' });
  await page.getByRole('radio', { name: 'Controller' }).check();
  await page.getByLabel('Wunsch-Startnummer').fill(number);
  await page.getByRole('radio', { name: /^Egal/ }).check();
  await page.getByRole('radio', { name: /^Regelmäßig/ }).check();
  await page.getByLabel('Erfahrung').fill('Zwei Saisons in einer anderen Liga (E2E-Test).');
  await page.getByRole('checkbox', { name: /mindestens 16/ }).check();
  await page.getByRole('checkbox', { name: /Regelwerk/ }).check();
}

test.describe('Mitfahren', () => {
  test('zeigt Voraussetzungen, Ablauf und Anmeldestatus', async ({ page }) => {
    await page.goto('/mitfahren');
    await expectSingleH1(page);
    await expect(page.getByRole('heading', { name: 'Voraussetzungen' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'So läuft die Anmeldung' })).toBeVisible();
    await expect(page.getByText('Anmeldestatus').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anmeldung absenden' })).toBeVisible();
  });

  test('jedes Pflichtfeld hat eine Beschriftung', async ({ page }) => {
    await page.goto('/mitfahren');
    const unlabeled = await page.locator('form input:not([type=hidden]), form select, form textarea').evaluateAll((els) =>
      els
        .filter((el) => {
          const input = el as HTMLInputElement;
          if (input.closest('[aria-hidden="true"]') || input.tabIndex < 0) return false; // Honeypot
          return input.labels == null || input.labels.length === 0
            ? !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')
            : false;
        })
        .map((el) => (el as HTMLInputElement).name),
    );
    expect(unlabeled).toEqual([]);
  });

  test('lehnt zu schnelles Absenden ab (Zeitfalle)', async ({ page }) => {
    const loadedAt = Date.now();
    await page.goto('/mitfahren');
    // signierter Zeitstempel für die Zeitfalle (src/lib/server/spam.ts)
    await expect(page.locator('input[name="form_ts"]')).toHaveCount(1);
    await fillRegistration(page, unique(), '58');
    // sofort absenden – so schnell wäre nur ein Bot
    test.skip(Date.now() - loadedAt > 2_500, 'Rechner zu langsam für den Zeitfallen-Test (Formular brauchte > 2,5 s)');
    await page.getByRole('button', { name: 'Anmeldung absenden' }).click();
    await expect(page.getByText(/Das ging sehr schnell/)).toBeVisible();
  });

  test('lehnt Einsendungen mit ausgefülltem Honeypot ab', async ({ page }) => {
    await page.goto('/mitfahren');
    await waitForIslands(page);
    await fillRegistration(page, unique(), '56');
    // Das Feld ist für Menschen unsichtbar (aria-hidden, tabindex=-1) – nur Bots füllen es aus
    const honeypot = page.locator('input[name="website"]');
    await expect(honeypot).toHaveCount(1);
    await honeypot.evaluate((el) => {
      (el as HTMLInputElement).value = 'https://spam.example';
    });
    await page.waitForTimeout(4_000);
    await page.getByRole('button', { name: 'Anmeldung absenden' }).click();
    await expect(page.getByText(/Deine Einsendung konnte nicht verarbeitet werden/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Wie geht es weiter?' })).toHaveCount(0);
  });

  test('Anmeldung absenden (Demo-Modus) zeigt die Bestätigung', async ({ page }) => {
    await page.goto('/mitfahren');
    await waitForIslands(page);
    const id = unique();
    await fillRegistration(page, id, '57');
    // Zeitfalle: mindestens 3 s nach dem Laden der Seite
    await page.waitForTimeout(4_000);
    await page.getByRole('button', { name: 'Anmeldung absenden' }).click();

    const success = page.getByRole('status').filter({ hasText: `E2E_Tester_${id}` });
    await expect(success).toBeVisible();
    await expect(success).toContainText('Deine Anmeldung ist da');
    await expect(page.getByRole('heading', { name: 'Wie geht es weiter?' })).toBeVisible();
    await expectSingleH1(page);
  });
});
