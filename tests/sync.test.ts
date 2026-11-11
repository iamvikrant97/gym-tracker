import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { closeDb, DEFAULT_SETTINGS, getAll, put, putAll, saveSettings, addCustomExercise } from '../src/lib/db';
import type { QueueItem } from '../src/lib/db';
import { _resetSyncState, flush, importFromSheet, syncStatus } from '../src/lib/sync';
import type { SetLog, Workout } from '../src/lib/types';

const SETTINGS = { ...DEFAULT_SETTINGS, scriptUrl: 'https://script.example/exec', scriptKey: 'k3y' };
const mk = (id: string, over: Partial<SetLog> = {}): SetLog => ({
  id, workoutId: 'w1', date: '2026-11-09', sessionId: 'CB-A', exerciseId: 'cable-row-v-handle', setNo: 1, kg: 50, reps: 10,
  warmup: false, feltIt: false, doneAt: 1, updatedAt: 1, deleted: false, synced: false, ...over,
});
const enqueue = (s: SetLog, op: QueueItem['op'] = 'upsert') =>
  putAll([{ store: 'sets', value: s }, { store: 'queue', value: { id: s.id, op } }]);
const okFetch = (body: unknown = { ok: true }) => vi.fn(async (..._a: Parameters<typeof fetch>) => ({ ok: true, json: async () => body }) as Response);
const bodyOf = (f: { mock: { calls: unknown[][] } }, i = 0) => JSON.parse((f.mock.calls[i][1] as RequestInit).body as string);
const queue = () => getAll<QueueItem>('queue');
const sets = () => getAll<SetLog>('sets');

beforeEach(async () => {
  await closeDb(true);
  _resetSyncState();
});
afterEach(() => vi.restoreAllMocks());

describe('syncStatus', () => {
  it('not-set-up without settings, nothing sent', async () => {
    const f = okFetch();
    await enqueue(mk('a'));
    expect(await syncStatus()).toBe('not-set-up');
    expect(await flush(f)).toEqual({ sent: 0, ok: false });
    expect(f).not.toHaveBeenCalled();
    expect(await queue()).toHaveLength(1);
  });
  it('pending / synced / offline', async () => {
    await saveSettings(SETTINGS);
    expect(await syncStatus()).toBe('synced');
    await enqueue(mk('a'));
    expect(await syncStatus()).toBe('pending');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await syncStatus()).toBe('offline');
  });
});

