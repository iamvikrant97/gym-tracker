import { expect, test } from '@playwright/test';
import { seed, SCRIPT } from './helpers';

test('add an extra exercise mid-workout, finish, and Home says the day is done with the next workout', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T09:00:00+05:30') });
  await page.clock.resume();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(`${SCRIPT}**`, async (route) => {
    const req = route.request();
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    const body = req.method() === 'POST' ? JSON.parse(req.postData() ?? '{}') : {};
    const ids = (body.upserts ?? []).map((u: { id: string }) => u.id);
    await route.fulfill({ headers, body: JSON.stringify({ ok: true, log: [], exercises: [], written: ids.length, acked: ids, skipped: [], deleted: body.deletes ?? [] }) });
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'How many days a week?' })).toBeVisible();
  await seed(page);
  await page.reload();
  // The seed has Legs A done earlier today: this is a second session.
  await page.getByRole('button', { name: 'Train another session today' }).click();
  await expect(page).toHaveURL(/#\/workout$/);

  // The button is a real 48 px target under the cards.
  const add = page.getByRole('button', { name: 'Add exercise' });
  await add.scrollIntoViewIfNeeded();
  expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await add.click();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('hammer');
  await sheet.getByRole('button', { name: /Hammer curl/ }).click();
  const extra = page.locator('article[aria-label="Hammer curl"]');
  await expect(extra).toBeVisible();
  await expect(page.locator('article[aria-label="Converging chest press"]')).toBeVisible(); // the session is untouched
  await extra.getByRole('button', { name: 'Complete set 1' }).click(); // no history: the adjust sheet opens
  const adjust = page.getByRole('dialog', { name: /Hammer curl · set 1/ });
  await adjust.getByRole('button', { name: 'Save set' }).click();
  await expect(extra.getByRole('button', { name: 'Edit set 1' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page).toHaveURL(/#\/summary$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/#\/$/);

  // Home: done for today, not "Today: <next session>".
  const card = page.getByRole('button', { name: /^Done · Chest \+ Back B/ });
  await expect(card).toBeVisible();
  await expect(page.getByTestId('done-sets')).toHaveText('1');
  await expect(page.getByText('2 workouts today')).toBeVisible();
  await expect(page.getByTestId('next-workout')).toContainText('Thursday · Shoulders + Arms B');
  await expect(page.getByRole('button', { name: 'Start workout' })).toHaveCount(0);
  await card.click();
  const sum = page.getByRole('dialog', { name: '11 Nov' });
  await expect(sum).toContainText('Hammer curl');
  await expect(sum).toContainText('Legs A');
  await page.keyboard.press('Escape');
  await expect(sum).toBeHidden();

  // A second session the same day is still possible.
  await page.getByRole('button', { name: 'Train another session today' }).click();
  await expect(page).toHaveURL(/#\/workout$/);
  await expect(page.getByRole('heading', { name: 'Shoulders + Arms B' })).toBeVisible();
  expect(errors).toEqual([]);
});
