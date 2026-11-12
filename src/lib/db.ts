import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { getActivePlan } from './activePlan.svelte';
import { EXERCISES, NEW_USER_SWAPS, exerciseById, swapOptions } from './seed';
import type { Exercise, Settings } from './types';

export const DB_NAME = 'gym-tracker';

export type StoreName = 'sets' | 'workouts' | 'exercises' | 'customExercises' | 'settings' | 'queue';

/** One pending sync operation. Keyed by set id, so a later op on the same set replaces an earlier one. */
export interface QueueItem {
  id: string;
  op: 'upsert' | 'delete';
}

export const DEFAULT_SETTINGS: Settings = {
  paused: false,
  weeklyTarget: 6, // Mon-Sat
  bodyKg: 65,
  restOverrides: {},
  stepOverrides: {},
  pinnedPlaylists: [],
  templateOverrides: {},
};

let dbPromise: Promise<IDBPDatabase> | null = null;

export function openDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      const sets = db.createObjectStore('sets', { keyPath: 'id' });
      sets.createIndex('exerciseId', 'exerciseId');
      sets.createIndex('workoutId', 'workoutId');
      db.createObjectStore('workouts', { keyPath: 'id' });
      db.createObjectStore('exercises', { keyPath: 'id' });
      db.createObjectStore('customExercises', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('queue', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

/** Closes the cached connection (a new openDb() reconnects). Tests also pass `wipe` to delete the data. */
export async function closeDb(wipe = false): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  if (wipe) await deleteDB(DB_NAME);
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return (await openDb()).getAll(store) as Promise<T[]>;
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return (await openDb()).get(store, key) as Promise<T | undefined>;
}

export async function put(store: StoreName, value: unknown): Promise<void> {
  await (await openDb()).put(store, value);
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  await (await openDb()).delete(store, key);
}

export async function getAllFromIndex<T>(store: 'sets', index: 'exerciseId' | 'workoutId', key: IDBValidKey): Promise<T[]> {
  return (await openDb()).getAllFromIndex(store, index, key) as Promise<T[]>;
}

/** Several writes in ONE transaction: all land or none do (a set and its queue entry). */
export async function putAll(writes: { store: StoreName; value: unknown }[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...new Set(writes.map((w) => w.store))], 'readwrite');
  await Promise.all([...writes.map((w) => tx.objectStore(w.store).put(w.value)), tx.done]);
}

export async function requestPersist(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}

export async function loadSettings(): Promise<Settings> {
  const row = await get<{ key: string; value: Partial<Settings> }>('settings', 'main');
  return { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
}

/** Overwrites all settings. Prefer updateSettings(): this clobbers anything saved since `s` was read. */
export async function saveSettings(s: Settings): Promise<void> {
  await put('settings', { key: 'main', value: s });
}

/**
 * Read-modify-write of the settings row in ONE transaction, so a concurrent writer (Settings screen,
 * swap, sync) is never overwritten with a stale copy. Returns the saved settings.
 */
export async function updateSettings(change: Partial<Settings> | ((cur: Settings) => Settings)): Promise<Settings> {
  const db = await openDb();
  const tx = db.transaction('settings', 'readwrite');
  const store = tx.objectStore('settings');
  const row = (await store.get('main')) as { key: string; value: Partial<Settings> } | undefined;
  const cur: Settings = { ...DEFAULT_SETTINGS, ...(row?.value ?? {}) };
  const next = typeof change === 'function' ? change(cur) : { ...cur, ...change };
  await Promise.all([store.put({ key: 'main', value: next }), tx.done]);
  return next;
}

// ---- Exercises: seed library + user-added ones ------------------------------------------

export async function listExercises(): Promise<Exercise[]> {
  return [...EXERCISES, ...(await getAll<Exercise>('customExercises'))];
}

/** Resolves a seed or custom exercise id. */
export async function exerciseLookup(id: string): Promise<Exercise | undefined> {
  return exerciseById(id) ?? (await get<Exercise>('customExercises', id));
}

/** Swap options for an exercise: seed swaps plus custom exercises in the same slot. */
export function mergedSwapOptions(exerciseId: string, custom: Exercise[]): Exercise[] {
  const base = exerciseById(exerciseId) ?? custom.find((e) => e.id === exerciseId);
  if (!base) return [];
  // Plans from the setup flow also swap between simple alternatives (leg press <-> goblet squat); Vik's do not.
  const plan = getActivePlan();
  const extra = plan && plan.id !== 'vik' ? NEW_USER_SWAPS : [];
  const seed = exerciseById(exerciseId) ? swapOptions(exerciseId, extra) : EXERCISES.filter((e) => e.slot === base.slot);
  return [...seed, ...custom.filter((e) => e.slot === base.slot)];
}

export async function addCustomExercise(input: Omit<Exercise, 'id'>): Promise<Exercise> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('Name is required');
  if (!input.slot?.trim()) throw new Error('Category is required');
  if (!(input.step > 0)) throw new Error('Step must be greater than 0');
  if (!(input.repMin >= 1) || input.repMin > input.repMax) throw new Error('Rep range must have 1 <= min <= max');
  if (input.restSec !== undefined && !(input.restSec > 0)) throw new Error('Rest must be greater than 0');
  const taken = (await listExercises()).some((e) => e.name.trim().toLowerCase() === name.toLowerCase());
  if (taken) throw new Error(`An exercise named "${name}" already exists`);
  const ex: Exercise = {
    ...input,
    name,
    id: `custom-${crypto.randomUUID()}`,
    restSec: input.restSec ?? (input.kind === 'compound' ? 180 : 120),
  };
  await put('customExercises', ex);
  return ex;
}
