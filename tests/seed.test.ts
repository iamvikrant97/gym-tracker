import { describe, it, expect } from 'vitest';
import { EXERCISES, TEMPLATES, exerciseById, swapOptions, rangeFor } from '../src/lib/seed';

const names = (id: string) =>
  TEMPLATES.find((t) => t.id === id)!.items.map((i) => exerciseById(i.exerciseId)!.name);

describe('seed', () => {
  it('has exactly the six sessions', () => {
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual(['CB-A', 'CB-B', 'L-A', 'L-B', 'SA-A', 'SA-B']);
  });
  it('every template item references an existing exercise', () => {
    for (const t of TEMPLATES) for (const i of t.items) expect(exerciseById(i.exerciseId), i.exerciseId).toBeDefined();
  });
  it('exercise ids are unique', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('CB-B matches the spec', () => {
    expect(names('CB-B')).toEqual(['Converging chest press', 'Seated machine row', 'Smith incline press', 'Neutral-grip pulldown', 'Pec fly machine', 'Straight-arm cable pulldown']);
    expect(TEMPLATES.find((t) => t.id === 'CB-B')!.items.map((i) => i.sets)).toEqual([3, 3, 3, 3, 2, 2]);
  });
  it('straight-arm pulldown details and wide-grip row stays swappable', () => {
    const e = exerciseById('straight-arm-cable-pulldown')!;
    expect([e.step, e.repMin, e.repMax, e.kind, e.muscle]).toEqual([2.5, 12, 15, 'isolation', 'Back']);
    expect(swapOptions('straight-arm-cable-pulldown').map((x) => x.name)).toContain('Wide-grip cable row');
  });
  it('rest defaults follow kind', () => {
    for (const e of EXERCISES) expect(e.restSec, e.name).toBe(e.kind === 'compound' ? 180 : 120);
  });
  it('kind classification', () => {
    const k = (n: string) => EXERCISES.find((e) => e.name === n)!.kind;
    for (const n of ['Smith flat press', 'Lat pulldown wide', 'Cable row V-handle', 'Leg press', 'DB deadlift', 'Romanian deadlift', 'DB shoulder press', 'Assisted pull-up']) expect(k(n), n).toBe('compound');
    for (const n of ['Pec fly machine', 'Leg extension', 'Seated leg curl', 'Barbell curl', 'Rope pushdown', 'DB lateral raise', 'Cable crunch']) expect(k(n), n).toBe('isolation');
  });
  it('flags and extras', () => {
    expect(exerciseById('single-arm-rope-extension')!.perArm).toBe(true);
    expect(exerciseById('assisted-pull-up')!.assisted).toBe(true);
    expect(exerciseById('db-deadlift')).toBeDefined();
    expect(exerciseById('rope-hammer-curl')).toBeDefined();
  });
  it('steps', () => {
    expect(exerciseById('cable-lateral-raise')!.step).toBe(1);
    // Vik's machines load in 2.5 kg steps (10 -> 12.5); 5 kg jumps were too coarse (final review M5).
    for (const id of ['converging-chest-press', 'seated-machine-row', 'lat-pulldown-wide', 'neutral-grip-pulldown', 'leg-press', 'leg-extension', 'seated-leg-curl', 'cable-row-v-handle', 'bar-pushdown'])
      expect(exerciseById(id)!.step).toBe(2.5);
    expect(exerciseById('smith-incline-press')!.step).toBe(2.5);
    expect(exerciseById('db-incline-press')!.step).toBe(2.5);
  });

  it('swapOptions is symmetric across the linked back exercises', () => {
    const linked = ['straight-arm-cable-pulldown', 'wide-grip-cable-row', 'single-arm-cable-row'];
    for (const a of linked) for (const b of linked) {
      if (a !== b) expect(swapOptions(a).map((x) => x.id), `${a} -> ${b}`).toContain(b);
    }
  });

  // [session, [name, sets, repMin, repMax][]] from build.py PLAN
  const PLAN: Record<string, [string, number, number, number][]> = {
    'CB-A': [['Smith flat press', 3, 6, 10], ['Lat pulldown wide', 3, 8, 12], ['Smith incline press', 3, 8, 12], ['Cable row V-handle', 3, 8, 12], ['Pec fly machine', 2, 12, 15], ['Seated machine row', 2, 10, 12]],
    'L-A': [['Leg press', 4, 8, 12], ['Leg extension', 3, 10, 15], ['Romanian deadlift', 3, 8, 10], ['Seated leg curl', 3, 10, 12], ['Calf raise machine', 3, 12, 15]],
    'SA-A': [['DB shoulder press', 3, 8, 10], ['DB lateral raise', 3, 12, 15], ['Pec fly reverse (rear delt)', 3, 12, 15], ['Barbell curl', 5, 8, 12], ['Bar pushdown', 5, 10, 12]],
    'CB-B': [['Converging chest press', 3, 8, 12], ['Seated machine row', 3, 8, 12], ['Smith incline press', 3, 10, 15], ['Neutral-grip pulldown', 3, 10, 12], ['Pec fly machine', 2, 12, 15], ['Straight-arm cable pulldown', 2, 12, 15]],
    'L-B': [['Romanian deadlift', 3, 8, 10], ['Lying leg curl', 3, 10, 12], ['Leg press feet high', 3, 10, 12], ['Calf raise machine', 3, 12, 15], ['Cable crunch', 3, 10, 15]],
    'SA-B': [['Machine shoulder press', 3, 10, 12], ['Cable lateral raise', 4, 12, 20], ['Rope face pull', 3, 12, 15], ['Hammer curl', 3, 10, 12], ['Rope pushdown', 3, 10, 12]],
  };
  for (const [sid, rows] of Object.entries(PLAN)) {
    it(`${sid}: exercises, sets and effective rep ranges match build.py`, () => {
      const t = TEMPLATES.find((x) => x.id === sid)!;
      expect(t.items.map((i) => exerciseById(i.exerciseId)!.name)).toEqual(rows.map((r) => r[0]));
      expect(t.items.map((i) => i.sets)).toEqual(rows.map((r) => r[1]));
      expect(t.items.map((i) => rangeFor(sid as never, i.exerciseId))).toEqual(rows.map((r) => ({ repMin: r[2], repMax: r[3] })));
    });
  }

  it('rangeFor: override, swap override, library fallback', () => {
    expect(rangeFor('CB-B', 'wide-grip-cable-row')).toEqual({ repMin: 12, repMax: 15 });
    expect(rangeFor('CB-A', 'wide-grip-cable-row')).toEqual({ repMin: 10, repMax: 12 });
    expect(rangeFor('CB-A', 'seated-machine-row')).toEqual({ repMin: 10, repMax: 12 });
    expect(rangeFor('CB-B', 'no-such')).toEqual({ repMin: 0, repMax: 0 });
  });
});
