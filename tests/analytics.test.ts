import { describe, expect, it } from 'vitest';
import { exerciseStrength, monthStats, personalBests, repRanges, sessionsPerWeek, setsLast7Days, topMuscles, weeklyVolume } from '../src/lib/analytics';
import type { SetLog } from '../src/lib/types';

// Thursday 19 Nov 2026. Its week runs Monday 16 Nov to Sunday 22 Nov.
const TODAY = '2026-11-19';
let n = 0;
const set = (date: string, exerciseId: string, kg: number, reps: number, o: Partial<SetLog> = {}): SetLog => ({
  id: `s${n++}`, workoutId: `w-${date}`, date, sessionId: 'CB-A', exerciseId, setNo: 1, kg, reps,
  warmup: false, feltIt: false, doneAt: 0, updatedAt: 0, deleted: false, synced: true, ...o,
});
const CHEST = 'smith-flat-press';
const BICEPS = 'barbell-curl';

describe('weeklyVolume', () => {
  it('adds kg x reps of working sets by muscle and week, oldest week first', () => {
    const v = weeklyVolume([set('2026-11-17', CHEST, 50, 10), set('2026-11-18', CHEST, 50, 8), set('2026-11-10', CHEST, 40, 10)], TODAY, 4);
    expect(v.weeks).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
    expect(v.series.Chest).toEqual([0, 0, 400, 900]);
  });
  it('ignores warm-up, deleted and zero-rep sets', () => {
    const v = weeklyVolume([set('2026-11-17', CHEST, 20, 10, { warmup: true }), set('2026-11-17', CHEST, 50, 10, { deleted: true }), set('2026-11-17', CHEST, 50, 0)], TODAY, 2);
    expect(v.series.Chest).toBeUndefined();
  });
  it('ignores sets older than the window and sets dated in the future', () => {
    const v = weeklyVolume([set('2026-08-01', CHEST, 50, 10), set('2026-11-25', CHEST, 50, 10)], TODAY, 4);
    expect(v.series.Chest).toBeUndefined();
  });
  it('puts an exercise the app does not know under Other, and keeps it out of the top muscles', () => {
    const v = weeklyVolume([set('2026-11-17', 'mystery-move', 30, 10), set('2026-11-17', CHEST, 10, 10)], TODAY, 2);
    expect(v.series.Other).toEqual([0, 300]);
    expect(topMuscles(v, 5)).toEqual(['Chest']);
  });
  it('is empty with no sets', () => {
    expect(weeklyVolume([], TODAY, 3).series).toEqual({});
    expect(topMuscles(weeklyVolume([], TODAY, 3))).toEqual([]);
  });
});

describe('monthStats', () => {
  it('counts workouts this month by workout, not by set', () => {
    const sets = [set('2026-11-03', CHEST, 50, 10), set('2026-11-03', CHEST, 50, 9), set('2026-11-05', BICEPS, 20, 10)];
    expect(monthStats(sets, TODAY, 6).workouts).toBe(2);
  });
  it('counts a week streak of weeks that reached the target, and does not break on a week still in progress', () => {
    const wk = (mondayDays: string[]) => mondayDays.map((d) => set(d, CHEST, 50, 10));
    const sets = [...wk(['2026-11-09', '2026-11-10', '2026-11-11']), ...wk(['2026-11-02', '2026-11-03', '2026-11-04']), ...wk(['2026-11-16'])];
    expect(monthStats(sets, TODAY, 3).weekStreak).toBe(2);
  });
  it('counts this week too once it has reached the target', () => {
    const sets = ['2026-11-16', '2026-11-17', '2026-11-18'].map((d) => set(d, CHEST, 50, 10));
    expect(monthStats(sets, TODAY, 3).weekStreak).toBe(1);
  });
  it('a target of zero never makes a streak, and no sets gives zeros', () => {
    expect(monthStats([set('2026-11-16', CHEST, 50, 10)], TODAY, 0).weekStreak).toBe(0);
    const empty = monthStats([], TODAY, 6);
    expect([empty.workouts, empty.weekStreak, empty.totalWorkouts, empty.volumeKg]).toEqual([0, 0, 0, 0]);
    expect(empty.volumeChange).toBeNull();
  });
});

describe('repRanges', () => {
  it('splits working sets into three ranges whose percentages add up to 100', () => {
    const sets = [set('2026-11-17', CHEST, 80, 4), set('2026-11-17', CHEST, 60, 8), set('2026-11-17', CHEST, 60, 10), set('2026-11-17', CHEST, 30, 15)];
    const r = repRanges(sets, TODAY);
    expect(r.map((x) => x.sets)).toEqual([1, 2, 1]);
    expect(r.reduce((a, b) => a + b.percent, 0)).toBe(100);
  });
  it('adds up to 100 even when the shares do not divide evenly', () => {
    const sets = [1, 2, 3].map((i) => set('2026-11-17', CHEST, 50, i === 1 ? 4 : i === 2 ? 8 : 15));
    expect(repRanges(sets, TODAY).reduce((a, b) => a + b.percent, 0)).toBe(100);
  });
  it('shows zeros with no sets, and skips warm-ups and sets older than 90 days', () => {
    expect(repRanges([], TODAY).map((x) => x.percent)).toEqual([0, 0, 0]);
    const r = repRanges([set('2026-11-17', CHEST, 20, 10, { warmup: true }), set('2026-06-01', CHEST, 50, 10)], TODAY);
    expect(r.map((x) => x.sets)).toEqual([0, 0, 0]);
  });
});

