// Sync client: pushes the set queue to the Apps Script bridge and does the first import from the Sheet.
// Queue entries are only removed after the bridge confirms them (ok:true), so a timeout or error never loses work.
import { addCustomExercise, exerciseLookup, get, getAll, listExercises, loadSettings, openDb } from './db';
import type { QueueItem } from './db';
import { TEMPLATES } from './seed';
import type { Exercise, Muscle, SessionId, SetLog, Workout } from './types';

export const BATCH_SIZE = 50;
export const REQUEST_TIMEOUT_MS = 20_000;
export const DEBOUNCE_MS = 2_000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

/** Sheet day names (Log!B) per session. */
export const DAY_NAMES: Record<SessionId | 'Other', string> = {
  'CB-A': 'Chest+Back A',
  'CB-B': 'Chest+Back B',
  'L-A': 'Legs A',
  'L-B': 'Legs B',
  'SA-A': 'Shoulders+Arms A',
  'SA-B': 'Shoulders+Arms B',
  Other: 'Other',
};

const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Calves', 'Abs', 'Other'];
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

interface SheetSet {
  id: string; date: string; day: string; exercise: string; kg: number; reps: number;
  rir?: number | null; note?: string; slot?: string; muscle?: string;
}

async function toSheetSet(s: SetLog): Promise<SheetSet> {
  const ex = await exerciseLookup(s.exerciseId);
  return {
    id: s.id,
    date: s.date,
    day: DAY_NAMES[s.sessionId] ?? 'Other',
    exercise: ex?.name ?? s.exerciseId,
    kg: s.kg,
    reps: s.reps,
    note: s.note ?? '',
    slot: ex?.slot ?? 'Other',
    muscle: ex?.muscle,
  };
}

let inFlight: Promise<{ sent: number; ok: boolean }> | null = null;
let failures = 0;

/**
 * Sends queued set changes. POST text/plain JSON (no CORS preflight), redirect 'follow', batches of <= 50.
 * Warm-up sets are never sent: the Sheet has no warm-up column and its formulas would count them as working
 * sets. If a set that was already sent becomes a warm-up, it is sent as a delete so its row clears.
 */
export function flush(fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<{ sent: number; ok: boolean }> {
  inFlight ??= doFlush(fetchFn).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doFlush(fetchFn: typeof fetch): Promise<{ sent: number; ok: boolean }> {
  const settings = await loadSettings();
  if (!settings.scriptUrl || !settings.scriptKey) return { sent: 0, ok: false };
  let sent = 0;
  const held = new Set<string>(); // entries the bridge did not acknowledge: stay queued, retried by a later flush
  while (true) {
    const batch = (await getAll<QueueItem>('queue')).filter((q) => !held.has(q.id)).slice(0, BATCH_SIZE);
    if (batch.length === 0) break;
    const upserts: SheetSet[] = [];
    const deletes: string[] = [];
    const sentSets = new Map<string, number>(); // id -> updatedAt that was sent
    const orphans: string[] = []; // queue entries whose set no longer exists: nothing to send
    for (const q of batch) {
      const set = await get<SetLog>('sets', q.id);
      if (!set) {
        orphans.push(q.id);
        continue;
      }
      sentSets.set(set.id, set.updatedAt);
      if (q.op === 'delete' || set.deleted || set.warmup) deletes.push(q.id);
      else upserts.push(await toSheetSet(set));
    }
    let acked = new Set<string>(orphans);
    if (upserts.length || deletes.length) {
      const data = await post(fetchFn, settings.scriptUrl, { key: settings.scriptKey, upserts, deletes });
      if (!data) {
        failures++;
        scheduleRetry();
        return { sent, ok: false };
      }
      // Only ids the bridge lists as written (acked) or cleared (deleted) count; anything else is kept.
      for (const id of data.acked ?? []) acked.add(String(id));
      for (const id of data.deleted ?? []) acked.add(String(id));
    }
    const done = batch.filter((q) => acked.has(q.id));
    for (const q of batch) if (!acked.has(q.id)) held.add(q.id);
    await confirm(done, sentSets);
    sent += done.length;
  }
  if (held.size > 0) {
    failures++;
    scheduleRetry();
    return { sent, ok: false };
  }
  failures = 0;
  return { sent, ok: true };
}

interface BridgeReply { ok?: boolean; acked?: string[]; skipped?: string[]; deleted?: string[] }

async function post(fetchFn: typeof fetch, url: string, body: unknown): Promise<BridgeReply | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS) : undefined;
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl?.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BridgeReply;
    return data?.ok === true ? data : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** After a confirmed POST: drop queue entries that are still the ones we sent and mark the sets synced. */
async function confirm(batch: QueueItem[], sentSets: Map<string, number>): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['queue', 'sets'], 'readwrite');
  const queue = tx.objectStore('queue');
  const sets = tx.objectStore('sets');
  for (const q of batch) {
    const cur = (await queue.get(q.id)) as QueueItem | undefined;
    const set = (await sets.get(q.id)) as SetLog | undefined;
    const sentAt = sentSets.get(q.id);
    // Changed while the request was in flight (new op, or edited after we read it): keep for the next flush.
    if (cur && cur.op !== q.op) continue;
    if (set && sentAt !== undefined && set.updatedAt !== sentAt) continue;
    await queue.delete(q.id);
    if (set && !set.synced) await sets.put({ ...set, synced: true });
  }
  await tx.done;
}

export async function syncStatus(): Promise<'synced' | 'pending' | 'offline' | 'not-set-up'> {
  const s = await loadSettings();
  if (!s.scriptUrl || !s.scriptKey) return 'not-set-up';
  const pending = (await getAll<QueueItem>('queue')).length;
  if (pending === 0) return 'synced';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return 'pending';
}

