import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { closeDb, DEFAULT_SETTINGS, getAll, put, putAll, saveSettings, addCustomExercise } from '../src/lib/db';
import type { QueueItem } from '../src/lib/db';
import { _resetSyncState, _tune, ATTENTION_AFTER, attentionIds, backoffMs, flush, importFromSheet, onImported, scheduleFlush, startAutoSync, syncStatus } from '../src/lib/sync';
import type { SetLog, Workout } from '../src/lib/types';

const SETTINGS = { ...DEFAULT_SETTINGS, scriptUrl: 'https://script.example/exec', scriptKey: 'k3y' };
const mk = (id: string, over: Partial<SetLog> = {}): SetLog => ({
  id, workoutId: 'w1', date: '2026-11-09', sessionId: 'CB-A', exerciseId: 'cable-row-v-handle', setNo: 1, kg: 50, reps: 10,
  warmup: false, feltIt: false, doneAt: 1, updatedAt: 1, deleted: false, synced: false, ...over,
});
const enqueue = (s: SetLog, op: QueueItem['op'] = 'upsert') =>
  putAll([{ store: 'sets', value: s }, { store: 'queue', value: { id: s.id, op } }]);
/** Mock bridge: with no explicit body it acknowledges every id it was sent, like the real script. */
const okFetch = (body?: unknown) =>
  vi.fn(async (...a: Parameters<typeof fetch>) => {
    let res = body;
    if (res === undefined) {
      const req = JSON.parse((a[1] as RequestInit).body as string);
      res = { ok: true, acked: req.upserts.map((u: { id: string }) => u.id), skipped: [], deleted: req.deletes };
    }
    return { ok: true, json: async () => res } as Response;
  });
const bodyOf = (f: { mock: { calls: unknown[][] } }, i = 0) => JSON.parse((f.mock.calls[i][1] as RequestInit).body as string);
const queue = () => getAll<QueueItem>('queue');
const sets = () => getAll<SetLog>('sets');

