import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getAll, loadSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import { WorkoutStore } from '../src/lib/workout.svelte';
import { homeNotes, mergeVisit, visitKeysInWeek, workoutSummary } from '../src/lib/stats';
import { nextSession } from '../src/lib/selection';
import { TEMPLATES } from '../src/lib/seed';
import { estimateMinutes } from '../src/lib/workoutView';
import type { SetLog, Workout } from '../src/lib/types';

const at = (d: number, h = 7, mi = 0) => new Date(2026, 10, d, h, mi).getTime();
const MIN = 60_000;
const FIRST = 'converging-chest-press';

beforeEach(async () => {
  await closeDb(true);
});
afterEach(() => vi.restoreAllMocks());

describe('defaults', () => {
  it('weekly target 6 (Mon-Sat) and body weight 65 kg', async () => {
    expect(DEFAULT_SETTINGS.weeklyTarget).toBe(6);
    expect(DEFAULT_SETTINGS.bodyKg).toBe(65);
    expect((await loadSettings()).bodyKg).toBe(65);
  });

  it('Chest + Back B estimates about 70 min', () => {
    // 12 compound sets (180 s rest) + 4 isolation sets (120 s rest).
    const rests = [...Array(12).fill(180), ...Array(4).fill(120)];
    expect(estimateMinutes(rests)).toBe(70);
  });
});

describe('auto-end never blocks logging (I2)', () => {
  it('set, 20 min gap with the timer firing, set: both saved in one workout', async () => {
    const s = new WorkoutStore();
    const w = await s.startWorkout('CB-B', at(11, 7));
    await s.completeSet(FIRST, 1, 40, 10, at(11, 7, 3));
    expect(await s.checkAutoEnd(at(11, 7, 20))).toBe(false);
    const { set } = await s.completeSet(FIRST, 2, 40, 10, at(11, 7, 23));
    expect(set.workoutId).toBe(w.id);
    expect(await getAll<Workout>('workouts')).toHaveLength(1);
    expect(s.active).toBe(true);
  });

  it('set, 61 min gap (timer auto-ends), set: no error, the same workout continues', async () => {
    const s = new WorkoutStore();
    const w = await s.startWorkout('CB-B', at(11, 7));
    await s.completeSet(FIRST, 1, 40, 10, at(11, 7, 3));
    expect(await s.checkAutoEnd(at(11, 8, 5))).toBe(true);
    expect(s.current?.autoEnded).toBe(true);
    expect(s.canResume(at(11, 8, 5))).toBe(true);
    const { set } = await s.completeSet(FIRST, 2, 40, 10, at(11, 8, 6));
    expect(set.workoutId).toBe(w.id);
    expect(s.active).toBe(true);
    const all = await getAll<Workout>('workouts');
    expect(all).toHaveLength(1);
    expect(all[0].endedAt).toBeUndefined();
    expect(s.sets).toHaveLength(2);
  });

  it('a 16-min warm-up before the first set does not end the workout', async () => {
    const s = new WorkoutStore();
    const w = await s.startWorkout('CB-B', at(11, 7));
    expect(await s.checkAutoEnd(at(11, 7, 16))).toBe(false);
    const { set } = await s.completeSet(FIRST, 1, 40, 10, at(11, 7, 17));
    expect(set.workoutId).toBe(w.id);
  });

  it('resume() reopens an auto-ended workout of today; not a finished one, not tomorrow', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', at(11, 7));
    await s.completeSet(FIRST, 1, 40, 10, at(11, 7, 3));
    await s.checkAutoEnd(at(11, 8, 30));
    expect(s.canResume(at(12, 7))).toBe(false);
    await s.resume(at(11, 9));
    expect(s.active).toBe(true);
    await s.finish(at(11, 9, 30));
    expect(s.canResume(at(11, 9, 31))).toBe(false);
    await expect(s.resume(at(11, 9, 31))).rejects.toThrow();
  });

  it('after a restart the auto-ended workout can still be continued', async () => {
    const s = new WorkoutStore();
    const w = await s.startWorkout('CB-B', at(11, 7));
    await s.completeSet(FIRST, 1, 40, 10, at(11, 7, 3));
    const fresh = new WorkoutStore();
    await fresh.restore(at(11, 8, 30));
    expect(fresh.active).toBe(false);
    expect(fresh.canResume(at(11, 8, 30))).toBe(true);
    const { set } = await fresh.completeSet(FIRST, 2, 40, 10, at(11, 8, 31));
    expect(set.workoutId).toBe(w.id);
  });
});