// ---- first import ----------------------------------------------------------------------------

interface LogRow { id?: string; date: string; day: string; exercise: string; kg: number; reps: number; note?: string }
interface LibRow { name: string; muscle?: string; repMin?: number; repMax?: number }

function sessionFromDay(day: string, exerciseIds: string[]): SessionId {
  const d = norm(day).replace(/\s+/g, '');
  for (const [id, name] of Object.entries(DAY_NAMES)) if (id !== 'Other' && norm(name).replace(/\s+/g, '') === d) return id as SessionId;
  // Unknown label: the template sharing most exercises.
  let best: SessionId = 'CB-A';
  let bestN = -1;
  for (const t of TEMPLATES) {
    const n = t.items.filter((i) => exerciseIds.includes(i.exerciseId)).length;
    if (n > bestN) { best = t.id; bestN = n; }
  }
  return best;
}

const parseDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day, 12, 0, 0).getTime();
};

/** Pulls the Log from the Sheet into an empty app. Does nothing when any set already exists. */
export async function importFromSheet(fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<{ imported: number }> {
  const settings = await loadSettings();
  if (!settings.scriptUrl || !settings.scriptKey) return { imported: 0 };
  if ((await getAll<SetLog>('sets')).length > 0) return { imported: 0 };

  let data: { ok?: boolean; log?: LogRow[]; exercises?: LibRow[] };
  try {
    const sep = settings.scriptUrl.includes('?') ? '&' : '?';
    const res = await fetchFn(`${settings.scriptUrl}${sep}key=${encodeURIComponent(settings.scriptKey)}`, { redirect: 'follow' });
    if (!res.ok) return { imported: 0 };
    data = await res.json();
  } catch {
    return { imported: 0 };
  }
  if (data?.ok === false || !Array.isArray(data?.log)) return { imported: 0 };
  const rows = data.log.filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) && Number.isFinite(Number(r.reps)) && String(r.exercise ?? '').trim());

  // name -> exercise, creating custom ones for names the app does not know.
  const known = new Map((await listExercises()).map((e) => [norm(e.name), e]));
  const lib = new Map((data.exercises ?? []).map((e) => [norm(e.name), e]));
  const resolve = async (name: string): Promise<Exercise> => {
    const hit = known.get(norm(name));
    if (hit) return hit;
    const l = lib.get(norm(name));
    const repMin = l?.repMin && l.repMin >= 1 ? l.repMin : 8;
    const ex = await addCustomExercise({
      name, slot: 'Other', kind: 'isolation', step: 2.5,
      muscle: MUSCLES.includes(l?.muscle as Muscle) ? (l!.muscle as Muscle) : 'Other',
      repMin, repMax: Math.max(repMin, l?.repMax ?? 12), restSec: 120,
    });
    known.set(norm(name), ex);
    return ex;
  };

  const groups = new Map<string, { date: string; day: string; rows: (LogRow & { ex: Exercise })[] }>();
  for (const r of rows) {
    const ex = await resolve(String(r.exercise));
    const key = `${r.date}|${norm(r.day)}`;
    if (!groups.has(key)) groups.set(key, { date: r.date, day: r.day, rows: [] });
    groups.get(key)!.rows.push({ ...r, ex });
  }

  const workouts: Workout[] = [];
  const sets: SetLog[] = [];
  for (const g of groups.values()) {
    const sessionId = sessionFromDay(g.day, g.rows.map((r) => r.ex.id));
    const startedAt = parseDate(g.date);
    const workoutId = `import-${g.date}-${sessionId}`;
    workouts.push({ id: workoutId, date: g.date, sessionId, startedAt, endedAt: startedAt + g.rows.length * 60_000, swaps: {} });
    const counts = new Map<string, number>();
    g.rows.forEach((r, i) => {
      const setNo = (counts.get(r.ex.id) ?? 0) + 1;
      counts.set(r.ex.id, setNo);
      const doneAt = startedAt + (i + 1) * 60_000;
      sets.push({
        id: r.id ? String(r.id) : `import-${g.date}-${sessionId}-${r.ex.id}-${setNo}`,
        workoutId, date: g.date, sessionId, exerciseId: r.ex.id, setNo,
        kg: Number(r.kg) || 0, reps: Number(r.reps), warmup: false, feltIt: false,
        ...(r.note ? { note: String(r.note) } : {}),
        doneAt, updatedAt: doneAt, deleted: false, synced: true,
      });
    });
  }

  const db = await openDb();
  const tx = db.transaction(['sets', 'workouts'], 'readwrite');
  if ((await tx.objectStore('sets').count()) > 0) { await tx.done; return { imported: 0 }; }
  for (const w of workouts) tx.objectStore('workouts').put(w);
  for (const s of sets) tx.objectStore('sets').put(s);
  await tx.done;
  return { imported: sets.length };
}

// ---- auto sync -------------------------------------------------------------------------------

let started = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;

function scheduleRetry() {
  if (!started) return;
  clearTimeout(retry);
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
  retry = setTimeout(() => void flush(), delay);
}

/** Call after a queue write. No-op until startAutoSync() has run. Debounced by 2 s. */
export function scheduleFlush(): void {
  if (!started) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => void flush(), DEBOUNCE_MS);
}

export function startAutoSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush();
  });
  void flush();
  try {
    void navigator.serviceWorker?.ready
      .then((reg) => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register('flush'))
      .catch(() => {});
  } catch {
    /* Background Sync unavailable */
  }
}

/** Test hook. */
export function _resetSyncState(): void {
  started = false;
  failures = 0;
  inFlight = null;
  clearTimeout(debounce);
  clearTimeout(retry);
}
