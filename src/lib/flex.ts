import { EXERCISES, exerciseById } from './seed';
import { nextInPlan } from './selection';
import { daysSince, weekStart } from './stats';
import type { ExerciseLookup } from './stats';
import type { Muscle, Plan, SessionId, SessionTemplate, SetLog, TemplateItem, Workout } from './types';

/** Muscles offered in the custom builder, in the order shown. */
export const BUILDER_MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];

const NEVER = 8; // a muscle never trained counts as this many days rested

const musclesOf = (t: { items: TemplateItem[] }, lookup: ExerciseLookup): Muscle[] => {
  const out = new Set<Muscle>();
  for (const i of t.items) {
    const m = lookup(i.exerciseId)?.muscle;
    if (m && m !== 'Other') out.add(m);
  }
  return [...out];
};

export interface Recommendation {
  sessionId: SessionId;
  /** Short reason shown under the card, e.g. "Back and Biceps last trained 6 days ago". */
  reason: string;
}

/**
 * The plan session whose muscles have rested longest (average days since each was last trained).
 * Ties go to the plan's own order of turns, so with no history it agrees with `nextInPlan`.
 */
export function recommend(plan: Plan, workouts: Workout[], sets: SetLog[], today: string, lookup: ExerciseLookup = exerciseById): Recommendation {
  const planned = nextInPlan(plan, workouts, today);
  let best: { id: SessionId; score: number; muscles: Muscle[] } | null = null;
  const order = [planned, ...plan.sessions.map((t) => t.id).filter((id) => id !== planned)];
  for (const id of order) {
    const t = plan.sessions.find((s) => s.id === id)!;
    const muscles = musclesOf(t, lookup);
    if (muscles.length === 0) continue;
    const gaps = muscles.map((m) => daysSince(sets, m, today, lookup) ?? NEVER);
    const score = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    if (!best || score > best.score + 0.01) best = { id, score, muscles };
  }
  if (!best) return { sessionId: planned, reason: 'Next in your plan' };
  const oldest = best.muscles
    .map((m) => ({ m, d: daysSince(sets, m, today, lookup) }))
    .sort((a, b) => (b.d ?? NEVER) - (a.d ?? NEVER))
    .slice(0, 2);
  const names = oldest.map((x) => x.m).join(' and ');
  const d = oldest[0].d;
  return {
    sessionId: best.id,
    reason: d === null ? `${names} not trained yet` : d === 0 ? 'Everything here was trained today' : `${names} last trained ${d} day${d === 1 ? '' : 's'} ago`,
  };
}

/** Name of a custom workout: "Chest + Quads + Shoulders". */
export const customName = (muscles: Muscle[]): string => muscles.join(' + ');

/**
 * A one-off workout for the chosen muscles: `perMuscle` exercises each (default two), taken from the plan first (what you already do),
 * then from the library. Three working sets per exercise.
 */
export function buildCustom(muscles: Muscle[], plan: Plan, lookup: ExerciseLookup = exerciseById, perMuscle = 2): { name: string; items: TemplateItem[] } {
  const used = new Set<string>();
  const items: TemplateItem[] = [];
  const fromPlan = plan.sessions.flatMap((t) => t.items.map((i) => i.exerciseId));
  for (const m of muscles) {
    const pool = [...new Set([...fromPlan, ...EXERCISES.map((e) => e.id)])].filter((id) => lookup(id)?.muscle === m && !used.has(id));
    for (const id of pool.slice(0, perMuscle)) {
      used.add(id);
      items.push({ exerciseId: id, sets: 3 });
    }
  }
  return { name: customName(muscles), items };
}

/** True when `date` is marked as a rest day. */
export const isRestDay = (restDays: string[] | undefined, date: string): boolean => !!restDays?.includes(date);

/** Rest days of the week containing `date`. */
export const restDaysInWeek = (restDays: string[] | undefined, date: string): string[] => (restDays ?? []).filter((d) => weekStart(d) === weekStart(date));
