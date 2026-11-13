import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { closeDb, loadSettings, put } from '../src/lib/db';
import { workout } from '../src/lib/workout.svelte';
import { toasts, clearToast } from '../src/ui/toast.svelte';
import Workout from '../src/screens/Workout.svelte';
import type { SetLog, Workout as W } from '../src/lib/types';

const NOW = new Date(2026, 10, 13, 8, 30).getTime();

async function seedHistory() {
  const start = new Date(2026, 10, 6, 7, 0).getTime();
  const w: W = { id: 'old', date: '2026-11-06', sessionId: 'SA-B', startedAt: start, endedAt: start + 3_600_000, swaps: {} };
  await put('workouts', w);
  for (let n = 1; n <= 3; n++) {
    await put('sets', {
      id: `old-${n}`, workoutId: 'old', date: w.date, sessionId: 'SA-B', exerciseId: 'hammer-curl', setNo: n, kg: 12, reps: 10,
      warmup: false, feltIt: false, doneAt: start + n * 60_000, updatedAt: 1, deleted: false, synced: true,
    } satisfies SetLog);
  }
}

async function open() {
  await seedHistory();
  await workout.startWorkout('SA-A', NOW);
  const r = render(Workout);
  await screen.findByRole('article', { name: 'Barbell curl' });
  return r;
}
const addButton = () => screen.getByRole('button', { name: 'Add exercise' });
async function openSheet() {
  await fireEvent.click(addButton());
  return screen.findByRole('dialog', { name: 'Add exercise' });
}
const pickOption = async (dlg: HTMLElement, name: RegExp) => fireEvent.click(within(dlg).getByRole('button', { name }));

beforeEach(async () => {
  await closeDb(true);
  localStorage.clear();
  location.hash = '#/workout';
  workout.current = null;
  workout.sets = [];
  workout.history = [];
  workout.restEndsAt = null;
  workout.customExercises = [];
  workout.settings = null;
  clearToast();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe('Add exercise on the Workout screen', () => {
  it('the button sits under the cards, above Finish workout', async () => {
    await open();
    const add = addButton();
    const finish = screen.getByRole('button', { name: 'Finish workout' });
    expect(add.compareDocumentPosition(finish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const lastCard = screen.getAllByRole('article').at(-1)!;
    expect(lastCard.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lists the library grouped by muscle with the session\'s muscles first, and searches', async () => {
    await open();
    const dlg = await openSheet();
    const heads = within(dlg).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(heads.slice(0, 3)).toEqual(['Shoulders', 'Biceps', 'Triceps']);
    expect(heads).toContain('Chest');
    expect(heads.indexOf('Chest')).toBeGreaterThan(2);
    await fireEvent.input(within(dlg).getByRole('searchbox', { name: 'Search exercises' }), { target: { value: 'hammer' } });
    expect(within(dlg).getByRole('button', { name: /Hammer curl/ })).toBeTruthy();
    expect(within(dlg).queryByRole('button', { name: /Leg press/ })).toBeNull();
  });

  it('picking Hammer curl adds a card with its own sets and keeps Barbell curl', async () => {
    await open();
    const dlg = await openSheet();
    await pickOption(dlg, /Hammer curl/);
    const extra = await screen.findByRole('article', { name: 'Hammer curl' });
    expect(extra.querySelectorAll('[data-testid="set-row"]')).toHaveLength(3);
    expect(screen.getByRole('article', { name: 'Barbell curl' })).toBeTruthy();
    expect(within(extra).queryByRole('button', { name: /^Swap/ })).toBeNull();
    // last time + target come from history, so one tap logs
    await fireEvent.click(within(extra).getByRole('button', { name: 'Complete set 1' }));
    await waitFor(() => expect(workout.sets.filter((s) => s.exerciseId === 'hammer-curl')).toHaveLength(1));
    expect(workout.sets.find((s) => s.exerciseId === 'hammer-curl')).toMatchObject({ kg: 12, reps: 11 });
    expect((await loadSettings()).templateExtras).toBeUndefined();
    await waitFor(() => expect(screen.getByTestId('meter-label').textContent).toMatch(/1 of 22 sets/)); // 19 planned + 3
  });

  it('keep in this session from now on is off by default and, when on, changes the plan session', async () => {
    await open();
    let dlg = await openSheet();
    const keep = within(dlg).getByRole('checkbox', { name: 'Keep in this session from now on' }) as HTMLInputElement;
    expect(keep.checked).toBe(false);
    await fireEvent.click(keep);
    await pickOption(dlg, /Hammer curl/);
    await screen.findByRole('article', { name: 'Hammer curl' });
    expect((await loadSettings()).templateExtras?.['SA-A']).toEqual([{ exerciseId: 'hammer-curl', sets: 3 }]);
    dlg = await openSheet();
    expect((within(dlg).getByRole('checkbox', { name: 'Keep in this session from now on' }) as HTMLInputElement).checked).toBe(false);
  });

  it('an exercise already in the session is not added again: it says so and scrolls to it', async () => {
    await open();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const dlg = await openSheet();
    const opt = within(dlg).getByRole('button', { name: /Barbell curl/ });
    expect(opt.textContent).toContain('Already in this workout');
    await fireEvent.click(opt);
    expect(screen.getAllByRole('article', { name: 'Barbell curl' })).toHaveLength(1);
    expect(scroll).toHaveBeenCalled();
    expect((scroll.mock.contexts[0] as HTMLElement).getAttribute('aria-label')).toBe('Barbell curl');
    expect(workout.current?.extras ?? []).toEqual([]);
  });

  it('an extra added earlier shows as already there', async () => {
    await open();
    let dlg = await openSheet();
    await pickOption(dlg, /Hammer curl/);
    await screen.findByRole('article', { name: 'Hammer curl' });
    dlg = await openSheet();
    expect(within(dlg).getByRole('button', { name: /Hammer curl/ }).textContent).toContain('Already in this workout');
  });

  it('Add a new exercise makes one with the form and adds it as an extra', async () => {
    await open();
    const dlg = await openSheet();
    await fireEvent.click(within(dlg).getByRole('button', { name: 'Add a new exercise' }));
    await fireEvent.input(within(dlg).getByLabelText('Name'), { target: { value: 'Zottman curl' } });
    await fireEvent.click(within(dlg).getByRole('button', { name: 'Add exercise' }));
    const extra = await screen.findByRole('article', { name: 'Zottman curl' });
    expect(extra.querySelectorAll('[data-testid="set-row"]')).toHaveLength(3);
    expect(workout.current?.extras).toHaveLength(1);
    expect(toasts.message ?? '').not.toMatch(/could not/i);
  });

  it('is not offered once the workout is finished', async () => {
    await open();
    await workout.finish(NOW + 60_000);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add exercise' })).toBeNull());
  });
});
