import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getAll, loadSettings, put, saveSettings, DEFAULT_SETTINGS, addCustomExercise } from '../src/lib/db';
import type { QueueItem } from '../src/lib/db';
import { WorkoutStore } from '../src/lib/workout.svelte';
import { flush, _resetSyncState } from '../src/lib/sync';
import { dayVisits } from '../src/lib/stats';
import { buildCards } from '../src/lib/workoutView';
import type { SetLog, Workout } from '../src/lib/types';

const at = (d: number, h = 7, mi = 0) => new Date(2026, 10, d, h, mi).getTime();
const MIN = 60_000;
const T0 = at(13);
const EXTRA = 'hammer-curl'; // not in Shoulders + Arms A
const OWN = 'barbell-curl'; // in Shoulders + Arms A

async function history() {
  const w: Workout = { id: 'old', date: '2026-11-06', sessionId: 'SA-B', startedAt: at(6), endedAt: at(6, 8), swaps: {} };
  await put('workouts', w);
  for (let n = 1; n <= 3; n++) {
    await put('sets', {
      id: `old-${n}`, workoutId: 'old', date: w.date, sessionId: 'SA-B', exerciseId: EXTRA, setNo: n, kg: 12, reps: 12,
      warmup: false, feltIt: false, doneAt: at(6) + n * MIN, updatedAt: 1, deleted: false, synced: true,
    } satisfies SetLog);
  }
}

beforeEach(async () => {
  await closeDb(true);
  _resetSyncState();
});
afterEach(() => vi.restoreAllMocks());

describe('addExtra', () => {
  it('appends the exercise with its own sets, keeps the existing ones, and uses last time and the target', async () => {
    await history();
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    const before = s.plannedSets();
    await s.addExtra(EXTRA, false);
    const after = s.plannedSets();
    expect(after.slice(0, before.length)).toEqual(before); // nothing replaced or reordered
    const extra = after.filter((p) => p.exerciseId === EXTRA);
    expect(extra.map((p) => p.setNo)).toEqual([1, 2, 3]);
    expect(extra[0].last).toMatchObject({ kg: 12, reps: 12 });
    expect(extra[0].target).not.toBeNull();
    expect(after.some((p) => p.exerciseId === OWN)).toBe(true);
    expect(buildCards(after, s.sets).map((c) => c.exerciseId).at(-1)).toBe(EXTRA);
  });

  it('logs sets, progression and PR flag for the extra like any exercise', async () => {
    await history();
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    await s.addExtra(EXTRA, false);
    const r = await s.completeSet(EXTRA, 1, 14, 12, T0 + MIN);
    expect(r.set).toMatchObject({ exerciseId: EXTRA, sessionId: 'SA-A', setNo: 1 });
    expect(r.pr).toBe(true);
    expect(s.restEndsAt).toBe(T0 + MIN + s.restSecFor(EXTRA) * 1000);
    expect((await getAll<QueueItem>('queue')).map((q) => q.id)).toContain(r.set.id);
  });

  it('refuses an exercise already in the session, or already added', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    await expect(s.addExtra(OWN, false)).rejects.toThrow(/already/i);
    await s.addExtra(EXTRA, false);
    await expect(s.addExtra(EXTRA, false)).rejects.toThrow(/already/i);
    expect(s.current!.extras).toEqual([EXTRA]);
  });

  it('refuses an exercise that is in the session through a swap', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    await s.swap('barbell-curl', 'cable-curl', false);
    await expect(s.addExtra('cable-curl', false)).rejects.toThrow(/already/i);
  });

  it('today only: the plan session is unchanged and the next workout of it has no extra', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    await s.addExtra(EXTRA, false);
    expect((await loadSettings()).templateExtras).toBeUndefined();
    await s.finish(T0 + 10 * MIN);
    const s2 = new WorkoutStore();
    await s2.startWorkout('SA-A', T0 + 24 * 60 * MIN);
    expect(s2.plannedSets().some((p) => p.exerciseId === EXTRA)).toBe(false);
  });

  it('keep in session: stored in the settings, so every later workout of that session has it', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    await s.addExtra(EXTRA, true);
    expect((await loadSettings()).templateExtras).toEqual({ 'SA-A': [{ exerciseId: EXTRA, sets: 3 }] });
    expect(s.plannedSets().filter((p) => p.exerciseId === EXTRA)).toHaveLength(3);
    await s.finish(T0 + 10 * MIN);
    const s2 = new WorkoutStore();
    await s2.startWorkout('SA-A', T0 + 24 * 60 * MIN);
    expect(s2.plannedSets().filter((p) => p.exerciseId === EXTRA)).toHaveLength(3);
    const other = new WorkoutStore();
    await other.startWorkout('SA-B', T0 + 48 * 60 * MIN);
    expect(other.plannedSets().filter((p) => p.exerciseId === EXTRA)).toHaveLength(3); // SA-B has Hammer curl itself: still 3, not 6
    const cb = new WorkoutStore();
    await cb.startWorkout('CB-A', T0 + 72 * 60 * MIN);
    expect(cb.plannedSets().some((p) => p.exerciseId === EXTRA)).toBe(false);
  });

  it('a kept extra cannot be added again, and a session exercise is not doubled by it', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    await s.addExtra(EXTRA, true);
    await expect(s.addExtra(EXTRA, false)).rejects.toThrow(/already/i);
  });

  it('survives a restart of the app', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    await s.addExtra(EXTRA, false);
    await s.completeSet(EXTRA, 1, 12, 12, T0 + MIN);
    const again = new WorkoutStore();
    await again.restore(T0 + 2 * MIN);
    expect(again.current?.extras).toEqual([EXTRA]);
    expect(again.plannedSets().filter((p) => p.exerciseId === EXTRA)).toHaveLength(3);
  });

  it('a set logged after a long break (new workout of the same visit) keeps the extra', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    await s.addExtra(EXTRA, false);
    await s.completeSet(OWN, 1, 20, 10, T0 + MIN);
    await s.completeSet(EXTRA, 1, 12, 12, T0 + MIN + 5 * 60 * MIN); // 5 h later: opens a second workout
    expect(s.current!.id).not.toBe((await getAll<Workout>('workouts')).find((w) => w.startedAt === T0)!.id);
    expect(s.current!.extras).toEqual([EXTRA]);
  });

  it('works for an exercise made on the spot', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    const ex = await s.addExercise({ name: 'Zottman curl', muscle: 'Biceps', slot: 'Biceps', kind: 'isolation', step: 2.5, repMin: 8, repMax: 12, restSec: 120 });
    await s.addExtra(ex.id, false);
    expect(s.plannedSets().filter((p) => p.exerciseId === ex.id)).toHaveLength(3);
  });

  it('throws without a workout', async () => {
    await expect(new WorkoutStore().addExtra(EXTRA, false)).rejects.toThrow();
  });
});

