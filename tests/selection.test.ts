import { describe, it, expect } from 'vitest';
import { nextSession } from '../src/lib/selection';
import { TEMPLATES } from '../src/lib/seed';
import type { SessionId, Workout } from '../src/lib/types';

let n = 0;
const w = (sessionId: SessionId, date: string, o: Partial<Workout> = {}): Workout => ({
  id: `w${n++}`, date, sessionId, startedAt: Date.parse(`${date}T07:00:00+05:30`),
  endedAt: Date.parse(`${date}T08:00:00+05:30`), swaps: {}, ...o,
});

describe('nextSession', () => {
  it('first session ever is CB-A', () => {
    expect(nextSession([], TEMPLATES)).toBe('CB-A');
  });

  it('after only CB-A, picks the never-trained group L at variant A', () => {
    expect(nextSession([w('CB-A', '2026-11-09')], TEMPLATES)).toBe('L-A');
  });

  it('never-trained groups come first in order CB, L, SA', () => {
    expect(nextSession([w('L-A', '2026-11-09')], TEMPLATES)).toBe('CB-A');
    expect(nextSession([w('CB-A', '2026-11-09'), w('L-A', '2026-11-10')], TEMPLATES)).toBe('SA-A');
  });

  it('picks the group trained longest ago and flips its variant', () => {
    const h = [w('CB-A', '2026-11-09'), w('SA-A', '2026-11-10'), w('L-B', '2026-11-11')];
    expect(nextSession(h, TEMPLATES)).toBe('CB-B');
  });

  it('Thu 12 Nov after Mon chest+back A, Tue shoulders+arms, Wed legs resolves to Chest + Back B', () => {
    const h = [w('CB-A', '2026-11-09'), w('SA-A', '2026-11-10'), w('L-A', '2026-11-11')];
    const id = nextSession(h, TEMPLATES);
    expect(id).toBe('CB-B');
    expect(TEMPLATES.find((t) => t.id === id)!.name).toBe('Chest + Back B');
  });

  it('alternates A/B across a full cycle', () => {
    const h = [w('CB-A', '2026-11-09'), w('L-A', '2026-11-10'), w('SA-A', '2026-11-11'), w('CB-B', '2026-11-12')];
    expect(nextSession(h, TEMPLATES)).toBe('L-B');
    h.push(w('L-B', '2026-11-13'));
    expect(nextSession(h, TEMPLATES)).toBe('SA-B');
    h.push(w('SA-B', '2026-11-14'));
    expect(nextSession(h, TEMPLATES)).toBe('CB-A');
  });

  it('is independent of the order workouts are passed in', () => {
    const h = [w('L-B', '2026-11-11'), w('CB-A', '2026-11-09'), w('SA-A', '2026-11-10')];
    expect(nextSession(h, TEMPLATES)).toBe('CB-B');
  });

  it('a workout without endedAt still counts', () => {
    const h = [w('CB-A', '2026-11-09', { endedAt: undefined })];
    expect(nextSession(h, TEMPLATES)).toBe('L-A');
  });

  it('a workout with no done sets still counts (selection only sees workouts)', () => {
    const h = [w('CB-A', '2026-11-09', { endedAt: undefined, swaps: {} }), w('L-A', '2026-11-10'), w('SA-A', '2026-11-11')];
    expect(nextSession(h, TEMPLATES)).toBe('CB-B');
  });

  it('same-day multiple workouts: the later one decides that group\'s variant', () => {
    const d = '2026-11-09';
    const t = Date.parse(`${d}T07:00:00+05:30`);
    const h = [
      w('CB-B', d, { startedAt: t + 4 * 3600_000 }),
      w('CB-A', d, { startedAt: t }),
      w('L-A', '2026-11-10'),
      w('SA-A', '2026-11-11'),
    ];
    expect(nextSession(h, TEMPLATES)).toBe('CB-A');
  });

  it('same-day workouts in different groups tie on date and break by order CB, L, SA', () => {
    const h = [w('SA-A', '2026-11-09'), w('L-A', '2026-11-09'), w('CB-A', '2026-11-09')];
    expect(nextSession(h, TEMPLATES)).toBe('CB-B');
    const h2 = [w('SA-A', '2026-11-09'), w('L-A', '2026-11-09'), w('CB-A', '2026-11-10')];
    expect(nextSession(h2, TEMPLATES)).toBe('L-B');
  });

  it('a gap of weeks does not change the rule', () => {
    const h = [w('CB-B', '2026-09-01'), w('L-A', '2026-10-05'), w('SA-B', '2026-10-06')];
    expect(nextSession(h, TEMPLATES)).toBe('CB-A');
  });

  it('compares dates as calendar dates across month and year boundaries', () => {
    const h = [w('CB-A', '2026-12-30'), w('L-A', '2026-12-31'), w('SA-A', '2027-01-01')];
    expect(nextSession(h, TEMPLATES)).toBe('CB-B');
  });

  it('ended and still-open workouts are treated alike', () => {
    const h = [w('CB-A', '2026-11-09'), w('SA-A', '2026-11-10'), w('L-A', '2026-11-11', { endedAt: undefined })];
    expect(nextSession(h, TEMPLATES)).toBe('CB-B');
  });

  it('does not mutate its inputs', () => {
    const h = [w('L-B', '2026-11-11'), w('CB-A', '2026-11-09')];
    const copy = JSON.stringify(h);
    nextSession(h, TEMPLATES);
    expect(JSON.stringify(h)).toBe(copy);
  });
});