describe('exerciseStrength', () => {
  it('uses the best estimated max of each session and reports the change from the first to the last', () => {
    const s = exerciseStrength([set('2026-11-03', CHEST, 60, 10), set('2026-11-03', CHEST, 40, 10), set('2026-11-17', CHEST, 70, 10)], TODAY);
    expect(s).toHaveLength(1);
    expect(s[0].points).toHaveLength(2);
    expect(s[0].change).toBeCloseTo((s[0].points[1] / s[0].points[0] - 1) * 100, 5);
    expect(s[0].isRecord).toBe(true);
  });
  it('has no change from one session and does not call it a record', () => {
    const s = exerciseStrength([set('2026-11-17', CHEST, 60, 10)], TODAY);
    expect(s[0].change).toBeNull();
    expect(s[0].isRecord).toBe(false);
  });
  it('leaves out assisted and bodyweight exercises, warm-ups, and exercises it does not know', () => {
    const sets = [set('2026-11-17', 'assisted-pull-up', 30, 8), set('2026-11-17', 'push-up', 0, 15), set('2026-11-17', 'mystery-move', 30, 10), set('2026-11-17', CHEST, 20, 10, { warmup: true })];
    expect(exerciseStrength(sets, TODAY)).toEqual([]);
  });
  it('is not a record when a later session was lighter', () => {
    const s = exerciseStrength([set('2026-11-03', CHEST, 80, 10), set('2026-11-17', CHEST, 60, 10)], TODAY);
    expect(s[0].isRecord).toBe(false);
    expect(s[0].change!).toBeLessThan(0);
  });
});

describe('sessionsPerWeek', () => {
  it('counts distinct workouts per Monday-to-Sunday week, ignoring deleted sets', () => {
    const sets = [set('2026-11-16', CHEST, 50, 10), set('2026-11-16', CHEST, 50, 9), set('2026-11-22', BICEPS, 20, 10), set('2026-11-17', CHEST, 50, 10, { deleted: true })];
    const s = sessionsPerWeek(sets, '2026-11-22', 3);
    expect(s.counts).toEqual([0, 0, 2]);
  });
  it('treats Sunday as the end of its week and Monday as the start of the next', () => {
    const s = sessionsPerWeek([set('2026-11-15', CHEST, 50, 10), set('2026-11-16', CHEST, 50, 10)], TODAY, 2);
    expect(s.counts).toEqual([1, 1]);
  });
});

describe('setsLast7Days', () => {
  it('counts working sets from today back six days, by muscle', () => {
    const sets = [set('2026-11-19', CHEST, 50, 10), set('2026-11-13', CHEST, 50, 10), set('2026-11-12', CHEST, 50, 10), set('2026-11-18', BICEPS, 20, 10), set('2026-11-18', BICEPS, 10, 10, { warmup: true })];
    const r = setsLast7Days(sets, TODAY);
    expect(r.Chest).toBe(2);
    expect(r.Biceps).toBe(1);
  });
});

describe('personalBests', () => {
  it('counts an exercise whose best this month beats everything before, and names it', () => {
    const p = personalBests([set('2026-10-20', CHEST, 60, 10), set('2026-11-10', CHEST, 70, 10), set('2026-11-12', BICEPS, 20, 10)], TODAY);
    expect(p.count).toBe(1);
    expect(p.names).toEqual(['Smith flat press']);
  });
  it('does not count a first-ever log or a month that did not beat the past', () => {
    expect(personalBests([set('2026-11-10', CHEST, 70, 10)], TODAY).count).toBe(0);
    expect(personalBests([set('2026-10-20', CHEST, 80, 10), set('2026-11-10', CHEST, 70, 10)], TODAY).count).toBe(0);
  });
  it('ignores warm-ups, assisted and bodyweight exercises', () => {
    const sets = [set('2026-10-20', CHEST, 60, 10), set('2026-11-10', CHEST, 90, 10, { warmup: true }), set('2026-10-20', 'assisted-pull-up', 40, 8), set('2026-11-10', 'assisted-pull-up', 20, 8)];
    expect(personalBests(sets, TODAY).count).toBe(0);
  });
});

describe('weeklySetCounts', () => {
  it('counts hard sets per week by muscle and ignores warm-ups', async () => {
    const { weeklySetCounts } = await import('../src/lib/analytics');
    const mk = (id: string, date: string, extra = {}) => ({ id, workoutId: 'w', date, sessionId: 'x', exerciseId: 'converging-chest-press', setNo: 1, kg: 40, reps: 10, doneAt: 1, updatedAt: 1, deleted: false, synced: true, warmup: false, feltIt: false, ...extra });
    const v = weeklySetCounts([mk('1', '2026-11-16'), mk('2', '2026-11-17'), mk('3', '2026-11-17', { warmup: true }), mk('4', '2026-11-09')], '2026-11-19', 4);
    expect(v.series.Chest).toEqual([0, 0, 1, 2]);
  });
});
