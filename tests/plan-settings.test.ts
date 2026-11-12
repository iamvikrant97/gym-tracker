import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { setActivePlan, setRetiredNames } from '../src/lib/activePlan.svelte';
import { closeDb, saveSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import { _resetSyncState } from '../src/lib/sync';
import { fullBodyPlan, VIK_PLAN } from '../src/lib/seed';
import { workout } from '../src/lib/workout.svelte';
import Settings from '../src/screens/Settings.svelte';

beforeEach(async () => {
  await closeDb(true);
  _resetSyncState();
  setActivePlan(null);
  setRetiredNames(undefined);
  workout.settings = null;
  workout.current = null;
  workout.sets = [];
  location.hash = '#/settings';
});
afterEach(() => {
  cleanup();
  setActivePlan(null);
  vi.restoreAllMocks();
});

describe('Settings: Training plan', () => {
  it('shows the active plan, its weekdays and sessions; Change plan opens the setup', async () => {
    const plan = fullBodyPlan([5, 1, 3]);
    await saveSettings({ ...DEFAULT_SETTINGS, plan, userName: '', weeklyTarget: 3 });
    setActivePlan(plan);
    render(Settings);
    const card = await screen.findByRole('article', { name: 'Training plan' });
    expect(within(card).getByTestId('plan-name').textContent).toBe('Full body A/B');
    expect(within(card).getByTestId('plan-days').textContent).toBe('Mon · Wed · Fri · 3 a week');
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Full body A5 exercises', 'Full body B6 exercises']);
    await fireEvent.click(within(card).getByRole('button', { name: 'Change plan' }));
    expect(location.hash).toBe('#/setup');
  });

  it("Vik's own install shows his split with six sessions", async () => {
    render(Settings);
    const card = await screen.findByRole('article', { name: 'Training plan' });
    expect(within(card).getByTestId('plan-name').textContent).toBe("Vik's split");
    expect(within(card).getAllByRole('listitem')).toHaveLength(VIK_PLAN.sessions.length);
  });

  it('Change plan is off while a workout is open', async () => {
    setActivePlan(fullBodyPlan([1, 3, 5]));
    await workout.startWorkout('fb-a', Date.now());
    render(Settings);
    const b = (await screen.findByRole('button', { name: 'Change plan' })) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.getByText(/Finish it before changing the plan/)).toBeTruthy();
  });
});

describe('Settings: local only', () => {
  it('without a Sheet it reminds her to export a backup', async () => {
    render(Settings);
    expect((await screen.findByTestId('backup-reminder')).textContent).toContain('Export a backup every few weeks');
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeTruthy();
  });

  it('with a Sheet connected the reminder is not shown (Vik sees no change)', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, scriptUrl: 'https://script.google.com/macros/s/X/exec', scriptKey: 'k' });
    render(Settings);
    await screen.findByRole('button', { name: 'Export backup' });
    await waitFor(() => expect((screen.getByLabelText('Web app URL') as HTMLInputElement).value).toContain('script.google.com'));
    expect(screen.queryByTestId('backup-reminder')).toBeNull();
  });

  it('with no Sheet the status says the sets are saved on the phone, with no warning', async () => {
    render(Settings);
    expect((await screen.findByTestId('sync-status')).textContent).toBe('Not connected · sets are saved on this phone');
    expect(document.querySelector('.status.warn')).toBeNull();
  });
});
