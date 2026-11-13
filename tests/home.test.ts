import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { closeDb, getAll, put } from '../src/lib/db';
import { toasts, clearToast } from '../src/ui/toast.svelte';
import { workout } from '../src/lib/workout.svelte';
import Home from '../src/screens/Home.svelte';
import Sheet from '../src/ui/Sheet.svelte';
import Toast from '../src/ui/Toast.svelte';
import Nav from '../src/ui/Nav.svelte';
import App from '../src/App.svelte';
import type { SetLog, Workout } from '../src/lib/types';

const at = (d: number, h = 8) => new Date(2026, 10, d, h, 0).getTime();
const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;

async function seedHistory() {
  // 9 Nov Chest+Back A, 10 Nov Shoulders+Arms A, 11 Nov Legs A -> next is Chest+Back B.
  const rows: [number, Workout['sessionId'], string][] = [
    [9, 'CB-A', 'smith-flat-press'],
    [10, 'SA-A', 'barbell-curl'],
    [11, 'L-A', 'leg-press'],
  ];
  for (const [d, sessionId, exerciseId] of rows) {
    const w: Workout = { id: `w${d}`, date: day(d), sessionId, startedAt: at(d), endedAt: at(d, 9), swaps: {} };
    await put('workouts', w);
    const s: SetLog = {
      id: `s${d}`, workoutId: w.id, date: w.date, sessionId, exerciseId, setNo: 1, kg: 20, reps: 10,
      warmup: false, feltIt: false, doneAt: at(d, 8), updatedAt: at(d, 8), deleted: false, synced: true,
    };
    await put('sets', s);
  }
}

