import { describe, it, expect } from 'vitest';
import { e1rm, lastSessionSets, targetFor, isPR, addWeightDue } from '../src/lib/progression';
import type { Exercise, SetLog } from '../src/lib/types';

const ex = (o: Partial<Exercise> = {}): Exercise => ({
  id: 'e1', name: 'Test', slot: 'S', muscle: 'Chest', kind: 'compound',
  step: 2.5, repMin: 10, repMax: 15, restSec: 180, ...o,
});

let n = 0;
const set = (o: Partial<SetLog> = {}): SetLog => ({
  id: `s${n++}`, workoutId: 'w', date: '2026-11-09', sessionId: 'CB-A', exerciseId: 'e1',
  setNo: 1, kg: 10, reps: 8, warmup: false, feltIt: false, doneAt: 0, updatedAt: 0,
  deleted: false, synced: true, ...o,
});

const TODAY = '2026-11-11';

describe('e1rm', () => {
  it('uses kg * (1 + reps/30) rounded to 0.1', () => {
    expect(e1rm(40, 10)).toBe(53.3);
    expect(e1rm(100, 1)).toBe(103.3);
    expect(e1rm(0, 10)).toBe(0);
  });
});

describe('lastSessionSets', () => {
  it('returns working sets of the most recent earlier date ordered by setNo', () => {
    const h = [
      set({ date: '2026-11-02', setNo: 1, kg: 5 }),
      set({ date: '2026-11-09', setNo: 2, kg: 12 }),
      set({ date: '2026-11-09', setNo: 1, kg: 10 }),
      set({ date: '2026-11-11', setNo: 1, kg: 99 }),
    ];
    expect(lastSessionSets(h, 'e1', TODAY).map((s) => s.kg)).toEqual([10, 12]);
  });
  it('ignores warm-up, deleted and other exercises', () => {
    const h = [
      set({ setNo: 1, warmup: true }),
      set({ setNo: 2, deleted: true }),
      set({ setNo: 3, exerciseId: 'other' }),
      set({ date: '2026-11-02', setNo: 1, kg: 5 }),
    ];
    const r = lastSessionSets(h, 'e1', TODAY);
    expect(r).toHaveLength(1);
    expect(r[0].kg).toBe(5);
  });
  it('is empty with no history or only warm-ups', () => {
    expect(lastSessionSets([], 'e1', TODAY)).toEqual([]);
    expect(lastSessionSets([set({ warmup: true })], 'e1', TODAY)).toEqual([]);
  });
});

