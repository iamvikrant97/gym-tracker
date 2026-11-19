import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { closeDb, put, saveSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import { workout } from '../src/lib/workout.svelte';
import { backupStatus, backupTone, lastBackupAt, lastBackupLabel, markBackedUp } from '../src/lib/backupReminder';
import Home from '../src/screens/Home.svelte';
import Settings from '../src/screens/Settings.svelte';
import type { SetLog } from '../src/lib/types';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 19, 12, 0).getTime();
const set = (date: string, o: Partial<SetLog> = {}) => ({ date, ...o });

describe('backupStatus', () => {
  it('is quiet with no history, or only warm-up and deleted sets', () => {
    expect(backupStatus([], null, NOW).due).toBe(false);
    expect(backupStatus([set('2026-10-01', { warmup: true }), set('2026-10-01', { deleted: true })], null, NOW).due).toBe(false);
  });
  it('waits a week after the first set when never backed up, so it does not nag on day one', () => {
    expect(backupStatus([set('2026-11-18')], null, NOW).due).toBe(false);
    expect(backupStatus([set('2026-11-12')], null, NOW)).toMatchObject({ due: true, days: 7, last: null });
  });
  it('after a backup, reminds again two weeks later', () => {
    const sets = [set('2026-09-01')];
    expect(backupStatus(sets, NOW - 13 * DAY, NOW).due).toBe(false);
    expect(backupStatus(sets, NOW - 14 * DAY, NOW).due).toBe(true);
  });
  it('is not due when the saved time is in the future (a wrong clock)', () => {
    expect(backupStatus([set('2026-09-01')], NOW + 5 * DAY, NOW).due).toBe(false);
  });
});

describe('last backup time and label', () => {
  beforeEach(() => localStorage.clear());
  it('stores the time on this phone and reads it back; junk reads as never', () => {
    expect(lastBackupAt()).toBeNull();
    markBackedUp(NOW);
    expect(lastBackupAt()).toBe(NOW);
    localStorage.setItem('gym.lastBackup', 'abc');
    expect(lastBackupAt()).toBeNull();
  });
  it('says today, yesterday, or how many days ago with the date', () => {
    expect(lastBackupLabel(null, NOW)).toBe('Never backed up');
    expect(lastBackupLabel(NOW - 3600_000, NOW)).toBe('Last backup: today');
    expect(lastBackupLabel(NOW - DAY, NOW)).toBe('Last backup: yesterday');
    expect(lastBackupLabel(NOW - 3 * DAY, NOW)).toBe('Last backup: 3 days ago (16 Nov)');
  });
});

async function logOn(date: string) {
  const t = Date.parse(`${date}T08:00:00`);
  await put('workouts', { id: `w-${date}`, date, sessionId: 'CB-A', startedAt: t, endedAt: t + 3_600_000, swaps: {} });
  await put('sets', { id: `s-${date}`, workoutId: `w-${date}`, date, sessionId: 'CB-A', exerciseId: 'smith-flat-press', setNo: 1, kg: 40, reps: 10, warmup: false, feltIt: false, doneAt: t, updatedAt: t, deleted: false, synced: true } satisfies SetLog);
}

