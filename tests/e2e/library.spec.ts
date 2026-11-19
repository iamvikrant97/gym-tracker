import { expect, test } from '@playwright/test';

/** Settings -> Open library -> search -> open a guide (lazy chunk, under the CSP) -> alternative -> back to Settings. */
test('exercise library: search, open a guide, jump to an alternative, back to Settings', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T09:00:00+05:30') });
  await page.clock.resume();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('./');
  await page.getByRole('radio', { name: '4', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Upper\/Lower/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Open library' }).click();
  await expect(page.getByTestId('library')).toBeVisible();
  await page.getByLabel('Search exercises').fill('lat pulldown');
  await page.locator('.row').first().click();
  await expect(page.getByText(/general reference/)).toBeVisible();
  await expect(page.locator('.stage svg').first()).toBeVisible();
  await page.getByRole('button', { name: 'Avoid vs ideal' }).click();
  await expect(page.locator('figure.good')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close library' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  expect(errors).toEqual([]);
});
