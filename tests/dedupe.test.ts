import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeDb, DEFAULT_SETTINGS, getAll, put, saveSettings } from '../src/lib/db';
import type { QueueItem } from '../src/lib/db';
import { contentKey, duplicateSets, previewDuplicates, removeDuplicates } from '../src/lib/dedupe';
import { restoreBackup } from '../src/lib/backup';
import { importFromSheet } from '../src/lib/sync';
import { WorkoutStore } from '../src/lib/workout.svelte';
import type { SetLog } from '../src/lib/types';

const SCOPE = { today: '2026-11-12', openWorkoutId: null as string | null };
const IMP = (n: number) => `import-2026-11-09-smith-flat-press-${n}`;
let n = 0;
const mk = (id: string, o: Partial<SetLog> = {}): SetLog => ({
  id, workoutId: 'w1', date: '2026-11-09', sessionId: 'CB-A', exerciseId: 'smith-flat-press', setNo: 1, kg: 60, reps: 8,
  warmup: false, feltIt: false, doneAt: Date.UTC(2026, 10, 9, 1, n++), updatedAt: 1, deleted: false, synced: true, ...o,
});
const ids = (sets: SetLog[], scope = SCOPE) => duplicateSets(sets, scope).map((s) => s.id).sort();

beforeEach(async () => {
  await closeDb(true);
  n = 0;
});

describe('duplicateSets (narrow: import- copy next to a Sheet copy)', () => {
  it('an import- set with a Sheet copy of the same content is removable; the Sheet copy stays', () => {
    expect(ids([mk(IMP(1)), mk('uuid-1')])).toEqual([IMP(1)]);
    expect(ids([mk('uuid-1'), mk(IMP(1))])).toEqual([IMP(1)]); // order does not matter
  });
  it('two import- copies next to one Sheet copy: both import- go', () => {
    expect(ids([mk(IMP(1)), mk('import-b'), mk('uuid-1')])).toEqual([IMP(1), 'import-b'].sort());
  });
  it('two copies that are both non-import are never touched (real repeats, split workouts)', () => {
    expect(ids([mk('uuid-1'), mk('uuid-2')])).toEqual([]);
  });
  it('import- copies with no Sheet copy are kept', () => {
    expect(ids([mk(IMP(1)), mk('import-b')])).toEqual([]);
  });
  it('split workout: 6 + 3 sets with the same kg x reps and set numbers are untouched', () => {
    const first = [1, 2, 3, 4, 5, 6].map((i) => mk(`a${i}`, { setNo: i, workoutId: 'w1', kg: 10, reps: 8 }));
    const second = [1, 2, 3].map((i) => mk(`b${i}`, { setNo: i, workoutId: 'w2', kg: 10, reps: 8 }));
    expect(ids([...first, ...second])).toEqual([]);
  });
  it('identical warm-ups are never flagged, even next to an import- warm-up', () => {
    const w = (id: string) => mk(id, { warmup: true, setNo: 0, kg: 20, reps: 10 });
    expect(ids([w('a'), w('b'), w('import-c')])).toEqual([]);
  });
  it('a different kg, reps, setNo, exercise or date is not the same set', () => {
    for (const o of [{ kg: 62.5 }, { reps: 9 }, { setNo: 2 }, { exerciseId: 'barbell-curl' }, { date: '2026-11-10' }]) {
      expect(ids([mk(IMP(1)), mk('uuid-1', o)])).toEqual([]);
    }
  });
  it('ignores ids, doneAt and workoutId in the key', () => {
    expect(contentKey(mk('a', { workoutId: 'x', doneAt: 5 }))).toBe(contentKey(mk('b', { workoutId: 'y', doneAt: 9 })));
    expect(ids([mk(IMP(1), { workoutId: 'import-w' }), mk('uuid-1', { workoutId: 'other', doneAt: 99 })])).toEqual([IMP(1)]);
  });
  it('ignores deleted sets on either side', () => {
    expect(ids([mk(IMP(1), { deleted: true }), mk('uuid-1')])).toEqual([]);
    expect(ids([mk(IMP(1)), mk('uuid-1', { deleted: true })])).toEqual([]);
  });
  it('never touches sets dated today or in the open workout', () => {
    const today = [mk(IMP(1), { date: '2026-11-12' }), mk('uuid-1', { date: '2026-11-12' })];
    expect(ids(today)).toEqual([]);
    const open = [mk(IMP(2), { workoutId: 'wopen' }), mk('uuid-2')];
    expect(ids(open, { ...SCOPE, openWorkoutId: 'wopen' })).toEqual([]);
    expect(ids(open)).toEqual([IMP(2)]);
  });
});

