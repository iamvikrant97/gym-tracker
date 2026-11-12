import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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
    for (const d of [9, 10, 11]) expect(screen.getByLabelText(`${d} Nov, trained, view summary`)).toBeTruthy();
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

  it('trained days are buttons; untrained and future days stay inert', async () => {
    render(Week);
    const b = await screen.findByRole('button', { name: '9 Nov, trained, view summary' });
    expect(b.tagName).toBe('BUTTON');
    expect(screen.getAllByRole('button', { name: /view summary/ })).toHaveLength(3);
    expect(document.querySelector('[data-date="2026-11-12"]')?.tagName).not.toBe('BUTTON'); // today, untrained
    expect(document.querySelector('[data-date="2026-11-14"]')?.tagName).not.toBe('BUTTON'); // future
    expect(document.querySelector('[data-date="2026-11-08"]')?.tagName).not.toBe('BUTTON'); // untrained
  });

  it('tapping a trained day opens a sheet with the session, exercises, sets, volume and duration', async () => {
    const w: Workout = { id: 'wx', date: day(5), sessionId: 'CB-B', startedAt: at(5), endedAt: at(5) + 45 * 60_000, swaps: {} };
    await put('workouts', w);
    const mkSet = (id: string, exerciseId: string, setNo: number, kg: number, reps: number, extra: Partial<SetLog> = {}): SetLog => ({
      id, workoutId: 'wx', date: day(5), sessionId: 'CB-B', exerciseId, setNo, kg, reps, warmup: false, feltIt: false,
      doneAt: at(5) + setNo * 60_000, updatedAt: 1, deleted: false, synced: true, ...extra,
    });
    await put('sets', mkSet('x1', 'converging-chest-press', 1, 40, 11));
    await put('sets', mkSet('x2', 'converging-chest-press', 2, 42.5, 9));
    await put('sets', mkSet('x3', 'lat-pulldown-wide', 1, 50, 10, { doneAt: at(5) + 600_000 }));
    await put('sets', mkSet('xw', 'converging-chest-press', 0, 20, 12, { warmup: true, doneAt: at(5) - 1000 }));
    await put('sets', mkSet('xd', 'converging-chest-press', 3, 99, 99, { deleted: true }));
    render(Week);
    await fireEvent.click(await screen.findByRole('button', { name: '5 Nov, trained, view summary' }));
    const dlg = await screen.findByRole('dialog', { name: '5 Nov' });
    expect(dlg.textContent).toContain('Chest + Back B');
    expect(dlg.textContent).toContain('Converging chest press');
    expect(dlg.textContent).toContain('40 × 11');
    expect(dlg.textContent).toContain('42.5 × 9');
    expect(dlg.textContent).toContain('50 × 10');
    expect(dlg.textContent).not.toContain('20 × 12'); // warm-up
    expect(dlg.textContent).not.toContain('99 × 99'); // deleted
    expect(within(dlg).getByTestId('day-sets').textContent).toBe('3');
    expect(within(dlg).getByTestId('day-volume').textContent).toContain('1,323'); // 440 + 382.5 + 500 = 1322.5 -> 1,323
    expect(within(dlg).getByTestId('day-minutes').textContent).toContain('45');
  });

  it('shows both workouts when a date has two', async () => {
    const w2: Workout = { id: 'w9b', date: day(9), sessionId: 'L-A', startedAt: at(9) + 7_200_000, endedAt: at(9) + 9_000_000, swaps: {} };
    await put('workouts', w2);
    await put('sets', {
      id: 's9b', workoutId: 'w9b', date: day(9), sessionId: 'L-A', exerciseId: 'leg-press', setNo: 1, kg: 100, reps: 8,
      warmup: false, feltIt: false, doneAt: at(9) + 7_300_000, updatedAt: 1, deleted: false, synced: true,
    } satisfies SetLog);
    render(Week);
    await fireEvent.click(await screen.findByRole('button', { name: '9 Nov, trained, view summary' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getAllByTestId('day-workout')).toHaveLength(2);
    expect(dlg.textContent).toContain('Chest + Back A');
    expect(dlg.textContent).toContain('Legs A');
    expect(dlg.textContent).toContain('100 × 8');
  });

  it('a future date with sets is not tappable', async () => {
    await put('workouts', { id: 'wf', date: day(14), sessionId: 'CB-A', startedAt: at(14), swaps: {} } satisfies Workout);
    await put('sets', {
      id: 'sf', workoutId: 'wf', date: day(14), sessionId: 'CB-A', exerciseId: 'leg-press', setNo: 1, kg: 10, reps: 10,
      warmup: false, feltIt: false, doneAt: at(14), updatedAt: 1, deleted: false, synced: true,
    } satisfies SetLog);
    render(Week);
    await screen.findByRole('button', { name: '9 Nov, trained, view summary' });
    expect(screen.queryByRole('button', { name: /14 Nov/ })).toBeNull();
    expect(document.querySelector('[data-date="2026-11-14"]')?.getAttribute('data-trained')).toBe('false');
  });

  it('closes the sheet with Escape', async () => {
    render(Week);
    await fireEvent.click(await screen.findByRole('button', { name: '10 Nov, trained, view summary' }));
    const dlg = await screen.findByRole('dialog');
    expect(dlg.getAttribute('aria-hidden')).toBe('false');
    await fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-hidden')).toBe('true'));
  });
});