describe('flush', () => {
  beforeEach(() => saveSettings(SETTINGS));

  it('sends 3 queued sets in one text/plain POST with key, names and sheet day, then clears the queue', async () => {
    for (const n of ['a', 'b', 'c']) await enqueue(mk(n, { setNo: 1 }));
    const f = okFetch();
    expect(await flush(f)).toEqual({ sent: 3, ok: true });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SETTINGS.scriptUrl);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(init.redirect).toBe('follow');
    const body = JSON.parse(init.body as string);
    expect(body.key).toBe('k3y');
    expect(body.upserts).toHaveLength(3);
    expect(body.upserts[0]).toMatchObject({ id: 'a', date: '2026-11-09', day: 'Chest+Back A', exercise: 'Cable row V-handle', slot: 'Horizontal pull', kg: 50, reps: 10 });
    expect(await queue()).toEqual([]);
    expect((await sets()).every((s) => s.synced)).toBe(true);
  });

  it('keeps the queue on failure responses, HTTP errors and thrown errors', async () => {
    await enqueue(mk('a'));
    for (const f of [
      okFetch({ ok: false, error: 'bad key' }),
      vi.fn(async (..._a: Parameters<typeof fetch>) => ({ ok: false, json: async () => ({}) }) as Response),
      vi.fn(async (..._a: Parameters<typeof fetch>) => { throw new TypeError('offline'); }),
    ]) {
      expect(await flush(f)).toEqual({ sent: 0, ok: false });
      expect(await queue()).toHaveLength(1);
    }
    expect((await sets())[0].synced).toBe(false);
  });

  it('batches of at most 50', async () => {
    for (let i = 0; i < 120; i++) await enqueue(mk(`s${i}`));
    const f = okFetch();
    expect(await flush(f)).toEqual({ sent: 120, ok: true });
    expect(f).toHaveBeenCalledTimes(3);
    expect(bodyOf(f, 0).upserts).toHaveLength(50);
  });

  it('sends deletes by id and a custom exercise by name and slot', async () => {
    const ex = await addCustomExercise({ name: 'Zottman curl', slot: 'Biceps', muscle: 'Biceps', kind: 'isolation', step: 2.5, repMin: 8, repMax: 12, restSec: 120 });
    await enqueue(mk('a', { exerciseId: ex.id }));
    await enqueue(mk('d', { deleted: true }), 'delete');
    const f = okFetch();
    await flush(f);
    const body = bodyOf(f, 0);
    expect(body.deletes).toEqual(['d']);
    expect(body.upserts[0]).toMatchObject({ exercise: 'Zottman curl', slot: 'Biceps' });
    expect(await queue()).toEqual([]);
  });

  it('a delete replaces a pending upsert for the same set id (queue keyed by id)', async () => {
    const s = mk('a');
    await enqueue(s);
    await enqueue({ ...s, deleted: true, updatedAt: 2 }, 'delete');
    const f = okFetch();
    await flush(f);
    const body = bodyOf(f, 0);
    expect(body.upserts).toEqual([]);
    expect(body.deletes).toEqual(['a']);
  });

  it('warm-up sets are sent as deletes (never as rows)', async () => {
    await enqueue(mk('w', { warmup: true, setNo: 0 }));
    const f = okFetch();
    await flush(f);
    const body = bodyOf(f, 0);
    expect(body.upserts).toEqual([]);
    expect(body.deletes).toEqual(['w']);
    expect(await queue()).toEqual([]);
  });

  it('an edit made while the request is in flight is not lost: it is sent in the next batch', async () => {
    const s = mk('a');
    await enqueue(s);
    let n = 0;
    const f = vi.fn(async (..._a: Parameters<typeof fetch>) => {
      if (n++ === 0) await enqueue({ ...s, reps: 12, updatedAt: 5 });
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    });
    await flush(f);
    expect(f).toHaveBeenCalledTimes(2);
    expect(bodyOf(f, 1).upserts[0].reps).toBe(12);
    expect(await queue()).toEqual([]);
  });

  it('empty queue sends nothing', async () => {
    const f = okFetch();
    expect(await flush(f)).toEqual({ sent: 0, ok: true });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('importFromSheet', () => {
  beforeEach(() => saveSettings(SETTINGS));
  const log = [
    { date: '2026-11-09', day: 'Chest+Back A', exercise: 'Cable row V-handle', kg: 50, reps: 10 },
    { date: '2026-11-09', day: 'Chest+Back A', exercise: 'Cable row V-handle', kg: 50, reps: 9 },
    { date: '2026-11-09', day: 'Chest+Back A', exercise: 'Mystery machine', kg: 20, reps: 12 },
  ];
  const data = { ok: true, log, exercises: [{ slot: 'Other', name: 'Mystery machine', muscle: 'Back', repMin: 10, repMax: 15 }] };

  it('creates one CB-A workout, maps names to ids, adds unknowns as custom, and is not duplicated on a second run', async () => {
    const f = okFetch(data);
    expect(await importFromSheet(f)).toEqual({ imported: 3 });
    expect(String(f.mock.calls[0][0])).toBe('https://script.example/exec?key=k3y');
    const ws = await getAll<Workout>('workouts');
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ date: '2026-11-09', sessionId: 'CB-A' });
    const ss = (await sets()).sort((a, b) => a.doneAt - b.doneAt);
    expect(ss.map((s) => s.exerciseId)).toEqual(['cable-row-v-handle', 'cable-row-v-handle', expect.stringMatching(/^custom-/)]);
    expect(ss.map((s) => s.setNo)).toEqual([1, 2, 1]);
    expect(ss.every((s) => s.synced && s.workoutId === ws[0].id)).toBe(true);
    expect(await queue()).toEqual([]);
    const custom = await getAll<{ name: string; slot: string; muscle: string }>('customExercises');
    expect(custom).toHaveLength(1);
    expect(custom[0]).toMatchObject({ name: 'Mystery machine', slot: 'Other', muscle: 'Back' });

    const f2 = okFetch(data);
    expect(await importFromSheet(f2)).toEqual({ imported: 0 });
    expect(f2).not.toHaveBeenCalled();
    expect(await sets()).toHaveLength(3);
    expect(await getAll('customExercises')).toHaveLength(1);
  });

  it('does nothing when the app already has sets', async () => {
    await put('sets', mk('x'));
    const f = okFetch(data);
    expect(await importFromSheet(f)).toEqual({ imported: 0 });
    expect(f).not.toHaveBeenCalled();
  });

  it('does not import when the bridge fails', async () => {
    expect(await importFromSheet(okFetch({ ok: false, error: 'bad key' }))).toEqual({ imported: 0 });
    expect(await sets()).toEqual([]);
  });

  it('splits two days on the same date into two workouts', async () => {
    const f = okFetch({ ok: true, log: [
      { date: '2026-11-09', day: 'Legs A', exercise: 'Leg press', kg: 100, reps: 10 },
      { date: '2026-11-09', day: 'Chest+Back A', exercise: 'Smith flat press', kg: 40, reps: 10 },
    ] });
    await importFromSheet(f);
    expect((await getAll<Workout>('workouts')).map((w) => w.sessionId).sort()).toEqual(['CB-A', 'L-A']);
  });
});
