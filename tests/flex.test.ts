import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { closeDb, put } from '../src/lib/db';
import { workout } from '../src/lib/workout.svelte';
import { setActivePlan } from '../src/lib/activePlan.svelte';
import { UPPERLOWER_SESSIONS, planFromTemplate, templateOf } from '../src/lib/seed';
import { buildCustom, customName, isRestDay, recommend } from '../src/lib/flex';
import Home from '../src/screens/Home.svelte';
import type { SetLog, Workout } from '../src/lib/types';

const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;
const at = (d: number, h = 8) => new Date(2026, 10, d, h, 0).getTime();

async function finished(d: number, sessionId: string, exerciseId: string) {
  const w: Workout = { id: `w${d}`, date: day(d), sessionId, startedAt: at(d), endedAt: at(d, 9), swaps: {} };
  await put('workouts', w);
  const s: SetLog = { id: `${w.id}-1`, workoutId: w.id, date: w.date, sessionId, exerciseId, setNo: 1, kg: 20, reps: 10, warmup: false, feltIt: false, doneAt: w.startedAt + 60_000, updatedAt: 1, deleted: false, synced: true };
  await put('sets', s);
  return { w, s };
}

const plan = planFromTemplate('upperlower', [1, 2, 4, 5]);

describe('flex helpers', () => {
  it('recommends the session whose muscles rested longest (Upper done -> Lower)', () => {
    const upper = plan.sessions.find((t) => t.name.startsWith('Upper'))!;
    const sets: SetLog[] = upper.items.map((i, n) => ({
      id: `s${n}`, workoutId: 'w1', date: day(17), sessionId: upper.id, exerciseId: i.exerciseId, setNo: 1, kg: 10, reps: 10,
      warmup: false, feltIt: false, doneAt: 1, updatedAt: 1, deleted: false, synced: true,
    }));
    const w: Workout = { id: 'w1', date: day(17), sessionId: upper.id, startedAt: 1, endedAt: 2, swaps: {} };
    const r = recommend(plan, [w], sets, day(19));
    expect(plan.sessions.find((t) => t.id === r.sessionId)!.name).toMatch(/Lower/);
    expect(r.reason).toMatch(/last trained|not trained/);
  });

  it('with no history it agrees with the plan', () => {
    expect(recommend(plan, [], [], day(19)).sessionId).toBe(plan.sessions[0].id);
  });

  it('buildCustom gives two exercises per chosen muscle and names the workout', () => {
    const c = buildCustom(['Chest', 'Quads', 'Shoulders'], plan);
    expect(c.name).toBe('Chest + Quads + Shoulders');
    expect(c.items).toHaveLength(6);
    expect(new Set(c.items.map((i) => i.exerciseId)).size).toBe(6);
    expect(customName(['Back'])).toBe('Back');
  });

  it('templateOf prefers the workout\'s own custom exercises', () => {
    const c = buildCustom(['Back'], plan);
    const t = templateOf({ sessionId: 'CUSTOM', custom: c });
    expect(t?.name).toBe('Back');
    expect(t?.items).toEqual(c.items);
    expect(templateOf({ sessionId: 'CUSTOM' })).toBeUndefined();
  });

  it('isRestDay', () => {
    expect(isRestDay(['2026-11-19'], '2026-11-19')).toBe(true);
    expect(isRestDay(undefined, '2026-11-19')).toBe(false);
  });
});

describe('Home: rest day and choosing', () => {
  beforeEach(async () => {
    await closeDb(true);
    location.hash = '';
    workout.current = null;
    workout.sets = [];
    workout.settings = null;
    workout.ready = true;
    setActivePlan(null);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 19, 11, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    setActivePlan(null);
    cleanup();
  });

  it('Rest day shows the rest card; Undo brings the session back; no workout is created', async () => {
    await finished(16, 'CB-A', 'smith-flat-press');
    render(Home);
    await fireEvent.click(await screen.findByTestId('rest-day'));
    expect(await screen.findByTestId('rest-card')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Rest day' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Undo rest day' }));
    await waitFor(() => expect(screen.queryByTestId('rest-card')).toBeNull());
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeTruthy();
  });

  it('the chooser offers plan, recommended and custom; a custom workout starts and logs as its own session', async () => {
    await finished(16, 'CB-A', 'smith-flat-press');
    render(Home);
    await fireEvent.click(await screen.findByRole('button', { name: 'Swap day' }));
    expect(screen.getByTestId('pick-plan')).toBeTruthy();
    expect(screen.getByTestId('pick-rec')).toBeTruthy();
    await fireEvent.click(screen.getByTestId('pick-custom'));
    await fireEvent.click(screen.getByRole('button', { name: 'Chest' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Quads' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start this workout' }));
    await waitFor(() => expect(location.hash).toBe('#/workout'));
    expect(workout.current?.sessionId).toBe('CUSTOM');
    expect(workout.current?.custom?.name).toBe('Chest + Quads');
    expect(workout.plannedSets().length).toBe(12);
  });
});

describe('custom workouts do not move the plan', () => {
  it('Vik\'s rotation ignores a CUSTOM workout', async () => {
    const { nextInPlan } = await import('../src/lib/selection');
    const { VIK_PLAN } = await import('../src/lib/seed');
    const base: Workout = { id: 'a', date: day(16), sessionId: 'CB-A', startedAt: 1, endedAt: 2, swaps: {} };
    const custom: Workout = { id: 'b', date: day(17), sessionId: 'CUSTOM', startedAt: 3, endedAt: 4, swaps: {}, custom: { name: 'Back', items: [] } };
    expect(nextInPlan(VIK_PLAN, [base, custom])).toBe(nextInPlan(VIK_PLAN, [base]));
  });
});

describe('weeks start again from the top of the plan', () => {
  it('nextInPlan with today ignores earlier weeks', async () => {
    const { nextInPlan } = await import('../src/lib/selection');
    const { VIK_PLAN } = await import('../src/lib/seed');
    const old: Workout = { id: 'a', date: '2026-11-13', sessionId: 'SA-B', startedAt: 1, endedAt: 2, swaps: {} };
    expect(nextInPlan(VIK_PLAN, [old], '2026-11-16')).toBe(VIK_PLAN.sessions[0].id);
  });
});

describe('Home: new-week card', () => {
  beforeEach(async () => {
    await closeDb(true);
    location.hash = '';
    workout.current = null; workout.sets = []; workout.settings = null; workout.ready = true;
    setActivePlan(null);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 16, 11, 0)); // Monday
  });
  afterEach(() => { vi.useRealTimers(); setActivePlan(null); cleanup(); });

  it('asks on the first open of a week, starts the plan from the top, and stays gone once answered', async () => {
    await finished(13, 'SA-B', 'hammer-curl');
    render(Home);
    expect(await screen.findByTestId('week-prompt')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Chest + Back A' })).toBeTruthy();
    await fireEvent.click(screen.getByTestId('week-plan'));
    await waitFor(() => expect(screen.queryByTestId('week-prompt')).toBeNull());
  });
});
