import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { setActivePlan, setRetiredNames } from '../src/lib/activePlan.svelte';
import { closeDb, getAll, loadSettings, put, saveSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import { PLAN_CARDS, planHintDue, suggestedPlanFor } from '../src/lib/planSetup';
import {
  EXERCISES, FULLBODY_SESSIONS, PPL_SESSIONS, TEMPLATES, UPPERLOWER_SESSIONS, VIK_PLAN,
  currentPlan, exerciseById, newUserRange, planFromTemplate, sessionName,
} from '../src/lib/seed';
import { nextInPlan, weekSchedule } from '../src/lib/selection';
import { workout } from '../src/lib/workout.svelte';
import Home from '../src/screens/Home.svelte';
import Setup from '../src/screens/Setup.svelte';
import type { Plan, SetLog, Workout } from '../src/lib/types';

const click = (el: HTMLElement) => fireEvent.click(el);
const radio = (name: string | RegExp) => screen.getByRole('radio', { name });
const btn = (name: string | RegExp) => screen.getByRole('button', { name });
const next = () => click(btn('Continue'));
const rows = () => within(screen.getByRole('list', { name: 'Your week' })).getAllByRole('listitem').map((li) => li.textContent);
const cards = () => screen.getAllByRole('radio').map((r) => r.querySelector('.nm')?.textContent);
const suggested = () => screen.getAllByRole('radio').filter((r) => r.textContent?.includes('Suggested for you')).map((r) => r.querySelector('.nm')?.textContent);

const day = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
let n = 0;
/** A finished workout with one working set. */
function wk(sessionId: string, date: string, opts: { sets?: boolean; warmup?: boolean } = {}): { w: Workout; s: SetLog[] } {
  n++;
  const [y, m, d] = date.split('-').map(Number);
  const startedAt = new Date(y, m - 1, d, 8).getTime();
  const w: Workout = { id: `w${n}`, date, sessionId, startedAt, endedAt: startedAt + 3_600_000, swaps: {} };
  const s: SetLog[] =
    opts.sets === false
      ? []
      : [{
          id: `s${n}`, workoutId: w.id, date, sessionId, exerciseId: 'leg-press', setNo: 1, kg: 40, reps: 10,
          warmup: !!opts.warmup, feltIt: false, doneAt: startedAt + 60_000, updatedAt: startedAt + 60_000, deleted: false, synced: true,
        }];
  return { w, s };
}
const store = async (list: { w: Workout; s: SetLog[] }[]) => {
  for (const { w, s } of list) {
    await put('workouts', w);
    for (const x of s) await put('sets', x);
  }
};

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
  n = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setActivePlan(null);
  setRetiredNames(undefined);
  vi.restoreAllMocks();
});

