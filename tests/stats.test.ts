import { describe, it, expect } from 'vitest';
import {
  weekStart, weeklySets, setsPerWeek, daysSince, muscleTrend, homeNotes, workoutSummary,
} from '../src/lib/stats';
import type { Exercise, SetLog, Settings, Workout } from '../src/lib/types';

let n = 0;
const set = (date: string, exerciseId: string, kg: number, reps: number, o: Partial<SetLog> = {}): SetLog => ({
  id: `s${n++}`, workoutId: `w-${date}`, date, sessionId: 'CB-A', exerciseId, setNo: 1, kg, reps,
  warmup: false, feltIt: false, doneAt: Date.parse(`${date}T07:00:00+05:30`) + n * 1000,
  updatedAt: 0, deleted: false, synced: true, ...o,
});
const times = (c: number, f: () => SetLog) => Array.from({ length: c }, f);

const settings: Settings = {
  paused: false, weeklyTarget: 4, restOverrides: {}, stepOverrides: {}, pinnedPlaylists: [], templateOverrides: {},
};
const workout = (date: string, o: Partial<Workout> = {}): Workout => ({
  id: `w-${date}`, date, sessionId: 'CB-A', startedAt: Date.parse(`${date}T07:00:00+05:30`), swaps: {}, ...o,
});

// Mon 9 Nov chest+back, Tue 10 Nov shoulders+arms, Wed 11 Nov legs (partial)
const week: SetLog[] = [
  ...times(3, () => set('2026-11-09', 'smith-flat-press', 60, 8)),
  ...times(3, () => set('2026-11-09', 'smith-incline-press', 40, 10)),
  ...times(3, () => set('2026-11-09', 'pec-fly-machine', 30, 12)),
  ...times(3, () => set('2026-11-09', 'lat-pulldown-wide', 50, 10)),
  ...times(3, () => set('2026-11-09', 'cable-row-v-handle', 45, 10)),
  ...times(3, () => set('2026-11-10', 'db-shoulder-press', 20, 10, { sessionId: 'SA-A' })),
  ...times(3, () => set('2026-11-10', 'db-lateral-raise', 8, 12, { sessionId: 'SA-A' })),
  ...times(3, () => set('2026-11-10', 'pec-fly-reverse-rear-delt', 25, 12, { sessionId: 'SA-A' })),
  ...times(4, () => set('2026-11-10', 'barbell-curl', 20, 10, { sessionId: 'SA-A' })),
  ...times(3, () => set('2026-11-10', 'bar-pushdown', 25, 10, { sessionId: 'SA-A' })),
  ...times(3, () => set('2026-11-11', 'leg-extension', 40, 12, { sessionId: 'L-A' })),
  ...times(3, () => set('2026-11-11', 'seated-leg-curl', 35, 12, { sessionId: 'L-A' })),
  ...times(3, () => set('2026-11-11', 'calf-raise-machine', 60, 12, { sessionId: 'L-A' })),
];

describe('weekStart', () => {
  it('returns the Monday of the week', () => {
    expect(weekStart('2026-11-11')).toBe('2026-11-09');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
    expect(weekStart('2026-11-15')).toBe('2026-11-09'); // Sunday
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
  });
  it('crosses month and year boundaries', () => {
    expect(weekStart('2026-01-01')).toBe('2025-12-29');
    expect(weekStart('2026-03-01')).toBe('2026-02-23');
  });
});

describe('weeklySets', () => {
  it('counts working sets per muscle for the week', () => {
    expect(weeklySets(week, '2026-11-09')).toMatchObject({
      Chest: 9, Back: 6, Shoulders: 9, Biceps: 4, Triceps: 3, Quads: 3, Hamstrings: 3, Calves: 3, Abs: 0,
    });
  });
  it('accepts any day within the week', () => {
    expect(weeklySets(week, '2026-11-11').Chest).toBe(9);
  });
  it('excludes warm-up and deleted sets', () => {
    const extra = [
      set('2026-11-09', 'smith-flat-press', 20, 10, { warmup: true }),
      set('2026-11-09', 'smith-flat-press', 60, 8, { deleted: true }),
    ];
    expect(weeklySets([...week, ...extra], '2026-11-09').Chest).toBe(9);
  });
  it('ignores sets from other weeks', () => {
    expect(weeklySets(week, '2026-11-16').Chest).toBe(0);
    expect(weeklySets(week, '2026-11-02').Chest).toBe(0);
  });
});

describe('setsPerWeek', () => {
  it('returns oldest to newest, current week last', () => {
    const history = [...week, ...times(5, () => set('2026-11-03', 'smith-flat-press', 60, 8))];
    expect(setsPerWeek(history, 'Chest', 3, '2026-11-11')).toEqual([0, 5, 9]);
  });
  it('skips warm-ups', () => {
    const h = [set('2026-11-10', 'smith-flat-press', 20, 10, { warmup: true })];
    expect(setsPerWeek(h, 'Chest', 2, '2026-11-11')).toEqual([0, 0]);
  });
});

