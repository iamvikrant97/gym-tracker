import type { PlannedSet } from './workout.svelte';
import type { SetLog } from './types';

/** Seconds per set in time estimates: the set itself plus loading plates and moving between machines. */
export const WORK_SEC = 80;
/** Fixed overhead added to a session estimate (setting up, walking between machines). */
export const SETUP_SEC = 300;

export interface RowModel {
  /** Stable per row: `${exerciseId}:${setNo}` for working rows, `w:${setId}` for done warm-ups. */
  key: string;
  exerciseId: string;
  /** 0 for warm-up rows. */
  setNo: number;
  done: SetLog | null;
  warmup: boolean;
  target: { kg: number; reps: number } | null;
  last: SetLog | null;
  /** Part of the plan (false for extra working sets beyond the plan). */
  planned: boolean;
}

export interface CardModel {
  key: string;
  exerciseId: string;
  /** Planned working sets. */
  planned: number;
  rows: RowModel[];
  /** Sets logged under an exercise that is no longer in the plan (swapped away after logging). */
  orphan: boolean;
}

function rowsFor(exerciseId: string, items: PlannedSet[], sets: SetLog[]): RowModel[] {
  const mine = sets.filter((s) => s.exerciseId === exerciseId && !s.deleted);
  const rows: RowModel[] = mine
    .filter((s) => s.warmup)
    .sort((a, b) => a.doneAt - b.doneAt)
    .map((s) => ({ key: `w:${s.id}`, exerciseId, setNo: 0, done: s, warmup: true, target: null, last: null, planned: false }));
  const work = mine.filter((s) => !s.warmup);
  const max = Math.max(items.length, ...work.map((s) => s.setNo));
  for (let n = 1; n <= max; n++) {
    const p = items[n - 1];
    rows.push({
      key: `${exerciseId}:${n}`,
      exerciseId,
      setNo: n,
      done: work.find((s) => s.setNo === n) ?? null,
      warmup: false,
      target: p?.target ?? null,
      last: p?.last ?? null,
      planned: !!p,
    });
  }
  return rows;
}

/** One card per planned exercise (in plan order), then cards for sets logged outside the plan. */
export function buildCards(planned: PlannedSet[], sets: SetLog[]): CardModel[] {
  const groups: { exerciseId: string; items: PlannedSet[] }[] = [];
  for (const p of planned) {
    const g = groups[groups.length - 1];
    if (!g || p.setNo === 1 || g.exerciseId !== p.exerciseId) groups.push({ exerciseId: p.exerciseId, items: [p] });
    else g.items.push(p);
  }
  const seen = new Set<string>();
  const cards: CardModel[] = groups.map((g, i) => {
    const first = !seen.has(g.exerciseId);
    seen.add(g.exerciseId);
    return { key: `p${i}`, exerciseId: g.exerciseId, planned: g.items.length, rows: rowsFor(g.exerciseId, g.items, first ? sets : []), orphan: false };
  });
  const orphanIds = [...new Set(sets.filter((s) => !s.deleted && !seen.has(s.exerciseId)).map((s) => s.exerciseId))];
  for (const id of orphanIds) cards.push({ key: `o:${id}`, exerciseId: id, planned: 0, rows: rowsFor(id, [], sets), orphan: true });
  return cards;
}

/** Meter: working sets done (capped) against planned working sets. Warm-ups never count. */
export function meter(cards: CardModel[]): { done: number; total: number } {
  const total = cards.reduce((n, c) => n + c.planned, 0);
  const done = cards.reduce((n, c) => n + c.rows.filter((r) => r.done && !r.warmup).length, 0);
  return { done: Math.min(done, total), total };
}

/** First planned working row not yet done, in plan order. */
export function nextUp(cards: CardModel[]): { exerciseId: string; setNo: number } | null {
  for (const c of cards) {
    if (c.orphan) continue;
    for (const r of c.rows) if (r.planned && !r.warmup && !r.done) return { exerciseId: c.exerciseId, setNo: r.setNo };
  }
  return null;
}

/** Undone planned rows, in order. */
export function remaining(cards: CardModel[]): RowModel[] {
  return cards.flatMap((c) => (c.orphan ? [] : c.rows.filter((r) => r.planned && !r.warmup && !r.done)));
}

/** Session length: every set's rest + WORK_SEC, plus 5 min, rounded to 5 min (Chest + Back B is about 70). */
export function estimateMinutes(restSecPerSet: number[]): number {
  const sec = restSecPerSet.reduce((n, r) => n + r + WORK_SEC, 0) + SETUP_SEC;
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

/** Expected finish: the rest still running, then each remaining set's work and the rests between them. */
export function finishAt(now: number, restLeftMs: number, remainingRestSec: number[]): number {
  const sets = remainingRestSec.length;
  const rests = remainingRestSec.slice(0, -1).reduce((n, r) => n + r, 0);
  return now + Math.max(0, restLeftMs) + (sets * WORK_SEC + rests) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** m:ss */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** mm:ss under an hour, then h:mm:ss. */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** Local time as "8:05 am". */
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}

/** 10 -> "10", 12.5 -> "12.5", 1.25 -> "1.25". */
export function fmtKg(kg: number): string {
  return String(Math.round(kg * 100) / 100);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Drop set: 75 % of the weight, rounded to the exercise's step. */
export function dropSet(kg: number, step: number): number {
  return Math.max(0, round2(Math.round((kg * 0.75) / step) * step));
}