describe('extras in summaries and the Sheet', () => {
  it('the day summary lists the extra next to the session exercises', async () => {
    const s = new WorkoutStore();
    const w = await s.startWorkout('SA-A', T0);
    await s.addExtra(EXTRA, false);
    await s.completeSet(OWN, 1, 20, 10, T0 + MIN);
    await s.completeSet(EXTRA, 1, 12, 12, T0 + 2 * MIN);
    await s.finish(T0 + 3 * MIN);
    const v = dayVisits('2026-11-13', await getAll<Workout>('workouts'), await getAll<SetLog>('sets'), (id) => s.exercise(id));
    expect(v).toHaveLength(1);
    expect(v[0].sets).toBe(2);
    expect(v[0].exercises.map((e) => e.name)).toEqual(['Barbell curl', 'Hammer curl']);
    expect(w.id).toBeTruthy();
  });

  it('sets of an extra sync with the exercise name and slot, even for a custom exercise', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, scriptUrl: 'https://script.example/exec', scriptKey: 'k' });
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    const custom = await addCustomExercise({ name: 'Zottman curl', muscle: 'Biceps', slot: 'Biceps', kind: 'isolation', step: 2.5, repMin: 8, repMax: 12, restSec: 120 });
    await s.refreshShared();
    await s.addExtra(EXTRA, false);
    await s.addExtra(custom.id, false);
    await s.completeSet(EXTRA, 1, 12, 12, T0 + MIN);
    await s.completeSet(custom.id, 1, 8, 10, T0 + 2 * MIN);
    const f = vi.fn(async (...a: Parameters<typeof fetch>) => {
      const req = JSON.parse((a[1] as RequestInit).body as string);
      return { ok: true, json: async () => ({ ok: true, acked: req.upserts.map((u: { id: string }) => u.id), skipped: [], deleted: [] }) } as Response;
    });
    expect(await flush(f)).toEqual({ sent: 2, ok: true });
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.upserts.map((u: { exercise: string; slot: string; day: string }) => [u.exercise, u.slot, u.day])).toEqual([
      ['Hammer curl', 'Biceps', 'Shoulders+Arms A'],
      ['Zottman curl', 'Biceps', 'Shoulders+Arms A'],
    ]);
  });
});
