import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { addCustomExercise, closeDb, exerciseLookup, getAll, listExercises, saveSettings, updateSettings, loadSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import type { QueueItem } from '../src/lib/db';
import { WorkoutStore } from '../src/lib/workout.svelte';
import { exerciseById, swapOptions } from '../src/lib/seed';
import type { Exercise, SetLog, Workout } from '../src/lib/types';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const MIN = 60_000;
const T0 = at(2026, 11, 11, 7, 0);
const FIRST = 'converging-chest-press'; // first exercise of CB-B, compound
const queue = () => getAll<QueueItem>('queue');
const sets = () => getAll<SetLog>('sets');

beforeEach(async () => {
  await closeDb(true);
});
afterEach(() => vi.restoreAllMocks());

describe('workout store', () => {
  it('startWorkout then completeSet writes a set with the start date and enqueues an upsert', async () => {
    const s = new WorkoutStore();
    const w = await s.startWorkout('CB-B', T0);
    const { set, pr } = await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    expect(pr).toBe(false);
    expect(set).toMatchObject({ workoutId: w.id, date: '2026-11-11', sessionId: 'CB-B', exerciseId: FIRST, setNo: 1, kg: 40, reps: 10, doneAt: T0 + MIN });
    expect(await sets()).toHaveLength(1);
    expect(await queue()).toEqual([{ id: set.id, op: 'upsert' }]);
  });

  it('re-completing the same set keeps its id', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const a = await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    const b = await s.completeSet(FIRST, 1, 42.5, 8, T0 + 2 * MIN);
    expect(b.set.id).toBe(a.set.id);
    expect(b.set).toMatchObject({ kg: 42.5, reps: 8, doneAt: T0 + MIN, updatedAt: T0 + 2 * MIN }); // an edit, not a new completion
    expect(await sets()).toHaveLength(1);
  });

  it('restores in-progress workout', async () => {
    const s = new WorkoutStore();
    const w = await s.startWorkout('CB-B', T0);
    await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    const last = await s.completeSet(FIRST, 2, 40, 9, T0 + 5 * MIN);
    expect(s.restEndsAt).toBe(T0 + 5 * MIN + 180_000);

    const fresh = new WorkoutStore();
    await fresh.restore(T0 + 6 * MIN);
    expect(fresh.active).toBe(true);
    expect(fresh.current?.id).toBe(w.id);
    expect(fresh.sets.map((x) => x.id).sort()).toEqual([...(await sets()).map((x) => x.id)].sort());
    expect(fresh.sets.find((x) => x.id === last.set.id)?.reps).toBe(9);
    expect(fresh.restEndsAt).toBe(T0 + 5 * MIN + 180_000);
  });

  it('sets keep workout start date', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', at(2026, 11, 11, 23, 55));
    const { set } = await s.completeSet(FIRST, 1, 40, 10, at(2026, 11, 12, 0, 10));
    expect(set.date).toBe('2026-11-11');
    const fresh = new WorkoutStore();
    await fresh.restore(at(2026, 11, 12, 0, 12));
    expect(fresh.active).toBe(true);
    expect(fresh.current?.date).toBe('2026-11-11');
  });

  it('auto-ends 15 min after the last done set when restored later', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    const fresh = new WorkoutStore();
    await fresh.restore(T0 + MIN + 16 * MIN);
    expect(fresh.active).toBe(false);
    expect(fresh.current?.endedAt).toBe(T0 + MIN + 15 * MIN);
    expect(fresh.restEndsAt).toBeNull();
    const saved = (await getAll<Workout>('workouts'))[0];
    expect(saved.endedAt).toBe(T0 + 16 * MIN);
    // and a second restore does not reopen it
    const again = new WorkoutStore();
    await again.restore(T0 + 60 * MIN);
    expect(again.active).toBe(false);
  });

  it('does not auto-end within 15 min', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    const fresh = new WorkoutStore();
    await fresh.restore(T0 + MIN + 14 * MIN);
    expect(fresh.active).toBe(true);
  });

  it('finish ends the workout and clears the rest timer', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    const w = await s.finish(T0 + 30 * MIN);
    expect(w.endedAt).toBe(T0 + 30 * MIN);
    expect(s.restEndsAt).toBeNull();
    const fresh = new WorkoutStore();
    await fresh.restore(T0 + 31 * MIN);
    expect(fresh.active).toBe(false);
  });

  it('deleteSet undo within 5 s restores; after 5 s it is a no-op and the queue holds a delete', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(T0);
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const { set } = await s.completeSet(FIRST, 1, 40, 10, T0);

    const undo = await s.deleteSet(set.id);
    expect(s.sets).toHaveLength(0);
    expect((await queue())[0]).toEqual({ id: set.id, op: 'delete' });
    now.mockReturnValue(T0 + 4_000);
    await undo();
    expect(s.sets.map((x) => x.id)).toEqual([set.id]);
    expect((await sets())[0].deleted).toBe(false);
    expect((await queue())[0]).toEqual({ id: set.id, op: 'upsert' });

    now.mockReturnValue(T0 + 10_000);
    const undo2 = await s.deleteSet(set.id);
    now.mockReturnValue(T0 + 10_000 + 5_001);
    await undo2();
    expect(s.sets).toHaveLength(0);
    expect((await sets())[0].deleted).toBe(true);
    expect((await queue())[0]).toEqual({ id: set.id, op: 'delete' });
  });

  it('a deleted last set no longer drives the rest timer', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    const b = await s.completeSet(FIRST, 2, 40, 10, T0 + 4 * MIN);
    await s.deleteSet(b.set.id);
    expect(s.restEndsAt).toBe(T0 + MIN + 180_000);
  });

  it('rest uses isolation default, settings override, and the 300 s cap', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    await s.completeSet('pec-fly-machine', 1, 30, 12, T0);
    expect(s.restEndsAt).toBe(T0 + 120_000);
    await saveSettings({ ...DEFAULT_SETTINGS, restOverrides: { 'pec-fly-machine': 900 } });
    const s2 = new WorkoutStore();
    await s2.restore(T0 + 1000);
    expect(s2.restEndsAt).toBe(T0 + 300_000);
  });

  it('swap(false) affects only this workout; swap(true) changes the template for future workouts', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const alt = swapOptions('pec-fly-machine').find((e) => e.id !== 'pec-fly-machine')!;
    await s.swap('pec-fly-machine', alt.id, false);
    expect(s.plannedSets().some((p) => p.exerciseId === alt.id)).toBe(true);
    await s.finish(T0 + MIN);

    const next = new WorkoutStore();
    await next.startWorkout('CB-B', T0 + 24 * 60 * MIN);
    expect(next.plannedSets().some((p) => p.exerciseId === alt.id)).toBe(false);
    expect(next.plannedSets().some((p) => p.exerciseId === 'pec-fly-machine')).toBe(true);
    await next.swap('pec-fly-machine', alt.id, true);
    await next.finish(T0 + 25 * 60 * MIN);

    const third = new WorkoutStore();
    await third.startWorkout('CB-B', T0 + 48 * 60 * MIN);
    expect(third.plannedSets().some((p) => p.exerciseId === alt.id)).toBe(true);
    expect(third.plannedSets().some((p) => p.exerciseId === 'pec-fly-machine')).toBe(false);
  });

  it('plannedSets gives targets and last-time sets from earlier workouts only', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    await s.finish(T0 + 10 * MIN);

    const next = new WorkoutStore();
    await next.startWorkout('CB-B', T0 + 24 * 60 * MIN);
    const p = next.plannedSets().filter((x) => x.exerciseId === FIRST);
    expect(p).toHaveLength(3);
    expect(p[0].last?.kg).toBe(40);
    expect(p[0].target).toEqual({ kg: 40, reps: 11 });
    expect(p[1].last).toBeNull();
  });

  it('flags a PR against earlier workouts and earlier sets of this workout', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    await s.finish(T0 + 5 * MIN);
    const n = new WorkoutStore();
    await n.startWorkout('CB-B', T0 + 24 * 60 * MIN);
    expect((await n.completeSet(FIRST, 1, 40, 10, T0 + 25 * 60 * MIN)).pr).toBe(false);
    expect((await n.completeSet(FIRST, 2, 40, 11, T0 + 25 * 60 * MIN + MIN)).pr).toBe(true);
    expect((await n.completeSet(FIRST, 3, 40, 11, T0 + 25 * 60 * MIN + 2 * MIN)).pr).toBe(false);
  });

  it('marking a set as warm-up keeps working-set numbering contiguous', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const w1 = await s.completeSet(FIRST, 1, 20, 10, T0 + MIN);
    await s.completeSet(FIRST, 2, 40, 10, T0 + 3 * MIN);
    await s.completeSet(FIRST, 3, 40, 9, T0 + 6 * MIN);
    await s.editSet(w1.set.id, { warmup: true });
    const byId = Object.fromEntries(s.sets.map((x) => [x.kg + '/' + x.reps, x.setNo]));
    expect(byId['20/10']).toBe(0);
    expect(byId['40/10']).toBe(1);
    expect(byId['40/9']).toBe(2);
    expect((await sets()).find((x) => x.id === w1.set.id)?.warmup).toBe(true);
    expect((await queue()).every((q) => q.op === 'upsert')).toBe(true);

    await s.finish(T0 + 10 * MIN);
    const n = new WorkoutStore();
    await n.startWorkout('CB-B', T0 + 24 * 60 * MIN);
    const p = n.plannedSets().filter((x) => x.exerciseId === FIRST);
    expect(p[0].target).toEqual({ kg: 40, reps: 11 });
    expect(p[1].target).toEqual({ kg: 40, reps: 10 });
  });

  it('editSet updates a set and queues an upsert', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const { set } = await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    await s.editSet(set.id, { kg: 42.5, feltIt: true, note: 'tough' });
    expect(s.sets[0]).toMatchObject({ kg: 42.5, feltIt: true, note: 'tough' });
    expect((await sets())[0]).toMatchObject({ kg: 42.5, feltIt: true, note: 'tough' });
  });
});