describe('a very long break (> 3 h after auto-end) is still one visit', () => {
  async function splitVisit() {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', at(11, 7));
    await s.completeSet(FIRST, 1, 40, 10, at(11, 7, 5));
    // Back in the afternoon: the next set opens a second workout of the same session.
    await s.completeSet(FIRST, 2, 40, 10, at(11, 12, 45));
    const workouts = await getAll<Workout>('workouts');
    const sets = await getAll<SetLog>('sets');
    expect(workouts).toHaveLength(2);
    return { s, workouts, sets };
  }

  it('counts one session on Home and in the week', async () => {
    const { workouts, sets } = await splitVisit();
    expect(visitKeysInWeek(workouts, sets, '2026-11-11').size).toBe(1);
    expect(homeNotes(sets, workouts, { ...DEFAULT_SETTINGS }, '2026-11-11')[0]).toBe('1 of 6 sessions done this week');
  });

  it('nextSession still moves on to the next group', async () => {
    const { workouts } = await splitVisit();
    expect(nextSession(workouts, TEMPLATES)).toBe('L-A');
  });

  it('the summary covers both halves', async () => {
    const { s, workouts, sets } = await splitVisit();
    const v = mergeVisit(s.current!, workouts, sets);
    expect(v.workout.startedAt).toBe(at(11, 7));
    const sum = workoutSummary(v.workout, v.sets, 65);
    expect(sum.sets).toBe(2);
  });
});

describe('store guards', () => {
  it('ready is false until restore finishes', async () => {
    const s = new WorkoutStore();
    expect(s.ready).toBe(false);
    await s.restore();
    expect(s.ready).toBe(true);
  });

  it('startWorkout twice in a row opens one workout', async () => {
    const s = new WorkoutStore();
    await s.restore(at(11, 7));
    const [a, b] = await Promise.all([s.startWorkout('CB-B', at(11, 7)), s.startWorkout('CB-B', at(11, 7))]);
    expect(b.id).toBe(a.id);
    expect(await getAll<Workout>('workouts')).toHaveLength(1);
  });

  it('discards an empty workout, refuses one with sets', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', at(11, 7));
    await s.discard();
    expect(s.current).toBeNull();
    expect(await getAll<Workout>('workouts')).toHaveLength(0);

    await s.startWorkout('CB-B', at(11, 8));
    await s.completeSet(FIRST, 1, 40, 10, at(11, 8, 2));
    await expect(s.discard()).rejects.toThrow();
    expect(await getAll<Workout>('workouts')).toHaveLength(1);
  });
});

describe('rest state survives a restart', () => {
  it('+15 is kept', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', at(11, 7));
    await s.completeSet(FIRST, 1, 40, 10, at(11, 7, 1));
    const base = at(11, 7, 1) + 180_000;
    expect(s.restEndsAt).toBe(base);
    await s.addRest(15, at(11, 7, 2));
    expect(s.restEndsAt).toBe(base + 15_000);
    const fresh = new WorkoutStore();
    await fresh.restore(at(11, 7, 3));
    expect(fresh.restEndsAt).toBe(base + 15_000);
  });

  it('Skip is kept until the next set', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', at(11, 7));
    await s.completeSet(FIRST, 1, 40, 10, at(11, 7, 1));
    await s.skipRest();
    expect(s.restEndsAt).toBeNull();
    const fresh = new WorkoutStore();
    await fresh.restore(at(11, 7, 2));
    expect(fresh.restEndsAt).toBeNull();
    await fresh.completeSet(FIRST, 2, 40, 10, at(11, 7, 4));
    expect(fresh.restEndsAt).toBe(at(11, 7, 4) + 180_000);
  });

  it('+15 after zero counts from now', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', at(11, 7));
    await s.completeSet(FIRST, 1, 40, 10, at(11, 7, 1));
    await s.addRest(15, at(11, 7, 10));
    expect(s.restEndsAt).toBe(at(11, 7, 10) + 15_000);
  });
});

import { putAll, saveSettings } from '../src/lib/db';
import { _resetSyncState, _tune, flush, importFromSheet, lastSyncAt, onSyncChange, syncLabel, testConnection } from '../src/lib/sync';

