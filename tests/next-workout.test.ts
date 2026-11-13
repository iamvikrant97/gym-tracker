import { describe, expect, it } from 'vitest';
import { nextPlannedWorkout } from '../src/lib/selection';
import { VIK_PLAN, fullBodyPlan } from '../src/lib/seed';
import type { SessionId, Workout } from '../src/lib/types';

let n = 0;
const w = (sessionId: SessionId, date: string): Workout => ({
  id: `w${n++}`, date, sessionId, startedAt: Date.parse(`${date}T07:00:00+05:30`), endedAt: Date.parse(`${date}T08:00:00+05:30`), swaps: {},
});
// Vik's week: Mon CB-A, Tue L-A, Wed SA-A, Thu CB-B, Fri SA-B (so Legs B is next).
const VIK_WEEK = [w('CB-A', '2026-11-09'), w('L-A', '2026-11-10'), w('SA-A', '2026-11-11'), w('CB-B', '2026-11-12'), w('SA-B', '2026-11-13')];

describe('nextPlannedWorkout', () => {
  it('Friday done on Vik\'s Mon-Sat plan: Saturday, Legs B', () => {
    const r = nextPlannedWorkout(VIK_PLAN, VIK_WEEK, 5);
    expect(r.weekday).toBe(6);
    expect(r.session.name).toBe('Legs B');
  });

  it('the rest weekday (Sunday) is skipped: after Saturday comes Monday', () => {
    const r = nextPlannedWorkout(VIK_PLAN, [...VIK_WEEK, w('L-B', '2026-11-14')], 6);
    expect(r.weekday).toBe(1);
    expect(r.session.name).toBe('Chest + Back A');
  });

  it('on the last training day of the week it wraps to the first training day of next week', () => {
    const plan = fullBodyPlan([1, 3, 5]);
    const r = nextPlannedWorkout(plan, [w('fb-a', '2026-11-09'), w('fb-b', '2026-11-11'), w('fb-a', '2026-11-13')], 5);
    expect(r.weekday).toBe(1);
    expect(r.session.id).toBe('fb-b');
  });

  it('a day outside the plan weekdays: the next plan weekday after today', () => {
    const plan = fullBodyPlan([1, 3, 5]);
    const hist = [w('fb-a', '2026-11-13')];
    expect(nextPlannedWorkout(plan, hist, 6).weekday).toBe(1); // Saturday
    expect(nextPlannedWorkout(plan, hist, 0).weekday).toBe(1); // Sunday
    expect(nextPlannedWorkout(plan, hist, 2).weekday).toBe(3); // Tuesday
  });

  it('a plan with one training day: the same weekday next week', () => {
    const plan = fullBodyPlan([3]);
    expect(nextPlannedWorkout(plan, [w('fb-a', '2026-11-11')], 3).weekday).toBe(3);
  });

  it('a plan with no weekdays still names the session, without a day', () => {
    const plan = { ...fullBodyPlan([1]), days: [] };
    const r = nextPlannedWorkout(plan, [w('fb-a', '2026-11-11')], 3);
    expect(r.weekday).toBeNull();
    expect(r.session.id).toBe('fb-b');
  });
});