describe('review fixes', () => {
  it('I1: undo after re-logging the same set number does not create a duplicate', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const a = await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    const undo = await s.deleteSet(a.set.id, T0 + MIN + 1000);
    await s.completeSet(FIRST, 1, 40, 10, T0 + MIN + 2000);
    await undo(T0 + MIN + 3000);
    expect(s.sets.filter((x) => x.exerciseId === FIRST && x.setNo === 1)).toHaveLength(1);
    const live = (await sets()).filter((x) => !x.deleted && x.setNo === 1);
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(a.set.id);
  });

  it('I2: editing a deleted set throws and never re-upserts it', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const a = await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    await s.deleteSet(a.set.id, T0 + MIN);
    await expect(s.editSet(a.set.id, { kg: 50 })).rejects.toThrow(/deleted/);
    expect(await queue()).toEqual([{ id: a.set.id, op: 'delete' }]);
  });

  it('I2b: deleting an old-history set queues a delete, undo queues an upsert', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const a = await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    await s.finish(T0 + 2 * MIN);
    const n = new WorkoutStore();
    await n.startWorkout('CB-B', T0 + 24 * 60 * MIN);
    const undo = await n.deleteSet(a.set.id, T0 + 25 * 60 * MIN);
    expect((await queue())[0].op).toBe('delete');
    await undo(T0 + 25 * 60 * MIN + 1000);
    expect((await queue())[0].op).toBe('upsert');
  });

  it('I3: a permanent swap keeps settings saved elsewhere after the workout started', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    await updateSettings({ scriptUrl: 'https://x.test/exec', scriptKey: 'k', restOverrides: { [FIRST]: 60 } });
    const alt = swapOptions('pec-fly-machine').find((e) => e.id !== 'pec-fly-machine')!;
    await s.swap('pec-fly-machine', alt.id, true);
    const saved = await loadSettings();
    expect(saved).toMatchObject({ scriptUrl: 'https://x.test/exec', scriptKey: 'k', restOverrides: { [FIRST]: 60 } });
    expect(saved.templateOverrides['CB-B']).toEqual({ 'pec-fly-machine': alt.id });
    expect(s.restSecFor(FIRST)).toBe(60); // in-memory copy refreshed too
  });

  it('I3b: store.updateSettings merges into the stored row and refreshes memory', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    await s.updateSettings({ weeklyTarget: 5 });
    await s.updateSettings({ scriptUrl: 'u' });
    expect(await loadSettings()).toMatchObject({ weeklyTarget: 5, scriptUrl: 'u' });
    expect(s.settings).toMatchObject({ weeklyTarget: 5, scriptUrl: 'u' });
  });

  it('I3c: updateSettings is atomic against concurrent updates', async () => {
    await Promise.all([updateSettings({ scriptUrl: 'a' }), updateSettings({ scriptKey: 'b' }), updateSettings({ weeklyTarget: 3 })]);
    expect(await loadSettings()).toMatchObject({ scriptUrl: 'a', scriptKey: 'b', weeklyTarget: 3 });
  });

  it('I4: checkAutoEnd ends a stale workout at last set + 15 min without a restart', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    expect(await s.checkAutoEnd(T0 + MIN + 14 * MIN)).toBe(false);
    expect(s.active).toBe(true);
    expect(await s.checkAutoEnd(T0 + MIN + 16 * MIN)).toBe(true);
    expect(s.active).toBe(false);
    expect(s.current?.endedAt).toBe(T0 + 16 * MIN);
    expect(s.restEndsAt).toBeNull();
    expect((await getAll<Workout>('workouts'))[0].endedAt).toBe(T0 + 16 * MIN);
    expect(await s.checkAutoEnd(T0 + 99 * MIN)).toBe(false);
  });

  it('I4b: a set logged > 15 min after the last one ends the old workout and joins a new one', async () => {
    const s = new WorkoutStore();
    const w1 = await s.startWorkout('CB-B', T0);
    await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    const { set } = await s.completeSet(FIRST, 2, 40, 10, T0 + 2 * 60 * MIN);
    const all = await getAll<Workout>('workouts');
    expect(all).toHaveLength(2);
    expect(all.find((w) => w.id === w1.id)?.endedAt).toBe(T0 + 16 * MIN);
    expect(set.workoutId).not.toBe(w1.id);
    expect(s.current?.id).toBe(set.workoutId);
    expect(s.current).toMatchObject({ sessionId: 'CB-B', startedAt: T0 + 2 * 60 * MIN });
    expect(s.active).toBe(true);
    expect(s.sets).toHaveLength(1);
  });

  it('I4c: a workout with no sets yet is not split by a late first set', async () => {
    const s = new WorkoutStore();
    const w = await s.startWorkout('CB-B', T0);
    const { set } = await s.completeSet(FIRST, 1, 40, 10, T0 + 20 * MIN);
    expect(set.workoutId).toBe(w.id);
    expect(await getAll('workouts')).toHaveLength(1);
  });

  it('M1: warm-up renumbering is a single transaction', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const w1 = await s.completeSet(FIRST, 1, 20, 10, T0 + MIN);
    await s.completeSet(FIRST, 2, 40, 10, T0 + 3 * MIN);
    await s.completeSet(FIRST, 3, 40, 9, T0 + 6 * MIN);
    const { openDb } = await import('../src/lib/db');
    const db = await openDb();
    let txs = 0;
    const orig = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation(((...a: Parameters<typeof orig>) => {
      if (a[1] === 'readwrite') txs++;
      return orig(...a);
    }) as never);
    await s.editSet(w1.set.id, { warmup: true });
    expect(txs).toBe(1);
  });

  it('M2/M3: logging an already-done setNo edits that set (keeps id and doneAt) and PR ignores later sets', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const a = await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    await s.completeSet(FIRST, 2, 60, 10, T0 + 5 * MIN);
    const again = await s.completeSet(FIRST, 1, 45, 10, T0 + 6 * MIN);
    expect(again.set.id).toBe(a.set.id);
    expect(again.set.doneAt).toBe(T0 + MIN);
    expect(again.pr).toBe(false); // set 2 (60 kg) came later, so it is not "prior"
    expect(s.sets).toHaveLength(2);
  });

  it('M4: editSet and deleteSet take an injectable now', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const a = await s.completeSet(FIRST, 1, 40, 10, T0 + MIN);
    await s.editSet(a.set.id, { kg: 41 }, T0 + 2 * MIN);
    expect((await sets())[0].updatedAt).toBe(T0 + 2 * MIN);
    const undo = await s.deleteSet(a.set.id, T0 + 3 * MIN);
    await undo(T0 + 3 * MIN + 5_001);
    expect(s.sets).toHaveLength(0);
    await undo(T0 + 3 * MIN + 4_000); // already expired and consumed
    expect(s.sets).toHaveLength(0);
  });
});

