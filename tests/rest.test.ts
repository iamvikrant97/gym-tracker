import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { closeDb } from '../src/lib/db';
import { WorkoutStore, workout } from '../src/lib/workout.svelte';
import { watchWorkout } from '../src/lib/session.svelte';
import { buzz, keepAwake } from '../src/lib/device';
import RestDock from '../src/ui/RestDock.svelte';
import Summary from '../src/screens/Summary.svelte';
import type { SetLog, Workout } from '../src/lib/types';

const T0 = new Date(2026, 10, 12, 7, 0).getTime();
const nav = navigator as Navigator & { vibrate?: unknown; wakeLock?: unknown };

let vibrate: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  await closeDb(true);
  vibrate = vi.fn(() => true);
  Object.defineProperty(nav, 'vibrate', { value: vibrate, configurable: true, writable: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

async function dockAfter(exerciseId: string) {
  vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  vi.setSystemTime(T0);
  const store = new WorkoutStore();
  await store.startWorkout('CB-B', T0);
  await store.completeSet(exerciseId, 1, 40, 10, T0);
  render(RestDock, { props: { store } });
  flushSync();
  return { store, dock: screen.getByTestId('rest-dock'), time: () => screen.getByTestId('rest-time').textContent };
}

const advance = (ms: number) => {
  vi.advanceTimersByTime(ms);
  flushSync();
};

describe('RestDock', () => {
  it('shows 3:00 after a compound set and says what is next', async () => {
    const { dock, time } = await dockAfter('converging-chest-press');
    expect(dock.classList.contains('open')).toBe(true);
    expect(time()).toBe('3:00');
    expect(dock.textContent).toContain('Next: Converging chest press, set 2');
    advance(61_500);
    expect(time()).toBe('1:59');
  });

  it('shows 2:00 after an isolation set', async () => {
    const { time } = await dockAfter('pec-fly-machine');
    expect(time()).toBe('2:00');
  });

  it('at zero buzzes once, turns amber and counts up', async () => {
    const { dock, time } = await dockAfter('converging-chest-press');
    advance(185_500);
    expect(time()).toBe('+0:05');
    expect(dock.classList.contains('over')).toBe(true);
    expect(dock.textContent).toContain('Rest over · go when ready');
    advance(30_000);
    expect(time()).toBe('+0:35');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([20, 60, 20]);
  });

  it('+15 adds time; Skip hides the dock until the next set', async () => {
    const { store, dock, time } = await dockAfter('converging-chest-press');
    await fireEvent.click(screen.getByRole('button', { name: 'Add 15 seconds' }));
    await waitFor(() => {
      flushSync();
      expect(time()).toBe('3:15');
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => {
      flushSync();
      expect(dock.classList.contains('open')).toBe(false);
    });
    advance(1000);
    await store.completeSet('converging-chest-press', 2, 40, 10, Date.now());
    flushSync();
    expect(dock.classList.contains('open')).toBe(true);
    expect(time()).toBe('3:00');
  });
});

describe('Summary', () => {
  const start = Date.parse('2026-11-11T07:00:00+05:30');
  const w: Workout = { id: 'w1', date: '2026-11-11', sessionId: 'L-A', startedAt: start, endedAt: start + 30 * 60_000, swaps: {} };
  const sets: SetLog[] = [0, 1, 2].map((i) => ({
    id: `s${i}`, workoutId: 'w1', date: w.date, sessionId: 'L-A', exerciseId: 'leg-extension', setNo: i + 1, kg: 40, reps: 10,
    warmup: false, feltIt: false, doneAt: start + i * 180_000, updatedAt: 0, deleted: false, synced: true,
  }));
  beforeEach(() => {
    workout.current = w;
    workout.sets = sets;
    workout.history = [];
    workout.settings = null;
  });

  it('renders the stats fixture: 30 min, 3 sets, 1,200 kg, 3:00 rest, 7 % work, 220 kcal', () => {
    render(Summary, { props: { bodyKg: 80 } });
    expect(screen.getByRole('heading', { name: 'Workout done' })).toBeTruthy();
    expect(screen.getByTestId('sum-minutes').textContent).toBe('30min');
    expect(screen.getByTestId('sum-sets').textContent).toBe('3');
    expect(screen.getByTestId('sum-volume').textContent).toBe('1,200kg');
    expect(screen.getByTestId('sum-rest').textContent).toBe('3:00');
    expect(screen.getByTestId('sum-ratio').textContent).toBe('7% · 93%');
    expect(screen.getByTestId('sum-kcal').textContent).toBe('≈ 220 kcal');
    expect(screen.getByText("Don't add this to MyFitnessPal — your 2,650 kcal target already includes training.")).toBeTruthy();
    expect(screen.getByText('None this time')).toBeTruthy();
  });

  it('defaults to 65 kg body weight', () => {
    render(Summary);
    // 5 MET * 65 kg * 0.5 h * 1.1 (leg day) = 178.75 -> 180
    expect(screen.getByTestId('sum-kcal').textContent).toBe('≈ 180 kcal');
  });
});

describe('device and session helpers', () => {
  it('buzz is feature-detected and never throws', () => {
    buzz(10);
    expect(vibrate).toHaveBeenCalledWith(10);
    Object.defineProperty(nav, 'vibrate', { value: undefined, configurable: true, writable: true });
    expect(() => buzz([1, 2])).not.toThrow();
  });

  it('watchWorkout keeps the screen awake while active, checks auto-end every 60 s and on visibility, asks persist once', async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ released: false, release, addEventListener: () => {} }));
    Object.defineProperty(nav, 'wakeLock', { value: { request }, configurable: true });
    const persist = vi.fn(async () => true);
    Object.defineProperty(nav, 'storage', { value: { persist }, configurable: true });

    const store = new WorkoutStore();
    await store.startWorkout('CB-B', Date.now());
    const check = vi.spyOn(store, 'checkAutoEnd').mockResolvedValue(false);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const stop = watchWorkout(store);
    flushSync();
    await Promise.resolve();
    expect(request).toHaveBeenCalledWith('screen');
    expect(persist).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(check).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(check).toHaveBeenCalledTimes(2);

    stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(release).toHaveBeenCalled();
    vi.advanceTimersByTime(120_000);
    expect(check).toHaveBeenCalledTimes(2);
    watchWorkout(store)();
    expect(persist).toHaveBeenCalledTimes(1);
    await keepAwake(false);
  });
});
