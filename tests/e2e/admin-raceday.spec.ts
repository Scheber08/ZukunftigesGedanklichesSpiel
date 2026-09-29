/**
 * Hauptablauf im Admin (Plan §7.6): Demo-Login → Grid-Builder → Ergebnis vorläufig
 * veröffentlichen → Strafe veröffentlichen → Wertung prüfen. Läuft gegen die Demo-Daten des
 * Test-Servers und nimmt jeweils die nächste Runde ohne Ergebnis – so bleibt der Test auch bei
 * wiederholten Läufen gegen denselben Server gültig (R5, dann R6 …).
 *
 * Öffentliche Seiten sind wie in Produktion statisch gebaut: Eine Veröffentlichung im Admin fordert
 * einen Rebuild an, ändert die laufende Vorschau aber nicht. Die Wirkung auf die Wertung prüft der
 * Test deshalb über die serverseitig berechnete Wertungs-Vorschau der Ergebnis-Eingabe (dieselbe
 * Berechnung wie für /wertung) und die Status-Anzeigen im Admin. Läuft der Test gegen einen
 * Dev-Server, der öffentliche Seiten live rendert (E2E_LIVE=true), prüft er zusätzlich die
 * öffentlichen Seiten.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { demoLogin, openTab, standingsPoints, successAlert, waitForIslands } from './helpers';

test.describe.configure({ mode: 'serial' });

/** Öffentliche Seiten werden live gerendert (Dev-Server) statt beim Build eingefroren. */
const LIVE_PUBLIC = process.env.E2E_LIVE === 'true';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface RoundRef {
  id: string;
  label: string;
  number: number;
}

/** Erste Runde der aktuellen Saison, die noch kein Ergebnis hat. */
async function nextOpenRound(page: Page): Promise<RoundRef> {
  await page.goto('/admin/runden');
  const rows = page.getByRole('table', { name: /^Runden von/ }).locator('tbody tr');
  const open = rows.filter({ hasText: /Aufstellung steht|geplant/ }).filter({ hasNotText: /abgesagt/ }).first();
  await expect(open, 'keine offene Runde mehr in den Demo-Daten – Test-Server neu starten').toBeVisible();
  const link = open.getByRole('link', { name: /^R\d+ · / });
  const label = (await link.innerText()).trim();
  const href = (await link.getAttribute('href')) ?? '';
  const id = /\/admin\/runden\/(\d+)/.exec(href)?.[1];
  if (!id) throw new Error(`Runden-ID nicht gefunden in ${href}`);
  return { id, label, number: Number(/^R(\d+)/.exec(label)?.[1]) };
}

/** Zeile der Runde in der Rundenliste des Admins. */
async function roundRow(page: Page, round: RoundRef): Promise<Locator> {
  await page.goto('/admin/runden');
  const table = page.getByRole('table', { name: /^Runden von/ });
  const row = table.locator('tbody tr').filter({ has: page.getByRole('link', { name: round.label, exact: true }) });
  await expect(row).toHaveCount(1);
  return row;
}

/** Führender der Fahrerwertung laut /wertung (Rohtext, unabhängig von CSS-Versalien). */
async function championshipLeader(page: Page): Promise<string> {
  await page.goto('/wertung');
  const table = page.getByRole('table', { name: /^Fahrerwertung/ });
  const name = await table.locator('tbody tr').first().locator('th[scope="row"] .gamertag').first().textContent();
  return (name ?? '').trim();
}

/** Zeile eines Fahrers in der Wertungs-Vorschau der Ergebnis-Eingabe: Punkte gesamt und dieser Runde. */
async function previewRow(page: Page, gamertag: string): Promise<{ points: number; delta: number }> {
  const table = page.getByRole('table', { name: /^Top 10 der Fahrerwertung/ });
  await expect(table).toBeVisible();
  const row = table.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: gamertag, exact: true }) });
  await expect(row, `${gamertag} fehlt in der Top 10 der Wertungs-Vorschau`).toHaveCount(1);
  const cells = row.locator('td');
  // Spalten: Pos. | (th Fahrer) | Team | Punkte | Diese Runde | Veränderung
  const num = async (i: number) => Number(((await cells.nth(i).textContent()) ?? '').replace(/[^\d-]/g, '') || '0');
  return { points: await num(2), delta: await num(3) };
}

