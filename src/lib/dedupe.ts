// Finds and removes duplicate sets caused by importing a backup AND the Sheet (the backup's `import-…` sets and the
// Sheet's own copies of the same lifts). Deliberately narrow: it never guesses between two real sets.
import { openDb } from './db';
import type { QueueItem } from './db';
import { scheduleFlush } from './sync';
import { IMPORT_ID_PREFIX } from './stats';
import type { SetLog } from './types';

/** What makes two sets "the same set": date, exercise, set number, weight, reps and warm-up flag. Never ids, times or workout. */
export const contentKey = (s: Pick<SetLog, 'date' | 'exerciseId' | 'setNo' | 'kg' | 'reps' | 'warmup'>): string =>
  [s.date, s.exerciseId, s.setNo, s.kg, s.reps, s.warmup ? 'w' : 'k'].join('|');

export const isImportId = (id: string) => id.startsWith(IMPORT_ID_PREFIX);

/** Warm-ups (setNo 0, never in the Sheet) are never compared: identical warm-ups are normal. */
const comparable = (s: SetLog) => !s.deleted && !s.warmup && s.setNo > 0;

export interface DupScope {
  /** Local app date (YYYY-MM-DD): sets dated today are never touched. */
  today: string;
  /** The currently open workout: its sets are never touched. */
  openWorkoutId?: string | null;
}

/**
 * The removable sets: live `import-…` sets that have a live copy with the same content under a non-`import-` id (the
 * Sheet's own copy). Only the `import-…` ones go; every other copy stays. Two copies that are both non-import (a split
 * workout, a real repeat) are never touched, and neither are warm-ups, today's sets or the open workout's sets.
 */
export function duplicateSets(sets: SetLog[], scope: DupScope): SetLog[] {
  const groups = new Map<string, { imports: SetLog[]; others: number }>();
  for (const s of sets) {
    if (!comparable(s)) continue;
    const k = contentKey(s);
    const g = groups.get(k) ?? groups.set(k, { imports: [], others: 0 }).get(k)!;
    if (isImportId(s.id)) g.imports.push(s);
    else g.others++;
  }
  const out: SetLog[] = [];
  for (const g of groups.values()) {
    if (g.others === 0) continue;
    for (const s of g.imports) {
      if (s.date === scope.today || (scope.openWorkoutId && s.workoutId === scope.openWorkoutId)) continue;
      out.push(s);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}

export interface DupPreview {
  /** The ids that Remove will delete: pass these to removeDuplicates. */
  ids: string[];
  days: { date: string; count: number; exerciseIds: string[] }[];
}

/** What the preview shows: the removable ids and, per day (oldest first), how many and of which exercises. */
export function previewDuplicates(sets: SetLog[], scope: DupScope): DupPreview {
  const extra = duplicateSets(sets, scope);
  const by = new Map<string, { count: number; ex: Set<string> }>();
  for (const s of extra) {
    const d = by.get(s.date) ?? by.set(s.date, { count: 0, ex: new Set() }).get(s.date)!;
    d.count++;
    d.ex.add(s.exerciseId);
  }
  return { ids: extra.map((s) => s.id), days: [...by].map(([date, d]) => ({ date, count: d.count, exerciseIds: [...d.ex] })) };
}

/**
 * Soft-deletes the previewed sets the same way deleting a set does (deleted: true + a 'delete' queue entry), so the
 * flush clears their Sheet rows by id and a later import skips those ids. Reads and writes in ONE transaction and
 * re-checks each previewed id against the current data: an id that is no longer removable (edited, synced away,
 * today's, in the open workout) is left alone. Returns how many were removed.
 */
export async function removeDuplicates(ids: string[], scope: DupScope, now: number = Date.now()): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await openDb();
  const tx = db.transaction(['sets', 'queue'], 'readwrite');
  const setStore = tx.objectStore('sets');
  const queue = tx.objectStore('queue');
  const removable = new Set(duplicateSets((await setStore.getAll()) as SetLog[], scope).map((s) => s.id));
  let n = 0;
  for (const id of ids) {
    if (!removable.has(id)) continue;
    const cur = (await setStore.get(id)) as SetLog;
    await setStore.put({ ...cur, deleted: true, updatedAt: now, synced: false } satisfies SetLog);
    await queue.put({ id, op: 'delete' } satisfies QueueItem);
    n++;
  }
  await tx.done;
  if (n > 0) scheduleFlush();
  return n;
}
