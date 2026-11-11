import {
  addCustomExercise, get, getAll, getAllFromIndex, loadSettings, mergedSwapOptions, put, putAll, saveSettings,
} from './db';
import type { QueueItem } from './db';
import { scheduleFlush } from './sync';
import { isPR, lastSessionSets, targetFor } from './progression';
import { exerciseById, rangeFor, TEMPLATES } from './seed';
import type { Exercise, SessionId, SetLog, Settings, Workout } from './types';

export const AUTO_END_MS = 15 * 60_000;
export const UNDO_MS = 5_000;
export const MAX_REST_SEC = 300;
const DEFAULT_REST_SEC = 120;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local YYYY-MM-DD of an epoch-ms timestamp (device time zone). */
export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface PlannedSet {
  exerciseId: string;
  setNo: number;
  target: { kg: number; reps: number } | null;
  last: SetLog | null;
}

const live = (s: SetLog) => !s.deleted;
const working = (s: SetLog) => !s.deleted && !s.warmup;

export class WorkoutStore {
  /** The current workout; stays set after finish / auto-end so the summary can read it. Use `active` for in-progress. */
  current = $state.raw<Workout | null>(null);
  /** Non-deleted sets of the current workout. */
  sets = $state.raw<SetLog[]>([]);
  restEndsAt = $state.raw<number | null>(null);
  settings = $state.raw<Settings | null>(null);
  customExercises = $state.raw<Exercise[]>([]);
  /** Sets from every other workout (deleted ones excluded). */
  history: SetLog[] = [];

  #lock: Promise<unknown> = Promise.resolve();

  get active(): boolean {
    return !!this.current && this.current.endedAt === undefined;
  }