describe('targetFor', () => {
  it('is null for first-ever session', () => {
    expect(targetFor(ex(), [], 1, TODAY)).toBeNull();
  });
  it('is null when history has only warm-up or deleted sets', () => {
    expect(targetFor(ex(), [set({ warmup: true }), set({ deleted: true, setNo: 2 })], 1, TODAY)).toBeNull();
  });
  it('adds a rep when below repMax', () => {
    expect(targetFor(ex(), [set({ kg: 10, reps: 8 })], 1, TODAY)).toEqual({ kg: 10, reps: 9 });
  });
  it('caps at repMax (reps + 1 never exceeds it)', () => {
    expect(targetFor(ex({ repMax: 12 }), [set({ kg: 10, reps: 11 })], 1, TODAY)).toEqual({ kg: 10, reps: 12 });
  });
  it('adds a step at repMin when repMax reached', () => {
    const cable = ex({ repMin: 8, repMax: 12, step: 5 });
    expect(targetFor(cable, [set({ kg: 30, reps: 12 })], 1, TODAY)).toEqual({ kg: 35, reps: 8 });
  });
  it('adds a step when reps went above repMax', () => {
    const cable = ex({ repMin: 8, repMax: 12, step: 5 });
    expect(targetFor(cable, [set({ kg: 30, reps: 15 })], 1, TODAY)).toEqual({ kg: 35, reps: 8 });
  });
  it('avoids float drift with 2.5 steps', () => {
    const e = ex({ repMin: 8, repMax: 12, step: 2.5 });
    expect(targetFor(e, [set({ kg: 22.5, reps: 12 })], 1, TODAY)).toEqual({ kg: 25, reps: 8 });
    expect(targetFor(ex({ repMax: 12, step: 0.1 }), [set({ kg: 0.2, reps: 12 })], 1, TODAY)!.kg).toBe(0.3);
  });
  it('uses the matching set number from last session', () => {
    const h = [set({ setNo: 1, kg: 10, reps: 12 }), set({ setNo: 2, kg: 10, reps: 9 })];
    const e = ex({ repMin: 8, repMax: 12 });
    expect(targetFor(e, h, 1, TODAY)).toEqual({ kg: 12.5, reps: 8 });
    expect(targetFor(e, h, 2, TODAY)).toEqual({ kg: 10, reps: 10 });
  });
  it('uses the last set when set n did not exist last time', () => {
    const h = [set({ setNo: 1, kg: 10, reps: 12 }), set({ setNo: 2, kg: 10, reps: 9 })];
    expect(targetFor(ex({ repMax: 12 }), h, 3, TODAY)).toEqual({ kg: 10, reps: 10 });
  });
  it('ignores warm-up sets when finding the previous set', () => {
    const h = [set({ setNo: 1, kg: 5, reps: 15, warmup: true }), set({ setNo: 2, kg: 10, reps: 8 })];
    expect(targetFor(ex(), h, 1, TODAY)).toEqual({ kg: 10, reps: 9 });
  });
  it('only looks at dates before the given date', () => {
    const h = [set({ date: '2026-11-09', kg: 10, reps: 8 }), set({ date: '2026-11-11', kg: 50, reps: 8 })];
    expect(targetFor(ex(), h, 1, TODAY)).toEqual({ kg: 10, reps: 9 });
  });
  it('treats perArm kg as plain per-arm load', () => {
    const e = ex({ perArm: true, repMin: 10, repMax: 12, step: 2 });
    expect(targetFor(e, [set({ kg: 8, reps: 12 })], 1, TODAY)).toEqual({ kg: 10, reps: 10 });
  });

  describe('felt it hold', () => {
    const e = ex({ repMin: 8, repMax: 12, step: 5 });
    it('holds last kg and reps after two consecutive sessions with felt it', () => {
      const h = [
        set({ date: '2026-11-02', kg: 30, reps: 12, feltIt: true }),
        set({ date: '2026-11-09', kg: 30, reps: 12, feltIt: true }),
      ];
      expect(targetFor(e, h, 1, TODAY)).toEqual({ kg: 30, reps: 12 });
    });
    it('any set of the session counts', () => {
      const h = [
        set({ date: '2026-11-02', setNo: 1, kg: 30, reps: 12 }),
        set({ date: '2026-11-02', setNo: 2, kg: 30, reps: 12, feltIt: true }),
        set({ date: '2026-11-09', setNo: 1, kg: 30, reps: 12 }),
        set({ date: '2026-11-09', setNo: 2, kg: 30, reps: 12, feltIt: true }),
      ];
      expect(targetFor(e, h, 1, TODAY)).toEqual({ kg: 30, reps: 12 });
    });
    it('does not hold with only one felt-it session', () => {
      const h = [
        set({ date: '2026-11-02', kg: 30, reps: 12 }),
        set({ date: '2026-11-09', kg: 30, reps: 12, feltIt: true }),
      ];
      expect(targetFor(e, h, 1, TODAY)).toEqual({ kg: 35, reps: 8 });
    });
    it('does not hold when the felt-it sessions are not the two latest', () => {
      const h = [
        set({ date: '2026-10-26', kg: 30, reps: 12, feltIt: true }),
        set({ date: '2026-11-02', kg: 30, reps: 12, feltIt: true }),
        set({ date: '2026-11-09', kg: 30, reps: 12 }),
      ];
      expect(targetFor(e, h, 1, TODAY)).toEqual({ kg: 35, reps: 8 });
    });
    it('ignores felt-it on warm-up or deleted sets', () => {
      const h = [
        set({ date: '2026-11-02', kg: 30, reps: 12, feltIt: true, warmup: true }),
        set({ date: '2026-11-02', setNo: 2, kg: 30, reps: 12 }),
        set({ date: '2026-11-09', kg: 30, reps: 12, feltIt: true }),
      ];
      expect(targetFor(e, h, 1, TODAY)).toEqual({ kg: 35, reps: 8 });
    });
  });

  describe('assisted', () => {
    const a = ex({ assisted: true, repMin: 6, repMax: 10, step: 5 });
    it('lowers assistance when repMax reached', () => {
      expect(targetFor(a, [set({ kg: 30, reps: 10 })], 1, TODAY)).toEqual({ kg: 25, reps: 6 });
    });
    it('adds a rep below repMax at the same assistance', () => {
      expect(targetFor(a, [set({ kg: 30, reps: 7 })], 1, TODAY)).toEqual({ kg: 30, reps: 8 });
    });
    it('never goes below zero assistance', () => {
      expect(targetFor(a, [set({ kg: 3, reps: 10 })], 1, TODAY)).toEqual({ kg: 0, reps: 6 });
      expect(targetFor(a, [set({ kg: 0, reps: 10 })], 1, TODAY)).toEqual({ kg: 0, reps: 10 });
    });
  });
});

