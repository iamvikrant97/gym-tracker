import { expect, test } from '@playwright/test';

const NAMES = 'name=Minal&morning=Cutie&afternoon=Minal&evening=CutieChan&night=Cutiechan';

async function finishSetup(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
}

for (const [label, path] of [['hash form', `./#/?${NAMES}`], ['query form', `./?${NAMES}#/`]] as const) {
  test(`invite link (${label}): pre-fills, clears the address, survives a reload, saves at Start`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-12T22:00:00+05:30') });
    await page.clock.resume();
    await page.goto(path);
    await expect(page.getByLabel(/What should I call you/)).toHaveValue('Minal');
    await expect.poll(() => page.url()).not.toMatch(/Minal|Cutie/);
    await page.reload();
    await expect(page.getByLabel(/What should I call you/)).toHaveValue('Minal');
    await finishSetup(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Night, Cutiechan');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Night, Cutiechan');
  });
}

test('invite link with the service worker on: the query form still opens the app', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('http://localhost:4173/gym-tracker/'); // first visit installs the worker
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForTimeout(500);
  const fresh = await context.newPage();
  await fresh.goto(`http://localhost:4173/gym-tracker/?${NAMES}#/`);
  await expect(fresh.getByLabel(/What should I call you/)).toHaveValue('Minal');
  await fresh.evaluate(() => localStorage.clear()); // so the hash form below is read from the address, not from a saved copy
  const hashPage = await context.newPage();
  await hashPage.goto(`http://localhost:4173/gym-tracker/#/?${NAMES}`);
  await expect(hashPage.getByLabel(/What should I call you/)).toHaveValue('Minal');
  await context.close();
});