describe('daysSince', () => {
  it('counts days since the muscle was last trained', () => {
    expect(daysSince(week, 'Quads', '2026-11-12')).toBe(1);
    expect(daysSince(week, 'Chest', '2026-11-12')).toBe(3);
    expect(daysSince(week, 'Quads', '2026-11-11')).toBe(0);
  });
  it('is null when never trained, ignoring warm-up and deleted sets', () => {
    expect(daysSince(week, 'Abs', '2026-11-12')).toBeNull();
    const h = [
      set('2026-11-11', 'leg-extension', 20, 10, { warmup: true }),
      set('2026-11-11', 'leg-extension', 40, 10, { deleted: true }),
    ];
    expect(daysSince(h, 'Quads', '2026-11-12')).toBeNull();
  });
});

describe('muscleTrend', () => {
  const today = '2026-11-12';
  it('is null with fewer than 3 sessions', () => {
    const h = [set('2026-11-01', 'smith-flat-press', 60, 8), set('2026-11-10', 'smith-flat-press', 70, 8)];
    expect(muscleTrend(h, 'Chest', today)).toBeNull();
  });
  it('shows percent change for a rising 3-session fixture', () => {
    const h = [
      set('2026-10-08', 'smith-flat-press', 60, 10), // 34 days ago, e1RM 80
      set('2026-11-03', 'smith-flat-press', 66, 10), // 9 days ago, e1RM 88
      set('2026-11-10', 'smith-flat-press', 72, 10), // 2 days ago, e1RM 96
    ];
    // recent mean (88 + 96) / 2 = 92 vs 80 -> +15%
    expect(muscleTrend(h, 'Chest', today)).toBe(15);
  });
  it('is negative when strength drops', () => {
    const h = [
      set('2026-10-08', 'smith-flat-press', 72, 10),
      set('2026-11-03', 'smith-flat-press', 66, 10),
      set('2026-11-10', 'smith-flat-press', 60, 10),
    ];
    expect(muscleTrend(h, 'Chest', today)!).toBeLessThan(0);
  });
  it('ignores warm-up and deleted sets', () => {
    const h = [
      set('2026-10-08', 'smith-flat-press', 60, 10),
      set('2026-11-03', 'smith-flat-press', 66, 10),
      set('2026-11-10', 'smith-flat-press', 200, 10, { warmup: true }),
    ];
    expect(muscleTrend(h, 'Chest', today)).toBeNull();
  });
  it('is null when a window has no data to compare', () => {
    const h = [
      set('2026-11-01', 'smith-flat-press', 60, 10),
      set('2026-11-05', 'smith-flat-press', 66, 10),
      set('2026-11-10', 'smith-flat-press', 72, 10),
    ];
    expect(muscleTrend(h, 'Chest', today)).toBeNull();
  });
});

describe('homeNotes', () => {
  const workouts = [workout('2026-11-09'), workout('2026-11-10', { sessionId: 'SA-A' })];
  // one working set per workout so both count as sessions done
  const logged = [set('2026-11-09', 'smith-flat-press', 60, 8), set('2026-11-10', 'db-shoulder-press', 20, 10)];
  it('shows sessions done this week and an old legs note', () => {
    const legs = [set('2026-11-05', 'leg-extension', 40, 12)];
    expect(homeNotes([...logged, ...legs], workouts, settings, '2026-11-11')).toEqual([
      '2 of 4 sessions done this week',
      'Legs trained 6 days ago',
    ]);
  });
  it('omits the legs line when trained under 5 days ago', () => {
    const legs = [set('2026-11-08', 'leg-extension', 40, 12)];
    expect(homeNotes([...logged, ...legs], workouts, settings, '2026-11-11')).toEqual(['2 of 4 sessions done this week']);
  });
  it('omits the legs line when paused', () => {
    const legs = [set('2026-11-01', 'leg-extension', 40, 12)];
    expect(homeNotes([...logged, ...legs], workouts, { ...settings, paused: true }, '2026-11-11')).toEqual([
      '2 of 4 sessions done this week',
    ]);
  });
  it('ignores last week workouts and recently trained legs', () => {
    const legs = [set('2026-11-10', 'leg-extension', 40, 12)];
    const out = homeNotes(legs, [workout('2026-11-02')], settings, '2026-11-11');
    expect(out).toEqual(['0 of 4 sessions done this week']);
  });
});

describe('homeNotes ignores workouts with no sets', () => {
  it('does not count an abandoned workout as a session', () => {
    const ws = [workout('2026-11-09'), workout('2026-11-10', { sessionId: 'SA-A' })];
    const out = homeNotes([set('2026-11-09', 'smith-flat-press', 60, 8)], ws, settings, '2026-11-11');
    expect(out[0]).toBe('1 of 4 sessions done this week');
  });
});

