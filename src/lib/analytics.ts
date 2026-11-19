// Numbers for the progress screens, from the logged sets. Pure functions: nothing here touches storage.
import { e1rm } from './progression';
import { weekStart, type ExerciseLookup } from './stats';
import { exerciseById } from './seed';
import type { Muscle, SetLog } from './types';

const DAY_MS = 86_400_000;
const toDay = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const fromDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const working = (s: SetLog) => !s.warmup && !s.deleted && s.reps > 0;
const muscleOf = (s: SetLog, lookup: ExerciseLookup): Muscle => lookup(s.exerciseId)?.muscle ?? 'Other';
const tonnage = (s: SetLog) => s.kg * s.reps;

/** How many whole weeks before the week of `today` this date falls (0 = this week). */
const weeksBack = (date: string, today: string) => Math.round((toDay(weekStart(today)) - toDay(weekStart(date))) / 7);

export interface WeeklyVolume {
  /** Monday of each week, oldest first; the last is the week of `today`. */
  weeks: string[];
  /** Total kg lifted (kg x reps of working sets) per week, by muscle. */
  series: Partial<Record<Muscle, number[]>>;
}

export function weeklyVolume(sets: SetLog[], today: string, weeks = 12, lookup: ExerciseLookup = exerciseById): WeeklyVolume {
  const thisMonday = toDay(weekStart(today));
  const labels = Array.from({ length: weeks }, (_, i) => fromDay(thisMonday - 7 * (weeks - 1 - i)));
  const series: Partial<Record<Muscle, number[]>> = {};
  for (const s of sets) {
    if (!working(s)) continue;
    const back = weeksBack(s.date, today);
    if (back < 0 || back >= weeks) continue;
    const m = muscleOf(s, lookup);
    const row = (series[m] ??= new Array<number>(weeks).fill(0));
    row[weeks - 1 - back] += tonnage(s);
  }
  return { weeks: labels, series };
}

/** Hard (working) sets per week by muscle, in the same shape as weeklyVolume. */
export function weeklySetCounts(sets: SetLog[], today: string, weeks = 12, lookup: ExerciseLookup = exerciseById): WeeklyVolume {
  const thisMonday = toDay(weekStart(today));
  const labels = Array.from({ length: weeks }, (_, i) => fromDay(thisMonday - 7 * (weeks - 1 - i)));
  const series: Partial<Record<Muscle, number[]>> = {};
  for (const s of sets) {
    if (!working(s)) continue;
    const back = weeksBack(s.date, today);
    if (back < 0 || back >= weeks) continue;
    const row = (series[muscleOf(s, lookup)] ??= new Array<number>(weeks).fill(0));
    row[weeks - 1 - back] += 1;
  }
  return { weeks: labels, series };
}

/** The muscles with the most total volume over the window, biggest first. */
export function topMuscles(v: WeeklyVolume, n = 5): Muscle[] {
  return (Object.entries(v.series) as [Muscle, number[]][])
    .filter(([m]) => m !== 'Other')
    .map(([m, xs]) => [m, xs.reduce((a, b) => a + b, 0)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([m]) => m);
}

export interface MonthStats {
  volumeKg: number;
  /** Percent change against the previous calendar month; null when there is nothing to compare. */
  volumeChange: number | null;
  workouts: number;
  workoutsChange: number | null;
  /** Weeks in a row (ending with the last finished week, or this one if already done) that reached the weekly target. */
  weekStreak: number;
  totalWorkouts: number;
}

const monthKey = (date: string) => date.slice(0, 7);
const prevMonth = (key: string) => {
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const pct = (now: number, before: number): number | null => (before > 0 ? ((now - before) / before) * 100 : null);

export function monthStats(sets: SetLog[], today: string, weeklyTarget: number): MonthStats {
  const live = sets.filter(working);
  const thisKey = monthKey(today), lastKey = prevMonth(thisKey);
  const vol = { [thisKey]: 0, [lastKey]: 0 };
  const days = { [thisKey]: new Set<string>(), [lastKey]: new Set<string>() };
  for (const s of live) {
    const k = monthKey(s.date);
    if (k in vol) {
      vol[k] += tonnage(s);
      days[k].add(s.workoutId);
    }
  }
  // A workout is one workoutId; weeks are Monday to Sunday.
  const perWeek = new Map<string, Set<string>>();
  for (const s of live) {
    const w = weekStart(s.date);
    (perWeek.get(w) ?? perWeek.set(w, new Set()).get(w)!).add(s.workoutId);
  }
  let streak = 0;
  let cursor = toDay(weekStart(today));
  if ((perWeek.get(fromDay(cursor))?.size ?? 0) < weeklyTarget) cursor -= 7; // this week is still in progress
  while ((perWeek.get(fromDay(cursor))?.size ?? 0) >= weeklyTarget && weeklyTarget > 0) {
    streak++;
    cursor -= 7;
  }
  return {
    volumeKg: Math.round(vol[thisKey]),
    volumeChange: pct(vol[thisKey], vol[lastKey]),
    workouts: days[thisKey].size,
    workoutsChange: pct(days[thisKey].size, days[lastKey].size),
    weekStreak: streak,
    totalWorkouts: new Set(live.map((s) => s.workoutId)).size,
  };
}

export interface RepRange {
  id: 'strength' | 'hypertrophy' | 'endurance';
  label: string;
  reps: string;
  note: string;
  sets: number;
  /** Share of all working sets in the window, 0 to 100 (whole numbers that add up to 100). */
  percent: number;
}

/** Working sets of the last `days` days split by rep count: 1 to 5, 6 to 12, 13 and up. */
export function repRanges(sets: SetLog[], today: string, days = 90): RepRange[] {
  const from = toDay(today) - days;
  const n = { strength: 0, hypertrophy: 0, endurance: 0 };
  for (const s of sets) {
    if (!working(s) || toDay(s.date) <= from || toDay(s.date) > toDay(today)) continue;
    n[s.reps <= 5 ? 'strength' : s.reps <= 12 ? 'hypertrophy' : 'endurance']++;
  }
  const total = n.strength + n.hypertrophy + n.endurance;
  const raw = (['strength', 'hypertrophy', 'endurance'] as const).map((id) => (total ? (n[id] / total) * 100 : 0));
  // Largest-remainder rounding so the three labels add up to 100.
  const floor = raw.map(Math.floor);
  let left = total ? 100 - floor.reduce((a, b) => a + b, 0) : 0;
  [...raw.keys()].sort((a, b) => raw[b] - floor[b] - (raw[a] - floor[a])).forEach((i) => { if (left-- > 0) floor[i]++; });
  const meta = [
    ['strength', 'Strength', '1 to 5 reps', 'Heavy weight, low reps'],
    ['hypertrophy', 'Muscle growth', '6 to 12 reps', 'The usual range for building muscle'],
    ['endurance', 'Endurance', '13+ reps', 'Lighter weight, high reps'],
  ] as const;
  return meta.map(([id, label, reps, note], i) => ({ id, label, reps, note, sets: n[id], percent: floor[i] }));
}

export interface ExerciseStrength {
  exerciseId: string;
  name: string;
  muscle: Muscle;
  /** Best estimated 1-rep max, one point per session, oldest first (last 12). */
  points: number[];
  latest: number;
  /** Percent change from the first to the last point; null with fewer than two sessions. */
  change: number | null;
  /** The newest session set the best value so far. */
  isRecord: boolean;
}

export function exerciseStrength(sets: SetLog[], today: string, weeks = 12, lookup: ExerciseLookup = exerciseById): ExerciseStrength[] {
  const best = new Map<string, Map<string, number>>();
  for (const s of sets) {
    const ex = lookup(s.exerciseId);
    if (!working(s) || !ex || ex.assisted || ex.bodyweight) continue;
    const back = weeksBack(s.date, today);
    if (back < 0 || back >= weeks) continue;
    const byDate = best.get(s.exerciseId) ?? new Map<string, number>();
    byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, e1rm(s.kg, s.reps)));
    best.set(s.exerciseId, byDate);
  }
  const out: ExerciseStrength[] = [];
  for (const [id, byDate] of best) {
    const ex = lookup(id)!;
    const all = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
    const points = all.slice(-12);
    const latest = points[points.length - 1];
    out.push({
      exerciseId: id, name: ex.name, muscle: ex.muscle, points, latest,
      change: points.length > 1 ? pct(latest, points[0]) : null,
      isRecord: all.length > 1 && latest >= Math.max(...all),
    });
  }
  return out.sort((a, b) => (b.change ?? -999) - (a.change ?? -999));
}

