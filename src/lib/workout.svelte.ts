import {
  addCustomExercise, get, getAll, getAllFromIndex, loadSettings, mergedSwapOptions, put, putAll, updateSettings,
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

  /** Merges into the stored settings in one transaction (never overwrites other writers) and refreshes memory. */
  async updateSettings(change: Partial<Settings> | ((cur: Settings) => Settings)): Promise<Settings> {
    this.settings = await updateSettings(change);
    return this.settings;
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

  /** Closes anything still open by the auto-end rule, then opens a new workout. Caller holds the lock. */
  async #begin(sessionId: SessionId, now: number, swaps: Record<string, string> = {}): Promise<Workout> {
    for (const w of (await getAll<Workout>('workouts')).filter((x) => x.endedAt === undefined)) {
      const sets = await getAllFromIndex<SetLog>('sets', 'workoutId', w.id);
      await this.#endWorkout(w, Math.min(now, WorkoutStore.lastActivity(w, sets) + AUTO_END_MS));
    }
    const w: Workout = { id: crypto.randomUUID(), date: localDate(now), sessionId, startedAt: now, swaps: { ...swaps } };
    await put('workouts', w);
    this.current = w;
    this.sets = [];
    await this.#loadHistory(w.id);
    this.#recomputeRest();
    return w;
  }

  startWorkout(sessionId: SessionId, now: number = Date.now()): Promise<Workout> {
    return this.#run(async () => {
      await this.#loadShared();
      return this.#begin(sessionId, now);
    });
  }

  /**
   * Ends the current workout if its last activity (last done set, or the start if none) was more than
   * 15 min before `now`: endedAt = last activity + 15 min. Call on a timer and on visibilitychange.
   * Resolves true if it ended the workout.
   */
  checkAutoEnd(now: number = Date.now()): Promise<boolean> {
    return this.#run(() => this.#checkAutoEnd(now));
  }

  async #checkAutoEnd(now: number): Promise<boolean> {
    const w = this.current;
    if (!w || w.endedAt !== undefined) return false;
    const last = WorkoutStore.lastActivity(w, this.sets);
    if (now - last <= AUTO_END_MS) return false;
    this.current = await this.#endWorkout(w, Math.min(now, last + AUTO_END_MS));
    this.restEndsAt = null;
    return true;
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

  /** Writes sets and their queue entries in ONE transaction. Op follows the set: deleted -> 'delete'. */
  async #writeSets(sets: SetLog[]) {
    await putAll(
      sets.flatMap((set) => [
        { store: 'sets' as const, value: set },
        { store: 'queue' as const, value: { id: set.id, op: set.deleted ? 'delete' : 'upsert' } satisfies QueueItem },
      ]),
    );
    scheduleFlush();
  }

  completeSet(exerciseId: string, setNo: number, kg: number, reps: number, now: number = Date.now()): Promise<{ set: SetLog; pr: boolean }> {
    return this.#run(async () => {
      let w = this.current;
      if (!w || w.endedAt !== undefined) throw new Error('No workout in progress');
      // A long break ends the old workout at last set + 15 min; this set then opens a fresh one of the same session.
      if (this.sets.length > 0 && (await this.#checkAutoEnd(now))) {
        w = await this.#begin(w.sessionId, now, w.swaps);
      }
      const existing = this.sets.find((s) => s.exerciseId === exerciseId && s.setNo === setNo && !s.warmup);
      // Logging a set number that is already done is an edit of that set: same id, same doneAt.
      const set: SetLog = existing
        ? { ...existing, kg, reps, updatedAt: now, synced: false }
        : {
            id: crypto.randomUUID(), workoutId: w.id, date: w.date, sessionId: w.sessionId, exerciseId, setNo, kg, reps,
            warmup: false, feltIt: false, doneAt: now, updatedAt: now, deleted: false, synced: false,
          };
      await this.#writeSets([set]);
      const prior = [
        ...this.history.filter((s) => s.exerciseId === exerciseId && working(s)),
        ...this.sets.filter((s) => s.exerciseId === exerciseId && working(s) && s.id !== set.id && s.doneAt < set.doneAt),
      ];
      const ex = this.exercise(exerciseId);
      const pr = ex ? isPR(ex, { kg, reps, warmup: false }, prior) : false;
      this.sets = existing ? this.sets.map((s) => (s.id === set.id ? set : s)) : [...this.sets, set];
      this.#recomputeRest();
      return { set, pr };
    });
  }

  editSet(
    id: string,
    patch: Partial<Pick<SetLog, 'kg' | 'reps' | 'warmup' | 'feltIt' | 'note'>>,
    now: number = Date.now(),
  ): Promise<void> {
    return this.#run(async () => {
      const cur = await get<SetLog>('sets', id);
      if (!cur) throw new Error(`Unknown set ${id}`);
      if (cur.deleted) throw new Error(`Set ${id} was deleted`);
      const updated: SetLog = { ...cur, ...patch, updatedAt: now, synced: false };
      const inCurrent = cur.workoutId === this.current?.id;
      if (!inCurrent) {
        await this.#writeSets([updated]);
        this.history = this.history.map((s) => (s.id === id ? updated : s));
        return;
      }
      let next = this.sets.map((s) => (s.id === id ? updated : s));
      const changed = new Map<string, SetLog>([[id, updated]]);
      if (patch.warmup !== undefined && patch.warmup !== cur.warmup) {
        next = WorkoutStore.#renumbered(next, updated.exerciseId, now);
        for (const s of next) if (s.updatedAt === now && s.id !== id) changed.set(s.id, s);
        changed.set(id, next.find((s) => s.id === id)!);
      }
      await this.#writeSets([...changed.values()]); // one transaction: a kill cannot leave duplicate setNos
      this.sets = next;
    });
  }

  /** Warm-ups are setNo 0; working sets are 1..n in order, so warm-ups never shift working numbering. */
  static #renumbered(all: SetLog[], exerciseId: string, now: number): SetLog[] {
    const ordered = all
      .filter((s) => s.exerciseId === exerciseId && !s.warmup)
      .sort((a, b) => a.setNo - b.setNo || a.doneAt - b.doneAt);
    const target = new Map<string, number>();
    all.filter((s) => s.exerciseId === exerciseId && s.warmup).forEach((s) => target.set(s.id, 0));
    ordered.forEach((s, i) => target.set(s.id, i + 1));
    return all.map((s) => {
      const setNo = target.get(s.id);
      return setNo === undefined || setNo === s.setNo ? s : { ...s, setNo, updatedAt: now, synced: false };
    });
  }

  /**
   * Soft-deletes (so the sheet row can be cleared). Returns an undo that works for 5 s; it is refused
   * once the same set number has been logged again, so undo can never create a duplicate.
   */
  deleteSet(id: string, now: number = Date.now()): Promise<(now?: number) => Promise<void>> {
    return this.#run(async () => {
      const cur = await get<SetLog>('sets', id);
      if (!cur) throw new Error(`Unknown set ${id}`);
      await this.#writeSets([{ ...cur, deleted: true, updatedAt: now, synced: false }]);
      this.sets = this.sets.filter((s) => s.id !== id);
      this.history = this.history.filter((s) => s.id !== id);
      this.#recomputeRest();
      let used = false;
      return (undoAt: number = Date.now()) =>
        this.#run(async () => {
          if (used) return;
          used = true; // one shot: an expired or refused undo stays expired
          if (undoAt - now > UNDO_MS) return;
          const inCurrent = cur.workoutId === this.current?.id;
          const pool = inCurrent ? this.sets : this.history;
          if (!cur.warmup && pool.some((s) => s.exerciseId === cur.exerciseId && s.setNo === cur.setNo && !s.warmup && s.workoutId === cur.workoutId)) return;
          const back: SetLog = { ...cur, deleted: false, updatedAt: undoAt, synced: false };
          await this.#writeSets([back]);
          if (inCurrent) this.sets = [...this.sets, back];
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
        // Re-read inside one transaction so settings saved since startWorkout are kept.
        this.settings = await updateSettings((settings) => {
          const forSession = { ...(settings.templateOverrides[w.sessionId] ?? {}) };
          if (chosenId === tid) delete forSession[tid];
          else forSession[tid] = chosenId;
          return { ...settings, templateOverrides: { ...settings.templateOverrides, [w.sessionId]: forSession } };
        });
      }
    });
  }
}

export const workout = new WorkoutStore();
