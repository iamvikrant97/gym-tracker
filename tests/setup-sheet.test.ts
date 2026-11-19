import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { closeDb, put } from '../src/lib/db';
import { workout } from '../src/lib/workout.svelte';
import Workout from '../src/screens/Workout.svelte';
import SetupSheet from '../src/ui/SetupSheet.svelte';
import type { SetLog, Workout as W } from '../src/lib/types';
import { SETUP } from '../src/lib/setupGuides';

const NOW = new Date(2026, 10, 17, 8, 30).getTime();

beforeEach(async () => {
  await closeDb(true);
  localStorage.clear();
  location.hash = '#/workout';
  workout.current = null;
  workout.sets = [];
  workout.history = [];
});
afterEach(() => cleanup());

describe('Set up button', () => {
  it('opens the tip, the weight rule and last time for that exercise', async () => {
    const start = new Date(2026, 10, 10, 7, 0).getTime();
    const old: W = { id: 'old', date: '2026-11-10', sessionId: 'SA-A', startedAt: start, endedAt: start + 3_600_000, swaps: {} };
    await put('workouts', old);
    for (const [n, kg, reps] of [[1, 20, 10], [2, 25, 8]] as const) {
      await put('sets', {
        id: `old-${n}`, workoutId: 'old', date: old.date, sessionId: 'SA-A', exerciseId: 'barbell-curl', setNo: n, kg, reps,
        warmup: false, feltIt: false, doneAt: start + n * 60_000, updatedAt: 1, deleted: false, synced: true,
      } satisfies SetLog);
    }
    await workout.startWorkout('SA-A', NOW);
    render(Workout);
    await screen.findByRole('article', { name: 'Barbell curl' });
    await fireEvent.click(screen.getByRole('button', { name: 'How to set up Barbell curl' }));
    const dlg = await screen.findByRole('dialog', { name: 'Barbell curl' });
    await fireEvent.click(await screen.findByRole('tab', { name: 'Set up' }));
    expect(dlg.textContent).toContain(SETUP['barbell-curl']);
    expect(dlg.textContent).toMatch(/Pick a weight you can do \d+ reps with/);
    expect(dlg.textContent).toContain('Last time: 25 kg × 8');
  });

  it('leaves out the last-time line when there is no history', async () => {
    await workout.startWorkout('SA-A', NOW);
    render(Workout);
    await screen.findByRole('article', { name: 'Barbell curl' });
    await fireEvent.click(screen.getByRole('button', { name: 'How to set up Barbell curl' }));
    const dlg = await screen.findByRole('dialog', { name: 'Barbell curl' });
    await fireEvent.click(await screen.findByRole('tab', { name: 'Set up' }));
    expect(dlg.textContent).toContain(SETUP['barbell-curl']);
    expect(dlg.textContent).not.toContain('Last time');
  });
});

describe('Form guide tab', () => {
  it('opens on Form when the exercise has a guide, and Set up is one tap away', async () => {
    await workout.startWorkout('SA-A', NOW);
    render(Workout);
    await screen.findByRole('article', { name: 'Barbell curl' });
    await fireEvent.click(screen.getByRole('button', { name: 'How to set up Barbell curl' }));
    const form = await screen.findByRole('tab', { name: 'Form' });
    expect(form.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('group', { name: 'Animation controls' })).toBeTruthy();
    expect(screen.getByText(/general reference.*may not match your body/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('tab', { name: 'Set up' }));
    expect(screen.queryByRole('group', { name: 'Animation controls' })).toBeNull();
  });

  it('remembers the last tab for the next exercise and the next visit', async () => {
    await workout.startWorkout('SA-A', NOW);
    render(Workout);
    await screen.findByRole('article', { name: 'Barbell curl' });
    await fireEvent.click(screen.getByRole('button', { name: 'How to set up Barbell curl' }));
    await fireEvent.click(await screen.findByRole('tab', { name: 'Set up' }));
    expect(localStorage.getItem('gym.guideTab')).toBe('setup');
    await fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await fireEvent.click(screen.getByRole('button', { name: 'How to set up Bar pushdown' }));
    const setup = await screen.findByRole('tab', { name: 'Set up' });
    expect(setup.getAttribute('aria-selected')).toBe('true');
  });

  it('shows only Set up, with no tabs, for an exercise without a guide', async () => {
    localStorage.setItem('gym.guideTab', 'form');
    await workout.startWorkout('SA-A', NOW);
    render(SetupSheet, { open: true, exerciseId: 'barbell-back-squat', onclose: () => {} });
    const dlg = await screen.findByRole('dialog');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('tab')).toBeNull();
    expect(dlg.textContent).toContain(SETUP['barbell-back-squat'] ?? 'Set the machine');
  });

  it('every guide is keyed to an exercise that exists in the app', async () => {
    const { EXERCISES } = await import('../src/lib/seed');
    const { EXERCISE_PATTERN } = await import('../src/lib/patterns');
    const ids = new Set(EXERCISES.map((e) => e.id));
    const unknown = Object.keys(EXERCISE_PATTERN).filter((id) => !ids.has(id));
    expect(unknown).toEqual([]);
  });
});
