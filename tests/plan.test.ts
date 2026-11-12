import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActivePlan, setRetiredNames, getActivePlan } from '../src/lib/activePlan.svelte';
import { closeDb, getAll, loadSettings, put, saveSettings, DEFAULT_SETTINGS } from '../src/lib/db';
import { defaultDays, daysLabel, initPlan, trainingDayNote } from '../src/lib/planSetup';
import { EXERCISES, FULLBODY_SESSIONS, TEMPLATES, VIK_PLAN, currentPlan, exerciseById, fullBodyPlan, rangeFor, sessionName, swapOptions } from '../src/lib/seed';
import { nextInPlan, nextSession, weekSchedule } from '../src/lib/selection';
import { dayVisits, weeklySets } from '../src/lib/stats';
import { flush, syncStatus, _resetSyncState } from '../src/lib/sync';
import { mergedSwapOptions } from '../src/lib/db';
import { WorkoutStore } from '../src/lib/workout.svelte';
import type { Plan, SetLog, Workout } from '../src/lib/types';

const at = (d: number, h = 8) => new Date(2026, 10, d, h, 0).getTime();
const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;
const wk = (sessionId: string, d: number): Workout => ({ id: `w${d}-${sessionId}`, date: day(d), sessionId, startedAt: at(d), endedAt: at(d, 9), swaps: {} });
const st = (w: Workout, exerciseId: string, n = 1): SetLog => ({
  id: `${w.id}-${exerciseId}-${n}`, workoutId: w.id, date: w.date, sessionId: w.sessionId, exerciseId, setNo: n, kg: 20, reps: 10,
  warmup: false, feltIt: false, doneAt: w.startedAt + n * 60_000, updatedAt: w.startedAt, deleted: false, synced: true,
});

beforeEach(async () => {
  await closeDb(true);
  _resetSyncState();
  setActivePlan(null);
  setRetiredNames(undefined);
});
afterEach(() => {
  setActivePlan(null);
  setRetiredNames(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('migration (initPlan)', () => {
  it('an install with sets gets plan vik silently and nothing else changes', async () => {
    const w = wk('CB-A', 9);
    await put('workouts', w);
    await put('sets', st(w, 'smith-flat-press'));
    await saveSettings({ ...DEFAULT_SETTINGS, weeklyTarget: 5, bodyKg: 71, scriptUrl: 'https://script.google.com/macros/s/X/exec', scriptKey: 'k' });
    const before = await loadSettings();
    expect(await initPlan()).toBe('ready');
    const after = await loadSettings();
    expect(after.plan).toMatchObject({ id: 'vik', weeklyTarget: 5 });
    const { plan, ...rest } = after;
    expect(plan).toBeDefined();
    expect(rest).toEqual(before); // no other setting touched, userName stays undefined (greeting stays "Vik")
    expect(currentPlan().sessions).toBe(TEMPLATES);
    expect(getActivePlan()?.id).toBe('vik');
  });

  it('a workout alone, or only a deleted set, counts as data', async () => {
    await put('workouts', wk('L-A', 10));
    expect(await initPlan()).toBe('ready');
    await closeDb(true);
    const w = wk('L-A', 10);
    await put('sets', { ...st(w, 'leg-press'), deleted: true });
    expect(await initPlan()).toBe('ready');
    expect((await loadSettings()).plan?.id).toBe('vik');
  });

  it('an empty install with no plan runs the setup and stores nothing', async () => {
    expect(await initPlan()).toBe('setup');
    expect((await loadSettings()).plan).toBeUndefined();
    expect(getActivePlan()).toBeNull();
  });

  it('a stored plan is put in effect and left alone; vik gets its sessions back from the code', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, plan: { id: 'vik', name: 'x', sessions: [], days: [1, 2], weeklyTarget: 2 } });
    expect(await initPlan()).toBe('ready');
    expect(getActivePlan()?.sessions).toBe(TEMPLATES);
    await closeDb(true);
    const fb = fullBodyPlan([2, 4]);
    await saveSettings({ ...DEFAULT_SETTINGS, plan: fb });
    expect(await initPlan()).toBe('ready');
    expect(getActivePlan()?.id).toBe('fullbody');
    expect((await loadSettings()).plan).toEqual(fb);
  });

  it('running twice does not change the stored plan', async () => {
    await put('workouts', wk('CB-A', 9));
    await initPlan();
    const first = (await loadSettings()).plan;
    await initPlan();
    expect((await loadSettings()).plan).toEqual(first);
  });
});