describe('template contents', () => {
  const all: [string, typeof UPPERLOWER_SESSIONS][] = [['Upper/Lower', UPPERLOWER_SESSIONS], ['Push/Pull/Legs', PPL_SESSIONS]];

  it('Upper/Lower has Upper A, Lower A, Upper B, Lower B; PPL has Push A, Pull A, Legs A, Push B, Pull B, Legs B', () => {
    expect(UPPERLOWER_SESSIONS.map((s) => s.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(PPL_SESSIONS.map((s) => s.name)).toEqual(['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']);
    // ids are unique across every built-in template, so history never mixes up two plans
    const ids = [...FULLBODY_SESSIONS, ...UPPERLOWER_SESSIONS, ...PPL_SESSIONS, ...TEMPLATES].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(all)('%s: 5-6 distinct exercises per session, all in the library, sensible rep ranges', (_name, sessions) => {
    for (const t of sessions) {
      expect(t.items.length, t.name).toBeGreaterThanOrEqual(5);
      expect(t.items.length, t.name).toBeLessThanOrEqual(6);
      expect(new Set(t.items.map((i) => i.exerciseId)).size, t.name).toBe(t.items.length);
      for (const i of t.items) {
        const ex = exerciseById(i.exerciseId);
        expect(ex, `${t.name}: ${i.exerciseId}`).toBeDefined();
        expect(i.sets).toBeGreaterThanOrEqual(2);
        expect(i.sets).toBeLessThanOrEqual(3);
        // compounds 8-12, isolation 10-15 (same defaults as Full body)
        const want = ex!.kind === 'compound' ? { repMin: 8, repMax: 12 } : { repMin: 10, repMax: 15 };
        expect({ repMin: i.repMin, repMax: i.repMax }, `${t.name}: ${i.exerciseId}`).toEqual(want);
        expect(newUserRange(i.exerciseId)).toEqual(want);
      }
    }
  });

  it('Upper sessions train the upper body only, Lower the legs, and PPL splits push / pull / legs', () => {
    const muscles = (id: string, list: typeof PPL_SESSIONS) => new Set(list.find((s) => s.id === id)!.items.map((i) => exerciseById(i.exerciseId)!.muscle));
    const upper = new Set(['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps']);
    const lower = new Set(['Quads', 'Hamstrings', 'Calves', 'Abs']);
    for (const s of UPPERLOWER_SESSIONS) {
      const set = muscles(s.id, UPPERLOWER_SESSIONS);
      const pool = s.name.startsWith('Upper') ? upper : lower;
      expect([...set].every((m) => pool.has(m)), s.name).toBe(true);
    }
    const push = new Set(['Chest', 'Shoulders', 'Triceps']);
    const pull = new Set(['Back', 'Biceps', 'Shoulders']);
    for (const s of PPL_SESSIONS) {
      const set = muscles(s.id, PPL_SESSIONS);
      const pool = s.name.startsWith('Push') ? push : s.name.startsWith('Pull') ? pull : lower;
      expect([...set].every((m) => pool.has(m)), s.name).toBe(true);
    }
  });

  it("Vik's plan and the library slots he uses are unchanged", () => {
    expect(VIK_PLAN.sessions.map((s) => s.id)).toEqual(['CB-A', 'L-A', 'SA-A', 'CB-B', 'L-B', 'SA-B']);
    expect(VIK_PLAN.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(exerciseById('leg-press')!.slot).toBe('Leg press');
    expect(EXERCISES.filter((e) => e.slot === 'Leg press').map((e) => e.id)).toEqual(['leg-press', 'leg-press-feet-high']);
  });

  it('planFromTemplate builds each plan with the given days and a weekly target equal to the days', () => {
    expect(planFromTemplate('upperlower', [1, 2, 4, 5])).toMatchObject({ id: 'upperlower', name: 'Upper/Lower', days: [1, 2, 4, 5], weeklyTarget: 4 });
    expect(planFromTemplate('ppl', [1, 3, 5])).toMatchObject({ id: 'ppl', name: 'Push/Pull/Legs', days: [1, 3, 5], weeklyTarget: 3 });
    expect(planFromTemplate('fullbody', [1, 4]).sessions.map((s) => s.id)).toEqual(['fb-a', 'fb-b']);
    // a copy: editing a plan never changes the template
    const p = planFromTemplate('ppl', [1, 3, 5]);
    p.sessions[0].items[0].sets = 99;
    expect(PPL_SESSIONS[0].items[0].sets).not.toBe(99);
  });

  it('session names are known for old sets even when the plan was never active', () => {
    expect(sessionName('ul-upper-a')).toBe('Upper A');
    expect(sessionName('ppl-legs-b')).toBe('Legs B');
  });
});

describe('suggestion by days a week', () => {
  it.each([[2, 'fullbody'], [3, 'fullbody'], [4, 'upperlower'], [5, 'ppl'], [6, 'ppl'], [7, 'ppl']] as const)('%i days -> %s', (count, id) => {
    expect(suggestedPlanFor(count)).toBe(id);
  });

  it('cards are described: name, days it suits, who it is for', () => {
    expect(PLAN_CARDS.map((c) => c.name)).toEqual(['Full body A/B', 'Upper/Lower', 'Push/Pull/Legs', "Vik's split", 'Build my own']);
    const fit = Object.fromEntries(PLAN_CARDS.map((c) => [c.id, c.fit]));
    expect(fit.fullbody).toBe('Best for starting or 2–3 days');
    expect(fit.upperlower).toBe('4 days, more volume per muscle');
    expect(fit.ppl).toBe('3–6 days, for people comfortable training often');
    expect(fit.vik).toBeTruthy();
  });
});

describe('Setup: choose a plan', () => {
  function setup(props: { firstRun?: boolean } = {}) {
    const onfinish = vi.fn();
    render(Setup, { props: { onfinish, oncancel: vi.fn(), ...props } });
    return { onfinish };
  }

  it('shows the five cards in order, each with its days and who it is for', async () => {
    setup();
    await next();
    expect(cards()).toEqual(['Full body A/B', 'Upper/Lower', 'Push/Pull/Legs', "Vik's split", 'Build my own']);
    expect(radio(/Full body A\/B/).textContent).toContain('Best for starting or 2–3 days');
    expect(radio(/Upper\/Lower/).textContent).toContain('4 days, more volume per muscle');
    expect(radio(/Push\/Pull\/Legs/).textContent).toContain('3–6 days, for people comfortable training often');
    expect(radio(/Vik's split/).textContent).toMatch(/4.6 days/);
  });

  it('2 or 3 days: Full body is highlighted and chosen already', async () => {
    for (const c of [2, 3]) {
      cleanup();
      setup();
      await click(radio(String(c)));
      await next();
      expect(suggested()).toEqual(['Full body A/B']);
      expect(radio(/Full body A\/B/).getAttribute('aria-checked')).toBe('true');
    }
  });

  it('4 days highlights Upper/Lower, 5 to 7 days highlight Push/Pull/Legs; nothing is chosen for you', async () => {
    for (const [c, name] of [[4, 'Upper/Lower'], [5, 'Push/Pull/Legs'], [6, 'Push/Pull/Legs'], [7, 'Push/Pull/Legs']] as const) {
      cleanup();
      setup();
      await click(radio(String(c)));
      await next();
      expect(suggested()).toEqual([name]);
      expect(screen.getAllByRole('radio').some((r) => r.getAttribute('aria-checked') === 'true')).toBe(false);
      expect(btn('Continue').hasAttribute('disabled')).toBe(true);
    }
  });

  it('the highlight follows the days when going back and changing them', async () => {
    setup();
    await click(radio('4'));
    await next();
    await click(btn('Back'));
    await click(radio('6'));
    await next();
    expect(suggested()).toEqual(['Push/Pull/Legs']);
  });

  it('any plan can be picked whatever the days: PPL on 3 days is Push, Pull, Legs on Mon / Wed / Fri, then carries on', async () => {
    const { onfinish } = setup();
    await next();
    await click(radio(/Push\/Pull\/Legs/));
    await next();
    expect(rows()).toEqual(['MondayPush A', 'WednesdayPull A', 'FridayLegs A']);
    expect(screen.getByText(/next week carries on where this one stops/)).toBeTruthy();
    await click(btn('Start'));
    await waitFor(() => expect(onfinish).toHaveBeenCalled());
    const s = await loadSettings();
    expect(s.plan).toMatchObject({ id: 'ppl', name: 'Push/Pull/Legs', days: [1, 3, 5], weeklyTarget: 3 });
    expect(s.plan!.sessions.map((x) => x.name)).toEqual(['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']);
    expect(currentPlan().id).toBe('ppl');
  });

  it('PPL on 6 days is one full cycle a week', async () => {
    setup();
    await click(radio('6'));
    await next();
    await click(radio(/Push\/Pull\/Legs/));
    await next();
    expect(rows()).toEqual(['MondayPush A', 'TuesdayPull A', 'WednesdayLegs A', 'ThursdayPush B', 'FridayPull B', 'SaturdayLegs B']);
    expect(screen.queryByText(/carries on/)).toBeNull();
  });

  it('Upper/Lower on 4 days (Mon Tue Thu Fri) is stored with its four sessions', async () => {
    const { onfinish } = setup();
    await click(radio('4'));
    await next();
    await click(radio(/Upper\/Lower/));
    await next();
    expect(rows()).toEqual(['MondayUpper A', 'TuesdayLower A', 'ThursdayUpper B', 'FridayLower B']);
    expect(screen.queryByText(/carries on/)).toBeNull();
    await click(btn('Start'));
    await waitFor(() => expect(onfinish).toHaveBeenCalled());
    const s = await loadSettings();
    expect(s.plan).toMatchObject({ id: 'upperlower', days: [1, 2, 4, 5], weeklyTarget: 4 });
    expect(s.plan!.sessions.map((x) => x.id)).toEqual(UPPERLOWER_SESSIONS.map((x) => x.id));
    expect(s.weeklyTarget).toBe(4);
  });

  it('Upper/Lower on 3 days rotates through all four sessions', async () => {
    setup();
    await next();
    await click(radio(/Upper\/Lower/));
    await next();
    expect(rows()).toEqual(['MondayUpper A', 'WednesdayLower A', 'FridayUpper B']);
    expect(screen.getByText(/next week carries on where this one stops/)).toBeTruthy();
  });

  it('Change plan from Settings offers the same cards', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, userName: 'Minal', plan: planFromTemplate('fullbody', [1, 3, 5]), weeklyTarget: 3 });
    await workout.restore();
    setup({ firstRun: false });
    await next();
    expect(cards()).toEqual(['Full body A/B', 'Upper/Lower', 'Push/Pull/Legs', "Vik's split", 'Build my own']);
  });
});

describe('rotation across consecutive visits', () => {
  /** Trains the next session on each given date and returns the names in order. */
  function visits(plan: Plan, dates: string[], done: Workout[] = []): string[] {
    const out: string[] = [];
    for (const date of dates) {
      const id = nextInPlan(plan, done);
      out.push(plan.sessions.find((t) => t.id === id)!.name);
      done.push(wk(id, date).w);
    }
    return out;
  }
  const dates = (count: number) => Array.from({ length: count }, (_, i) => day(2026, 10, 1 + i));

  it('Upper/Lower, 4 days a week: the same A/B pattern every week', () => {
    expect(visits(planFromTemplate('upperlower', [1, 2, 4, 5]), dates(8))).toEqual(
      ['Upper A', 'Lower A', 'Upper B', 'Lower B', 'Upper A', 'Lower A', 'Upper B', 'Lower B'],
    );
  });

  it('Upper/Lower, 3 days a week: rotates, so A and B swap places the next week', () => {
    const plan = planFromTemplate('upperlower', [1, 3, 5]);
    expect(weekSchedule(plan).map((r) => r.session.name)).toEqual(['Upper A', 'Lower A', 'Upper B']);
    expect(visits(plan, dates(6))).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B', 'Upper A', 'Lower A']);
  });

  it('PPL, 3 days a week: Push A, Pull A, Legs A one week, the B versions the next, then A again', () => {
    expect(visits(planFromTemplate('ppl', [1, 3, 5]), dates(7))).toEqual(
      ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B', 'Push A'],
    );
  });

  it('PPL, 6 days a week: a 6-session cycle that repeats', () => {
    const plan = planFromTemplate('ppl', [1, 2, 3, 4, 5, 6]);
    expect(visits(plan, dates(12))).toEqual([...PPL_SESSIONS.map((s) => s.name), ...PPL_SESSIONS.map((s) => s.name)]);
  });

  it('a missed day never skips a session, and a session of an older plan is ignored', () => {
    const plan = planFromTemplate('ppl', [1, 3, 5]);
    const done = [wk('fb-b', day(2026, 11, 1)).w, wk('ppl-push-a', day(2026, 11, 2)).w];
    expect(plan.sessions.find((t) => t.id === nextInPlan(plan, done))!.name).toBe('Pull A');
    expect(plan.sessions.find((t) => t.id === nextInPlan(plan, [wk('fb-b', day(2026, 11, 1)).w]))!.name).toBe('Push A');
  });

  it('Home picks up where the last workout left off (Upper/Lower)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 12, 8, 30));
    const plan = planFromTemplate('upperlower', [1, 2, 4, 5]);
    setActivePlan(plan);
    await saveSettings({ ...DEFAULT_SETTINGS, plan, userName: 'Minal', weeklyTarget: 4 });
    await store([wk('ul-upper-a', day(2026, 11, 9)), wk('ul-lower-a', day(2026, 11, 10))]);
    render(Home);
    expect(await screen.findByRole('heading', { name: 'Upper B' })).toBeTruthy();
    expect(screen.getByText(/Today · session 3 of 4/)).toBeTruthy();
  });
});

describe('switching plans keeps history', () => {
  it('Full body -> Upper/Lower -> PPL: every set and workout is kept, and old sessions keep their names', async () => {
    const fb = planFromTemplate('fullbody', [1, 3, 5]);
    setActivePlan(fb);
    await saveSettings({ ...DEFAULT_SETTINGS, userName: 'Minal', plan: fb, weeklyTarget: 3 });
    await store([wk('fb-a', day(2026, 11, 2)), wk('fb-b', day(2026, 11, 4))]);
    await workout.restore();

    const change = async (label: RegExp) => {
      cleanup();
      const onfinish = vi.fn();
      render(Setup, { props: { firstRun: false, onfinish, oncancel: vi.fn() } });
      await next();
      await click(radio(label));
      await next();
      await click(btn('Start'));
      await waitFor(() => expect(onfinish).toHaveBeenCalled());
    };
    await change(/Upper\/Lower/);
    expect(currentPlan().id).toBe('upperlower');
    await store([wk('ul-upper-a', day(2026, 11, 9))]);
    await change(/Push\/Pull\/Legs/);
    expect(currentPlan().id).toBe('ppl');

    expect((await getAll('workouts')).length).toBe(3);
    expect((await getAll('sets')).length).toBe(3);
    const s = await loadSettings();
    expect(s.retiredSessions).toMatchObject({ 'fb-a': 'Full body A', 'fb-b': 'Full body B', 'ul-upper-a': 'Upper A', 'ul-lower-b': 'Lower B' });
    expect(sessionName('fb-a')).toBe('Full body A');
    expect(sessionName('ul-upper-a')).toBe('Upper A');
    // the new plan starts from its first session: older workouts do not count toward its rotation
    expect(nextInPlan(currentPlan(), await getAll<Workout>('workouts'))).toBe('ppl-push-a');
  });
});

describe('Home hint after 8 weeks on a plan', () => {
  const HINT = 'Ready to change things up? Settings → Training plan';
  const mondays = (count: number, from = new Date(2026, 10, 9)) =>
    Array.from({ length: count }, (_, i) => {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 7 * i);
      return day(d.getFullYear(), d.getMonth() + 1, d.getDate());
    });
  const plan = planFromTemplate('upperlower', [1, 2, 4, 5]);

  describe('planHintDue', () => {
    it('needs 8 different weeks with sets on the current plan', () => {
      const w = (dates: string[]) => dates.map((d) => wk('ul-upper-a', d));
      const due = (list: { w: Workout; s: SetLog[] }[]) => planHintDue(plan, list.map((x) => x.w), list.flatMap((x) => x.s));
      expect(due(w(mondays(7)))).toBe(false);
      expect(due(w(mondays(8)))).toBe(true);
      expect(due(w(mondays(12)))).toBe(true);
      // two workouts in one week are one week
      expect(due([...w(mondays(7)), wk('ul-lower-a', day(2026, 11, 10))])).toBe(false);
      // different days of the same week (Mon-Sun) count once
      expect(due([...w(mondays(7, new Date(2026, 10, 2))), wk('ul-upper-b', day(2026, 11, 4)), wk('ul-lower-b', day(2026, 11, 8))])).toBe(false);
    });

    it('workouts without working sets, warm-up only, deleted sets and sessions of other plans do not count', () => {
      const base = mondays(7).map((d) => wk('ul-upper-a', d));
      const extra = (x: { w: Workout; s: SetLog[] }) => planHintDue(plan, [...base, x].map((y) => y.w), [...base, x].flatMap((y) => y.s));
      const eighth = day(2026, 9, 14);
      expect(extra(wk('ul-upper-a', eighth, { sets: false }))).toBe(false);
      expect(extra(wk('ul-upper-a', eighth, { warmup: true }))).toBe(false);
      expect(extra(wk('fb-a', eighth))).toBe(false);
      const del = wk('ul-upper-a', eighth);
      del.s[0].deleted = true;
      expect(extra(del)).toBe(false);
      expect(extra(wk('ul-upper-a', eighth))).toBe(true);
    });
  });

  async function home(over: Partial<typeof DEFAULT_SETTINGS> = {}, weeks = 8) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 12, 8, 30));
    setActivePlan(plan);
    await saveSettings({ ...DEFAULT_SETTINGS, plan, userName: 'Minal', weeklyTarget: 4, ...over });
    await store(mondays(weeks).map((d) => wk('ul-upper-a', d)));
    render(Home);
    await screen.findByRole('button', { name: 'Start workout' });
  }

  it('appears once there are 8 weeks of data, and is gentle: a note with a dismiss button', async () => {
    await home();
    expect(await screen.findByText(HINT)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss hint' })).toBeTruthy();
  });

  it('is not shown with 7 weeks of data', async () => {
    await home({}, 7);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it('is not shown for Vik\'s own install', async () => {
    await home({ userName: 'Vik' });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it('dismissing hides it and the dismissal persists (also after a reload of Home)', async () => {
    await home();
    await click(await screen.findByRole('button', { name: 'Dismiss hint' }));
    expect(screen.queryByText(HINT)).toBeNull();
    await waitFor(async () => expect((await loadSettings()).planHintDismissed).toBe(true));
    cleanup();
    render(Home);
    await screen.findByRole('button', { name: 'Start workout' });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it('a dismissed hint stays gone', async () => {
    await home({ planHintDismissed: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(HINT)).toBeNull();
  });
});