beforeEach(async () => {
  await closeDb(true);
  location.hash = '';
  workout.current = null;
  workout.sets = [];
  workout.ready = true; // App's restore() has finished
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12, 8, 30));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe('Home', () => {
  it('shows the next session and its exercises', async () => {
    await seedHistory();
    const { container } = render(Home);
    expect(await screen.findByRole('heading', { name: 'Chest + Back B' })).toBeTruthy();
    expect(screen.getByText('Straight-arm cable pulldown')).toBeTruthy();
    expect(screen.getByText('Thursday, 12 Nov')).toBeTruthy();
    expect(screen.getByText('Saved on phone')).toBeTruthy();
    // 12 compound sets x (180 + 80) + 4 isolation sets x (120 + 80) + 5 min = 70.3 min -> 70.
    expect(container.querySelector('.meta')?.textContent).toBe('16 sets · about 70 min');
    expect(await screen.findByText(/Today · session 4 of 6/)).toBeTruthy();
    expect(screen.getByText(/sessions done this week/)).toBeTruthy();
  });

  it('Start workout starts the session and goes to the workout screen', async () => {
    await seedHistory();
    const spy = vi.spyOn(workout, 'startWorkout');
    render(Home);
    await screen.findByRole('heading', { name: 'Chest + Back B' });
    await fireEvent.click(screen.getByRole('button', { name: 'Start workout' }));
    await waitFor(() => expect(location.hash).toBe('#/workout'));
    expect(spy).toHaveBeenCalledWith('CB-B');
  });

  it('offers Resume workout when one is open, without starting a new one', async () => {
    await seedHistory();
    await workout.startWorkout('CB-B', Date.now());
    const spy = vi.spyOn(workout, 'startWorkout');
    render(Home);
    await fireEvent.click(await screen.findByRole('button', { name: 'Resume workout' }));
    expect(spy).not.toHaveBeenCalled();
    expect(location.hash).toBe('#/workout');
    expect(screen.queryByRole('button', { name: 'Swap day' })).toBeNull();
  });

  it('Swap day lets the user choose another session', async () => {
    await seedHistory();
    render(Home);
    await screen.findByRole('heading', { name: 'Chest + Back B' });
    await fireEvent.click(screen.getByRole('button', { name: 'Swap day' }));
    const dialog = screen.getByRole('dialog', { name: 'Swap day' });
    expect(dialog.querySelectorAll('[role="radio"]')).toHaveLength(6);
    await fireEvent.click(screen.getByRole('radio', { name: /Legs A/ }));
    expect(await screen.findByRole('heading', { name: 'Legs A' })).toBeTruthy();
    expect(screen.getByText('Leg press')).toBeTruthy();
  });

  it('Start is disabled until the store has restored', async () => {
    workout.ready = false;
    render(Home);
    const btn = await screen.findByRole('button', { name: 'Start workout' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    workout.ready = true;
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  });

  it('a double tap on Start opens one workout', async () => {
    await seedHistory();
    render(Home);
    await screen.findByRole('heading', { name: 'Chest + Back B' });
    const btn = screen.getByRole('button', { name: 'Start workout' });
    await Promise.all([fireEvent.click(btn), fireEvent.click(btn)]);
    await waitFor(() => expect(location.hash).toBe('#/workout'));
    const open = (await getAll<Workout>('workouts')).filter((w) => w.endedAt === undefined);
    expect(open).toHaveLength(1);
  });

  it('a failed start shows a toast', async () => {
    vi.spyOn(workout, 'startWorkout').mockRejectedValueOnce(new Error('disk full'));
    render(Home);
    await fireEvent.click(await screen.findByRole('button', { name: 'Start workout' }));
    await waitFor(() => expect(toasts.message).toBe('Could not start: disk full'));
    clearToast();
  });

  it('an empty workout opened by mistake can be discarded', async () => {
    await seedHistory();
    await workout.startWorkout('CB-B', Date.now());
    render(Home);
    await fireEvent.click(await screen.findByRole('button', { name: /Discard workout/ }));
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    expect((await getAll<Workout>('workouts')).some((w) => w.sessionId === 'CB-B')).toBe(false);
  });

  it('the date refreshes when the app comes back the next day', async () => {
    render(Home);
    expect(await screen.findByText('Thursday, 12 Nov')).toBeTruthy();
    vi.setSystemTime(new Date(2026, 10, 13, 6, 30));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(await screen.findByText('Friday, 13 Nov')).toBeTruthy();
    expect(screen.getByText('Morning, Vik')).toBeTruthy();
  });

  it('a long break that split one visit counts as one session', async () => {
    await seedHistory();
    // 12 Nov CB-B split in two by a 40-minute break.
    for (const [id, h, m] of [['a', 7, 0], ['b', 7, 45]] as const) {
      await put('workouts', { id: `cb-${id}`, date: day(12), sessionId: 'CB-B', startedAt: at(12, h) + m * 60_000, endedAt: at(12, 9), swaps: {} } satisfies Workout);
      await put('sets', {
        id: `x${id}`, workoutId: `cb-${id}`, date: day(12), sessionId: 'CB-B', exerciseId: 'converging-chest-press', setNo: 1, kg: 40, reps: 10,
        warmup: false, feltIt: false, doneAt: at(12, h) + (m + 1) * 60_000, updatedAt: 0, deleted: false, synced: true,
      } satisfies SetLog);
    }
    render(Home);
    // Chest + Back B was finished today: Home says so (one visit, not two) instead of offering the next session.
    const card = await screen.findByRole('button', { name: /Done · Chest \+ Back B/ });
    expect(card.querySelector('[data-testid="done-sets"]')?.textContent).toBe('2');
    expect(screen.getByText(/sessions done this week/).closest('p')?.textContent).toContain('4 of 6');
  });

  it('offers Continue workout for a workout the idle rule closed earlier today', async () => {
    await seedHistory();
    const w = await workout.startWorkout('CB-B', at(12, 7));
    await workout.completeSet('converging-chest-press', 1, 40, 10, at(12, 7) + 60_000);
    await workout.checkAutoEnd(at(12, 8) + 5 * 60_000); // 8:05 -> closed at 8:01
    expect(workout.active).toBe(false);
    render(Home);
    await fireEvent.click(await screen.findByRole('button', { name: 'Continue workout' }));
    await waitFor(() => expect(location.hash).toBe('#/workout'));
    expect(workout.active).toBe(true);
    expect(workout.current?.id).toBe(w.id);
  });

  it('settings gear opens #/settings', async () => {
    render(Home);
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(location.hash).toBe('#/settings');
  });

  it('renders a sync status passed in', () => {
    render(Home, { props: { syncStatus: 'Synced 8:12 am' } });
    expect(screen.getByText('Synced 8:12 am')).toBeTruthy();
  });
});

describe('Sheet', () => {
  it('closes on Escape and on scrim click, only while open', async () => {
    const onclose = vi.fn();
    const { container, rerender } = render(Sheet, { props: { open: false, onclose, title: 'T' } });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).not.toHaveBeenCalled();
    await rerender({ open: true, onclose, title: 'T' });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(1);
    await fireEvent.click(container.querySelector('.scrim')!);
    expect(onclose).toHaveBeenCalledTimes(2);
  });

  it('is hidden from assistive tech when closed and returns focus to the opener', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { rerender } = render(Sheet, { props: { open: false, onclose: () => {}, title: 'T' } });
    expect(screen.queryByRole('dialog')).toBeNull();
    await rerender({ open: true, onclose: () => {}, title: 'T' });
    expect(screen.getByRole('dialog', { name: 'T' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    await rerender({ open: false, onclose: () => {}, title: 'T' });
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe('Toast', () => {
  it('shows the message then hides after its duration', async () => {
    vi.useRealTimers();
    const onhide = vi.fn();
    const { container } = render(Toast, { props: { message: 'New PR · Leg press', duration: 20, onhide } });
    await waitFor(() => expect(container.querySelector('.toast.show')?.textContent).toBe('New PR · Leg press'));
    await waitFor(() => expect(onhide).toHaveBeenCalled());
    expect(container.querySelector('.toast.show')).toBeNull();
  });
});

describe('Nav and App routes', () => {
  it('marks the current tab and navigates by hash; workout counts as Today', async () => {
    render(Nav, { props: { route: 'workout', workoutActive: true } });
    expect(screen.getByRole('button', { name: 'Today' }).getAttribute('aria-current')).toBe('page');
    await fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(location.hash).toBe('#/week');
    await fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(location.hash).toBe('#/workout');
  });

  it('App renders Home at the root with the nav', async () => {
    await seedHistory(); // an install with data is Vik's: Home, not the first-run setup
    render(App);
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  });
});