describe('custom exercise lookup', () => {
  const custom: Exercise = {
    id: 'custom-1', name: 'Cable crossover low', slot: 'Chest fly', muscle: 'Chest', kind: 'isolation',
    step: 2.5, repMin: 10, repMax: 15, restSec: 120,
  };
  const lookup = (id: string) => (id === custom.id ? custom : undefined);
  const lk = (id: string) => lookup(id) ?? undefined;
  const cs = (date: string, kg: number, reps: number, o: Partial<SetLog> = {}) => set(date, custom.id, kg, reps, o);

  it('without a lookup a custom exercise counts as Other; with it, as its muscle', () => {
    const sets = [cs('2026-11-09', 20, 12)];
    expect(weeklySets(sets, '2026-11-09').Other).toBe(1);
    const w = weeklySets(sets, '2026-11-09', lk as never);
    expect(w.Chest).toBe(1);
    expect(setsPerWeek(sets, 'Chest', 1, '2026-11-11', lk as never)).toEqual([1]);
    expect(daysSince(sets, 'Chest', '2026-11-12', lk as never)).toBe(3);
  });

  it('workoutSummary lists a PR for a custom exercise', () => {
    const start = Date.parse('2026-11-11T07:00:00+05:30');
    const w = workout('2026-11-11', { startedAt: start, endedAt: start + 600_000 });
    const sets = [
      cs('2026-11-02', 20, 10, { workoutId: 'old', doneAt: start - 9 * 86_400_000 }),
      cs('2026-11-11', 22.5, 10, { workoutId: w.id, doneAt: start + 1000 }),
    ];
    expect(workoutSummary(w, sets, 80).prs).toEqual([]);
    expect(workoutSummary(w, sets, 80, lk as never).prs).toEqual([custom.name]);
  });
});

describe('workoutSummary', () => {
  const start = Date.parse('2026-11-11T07:00:00+05:30');
  const w = workout('2026-11-11', { sessionId: 'L-A', startedAt: start, endedAt: start + 30 * 60_000 });
  const mk = (i: number, o: Partial<SetLog> = {}) =>
    set('2026-11-11', 'leg-extension', 40, 10, { workoutId: w.id, doneAt: start + i * 180_000, ...o });

  it('summarises a 3-set workout', () => {
    const s = workoutSummary(w, [mk(0), mk(1), mk(2)], 80);
    expect(s.sets).toBe(3);
    expect(s.volume).toBe(1200);
    expect(s.avgRestSec).toBe(180);
    expect(s.minutes).toBe(30);
    expect(s.workRatio).toBeCloseTo(120 / 1800, 2);
    // 5 * 80 * 0.5 * 1.1 = 220
    expect(s.kcal).toBe(220);
    expect(s.prs).toEqual([]);
  });
  it('uses doneAt gaps from zero', () => {
    const a = workout('2026-11-11', { startedAt: 0, endedAt: 360_000 });
    const sets = [0, 180_000, 360_000].map((t) => set('2026-11-11', 'leg-extension', 40, 10, { workoutId: a.id, doneAt: t }));
    expect(workoutSummary(a, sets, 80).avgRestSec).toBe(180);
  });
  it('excludes warm-up, deleted and other-workout sets', () => {
    const s = workoutSummary(w, [
      mk(0), mk(1, { warmup: true }), mk(2, { deleted: true }),
      set('2026-11-11', 'leg-extension', 99, 10, { workoutId: 'other' }),
    ], 80);
    expect(s.sets).toBe(1);
    expect(s.volume).toBe(400);
    expect(s.avgRestSec).toBe(0);
  });
  it('applies no leg bonus on non-leg days', () => {
    const a = workout('2026-11-11', { sessionId: 'CB-A', startedAt: start, endedAt: start + 30 * 60_000 });
    const s = workoutSummary(a, [mk(0, { workoutId: a.id })], 80);
    expect(s.kcal).toBe(200);
  });
  it('falls back to last set time when the workout has no end', () => {
    const a = workout('2026-11-11', { startedAt: start });
    const s = workoutSummary(a, [mk(0, { workoutId: a.id }), mk(1, { workoutId: a.id })], 80);
    expect(s.minutes).toBe(3);
  });
  it('lists exercises with a PR against earlier workouts', () => {
    const prior = set('2026-11-04', 'leg-extension', 40, 10, { workoutId: 'old' });
    const s = workoutSummary(w, [prior, mk(0, { kg: 45 }), mk(1, { kg: 45 })], 80);
    expect(s.prs).toEqual(['Leg extension']);
  });
  it('flags no PR without history', () => {
    expect(workoutSummary(w, [mk(0, { kg: 45 })], 80).prs).toEqual([]);
  });
});