describe('library and the suggested plan', () => {
  it('Full body A/B: 5 to 6 exercises, 2 to 3 sets, rep ranges by kind, all in the library', () => {
    expect(FULLBODY_SESSIONS.map((s) => s.name)).toEqual(['Full body A', 'Full body B']);
    for (const s of FULLBODY_SESSIONS) {
      expect(s.items.length).toBeGreaterThanOrEqual(5);
      expect(s.items.length).toBeLessThanOrEqual(6);
      for (const i of s.items) {
        const ex = exerciseById(i.exerciseId);
        expect(ex, i.exerciseId).toBeDefined();
        expect(i.sets).toBeGreaterThanOrEqual(2);
        expect(i.sets).toBeLessThanOrEqual(3);
        expect([i.repMin, i.repMax]).toEqual(ex!.kind === 'compound' ? [8, 12] : [10, 15]);
      }
    }
    const a = FULLBODY_SESSIONS[0].items.map((i) => i.exerciseId);
    expect(a).toContain('leg-press');
    expect(a).toContain('cable-crunch');
    const b = FULLBODY_SESSIONS[1].items.map((i) => i.exerciseId);
    expect(b).toEqual(expect.arrayContaining(['hip-thrust', 'lat-pulldown-wide', 'db-incline-press', 'split-squat', 'db-curl']));
  });

  it('new library exercises: 2.5 kg step, rest by kind, own slot so Vik\'s swap lists stay as they were', () => {
    for (const id of ['goblet-squat', 'hip-thrust', 'split-squat', 'walking-lunge', 'push-up', 'db-row', 'dead-bug', 'back-extension']) {
      const e = exerciseById(id)!;
      expect(e, id).toBeDefined();
      expect(e.step).toBe(2.5);
      expect(e.restSec).toBe(e.kind === 'compound' ? 180 : 120);
    }
    expect(swapOptions('leg-press').map((e) => e.id)).toEqual(['leg-press', 'leg-press-feet-high']);
    expect(swapOptions('seated-machine-row').map((e) => e.slot)).toEqual(['Machine row']);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });

  it('plans from the setup flow can swap leg press for goblet squat; Vik\'s plan cannot', () => {
    setActivePlan(fullBodyPlan([1, 3, 5]));
    expect(mergedSwapOptions('leg-press', []).map((e) => e.id)).toContain('goblet-squat');
    setActivePlan(null);
    expect(mergedSwapOptions('leg-press', []).map((e) => e.id)).not.toContain('goblet-squat');
  });

  it('rangeFor follows the active plan; Vik\'s ranges are unchanged', () => {
    expect(rangeFor('CB-B', 'wide-grip-cable-row')).toEqual({ repMin: 12, repMax: 15 });
    expect(rangeFor('fb-a', 'machine-shoulder-press')).toEqual({ repMin: 8, repMax: 10 }); // not in Vik's plan: library
    setActivePlan(fullBodyPlan([1, 3, 5]));
    expect(rangeFor('fb-a', 'machine-shoulder-press')).toEqual({ repMin: 8, repMax: 12 });
    expect(rangeFor('fb-a', 'cable-crunch')).toEqual({ repMin: 10, repMax: 15 });
  });
});