describe('isPR', () => {
  const E = ex();
  it('is true for more reps at the same kg, false for equal', () => {
    const prior = [set({ kg: 40, reps: 10 })];
    expect(isPR(E, { kg: 40, reps: 11, warmup: false }, prior)).toBe(true);
    expect(isPR(E, { kg: 40, reps: 10, warmup: false }, prior)).toBe(false);
    expect(isPR(E, { kg: 40, reps: 9, warmup: false }, prior)).toBe(false);
  });
  it('is true for more weight with enough reps to beat e1RM', () => {
    expect(isPR(E, { kg: 45, reps: 10, warmup: false }, [set({ kg: 40, reps: 10 })])).toBe(true);
  });
  it('first-ever set is not a PR', () => {
    expect(isPR(E, { kg: 40, reps: 10, warmup: false }, [])).toBe(false);
  });
  it('warm-up sets are never PRs and prior warm-ups/deleted do not count', () => {
    expect(isPR(E, { kg: 100, reps: 10, warmup: true }, [set({ kg: 40, reps: 10 })])).toBe(false);
    expect(isPR(E, { kg: 40, reps: 10, warmup: false }, [set({ kg: 100, reps: 10, warmup: true })])).toBe(false);
    expect(isPR(E, { kg: 40, reps: 11, warmup: false }, [set({ kg: 40, reps: 10 }), set({ kg: 200, reps: 10, deleted: true })])).toBe(true);
  });
  it('is false with only warm-up history', () => {
    expect(isPR(E, { kg: 40, reps: 10, warmup: false }, [set({ warmup: true })])).toBe(false);
  });
  it('is false for zero reps', () => {
    expect(isPR(E, { kg: 40, reps: 0, warmup: false }, [set({ kg: 40, reps: 10 })])).toBe(false);
  });

  describe('assisted', () => {
    const A = ex({ assisted: true });
    const prior = [set({ kg: 30, reps: 8 }), set({ kg: 40, reps: 10 })];
    it('is true for lower kg at reps >= best reps at the lowest prior kg', () => {
      expect(isPR(A, { kg: 25, reps: 8, warmup: false }, prior)).toBe(true);
      expect(isPR(A, { kg: 25, reps: 9, warmup: false }, prior)).toBe(true);
    });
    it('is false for lower kg with fewer reps', () => {
      expect(isPR(A, { kg: 25, reps: 7, warmup: false }, prior)).toBe(false);
    });
    it('is false when kg is higher, however many reps', () => {
      expect(isPR(A, { kg: 35, reps: 12, warmup: false }, prior)).toBe(false);
      expect(isPR(A, { kg: 45, reps: 12, warmup: false }, prior)).toBe(false);
    });
    it('same kg needs strictly more reps', () => {
      expect(isPR(A, { kg: 30, reps: 9, warmup: false }, prior)).toBe(true);
      expect(isPR(A, { kg: 30, reps: 8, warmup: false }, prior)).toBe(false);
    });
    it('first-ever set is not a PR', () => {
      expect(isPR(A, { kg: 30, reps: 8, warmup: false }, [])).toBe(false);
    });
  });
});

