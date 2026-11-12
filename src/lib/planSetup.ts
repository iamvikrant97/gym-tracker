// Plan setup: the first-run gate, the migration for installs that already have data, and the pure helpers
// the setup flow and Settings share.
import { setActivePlan, setRetiredNames } from './activePlan.svelte';
import { getAll, loadSettings, updateSettings } from './db';
import { resolvePlan, VIK_PLAN } from './seed';
import type { Plan, Settings } from './types';

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
  const [sets, workouts] = await Promise.all([getAll('sets'), getAll('workouts')]);
  if (sets.length === 0 && workouts.length === 0) return 'setup';
  await updateSettings((cur) => (cur.plan ? cur : { ...cur, plan: vikPlanFor(cur) }));
  setActivePlan(VIK_PLAN);
  return 'ready';
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
