/**
 * Öffentliche Seiten (Demo-Daten): Startseite mit Countdown, Navigation und Sprachumschalter
 * DE/EN, Kalender mit ICS-Abo, Rennseite, Wertung, Fahrerprofil und Stewards-Register.
 * Selektoren über Rollen, Beschriftungen und sichtbaren Text (Plan §7.6).
 */
import { expect, test } from '@playwright/test';
import { expectSingleH1, openTab, waitForIslands } from './helpers';

test.describe('Startseite', () => {
  test('zeigt Hero, genau eine h1 und einen laufenden Countdown', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expectSingleH1(page);

    const countdown = page.locator('.countdown');
    await expect(countdown).toBeVisible();
    await expect(countdown.getByText('Nächstes Rennen')).toBeVisible();
    // Rennen heißen „R5 · Strecke“ (roundLabel), keine offiziellen Event-Titel
    await expect(countdown.getByRole('link', { name: /^R\d+ · / })).toBeVisible();

    // Nach der Hydrierung stehen Ziffern statt Platzhaltern – und sie laufen
    await waitForIslands(page);
    const seconds = countdown.locator('.value').nth(3);
    await expect(seconds).toHaveText(/^\d{2}$/);
    const first = await seconds.innerText();
    await expect(seconds).not.toHaveText(first, { timeout: 5_000 });

    await expect(page.getByRole('link', { name: 'Mitfahren' }).first()).toBeVisible();
  });

  test('verlinkt das letzte Rennen und die Wertung', async ({ page }) => {
    await page.goto('/');
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: /R\d+ · / }).first()).toBeVisible();
    await expect(main.locator('a[href="/wertung"]').first()).toBeVisible();
  });

  test('englische Startseite unter /en', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectSingleH1(page);
    await expect(page.locator('.countdown').getByText('Next race')).toBeVisible();
  });
});