export interface WeekSessions {
  weeks: string[];
  /** Distinct workouts per week, oldest first. */
  counts: number[];
}

export function sessionsPerWeek(sets: SetLog[], today: string, weeks = 12): WeekSessions {
  const thisMonday = toDay(weekStart(today));
  const sets_ = Array.from({ length: weeks }, () => new Set<string>());
  for (const s of sets) {
    if (!working(s)) continue;
    const back = weeksBack(s.date, today);
    if (back >= 0 && back < weeks) sets_[weeks - 1 - back].add(s.workoutId);
  }
  return { weeks: Array.from({ length: weeks }, (_, i) => fromDay(thisMonday - 7 * (weeks - 1 - i))), counts: sets_.map((x) => x.size) };
}

/** Working sets per muscle in the week of `today`, for the sets-per-week guide on the Muscle tab. */
export function setsThisWeek(sets: SetLog[], today: string, lookup: ExerciseLookup = exerciseById): Partial<Record<Muscle, number>> {
  const out: Partial<Record<Muscle, number>> = {};
  for (const s of sets) {
    if (!working(s) || weeksBack(s.date, today) !== 0) continue;
    const m = muscleOf(s, lookup);
    out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}

export interface PersonalBests {
  count: number;
  /** Exercise names that set a best-ever estimated max this month, biggest jump first. */
  names: string[];
}

/** Exercises whose best estimated max this calendar month beats everything logged before it. First-ever logs do not count. */
export function personalBests(sets: SetLog[], today: string, lookup: ExerciseLookup = exerciseById): PersonalBests {
  const monthStart = `${today.slice(0, 7)}-01`;
  const before = new Map<string, number>();
  const during = new Map<string, number>();
  for (const s of sets) {
    const ex = lookup(s.exerciseId);
    if (!working(s) || !ex || ex.assisted || ex.bodyweight || s.date > today) continue;
    const m = s.date >= monthStart ? during : before;
    m.set(s.exerciseId, Math.max(m.get(s.exerciseId) ?? 0, e1rm(s.kg, s.reps)));
  }
  const hits = [...during].filter(([id, v]) => before.has(id) && v > before.get(id)!).map(([id, v]) => ({ id, jump: v / before.get(id)! }));
  hits.sort((a, b) => b.jump - a.jump);
  return { count: hits.length, names: hits.map((h) => lookup(h.id)!.name) };
}

/** Working sets per muscle over the 7 days up to and including `today`. */
export function setsLast7Days(sets: SetLog[], today: string, lookup: ExerciseLookup = exerciseById): Partial<Record<Muscle, number>> {
  const end = toDay(today);
  const out: Partial<Record<Muscle, number>> = {};
  for (const s of sets) {
    const d = toDay(s.date);
    if (!working(s) || d > end || d <= end - 7) continue;
    const m = muscleOf(s, lookup);
    out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}
