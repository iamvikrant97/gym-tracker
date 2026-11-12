// Plan setup: the first-run gate, the migration for installs that already have data, and the pure helpers
// the setup flow and Settings share.
import { setActivePlan, setRetiredNames } from './activePlan.svelte';
import { getAll, loadSettings, updateSettings } from './db';
import { resolvePlan, VIK_PLAN } from './seed';
import type { Plan, SetLog, Settings, Workout } from './types';

export type PlanGate = 'ready' | 'setup';

/**
 * Decides whether the app can show Home. A stored plan is put in effect. With no plan: an install that already has
 * any sets or workouts is Vik's, so plan 'vik' is stored silently (nothing else changes); an empty install must run
 * the setup flow.
 */
export async function initPlan(): Promise<PlanGate> {
  const s = await loadSettings();
  setRetiredNames(s.retiredSessions);
  if (s.plan) {
    setActivePlan(resolvePlan(s.plan));
    return 'ready';
  }
  const [sets, workouts, custom] = await Promise.all([getAll('sets'), getAll('workouts'), getAll('customExercises')]);
  if (!hasData(s) && sets.length === 0 && workouts.length === 0 && custom.length === 0) return 'setup';
  // The name is written down (not left to a default) so a backup carries it.
  await updateSettings((cur) => (cur.plan ? cur : { ...cur, plan: vikPlanFor(cur), userName: cur.userName ?? 'Vik' }));
  setActivePlan(VIK_PLAN);
  return 'ready';
}

const has = (o: object | undefined) => !!o && Object.keys(o).length > 0;

/** Settings that only an install in use has: a Sheet, saved swaps, rest or step changes. */
function hasData(s: Settings): boolean {
  return !!(s.scriptUrl || s.scriptKey) || has(s.templateOverrides) || has(s.restOverrides) || has(s.stepOverrides);
}

/** Vik's built-in plan as stored: no sessions (they come from the code), and his weekly target as it is. */
export function vikPlanFor(s: Pick<Settings, 'weeklyTarget'>): Plan {
  return { id: 'vik', name: VIK_PLAN.name, sessions: [], days: [...VIK_PLAN.days], weeklyTarget: s.weeklyTarget };
}

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Weekdays Monday first (1..6, then 0). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const sortDays = (days: number[]) => [...days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));

/** Default weekdays for a number of days a week. */
export function defaultDays(count: number): number[] {
  switch (count) {
    case 2: return [1, 4];
    case 3: return [1, 3, 5];
    case 4: return [1, 2, 4, 5];
    case 6: return [1, 2, 3, 4, 5, 6];
    case 7: return [1, 2, 3, 4, 5, 6, 0];
    default: return [1, 2, 3, 4, 5].slice(0, Math.max(1, Math.min(5, count)));
  }
}

/** "Mon · Wed · Fri" */
export const daysLabel = (days: number[]) => sortDays(days).map((d) => DAY_SHORT[d]).join(' · ');

/** Home note for a new install: today is a training day, or the next one. */
export function trainingDayNote(plan: Plan, at: Date): string {
  if (plan.days.length === 0) return '';
  const today = at.getDay();
  if (plan.days.includes(today)) return 'Today is a training day';
  for (let i = 1; i <= 7; i++) {
    const d = (today + i) % 7;
    if (plan.days.includes(d)) return `Rest day · next training day is ${DAY_LONG[d]}`;
  }
  return '';
}

export type PlanChoice = 'fullbody' | 'upperlower' | 'ppl' | 'vik' | 'custom';

/** The cards of the "choose a plan" step, in the order shown: what it is, who it suits, and what is in it. */
export const PLAN_CARDS: { id: PlanChoice; name: string; fit: string; desc: string }[] = [
  { id: 'fullbody', name: 'Full body A/B', fit: 'Best for starting or 2–3 days', desc: 'Two workouts that take turns. 5 or 6 exercises each, machines and simple lifts first.' },
  { id: 'upperlower', name: 'Upper/Lower', fit: '4 days, more volume per muscle', desc: 'Upper A, Lower A, Upper B, Lower B. Each muscle is trained twice a week.' },
  { id: 'ppl', name: 'Push/Pull/Legs', fit: '3–6 days, for people comfortable training often', desc: 'Push, Pull, Legs, then the B versions. Six sessions that repeat.' },
  { id: 'vik', name: "Vik's split", fit: '4–6 days, longer sessions', desc: 'Chest + back, legs, shoulders + arms, each in an A and a B version.' },
  { id: 'custom', name: 'Build my own', fit: 'Any number of days', desc: 'Name your sessions and pick the exercises yourself.' },
];

/** The plan highlighted as "Suggested for you" for a number of training days: 2-3 Full body, 4 Upper/Lower, 5-7 Push/Pull/Legs. */
export function suggestedPlanFor(daysPerWeek: number): 'fullbody' | 'upperlower' | 'ppl' {
  return daysPerWeek <= 3 ? 'fullbody' : daysPerWeek === 4 ? 'upperlower' : 'ppl';
}

/** Monday of the week a 'YYYY-MM-DD' date falls in, as a date string. */
function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, m - 1, d);
  at.setDate(at.getDate() - ((at.getDay() + 6) % 7));
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
}

/** Weeks of logged data on a plan after which Home suggests a change. */
export const PLAN_HINT_WEEKS = 8;

/**
 * True once the plan's own sessions have working sets in at least 8 different weeks (Monday to Sunday). Workouts with
 * no sets, warm-ups only, deleted sets and sessions of other plans do not count. `sets` may include deleted ones.
 */
export function planHintDue(plan: Plan, workouts: Workout[], sets: SetLog[]): boolean {
  const ids = new Set(plan.sessions.map((t) => t.id));
  const trained = new Set(sets.filter((x) => !x.deleted && !x.warmup).map((x) => x.workoutId));
  const weeks = new Set<string>();
  for (const w of workouts) if (ids.has(w.sessionId) && trained.has(w.id)) weeks.add(weekStart(w.date));
  return weeks.size >= PLAN_HINT_WEEKS;
}