describe('previewDuplicates', () => {
  it('lists ids, and per day the count and the exercises', () => {
    const sets = [
      mk(IMP(1)), mk('u1'),
      mk('import-2', { setNo: 2 }), mk('u2', { setNo: 2 }),
      mk('import-3', { date: '2026-11-10', exerciseId: 'barbell-curl' }), mk('u3', { date: '2026-11-10', exerciseId: 'barbell-curl' }),
    ];
    const p = previewDuplicates(sets, SCOPE);
    expect(p.ids.sort()).toEqual([IMP(1), 'import-2', 'import-3'].sort());
    expect(p.days).toEqual([
      { date: '2026-11-09', count: 2, exerciseIds: ['smith-flat-press'] },
      { date: '2026-11-10', count: 1, exerciseIds: ['barbell-curl'] },
    ]);
  });
});

describe('removeDuplicates', () => {
  const seed = async () => {
    await put('sets', mk(IMP(1), { synced: false }));
    await put('sets', mk('sheet-1'));
    await put('sets', mk('other', { setNo: 2 }));
    await put('sets', mk('today', { date: '2026-11-12', workoutId: 'w9' }));
  };
  const live = async () => previewDuplicates(await getAll<SetLog>('sets'), SCOPE);

  it('soft-deletes the previewed extras through the delete queue, touching nothing else', async () => {
    await seed();
    const p = await live();
    expect(await removeDuplicates(p.ids, SCOPE, 1_000)).toBe(1);
    const sets = await getAll<SetLog>('sets');
    expect(sets.find((s) => s.id === IMP(1))).toMatchObject({ deleted: true, synced: false, updatedAt: 1_000 });
    expect(sets.filter((s) => !s.deleted).map((s) => s.id).sort()).toEqual(['other', 'sheet-1', 'today']);
    expect(await getAll<QueueItem>('queue')).toEqual([{ id: IMP(1), op: 'delete' }]);
  });

  it('is idempotent: a second run finds nothing and queues nothing more', async () => {
    await seed();
    await removeDuplicates((await live()).ids, SCOPE);
    expect((await live()).ids).toEqual([]);
    expect(await removeDuplicates([], SCOPE)).toBe(0);
    expect(await getAll<QueueItem>('queue')).toHaveLength(1);
  });

  it('removes only previewed ids that are still removable (changed since the preview: left alone)', async () => {
    await seed();
    const p = await live();
    await put('sets', mk(IMP(1), { kg: 70, updatedAt: 5 })); // edited after the preview: no longer a copy
    expect(await removeDuplicates(p.ids, SCOPE)).toBe(0);
    expect((await getAll<SetLog>('sets')).every((s) => !s.deleted)).toBe(true);
    // ids that were never previewed are never touched
    await put('sets', mk(IMP(1), { updatedAt: 6 }));
    await put('sets', mk('import-2026-11-09-smith-flat-press-2', { setNo: 2 }));
    await put('sets', mk('sheet-2', { setNo: 2 }));
    expect(await removeDuplicates([IMP(1)], SCOPE)).toBe(1);
    expect((await getAll<SetLog>('sets')).find((s) => s.id === 'import-2026-11-09-smith-flat-press-2')?.deleted).toBe(false);
  });

  it('a later Sheet import does not bring the removed set back', async () => {
    await seed();
    await removeDuplicates((await live()).ids, SCOPE);
    const row = { id: IMP(1), date: '2026-11-09', day: 'Chest+Back A', exercise: 'Smith flat press', kg: 60, reps: 8 };
    const f = (async () => ({ ok: true, json: async () => ({ ok: true, log: [row], exercises: [] }) }) as Response) as unknown as typeof fetch;
    await saveSettings({ ...DEFAULT_SETTINGS, scriptUrl: 'https://s.example/exec', scriptKey: 'k' });
    expect(await importFromSheet(f)).toMatchObject({ imported: 0, ok: true });
    expect((await getAll<SetLog>('sets')).find((s) => s.id === IMP(1))?.deleted).toBe(true);
  });
});