beforeEach(async () => {
  await closeDb(true);
  _resetSyncState();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
      const req = JSON.parse((_a[1] as RequestInit).body as string);
      return { ok: true, json: async () => ({ ok: true, acked: req.upserts.map((u: { id: string }) => u.id), deleted: req.deletes }) } as Response;
    });
    await flush(f);
    expect(f).toHaveBeenCalledTimes(2);
    expect(bodyOf(f, 1).upserts[0].reps).toBe(12);
    expect(await queue()).toEqual([]);
  });

  it('only sets the bridge acknowledges are marked synced; skipped ones stay queued and flush reports not ok', async () => {
    await enqueue(mk('good'));
    await enqueue(mk('bad'));
    const f = okFetch({ ok: true, acked: ['good'], skipped: ['bad'], deleted: [] });
    const r = await flush(f);
    expect(r).toEqual({ sent: 1, ok: false });
    expect(f).toHaveBeenCalledTimes(1); // no endless retry loop within one flush
    expect(await queue()).toEqual([{ id: 'bad', op: 'upsert' }]);
    const byId = Object.fromEntries((await sets()).map((s) => [s.id, s.synced]));
    expect(byId).toEqual({ good: true, bad: false });
  });

  it('a response without an acked list acknowledges nothing', async () => {
    await enqueue(mk('a'));
    expect(await flush(okFetch({ ok: true }))).toEqual({ sent: 0, ok: false });
    expect(await queue()).toHaveLength(1);
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
    expect(await importFromSheet(f)).toMatchObject({ imported: 3 });
    expect(String(f.mock.calls[0][0])).toBe('https://script.example/exec'); // no key in the URL
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=utf-8');
    expect(bodyOf(f)).toEqual({ key: 'k3y', action: 'import' });
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
    expect(await importFromSheet(f2)).toMatchObject({ imported: 0 });
    expect(await sets()).toHaveLength(3);
    expect(await getAll('customExercises')).toHaveLength(1);
  });

  it('keeps the ids the bridge assigned to hand-typed rows, so a later edit/delete targets the same Sheet row', async () => {
    const withIds = { ok: true, log: [
      { id: 'gen-1', date: '2026-11-09', day: 'Chest+Back A', exercise: 'Smith flat press', kg: 40, reps: 10 },
      { id: 'gen-2', date: '2026-11-09', day: 'Chest+Back A', exercise: 'Smith flat press', kg: 40, reps: 9 },
    ] };
    await importFromSheet(okFetch(withIds));
    expect((await sets()).map((s) => s.id).sort()).toEqual(['gen-1', 'gen-2']);
    // editing an imported set sends an upsert with that same id
    const s = (await sets()).find((x) => x.id === 'gen-1')!;
    await enqueue({ ...s, reps: 11, updatedAt: s.updatedAt + 1, synced: false });
    const f = okFetch();
    await flush(f);
    expect(bodyOf(f).upserts[0]).toMatchObject({ id: 'gen-1', reps: 11 });
    // second import is a no-op
    expect(await importFromSheet(okFetch(withIds))).toMatchObject({ imported: 0 });
    expect(await sets()).toHaveLength(2);
  });

  it('no error text ever contains the key', async () => {
    const replies: Array<typeof fetch> = [
      okFetch({ ok: false, error: 'bad key' }),
      okFetch({ ok: false, error: 'busy' }),
      okFetch({ ok: false, error: 'oops k3y leaked' }) as unknown as typeof fetch,
      vi.fn(async (..._a: Parameters<typeof fetch>) => { throw new TypeError('offline https://script.example/exec k3y'); }),
      vi.fn(async (..._a: Parameters<typeof fetch>) => ({ ok: false, status: 500, json: async () => ({}) }) as Response),
    ];
    for (const f of replies) {
      const r = await importFromSheet(f);
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain('k3y');
    }
  });

  it('does not import when the bridge fails', async () => {
    expect(await importFromSheet(okFetch({ ok: false, error: 'bad key' }))).toMatchObject({ imported: 0 });
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

describe('flush order (F2)', () => {
  beforeEach(() => saveSettings(SETTINGS));
  it('sends sets sorted by date, then doneAt, then setNo, whatever the queue key order', async () => {
    await enqueue(mk('f0', { date: '2026-11-10', doneAt: 50, setNo: 1 }));
    await enqueue(mk('a1', { date: '2026-11-09', doneAt: 300, setNo: 3 }));
    await enqueue(mk('3c', { date: '2026-11-09', doneAt: 100, setNo: 1 }));
    await enqueue(mk('b2', { date: '2026-11-09', doneAt: 200, setNo: 2 }));
    const f = okFetch();
    await flush(f);
    expect(bodyOf(f).upserts.map((u: { id: string }) => u.id)).toEqual(['3c', 'b2', 'a1', 'f0']);
  });
  it('keeps the order across batches (oldest 50 first)', async () => {
    for (let i = 0; i < 60; i++) await enqueue(mk(`z${59 - i}`, { doneAt: 1000 - i, setNo: 1 })); // z0 is the newest
    const f = okFetch();
    await flush(f);
    const first = bodyOf(f, 0).upserts.map((u: { id: string }) => u.id);
    expect(first[0]).toBe('z0'); // z0 has the oldest doneAt
    expect(first).toHaveLength(50);
    expect(bodyOf(f, 1).upserts.map((u: { id: string }) => u.id)).toEqual(['z50', 'z51', 'z52', 'z53', 'z54', 'z55', 'z56', 'z57', 'z58', 'z59']);
  });
});

describe('request details', () => {
  beforeEach(() => saveSettings(SETTINGS));
  afterEach(() => _tune({}));
  it('aborts a hung request after the timeout and keeps the queue', async () => {
    _tune({ requestMs: 30 });
    await enqueue(mk('a'));
    let aborted = false;
    const f = vi.fn((_u: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_res, rej) => {
      init!.signal!.addEventListener('abort', () => { aborted = true; rej(new DOMException('aborted', 'AbortError')); });
    }));
    expect(await flush(f as unknown as typeof fetch)).toEqual({ sent: 0, ok: false });
    expect(aborted).toBe(true);
    expect(await queue()).toHaveLength(1);
  });
  it('keepalive is passed when asked for', async () => {
    await enqueue(mk('a'));
    const f = okFetch();
    await flush(f, { keepalive: true });
    expect((f.mock.calls[0][1] as RequestInit).keepalive).toBe(true);
  });
  it('backoff doubles from 5 s up to 5 min', () => {
    expect([1, 2, 3, 4, 7, 20].map(backoffMs)).toEqual([5000, 10000, 20000, 40000, 300000, 300000]);
  });
});

describe('needs attention', () => {
  beforeEach(() => saveSettings(SETTINGS));
  it('an entry the bridge keeps skipping stops blocking after N attempts, stays queued and local, and is surfaced', async () => {
    await enqueue(mk('bad'));
    await enqueue(mk('good', { doneAt: 2 }));
    const ackGood = () => vi.fn(async (...a: Parameters<typeof fetch>) => {
      const req = JSON.parse((a[1] as RequestInit).body as string);
      const ids = req.upserts.map((u: { id: string }) => u.id);
      return { ok: true, json: async () => ({ ok: true, acked: ids.filter((i: string) => i !== 'bad'), skipped: ids.filter((i: string) => i === 'bad'), deleted: [] }) } as Response;
    });
    for (let i = 0; i < ATTENTION_AFTER; i++) {
      const r = await flush(ackGood());
      expect(r.ok).toBe(i === ATTENTION_AFTER - 1); // the last skip parks the entry, so it no longer blocks
    }
    expect(await attentionIds()).toEqual(['bad']);
    expect(await syncStatus()).toBe('attention');
    const f = okFetch();
    expect(await flush(f)).toEqual({ sent: 0, ok: true });
    expect(f).not.toHaveBeenCalled(); // not retried
    expect(await queue()).toEqual([{ id: 'bad', op: 'upsert' }]);
    expect((await sets()).find((x) => x.id === 'bad')).toBeTruthy();
  });
  it('editing the set gives it a fresh chance', async () => {
    const bad = mk('bad');
    await enqueue(bad);
    for (let i = 0; i < ATTENTION_AFTER; i++) await flush(okFetch({ ok: true, acked: [], skipped: ['bad'], deleted: [] }));
    expect(await attentionIds()).toEqual(['bad']);
    await enqueue({ ...bad, reps: 11, updatedAt: 9 });
    expect(await attentionIds()).toEqual([]);
    expect(await flush(okFetch())).toEqual({ sent: 1, ok: true });
  });
});

describe('import merges into an app that already has sets (M5, M7)', () => {
  beforeEach(() => saveSettings(SETTINGS));
  const rows = (ids: string[]) => ({ ok: true, log: ids.map((id, i) => ({ id, date: '2026-11-02', day: 'Legs A', exercise: 'Leg press', kg: 100, reps: 10 - i })) });
  it('adds only rows whose id is unknown, never duplicates, and is a no-op the second time', async () => {
    await put('sets', mk('mine', { date: '2026-11-09' }));
    const f1 = okFetch(rows(['h1', 'h2', 'mine']));
    expect(await importFromSheet(f1)).toMatchObject({ imported: 2 });
    expect((await sets()).map((x) => x.id).sort()).toEqual(['h1', 'h2', 'mine']);
    expect(await importFromSheet(okFetch(rows(['h1', 'h2', 'mine'])))).toMatchObject({ imported: 0 });
    expect(await sets()).toHaveLength(3);
  });
  it('does not resurrect a set that was deleted locally (its id still exists)', async () => {
    await put('sets', mk('gone', { deleted: true }));
    expect(await importFromSheet(okFetch(rows(['gone'])))).toMatchObject({ imported: 0 });
  });
  it('does not create custom exercises for rows it will not import', async () => {
    await put('sets', mk('gone'));
    const f = okFetch({ ok: true, log: [{ id: 'gone', date: '2026-11-09', day: 'Legs A', exercise: 'Unknown thing', kg: 1, reps: 1 }] });
    await importFromSheet(f);
    expect(await getAll('customExercises')).toEqual([]);
  });
  it('tells listeners so the workout store can refresh its custom-exercise cache', async () => {
    const seen: number[] = [];
    const off = onImported((info) => seen.push(info.imported));
    await importFromSheet(okFetch({ ok: true, log: [{ id: 'n1', date: '2026-11-02', day: 'Legs A', exercise: 'Mystery', kg: 1, reps: 5 }] }));
    off();
    expect(seen).toEqual([1]);
    await importFromSheet(okFetch({ ok: true, log: [] }));
    expect(seen).toEqual([1]);
  });
});

describe('auto sync', () => {
  beforeEach(async () => {
    await saveSettings(SETTINGS);
    _tune({ debounceMs: 15 });
  });
  afterEach(() => _tune({}));
  const stub = () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    return f;
  };
  const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

  it('scheduleFlush does nothing before startAutoSync', async () => {
    const f = stub();
    await enqueue(mk('a'));
    scheduleFlush();
    await settle();
    expect(f).not.toHaveBeenCalled();
  });
  it('after start: flushes on start, debounces bursts into one flush, flushes on online, hidden and pagehide (keepalive)', async () => {
    const f = stub();
    await enqueue(mk('a'));
    startAutoSync();
    startAutoSync(); // idempotent
    await settle();
    expect(f).toHaveBeenCalledTimes(1);
    await enqueue(mk('b'));
    scheduleFlush(); scheduleFlush(); scheduleFlush();
    await settle();
    expect(f).toHaveBeenCalledTimes(2);
    await enqueue(mk('c'));
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(f).toHaveBeenCalledTimes(3);
    await enqueue(mk('d'));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(f).toHaveBeenCalledTimes(4);
    expect((f.mock.calls[3][1] as RequestInit).keepalive).toBe(true);
    await enqueue(mk('e'));
    window.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(f).toHaveBeenCalledTimes(5);
    expect((f.mock.calls[4][1] as RequestInit).keepalive).toBe(true);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await enqueue(mk('f'));
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(f).toHaveBeenCalledTimes(6);
  });
  it('retries after a failure with backoff', async () => {
    _tune({ debounceMs: 15, backoffBaseMs: 10 });
    const f = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', f);
    await enqueue(mk('a'));
    startAutoSync();
    await vi.waitFor(() => expect(f.mock.calls.length).toBeGreaterThanOrEqual(3), { timeout: 2000 });
  });
});
