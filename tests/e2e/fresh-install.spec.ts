import { expect, test } from '@playwright/test';
import { SCRIPT } from './helpers';

const SHOTS = '.superpowers/sdd/2026-11-11-gym-app/shots';

/** A brand-new phone: no data, no Sheet, no Spotify. Setup, first workout, reload, Settings. */
test('fresh install: setup -> Full body A -> first workout -> still set up after a reload, never touches the network', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T09:00:00+05:30') });
  await page.clock.resume();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const requests: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== 'localhost') requests.push(r.url());
  });
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });

  // ---- step 1: days ----
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'How many days a week?' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: '3', exact: true })).toHaveAttribute('aria-checked', 'true');
  for (const d of ['Monday', 'Wednesday', 'Friday']) await expect(page.getByRole('button', { name: d })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/setup-days.png` });

  // tap targets: every button on the setup screens is at least 48 px high
  const tooSmall = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.setup button, .setup input')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => ({ n: el.getAttribute('aria-label') ?? el.textContent?.trim(), h: el.getBoundingClientRect().height }))
        .filter((x) => x.h < 47.5),
    );
  expect(await tooSmall()).toEqual([]);
  await page.getByRole('button', { name: 'Continue' }).click();

  // ---- step 2: plan ----
  await expect(page.getByRole('heading', { name: 'Choose your plan' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Suggested for you/ })).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/setup-plan.png` });
  expect(await tooSmall()).toEqual([]);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'How many days a week?' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // ---- review ----
  await expect(page.getByRole('heading', { name: 'Your week' })).toBeVisible();
  await expect(page.getByText('Start light for the first 2 weeks — stop 2–3 reps before failure')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/setup-review.png` });
  await page.getByRole('button', { name: 'Start' }).click();

  // ---- Home: her plan, her greeting ----
  await expect(page.getByRole('heading', { name: 'Full body A' })).toBeVisible();
  await expect(page.locator('h1.greet')).toHaveText('Morning');
  await expect(page.locator('.sync')).toContainText('Saved on phone');
  await expect(page.locator('.sync i.warn')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/home-new-user.png` });

  // ---- first workout: set 1 asks for the weight once, set 2 is one tap ----
  await page.getByRole('button', { name: 'Start workout' }).click();
  const leg = page.locator('article[aria-label="Leg press"]');
  await leg.getByRole('button', { name: 'Complete set 1' }).click();
  const sheet = page.getByRole('dialog', { name: /Leg press · set 1/ });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('No history yet');
  for (let i = 0; i < 4; i++) await sheet.getByRole('button', { name: 'More weight' }).click();
  await sheet.getByRole('button', { name: 'Save set' }).click();
  await expect(page.getByTestId('meter-label')).toContainText('1 of 13 sets');
  await leg.getByRole('button', { name: 'Complete set 2' }).click();
  await expect(page.getByTestId('meter-label')).toContainText('2 of 13 sets');
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page).toHaveURL(/#\/summary$/);
  await expect(page.getByTestId('sum-sets')).toHaveText('2');

  // ---- reload: no setup again; the plan and the history are there ----
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Full body B' })).toBeVisible(); // A is done: B is next
  await expect(page.getByRole('heading', { name: 'How many days a week?' })).toHaveCount(0);

  // ---- Settings: the plan, the backup reminder, no Sheet noise ----
  await page.goto('./#/settings');
  const plan = page.getByRole('article', { name: 'Training plan' });
  await expect(plan).toContainText('Full body A/B');
  await expect(plan).toContainText('Mon · Wed · Fri · 3 a week');
  await expect(page.getByTestId('backup-reminder')).toContainText('Export a backup every few weeks');
  await plan.getByRole('button', { name: 'Change plan' }).click();
  await expect(page.getByRole('heading', { name: 'How many days a week?' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  // ---- nothing left the phone, nothing broke ----
  expect(requests.filter((u) => u.includes(new URL(SCRIPT).hostname))).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
});
