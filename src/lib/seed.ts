import { getActivePlan, getRetiredNames } from './activePlan.svelte';
import type { Exercise, Muscle, Plan, SessionId, SessionTemplate } from './types';

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
  // Common gym exercises added for the setup flow. Each has a slot of its own, so the Swap lists of the
  // original exercises (Vik's plan) do not change; plans from the setup flow link them (NEW_USER_SWAPS).
  ['Squat', 'Goblet squat', 'Quads', 'Dumbbells', 'c', 8, 12],
  ['Squat', 'Smith squat', 'Quads', 'Smith', 'c', 8, 12],
  ['Squat', 'Barbell back squat', 'Quads', 'Barbell', 'c', 5, 8],
  ['Single-leg', 'Split squat', 'Quads', 'Dumbbells', 'c', 8, 12],
  ['Single-leg', 'Walking lunge', 'Quads', 'Dumbbells', 'c', 8, 12],
  ['Glutes', 'Hip thrust', 'Hamstrings', 'Barbell', 'c', 8, 12],
  ['Barbell press', 'Barbell bench press', 'Chest', 'Barbell', 'c', 5, 8],
  ['Push-up', 'Push-up', 'Chest', 'Bodyweight', 'c', 8, 15, { bodyweight: true }],
  ['Dumbbell row', 'DB row', 'Back', 'Dumbbells', 'c', 8, 12, { perArm: true }],
  ['Back extension', 'Back extension', 'Back', 'Bodyweight', 'i', 10, 15, { bodyweight: true }],
  ['Core', 'Dead bug', 'Abs', 'Bodyweight', 'i', 8, 12, { bodyweight: true }],
];

// 2.5 kg everywhere (machines and cable stacks at Vik's gym step 10 -> 12.5); per-exercise override in Settings.
const defaultStep = (_eq: Equip) => 2.5;

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

/** Extra swap groups for plans made in the setup flow (not Vik's): simple alternatives for the same job. */
export const NEW_USER_SWAPS: string[][] = [
  ['leg-press', 'goblet-squat', 'smith-squat'],
  ['machine-chest-press', 'db-incline-press', 'converging-chest-press', 'push-up'],
  ['romanian-deadlift', 'hip-thrust', 'db-romanian-deadlift'],
  ['split-squat', 'walking-lunge'],
  ['db-curl', 'cable-curl', 'hammer-curl'],
  ['bar-pushdown', 'rope-pushdown'],
  ['cable-crunch', 'dead-bug', 'hanging-knee-raise'],
  ['seated-machine-row', 'cable-row-v-handle', 'db-row'],
];

/** Swap list for an exercise: everything in its slot plus any linked exercises (and `extra` groups it belongs to). */
export function swapOptions(exerciseId: string, extra: string[][] = []): Exercise[] {
  const ex = byId.get(exerciseId);
  if (!ex) return [];
  const ids = new Set(EXERCISES.filter((e) => e.slot === ex.slot).map((e) => e.id));
  if (LINKED_SWAPS.includes(exerciseId)) for (const id of LINKED_SWAPS) ids.add(id);
  for (const g of extra) if (g.includes(exerciseId)) for (const id of g) ids.add(id);
  return EXERCISES.filter((e) => ids.has(e.id));
}

/** Rep ranges for exercises used as a swap in a session where build.py gives a different range. */
const SWAP_RANGES: Partial<Record<SessionId, Record<string, { repMin: number; repMax: number }>>> = {
  'CB-B': { 'wide-grip-cable-row': { repMin: 12, repMax: 15 } },
};

/** Effective rep range: template item override, then swap override, then library. */
export function rangeFor(sessionId: SessionId, exerciseId: string): { repMin: number; repMax: number } {
  const item = templateFor(sessionId)?.items.find((i) => i.exerciseId === exerciseId);
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

// ---- plans ------------------------------------------------------------------------------------------

/** Vik's own split, the built-in plan 'vik': Mon-Sat. Its sessions are the TEMPLATES above. */
export const VIK_PLAN: Plan = { id: 'vik', name: "Vik's split", sessions: TEMPLATES, days: [1, 2, 3, 4, 5, 6], weeklyTarget: 6 };

/** Compounds 8-12 reps, isolation 10-15: the starting ranges of the suggested plan. Double progression stays. */
export function newUserRange(exerciseId: string): { repMin: number; repMax: number } {
  return byId.get(exerciseId)?.kind === 'compound' ? { repMin: 8, repMax: 12 } : { repMin: 10, repMax: 15 };
}

const fb = (id: string, name: string, variant: 'A' | 'B', rows: [string, number][]): SessionTemplate => ({
  id, name, variant,
  items: rows.map(([exerciseId, sets]) => ({ exerciseId, sets, ...newUserRange(exerciseId) })),
});

/** Full body A/B for 2-3 days a week: machines and simple lifts first, 2-3 sets each. */
export const FULLBODY_SESSIONS: SessionTemplate[] = [
  fb('fb-a', 'Full body A', 'A', [
    ['leg-press', 3], ['machine-chest-press', 3], ['seated-machine-row', 3], ['machine-shoulder-press', 2], ['cable-crunch', 2],
  ]),
  fb('fb-b', 'Full body B', 'B', [
    ['hip-thrust', 3], ['lat-pulldown-wide', 3], ['db-incline-press', 3], ['split-squat', 2], ['db-curl', 2], ['dead-bug', 2],
  ]),
];

export function fullBodyPlan(days: number[]): Plan {
  const sessions = FULLBODY_SESSIONS.map((t) => ({ ...t, items: t.items.map((i) => ({ ...i })) }));
  return { id: 'fullbody', name: 'Full body A/B', sessions, days: [...days], weeklyTarget: days.length };
}

/** Plan in effect: the one loaded from settings, else Vik's. */
export function currentPlan(): Plan {
  return getActivePlan() ?? VIK_PLAN;
}

export function templateFor(sessionId: SessionId): SessionTemplate | undefined {
  return currentPlan().sessions.find((t) => t.id === sessionId);
}

/**
 * Name of a session, for old sets too: the active plan, then Vik's and the Full body sessions (always known),
 * then sessions of plans that were replaced. Undefined when nothing knows it.
 */
export function sessionName(sessionId: SessionId): string | undefined {
  return (
    templateFor(sessionId)?.name ??
    TEMPLATES.find((t) => t.id === sessionId)?.name ??
    FULLBODY_SESSIONS.find((t) => t.id === sessionId)?.name ??
    getRetiredNames()[sessionId]
  );
}

/** The stored plan with its sessions filled in (Vik's are not stored). */
export function resolvePlan(stored: Plan): Plan {
  return stored.id === 'vik' ? { ...stored, name: VIK_PLAN.name, sessions: TEMPLATES } : stored;
}