async function openRaceTab(page: Page, round: RoundRef): Promise<Locator> {
  await page.goto(`/admin/runden/${round.id}/ergebnisse`);
  await waitForIslands(page);
  await page.getByRole('tablist', { name: 'Sessions' }).getByRole('tab', { name: /^Rennen/ }).click();
  return page.getByRole('tabpanel').filter({ visible: true });
}

test('Renntag: Aufstellung → vorläufiges Ergebnis → Strafe → Wertung', async ({ page, browser }) => {
  test.setTimeout(240_000);
  let round!: RoundRef;
  let winner = '';
  let pointsBefore = 0;
  let pointsWithWin = 0;

  await test.step('Führender der Wertung wird der Sieger dieser Runde', async () => {
    // Der Führende bleibt sicher in der Top 10 der Vorschau – auch nach der Disqualifikation.
    winner = await championshipLeader(page);
    expect(winner).not.toBe('');
  });

  await test.step('Demo-Admin meldet sich an und wählt die nächste Runde', async () => {
    await demoLogin(page, 'Admin');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    round = await nextOpenRound(page);
    expect(round.number).toBeGreaterThan(0);
  });

  await test.step('Grid-Builder: Aufstellung prüfen und veröffentlichen', async () => {
    await page.goto(`/admin/runden/${round.id}/grid`);
    await waitForIslands(page);
    await expect(page.getByRole('heading', { name: 'Prüfungen' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reservepool' })).toBeVisible();
    const publish = page.getByRole('button', { name: /^(Änderungen )?[Vv]eröffentlichen$/ });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(successAlert(page, /^Aufstellung veröffentlicht[ .(]/)).toBeVisible();

    const row = await roundRow(page, round);
    await expect(row).toContainText('Aufstellung steht');
    await expect(row).toContainText(/2[0-2] Cockpits/);
  });

  if (LIVE_PUBLIC) {
    await test.step('Aufstellung erscheint auf der öffentlichen Rennseite', async () => {
      await page.goto(`/rennen/2/${round.number}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(round.label);
      await openTab(page, 'Aufstellung');
      await expect(page.getByRole('heading', { name: 'Aufstellung', exact: true })).toBeVisible();
      await expect(page.getByText('Aufstellung noch nicht veröffentlicht')).toHaveCount(0);
    });
  }

  await test.step('Ergebnis-Eingabe: Sieger nach vorn, speichern, Vorschau der Wertung', async () => {
    const race = await openRaceTab(page, round);
    const position = race.getByRole('spinbutton', { name: `Position von ${winner}`, exact: true });
    await expect(position, `${winner} fehlt in der Aufstellung von ${round.label}`).toBeVisible();
    await position.fill('1');
    await position.press('Tab');
    await expect(race.getByRole('spinbutton', { name: /^Position von / }).first()).toHaveAttribute('aria-label', `Position von ${winner}`);

    const tabs = page.getByRole('tablist', { name: 'Sessions' }).getByRole('tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click();
      await page.getByRole('tabpanel').filter({ visible: true }).getByRole('checkbox', { name: / speichern/ }).check();
    }
    await page.getByRole('button', { name: 'Speichern als vorläufig' }).click();
    await expect(successAlert(page, /^Gespeichert \(noch nicht öffentlich\)/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Vorschau: Fahrerwertung/ })).toBeVisible();

    const preview = await previewRow(page, winner);
    expect(preview.delta, `${winner} bekommt für den Sieg mindestens 25 Punkte`).toBeGreaterThanOrEqual(25);
    pointsWithWin = preview.points;
    pointsBefore = preview.points - preview.delta;
  });

  await test.step('Vorläufig veröffentlichen startet die Protestfrist', async () => {
    await page.getByRole('button', { name: 'Vorläufig veröffentlichen' }).click();
    await expect(successAlert(page, /^Vorläufig veröffentlicht\. Die Protestfrist läuft/)).toBeVisible();
    const row = await roundRow(page, round);
    await expect(row).toContainText('vorläufig');
  });

  if (LIVE_PUBLIC) {
    await test.step('Rennseite und Wertung zeigen das vorläufige Ergebnis', async () => {
      await page.goto(`/rennen/2/${round.number}`);
      await expect(page.getByText(/vorläufig/i).first()).toBeVisible();
      const race = page.getByRole('table', { name: new RegExp(`^Rennen – R${round.number} `) });
      await expect(race).toBeVisible();
      await expect(race.locator('tbody tr').first()).toContainText(winner);
      await page.goto('/wertung');
      expect(await standingsPoints(page, winner)).toBe(pointsWithWin);
    });
  }

  await test.step('Admin schaltet das Vier-Augen-Prinzip für die Demo-Saison ab', async () => {
    // Im Demo-Modus gibt es nur EINEN Demo-Steward – eine zweite Stimme ist nicht möglich.
    await page.goto('/admin/saisons');
    await page.getByRole('link', { name: /Saison 2/ }).first().click();
    const fourEyes = page.getByRole('checkbox', { name: /Vier-Augen-Prinzip/ });
    if (await fourEyes.isChecked()) {
      await fourEyes.uncheck();
      await page.getByRole('button', { name: 'Speichern', exact: true }).first().click();
      await expect(page.getByRole('checkbox', { name: /Vier-Augen-Prinzip/ })).not.toBeChecked();
    }
  });

  await test.step('Steward eröffnet eine Untersuchung und veröffentlicht eine Disqualifikation', async () => {
    const stewardContext = await browser.newContext();
    const steward = await stewardContext.newPage();
    try {
      await demoLogin(steward, 'Steward', '/admin/stewards');
      await steward.goto('/admin/stewards/neu');
      await steward.getByLabel(/^Rennen \(/).selectOption({ label: round.label });
      await steward.getByLabel('Session').selectOption({ label: 'Rennen' });
      await steward.getByRole('group', { name: /Beteiligte Fahrer/ }).getByRole('checkbox', { name: new RegExp(`^${escapeRe(winner)}`) }).check();
      await steward.getByLabel(/Was ist passiert/).fill('E2E-Test: Nach Auswertung des Replays unerlaubte Fahrhilfe festgestellt.');
      await steward.getByRole('button', { name: 'Untersuchung eröffnen' }).click();
      await expect(steward).toHaveURL(/\/admin\/stewards\/\d+/);

      // Name ohne das aria-hidden-Pflichtsternchen des Labels
      const driverSelect = steward.getByRole('combobox', { name: 'Fahrer', exact: true });
      const option = driverSelect.locator('option').filter({ hasText: new RegExp(`(^|\\s)${escapeRe(winner)}(\\s|$)`) });
      await expect(option).toHaveCount(1);
      await driverSelect.selectOption((await option.getAttribute('value')) ?? '');
      await steward.getByLabel(/^Art der Entscheidung/).selectOption({ label: 'Disqualifikation' });
      await steward.getByLabel(/^Begründung \(Deutsch\)/).fill('Unerlaubte Fahrhilfe laut Lobby-Einstellungen (E2E-Test). Disqualifikation nach §10.');
      await steward.getByRole('button', { name: 'Als Entwurf speichern' }).click();

      const publish = steward.getByRole('button', { name: 'Veröffentlichen', exact: true }).first();
      await expect(publish).toBeVisible();
      await publish.click();
      await expect(steward.getByText(/veröffentlicht/i).filter({ visible: true }).first()).toBeVisible();
    } finally {
      await stewardContext.close();
    }
  });

  const ref = () => new RegExp(`S2-R${String(round.number).padStart(2, '0')}-\\d{2}`);

  await test.step('Steward-Register im Admin führt das veröffentlichte Urteil', async () => {
    await page.goto('/admin/stewards');
    const decision = page.getByRole('row').filter({ hasText: ref() }).filter({ hasText: 'Disqualifikation' });
    await expect(decision.first()).toBeVisible();
    await expect(decision.first()).toContainText('veröffentlicht');
  });

  await test.step('Ergebnis und Wertungs-Vorschau berücksichtigen die Disqualifikation', async () => {
    const race = await openRaceTab(page, round);
    const winnerRow = race.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: new RegExp(escapeRe(winner)) }) });
    await expect(winnerRow.getByText('DSQ durch Urteil')).toBeVisible();

    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(successAlert(page, /^Gespeichert – die Änderungen sind öffentlich \(Rebuild angefordert\)/)).toBeVisible();
    const after = await previewRow(page, winner);
    expect(after.delta, `${winner} bekommt nach der Disqualifikation keine Punkte für die Runde`).toBe(0);
    expect(after.points).toBe(pointsBefore);
    expect(after.points).toBeLessThan(pointsWithWin);
  });

  if (LIVE_PUBLIC) {
    await test.step('Öffentliches Register, Rennseite und Wertung spiegeln die Strafe wider', async () => {
      await page.goto('/stewards');
      await expect(page.getByText(ref()).first()).toBeVisible();
      await page.goto(`/rennen/2/${round.number}`);
      const race = page.getByRole('table', { name: new RegExp(`^Rennen – R${round.number} `) });
      await expect(race.locator('tbody tr', { hasText: winner })).toContainText('DSQ');
      await page.goto('/wertung');
      expect(await standingsPoints(page, winner)).toBe(pointsBefore);
    });
  }
});

test.describe('Zugriffsschutz', () => {
  test('ohne Anmeldung leitet /admin zum Login', async ({ page }) => {
    await page.goto('/admin/runden');
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Frunden/);
    await expect(page.getByRole('link', { name: /Mit Discord anmelden/ })).toBeVisible();
  });

  test('Redaktion kommt nicht in den Renntag-Bereich', async ({ page }) => {
    await demoLogin(page, 'Redaktion');
    const response = await page.goto('/admin/runden');
    expect(response?.status()).toBe(403);
  });

  test('Admin-Actions prüfen Anmeldung und Rolle auf dem Server', async ({ request, baseURL }) => {
    // Direkter Aufruf ohne Oberfläche – so, wie ein Angreifer es versuchen würde
    const call = (cookie?: string) =>
      request.post('/_actions/admin.decisionPublish', {
        headers: { origin: new URL(baseURL!).origin, ...(cookie ? { cookie } : {}) },
        multipart: { decisionId: '999999' },
        failOnStatusCode: false,
      });
    const anonymous = await call();
    expect(anonymous.status()).toBe(401);
    expect(await anonymous.text()).toContain('UNAUTHORIZED');
    // Redaktion darf keine Steward-Entscheidungen veröffentlichen
    const editor = await call('liga_demo_staff=redakteur');
    expect(editor.status()).toBe(403);
    expect(await editor.text()).toContain('FORBIDDEN');
  });

  test('Formulare von fremden Websites werden abgelehnt (Origin-Prüfung)', async ({ request }) => {
    const res = await request.post('/_actions/sendContact', {
      headers: { origin: 'https://evil.example' },
      form: { name: 'x', email: 'x@example.org', subject: 'x', message: 'x' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });

  test('Admin-Seiten sind nicht indexierbar', async ({ page }) => {
    const response = await page.goto('/admin/login');
    expect(response?.headers()['x-robots-tag']).toContain('noindex');
  });
});