describe('choosing the session', () => {
  it('Full body A/B alternates A, B, A, B on any dates and starts with A', () => {
    const plan = fullBodyPlan([2, 4, 6]); // Tue, Thu, Sat
    const done: Workout[] = [];
    const seen: string[] = [];
    for (const d of [10, 12, 14, 17, 19]) {
      const id = nextInPlan(plan, done);
      seen.push(id);
      done.push(wk(id, d));
    }
    expect(seen).toEqual(['fb-a', 'fb-b', 'fb-a', 'fb-b', 'fb-a']);
  });

  it('a missed day never skips a session; order of the list does not matter', () => {
    const plan = fullBodyPlan([1, 3, 5]);
    expect(nextInPlan(plan, [wk('fb-a', 9), wk('fb-b', 11)])).toBe('fb-a');
    expect(nextInPlan(plan, [wk('fb-b', 11), wk('fb-a', 9)])).toBe('fb-a');
    expect(nextInPlan(plan, [wk('fb-a', 9)])).toBe('fb-b'); // Wed and Fri passed, still B
  });

  it('two workouts on one date: the later start wins', () => {
    const plan = fullBodyPlan([1, 3, 5]);
    const early = wk('fb-a', 9);
    const late = { ...wk('fb-b', 9), id: 'late', startedAt: at(9, 18) };
    expect(nextInPlan(plan, [late, early])).toBe('fb-a');
  });

  it('sessions of an older plan are ignored', () => {
    expect(nextInPlan(fullBodyPlan([1, 3]), [wk('CB-B', 10), wk('L-A', 11)])).toBe('fb-a');
  });

  it('a plan you built takes its sessions in order and wraps', () => {
    const custom: Plan = {
      id: 'custom', name: 'My plan', days: [1, 3, 5], weeklyTarget: 3,
      sessions: ['c-1', 'c-2', 'c-3'].map((id, i) => ({ id, name: `S${i + 1}`, items: [{ exerciseId: 'leg-press', sets: 3 }] })),
    };
    expect(nextInPlan(custom, [])).toBe('c-1');
    expect(nextInPlan(custom, [wk('c-1', 9)])).toBe('c-2');
    expect(nextInPlan(custom, [wk('c-1', 9), wk('c-2', 10), wk('c-3', 11)])).toBe('c-1');
  });

  it('Vik\'s plan picks exactly what nextSession picks', () => {
    const h = [wk('CB-A', 9), wk('SA-A', 10), wk('L-A', 11)];
    expect(nextInPlan(VIK_PLAN, h)).toBe(nextSession(h, TEMPLATES));
    expect(nextInPlan(VIK_PLAN, h)).toBe('CB-B');
  });

  it('weekSchedule: her weekdays, Monday first, sessions in turn', () => {
    expect(weekSchedule(fullBodyPlan([5, 1, 3])).map((r) => [r.day, r.session.name])).toEqual([[1, 'Full body A'], [3, 'Full body B'], [5, 'Full body A']]);
    expect(weekSchedule(fullBodyPlan([0, 2])).map((r) => [r.day, r.session.id])).toEqual([[2, 'fb-a'], [0, 'fb-b']]); // Sunday last
    expect(weekSchedule(VIK_PLAN).map((r) => r.session.id)).toEqual(['CB-A', 'L-A', 'SA-A', 'CB-B', 'L-B', 'SA-B']);
  });

  it('default weekdays and labels', () => {
    expect(defaultDays(2)).toEqual([1, 4]);
    expect(defaultDays(3)).toEqual([1, 3, 5]);
    expect(defaultDays(4)).toEqual([1, 2, 4, 5]);
    expect(defaultDays(5)).toEqual([1, 2, 3, 4, 5]);
    expect(daysLabel([5, 1, 3])).toBe('Mon · Wed · Fri');
    expect(daysLabel([0, 6])).toBe('Sat · Sun');
  });

  it('home note: training day, rest day, next day', () => {
    const plan = fullBodyPlan([1, 3, 5]);
    expect(trainingDayNote(plan, new Date(2026, 10, 9))).toBe('Today is a training day'); // Mon
    expect(trainingDayNote(plan, new Date(2026, 10, 10))).toBe('Rest day · next training day is Wednesday');
    expect(trainingDayNote(plan, new Date(2026, 10, 14))).toBe('Rest day · next training day is Monday'); // Sat
  });
});