beforeEach(async () => {
  await closeDb(true);
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '';
  workout.current = null;
  workout.sets = [];
  workout.ready = true;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('backupTone', () => {
  const tone = (last: number | null, date: string) => backupTone(backupStatus([set(date)], last, NOW));
  it('has no colour without history', () => expect(backupTone(backupStatus([], null, NOW))).toBeNull());
  it('is green on the day of a backup and the day after, with a soft glow', () => {
    expect(tone(NOW, '2026-10-01')).toEqual({ hue: 140, glow: expect.any(Number) });
    expect(tone(NOW - DAY, '2026-10-01')!.hue).toBe(140);
    expect(tone(NOW, '2026-10-01')!.glow).toBeLessThan(0.35);
  });
  it('turns amber at the due day, then red and glowing hard at twice that', () => {
    expect(tone(NOW - 14 * DAY, '2026-09-01')!.hue).toBe(45);
    expect(tone(NOW - 28 * DAY, '2026-09-01')).toEqual({ hue: 0, glow: 1 });
    expect(tone(NOW - 60 * DAY, '2026-09-01')).toEqual({ hue: 0, glow: 1 });
  });
  it('shifts gradually in between, and sooner when never backed up (7 and 14 days)', () => {
    const mid = tone(NOW - 7 * DAY, '2026-09-01')!;
    expect(mid.hue).toBeGreaterThan(45);
    expect(mid.hue).toBeLessThan(140);
    expect(tone(null, '2026-11-12')!.hue).toBe(45);
    expect(tone(null, '2026-11-05')!.hue).toBe(0);
  });
});

describe('Home: backup "!"', () => {
  it('appears for someone with no Sheet whose backup is due, and opens Settings at the Backup card', async () => {
    await logOn('2026-11-05');
    render(Home);
    const bang = await screen.findByRole('button', { name: /Back up your data\. Never backed up/ });
    await fireEvent.click(bang);
    expect(location.hash).toBe('#/settings');
    expect(sessionStorage.getItem('gym.focusBackup')).toBe('1');
  });
  it('goes away right after a backup, then comes back green-to-red as days pass', async () => {
    await logOn('2026-11-05');
    markBackedUp(NOW);
    render(Home);
    await screen.findByRole('button', { name: 'Settings' });
    expect(screen.queryByRole('button', { name: /Back up your data/ })).toBeNull();
    cleanup();
    markBackedUp(NOW - 3 * DAY);
    render(Home);
    expect((await screen.findByRole('button', { name: /Back up your data/ })).style.getPropertyValue('--h')).toBe('125');
    cleanup();
    markBackedUp(NOW - 30 * DAY);
    render(Home);
    expect((await screen.findByRole('button', { name: /Back up your data/ })).style.getPropertyValue('--h')).toBe('0');
    cleanup();
  });
  it('is hidden when there is no history or when a Sheet is connected', async () => {
    localStorage.clear();
    render(Home);
    await screen.findByRole('button', { name: 'Settings' });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('button', { name: /Back up your data/ })).toBeNull();
    cleanup();
    await logOn('2026-11-05');

    localStorage.clear();
    await saveSettings({ ...DEFAULT_SETTINGS, scriptUrl: 'https://script.google.com/macros/s/X/exec', scriptKey: 'k' });
    render(Home);
    await screen.findByRole('button', { name: 'Settings' });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('button', { name: /Back up your data/ })).toBeNull();
  });
});

describe('Settings: backup card', () => {
  it('shows an important note, glowing when due, and "Never backed up"', async () => {
    await logOn('2026-11-05');
    render(Settings);
    const note = await screen.findByTestId('backup-reminder');
    expect(note.textContent).toContain('Your history is only on this phone');
    await waitFor(() => expect(note.className).toContain('glow'));
    expect(screen.getByTestId('backup-last').textContent).toBe('Never backed up');
  });
  it('after Copy backup it says the backup was today and stops glowing', async () => {
    await logOn('2026-11-05');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    render(Settings);
    const note = await screen.findByTestId('backup-reminder');
    await fireEvent.click(screen.getByRole('button', { name: 'Copy backup' }));
    await waitFor(() => expect(screen.getByTestId('backup-last').textContent).toBe('Last backup: today'));
    expect(lastBackupAt()).not.toBeNull();
    expect(note.className).not.toContain('glow');
  });
  it('a failed export does not count as a backup', async () => {
    await logOn('2026-11-05');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true });
    render(Settings);
    await screen.findByTestId('backup-reminder');
    await fireEvent.click(screen.getByRole('button', { name: 'Copy backup' }));
    await screen.findByText(/Copy did not work/);
    expect(lastBackupAt()).toBeNull();
    expect(screen.getByTestId('backup-last').textContent).toBe('Never backed up');
  });
});