describe('custom exercises', () => {
  const input = (o: Partial<Omit<Exercise, 'id'>> = {}): Omit<Exercise, 'id'> => ({
    name: 'Cable crossover low', slot: exerciseById('pec-fly-machine')!.slot, muscle: 'Chest', kind: 'isolation',
    step: 2.5, repMin: 10, repMax: 15, restSec: undefined as unknown as number, ...o,
  });

  it('addCustomExercise creates a custom- id with default rest by kind', async () => {
    const a = await addCustomExercise(input());
    expect(a.id).toMatch(/^custom-[0-9a-f-]{36}$/);
    expect(a.restSec).toBe(120);
    const b = await addCustomExercise(input({ name: 'Pause squat', kind: 'compound' }));
    expect(b.restSec).toBe(180);
    const c = await addCustomExercise(input({ name: 'Own rest', restSec: 90 }));
    expect(c.restSec).toBe(90);
  });

  it('validates name, uniqueness, step and rep range', async () => {
    await expect(addCustomExercise(input({ name: '   ' }))).rejects.toThrow(/name/i);
    await addCustomExercise(input());
    await expect(addCustomExercise(input({ name: ' cable CROSSOVER low ' }))).rejects.toThrow(/exists/);
    await expect(addCustomExercise(input({ name: exerciseById('pec-fly-machine')!.name }))).rejects.toThrow(/exists/);
    await expect(addCustomExercise(input({ name: 'a', step: 0 }))).rejects.toThrow(/step/i);
    await expect(addCustomExercise(input({ name: 'b', repMin: 12, repMax: 8 }))).rejects.toThrow(/rep/i);
    expect(await getAll('customExercises')).toHaveLength(1);
  });

  it('listExercises and exerciseLookup merge seed and custom, and survive reload', async () => {
    const a = await addCustomExercise(input());
    await closeDb(); // simulate app restart: connection dropped, data kept
    const all = await listExercises();
    expect(all.some((e) => e.id === a.id)).toBe(true);
    expect(all.some((e) => e.id === 'pec-fly-machine')).toBe(true);
    expect((await exerciseLookup(a.id))?.name).toBe('Cable crossover low');
    expect((await exerciseLookup('pec-fly-machine'))?.id).toBe('pec-fly-machine');
    expect(await exerciseLookup('nope')).toBeUndefined();
  });

  it('the store resolves custom exercises for swaps, targets and rest', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('CB-B', T0);
    const ex = await s.addExercise(input({ restSec: 75 }));
    expect(s.swapOptions('pec-fly-machine').map((e) => e.id)).toContain(ex.id);
    expect(s.swapOptions(ex.id).map((e) => e.id)).toContain('pec-fly-machine');

    await s.swap('pec-fly-machine', ex.id, true);
    expect(s.plannedSets().some((p) => p.exerciseId === ex.id)).toBe(true);
    await s.completeSet(ex.id, 1, 15, 15, T0 + MIN);
    expect(s.restEndsAt).toBe(T0 + MIN + 75_000);
    await s.finish(T0 + 5 * MIN);

    // after a reload, the permanent swap still resolves and gets a target from the custom range (repMax reached)
    const n = new WorkoutStore();
    await n.startWorkout('CB-B', T0 + 24 * 60 * MIN);
    const p = n.plannedSets().find((x) => x.exerciseId === ex.id && x.setNo === 1)!;
    expect(p.target).toEqual({ kg: 17.5, reps: 10 });
    expect(p.last?.kg).toBe(15);
  });
});
