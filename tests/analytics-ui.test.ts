import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { closeDb, put } from '../src/lib/db';
import { workout } from '../src/lib/workout.svelte';
import Progress from '../src/screens/Progress.svelte';
import type { SetLog } from '../src/lib/types';

let n = 0;
async function log(date: string, exerciseId: string, kg: number, reps: number, extra: Partial<SetLog> = {}) {
  const t = Date.parse(`${date}T08:00:00`);
  await put('sets', {
    id: `s${++n}`, workoutId: `w-${date}`, date, sessionId: 'CB-A', exerciseId, setNo: 1, kg, reps,
    warmup: false, feltIt: false, doneAt: t, updatedAt: t, deleted: false, synced: true, ...extra,
  } satisfies SetLog);
}

beforeEach(async () => {
  await closeDb(true);
  n = 0;
  workout.current = null;
  workout.sets = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 19, 8, 30)); // Thursday
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('Progress overview', () => {
  it('says what it will show when nothing has been logged yet', async () => {
    render(Progress);
    const box = await screen.findByTestId('analytics');
    expect(box.textContent).toContain('Your progress will show up here');
    expect(within(box).queryByRole('tablist')).toBeNull();
  });

  it('shows the summary tiles and tabs once there is history', async () => {
    await log('2026-11-16', 'smith-flat-press', 50, 10);
    await log('2026-11-17', 'barbell-curl', 20, 10);
    render(Progress);
    const box = await screen.findByTestId('analytics');
    await waitFor(() => expect(within(box).getByRole('tablist', { name: 'Progress view' })).toBeTruthy());
    expect(box.textContent).toContain('Workouts this week');
    expect(box.textContent).toContain('Personal bests this month');
    expect(box.textContent).toContain('Week streak');
    expect(box.textContent).toContain('Sets by muscle');
  });

  it('switches between Volume, Strength, Muscle and Consistency', async () => {
    await log('2026-10-20', 'smith-flat-press', 50, 10);
    await log('2026-11-17', 'smith-flat-press', 60, 10);
    render(Progress);
    const box = await screen.findByTestId('analytics');
    await waitFor(() => expect(within(box).getByRole('tab', { name: 'Strength' })).toBeTruthy());
    await fireEvent.click(within(box).getByRole('tab', { name: 'Strength' }));
    expect(box.textContent).toContain('Strength by exercise');
    expect(box.textContent).toContain('Smith flat press');
    expect(box.textContent).toContain('Best yet');
    await fireEvent.click(within(box).getByRole('tab', { name: 'Muscle' }));
    expect(box.textContent).toContain('Sets per muscle');
    await fireEvent.click(within(box).getByRole('tab', { name: 'Consistency' }));
    expect(box.textContent).toContain('Brighter bars hit your weekly target');
  });

  it('keeps warm-up and deleted sets out of the numbers, and the old Muscles list is still there', async () => {
    await log('2026-11-17', 'smith-flat-press', 100, 10, { warmup: true });
    await log('2026-11-17', 'smith-flat-press', 100, 10, { deleted: true });
    render(Progress);
    const box = await screen.findByTestId('analytics');
    expect(box.textContent).toContain('Your progress will show up here');
    expect(screen.getByRole('tab', { name: 'Muscles' })).toBeTruthy();
  });
});
