import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { closeDb, put } from '../src/lib/db';
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
    // 12 compound sets x (180 + 45) + 4 isolation sets x (120 + 45) + 5 min = 61 min -> 60.
    expect(container.querySelector('.meta')?.textContent).toBe('16 sets · about 60 min');
    expect(screen.getByText(/Today · session 4 of 4/)).toBeTruthy();
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
    render(App);
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  });
});
