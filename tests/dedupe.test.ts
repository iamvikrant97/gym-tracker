import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getAll, put } from '../src/lib/db';
import type { QueueItem } from '../src/lib/db';
import { contentKey, duplicateGroups, duplicateIds, removeDuplicates } from '../src/lib/dedupe';
import { restoreBackup } from '../src/lib/backup';
import { importFromSheet } from '../src/lib/sync';
import type { SetLog } from '../src/lib/types';

const T = (n: number) => Date.UTC(2026, 10, 9, 1, 0) + n * 60_000;
let n = 0;
const mk = (id: string, o: Partial<SetLog> = {}): SetLog => ({
  id, workoutId: 'w1', date: '2026-11-09', sessionId: 'CB-A', exerciseId: 'smith-flat-press', setNo: 1, kg: 60, reps: 8,
  warmup: false, feltIt: false, doneAt: T(n++), updatedAt: 1, deleted: false, synced: true, ...o,
});

beforeEach(async () => {
  await closeDb(true);
  n = 0;
});

describe('duplicateIds', () => {
  it('the same key twice: one is extra', () => {
    const d = duplicateIds([mk('a'), mk('b')]);
    expect(d).toHaveLength(1);
  });
  it('three copies: two are extra, one kept', () => {
    expect(duplicateIds([mk('a'), mk('b'), mk('c')])).toHaveLength(2);
  });
  it('a different kg, reps, setNo, exercise or date is not a duplicate', () => {
    const base = mk('a');
    for (const o of [{ kg: 62.5 }, { reps: 9 }, { setNo: 2 }, { exerciseId: 'barbell-curl' }, { date: '2026-11-10' }]) {
      expect(duplicateIds([base, mk('b', o)])).toEqual([]);
    }
  });
  it('a warm-up is distinct from a working set with the same numbers', () => {
    expect(duplicateIds([mk('a'), mk('b', { warmup: true })])).toEqual([]);
    expect(duplicateIds([mk('a', { warmup: true }), mk('b', { warmup: true })])).toHaveLength(1);
  });
  it('ignores ids, doneAt and workoutId in the key', () => {
    expect(contentKey(mk('a', { workoutId: 'x', doneAt: 5 }))).toBe(contentKey(mk('b', { workoutId: 'y', doneAt: 9 })));
  });
  it('two workouts on one day: different numbers are kept, identical numbers are duplicates', () => {
    const a = mk('a', { workoutId: 'w1' });
    const b = mk('b', { workoutId: 'w2', kg: 65 });
    expect(duplicateIds([a, b])).toEqual([]);
    expect(duplicateIds([a, mk('c', { workoutId: 'w2' })])).toHaveLength(1);
  });
  it('ignores deleted sets', () => {
    expect(duplicateIds([mk('a'), mk('b', { deleted: true })])).toEqual([]);
  });
  it('keeps the copy that is not an import- id (the Sheet one), else the earliest, deterministically', () => {
    const imp = mk('import-2026-11-09-smith-flat-press-1', { doneAt: T(0) });
    const sheet = mk('uuid-sheet', { doneAt: T(50) });
    expect(duplicateIds([imp, sheet])).toEqual([imp.id]);
    expect(duplicateIds([sheet, imp])).toEqual([imp.id]);
    const x = mk('import-b', { doneAt: T(5) });
    const y = mk('import-a', { doneAt: T(5) });
    const z = mk('import-c', { doneAt: T(1) });
    expect(duplicateIds([x, y, z]).sort()).toEqual(['import-a', 'import-b']); // z (earliest) kept
    expect(duplicateIds([x, y]).sort()).toEqual(['import-b']); // tie on doneAt: lowest id kept
    expect(duplicateIds([y, x]).sort()).toEqual(['import-b']);
    const s1 = mk('s1', { doneAt: T(9) });
    const s2 = mk('s2', { doneAt: T(3) });
    expect(duplicateIds([s1, s2, imp])).toEqual(expect.arrayContaining([imp.id, 's1']));
    expect(duplicateIds([s1, s2, imp])).toHaveLength(2); // s2, the earliest non-import, stays
  });
});

describe('duplicateGroups', () => {
  it('counts duplicates per day, oldest day first', () => {
    const sets = [mk('a'), mk('b'), mk('c', { date: '2026-11-10', setNo: 2 }), mk('d', { date: '2026-11-10', setNo: 2 }), mk('e', { date: '2026-11-10', setNo: 2 })];
    expect(duplicateGroups(sets)).toEqual([
      { date: '2026-11-09', count: 1 },
      { date: '2026-11-10', count: 2 },
    ]);
  });
});

