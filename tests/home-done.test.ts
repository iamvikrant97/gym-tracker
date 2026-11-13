import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { closeDb, put, saveSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import { workout } from '../src/lib/workout.svelte';
import { setActivePlan } from '../src/lib/activePlan.svelte';
import { fullBodyPlan } from '../src/lib/seed';
import Home from '../src/screens/Home.svelte';
import type { SessionId, SetLog, Workout } from '../src/lib/types';

const at = (d: number, h = 8) => new Date(2026, 10, d, h, 0).getTime();
const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;

const mkSet = (w: Workout, id: string, exerciseId: string, setNo: number, kg: number, reps: number): SetLog => ({
  id, workoutId: w.id, date: w.date, sessionId: w.sessionId, exerciseId, setNo, kg, reps,
  warmup: false, feltIt: false, doneAt: w.startedAt + setNo * 60_000, updatedAt: 1, deleted: false, synced: true,
});

/** A finished workout with sets (one exercise, 3 sets of 20 kg x 10 unless told otherwise). */
async function finished(d: number, sessionId: SessionId, exerciseId: string, o: { id?: string; sets?: number; endH?: number } = {}) {
  const w: Workout = { id: o.id ?? `w${d}`, date: day(d), sessionId, startedAt: at(d), endedAt: at(d, o.endH ?? 9), swaps: {} };
  await put('workouts', w);
  for (let i = 1; i <= (o.sets ?? 3); i++) await put('sets', mkSet(w, `${w.id}-s${i}`, exerciseId, i, 20, 10));
  return w;
}

/** Mon CB-A, Tue L-A, Wed SA-A, Thu CB-B; Friday 13 Nov Shoulders + Arms B is done -> Legs B is next. */
async function vikWeekThroughFriday() {
  await finished(9, 'CB-A', 'smith-flat-press');
  await finished(10, 'L-A', 'leg-press');
  await finished(11, 'SA-A', 'barbell-curl');
  await finished(12, 'CB-B', 'converging-chest-press');
  await finished(13, 'SA-B', 'hammer-curl', { sets: 4 });
}

function clock(d: number, h = 11) {
  vi.setSystemTime(new Date(2026, 10, d, h, 0));
}

beforeEach(async () => {
  await closeDb(true);
  location.hash = '';
  workout.current = null;
  workout.sets = [];
  workout.settings = null;
  workout.ready = true;
  setActivePlan(null);
  vi.useFakeTimers({ toFake: ['Date'] });
  clock(13);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setActivePlan(null);
  cleanup();
});

describe('Home after finishing today', () => {
  it('shows Done with the session, its figures, and the next workout; not the next session as today', async () => {
    await vikWeekThroughFriday();
    render(Home);
    const card = await screen.findByRole('button', { name: /Done · Shoulders \+ Arms B/ });
    expect(within(card).getByTestId('done-sets').textContent).toBe('4');
    expect(within(card).getByTestId('done-volume').textContent).toBe('800'); // 4 x 20 x 10
    expect(within(card).getByTestId('done-minutes').textContent).toBe('60');
    expect(screen.getByTestId('next-workout').textContent).toContain('Saturday · Legs B');
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Legs B' })).toBeNull();
    expect(screen.queryByText(/Today · session/)).toBeNull();
  });

  it('tapping the done card opens the same day-summary sheet as the calendar', async () => {
    await vikWeekThroughFriday();
    render(Home);
    await fireEvent.click(await screen.findByRole('button', { name: /Done · Shoulders \+ Arms B/ }));
    const dlg = await screen.findByRole('dialog', { name: '13 Nov' });
    expect(dlg.getAttribute('aria-hidden')).toBe('false');
    expect(dlg.textContent).toContain('Shoulders + Arms B');
    expect(dlg.textContent).toContain('Hammer curl');
    expect(dlg.textContent).toContain('20 × 10');
    expect(within(dlg).getByTestId('day-sets').textContent).toBe('4');
  });

  it('Train another session today starts the normal auto-selected next session', async () => {
    await vikWeekThroughFriday();
    const spy = vi.spyOn(workout, 'startWorkout');
    render(Home);
    await fireEvent.click(await screen.findByRole('button', { name: 'Train another session today' }));
    await waitFor(() => expect(location.hash).toBe('#/workout'));
    expect(spy).toHaveBeenCalledWith('L-B');
  });

  it('after a second session the same day the card is about the latest and counts both', async () => {
    await vikWeekThroughFriday();
    const second: Workout = { id: 'second', date: day(13), sessionId: 'L-B', startedAt: at(13, 10), endedAt: at(13, 12), swaps: {} };
    await put('workouts', second);
    for (const n of [1, 2]) await put('sets', mkSet(second, `second-s${n}`, 'leg-press', n, 20, 10));
    clock(13, 13);
    render(Home);
    const card = await screen.findByRole('button', { name: /Done · Legs B/ });
    expect(within(card).getByTestId('done-sets').textContent).toBe('2');
    expect(card.textContent).toContain('2 workouts today');
    await fireEvent.click(card);
    const dlg = await screen.findByRole('dialog', { name: '13 Nov' });
    expect(within(dlg).getAllByTestId('day-workout')).toHaveLength(2);
  });

  it('a different session can still be chosen for the second workout', async () => {
    await vikWeekThroughFriday();
    const spy = vi.spyOn(workout, 'startWorkout');
    render(Home);
    await fireEvent.click(await screen.findByRole('button', { name: 'Choose a different session' }));
    await fireEvent.click(screen.getByRole('radio', { name: /Chest \+ Back A/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Train another session today' }));
    await waitFor(() => expect(location.hash).toBe('#/workout'));
    expect(spy).toHaveBeenCalledWith('CB-A');
  });

  it('a workout only started (0 working sets) keeps showing today\'s session', async () => {
    await finished(12, 'CB-B', 'converging-chest-press');
    await put('workouts', { id: 'empty', date: day(13), sessionId: 'SA-B', startedAt: at(13), endedAt: at(13, 9), swaps: {} } satisfies Workout);
    render(Home);
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Done ·/ })).toBeNull();
    expect(screen.queryByTestId('next-workout')).toBeNull();
  });

  it('warm-ups alone are not a done workout', async () => {
    const w = await finished(13, 'SA-B', 'hammer-curl', { sets: 0 });
    await put('sets', { ...mkSet(w, 'warm', 'hammer-curl', 0, 5, 10), warmup: true });
    render(Home);
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Done ·/ })).toBeNull();
  });

  it('hides the time for an imported workout, as the day summary does', async () => {
    await finished(13, 'SA-B', 'hammer-curl', { id: 'import-2026-11-13-SA-B' });
    render(Home);
    const card = await screen.findByRole('button', { name: /Done · Shoulders \+ Arms B/ });
    expect(within(card).queryByTestId('done-minutes')).toBeNull();
    expect(within(card).getByTestId('done-sets').textContent).toBe('3');
  });

  it('a running workout still shows Resume, not Done', async () => {
    await vikWeekThroughFriday();
    await workout.startWorkout('L-B', at(13, 10));
    render(Home);
    expect(await screen.findByRole('button', { name: 'Resume workout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Done ·/ })).toBeNull();
  });

  it('works on a day outside the plan weekdays; next is the next plan weekday (wraps into next week)', async () => {
    const plan = fullBodyPlan([1, 3, 5]);
    await saveSettings({ ...DEFAULT_SETTINGS, plan, weeklyTarget: 3 });
    workout.settings = { ...DEFAULT_SETTINGS, plan, weeklyTarget: 3 };
    setActivePlan(plan);
    await finished(9, 'fb-a', 'leg-press');
    await finished(11, 'fb-b', 'hip-thrust');
    await finished(15, 'fb-a', 'leg-press'); // Sunday: not a plan weekday
    clock(15);
    render(Home);
    await screen.findByRole('button', { name: /Done · Full body A/ });
    expect(screen.getByTestId('next-workout').textContent).toContain('Monday · Full body B');
  });

  it('on the last training day of the week the next workout is on the first training day of next week', async () => {
    const plan = fullBodyPlan([1, 3, 5]);
    await saveSettings({ ...DEFAULT_SETTINGS, plan, weeklyTarget: 3 });
    workout.settings = { ...DEFAULT_SETTINGS, plan, weeklyTarget: 3 };
    setActivePlan(plan);
    await finished(11, 'fb-b', 'hip-thrust');
    await finished(13, 'fb-a', 'leg-press');
    render(Home);
    await screen.findByRole('button', { name: /Done · Full body A/ });
    expect(screen.getByTestId('next-workout').textContent).toContain('Monday · Full body B');
  });

  it('the day after, Home is back to a normal Today card', async () => {
    await vikWeekThroughFriday();
    clock(14);
    render(Home);
    expect(await screen.findByRole('heading', { name: 'Legs B' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Done ·/ })).toBeNull();
  });
});
