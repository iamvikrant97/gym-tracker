import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { setActivePlan, setRetiredNames } from '../src/lib/activePlan.svelte';
import { closeDb, getAll, loadSettings, put, saveSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import { currentPlan, fullBodyPlan } from '../src/lib/seed';
import { workout } from '../src/lib/workout.svelte';
import App from '../src/App.svelte';
import Setup from '../src/screens/Setup.svelte';
import Workout from '../src/screens/Workout.svelte';
import type { Exercise, SetLog } from '../src/lib/types';
import type { Workout as W } from '../src/lib/types';

const click = (el: HTMLElement) => fireEvent.click(el);
const radio = (name: string | RegExp) => screen.getByRole('radio', { name });
const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;
const next = () => click(btn('Continue'));

beforeEach(async () => {
  await closeDb(true);
  setActivePlan(null);
  setRetiredNames(undefined);
  workout.settings = null;
  workout.current = null;
  workout.sets = [];
  workout.history = [];
  workout.customExercises = [];
  workout.ready = true;
  location.hash = '';
});
afterEach(() => {
  cleanup();
  setActivePlan(null);
  setRetiredNames(undefined);
  vi.restoreAllMocks();
});

function setup(props: { firstRun?: boolean } = {}) {
  const onfinish = vi.fn();
  const oncancel = vi.fn();
  render(Setup, { props: { onfinish, oncancel, ...props } });
  return { onfinish, oncancel };
}

describe('Setup: suggested plan', () => {
  it('days -> plan -> your week -> Start, in four taps or fewer', async () => {
    const { onfinish } = setup();
    expect(heading()).toBe('How many days a week?');
    expect(screen.getByRole('img', { name: 'Step 1 of 3' })).toBeTruthy();
    // 3 days, Mon / Wed / Fri by default
    expect(radio('3').getAttribute('aria-checked')).toBe('true');
    expect(['Monday', 'Wednesday', 'Friday'].map(pressed)).toEqual(['true', 'true', 'true']);
    expect(['Tuesday', 'Thursday', 'Saturday', 'Sunday'].map(pressed)).toEqual(['false', 'false', 'false', 'false']);
    await next();

    expect(heading()).toBe('Choose your plan');
    const suggested = radio(/Full body A\/B/);
    expect(suggested.textContent).toContain('Suggested for you');
    expect(suggested.getAttribute('aria-checked')).toBe('true');
    expect(radio(/Vik's split/)).toBeTruthy();
    expect(radio(/Build my own/)).toBeTruthy();
    await next();

    expect(heading()).toBe('Your week');
    const rows = within(screen.getByRole('list', { name: 'Your week' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['MondayFull body A', 'WednesdayFull body B', 'FridayFull body A']);
    expect(screen.getByText('Start light for the first 2 weeks — stop 2–3 reps before failure')).toBeTruthy();
    expect(screen.getByText(/next week carries on where this one stops/)).toBeTruthy();
    // no account / Sheet / Spotify prompts anywhere in the flow
    expect(document.body.textContent).not.toMatch(/sheet|spotify|account|sign in|log in/i);
    await click(btn('Start'));

    await waitFor(() => expect(onfinish).toHaveBeenCalledOnce());
    const s = await loadSettings();
    expect(s.plan).toMatchObject({ id: 'fullbody', days: [1, 3, 5], weeklyTarget: 3 });
    expect(s.plan!.sessions.map((x) => x.id)).toEqual(['fb-a', 'fb-b']);
    expect(s.weeklyTarget).toBe(3);
    expect(s.userName).toBeUndefined(); // never saves an empty name
    expect(currentPlan().id).toBe('fullbody');
  });

  it('picking 2 days defaults to Mon / Thu; the weekdays can be changed and must match the count', async () => {
    setup();
    await click(radio('2'));
    expect(['Monday', 'Thursday'].map(pressed)).toEqual(['true', 'true']);
    await click(btn('Thursday')); // off
    expect(btn('Continue').hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Pick 2 days (1 picked)')).toBeTruthy();
    await click(btn('Saturday'));
    expect(screen.getByText('Mon · Sat')).toBeTruthy();
    // picking a third day while two are chosen replaces the one picked longest ago
    await click(btn('Tuesday'));
    expect(['Monday', 'Saturday', 'Tuesday'].map(pressed)).toEqual(['false', 'true', 'true']);
    await next();
    await next();
    const rows = within(screen.getByRole('list', { name: 'Your week' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['TuesdayFull body A', 'SaturdayFull body B']);
    expect(screen.queryByText(/carries on/)).toBeNull(); // 2 days, 2 sessions: every week is the same
  });

  it('4 or 5 days: Full body is offered but not marked as suggested, and nothing is pre-selected', async () => {
    setup();
    await click(radio('4'));
    await next();
    expect(radio(/Full body A\/B/).textContent).not.toContain('Suggested for you');
    expect(btn('Continue').hasAttribute('disabled')).toBe(true);
    await click(radio(/Vik's split/));
    await next();
    const rows = within(screen.getByRole('list', { name: 'Your week' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['MondayChest + Back A', 'TuesdayLegs A', 'ThursdayShoulders + Arms A', 'FridayChest + Back B']);
  });

  it("Vik's split is stored without sessions, with her days and target", async () => {
    const { onfinish } = setup();
    await click(radio('4'));
    await next();
    await click(radio(/Vik's split/));
    await next();
    await click(btn('Start'));
    await waitFor(() => expect(onfinish).toHaveBeenCalled());
    const s = await loadSettings();
    expect(s.plan).toEqual({ id: 'vik', name: "Vik's split", sessions: [], days: [1, 2, 4, 5], weeklyTarget: 4 });
    expect(currentPlan().sessions).toHaveLength(6);
  });
});

describe('Setup: 2 to 7 days and keeping Vik\'s plan', () => {
  it('offers 2 to 7 days; 6 is Mon-Sat, 7 is every day', async () => {
    setup();
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['2', '3', '4', '5', '6', '7']);
    await click(radio('6'));
    expect(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(pressed)).toEqual(Array(6).fill('true'));
    expect(pressed('Sunday')).toBe('false');
    await click(radio('7'));
    expect(pressed('Sunday')).toBe('true');
  });

  const vikPlan = { id: 'vik', name: "Vik's split", sessions: [], days: [1, 2, 3, 4, 5, 6], weeklyTarget: 6 };

  it("Change plan -> Vik's split keeps his 6 weekdays and weekly target of 6", async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, plan: vikPlan, weeklyTarget: 6, userName: 'Vik' });
    await workout.restore();
    const { onfinish } = setup({ firstRun: false });
    expect(radio('6').getAttribute('aria-checked')).toBe('true');
    expect(['Monday', 'Saturday'].map(pressed)).toEqual(['true', 'true']);
    await next();
    await click(radio(/Vik's split/));
    await next();
    await click(btn('Start'));
    await waitFor(() => expect(onfinish).toHaveBeenCalled());
    const s = await loadSettings();
    expect(s.plan).toMatchObject({ id: 'vik', days: [1, 2, 3, 4, 5, 6], weeklyTarget: 6 });
    expect(s.weeklyTarget).toBe(6);
    expect(s.userName).toBe('Vik');
  });

  it('unchanged days keep a target set with the stepper (never silently dropped)', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, plan: { ...vikPlan, weeklyTarget: 6 }, weeklyTarget: 5, userName: 'Vik' });
    await workout.restore();
    const { onfinish } = setup({ firstRun: false });
    await next();
    await click(radio(/Vik's split/));
    await next();
    await click(btn('Start'));
    await waitFor(() => expect(onfinish).toHaveBeenCalled());
    expect((await loadSettings()).weeklyTarget).toBe(5);
  });

  it('changing the days sets the target to the number of days', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, plan: vikPlan, weeklyTarget: 6 });
    await workout.restore();
    const { onfinish } = setup({ firstRun: false });
    await click(radio('4'));
    await next();
    await click(radio(/Vik's split/));
    await next();
    await click(btn('Start'));
    await waitFor(() => expect(onfinish).toHaveBeenCalled());
    expect((await loadSettings()).weeklyTarget).toBe(4);
  });
});

describe('Setup: back navigation', () => {
  it('Back returns to the previous step and keeps what was chosen; the first step has no Back', async () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await click(radio('5'));
    await click(btn('Friday')); // off
    await click(btn('Saturday'));
    await next();
    await click(radio(/Build my own/));
    expect(screen.getByRole('img', { name: 'Step 2 of 4' })).toBeTruthy();
    await next();
    expect(heading()).toBe('Build your plan');
    expect(screen.getByRole('img', { name: 'Step 3 of 4' })).toBeTruthy();
    await click(btn('Back'));
    expect(heading()).toBe('Choose your plan');
    expect(radio(/Build my own/).getAttribute('aria-checked')).toBe('true');
    await click(btn('Back'));
    expect(heading()).toBe('How many days a week?');
    expect(radio('5').getAttribute('aria-checked')).toBe('true');
    expect(pressed('Saturday')).toBe('true');
    expect(pressed('Friday')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('when changing a plan from Settings, Back on the first step leaves the flow and nothing is saved', async () => {
    const { oncancel, onfinish } = setup({ firstRun: false });
    await click(btn('Back'));
    expect(oncancel).toHaveBeenCalledOnce();
    expect(onfinish).not.toHaveBeenCalled();
    expect((await loadSettings()).plan).toBeUndefined();
  });

  it('changing a plan starts from the current days and keeps the name setting and old session names', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS, userName: 'Minal',
      plan: { id: 'custom', name: 'My plan', days: [2, 4], weeklyTarget: 2, sessions: [{ id: 'c-old', name: 'Upper', items: [{ exerciseId: 'push-up', sets: 3 }] }] },
    });
    await workout.restore();
    const { onfinish } = setup({ firstRun: false });
    expect(radio('2').getAttribute('aria-checked')).toBe('true');
    expect(['Tuesday', 'Thursday'].map(pressed)).toEqual(['true', 'true']);
    await next();
    await next();
    await click(btn('Start'));
    await waitFor(() => expect(onfinish).toHaveBeenCalled());
    const s = await loadSettings();
    expect(s.plan!.id).toBe('fullbody');
    expect(s.userName).toBe('Minal');
    expect(s.retiredSessions).toEqual({ 'c-old': 'Upper' });
  });
});

describe('Setup: build my own', () => {
  async function openPicker(sessionName: string, muscle: string) {
    await click(btn(new RegExp(`^Add exercise to ${sessionName}`)));
    const dlg = screen.getByRole('dialog', { name: 'Add exercise' });
    const summary = within(dlg).getByText(muscle, { selector: 'summary span' });
    await click(summary);
    return dlg;
  }

  it('name sessions, pick from the library by muscle, reorder, remove, add a new exercise, review, start', async () => {
    const { onfinish } = setup();
    await next(); // 3 days
    await click(radio(/Build my own/));
    await next();

    // three sessions with default names
    const names = screen.getAllByLabelText('Session name') as HTMLInputElement[];
    expect(names.map((n) => n.value)).toEqual(['Session 1', 'Session 2', 'Session 3']);
    expect(btn('Continue').hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByText('No exercises yet')).toHaveLength(3);
    await fireEvent.input(names[0], { target: { value: 'Push' } });
    await fireEvent.input(names[1], { target: { value: 'Pull' } });

    // Push: two chest exercises
    let dlg = await openPicker('Push', 'Chest');
    await click(within(dlg).getByRole('button', { name: /Machine chest press/ }));
    await click(within(dlg).getByRole('button', { name: /Push-up/ }));
    // an exercise already added cannot be added twice
    expect(within(dlg).getByRole('button', { name: /Machine chest press/ }).hasAttribute('disabled')).toBe(true);
    await click(within(dlg).getByRole('button', { name: 'Done' }));

    // Pull: a back exercise
    dlg = await openPicker('Pull', 'Back');
    await click(within(dlg).getByRole('button', { name: /Lat pulldown wide/ }));
    await click(within(dlg).getByRole('button', { name: 'Done' }));

    // Session 3: a brand-new exercise through the existing form
    await click(btn('Add exercise to Session 3'));
    dlg = screen.getByRole('dialog', { name: 'Add exercise' });
    await click(within(dlg).getByRole('button', { name: 'Add a new exercise' }));
    const form = screen.getByRole('dialog', { name: 'Add a new exercise' });
    await fireEvent.input(within(form).getByLabelText('Name'), { target: { value: 'Pec deck 2' } });
    await click(within(form).getByRole('button', { name: 'Add exercise' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Add exercise' })).toBeTruthy());
    await click(within(screen.getByRole('dialog', { name: 'Add exercise' })).getByRole('button', { name: 'Done' }));
    const custom = (await getAll<Exercise>('customExercises'))[0];
    expect(custom.name).toBe('Pec deck 2');
    expect(within(screen.getByRole('article', { name: 'Session 3' })).getByText('Pec deck 2')).toBeTruthy();

    // reorder Push: push-up above the chest press
    await click(btn('Move Push-up up'));
    const push = screen.getByRole('article', { name: 'Session 1' });
    expect(within(push).getAllByRole('listitem').map((li) => li.querySelector('.nm')!.textContent)).toEqual(['Push-up', 'Machine chest press']);
    expect(within(push).getByRole('button', { name: 'Move Push-up up' }).hasAttribute('disabled')).toBe(true);
    // remove an exercise, then add it back is not needed: remove session 3 entirely
    await click(within(push).getByRole('button', { name: 'Remove Machine chest press' }));
    expect(within(push).getAllByRole('listitem')).toHaveLength(1);
    expect(btn('Continue').hasAttribute('disabled')).toBe(false);
    await click(btn('Remove session Session 3'));
    expect(screen.getAllByLabelText('Session name')).toHaveLength(2);
    await next();

    expect(heading()).toBe('Your week');
    const rows = within(screen.getByRole('list', { name: 'Your week' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['MondayPush', 'WednesdayPull', 'FridayPush']);
    await click(btn('Start'));
    await waitFor(() => expect(onfinish).toHaveBeenCalled());
    const s = await loadSettings();
    expect(s.plan).toMatchObject({ id: 'custom', name: 'My plan', days: [1, 3, 5], weeklyTarget: 3 });
    expect(s.plan!.sessions.map((x) => x.name)).toEqual(['Push', 'Pull']);
    expect(s.plan!.sessions[0].items).toEqual([{ exerciseId: 'push-up', sets: 3 }]);
    expect(s.plan!.sessions[1].items).toEqual([{ exerciseId: 'lat-pulldown-wide', sets: 3 }]);
    expect(new Set(s.plan!.sessions.map((x) => x.id)).size).toBe(2);
    expect(s.plan!.sessions[0].id).toMatch(/^c-/);
  });

  it('a blank session name falls back to its default', async () => {
    setup();
    await next();
    await click(radio(/Build my own/));
    await next();
    await click(btn('Remove session Session 2'));
    await click(btn('Remove session Session 3'));
    const [input] = screen.getAllByLabelText('Session name') as HTMLInputElement[];
    await fireEvent.input(input, { target: { value: '   ' } });
    const dlg = await openPicker('Session 1', 'Quads');
    await click(within(dlg).getByRole('button', { name: /Goblet squat/ }));
    await click(within(dlg).getByRole('button', { name: 'Done' }));
    await next();
    expect(within(screen.getByRole('list', { name: 'Your week' })).getAllByRole('listitem')[0].textContent).toBe('MondaySession 1');
  });
});

describe('App: first run and migration', () => {
  it('an empty install shows the setup instead of Home, with no nav', async () => {
    const { container } = render(App);
    expect(await screen.findByRole('heading', { name: 'How many days a week?' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(container.querySelector('main')).toBeTruthy();
  });

  it('finishing the setup lands on Home with her plan, a plain greeting and the days note', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 12, 8, 30)); // Thursday
    render(App);
    await screen.findByRole('heading', { name: 'How many days a week?' });
    await next();
    await next();
    await click(btn('Start'));
    expect(await screen.findByRole('heading', { name: 'Full body A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Morning');
    expect(screen.getByText('Rest day · next training day is Friday')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.queryByText(/Vik/)).toBeNull();
    expect(location.hash).toBe('#/');
    vi.useRealTimers();
  });

  it('an install that already has data goes straight to Home as Vik, with his six sessions', async () => {
    const w: W = { id: 'w1', date: '2026-11-09', sessionId: 'CB-A', startedAt: Date.now() - 86_400_000 * 3, endedAt: Date.now() - 86_400_000 * 3 + 3_600_000, swaps: {} };
    await put('workouts', w);
    const s: SetLog = { id: 's1', workoutId: 'w1', date: w.date, sessionId: 'CB-A', exerciseId: 'smith-flat-press', setNo: 1, kg: 20, reps: 10, warmup: false, feltIt: false, doneAt: w.startedAt, updatedAt: w.startedAt, deleted: false, synced: true };
    await put('sets', s);
    render(App);
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/, Vik$/);
    expect(screen.queryByRole('heading', { name: 'How many days a week?' })).toBeNull();
    await waitFor(async () => expect((await loadSettings()).plan?.id).toBe('vik'));
    await click(btn('Swap day'));
    expect(screen.getByText('Pick any of your six sessions')).toBeTruthy();
    expect(screen.queryByText(/training day/)).toBeNull(); // Vik's Home has no days note
  });

  it('Settings -> Change plan route reopens the setup for an existing install', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, plan: fullBodyPlan([1, 3, 5]), userName: '' });
    location.hash = '#/setup';
    render(App);
    expect(await screen.findByRole('heading', { name: 'How many days a week?' })).toBeTruthy();
    await click(btn('Back'));
    expect(location.hash).toBe('#/settings');
  });
});

describe('App: existing users and errors', () => {
  const vikFile = () => {
    const at = new Date(2026, 10, 9, 7, 0).getTime();
    const body = {
      app: 'gym-tracker', format: 1, exportedAt: '2026-11-10T00:00:00Z', customExercises: [],
      workouts: [{ id: 'w1', date: '2026-11-09', sessionId: 'CB-A', startedAt: at, endedAt: at + 3_600_000, swaps: {} }],
      sets: [{ id: 's1', workoutId: 'w1', date: '2026-11-09', sessionId: 'CB-A', exerciseId: 'smith-flat-press', setNo: 1, kg: 20, reps: 10, warmup: false, feltIt: false, doneAt: at, updatedAt: at, deleted: false, synced: true }],
      settings: { ...DEFAULT_SETTINGS, userName: 'Vik', weeklyTarget: 6 },
    };
    const file = new File([JSON.stringify(body)], 'gym-backup.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(body) });
    return file;
  };

  it('the first step has an exit for people who already use the app', async () => {
    const { container } = render(App);
    await click(await screen.findByRole('button', { name: /I already use this app/ }));
    expect(await screen.findByRole('heading', { name: 'Restore your data' })).toBeTruthy();
    expect(screen.getByLabelText('Backup file')).toBeTruthy();
    expect(screen.getByLabelText('Web app URL')).toBeTruthy();
    expect(container.querySelector('nav')).toBeNull();
    await click(btn('Back'));
    expect(await screen.findByRole('heading', { name: 'How many days a week?' })).toBeTruthy();
  });

  it('wiped phone -> restore a backup -> no setup, Home as Vik with his name', async () => {
    render(App);
    await click(await screen.findByRole('button', { name: /I already use this app/ }));
    await fireEvent.change(await screen.findByLabelText('Backup file'), { target: { files: [vikFile()] } });
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/, Vik$/);
    expect(screen.queryByRole('heading', { name: 'How many days a week?' })).toBeNull();
    const s = await loadSettings();
    expect(s.plan?.id).toBe('vik');
    expect(s.userName).toBe('Vik');
    expect(location.hash).toBe('#/');
  });

  it('a backup with no name (older file) still comes back as Vik', async () => {
    const text = JSON.parse(await (vikFile() as unknown as { text(): Promise<string> }).text());
    delete text.settings.userName;
    const file = new File(['x'], 'old.json');
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(text) });
    render(App);
    await click(await screen.findByRole('button', { name: /I already use this app/ }));
    await fireEvent.change(await screen.findByLabelText('Backup file'), { target: { files: [file] } });
    expect(await screen.findByRole('button', { name: 'Start workout' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/, Vik$/);
  });

  it('a backup with nothing in it stays on the restore screen and says so', async () => {
    const empty = new File(['x'], 'e.json');
    Object.defineProperty(empty, 'text', { value: async () => JSON.stringify({ app: 'gym-tracker', format: 1, sets: [], workouts: [], customExercises: [] }) });
    render(App);
    await click(await screen.findByRole('button', { name: /I already use this app/ }));
    await fireEvent.change(await screen.findByLabelText('Backup file'), { target: { files: [empty] } });
    expect(await screen.findByText(/nothing to restore/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Restore your data' })).toBeTruthy();
  });

  it('if the data cannot be read, an error with Try again is shown, never Vik\'s Home', async () => {
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new Error('no storage'); });
    render(App);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/Vik/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
    open.mockRestore();
    await click(btn('Try again'));
    expect(await screen.findByRole('heading', { name: 'How many days a week?' })).toBeTruthy();
  });
});

describe('First time on an exercise', () => {
  it('bodyweight: dead bug set 1 is one tap at 0 kg', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, plan: fullBodyPlan([1, 3, 5]) });
    await workout.restore();
    await workout.startWorkout('fb-b', Date.now());
    render(Workout);
    const card = await screen.findByRole('article', { name: 'Dead bug' });
    await click(within(card).getByRole('button', { name: 'Complete set 1' }));
    await waitFor(() => expect(workout.sets.filter((s) => s.exerciseId === 'dead-bug')).toHaveLength(1));
    expect(workout.sets.find((s) => s.exerciseId === 'dead-bug')).toMatchObject({ kg: 0, reps: 10 });
    expect(screen.queryByRole('dialog', { name: /Dead bug/ })).toBeNull();
  });

  it('the weight is blank: set 1 asks once, then sets 2 and 3 are one tap', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, plan: fullBodyPlan([1, 3, 5]), userName: '' });
    await workout.restore();
    await workout.startWorkout('fb-a', Date.now());
    render(Workout);
    const card = await screen.findByRole('article', { name: 'Leg press' });
    // set 1: nothing to repeat yet, so the sheet opens
    await click(within(card).getByRole('button', { name: 'Complete set 1' }));
    const dlg = await screen.findByRole('dialog', { name: /Leg press · set 1/ });
    expect(dlg.textContent).toContain('No history yet');
    for (let i = 0; i < 8; i++) await click(within(dlg).getByRole('button', { name: 'More weight' })); // 8 x 2.5 kg
    expect(within(dlg).getByTestId('adjust-kg').textContent).toBe('20');
    await click(within(dlg).getByRole('button', { name: 'Save set' }));
    await waitFor(() => expect(workout.sets).toHaveLength(1));
    expect(workout.sets[0]).toMatchObject({ kg: 20, reps: 8, setNo: 1 });
    // set 2 is pre-filled from set 1: one tap, no sheet
    await click(within(card).getByRole('button', { name: 'Complete set 2' }));
    await waitFor(() => expect(workout.sets).toHaveLength(2));
    expect(workout.sets[1]).toMatchObject({ kg: 20, reps: 8, setNo: 2 });
    expect(screen.queryByRole('dialog', { name: /set 2/ })).toBeNull();
  });
});
