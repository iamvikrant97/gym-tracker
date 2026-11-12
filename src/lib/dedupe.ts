// Finds and removes duplicate sets: the same lift logged twice (e.g. a backup restored AND the Sheet imported).
import { getAll, putAll } from './db';
import type { QueueItem } from './db';
import { scheduleFlush } from './sync';
import { IMPORT_ID_PREFIX } from './stats';
import type { SetLog } from './types';

/** What makes two sets "the same set": date, exercise, set number, weight, reps and warm-up flag. Never ids, times or workout. */
export const contentKey = (s: Pick<SetLog, 'date' | 'exerciseId' | 'setNo' | 'kg' | 'reps' | 'warmup'>): string =>
  [s.date, s.exerciseId, s.setNo, s.kg, s.reps, s.warmup ? 'w' : 'k'].join('|');

/**
 * Which copy stays: one that did not come from a backup import (its id is not `import-…`, i.e. the Sheet's own id),
 * then the earliest doneAt, then the lowest id. Total order, so the same input always gives the same answer.
 */
function keepOrder(a: SetLog, b: SetLog): number {
  const ai = a.id.startsWith(IMPORT_ID_PREFIX) ? 1 : 0;
  const bi = b.id.startsWith(IMPORT_ID_PREFIX) ? 1 : 0;
  return ai - bi || a.doneAt - b.doneAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The extra sets (everything but the kept copy of each key). Deleted sets are ignored. */
export function duplicateSets(sets: SetLog[]): SetLog[] {
  const groups = new Map<string, SetLog[]>();
  for (const s of sets) {
    if (s.deleted) continue;
    const k = contentKey(s);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }
  const extra: SetLog[] = [];
  for (const g of groups.values()) if (g.length > 1) extra.push(...g.sort(keepOrder).slice(1));
  return extra;
}

export const duplicateIds = (sets: SetLog[]): string[] => duplicateSets(sets).map((s) => s.id);

/** Duplicates per day, oldest day first. */
export function duplicateGroups(sets: SetLog[]): { date: string; count: number }[] {
  const by = new Map<string, number>();
  for (const s of duplicateSets(sets)) by.set(s.date, (by.get(s.date) ?? 0) + 1);
  return [...by].map(([date, count]) => ({ date, count })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Soft-deletes the extras the same way deleting a set does (deleted: true + a 'delete' queue entry in one
 * transaction), so the flush clears their Sheet rows by id and a later import skips those ids. Returns how many.
 */
export async function removeDuplicates(now: number = Date.now()): Promise<number> {
  const extra = duplicateSets(await getAll<SetLog>('sets'));
  if (extra.length === 0) return 0;
  await putAll(
    extra.flatMap((s) => [
      { store: 'sets' as const, value: { ...s, deleted: true, updatedAt: now, synced: false } satisfies SetLog },
      { store: 'queue' as const, value: { id: s.id, op: 'delete' } satisfies QueueItem },
    ]),
  );
  scheduleFlush();
  return extra.length;
}
