// Backup: every set, workout, custom exercise and setting as one JSON file, and a merge-by-id restore.
// Secrets (script key, Spotify login) are left out of the file: they are typed in again in Settings.
import { getAll, loadSettings, openDb, updateSettings } from './db';
import type { QueueItem } from './db';
import { contentKey } from './dedupe';
import { sanitizeGreetNames } from './greeting';
import { scheduleFlush } from './sync';
import type { Exercise, SetLog, Settings, Workout } from './types';

export const BACKUP_APP = 'gym-tracker';
export const BACKUP_FORMAT = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  sets: SetLog[];
  workouts: Workout[];
  customExercises: Exercise[];
  settings: Omit<Settings, 'scriptKey'>;
}

export async function exportAll(now: number = Date.now()): Promise<Backup> {
  const [sets, workouts, customExercises, settings] = await Promise.all([
    getAll<SetLog>('sets'), getAll<Workout>('workouts'), getAll<Exercise>('customExercises'), loadSettings(),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { scriptKey: _key, ...safe } = settings;
  return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: new Date(now).toISOString(), sets, workouts, customExercises, settings: safe };
}

export const backupFileName = (now: number = Date.now()) => {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `gym-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
};

export interface RestoreResult { sets: number; workouts: number; exercises: number; /** new `import-` sets skipped because the Sheet's own copy is already here */ skipped: number }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Merges a backup into the app by id. A set already here is replaced only by a newer copy (updatedAt);
 * workouts and custom exercises already here are kept. Settings from the file replace the preferences, but the
 * Sheet and Spotify connection on this phone are kept. Sets that were not yet in the Sheet are queued for sync.
 * Throws a plain-language error if the text is not a backup from this app.
 */
export async function restoreBackup(input: string | unknown): Promise<RestoreResult> {
  let b: unknown = input;
  if (typeof input === 'string') {
    try {
      b = JSON.parse(input);
    } catch {
      throw new Error('That file is not a backup (it is not JSON)');
    }
  }
  if (!isObj(b) || b.app !== BACKUP_APP || !Array.isArray(b.sets) || !Array.isArray(b.workouts)) {
    throw new Error('That file is not a backup from this app');
  }
  const sets = (b.sets as unknown[]).filter((s): s is SetLog => isObj(s) && typeof s.id === 'string' && typeof s.workoutId === 'string' && typeof s.exerciseId === 'string');
  const workouts = (b.workouts as unknown[]).filter((w): w is Workout => isObj(w) && typeof w.id === 'string' && typeof w.date === 'string');
  const custom = (Array.isArray(b.customExercises) ? b.customExercises : []).filter(
    (e): e is Exercise => isObj(e) && typeof e.id === 'string' && typeof e.name === 'string',
  );

  const db = await openDb();
  const tx = db.transaction(['sets', 'workouts', 'customExercises', 'queue'], 'readwrite');
  const out: RestoreResult = { sets: 0, workouts: 0, exercises: 0, skipped: 0 };
  const setStore = tx.objectStore('sets');
  const workoutStore = tx.objectStore('workouts');
  const exStore = tx.objectStore('customExercises');
  const queue = tx.objectStore('queue');
  let queued = false;
  for (const w of workouts) {
    if (await workoutStore.get(w.id)) continue;
    await workoutStore.put(w);
    out.workouts++;
  }
  const names = new Set(((await exStore.getAll()) as Exercise[]).map((e) => e.name.trim().toLowerCase()));
  for (const e of custom) {
    if ((await exStore.get(e.id)) || names.has(e.name.trim().toLowerCase())) continue;
    await exStore.put(e);
    names.add(e.name.trim().toLowerCase());
    out.exercises++;
  }
  // Guard against the backup + Sheet double import: a NEW `import-…` set whose content (date, exercise, set no., kg,
  // reps) is already here as a live set under a Sheet id (not `import-…`) is the same set, so it is skipped and not
  // queued. Ids already here are updates and are never skipped; warm-ups are never compared.
  const sheetKeys = new Map<string, number>(); // content key -> live non-import sets here
  const count = (x: SetLog, by: number) => {
    if (x.deleted || x.warmup || x.setNo < 1 || x.id.startsWith('import-')) return;
    const k = contentKey(x);
    sheetKeys.set(k, (sheetKeys.get(k) ?? 0) + by);
  };
  for (const x of (await setStore.getAll()) as SetLog[]) count(x, 1);
  const apply = async (s: SetLog) => {
    await setStore.put(s);
    if (!s.synced) {
      await queue.put({ id: s.id, op: s.deleted ? 'delete' : 'upsert' } satisfies QueueItem);
      queued = true;
    }
    if (!s.deleted) out.sets++;
  };
  // Pass 1: same-id copies (edits and deletions) first, keeping the key counts current as sets change.
  const fresh: SetLog[] = [];
  for (const s of sets) {
    const cur = (await setStore.get(s.id)) as SetLog | undefined;
    if (!cur) {
      fresh.push(s);
      continue;
    }
    if (cur.updatedAt >= s.updatedAt) continue;
    count(cur, -1);
    await apply(s);
    count(s, 1);
  }
  // Pass 2: new ids.
  for (const s of fresh) {
    if (!s.deleted && !s.warmup && s.setNo > 0 && s.id.startsWith('import-') && (sheetKeys.get(contentKey(s)) ?? 0) > 0) {
      out.skipped++;
      continue;
    }
    await apply(s);
    count(s, 1);
  }
  await tx.done;

  if (isObj(b.settings)) {
    const file = b.settings as Partial<Settings>;
    await updateSettings((cur) => ({
      ...cur,
      ...file,
      scriptUrl: cur.scriptUrl || file.scriptUrl,
      scriptKey: cur.scriptKey,
      spotifyClientId: cur.spotifyClientId || file.spotifyClientId,
      // A file is not trusted: only plain, trimmed names in the four known slots.
      greetNames: 'greetNames' in file ? sanitizeGreetNames(file.greetNames) : cur.greetNames,
    }));
  }
  if (queued) scheduleFlush();
  return out;
}
