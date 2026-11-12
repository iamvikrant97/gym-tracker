import { expect, test } from '@playwright/test';

/** 4 days -> Upper/Lower is suggested -> first workout -> Settings -> Change plan -> Push/Pull/Legs; history stays. */
test('plan templates: Upper/Lower suggested for 4 days, switch to Push/Pull/Legs, history kept', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T09:00:00+05:30') });
  await page.clock.resume();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('./');
  await page.getByRole('radio', { name: '4', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('radio', { name: /Suggested for you/ })).toContainText('Upper/Lower');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  const names = await page.locator('.plan .nm').allTextContents();
  expect(names).toEqual(['Full body A/B', 'Upper/Lower', 'Push/Pull/Legs', "Vik's split", 'Build my own']);
  await page.getByRole('radio', { name: /Upper\/Lower/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.sched li')).toHaveText(['MondayUpper A', 'TuesdayLower A', 'ThursdayUpper B', 'FridayLower B']);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Upper A' })).toBeVisible();

  // one set of the first exercise, then finish
  await page.getByRole('button', { name: 'Start workout' }).click();
  const first = page.locator('article[aria-label="Machine chest press"]');
  await first.getByRole('button', { name: 'Complete set 1' }).click();
  const sheet = page.getByRole('dialog', { name: /Machine chest press · set 1/ });
  await sheet.getByRole('button', { name: 'More weight' }).click();
  await sheet.getByRole('button', { name: 'Save set' }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page).toHaveURL(/#\/summary$/);

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Lower A' })).toBeVisible();

  // switch plans from Settings
  await page.goto('./#/settings');
  await page.getByRole('article', { name: 'Training plan' }).getByRole('button', { name: 'Change plan' }).click();
  await page.getByRole('radio', { name: '6', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('radio', { name: /Suggested for you/ })).toContainText('Push/Pull/Legs');
  await page.getByRole('radio', { name: /Push\/Pull\/Legs/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.sched li')).toHaveCount(6);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { name: 'Push A' })).toBeVisible();

  // the Upper A workout and its set are still stored
  const kept = await page.evaluate(
    () =>
      new Promise<{ workouts: string[]; sets: number }>((ok) => {
        const r = indexedDB.open('gym-tracker', 1);
        r.onsuccess = () => {
          const tx = r.result.transaction(['workouts', 'sets']);
          const w = tx.objectStore('workouts').getAll();
          const c = tx.objectStore('sets').count();
          tx.oncomplete = () => {
            ok({ workouts: (w.result as { sessionId: string }[]).map((x) => x.sessionId), sets: c.result });
            r.result.close();
          };
        };
      }),
  );
  expect(kept).toEqual({ workouts: ['ul-upper-a'], sets: 1 });
  expect(errors).toEqual([]);
});
