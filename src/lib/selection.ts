import type { Group, SessionId, SessionTemplate, Workout } from './types';

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
    if (t) return { group: t.group, variant: t.variant };
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