test.describe('Navigation und Sprachumschalter', () => {
  test('Hauptnavigation führt zu Kalender, Wertung und Stewards', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' }).first();

    await nav.getByRole('link', { name: 'Kalender', exact: true }).click();
    await expect(page).toHaveURL(/\/kalender$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rennkalender');

    await page.getByRole('navigation', { name: 'Hauptnavigation' }).first().getByRole('link', { name: 'Wertung', exact: true }).click();
    await expect(page).toHaveURL(/\/wertung$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Wertung');

    await page.getByRole('navigation', { name: 'Hauptnavigation' }).first().getByRole('link', { name: 'Stewards', exact: true }).click();
    await expect(page).toHaveURL(/\/stewards$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stewards');
  });

  const pairs: Array<[string, string]> = [
    ['/', '/en'],
    ['/kalender', '/en/calendar'],
    ['/wertung', '/en/standings'],
    ['/rennen/2/4', '/en/races/2/4'],
    ['/fahrer/apexanna', '/en/drivers/apexanna'],
    ['/stewards/S2-R03-01', '/en/stewards/S2-R03-01'],
    ['/liga/regelwerk', '/en/league/rules'],
    ['/mitfahren', '/en/join'],
  ];

  for (const [de, en] of pairs) {
    test(`Sprachumschalter ${de} ⇄ ${en} führt zur entsprechenden Seite`, async ({ page }) => {
      await page.goto(de);
      // hreflang-Alternativen im Kopf (Plan §4.1)
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', new RegExp(`${en.replace(/\//g, '\\/')}$`));
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);

      const toEnglish = page.getByRole('banner').locator('a[hreflang="en"]').first();
      await expect(toEnglish).toHaveAttribute('href', en);
      await toEnglish.click();
      await expect(page).toHaveURL(new RegExp(`${en.replace(/\//g, '\\/')}$`));
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expectSingleH1(page);

      const toGerman = page.getByRole('banner').locator('a[hreflang="de"]').first();
      await expect(toGerman).toHaveAttribute('href', de);
      await toGerman.click();
      await expect(page).toHaveURL(new RegExp(`${de === '/' ? '/$' : `${de.replace(/\//g, '\\/')}$`}`));
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    });
  }

  test('Skip-Link springt zum Inhalt', async ({ page }) => {
    await page.goto('/kalender');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Zum Inhalt springen' });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });

  test('unbekannte Adresse zeigt die 404-Seite der Liga', async ({ page }) => {
    const response = await page.goto('/gibt-es-nicht-xyz');
    expect(response?.status()).toBe(404);
    await expectSingleH1(page);
    await expect(page.getByRole('link', { name: /Startseite|Kalender/ }).first()).toBeVisible();
  });
});

test.describe('Kalender', () => {
  test('listet Runden mit Status und bietet das ICS-Abo', async ({ page }) => {
    await page.goto('/kalender');
    await expectSingleH1(page);
    await expect(page.getByRole('heading', { name: 'Nächste Runde' })).toBeVisible();
    await expect(page.getByText(/R5 · /).first()).toBeVisible();
    const subscribe = page.getByRole('link', { name: 'Kalender abonnieren' }).first();
    await expect(subscribe).toHaveAttribute('href', /^webcal:\/\/.+\/kalender\.ics$/);
  });

  test('kalender.ics ist ein gültiger Kalender mit Zeitzone', async ({ request }) => {
    const res = await request.get('/kalender.ics');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/calendar');
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toMatch(/Europe\/Berlin/);
    expect(body).toMatch(/SUMMARY:R\d+ · /);
  });
});

test.describe('Rennseite', () => {
  test('vorläufiges Ergebnis mit Protestfrist, Qualifying und Rennen', async ({ page }) => {
    await page.goto('/rennen/2/4');
    await expectSingleH1(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^R4 · /);
    await expect(page.getByText(/vorläufig/i).first()).toBeVisible();
    await expect(page.getByText(/Protestfrist/).first()).toBeVisible();

    // Mit Ergebnis ist der Tab „Rennen“ vorausgewählt
    await expect(page.getByRole('tab', { name: 'Rennen', exact: true })).toHaveAttribute('aria-selected', 'true');
    const race = page.getByRole('table', { name: /^Rennen – R4/ });
    await expect(race).toBeVisible();
    expect(await race.locator('tbody tr').count()).toBeGreaterThanOrEqual(20);

    await openTab(page, 'Qualifying');
    const quali = page.getByRole('table', { name: /^Qualifying – R4/ });
    await expect(quali).toBeVisible();
    await expect(race).toBeHidden();
    // Pole mit Kürzel „P“, nicht nur farbig (Plan §3.2)
    const pole = quali.getByTitle('Pole-Position');
    await expect(pole).toHaveCount(1);
    await expect(pole).toHaveText('P');
  });

  test('geplante Runde zeigt noch kein Ergebnis', async ({ page }) => {
    await page.goto('/rennen/2/12');
    await expectSingleH1(page);
    // auch nicht in einem verborgenen Tab
    await expect(page.locator('table caption').filter({ hasText: /^(Rennen|Qualifying|Sprint) – / })).toHaveCount(0);
  });
});

test.describe('Wertung', () => {
  test('Fahrer- und Konstrukteurswertung der aktuellen Saison', async ({ page }) => {
    await page.goto('/wertung');
    await expectSingleH1(page);
    const drivers = page.getByRole('table', { name: /^Fahrerwertung/ });
    await expect(drivers).toBeVisible();
    expect(await drivers.locator('tbody tr').count()).toBeGreaterThanOrEqual(22);
    await expect(drivers.locator('thead th', { hasText: 'Punkte' })).toHaveCount(1);

    await openTab(page, 'Konstrukteure');
    const teams = page.getByRole('table', { name: /^Konstrukteurswertung/ });
    await expect(teams).toBeVisible();
    expect(await teams.locator('tbody tr').count()).toBe(11);

    await openTab(page, 'Matrix');
    await expect(page.getByRole('table', { name: /^Positionen je Rennen/ })).toBeVisible();
  });

  test('Archiv-Wertung und „Stand nach Runde“', async ({ page }) => {
    await page.goto('/saison/1/wertung');
    await expectSingleH1(page);
    await expect(page.getByRole('table', { name: /^Fahrerwertung/ })).toBeVisible();
    await page.goto('/saison/2/wertung/nach-runde-2');
    await expectSingleH1(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('R2');
  });

  test('CSV-Export der Wertung', async ({ request }) => {
    const res = await request.get('/saison/2/wertung.csv');
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv.split('\n').length).toBeGreaterThan(20);
    expect(csv).toContain('ApexAnna');
  });
});

test.describe('Fahrer und Teams', () => {
  test('Fahrerprofil mit Kennzahlen, Ergebnissen und Nummern-Historie', async ({ page }) => {
    await page.goto('/fahrer/apexanna');
    await expectSingleH1(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ApexAnna');
    await expect(page.getByRole('heading', { name: 'Kennzahlen', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nummern-Historie' })).toBeVisible();
    await expect(page.getByRole('table').first()).toBeVisible();
  });

  test('Fahrerliste verlinkt Profile', async ({ page }) => {
    await page.goto('/fahrer');
    await expectSingleH1(page);
    await page.getByRole('link', { name: /KerbKiller77/ }).first().click();
    await expect(page).toHaveURL(/\/fahrer\/kerbkiller77$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('KerbKiller77');
  });

  test('alte Profil-Adresse nach Umbenennung leitet dauerhaft weiter (301)', async ({ page, request }) => {
    // Demo-Daten: Weiterleitung kurvenkoenig-alt → kurvenkoenig (Tabelle slug_redirects, Plan §2.2)
    const moved: Array<[string, string]> = [
      ['/fahrer/kurvenkoenig-alt', '/fahrer/kurvenkoenig'],
      ['/en/drivers/kurvenkoenig-alt', '/en/drivers/kurvenkoenig'],
    ];
    for (const [from, to] of moved) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(301);
      expect(new URL(res.headers()['location'] ?? '', 'http://x').pathname, from).toBe(to);
    }
    await page.goto('/fahrer/kurvenkoenig-alt');
    await expect(page).toHaveURL(/\/fahrer\/kurvenkoenig$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kurvenkönig');
    // Unbekannte Slugs bleiben ein 404 (keine Weiterleitung ins Leere)
    const unknown = await request.get('/fahrer/gibt-es-nicht-xyz', { maxRedirects: 0 });
    expect(unknown.status()).toBe(404);
  });

  test('Teamseite ohne Logos, mit Fahrern', async ({ page }) => {
    await page.goto('/teams/mclaren');
    await expectSingleH1(page);
    await expect(page.getByRole('main').getByText('ApexAnna').first()).toBeVisible();
    // keine Team-/Marken-Logos (Plan §9.1): höchstens das Liga-Logo als Bild
    await expect(page.getByRole('main').locator('img[alt*="McLaren" i]')).toHaveCount(0);
  });
});

test.describe('Stewards-Register', () => {
  test('listet veröffentlichte Entscheidungen, keine Entwürfe', async ({ page }) => {
    await page.goto('/stewards');
    await expectSingleH1(page);
    await expect(page.getByRole('heading', { name: 'Alle Entscheidungen' })).toBeVisible();
    await expect(page.getByText('S2-R03-01').first()).toBeVisible();
    await expect(page.getByText('S1-R06-01').first()).toBeVisible();
    // S2-R04-01 ist in den Demo-Daten ein Entwurf (wartet auf die zweite Stimme)
    await expect(page.getByText('S2-R04-01')).toHaveCount(0);
  });

  test('Entscheidung mit Begründung und Wirkung auf das Ergebnis', async ({ page }) => {
    await page.goto('/stewards');
    await page.getByRole('link', { name: /S2-R03-01/ }).first().click();
    await expect(page).toHaveURL(/\/stewards\/S2-R03-01$/i);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entscheidung S2-R03-01');
    await expect(page.getByText(/ChicaneCharlie/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Wirkung auf das Ergebnis' })).toBeVisible();
  });

  test('Vorfall-Formular ist erreichbar und verlangt einen Clip-Link', async ({ page }) => {
    await page.goto('/stewards/melden');
    await expectSingleH1(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vorfall melden');
    // Laufen mehrere Protestfristen (z. B. nachdem der Admin-Test ein Ergebnis veröffentlicht hat),
    // fragt das Formular zuerst nach der Runde.
    const chooser = page.getByRole('group', { name: 'Zu welcher Runde möchtest du melden?' });
    if (await chooser.isVisible()) {
      await chooser.getByRole('radio').first().check();
      await page.getByRole('button', { name: 'Weiter' }).click();
    }
    await expect(page.getByText(/Missbrauch führt zu Sanktionen/).first()).toBeVisible();
    const clip = page.getByRole('textbox', { name: /^Clip-Link/ });
    await expect(clip).toBeVisible();
    await expect(clip).toHaveAttribute('required', '');
  });
});