  /** Serialises mutations so rapid taps cannot interleave their read-modify-write steps. */
  #run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.#lock.then(fn, fn);
    this.#lock = next.catch(() => undefined);
    return next;
  }

  // ---- exercises ----------------------------------------------------------------------

  /** Seed + custom lookup (synchronous; custom list is cached from IndexedDB). */
  exercise(id: string): Exercise | undefined {
    return exerciseById(id) ?? this.customExercises.find((e) => e.id === id);
  }

  swapOptions(exerciseId: string): Exercise[] {
    return mergedSwapOptions(exerciseId, this.customExercises);
  }

  async addExercise(input: Omit<Exercise, 'id'>): Promise<Exercise> {
    const ex = await addCustomExercise(input);
    this.customExercises = [...this.customExercises, ex];
    return ex;
  }

  restSecFor(exerciseId: string): number {
    const ex = this.exercise(exerciseId);
    const sec = this.settings?.restOverrides[exerciseId] ?? ex?.restSec ?? DEFAULT_REST_SEC;
    return Math.min(Math.max(sec, 0), MAX_REST_SEC);
  }

  // ---- loading ------------------------------------------------------------------------

  async #loadShared() {
    this.settings = await loadSettings();
    this.customExercises = await getAll<Exercise>('customExercises');
  }

  async #loadHistory(workoutId: string | null) {
    const all = await getAll<SetLog>('sets');
    this.history = all.filter((s) => live(s) && s.workoutId !== workoutId);
  }

  #recomputeRest() {
    const open = this.active;
    const last = this.sets.reduce<SetLog | null>((a, s) => (!a || s.doneAt > a.doneAt ? s : a), null);
    this.restEndsAt = open && last ? last.doneAt + this.restSecFor(last.exerciseId) * 1000 : null;
  }

  async #endWorkout(w: Workout, endedAt: number): Promise<Workout> {
    const ended = { ...w, endedAt };
    await put('workouts', ended);
    return ended;
  }

  /** Last activity: last non-deleted done set, else the start. */
  static lastActivity(w: Workout, sets: SetLog[]): number {
    return sets.reduce((m, s) => (live(s) ? Math.max(m, s.doneAt) : m), w.startedAt);
  }

  // ---- lifecycle ----------------------------------------------------------------------

  startWorkout(sessionId: SessionId, now: number = Date.now()): Promise<Workout> {
    return this.#run(async () => {
      await this.#loadShared();
      // Anything still open is closed by the auto-end rule first.
      for (const w of (await getAll<Workout>('workouts')).filter((x) => x.endedAt === undefined)) {
        const sets = await getAllFromIndex<SetLog>('sets', 'workoutId', w.id);
        await this.#endWorkout(w, Math.min(now, WorkoutStore.lastActivity(w, sets) + AUTO_END_MS));
      }
      const w: Workout = { id: crypto.randomUUID(), date: localDate(now), sessionId, startedAt: now, swaps: {} };
      await put('workouts', w);
      this.current = w;
      this.sets = [];
      await this.#loadHistory(w.id);
      this.#recomputeRest();
      return w;
    });
  }

  /** Loads the open workout (if any) with its done sets and rest timer; auto-ends it if stale. */
  restore(now: number = Date.now()): Promise<void> {
    return this.#run(async () => {
      await this.#loadShared();
      const open = (await getAll<Workout>('workouts'))
        .filter((w) => w.endedAt === undefined)
        .sort((a, b) => b.startedAt - a.startedAt);
      let keep: Workout | null = null;
      let keepSets: SetLog[] = [];
      let latestEnded: { w: Workout; sets: SetLog[] } | null = null;
      for (const w of open) {
        const sets = (await getAllFromIndex<SetLog>('sets', 'workoutId', w.id)).filter(live);
        const last = WorkoutStore.lastActivity(w, sets);
        if (!keep && now - last <= AUTO_END_MS) {
          keep = w;
          keepSets = sets;
        } else {
          // Stale (or a second open one): ended 15 min after its last done set, never in the future.
          const ended = await this.#endWorkout(w, Math.min(now, last + AUTO_END_MS));
          latestEnded ??= { w: ended, sets };
        }
      }
      // A stale workout stays exposed (ended) so the summary can still show it.
      const shown = keep ? { w: keep, sets: keepSets } : latestEnded;
      this.current = shown?.w ?? null;
      this.sets = shown?.sets ?? [];
      await this.#loadHistory(this.current?.id ?? null);
      this.#recomputeRest();
    });
  }

  finish(now: number = Date.now()): Promise<Workout> {
    return this.#run(async () => {
      const w = this.current;
      if (!w) throw new Error('No workout');
      if (w.endedAt !== undefined) return w;
      this.current = await this.#endWorkout(w, now);
      this.restEndsAt = null;
      return this.current;
    });
  }

  // ---- plan ---------------------------------------------------------------------------

  /** Template exercise id -> exercise id in effect (this workout's swap, then permanent override). */
  #effectiveId(sessionId: SessionId, templateId: string): string {
    return this.current?.swaps[templateId] ?? this.settings?.templateOverrides[sessionId]?.[templateId] ?? templateId;
  }

  plannedSets(): PlannedSet[] {
    const w = this.current;
    if (!w) return [];
    const tpl = TEMPLATES.find((t) => t.id === w.sessionId);
    if (!tpl) return [];
    const out: PlannedSet[] = [];
    for (const item of tpl.items) {
      const exerciseId = this.#effectiveId(w.sessionId, item.exerciseId);
      const ex = this.exercise(exerciseId);
      // Custom exercises have no per-session range: use their own.
      const range = exerciseById(exerciseId) ? rangeFor(w.sessionId, exerciseId) : ex ? { repMin: ex.repMin, repMax: ex.repMax } : undefined;
      const lastSets = lastSessionSets(this.history, exerciseId, w.date);
      for (let setNo = 1; setNo <= item.sets; setNo++) {
        out.push({
          exerciseId,
          setNo,
          target: ex && range ? targetFor(ex, this.history, setNo, w.date, range) : null,
          last: lastSets.find((s) => s.setNo === setNo) ?? null,
        });
      }
    }
    return out;
  }

  // ---- sets ---------------------------------------------------------------------------

  async #writeSet(set: SetLog, op: QueueItem['op'] = 'upsert') {
    await putAll([
      { store: 'sets', value: set },
      { store: 'queue', value: { id: set.id, op } satisfies QueueItem },
    ]);
    scheduleFlush();
  }

  completeSet(exerciseId: string, setNo: number, kg: number, reps: number, now: number = Date.now()): Promise<{ set: SetLog; pr: boolean }> {
    return this.#run(async () => {
      const w = this.current;
      if (!w || w.endedAt !== undefined) throw new Error('No workout in progress');
      const existing = this.sets.find((s) => s.exerciseId === exerciseId && s.setNo === setNo && !s.warmup);
      const set: SetLog = existing
        ? { ...existing, kg, reps, doneAt: now, updatedAt: now, synced: false }
        : {
            id: crypto.randomUUID(), workoutId: w.id, date: w.date, sessionId: w.sessionId, exerciseId, setNo, kg, reps,
            warmup: false, feltIt: false, doneAt: now, updatedAt: now, deleted: false, synced: false,
          };
      await this.#writeSet(set);
      const prior = [
        ...this.history.filter((s) => s.exerciseId === exerciseId && working(s)),
        ...this.sets.filter((s) => s.exerciseId === exerciseId && working(s) && s.id !== set.id),
      ];
      const ex = this.exercise(exerciseId);
      const pr = ex ? isPR(ex, { kg, reps, warmup: false }, prior) : false;
      this.sets = existing ? this.sets.map((s) => (s.id === set.id ? set : s)) : [...this.sets, set];
      this.#recomputeRest();
      return { set, pr };
    });
  }

  editSet(id: string, patch: Partial<Pick<SetLog, 'kg' | 'reps' | 'warmup' | 'feltIt' | 'note'>>): Promise<void> {
    return this.#run(async () => {
      const cur = await get<SetLog>('sets', id);
      if (!cur) throw new Error(`Unknown set ${id}`);
      const updated: SetLog = { ...cur, ...patch, updatedAt: Date.now(), synced: false };
      await this.#writeSet(updated);
      const inCurrent = cur.workoutId === this.current?.id;
      if (inCurrent) {
        this.sets = this.sets.map((s) => (s.id === id ? updated : s));
        if (patch.warmup !== undefined && patch.warmup !== cur.warmup) await this.#renumber(updated.exerciseId);
      } else {
        this.history = this.history.map((s) => (s.id === id ? updated : s));
      }
    });
  }

  /** Warm-ups are setNo 0; working sets are 1..n in order, so warm-ups never shift working numbering. */
  async #renumber(exerciseId: string) {
    const mine = this.sets.filter((s) => s.exerciseId === exerciseId);
    const ordered = mine.filter((s) => !s.warmup).sort((a, b) => a.setNo - b.setNo || a.doneAt - b.doneAt);
    const next = new Map<string, number>();
    mine.filter((s) => s.warmup).forEach((s) => next.set(s.id, 0));
    ordered.forEach((s, i) => next.set(s.id, i + 1));
    for (const s of mine) {
      const setNo = next.get(s.id)!;
      if (s.setNo === setNo) continue;
      const fixed = { ...s, setNo, updatedAt: Date.now(), synced: false };
      await this.#writeSet(fixed);
      this.sets = this.sets.map((x) => (x.id === s.id ? fixed : x));
    }
  }

  /** Soft-deletes (so the sheet row can be cleared). Returns an undo that works for 5 s. */
  deleteSet(id: string): Promise<() => Promise<void>> {
    return this.#run(async () => {
      const cur = await get<SetLog>('sets', id);
      if (!cur) throw new Error(`Unknown set ${id}`);
      const deletedAt = Date.now();
      await this.#writeSet({ ...cur, deleted: true, updatedAt: deletedAt, synced: false }, 'delete');
      this.sets = this.sets.filter((s) => s.id !== id);
      this.history = this.history.filter((s) => s.id !== id);
      this.#recomputeRest();
      let used = false;
      return () =>
        this.#run(async () => {
          if (used || Date.now() - deletedAt > UNDO_MS) return;
          used = true;
          const back: SetLog = { ...cur, deleted: false, updatedAt: Date.now(), synced: false };
          await this.#writeSet(back);
          if (cur.workoutId === this.current?.id) this.sets = [...this.sets, back];
          else this.history = [...this.history, back];
          this.#recomputeRest();
        });
    });
  }

  // ---- swaps --------------------------------------------------------------------------

  swap(templateExerciseId: string, chosenId: string, permanent: boolean): Promise<void> {
    return this.#run(async () => {
      const w = this.current;
      if (!w) throw new Error('No workout');
      const tpl = TEMPLATES.find((t) => t.id === w.sessionId);
      // Accept either the template's own id or the id currently in effect for that slot.
      const item =
        tpl?.items.find((i) => i.exerciseId === templateExerciseId) ??
        tpl?.items.find((i) => this.#effectiveId(w.sessionId, i.exerciseId) === templateExerciseId);
      if (!tpl || !item) throw new Error(`${templateExerciseId} is not in ${w.sessionId}`);
      const tid = item.exerciseId;

      const swaps = { ...w.swaps };
      if (chosenId === tid) delete swaps[tid];
      else swaps[tid] = chosenId;
      const updated = { ...w, swaps };
      await put('workouts', updated);
      this.current = updated;

      if (permanent) {
        const settings = this.settings ?? (await loadSettings());
        const forSession = { ...(settings.templateOverrides[w.sessionId] ?? {}) };
        if (chosenId === tid) delete forSession[tid];
        else forSession[tid] = chosenId;
        const next: Settings = { ...settings, templateOverrides: { ...settings.templateOverrides, [w.sessionId]: forSession } };
        await saveSettings(next);
        this.settings = next;
      }
    });
  }
}

export const workout = new WorkoutStore();
