import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { closeDb, loadSettings, put } from '../src/lib/db';
import { workout } from '../src/lib/workout.svelte';
import Week from '../src/screens/Week.svelte';
import type { SetLog, Workout } from '../src/lib/types';

const at = (d: number) => new Date(2026, 10, d, 8, 0).getTime();
const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;

beforeEach(async () => {
  await closeDb(true);
  workout.current = null;
  workout.sets = [];
  workout.settings = null;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12, 8, 30));
  for (const [d, exerciseId] of [[9, 'smith-flat-press'], [10, 'barbell-curl'], [11, 'leg-press']] as const) {
    const w: Workout = { id: `w${d}`, date: day(d), sessionId: 'CB-A', startedAt: at(d), endedAt: at(d) + 3_600_000, swaps: {} };
    await put('workouts', w);
    const s: SetLog = {
      id: `s${d}`, workoutId: w.id, date: w.date, sessionId: 'CB-A', exerciseId, setNo: 1, kg: 20, reps: 10,
      warmup: false, feltIt: false, doneAt: at(d), updatedAt: at(d), deleted: false, synced: true,
    };
    await put('sets', s);
  }
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('Week', () => {
  it('marks 9, 10 and 11 Nov on the calendar and nothing else this week', async () => {
    render(Week);
    await waitFor(() => expect(document.querySelector('[data-date="2026-11-09"]')?.getAttribute('data-trained')).toBe('true'));
    for (const d of [9, 10, 11]) expect(screen.getByLabelText(`${d} Nov, trained`)).toBeTruthy();
    expect(document.querySelector('[data-date="2026-11-12"]')?.getAttribute('data-trained')).toBe('false');
    expect(document.querySelector('[data-date="2026-11-08"]')?.getAttribute('data-trained')).toBe('false');
    expect(document.querySelectorAll('.day').length).toBe(56);
  });

  it('shows weekly sessions against the target and per-muscle freshness', async () => {
    render(Week);
    await waitFor(() => expect(screen.getByText('3 / 6')).toBeTruthy());
    expect(screen.getByText('Trained yesterday')).toBeTruthy(); // Quads (leg press, 11 Nov)
    expect(screen.getAllByText('Not trained yet').length).toBeGreaterThan(0);
  });

  it('stores the Pause toggle in Settings', async () => {
    render(Week);
    const sw = await screen.findByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(sw);
    await waitFor(() => expect(sw.getAttribute('aria-checked')).toBe('true'));
    expect((await loadSettings()).paused).toBe(true);
  });
});
