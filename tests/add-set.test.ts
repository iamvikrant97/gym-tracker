import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getAll } from '../src/lib/db';
import type { Workout } from '../src/lib/types';
import { WorkoutStore } from '../src/lib/workout.svelte';
import { _resetSyncState } from '../src/lib/sync';

const T0 = new Date(2026, 10, 16, 7).getTime();
const EX = 'barbell-curl'; // in Shoulders + Arms A

beforeEach(async () => {
  await closeDb(true);
  _resetSyncState();
});

const count = (s: WorkoutStore) => s.plannedSets().filter((p) => p.exerciseId === EX).length;

describe('addSet', () => {
  it('adds one planned set to that exercise only, and survives a reload', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    const before = count(s);
    const all = s.plannedSets().length;
    await s.addSet(EX);
    expect(count(s)).toBe(before + 1);
    expect(s.plannedSets().length).toBe(all + 1);
    const saved = (await getAll<Workout>('workouts')).find((w) => w.id === s.current?.id);
    expect(saved?.extraSets?.[EX]).toBe(1);
  });

  it('removeAddedSet takes back an empty added set, but not one that is logged', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    const base = count(s);
    await s.addSet(EX);
    await s.removeAddedSet(EX);
    expect(count(s)).toBe(base);
    await s.addSet(EX);
    await s.completeSet(EX, base + 1, 20, 10, T0 + 60_000);
    await s.removeAddedSet(EX);
    expect(count(s)).toBe(base + 1);
  });

  it('refuses an exercise that is not in the workout', async () => {
    const s = new WorkoutStore();
    await s.startWorkout('SA-A', T0);
    await expect(s.addSet('back-squat')).rejects.toThrow();
  });
});