describe('removeDuplicates', () => {
  const seed = async () => {
    await put('sets', mk('import-2026-11-09-smith-flat-press-1', { synced: false }));
    await put('sets', mk('sheet-1', { doneAt: T(100) }));
    await put('sets', mk('other', { setNo: 2 }));
    await put('sets', mk('today', { date: '2026-11-12', workoutId: 'w9' }));
  };

  it('soft-deletes the extras through the delete queue, touching nothing else', async () => {
    await seed();
    expect(await removeDuplicates(1_000)).toBe(1);
    const sets = await getAll<SetLog>('sets');
    const imp = sets.find((s) => s.id.startsWith('import-'))!;
    expect(imp).toMatchObject({ deleted: true, synced: false, updatedAt: 1_000 });
    expect(sets.filter((s) => !s.deleted).map((s) => s.id).sort()).toEqual(['other', 'sheet-1', 'today']);
    expect(await getAll<QueueItem>('queue')).toEqual([{ id: imp.id, op: 'delete' }]);
  });

  it('is idempotent: a second run finds 0 and queues nothing more', async () => {
    await seed();
    await removeDuplicates();
    expect(await removeDuplicates()).toBe(0);
    expect(await getAll<QueueItem>('queue')).toHaveLength(1);
  });

  it('a later Sheet import does not bring the removed set back', async () => {
    await seed();
    await removeDuplicates();
    const row = { id: 'import-2026-11-09-smith-flat-press-1', date: '2026-11-09', day: 'Chest+Back A', exercise: 'Smith flat press', kg: 60, reps: 8 };
    const f = (async () => ({ ok: true, json: async () => ({ ok: true, log: [row], exercises: [] }) }) as Response) as unknown as typeof fetch;
    const { saveSettings, DEFAULT_SETTINGS } = await import('../src/lib/db');
    await saveSettings({ ...DEFAULT_SETTINGS, scriptUrl: 'https://s.example/exec', scriptKey: 'k' });
    expect(await importFromSheet(f)).toMatchObject({ imported: 0, ok: true });
    expect((await getAll<SetLog>('sets')).find((s) => s.id === row.id)?.deleted).toBe(true);
  });
});

describe('restoreBackup duplicate guard', () => {
  const backup = (sets: SetLog[]) => ({ app: 'gym-tracker', format: 1, sets, workouts: [], customExercises: [] });

  it('skips an incoming set whose content matches a live set, and does not queue it', async () => {
    await put('sets', mk('sheet-1'));
    const r = await restoreBackup(backup([mk('import-x', { synced: false }), mk('import-y', { synced: false, setNo: 2 })]));
    expect(r.sets).toBe(1);
    expect((await getAll<SetLog>('sets')).map((s) => s.id).sort()).toEqual(['import-y', 'sheet-1']);
    expect(await getAll<QueueItem>('queue')).toEqual([{ id: 'import-y', op: 'upsert' }]);
  });

  it('restoring the same backup twice, or after the Sheet import, adds nothing', async () => {
    const file = backup([mk('import-x', { synced: false })]);
    await restoreBackup(file);
    await put('sets', mk('sheet-1', { setNo: 3 })); // unrelated
    expect((await restoreBackup(file)).sets).toBe(0);
    expect(await getAll<SetLog>('sets')).toHaveLength(2);
  });

  it('a copy of a set that was removed as a duplicate does not block, but a deleted live key does not count', async () => {
    await put('sets', mk('old', { deleted: true }));
    expect((await restoreBackup(backup([mk('new')]))).sets).toBe(1);
  });

  it('two identical sets inside one file: only the first goes in', async () => {
    expect((await restoreBackup(backup([mk('a'), mk('b')]))).sets).toBe(1);
  });

  it('a newer copy of the same id still replaces it (the set is not its own duplicate)', async () => {
    await put('sets', mk('a', { updatedAt: 1 }));
    await restoreBackup(backup([mk('a', { updatedAt: 5, reps: 8 })]));
    expect((await getAll<SetLog>('sets'))[0].updatedAt).toBe(5);
  });

  it('a deleted incoming set is a tombstone and is always applied', async () => {
    await put('sets', mk('a', { updatedAt: 1 }));
    await restoreBackup(backup([mk('a', { updatedAt: 5, deleted: true, synced: false })]));
    expect((await getAll<SetLog>('sets'))[0].deleted).toBe(true);
    expect(await getAll<QueueItem>('queue')).toEqual([{ id: 'a', op: 'delete' }]);
  });
});