describe('sync wiring', () => {
  const SETTINGS = { ...DEFAULT_SETTINGS, scriptUrl: 'https://script.google.com/macros/s/X/exec', scriptKey: 'k' };
  const mk = (id: string): SetLog => ({
    id, workoutId: 'w1', date: '2026-11-09', sessionId: 'CB-A', exerciseId: 'cable-row-v-handle', setNo: 1, kg: 50, reps: 10,
    warmup: false, feltIt: false, doneAt: 1, updatedAt: 1, deleted: false, synced: false,
  });
  const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);
  beforeEach(() => _resetSyncState());

  it('labels every status for Home', () => {
    const t = new Date(2026, 10, 11, 8, 12).getTime();
    expect(syncLabel('not-set-up', null)).toEqual({ text: 'Saved on phone', warn: false });
    expect(syncLabel('synced', t)).toEqual({ text: 'Synced 8:12 am', warn: false });
    expect(syncLabel('synced', null)).toEqual({ text: 'Synced', warn: false });
    expect(syncLabel('pending', t)).toEqual({ text: 'Saved on phone · syncing', warn: false });
    expect(syncLabel('offline', t)).toEqual({ text: 'Offline · saved on phone', warn: true });
    expect(syncLabel('attention', t)).toEqual({ text: 'Sheet needs a look', warn: true });
  });

  it('records the last sync time and tells listeners after a flush', async () => {
    await saveSettings(SETTINGS);
    await putAll([{ store: 'sets', value: mk('a') }, { store: 'queue', value: { id: 'a', op: 'upsert' } }]);
    const seen = vi.fn();
    const off = onSyncChange(seen);
    await flush(reply({ ok: true, acked: ['a'], skipped: [], deleted: [] }));
    off();
    expect(seen).toHaveBeenCalled();
    expect(await lastSyncAt()).toBeGreaterThan(0);
  });

  it('testConnection: ok, bad key, not a web app, offline', async () => {
    await saveSettings(SETTINGS);
    expect(await testConnection(reply({ ok: true, log: [], exercises: [] }))).toEqual({ ok: true, rows: 0 });
    expect(await testConnection(reply({ ok: false, error: 'bad key' }))).toEqual({ ok: false, error: 'The key does not match the one in the script' });
    expect((await testConnection(vi.fn(async () => ({ ok: true, json: async () => { throw new Error('html'); } }) as unknown as Response))).ok).toBe(false);
    expect(await testConnection(vi.fn(async () => { throw new TypeError('offline'); }))).toMatchObject({ ok: false, error: expect.stringMatching(/reach/) });
  });

  it('testConnection rejects a URL that is not a deployed web app', async () => {
    await saveSettings({ ...SETTINGS, scriptUrl: 'https://script.google.com/macros/s/X/dev' });
    const f = reply({ ok: true, log: [] });
    expect(await testConnection(f)).toMatchObject({ ok: false, error: expect.stringMatching(/\/exec/) });
    expect(f).not.toHaveBeenCalled();
  });

  it('a slow first import times out with a "try again" message, and trying again is safe', async () => {
    _tune({ importMs: 20 });
    await saveSettings(SETTINGS);
    const slow = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_ok, bad) => init?.signal?.addEventListener('abort', () => bad(new DOMException('aborted', 'AbortError')))));
    const r = await importFromSheet(slow as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, imported: 0 });
    expect(r.error).toMatch(/Try again/);
    _tune({});
    const row = { id: 'r1', date: '2026-11-09', day: 'Chest+Back A', exercise: 'Smith flat press', kg: 60, reps: 8 };
    expect(await importFromSheet(reply({ ok: true, log: [row], exercises: [] }))).toMatchObject({ ok: true, imported: 1 });
    expect(await importFromSheet(reply({ ok: true, log: [row], exercises: [] }))).toMatchObject({ ok: true, imported: 0 });
  });

  it('importFromSheet reports ok and errors', async () => {
    await saveSettings(SETTINGS);
    expect(await importFromSheet(reply({ ok: true, log: [], exercises: [] }))).toMatchObject({ imported: 0, ok: true });
    expect(await importFromSheet(reply({ ok: false, error: 'bad key' }))).toMatchObject({ imported: 0, ok: false });
  });
});
