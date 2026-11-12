import type { Group, Plan, SessionId, SessionTemplate, Workout } from './types';

const GROUP_ORDER: Group[] = ['CB', 'L', 'SA'];

/**
 * Picks the next session: the group trained longest ago (never-trained groups
 * first, in order CB, L, SA), at the opposite variant to that group's last one.
 * Every workout counts, whether or not it ended or has done sets, and pause
 * state is not considered.
 */
export function nextSession(workouts: Workout[], templates: SessionTemplate[]): SessionId {
  const info = (id: SessionId): { group: Group; variant: 'A' | 'B' } => {
    const t = templates.find((x) => x.id === id);
    if (t?.group && t.variant) return { group: t.group, variant: t.variant };
    const [g, v] = id.split('-');
    return { group: g as Group, variant: v as 'A' | 'B' };
  };

  const latest = new Map<Group, { date: string; startedAt: number; variant: 'A' | 'B' }>();
  for (const wo of workouts) {
    const { group, variant } = info(wo.sessionId);
    const cur = latest.get(group);
    if (!cur || wo.date > cur.date || (wo.date === cur.date && wo.startedAt > cur.startedAt)) {
      latest.set(group, { date: wo.date, startedAt: wo.startedAt, variant });
    }
  }

  let pick: Group | undefined;
  for (const g of GROUP_ORDER) {
    const cur = latest.get(g);
    if (!cur) { pick = g; break; }
    const best = pick && latest.get(pick);
    if (!best || cur.date < best.date) pick = g;
  }
  const g = pick!;
  const last = latest.get(g);
  const variant = !last ? 'A' : last.variant === 'A' ? 'B' : 'A';
  return `${g}-${variant}` as SessionId;
}

/**
 * Next session of any plan. Plans with body-part groups (Vik's split) use nextSession(). Others take turns:
 * the session after the one trained last (by date, then start time), in plan order, from the first one at the
 * start. Workouts of sessions that are not in the plan (an older plan) are ignored. Which weekday it is does not
 * matter: a missed day never skips a session.
 */
export function nextInPlan(plan: Plan, workouts: Workout[]): SessionId {
  const sessions = plan.sessions;
  if (sessions.length === 0) throw new Error('This plan has no sessions');
  if (sessions.every((t) => t.group)) return nextSession(workouts, sessions);
  let last: Workout | undefined;
  for (const w of workouts) {
    if (!sessions.some((t) => t.id === w.sessionId)) continue;
    if (!last || w.date > last.date || (w.date === last.date && w.startedAt > last.startedAt)) last = w;
  }
  if (!last) return sessions[0].id;
  const at = sessions.findIndex((t) => t.id === last!.sessionId);
  return sessions[(at + 1) % sessions.length].id;
}

/** The plan's week from scratch: each training day with the session it starts with. */
export function weekSchedule(plan: Plan): { day: number; session: SessionTemplate }[] {
  const days = [...plan.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
  const done: Workout[] = [];
  return days.map((day, i) => {
    const id = nextInPlan(plan, done);
    done.push({ id: `sim${i}`, date: `2000-01-${String(i + 1).padStart(2, '0')}`, sessionId: id, startedAt: i, swaps: {} });
    return { day, session: plan.sessions.find((t) => t.id === id)! };
  });
}