describe('switching plans keeps the history', () => {
  it('sets from sessions that no longer exist still show in the calendar, summary and muscle counts', async () => {
    const store = new WorkoutStore();
    await store.updateSettings({ plan: { id: 'vik', name: "Vik's split", sessions: [], days: [1, 2, 3, 4, 5, 6], weeklyTarget: 6 } });
    const w = wk('CB-A', 9);
    const old = [st(w, 'smith-flat-press'), st(w, 'smith-flat-press', 2), st(w, 'lat-pulldown-wide')];
    // She switches to a plan she built; later to Full body.
    const mine: Plan = { id: 'custom', name: 'My plan', days: [1, 3], weeklyTarget: 2, sessions: [{ id: 'c-push', name: 'Push day', items: [{ exerciseId: 'push-up', sets: 3 }] }] };
    await store.updateSettings((cur) => ({ ...cur, plan: mine, weeklyTarget: 2 }));
    expect(currentPlan().id).toBe('custom');
    const pw = wk('c-push', 10);
    const pushSets = [st(pw, 'push-up')];
    expect(dayVisits(day(9), [w, pw], [...old, ...pushSets])[0]).toMatchObject({ name: 'Chest + Back A', sets: 3 }); // Vik's names are always known
    const fb = fullBodyPlan([1, 3, 5]);
    await store.updateSettings((cur) => ({ ...cur, plan: fb, retiredSessions: { ...cur.retiredSessions, 'c-push': 'Push day' } }));
    expect(currentPlan().id).toBe('fullbody');
    expect(sessionName('c-push')).toBe('Push day');
    const visits = dayVisits(day(10), [w, pw], [...old, ...pushSets]);
    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ name: 'Push day', sets: 1 });
    expect(visits[0].exercises[0].name).toBe('Push-up');
    const counts = weeklySets([...old, ...pushSets], day(9));
    expect(counts.Chest).toBe(3); // two flat presses + the push-up
    expect(counts.Back).toBe(1);
  });

  it('an unknown session id is just "Workout"', () => {
    const w = wk('zzz', 9);
    expect(dayVisits(day(9), [w], [st(w, 'leg-press')])[0].name).toBe('Workout');
  });

  it('starting and planning a workout works off the active plan', async () => {
    const store = new WorkoutStore();
    await store.updateSettings({ plan: fullBodyPlan([1, 3, 5]) });
    await store.startWorkout('fb-a', at(9));
    const planned = store.plannedSets();
    expect(planned.map((p) => p.exerciseId)).toEqual([
      'leg-press', 'leg-press', 'leg-press', 'machine-chest-press', 'machine-chest-press', 'machine-chest-press',
      'seated-machine-row', 'seated-machine-row', 'seated-machine-row', 'machine-shoulder-press', 'machine-shoulder-press', 'cable-crunch', 'cable-crunch',
    ]);
    expect(planned.every((p) => p.target === null && p.last === null)).toBe(true); // first time: no weight yet
  });

  it('first-time weights stay blank, then the double progression takes over with the plan\'s ranges', async () => {
    const store = new WorkoutStore();
    await store.updateSettings({ plan: fullBodyPlan([1, 3, 5]) });
    await store.startWorkout('fb-a', at(9));
    for (let n = 1; n <= 3; n++) await store.completeSet('leg-press', n, 40, 12, at(9) + n * 60_000);
    await store.finish(at(9) + 3_600_000);
    await store.startWorkout('fb-a', at(11));
    const lp = store.plannedSets().filter((p) => p.exerciseId === 'leg-press');
    expect(lp.map((p) => p.target)).toEqual([{ kg: 42.5, reps: 8 }, { kg: 42.5, reps: 8 }, { kg: 42.5, reps: 8 }]); // top of 8-12 reached: +2.5 kg, back to 8
  });
});

describe('local only', () => {
  it('with no Sheet: sets are saved, nothing is sent, flush is a no-op and the status is plain', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const store = new WorkoutStore();
    await store.updateSettings({ plan: fullBodyPlan([1, 3, 5]), userName: '' });
    await store.startWorkout('fb-a', at(9));
    await store.completeSet('leg-press', 1, 40, 10, at(9) + 60_000);
    expect(await getAll('sets')).toHaveLength(1);
    expect(await syncStatus()).toBe('not-set-up');
    expect(await flush()).toEqual({ sent: 0, ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
