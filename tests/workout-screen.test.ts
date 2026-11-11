import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { closeDb, put } from '../src/lib/db';
import { workout } from '../src/lib/workout.svelte';
import { toasts, clearToast } from '../src/ui/toast.svelte';
import Workout from '../src/screens/Workout.svelte';
import AdjustSheet from '../src/ui/AdjustSheet.svelte';
import { buildCards, dropSet, estimateMinutes, finishAt, fmtElapsed, meter } from '../src/lib/workoutView';
import type { SetLog, Workout as W } from '../src/lib/types';

const NOW = new Date(2026, 10, 12, 8, 30).getTime();
const INCLINE = 'smith-incline-press';

async function seedHistory() {
  const start = new Date(2026, 10, 9, 7, 0).getTime();
  const w: W = { id: 'old', date: '2026-11-09', sessionId: 'CB-B', startedAt: start, endedAt: start + 3_600_000, swaps: {} };
  await put('workouts', w);
  for (let n = 1; n <= 3; n++) {
    const s: SetLog = {
      id: `old-${n}`, workoutId: 'old', date: w.date, sessionId: 'CB-B', exerciseId: INCLINE, setNo: n, kg: 10, reps: 8,
      warmup: false, feltIt: false, doneAt: start + n * 60_000, updatedAt: start, deleted: false, synced: true,
    };
    await put('sets', s);
  }
}

async function open() {
  await seedHistory();
  await workout.startWorkout('CB-B', NOW);
  const r = render(Workout);
  const card = await screen.findByRole('article', { name: 'Smith incline press' });
  return { ...r, card };
}

const incline = () => workout.sets.filter((s) => s.exerciseId === INCLINE);
const rowsOf = (card: HTMLElement) => card.querySelectorAll<HTMLElement>('[data-testid="set-row"]');

