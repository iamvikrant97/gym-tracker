import { expect, test, type Page } from '@playwright/test';
import { queueLength, seed, SCRIPT } from './helpers';

const SHOTS = '.superpowers/sdd/2026-11-11-gym-app/shots';

test('a full workout: start, log, reload mid-workout, swap in a new exercise, finish, progress', async ({ page }) => {
  // The seeded history is 9-11 Nov 2026 and the flow expects "today" to be 11 Nov: start the clock there, then let it run.
  await page.clock.install({ time: new Date('2026-11-11T09:00:00+05:30') });
  await page.clock.resume();
  const posts: { contentType: string; upserts: { id: string; exercise: string; kg: number; reps: number }[]; deletes: string[] }[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // The built app ships a Content-Security-Policy: nothing in the flow may trip it.
  const cspConsole: string[] = [];
  page.on('console', (m) => /content security policy|refused to (load|connect|apply|execute|frame)/i.test(m.text()) && cspConsole.push(m.text()));
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile ?? ''}:${e.lineNumber}`);
    });
  });
  await page.route(`${SCRIPT}**`, async (route) => {
    const req = route.request();
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    const body = req.method() === 'POST' ? JSON.parse(req.postData() ?? '{}') : {};
    if (body.action === 'import') {
      await route.fulfill({ headers, body: JSON.stringify({ ok: true, log: [], exercises: [] }) });
    } else if (req.method() === 'POST') {
      posts.push({ contentType: req.headers()['content-type'], upserts: body.upserts, deletes: body.deletes });
      const ids = body.upserts.map((u: { id: string }) => u.id);
      await route.fulfill({ headers, body: JSON.stringify({ ok: true, written: ids.length, acked: ids, skipped: [], deleted: body.deletes }) });
    } else {
      await route.fulfill({ headers, body: JSON.stringify({ ok: true, log: [], exercises: [] }) });
    }
  });

  // ---- Home ----
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'How many days a week?' })).toBeVisible();
  await seed(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Chest + Back B' })).toBeVisible();
  await expect(page.locator('.today .meta')).toHaveText('16 sets · about 70 min');
  await expect(page.locator('.sync')).toContainText('Synced');
  await page.waitForTimeout(500); // toast and sheets settled
  await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: false });

  // A real click: fails if a closed sheet's scrim (or anything else) covers the button.
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page).toHaveURL(/#\/workout$/);

  // ---- Workout: one tap per set ----
  const first = page.locator('article[aria-label="Converging chest press"]');
  await expect(first.getByRole('button', { name: 'Complete set 1' })).toBeVisible();
  await first.getByRole('button', { name: 'Complete set 1' }).click();
  await expect(page.getByTestId('meter-label')).toContainText('1 of 16 sets');
  const dock = page.getByTestId('rest-dock');
  await expect(dock).toHaveClass(/open/);
  await expect(page.getByTestId('rest-time')).toHaveText(/^(3:00|2:5\d)$/);
  await first.getByRole('button', { name: 'Complete set 2' }).click();
  await expect(page.getByTestId('meter-label')).toContainText('2 of 16 sets');

  // Both sets reach the Sheet (2 s debounce), then the queue is empty.
  await expect.poll(() => posts.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => queueLength(page), { timeout: 15_000 }).toBe(0);
  await page.waitForTimeout(450); // rest dock slide-in finished
  await page.screenshot({ path: `${SHOTS}/workout.png` });

  // ---- App killed mid-workout: everything comes back ----
  await page.reload();
  await expect(page).toHaveURL(/#\/workout$/);
  await expect(page.getByTestId('meter-label')).toContainText('2 of 16 sets');
  await expect(first.getByRole('button', { name: 'Edit set 1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(first.getByRole('button', { name: 'Edit set 2' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('rest-dock')).toHaveClass(/open/);
  await expect(page.getByTestId('rest-time')).toHaveText(/^(3:00|2:[0-5]\d)$/);

  // ---- Add a custom exercise from the Swap sheet and use it ----
  await page.getByRole('button', { name: 'Swap Seated machine row' }).click();
  const swap = page.getByRole('dialog', { name: 'Swap exercise' });
  await expect(swap).toBeVisible();
  await swap.getByRole('button', { name: 'Add exercise' }).first().click();
  await swap.getByLabel('Name').fill('Chest-supported row E2E');
  await swap.locator('form').getByRole('button', { name: 'Add exercise' }).click();
  await swap.getByRole('radio', { name: /Chest-supported row E2E/ }).click();
  await expect(page.locator('article[aria-label="Chest-supported row E2E"]')).toBeVisible();

  // ---- Finish -> Summary ----
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page).toHaveURL(/#\/summary$/);
  await expect(page.getByTestId('sum-sets')).toHaveText('2');
  await expect(page.getByRole('heading', { name: 'Workout done' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/summary.png`, fullPage: true });

  // ---- Progress shows the session ----
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Progress' }).click();
  await expect(page).toHaveURL(/#\/progress$/);
  await page.getByRole('tab', { name: 'Exercises' }).click();
  await expect(page.getByRole('button', { name: /Converging chest press.*40 × 11 · 11 Nov/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Muscles' }).click();
  await page.screenshot({ path: `${SHOTS}/progress.png` });

  // ---- Week and Settings ----
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Week' }).click();
  await expect(page.getByText('4 / 6')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/week.png` });
  // Tap a trained day: its summary opens in a sheet.
  await page.getByRole('button', { name: '9 Nov, trained, view summary' }).click();
  const daySheet = page.getByRole('dialog', { name: '9 Nov' });
  await expect(daySheet).toContainText('Chest + Back A');
  await expect(daySheet).toContainText('Smith flat press');
  await expect(daySheet).toContainText('40 × 10');
  await page.keyboard.press('Escape');
  await expect(daySheet).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText(`${new URL(page.url()).origin}/gym-tracker/`)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });

  // ---- Sync contract: text/plain, each set exactly once, in order ----
  expect(posts.length).toBeGreaterThan(0);
  for (const p of posts) expect(p.contentType).toBe('text/plain;charset=utf-8');
  const sent = posts.flatMap((p) => p.upserts);
  expect(sent.map((u) => `${u.exercise} ${u.kg}x${u.reps}`)).toEqual(['Converging chest press 40x11', 'Converging chest press 40x11']);
  expect(new Set(sent.map((u) => u.id)).size).toBe(2);
  // In workout order: set 1 first, then set 2.
  const logged = await page.evaluate(
    () =>
      new Promise<{ id: string; setNo: number; doneAt: number }[]>((ok) => {
        const r = indexedDB.open('gym-tracker', 1);
        r.onsuccess = () => {
          const q = r.result.transaction('sets').objectStore('sets').getAll();
          q.onsuccess = () => ok((q.result as { id: string; setNo: number; doneAt: number }[]).filter((x) => !x.id.startsWith('seed-')));
        };
      }),
  );
  expect(sent.map((u) => u.id)).toEqual(logged.sort((x, y) => x.doneAt - y.doneAt).map((x) => x.id));
  expect(logged.map((x) => x.setNo)).toEqual([1, 2]);
  expect(posts.flatMap((p) => p.deletes)).toEqual([]);
  expect(errors).toEqual([]);

  // ---- CSP: the policy is really in the page, and no violation fired anywhere in the flow ----
  await page.goto('./');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  expect(cspConsole).toEqual([]);
});
