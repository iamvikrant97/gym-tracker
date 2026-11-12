import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { closeDb, loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import { exportAll, restoreBackup } from '../src/lib/backup';
import { cleanGreetName, greetingFor, GREET_MAX, sanitizeGreetNames } from '../src/lib/greeting';
import { setActivePlan, setRetiredNames } from '../src/lib/activePlan.svelte';
import { fullBodyPlan } from '../src/lib/seed';
import { _resetSyncState } from '../src/lib/sync';
import { workout } from '../src/lib/workout.svelte';
import Home from '../src/screens/Home.svelte';
import Settings from '../src/screens/Settings.svelte';
import Setup from '../src/screens/Setup.svelte';

const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m);

describe('greetingFor: word by hour', () => {
  it.each([
    [0, 'Morning'], [5, 'Morning'], [6, 'Morning'], [11, 'Morning'], [12, 'Afternoon'], [16, 'Afternoon'],
    [17, 'Evening'], [20, 'Evening'], [21, 'Night'], [23, 'Night'],
  ])('hour %i is %s', (h, word) => {
    expect(greetingFor(h, undefined, undefined).word).toBe(word);
  });
  it('boundaries at 11:59, 12:00, 16:59, 17:00, 20:59, 21:00', () => {
    const w = (d: Date) => greetingFor(d.getHours(), undefined, undefined).word;
    expect([at(11, 59), at(12, 0), at(16, 59), at(17, 0), at(20, 59), at(21, 0)].map(w)).toEqual([
      'Morning', 'Afternoon', 'Afternoon', 'Evening', 'Evening', 'Night',
    ]);
  });
});

describe('greetingFor: which name', () => {
  const names = { afternoon: 'Minal', morning: 'cutie', night: 'Cutiechan' };
  it('uses the name for the slot, else the main name, else none', () => {
    expect(greetingFor(9, 'Minal', names).text).toBe('Morning, cutie');
    expect(greetingFor(13, 'Minal', names).text).toBe('Afternoon, Minal');
    expect(greetingFor(18, 'Minal', names).text).toBe('Evening, Minal'); // no evening name -> userName
    expect(greetingFor(22, 'Minal', names).text).toBe('Night, Cutiechan');
    expect(greetingFor(18, undefined, names).text).toBe('Evening'); // nothing -> plain greeting
    expect(greetingFor(9, '', undefined).text).toBe('Morning');
  });
  it('Vik with no custom names: unchanged', () => {
    expect(greetingFor(8, 'Vik', undefined).text).toBe('Morning, Vik');
    expect(greetingFor(14, 'Vik', {}).text).toBe('Afternoon, Vik');
    expect(greetingFor(19, 'Vik', undefined).text).toBe('Evening, Vik');
  });
  it('blank or whitespace slot names fall back', () => {
    expect(greetingFor(9, 'Vik', { morning: '   ' }).text).toBe('Morning, Vik');
  });
  it('cleans names: trims, caps length, plain strings only', () => {
    expect(cleanGreetName('  Minal  ')).toBe('Minal');
    expect(cleanGreetName('x'.repeat(50))).toHaveLength(GREET_MAX);
    expect(cleanGreetName(42)).toBe('');
    expect(sanitizeGreetNames({ morning: ' a ', evening: 7, junk: 'z', night: '' })).toEqual({ morning: 'a' });
    expect(sanitizeGreetNames('nope')).toBeUndefined();
    expect(sanitizeGreetNames({})).toBeUndefined();
  });
});

beforeEach(async () => {
  await closeDb(true);
  _resetSyncState();
  setActivePlan(null);
  setRetiredNames(undefined);
  workout.settings = null;
  workout.current = null;
  workout.sets = [];
  workout.ready = true;
  location.hash = '';
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  setActivePlan(null);
  vi.restoreAllMocks();
});

const clock = (h: number, m = 0) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(h, m));
};
const h1 = () => screen.getByRole('heading', { level: 1 }).textContent;

