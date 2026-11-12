import type { Exercise, SetLog } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Kills float drift from repeated 2.5 / 0.1 style steps. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const counts = (s: Pick<SetLog, 'warmup'> & { deleted?: boolean }) => !s.warmup && !s.deleted;

export function e1rm(kg: number, reps: number): number {
  return round1(kg * (1 + reps / 30));
}

/** Working (non-warm-up, non-deleted) sets of one exercise, by date, newest date first. */
function sessionsBefore(history: SetLog[], exerciseId: string, beforeDate: string): SetLog[][] {
  const byDate = new Map<string, SetLog[]>();
  for (const s of history) {
    if (s.exerciseId !== exerciseId || !counts(s) || s.date >= beforeDate) continue;
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  return [...byDate.keys()]
    .sort()
    .reverse()
    .map((d) => byDate.get(d)!.sort((a, b) => a.setNo - b.setNo));
}

export function lastSessionSets(history: SetLog[], exerciseId: string, beforeDate: string): SetLog[] {
  return sessionsBefore(history, exerciseId, beforeDate)[0] ?? [];
}

export type RepRange = { repMin: number; repMax: number };

/** Two consecutive earlier sessions with a "felt it" set. */
const feltItHold = (sessions: SetLog[][]) =>
  sessions.length >= 2 && sessions[0].some((s) => s.feltIt) && sessions[1].some((s) => s.feltIt);

/** `range` overrides ex.repMin/repMax (per-session rep ranges, see rangeFor in seed.ts). */
export function targetFor(
  ex: Exercise,
  history: SetLog[],
  setNo: number,
  beforeDate: string,
  range: RepRange = ex,
): { kg: number; reps: number } | null {
  const sessions = sessionsBefore(history, ex.id, beforeDate);
  const last = sessions[0];
  if (ex.bodyweight) {
    // Always 0 kg, so the first set is one tap; only the reps climb, up to the top of the range.
    if (!last || last.length === 0) return { kg: 0, reps: range.repMin };
    const prev = last.find((s) => s.setNo === setNo) ?? last[last.length - 1];
    return { kg: 0, reps: Math.min(Math.max(prev.reps + 1, range.repMin), range.repMax) };
  }
  if (!last || last.length === 0) return null;

  const prev = last.find((s) => s.setNo === setNo) ?? last[last.length - 1];

  // Two consecutive sessions with a "felt it" set: hold.
  if (feltItHold(sessions)) {
    return { kg: prev.kg, reps: prev.reps };
  }

  if (prev.reps >= range.repMax) {
    if (ex.assisted) {
      // Progress = less assistance. Nothing left to remove at 0 kg: hold.
      if (prev.kg <= 0) return { kg: 0, reps: prev.reps };
      return { kg: Math.max(0, round2(prev.kg - ex.step)), reps: range.repMin };
    }
    return { kg: round2(prev.kg + ex.step), reps: range.repMin };
  }
  return { kg: prev.kg, reps: Math.min(prev.reps + 1, range.repMax) };
}

/** Caller must pass only prior sets of the same exercise from earlier workouts. */
export function isPR(
  ex: Exercise,
  set: Pick<SetLog, 'kg' | 'reps' | 'warmup'>,
  priorWorking: SetLog[],
): boolean {
  if (set.warmup || set.reps <= 0) return false;
  const prior = priorWorking.filter((s) => counts(s) && s.reps > 0);
  if (prior.length === 0) return false;

  if (ex.assisted) {
    // Lower kg (less assistance) is better. Must reach the lowest assistance used so far;
    // at that kg it needs more reps, at a lower kg it only needs to match the best reps.
    const minKg = Math.min(...prior.map((s) => s.kg));
    if (set.kg > minKg) return false;
    const bestReps = Math.max(...prior.filter((s) => s.kg === minKg).map((s) => s.reps));
    return set.kg === minKg ? set.reps > bestReps : set.reps >= bestReps;
  }

  if (set.kg === 0) {
    // Bodyweight: e1RM is 0, so compare reps against the best prior reps at 0 kg.
    const zero = prior.filter((s) => s.kg === 0);
    return zero.length > 0 && set.reps > Math.max(...zero.map((s) => s.reps));
  }

  const best = Math.max(...prior.map((s) => e1rm(s.kg, s.reps)));
  return e1rm(set.kg, set.reps) > best;
}

export function addWeightDue(ex: Exercise, history: SetLog[], today: string, range: RepRange = ex): boolean {
  const sessions = sessionsBefore(history, ex.id, today);
  if (ex.bodyweight) return false;
  const last = sessions[0] ?? [];
  if (last.length === 0) return false;
  if (feltItHold(sessions)) return false;
  if (!last.every((s) => s.reps >= range.repMax)) return false;
  // Assisted: only due if there is assistance left to remove.
  return ex.assisted ? Math.min(...last.map((s) => s.kg)) > 0 : true;
}
