import { describe, it, expect } from 'vitest';
import { EXERCISES, TEMPLATES, exerciseById, swapOptions } from '../src/lib/seed';

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
    expect(exerciseById('converging-chest-press')!.step).toBe(5);
    expect(exerciseById('smith-incline-press')!.step).toBe(2.5);
    expect(exerciseById('db-incline-press')!.step).toBe(2.5);
  });
});
