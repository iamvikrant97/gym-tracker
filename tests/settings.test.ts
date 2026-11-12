import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { closeDb, getAll, loadSettings, put, saveSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import type { QueueItem } from '../src/lib/db';
import { exportAll, restoreBackup } from '../src/lib/backup';
import { _resetSyncState } from '../src/lib/sync';
import { WorkoutStore, workout } from '../src/lib/workout.svelte';
import { toasts, clearToast } from '../src/ui/toast.svelte';
import Settings from '../src/screens/Settings.svelte';
import type { Exercise, SetLog, Workout } from '../src/lib/types';

const T0 = new Date(2026, 10, 11, 7, 0).getTime();
const mk = (id: string, o: Partial<SetLog> = {}): SetLog => ({
  id, workoutId: 'w1', date: '2026-11-11', sessionId: 'CB-B', exerciseId: 'converging-chest-press', setNo: 1, kg: 40, reps: 10,
  warmup: false, feltIt: false, doneAt: T0, updatedAt: T0, deleted: false, synced: true, ...o,
});
const W: Workout = { id: 'w1', date: '2026-11-11', sessionId: 'CB-B', startedAt: T0, endedAt: T0 + 3_600_000, swaps: {} };
const CUSTOM: Exercise = { id: 'custom-1', name: 'Hammer press', slot: 'Chest press', muscle: 'Chest', kind: 'compound', step: 5, repMin: 8, repMax: 10, restSec: 180 };

beforeEach(async () => {
  await closeDb(true);
  _resetSyncState();
  location.hash = '#/settings';
  workout.current = null;
  workout.sets = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('backup', () => {
  it('export JSON round-trips through import', async () => {
    await put('workouts', W);
    await put('sets', mk('a'));
    await put('sets', mk('b', { setNo: 2, synced: false }));
    await put('customExercises', CUSTOM);
    await saveSettings({ ...DEFAULT_SETTINGS, weeklyTarget: 5, bodyKg: 70, scriptUrl: 'https://x/exec', scriptKey: 'secret', restOverrides: { 'converging-chest-press': 150 } });
    const json = JSON.stringify(await exportAll(T0));
    expect(json).not.toContain('secret');

    await closeDb(true);
    const r = await restoreBackup(json);
    expect(r).toEqual({ sets: 2, workouts: 1, exercises: 1 });
    expect((await getAll<SetLog>('sets')).map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(await getAll<Workout>('workouts')).toEqual([W]);
    expect(await getAll<Exercise>('customExercises')).toEqual([CUSTOM]);
    const s = await loadSettings();
    expect(s).toMatchObject({ weeklyTarget: 5, bodyKg: 70, scriptUrl: 'https://x/exec', restOverrides: { 'converging-chest-press': 150 } });
    expect(s.scriptKey).toBeUndefined();
    // Not yet in the Sheet -> queued again; already synced -> not.
    expect(await getAll<QueueItem>('queue')).toEqual([{ id: 'b', op: 'upsert' }]);
  });

  it('merges by id: twice is a no-op, a newer copy wins, an older one does not', async () => {
    await put('workouts', W);
    await put('sets', mk('a', { kg: 40, updatedAt: T0 }));
    const json = JSON.stringify(await exportAll());
    expect(await restoreBackup(json)).toEqual({ sets: 0, workouts: 0, exercises: 0 });
    await put('sets', mk('a', { kg: 45, updatedAt: T0 + 5 }));
    await restoreBackup(json); // older copy of a
    expect((await getAll<SetLog>('sets'))[0].kg).toBe(45);
    const newer = JSON.parse(json);
    newer.sets[0] = { ...newer.sets[0], kg: 50, updatedAt: T0 + 10 };
    await restoreBackup(newer);
    expect((await getAll<SetLog>('sets'))[0].kg).toBe(50);
    expect(await getAll<SetLog>('sets')).toHaveLength(1);
  });

  it('keeps this phone’s connection and refuses files that are not backups', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, scriptUrl: 'https://mine/exec', scriptKey: 'k' });
    await restoreBackup({ app: 'gym-tracker', format: 1, sets: [], workouts: [], customExercises: [], settings: { ...DEFAULT_SETTINGS, scriptUrl: 'https://other/exec' } });
    expect(await loadSettings()).toMatchObject({ scriptUrl: 'https://mine/exec', scriptKey: 'k' });
    await expect(restoreBackup('not json')).rejects.toThrow(/not a backup/);
    await expect(restoreBackup({ hello: 1 })).rejects.toThrow(/not a backup/);
  });
});

describe('rest override', () => {
  it('is saved and used by restEndsAt', async () => {
    const s = new WorkoutStore();
    await s.updateSettings((cur) => ({ ...cur, restOverrides: { ...cur.restOverrides, 'converging-chest-press': 90 } }));
    await s.startWorkout('CB-B', T0);
    await s.completeSet('converging-chest-press', 1, 40, 10, T0 + 60_000);
    expect(s.restEndsAt).toBe(T0 + 60_000 + 90_000);
    expect((await loadSettings()).restOverrides['converging-chest-press']).toBe(90);
  });
});

describe('Settings screen', () => {
  const sheetReply = (log: unknown[]) =>
    vi.fn(async (..._a: unknown[]) => ({ ok: true, json: async () => ({ ok: true, log, exercises: [] }) }) as Response);

  it('saves URL + key, imports, and shows "Imported N sets"', async () => {
    const f = sheetReply([
      { id: 'r1', date: '2026-11-09', day: 'Chest+Back A', exercise: 'Smith flat press', kg: 60, reps: 8 },
      { id: 'r2', date: '2026-11-09', day: 'Chest+Back A', exercise: 'Smith flat press', kg: 60, reps: 8 },
    ]);
    vi.stubGlobal('fetch', f);
    render(Settings);
    await fireEvent.input(await screen.findByLabelText('Web app URL'), { target: { value: ' https://script.google.com/macros/s/AB/exec ' } });
    await fireEvent.input(screen.getByLabelText('Key'), { target: { value: 'k3y' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save and import' }));
    expect(await screen.findByText('Imported 2 sets')).toBeTruthy();
    expect(await loadSettings()).toMatchObject({ scriptUrl: 'https://script.google.com/macros/s/AB/exec', scriptKey: 'k3y' });
    expect(String(f.mock.calls[0][0])).toBe('https://script.google.com/macros/s/AB/exec'); // key never in the URL
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ key: 'k3y', action: 'import' });
    expect(await getAll<SetLog>('sets')).toHaveLength(2);
  });

  it('shows a plain error for a /dev URL and does not call it', async () => {
    const f = sheetReply([]);
    vi.stubGlobal('fetch', f);
    render(Settings);
    await fireEvent.input(await screen.findByLabelText('Web app URL'), { target: { value: 'https://script.google.com/macros/s/AB/dev' } });
    await fireEvent.input(screen.getByLabelText('Key'), { target: { value: 'k' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText(/test URL/)).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });

  it('shows the exact Spotify redirect URI', async () => {
    render(Settings);
    expect(await screen.findByText(`${location.origin}/gym-tracker/`)).toBeTruthy();
  });

  it('saves weekly target, body weight and pause', async () => {
    render(Settings);
    const target = await screen.findByLabelText('Sessions per week');
    await waitFor(() => expect((target as HTMLInputElement).value).toBe('6'));
    await fireEvent.click(screen.getByRole('button', { name: 'Fewer sessions' }));
    await fireEvent.input(screen.getByLabelText('Body weight (kg)'), { target: { value: '68.5' } });
    await fireEvent.change(screen.getByLabelText('Body weight (kg)'), { target: { value: '68.5' } });
    await fireEvent.click(screen.getByRole('switch', { name: /Pause training/ }));
    await waitFor(async () => expect(await loadSettings()).toMatchObject({ weeklyTarget: 5, bodyKg: 68.5, paused: true }));
  });

  it('per-exercise rest and step overrides are saved', async () => {
    render(Settings);
    await fireEvent.click(await screen.findByText('Chest'));
    const rest = await screen.findByLabelText('Rest for Converging chest press');
    await fireEvent.change(rest, { target: { value: '150' } });
    const step = screen.getByLabelText('Weight step for Converging chest press');
    await fireEvent.change(step, { target: { value: '5' } });
    await waitFor(async () => {
      const s = await loadSettings();
      expect(s.restOverrides['converging-chest-press']).toBe(150);
      expect(s.stepOverrides['converging-chest-press']).toBe(5);
    });
  });

  it('Repeat last workout is disabled while a workout is open, and the store refuses it', async () => {
    await workout.startWorkout('CB-B', T0);
    render(Settings);
    const btn = await screen.findByRole('button', { name: 'Repeat last workout' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    const open = workout.current!.id;
    await expect(workout.repeatLast()).rejects.toThrow(/Finish/);
    expect(workout.current?.id).toBe(open);
    expect(workout.active).toBe(true);
  });

  it('shows version and build date', async () => {
    render(Settings);
    expect(await screen.findByText(/Version \d+\.\d+\.\d+ · built \d{4}-\d{2}-\d{2}/)).toBeTruthy();
  });
});

describe('Find duplicate sets', () => {
  const dup = (id: string, o: Partial<SetLog> = {}) => mk(id, { date: '2026-11-09', ...o });
  const seedDupes = async () => {
    await put('sets', dup('import-2026-11-09-converging-chest-press-1', { synced: false }));
    await put('sets', dup('sheet-uuid-1'));
    await put('sets', dup('import-2026-11-09-converging-chest-press-2', { setNo: 2, synced: false }));
    await put('sets', dup('sheet-uuid-2', { setNo: 2 }));
    await put('sets', mk('today-1', { date: '2026-11-12' }));
  };

  it('lists the duplicates per day, removes them only after Confirm, then toasts the count', async () => {
    clearToast();
    await seedDupes();
    render(Settings);
    await fireEvent.click(await screen.findByRole('button', { name: 'Find duplicate sets' }));
    expect(await screen.findByText('9 Nov: 2 duplicates')).toBeTruthy();
    // Nothing is changed until the user confirms.
    expect((await getAll<SetLog>('sets')).every((x) => !x.deleted)).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove 2 duplicate sets' }));
    await waitFor(() => expect(toasts.message).toBe('Removed 2 duplicate sets'));
    const sets = await getAll<SetLog>('sets');
    expect(sets.filter((x) => x.deleted).map((x) => x.id).sort()).toEqual([
      'import-2026-11-09-converging-chest-press-1', 'import-2026-11-09-converging-chest-press-2',
    ]);
    expect(sets.find((x) => x.id === 'today-1')?.deleted).toBe(false);
    expect((await getAll<QueueItem>('queue')).map((q) => `${q.id}:${q.op}`).sort()).toEqual([
      'import-2026-11-09-converging-chest-press-1:delete', 'import-2026-11-09-converging-chest-press-2:delete',
    ]);
    // Second run: nothing left.
    await fireEvent.click(screen.getByRole('button', { name: 'Find duplicate sets' }));
    expect(await screen.findByText('No duplicate sets found')).toBeTruthy();
  });

  it('Cancel leaves everything as it was', async () => {
    await seedDupes();
    render(Settings);
    await fireEvent.click(await screen.findByRole('button', { name: 'Find duplicate sets' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: /Remove \d+ duplicate/ })).toBeNull();
    expect((await getAll<SetLog>('sets')).every((x) => !x.deleted)).toBe(true);
  });

  it('says so when there are none', async () => {
    await put('sets', mk('a'));
    render(Settings);
    await fireEvent.click(await screen.findByRole('button', { name: 'Find duplicate sets' }));
    expect(await screen.findByText('No duplicate sets found')).toBeTruthy();
  });
});