describe('open workout stays in step after a cleanup (I4)', () => {
  it('refreshShared drops a set removed from outside, so logging that set number again does not bring it back', async () => {
    const s = new WorkoutStore();
    const now = Date.now();
    await s.startWorkout('CB-A', now);
    await s.completeSet('smith-flat-press', 1, 60, 8, now + 1000);
    const set = s.sets[0];
    await put('sets', { ...set, deleted: true, updatedAt: now + 2000, synced: false }); // as the cleaner would
    expect(s.sets).toHaveLength(1); // stale in memory
    await s.refreshShared();
    expect(s.sets).toHaveLength(0);
    await s.completeSet('smith-flat-press', 1, 60, 8, now + 3000);
    const stored = (await getAll<SetLog>('sets')).filter((x) => x.exerciseId === 'smith-flat-press');
    expect(stored.filter((x) => !x.deleted)).toHaveLength(1);
    expect(stored.find((x) => x.id === set.id)?.deleted).toBe(true); // the removed one stayed removed
  });
});

describe('restoreBackup duplicate guard', () => {
  const backup = (sets: SetLog[]) => ({ app: 'gym-tracker', format: 1, sets, workouts: [], customExercises: [] });
  const all = async () => getAll<SetLog>('sets');

  it('skips a new import- set that the Sheet already has, does not queue it, and reports the skip', async () => {
    await put('sets', mk('sheet-1'));
    const r = await restoreBackup(backup([mk('import-x', { synced: false }), mk('import-y', { synced: false, setNo: 2 })]));
    expect(r).toMatchObject({ sets: 1, skipped: 1 });
    expect((await all()).map((s) => s.id).sort()).toEqual(['import-y', 'sheet-1']);
    expect(await getAll<QueueItem>('queue')).toEqual([{ id: 'import-y', op: 'upsert' }]);
  });

  it('restoring the same backup twice adds nothing', async () => {
    const file = backup([mk('import-x', { synced: false })]);
    await restoreBackup(file);
    expect(await restoreBackup(file)).toMatchObject({ sets: 0, skipped: 0 });
    expect(await all()).toHaveLength(1);
  });

  it('review ordering case: file has the Sheet copy (uuid) live and the phone import- copy as a tombstone: one live copy remains', async () => {
    await put('sets', mk(IMP(1), { updatedAt: 1 }));
    const r = await restoreBackup(backup([mk('7f3c-uuid', { updatedAt: 1 }), mk(IMP(1), { updatedAt: 5, deleted: true, synced: false })]));
    const live = (await all()).filter((s) => !s.deleted);
    expect(live.map((s) => s.id)).toEqual(['7f3c-uuid']);
    expect(r.sets).toBe(1);
  });

  it('a tombstone for a live local set is applied and queued as a delete', async () => {
    await put('sets', mk('a', { updatedAt: 1 }));
    await restoreBackup(backup([mk('a', { updatedAt: 5, deleted: true, synced: false })]));
    expect((await all())[0].deleted).toBe(true);
    expect(await getAll<QueueItem>('queue')).toEqual([{ id: 'a', op: 'delete' }]);
  });

  it('a same-id edit that changes kg still updates, even when it now matches another set', async () => {
    await put('sets', mk('a', { kg: 60, updatedAt: 1 }));
    await put('sets', mk('sheet-b', { kg: 62.5, setNo: 1 }));
    await restoreBackup(backup([mk('a', { kg: 62.5, updatedAt: 5 })]));
    expect((await all()).find((s) => s.id === 'a')).toMatchObject({ kg: 62.5, updatedAt: 5 });
  });

  it('the review P5 case: renumbering A into B\'s old slot while B moves away is not skipped', async () => {
    await put('sets', mk('A', { setNo: 2, updatedAt: 1 }));
    await put('sets', mk('B', { setNo: 1, updatedAt: 1 }));
    await restoreBackup(backup([mk('B', { setNo: 1, warmup: true, updatedAt: 5 }), mk('A', { setNo: 1, updatedAt: 5 })]));
    expect((await all()).find((s) => s.id === 'A')).toMatchObject({ setNo: 1, updatedAt: 5 });
  });

  it('never skips a set whose id is already here; warm-ups and split-workout sets restore in full', async () => {
    const w = (id: string) => mk(id, { warmup: true, setNo: 0, kg: 20, reps: 10 });
    const split = [1, 2, 3].map((i) => mk(`b${i}`, { setNo: i, workoutId: 'w2', kg: 10, reps: 8 }));
    const first = [1, 2, 3].map((i) => mk(`a${i}`, { setNo: i, workoutId: 'w1', kg: 10, reps: 8 }));
    const r = await restoreBackup(backup([w('w-1'), w('w-2'), ...first, ...split]));
    expect(r).toMatchObject({ sets: 8, skipped: 0 });
  });
});
