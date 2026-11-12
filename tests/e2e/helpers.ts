import type { Page } from '@playwright/test';

export const SCRIPT = 'https://script.google.com/macros/s/E2E/exec';

/** Seeds the 9-11 Nov history (+ an older Chest + Back B so set 1 has a target) and the Sheet settings. */
export async function seed(page: Page) {
  await page.evaluate(async (scriptUrl) => {
    const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
    const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;
    const rows: [number, string, string, number][] = [
      [2, 'CB-B', 'converging-chest-press', 3],
      [9, 'CB-A', 'smith-flat-press', 3],
      [10, 'SA-A', 'barbell-curl', 3],
      [11, 'L-A', 'leg-press', 3],
    ];
    const db: IDBDatabase = await new Promise((ok, bad) => {
      const r = indexedDB.open('gym-tracker', 1);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => bad(r.error);
    });
    const tx = db.transaction(['workouts', 'sets', 'settings'], 'readwrite');
    for (const [d, sessionId, exerciseId, n] of rows) {
      const id = `seed-${d}`;
      // 11 Nov: logged early, so a workout started now is a separate visit.
      tx.objectStore('workouts').put({ id, date: day(d), sessionId, startedAt: at(d, 6), endedAt: at(d, 7), swaps: {} });
      for (let i = 1; i <= n; i++) {
        tx.objectStore('sets').put({
          id: `${id}-${i}`, workoutId: id, date: day(d), sessionId, exerciseId, setNo: i, kg: 40, reps: 10,
          warmup: false, feltIt: false, doneAt: at(d, 6, i * 3), updatedAt: at(d, 6, i * 3), deleted: false, synced: true,
        });
      }
    }
    tx.objectStore('settings').put({ key: 'main', value: { scriptUrl, scriptKey: 'e2e-key', weeklyTarget: 6, bodyKg: 65 } });
    await new Promise((ok) => (tx.oncomplete = ok));
    db.close();
  }, SCRIPT);
}

export const queueLength = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((ok) => {
        const r = indexedDB.open('gym-tracker', 1);
        r.onsuccess = () => {
          const q = r.result.transaction('queue').objectStore('queue').count();
          q.onsuccess = () => {
            ok(q.result);
            r.result.close();
          };
        };
      }),
  );


/** Mocks the Apps Script bridge: POST action 'import' -> empty log, other POST -> acks every id. Returns the POST log. */
export async function mockBridge(page: Page) {
  const posts: { contentType: string; upserts: { id: string; exercise: string; kg: number; reps: number }[]; deletes: string[] }[] = [];
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
  return posts;
}

/** Fresh app with the seeded history, on Home. */
export async function openSeeded(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Start workout' }).waitFor();
  await seed(page);
  await page.reload();
  await page.getByRole('heading', { name: 'Chest + Back B' }).waitFor();
}