beforeEach(async () => {
  await closeDb(true);
  localStorage.clear();
  location.hash = '#/workout';
  workout.current = null;
  workout.sets = [];
  workout.history = [];
  workout.restEndsAt = null;
  workout.customExercises = [];
  clearToast();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('Workout screen', () => {
  it('one-tap ✓ logs the target (10 × 9 after 10 × 8), fills the meter, starts rest and flags the PR', async () => {
    const { card, container } = await open();
    expect(screen.getByRole('heading', { name: 'Chest + Back B' })).toBeTruthy();
    expect(within(card).getByText('10–15 reps · rest 3:00 · steps of 2.5 kg')).toBeTruthy();
    expect(container.querySelectorAll('.seg')).toHaveLength(16);
    expect(screen.getByTestId('meter-label').textContent).toMatch(/0 of 16 sets/);

    await fireEvent.click(within(card).getByRole('button', { name: 'Complete set 1' }));
    await waitFor(() => expect(incline()).toHaveLength(1));
    expect(incline()[0]).toMatchObject({ kg: 10, reps: 9, setNo: 1, warmup: false });
    await waitFor(() => expect(screen.getByTestId('meter-label').textContent).toMatch(/1 of 16 sets/));
    expect(container.querySelectorAll('.seg.on')).toHaveLength(1);
    expect(workout.restEndsAt).toBe(NOW + 180_000);
    expect(toasts.message).toBe('New PR · Smith incline press');
    expect(rowsOf(card)[0].classList.contains('done')).toBe(true);
    expect(rowsOf(card)[0].querySelector('.pr.show')).toBeTruthy();
  });

  it('adjust sheet: + adds one step, Same as last restores last values, Save set logs them', async () => {
    const { card } = await open();
    await fireEvent.click(within(card).getByRole('button', { name: /^kg, set 1/ }));
    const dialog = screen.getByRole('dialog', { name: 'Smith incline press · set 1' });
    expect(within(dialog).getByText('Last 10 × 8 · target 10 × 9')).toBeTruthy();
    const plus = within(dialog).getByRole('button', { name: 'More weight' });
    await fireEvent.pointerDown(plus);
    await fireEvent.pointerUp(plus);
    expect(within(dialog).getByTestId('adjust-kg').textContent).toBe('12.5');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Same as last' }));
    expect(within(dialog).getByTestId('adjust-kg').textContent).toBe('10');
    expect(within(dialog).getByTestId('adjust-reps').textContent).toBe('8');
    await fireEvent.click(within(dialog).getByRole('button', { name: '+1 step' }));
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save set' }));
    await waitFor(() => expect(incline()).toHaveLength(1));
    expect(incline()[0]).toMatchObject({ kg: 12.5, reps: 8 });
  });

  it('tapping a done value edits that set via the sheet', async () => {
    const { card } = await open();
    await fireEvent.click(within(card).getByRole('button', { name: 'Complete set 1' }));
    await waitFor(() => expect(incline()).toHaveLength(1));
    await fireEvent.click(within(card).getByRole('button', { name: /^reps, set 1/ }));
    const dialog = screen.getByRole('dialog', { name: 'Smith incline press · set 1' });
    const more = within(dialog).getByRole('button', { name: 'More reps' });
    await fireEvent.pointerDown(more);
    await fireEvent.pointerUp(more);
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save set' }));
    await waitFor(() => expect(incline()[0].reps).toBe(10));
    expect(incline()).toHaveLength(1);
  });

  it('swiping a value steps it every 22 px after a 10 px threshold, without opening the sheet', async () => {
    const { card } = await open();
    const kg = within(card).getByRole('button', { name: /^kg, set 1/ });
    expect(kg.classList.contains('ghost')).toBe(true);
    await fireEvent.pointerDown(kg, { clientX: 100, pointerId: 1 });
    await fireEvent.pointerMove(kg, { clientX: 108, pointerId: 1 });
    expect(kg.textContent).toMatch(/^\s*10\b/);
    await fireEvent.pointerMove(kg, { clientX: 150, pointerId: 1 }); // 50 px -> 2 steps
    await fireEvent.pointerUp(kg, { clientX: 150, pointerId: 1 });
    await fireEvent.click(kg);
    expect(kg.textContent).toMatch(/^\s*15\b/);
    expect(kg.classList.contains('ghost')).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    const reps = within(card).getByRole('button', { name: /^reps, set 1/ });
    await fireEvent.pointerDown(reps, { clientX: 100, pointerId: 2 });
    await fireEvent.pointerMove(reps, { clientX: 70, pointerId: 2 }); // -30 px -> -1
    await fireEvent.pointerUp(reps, { pointerId: 2 });
    expect(reps.textContent).toMatch(/^\s*8\b/);
    await fireEvent.click(within(card).getByRole('button', { name: 'Complete set 1' }));
    await waitFor(() => expect(incline()[0]).toMatchObject({ kg: 15, reps: 8 }));
  });

  it('long-press on the set number marks warm-up; warm-ups are left out of the meter', async () => {
    const { card } = await open();
    await fireEvent.click(within(card).getByRole('button', { name: 'Complete set 1' }));
    await waitFor(() => expect(screen.getByTestId('meter-label').textContent).toMatch(/1 of 16/));
    vi.useRealTimers();
    const sn = within(card).getByRole('button', { name: /^Set 1, hold/ });
    await fireEvent.pointerDown(sn, { clientX: 5 });
    await new Promise((r) => setTimeout(r, 550));
    await fireEvent.pointerUp(sn);
    await waitFor(() => expect(incline()[0].warmup).toBe(true));
    await waitFor(() => expect(screen.getByTestId('meter-label').textContent).toMatch(/0 of 16/));
    expect(within(card).getByRole('button', { name: /^Warm-up, hold/ }).textContent).toBe('W');
    // The planned set 1 is open again.
    expect(within(card).getByRole('button', { name: 'Complete set 1' })).toBeTruthy();
  });

  it('a set marked warm-up before ✓ is logged as a warm-up', async () => {
    const { card } = await open();
    const sn = within(card).getByRole('button', { name: /^Set 1, hold/ });
    sn.focus();
    await fireEvent.click(sn, { detail: 0 }); // keyboard toggle
    expect(sn.textContent).toBe('W');
    await fireEvent.click(within(card).getByRole('button', { name: 'Complete warm-up set' }));
    await waitFor(() => expect(incline()[0]?.warmup).toBe(true));
    expect(screen.getByTestId('meter-label').textContent).toMatch(/0 of 16/);
    expect(toasts.message).toBe('');
  });

  it('swipe left on a done row deletes it; Undo brings it back', async () => {
    const { card } = await open();
    await fireEvent.click(within(card).getByRole('button', { name: 'Complete set 1' }));
    await waitFor(() => expect(incline()).toHaveLength(1));
    const row = rowsOf(card)[0];
    await fireEvent.pointerDown(row, { clientX: 300, clientY: 10, pointerId: 3 });
    await fireEvent.pointerMove(row, { clientX: 280, clientY: 10, pointerId: 3 });
    await fireEvent.pointerMove(row, { clientX: 190, clientY: 12, pointerId: 3 });
    await fireEvent.pointerUp(row, { clientX: 190, pointerId: 3 });
    await waitFor(() => expect(incline()).toHaveLength(0));
    const status = await screen.findByText('Set 1 deleted');
    await fireEvent.click(within(status.parentElement!).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(incline()).toHaveLength(1));
    expect(incline()[0]).toMatchObject({ kg: 10, reps: 9 });
  });

  it('Swap → choosing DB incline press renames the card', async () => {
    vi.useRealTimers();
    const { card } = await open();
    await fireEvent.click(within(card).getByRole('button', { name: 'Swap Smith incline press' }));
    const dialog = screen.getByRole('dialog', { name: 'Swap exercise' });
    expect(within(dialog).getByRole('radio', { name: /Smith incline press/ }).getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(within(dialog).getByRole('radio', { name: /DB incline press/ }));
    expect(await screen.findByRole('article', { name: 'DB incline press' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Smith incline press' })).toBeNull();
    expect(workout.current?.swaps[INCLINE]).toBe('db-incline-press');
  });

  it('+ Add exercise in the swap sheet adds a new option that can be picked straight away', async () => {
    vi.useRealTimers();
    const { card } = await open();
    await fireEvent.click(within(card).getByRole('button', { name: 'Swap Smith incline press' }));
    const dialog = screen.getByRole('dialog', { name: 'Swap exercise' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add exercise', expanded: false }));
    const name = within(dialog).getByLabelText('Name');
    await fireEvent.input(name, { target: { value: 'Cable incline press' } });
    expect((within(dialog).getByLabelText('Category') as HTMLSelectElement).value).toBe('Incline press');
    await fireEvent.submit(name.closest('form')!);
    const option = await within(dialog).findByRole('radio', { name: /Cable incline press/ });
    await fireEvent.click(option);
    expect(await screen.findByRole('article', { name: 'Cable incline press' })).toBeTruthy();
  });

  it('Finish ends the workout and goes to the summary', async () => {
    await open();
    await fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }));
    await waitFor(() => expect(location.hash).toBe('#/summary'));
    expect(workout.current?.endedAt).toBe(NOW);
  });
});

describe('AdjustSheet hold-to-repeat', () => {
  it('steps once, waits 450 ms, then repeats every 90 ms until release', async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    render(AdjustSheet, { props: { open: true, title: 'T', kg: 10, reps: 8, step: 2.5, onsave: () => {}, onclose: () => {} } });
    const plus = screen.getByRole('button', { name: 'More weight' });
    const kg = () => screen.getByTestId('adjust-kg').textContent;
    await fireEvent.pointerDown(plus);
    expect(kg()).toBe('12.5');
    vi.advanceTimersByTime(449);
    flushSync();
    expect(kg()).toBe('12.5');
    vi.advanceTimersByTime(1 + 90);
    flushSync();
    expect(kg()).toBe('15');
    vi.advanceTimersByTime(180);
    flushSync();
    expect(kg()).toBe('20');
    await fireEvent.pointerUp(plus);
    vi.advanceTimersByTime(1000);
    flushSync();
    expect(kg()).toBe('20');
    await fireEvent.click(screen.getByRole('button', { name: 'Drop set' }));
    expect(kg()).toBe('15'); // 75 % of 20, rounded to 2.5
  });
});

describe('workout view maths', () => {
  it('estimate, finish time, drop set and clock', () => {
    // Chest + Back B: 12 compound sets (180 s) + 4 isolation sets (120 s).
    expect(estimateMinutes([...Array(12).fill(180), ...Array(4).fill(120)])).toBe(60);
    expect(finishAt(0, 30_000, [180, 120])).toBe(30_000 + (2 * 45 + 180) * 1000);
    expect(dropSet(32.5, 2.5)).toBe(25);
    expect(fmtElapsed(65_000)).toBe('01:05');
    expect(fmtElapsed(3_725_000)).toBe('1:02:05');
    expect(meter(buildCards([], []))).toEqual({ done: 0, total: 0 });
  });
});