describe('Home greeting', () => {
  it("Vik's install is unchanged", async () => {
    clock(8, 30);
    render(Home);
    await waitFor(() => expect(h1()).toBe('Morning, Vik'));
  });
  it('shows the per-time name, falling back to userName', async () => {
    const plan = fullBodyPlan([1, 3, 5]);
    setActivePlan(plan);
    await saveSettings({ ...DEFAULT_SETTINGS, plan, userName: 'Minal', greetNames: { morning: 'cutie', night: 'Cutiechan' } });
    clock(9);
    const r = render(Home);
    await waitFor(() => expect(h1()).toBe('Morning, cutie'));
    r.unmount();
    clock(15);
    render(Home);
    await waitFor(() => expect(h1()).toBe('Afternoon, Minal'));
  });
  it('renders names as plain text', async () => {
    const plan = fullBodyPlan([1, 3, 5]);
    setActivePlan(plan);
    await saveSettings({ ...DEFAULT_SETTINGS, plan, greetNames: { morning: '<b>x</b>' } });
    clock(9);
    const { container } = render(Home);
    await waitFor(() => expect(h1()).toBe('Morning, <b>x</b>'));
    expect(container.querySelector('h1 b')).toBeNull();
  });
});

describe('Settings: Greeting card', () => {
  it('saves the name and per-time names on change, trims, and previews today', async () => {
    clock(9);
    const plan = fullBodyPlan([1, 3, 5]);
    setActivePlan(plan);
    await saveSettings({ ...DEFAULT_SETTINGS, plan });
    render(Settings);
    const card = await screen.findByRole('article', { name: 'Greeting' });
    expect(within(card).getByTestId('greet-preview').textContent).toBe('Morning');
    const name = within(card).getByLabelText('Your name');
    await fireEvent.input(name, { target: { value: '  Minal ' } });
    await fireEvent.change(name);
    await waitFor(() => expect(within(card).getByTestId('greet-preview').textContent).toBe('Morning, Minal'));
    const morning = within(card).getByLabelText('Morning name');
    expect((morning as HTMLInputElement).placeholder).toMatch(/morning/i);
    await fireEvent.input(morning, { target: { value: ' cutie ' } });
    await fireEvent.change(morning);
    await fireEvent.input(within(card).getByLabelText('Night name'), { target: { value: 'Cutiechan' } });
    await fireEvent.change(within(card).getByLabelText('Night name'));
    expect(within(card).getByLabelText('Afternoon name')).toBeTruthy();
    expect(within(card).getByLabelText('Evening name')).toBeTruthy();
    await waitFor(() => expect(within(card).getByTestId('greet-preview').textContent).toBe('Morning, cutie'));
    const s = await loadSettings();
    expect(s.userName).toBe('Minal');
    expect(s.greetNames).toEqual({ morning: 'cutie', night: 'Cutiechan' });
    // clearing one removes it
    await fireEvent.input(morning, { target: { value: '' } });
    await fireEvent.change(morning);
    await waitFor(async () => expect((await loadSettings()).greetNames).toEqual({ night: 'Cutiechan' }));
  });
  it('caps the field length', async () => {
    const plan = fullBodyPlan([1, 3, 5]);
    setActivePlan(plan);
    await saveSettings({ ...DEFAULT_SETTINGS, plan });
    render(Settings);
    const card = await screen.findByRole('article', { name: 'Greeting' });
    expect(within(card).getByLabelText('Your name').getAttribute('maxlength')).toBe(String(GREET_MAX));
  });
});

describe('Setup: name', () => {
  const setup = () => render(Setup, { props: { onfinish: vi.fn(), oncancel: vi.fn() } });
  it('first step has an optional name field that saves userName', async () => {
    const onfinish = vi.fn();
    render(Setup, { props: { onfinish } });
    const f = screen.getByLabelText(/What should I call you/) as HTMLInputElement;
    await fireEvent.input(f, { target: { value: '  Minal ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(onfinish).toHaveBeenCalled());
    expect((await loadSettings()).userName).toBe('Minal');
  });
  it('is not required: Continue works with it empty', () => {
    setup();
    expect(screen.getByLabelText(/What should I call you/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('backup', () => {
  it('greetNames round-trips; junk in a file is dropped', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, userName: 'Minal', greetNames: { morning: 'cutie', night: 'Cutiechan' } });
    const json = JSON.stringify(await exportAll(Date.now()));
    expect(json).toContain('Cutiechan');
    await closeDb(true);
    await restoreBackup(json);
    const s = await loadSettings();
    expect(s.userName).toBe('Minal');
    expect(s.greetNames).toEqual({ morning: 'cutie', night: 'Cutiechan' });

    await closeDb(true);
    const bad = JSON.parse(json);
    bad.settings.greetNames = { morning: 5, evening: ' eve ', night: 'n'.repeat(60), other: 'x' };
    await restoreBackup(bad);
    const t = await loadSettings();
    expect(t.greetNames).toEqual({ evening: 'eve', night: 'n'.repeat(GREET_MAX) });
  });
});
