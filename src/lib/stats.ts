import { e1rm, isPR } from './progression';
import { exerciseById } from './seed';
import type { Exercise, Muscle, SetLog, Settings, Workout } from './types';

const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Calves', 'Abs', 'Other'];
const DAY_MS = 86_400_000;
const MET = 5;
const SECONDS_PER_SET = 40;

/** Working sets only: warm-up and deleted sets never count. */
const working = (s: SetLog) => !s.warmup && !s.deleted;

/** Resolves an exercise id (seed by default; pass the store's lookup to include custom exercises). */
export type ExerciseLookup = (id: string) => Exercise | undefined;

const muscleOf = (s: SetLog, lookup: ExerciseLookup): Muscle => lookup(s.exerciseId)?.muscle ?? 'Other';

// Dates are local YYYY-MM-DD strings; do day arithmetic in UTC so DST/timezone never shifts a day.
const toDay = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const fromDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Monday (YYYY-MM-DD) of the week containing `date`. Weeks run Monday to Sunday. */
export function weekStart(date: string): string {
  const day = toDay(date);
  const sinceMonday = (day + 3) % 7; // 1970-01-01 was a Thursday
  return fromDay(day - sinceMonday);
}

export function weeklySets(sets: SetLog[], weekOf: string, lookup: ExerciseLookup = exerciseById): Record<Muscle, number> {
  const start = weekStart(weekOf);
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const s of sets) {
    if (!working(s) || weekStart(s.date) !== start) continue;
    out[muscleOf(s, lookup)]++;
  }
  return out;
}

/** Working sets of one muscle per week, oldest to newest; the last entry is the week of `today`. */
export function setsPerWeek(sets: SetLog[], muscle: Muscle, weeks: number, today: string, lookup: ExerciseLookup = exerciseById): number[] {
  const thisWeek = toDay(weekStart(today));
  const counts = new Array<number>(Math.max(0, weeks)).fill(0);
  for (const s of sets) {
    if (!working(s) || muscleOf(s, lookup) !== muscle) continue;
    const back = Math.round((thisWeek - toDay(weekStart(s.date))) / 7);
    if (back >= 0 && back < counts.length) counts[counts.length - 1 - back]++;
  }
  return counts;
}

/** Whole days since the muscle last had a working set; null if never. Future-dated sets count as 0. */
export function daysSince(sets: SetLog[], muscle: Muscle, today: string, lookup: ExerciseLookup = exerciseById): number | null {
  let last: string | null = null;
  for (const s of sets) {
    if (!working(s) || muscleOf(s, lookup) !== muscle) continue;
    if (last === null || s.date > last) last = s.date;
  }
  return last === null ? null : Math.max(0, toDay(today) - toDay(last));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * % change of the mean session-best e1RM, last 14 days vs 28-42 days ago, averaged over
 * the exercises of the muscle that appear in both windows. Null with fewer than 3 sessions
 * of the muscle in the two windows, or when no exercise can be compared.
 * Assisted exercises are skipped: their kg is assistance, so e1RM does not apply.
 */
export function muscleTrend(sets: SetLog[], muscle: Muscle, today: string, lookup: ExerciseLookup = exerciseById): number | null {
  const now = toDay(today);
  const recent = new Map<string, Map<string, number>>(); // exerciseId -> date -> best e1RM
  const prior = new Map<string, Map<string, number>>();
  const sessions = new Set<string>();

  for (const s of sets) {
    if (!working(s) || muscleOf(s, lookup) !== muscle || s.reps <= 0) continue;
    const ago = now - toDay(s.date);
    const bucket = ago >= 0 && ago <= 13 ? recent : ago >= 28 && ago <= 42 ? prior : null;
    if (!bucket) continue;
    sessions.add(s.date);
    if (lookup(s.exerciseId)?.assisted) continue;
    const byDate = bucket.get(s.exerciseId) ?? new Map<string, number>();
    byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, e1rm(s.kg, s.reps)));
    bucket.set(s.exerciseId, byDate);
  }
  if (sessions.size < 3) return null;

  const changes: number[] = [];
  for (const [id, r] of recent) {
    const p = prior.get(id);
    if (!p) continue;
    const before = mean([...p.values()]);
    if (before <= 0) continue;
    changes.push(((mean([...r.values()]) - before) / before) * 100);
  }
  if (changes.length === 0) return null;
  return Math.round(mean(changes) * 10) / 10;
}

export function homeNotes(sets: SetLog[], workouts: Workout[], s: Settings, today: string, lookup: ExerciseLookup = exerciseById): string[] {
  const start = weekStart(today);
  // A workout with no logged sets (started, then abandoned) is not a session done.
  const hasSets = new Set(sets.filter(working).map((x) => x.workoutId));
  const done = workouts.filter((w) => weekStart(w.date) === start && hasSets.has(w.id)).length;
  const notes = [`${done} of ${s.weeklyTarget} sessions done this week`];
  if (!s.paused) {
    const ages = (['Quads', 'Hamstrings', 'Calves'] as const)
      .map((m) => daysSince(sets, m, today, lookup))
      .filter((d): d is number => d !== null);
    const legs = ages.length ? Math.min(...ages) : null;
    if (legs !== null && legs >= 5) notes.push(`Legs trained ${legs} days ago`);
  }
  return notes;
}

export function workoutSummary(
  w: Workout,
  sets: SetLog[],
  bodyKg: number,
  lookup: ExerciseLookup = exerciseById,
): { minutes: number; sets: number; volume: number; prs: string[]; avgRestSec: number; workRatio: number; kcal: number } {
  const mine = sets.filter((s) => s.workoutId === w.id && working(s)).sort((a, b) => a.doneAt - b.doneAt);
  const lastDone = mine.length ? mine[mine.length - 1].doneAt : w.startedAt;
  const durationMs = Math.max(0, (w.endedAt ?? lastDone) - w.startedAt, lastDone - w.startedAt);
  const minutes = Math.round(durationMs / 60_000);

  const volume = mine.reduce((sum, s) => sum + s.kg * s.reps, 0);

  let avgRestSec = 0;
  if (mine.length > 1) {
    avgRestSec = Math.round((mine[mine.length - 1].doneAt - mine[0].doneAt) / (mine.length - 1) / 1000);
  }

  const workRatio = durationMs > 0 ? Math.min(1, (mine.length * SECONDS_PER_SET * 1000) / durationMs) : 0;

  // A PR is measured against earlier workouts only, so a progressing session is not flagged by its own sets.
  const prs: string[] = [];
  for (const s of mine) {
    const ex = lookup(s.exerciseId);
    if (!ex || prs.includes(ex.name)) continue;
    const history = sets.filter(
      (h) => h.exerciseId === s.exerciseId && h.workoutId !== w.id && (h.date < w.date || h.doneAt < w.startedAt),
    );
    if (isPR(ex, s, history)) prs.push(ex.name);
  }

  const legDay = w.sessionId.startsWith('L-');
  const kcal = Math.round((MET * bodyKg * (minutes / 60) * (legDay ? 1.1 : 1)) / 10) * 10;

  return { minutes, sets: mine.length, volume, prs, avgRestSec, workRatio, kcal };
}
