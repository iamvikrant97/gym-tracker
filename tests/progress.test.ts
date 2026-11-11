import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { closeDb, put } from '../src/lib/db';
import { workout } from '../src/lib/workout.svelte';
import Progress from '../src/screens/Progress.svelte';
import type { SetLog } from '../src/lib/types';

const day = (m: number, d: number) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
let n = 0;
async function log(date: string, exerciseId: string, kg: number, reps: number, setNo = 1, extra: Partial<SetLog> = {}) {
  const t = Date.parse(`${date}T08:00:00`);
  const s: SetLog = {
    id: `s${++n}`, workoutId: `w-${date}`, date, sessionId: 'CB-A', exerciseId, setNo, kg, reps,
    warmup: false, feltIt: false, doneAt: t + setNo, updatedAt: t, deleted: false, synced: true, ...extra,
  };
  await put('sets', s);
}

beforeEach(async () => {
  await closeDb(true);
  n = 0;
  workout.current = null;
  workout.sets = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12, 8, 30));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('Progress', () => {
  it('shows "Not enough data yet" for Hamstrings with only 2 sessions', async () => {
    await log(day(10, 8), 'seated-leg-curl', 30, 10);
    await log(day(11, 9), 'seated-leg-curl', 35, 10);
    render(Progress);
    const row = await screen.findByRole('button', { name: 'Hamstrings' });
    await waitFor(() => expect(row.textContent).toContain('Not enough data yet'));
  });

  it('shows the strength change for a 3-session muscle, excluding warm-up and deleted sets', async () => {
    await log(day(10, 8), 'smith-flat-press', 40, 10);
    await log(day(10, 12), 'smith-flat-press', 40, 10);
    await log(day(11, 9), 'smith-flat-press', 44, 10);
    // These would change the result if they counted.
    await log(day(11, 9), 'smith-flat-press', 100, 10, 2, { warmup: true });
    await log(day(11, 9), 'smith-flat-press', 100, 10, 3, { deleted: true });
    render(Progress);
    const row = await screen.findByRole('button', { name: 'Chest' });
    await waitFor(() => expect(row.textContent).toContain('+10%'));
    expect(row.textContent).toContain('1 sets this week');
  });

  it('opens the muscle sheet with its exercises', async () => {
    await log(day(11, 9), 'smith-flat-press', 20, 10);
    render(Progress);
    await fireEvent.click(await screen.findByRole('button', { name: 'Chest' }));
    const dialog = await screen.findByRole('dialog', { name: 'Chest', hidden: true });
    await waitFor(() => expect(within(dialog).getByText('Smith flat press')).toBeTruthy());
    expect(dialog.textContent).toContain('Not enough data yet');
  });

  it('Exercises view flags Add weight for Cable row after 3x12', async () => {
    for (const setNo of [1, 2, 3]) await log(day(11, 9), 'cable-row-v-handle', 30, 12, setNo);
    await log(day(11, 9), 'smith-flat-press', 20, 6);
    render(Progress);
    await fireEvent.click(await screen.findByRole('tab', { name: 'Exercises' }));
    const cable = await screen.findByRole('button', { name: /Cable row V-handle/ });
    expect(cable.textContent).toContain('Add weight');
    expect(cable.textContent).toContain('30 × 12 · 9 Nov');
    const press = screen.getByRole('button', { name: /Smith flat press/ });
    expect(press.textContent).toContain('Keep building');
  });

  it('adds an exercise from the Exercises view', async () => {
    render(Progress);
    await fireEvent.click(await screen.findByRole('tab', { name: 'Exercises' }));
    const adds = await screen.findAllByRole('button', { name: '+ Add exercise' });
    await fireEvent.click(adds[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Add exercise', hidden: true });
    await fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Svend press' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add exercise', hidden: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Svend press/ })).toBeTruthy());
  });
});