describe('addWeightDue', () => {
  const e = ex({ repMin: 8, repMax: 12 });
  it('is true when every working set last session reached repMax', () => {
    const h = [set({ setNo: 1, reps: 12 }), set({ setNo: 2, reps: 13 })];
    expect(addWeightDue(e, h, TODAY)).toBe(true);
  });
  it('is false if one set missed', () => {
    const h = [set({ setNo: 1, reps: 12 }), set({ setNo: 2, reps: 11 })];
    expect(addWeightDue(e, h, TODAY)).toBe(false);
  });
  it('is false with no history or only warm-ups', () => {
    expect(addWeightDue(e, [], TODAY)).toBe(false);
    expect(addWeightDue(e, [set({ warmup: true, reps: 12 })], TODAY)).toBe(false);
  });
  it('ignores warm-up sets that fell short', () => {
    expect(addWeightDue(e, [set({ warmup: true, reps: 5 }), set({ setNo: 2, reps: 12 })], TODAY)).toBe(true);
  });
  it('only considers dates before today', () => {
    const h = [set({ date: '2026-11-09', reps: 12 }), set({ date: '2026-11-11', reps: 3 })];
    expect(addWeightDue(e, h, TODAY)).toBe(true);
  });
  it('assisted: false when there is no assistance left to remove', () => {
    const a = ex({ assisted: true, repMax: 10 });
    expect(addWeightDue(a, [set({ kg: 20, reps: 10 })], TODAY)).toBe(true);
    expect(addWeightDue(a, [set({ kg: 0, reps: 10 })], TODAY)).toBe(false);
  });
});

describe('effective range, felt-it hold and bodyweight PRs', () => {
  it('targetFor uses an optional range override', () => {
    const h = [set({ kg: 10, reps: 12 })];
    expect(targetFor(ex({ repMax: 15 }), h, 1, TODAY)).toEqual({ kg: 10, reps: 13 });
    expect(targetFor(ex({ repMax: 15 }), h, 1, TODAY, { repMin: 8, repMax: 12 })).toEqual({ kg: 12.5, reps: 8 });
  });
  it('addWeightDue uses an optional range override', () => {
    const h = [set({ kg: 10, reps: 12 })];
    expect(addWeightDue(ex({ repMax: 15 }), h, TODAY)).toBe(false);
    expect(addWeightDue(ex({ repMax: 15 }), h, TODAY, { repMin: 8, repMax: 12 })).toBe(true);
  });
  it('addWeightDue is false while the felt-it hold applies', () => {
    const h = [
      set({ date: '2026-11-02', kg: 10, reps: 15, feltIt: true }),
      set({ date: '2026-11-09', kg: 10, reps: 15, feltIt: true }),
    ];
    expect(addWeightDue(ex(), h, TODAY)).toBe(false);
  });
  it('0 kg exercise: PR when reps exceed best prior reps at 0 kg', () => {
    const e = ex();
    const prior = [set({ kg: 0, reps: 12 })];
    expect(isPR(e, { kg: 0, reps: 15, warmup: false }, prior)).toBe(true);
    expect(isPR(e, { kg: 0, reps: 12, warmup: false }, prior)).toBe(false);
    expect(isPR(e, { kg: 0, reps: 10, warmup: false }, prior)).toBe(false);
  });
});
