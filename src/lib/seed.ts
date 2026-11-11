import type { Exercise, Muscle, SessionId, SessionTemplate } from './types';

const slug = (n: string) =>
  n.toLowerCase().replace(/[()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type Equip = 'Machine' | 'Cable' | 'Smith' | 'Barbell' | 'Dumbbells' | 'Bodyweight';

// slot, name, muscle, equipment, kind (c = compound, i = isolation), repMin, repMax, extras
type Row = [string, string, Muscle, Equip, 'c' | 'i', number, number, Partial<Exercise>?];

const LIB: Row[] = [
  ['Flat press', 'Smith flat press', 'Chest', 'Smith', 'c', 6, 10],
  ['Flat press', 'DB flat press', 'Chest', 'Dumbbells', 'c', 8, 12],
  ['Flat press', 'Converging chest press', 'Chest', 'Machine', 'c', 8, 12],
  ['Flat press', 'Machine chest press', 'Chest', 'Machine', 'c', 8, 12],
  ['Incline press', 'Smith incline press', 'Chest', 'Smith', 'c', 8, 12],
  ['Incline press', 'DB incline press', 'Chest', 'Dumbbells', 'c', 8, 12],
  ['Incline press', 'Incline machine press', 'Chest', 'Machine', 'c', 8, 12],
  ['Chest fly', 'Pec fly machine', 'Chest', 'Machine', 'i', 12, 15],
  ['Chest fly', 'Cable fly', 'Chest', 'Cable', 'i', 12, 15],
  ['Vertical pull', 'Lat pulldown wide', 'Back', 'Machine', 'c', 8, 12],
  ['Vertical pull', 'Neutral-grip pulldown', 'Back', 'Machine', 'c', 10, 12],
  ['Vertical pull', 'Single-arm cable pulldown', 'Back', 'Cable', 'c', 10, 12, { perArm: true }],
  ['Vertical pull', 'Assisted pull-up', 'Back', 'Machine', 'c', 6, 10, { assisted: true }],
  ['Horizontal pull', 'Cable row V-handle', 'Back', 'Cable', 'c', 8, 12],
  ['Horizontal pull', 'Wide-grip cable row', 'Back', 'Cable', 'c', 10, 12],
  ['Horizontal pull', 'Single-arm cable row', 'Back', 'Cable', 'c', 10, 12, { perArm: true }],
  ['Machine row', 'Seated machine row', 'Back', 'Machine', 'c', 10, 12],
  ['Lat isolation', 'Straight-arm cable pulldown', 'Back', 'Cable', 'i', 12, 15, { step: 2.5 }],
  ['Back finisher', 'Face pull', 'Shoulders', 'Cable', 'i', 12, 15],
  ['Leg press', 'Leg press', 'Quads', 'Machine', 'c', 8, 12],
  ['Leg press', 'Leg press feet high', 'Quads', 'Machine', 'c', 10, 12],
  ['Leg extension', 'Leg extension', 'Quads', 'Machine', 'i', 10, 15, { note: 'Pain-free range for the knee' }],
  ['Hinge', 'Romanian deadlift', 'Hamstrings', 'Barbell', 'c', 8, 10],
  ['Hinge', 'DB Romanian deadlift', 'Hamstrings', 'Dumbbells', 'c', 8, 10],
  ['Hinge', 'DB deadlift', 'Hamstrings', 'Dumbbells', 'c', 8, 10],
  ['Leg curl', 'Seated leg curl', 'Hamstrings', 'Machine', 'i', 10, 12],
  ['Leg curl', 'Lying leg curl', 'Hamstrings', 'Machine', 'i', 10, 12],
  ['Calves', 'Calf raise machine', 'Calves', 'Machine', 'i', 12, 15],
  ['Calves', 'Leg press calf raise', 'Calves', 'Machine', 'i', 12, 15],
  ['Abs', 'Cable crunch', 'Abs', 'Cable', 'i', 10, 15],
  ['Abs', 'Hanging knee raise', 'Abs', 'Bodyweight', 'i', 10, 15],
  ['Shoulder press', 'DB shoulder press', 'Shoulders', 'Dumbbells', 'c', 8, 12],
  ['Shoulder press', 'Machine shoulder press', 'Shoulders', 'Machine', 'c', 8, 10],
  ['Shoulder press', 'Smith shoulder press', 'Shoulders', 'Smith', 'c', 8, 10],
  ['Lateral raise', 'DB lateral raise', 'Shoulders', 'Dumbbells', 'i', 12, 15],
  ['Lateral raise', 'Cable lateral raise', 'Shoulders', 'Cable', 'i', 12, 20, { step: 1 }],
  ['Rear delt', 'Pec fly reverse (rear delt)', 'Shoulders', 'Machine', 'i', 12, 15],
  ['Rear delt', 'Rope face pull', 'Shoulders', 'Cable', 'i', 12, 15],
  ['Rear delt', 'Cable rear delt fly', 'Shoulders', 'Cable', 'i', 12, 15],
  ['Biceps', 'Barbell curl', 'Biceps', 'Barbell', 'i', 8, 12],
  ['Biceps', 'DB curl', 'Biceps', 'Dumbbells', 'i', 10, 12],
  ['Biceps', 'Hammer curl', 'Biceps', 'Dumbbells', 'i', 10, 12],
  ['Biceps', 'Incline DB curl', 'Biceps', 'Dumbbells', 'i', 10, 12],
  ['Biceps', 'Cable curl', 'Biceps', 'Cable', 'i', 10, 15],
  ['Biceps', 'Rope hammer curl', 'Biceps', 'Cable', 'i', 10, 12],
  ['Triceps', 'Bar pushdown', 'Triceps', 'Cable', 'i', 10, 12],
  ['Triceps', 'Rope pushdown', 'Triceps', 'Cable', 'i', 10, 12],
  ['Triceps', 'Overhead cable extension', 'Triceps', 'Cable', 'i', 10, 12],
  ['Triceps', 'Single-arm rope extension', 'Triceps', 'Cable', 'i', 10, 12, { perArm: true }],
];

const defaultStep = (eq: Equip) => (eq === 'Machine' || eq === 'Cable' ? 5 : 2.5);

export const EXERCISES: Exercise[] = LIB.map(([slot, name, muscle, eq, k, repMin, repMax, extra]) => {
  const kind = k === 'c' ? 'compound' : 'isolation';
  return {
    id: slug(name), name, slot, muscle, kind,
    step: defaultStep(eq), repMin, repMax,
    restSec: kind === 'compound' ? 180 : 120,
    ...extra,
  };
});

const byId = new Map(EXERCISES.map((e) => [e.id, e]));
export function exerciseById(id: string): Exercise | undefined {
  return byId.get(id);
}

/** Back exercises that can stand in for each other across slots (symmetric). */
const LINKED_SWAPS = ['straight-arm-cable-pulldown', 'single-arm-cable-row', 'wide-grip-cable-row'];

/** Swap list for an exercise: everything in its slot plus any linked exercises. */
export function swapOptions(exerciseId: string): Exercise[] {
  const ex = byId.get(exerciseId);
  if (!ex) return [];
  const ids = new Set(EXERCISES.filter((e) => e.slot === ex.slot).map((e) => e.id));
  if (LINKED_SWAPS.includes(exerciseId)) for (const id of LINKED_SWAPS) ids.add(id);
  return EXERCISES.filter((e) => ids.has(e.id));
}

/** Rep ranges for exercises used as a swap in a session where build.py gives a different range. */
const SWAP_RANGES: Partial<Record<SessionId, Record<string, { repMin: number; repMax: number }>>> = {
  'CB-B': { 'wide-grip-cable-row': { repMin: 12, repMax: 15 } },
};

/** Effective rep range: template item override, then swap override, then library. */
export function rangeFor(sessionId: SessionId, exerciseId: string): { repMin: number; repMax: number } {
  const item = TEMPLATES.find((t) => t.id === sessionId)?.items.find((i) => i.exerciseId === exerciseId);
  if (item?.repMin !== undefined && item.repMax !== undefined) return { repMin: item.repMin, repMax: item.repMax };
  const swap = SWAP_RANGES[sessionId]?.[exerciseId];
  if (swap) return swap;
  const ex = byId.get(exerciseId);
  return { repMin: ex?.repMin ?? 0, repMax: ex?.repMax ?? 0 };
}

type Item = [string, number] | [string, number, number, number];
const T = (id: SessionId, name: string, group: SessionTemplate['group'], variant: 'A' | 'B', items: Item[]): SessionTemplate => ({
  id, name, group, variant,
  items: items.map(([n, sets, repMin, repMax]) => ({ exerciseId: slug(n), sets, ...(repMin !== undefined ? { repMin, repMax } : {}) })),
});

export const TEMPLATES: SessionTemplate[] = [
  T('CB-A', 'Chest + Back A', 'CB', 'A', [
    ['Smith flat press', 3], ['Lat pulldown wide', 3], ['Smith incline press', 3],
    ['Cable row V-handle', 3], ['Pec fly machine', 2], ['Seated machine row', 2],
  ]),
  T('L-A', 'Legs A', 'L', 'A', [
    ['Leg press', 4], ['Leg extension', 3], ['Romanian deadlift', 3], ['Seated leg curl', 3], ['Calf raise machine', 3],
  ]),
  T('SA-A', 'Shoulders + Arms A', 'SA', 'A', [
    ['DB shoulder press', 3, 8, 10], ['DB lateral raise', 3], ['Pec fly reverse (rear delt)', 3], ['Barbell curl', 5], ['Bar pushdown', 5],
  ]),
  T('CB-B', 'Chest + Back B', 'CB', 'B', [
    ['Converging chest press', 3], ['Seated machine row', 3, 8, 12], ['Smith incline press', 3, 10, 15],
    ['Neutral-grip pulldown', 3], ['Pec fly machine', 2], ['Straight-arm cable pulldown', 2],
  ]),
  T('L-B', 'Legs B', 'L', 'B', [
    ['Romanian deadlift', 3], ['Lying leg curl', 3], ['Leg press feet high', 3], ['Calf raise machine', 3], ['Cable crunch', 3],
  ]),
  T('SA-B', 'Shoulders + Arms B', 'SA', 'B', [
    ['Machine shoulder press', 3, 10, 12], ['Cable lateral raise', 4], ['Rope face pull', 3], ['Hammer curl', 3], ['Rope pushdown', 3],
  ]),
];
