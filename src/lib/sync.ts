// Sync client: pushes the set queue to the Apps Script bridge and does the first import from the Sheet.
// Queue entries are only removed after the bridge confirms them (ok:true), so a timeout or error never loses work.
import { addCustomExercise, exerciseLookup, get, getAll, listExercises, loadSettings, openDb, put } from './db';
import type { QueueItem } from './db';
import { TEMPLATES } from './seed';
import { IMPORT_ID_PREFIX } from './stats';
import type { Exercise, Muscle, SessionId, SetLog, Workout } from './types';

export const BATCH_SIZE = 50;
export const REQUEST_TIMEOUT_MS = 20_000;
/** Reading the Log: the first import also writes ids into a long hand-typed Sheet, so allow longer. */
export const IMPORT_TIMEOUT_MS = 90_000;
export const DEBOUNCE_MS = 2_000;
export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** After this many flushes in which the bridge skipped an entry, it stops blocking and is flagged "attention". */
export const ATTENTION_AFTER = 5;

const tuning = { requestMs: REQUEST_TIMEOUT_MS, importMs: IMPORT_TIMEOUT_MS, debounceMs: DEBOUNCE_MS, backoffBaseMs: BACKOFF_BASE_MS };
/** Test hook: shorten the timers. `_tune({})` restores the defaults. */
export function _tune(t: Partial<typeof tuning>): void {
  Object.assign(tuning, { requestMs: REQUEST_TIMEOUT_MS, importMs: IMPORT_TIMEOUT_MS, debounceMs: DEBOUNCE_MS, backoffBaseMs: BACKOFF_BASE_MS }, t);
}

export function backoffMs(failureCount: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (failureCount - 1), BACKOFF_MAX_MS);
}

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


// ---- attention bookkeeping (persisted so it survives a restart) --------------------------------

type Attempts = Record<string, { n: number; updatedAt: number }>;
async function loadAttempts(): Promise<Attempts> {
  return ((await get<{ key: string; value: Attempts }>('settings', 'syncAttempts'))?.value ?? {}) as Attempts;
}
const saveAttempts = (v: Attempts) => put('settings', { key: 'syncAttempts', value: v });

/** Queue entries the bridge keeps skipping. They stay queued and stay in the app; only the status shows them. */
export async function attentionIds(): Promise<string[]> {
  const attempts = await loadAttempts();
  const out: string[] = [];
  for (const q of await getAll<QueueItem>('queue')) {
    const a = attempts[q.id];
    if (!a || a.n < ATTENTION_AFTER) continue;
    const set = await get<SetLog>('sets', q.id);
    if (set && set.updatedAt === a.updatedAt) out.push(q.id);
  }
  return out;
}

// ---- flush -------------------------------------------------------------------------------------

type FlushResult = { sent: number; ok: boolean };
let inFlight: Promise<FlushResult> | null = null;
let dirty = false;
let failures = 0;

/**
 * Sends queued set changes. POST text/plain JSON (no CORS preflight), redirect 'follow', batches of <= 50, in
 * date / doneAt / setNo order (the Sheet's Set#, Last time and PR formulas depend on row order).
 * Warm-up sets are never sent: the Sheet has no warm-up column and its formulas would count them as working
 * sets. If a set that was already sent becomes a warm-up, it is sent as a delete so its row clears.
 * `keepalive` lets the request outlive a page that is being hidden or closed.
 */
export function flush(fetchFn: typeof fetch = (...a) => fetch(...a), opts: { keepalive?: boolean } = {}): Promise<FlushResult> {
  if (inFlight) {
    dirty = true; // something may have been queued after this run read the queue: run once more
    return inFlight;
  }
  const run = async (): Promise<FlushResult> => {
    let r = await doFlush(fetchFn, opts).catch(() => ({ sent: 0, ok: false })); // storage error: nothing lost, retried later
    while (dirty && r.ok) {
      dirty = false;
      const again = await doFlush(fetchFn, opts).catch(() => ({ sent: 0, ok: false }));
      r = { sent: r.sent + again.sent, ok: again.ok };
    }
    return r;
  };
  inFlight = run()
    .then(async (r) => {
      if (r.ok) await put('settings', { key: SYNC_META, value: { at: Date.now() } }).catch(() => undefined);
      return r;
    })
    .finally(() => {
      inFlight = null;
      dirty = false;
      notify();
    });
  return inFlight;
}

// ---- status for the UI ----------------------------------------------------------------------------

const SYNC_META = 'syncMeta';
const changeListeners = new Set<() => void>();
/** Called after every flush and whenever a change is queued, so the UI can re-read syncStatus(). Returns unsubscribe. */
export function onSyncChange(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}
function notify() {
  for (const cb of changeListeners) {
    try {
      cb();
    } catch {
      /* a listener must not break sync */
    }
  }
}

/** When the queue was last confirmed empty by a successful flush (epoch ms), or null. */
export async function lastSyncAt(): Promise<number | null> {
  return (await get<{ key: string; value: { at: number } }>('settings', SYNC_META))?.value?.at ?? null;
}

export type SyncState = 'synced' | 'pending' | 'offline' | 'attention' | 'not-set-up';

const clock = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** The short line Home shows next to the dot; warn turns the dot amber. */
export function syncLabel(state: SyncState, lastAt: number | null): { text: string; warn: boolean } {
  switch (state) {
    case 'synced':
      return { text: lastAt ? `Synced ${clock(lastAt)}` : 'Synced', warn: false };
    case 'pending':
      return { text: 'Saved on phone · syncing', warn: false };
    case 'offline':
      return { text: 'Offline · saved on phone', warn: true };
    case 'attention':
      return { text: 'Sheet needs a look', warn: true };
    default:
      return { text: 'Saved on phone', warn: false };
  }
}

/** Plain-language problem with a script URL, or null if it looks like a deployed web app. */
export function checkScriptUrl(url: string | undefined): string | null {
  const u = (url ?? '').trim();
  if (!u) return 'Paste the web app URL first';
  if (!/^https:\/\//.test(u)) return 'The URL must start with https://';
  if (/\/dev\/?$/.test(u)) return 'This is the test URL. Use the one from Deploy > New deployment (it ends in /exec)';
  if (!/\/exec\/?$/.test(u)) return 'The URL should end in /exec';
  return null;
}

type SheetData = { ok?: boolean; error?: string; log?: LogRow[]; exercises?: LibRow[] };
type SheetGet = { ok: true; data: SheetData } | { ok: false; error: string };

/**
 * POST {key, action:'import'} (text/plain, like flush): reads the whole Log. The key travels only in the body, never
 * in the URL (URLs end up in logs and history). Error text never contains the key.
 */
async function getSheet(fetchFn: typeof fetch, url: string, key: string): Promise<SheetGet> {
  const u = url.trim();
  const k = key.trim();
  const scrub = (msg: string) => (k ? msg.split(k).join('•••') : msg);
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  let timedOut = false;
  const timer = ctrl ? setTimeout(() => ((timedOut = true), ctrl.abort()), tuning.importMs) : undefined;
  let res: Response;
  try {
    res = await fetchFn(u, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: k, action: 'import' }),
      redirect: 'follow',
      signal: ctrl?.signal,
    });
  } catch {
    // The script keeps working after we stop waiting, and import is merged by id: trying again is safe.
    if (timedOut) return { ok: false, error: 'The Sheet is taking long (the first import does the most work). Wait a minute, then tap Try again. Nothing is duplicated' };
    return { ok: false, error: 'Could not reach the script. Check the internet connection and the URL' };
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) return { ok: false, error: `The script answered with an error (${res.status ?? 'HTTP'})` };
  let data: SheetData;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'That URL did not answer like the script. Check "Who has access: Anyone" and that you copied the /exec URL' };
  }
  if (data?.ok === false) {
    if (data.error === 'bad key') return { ok: false, error: 'The key does not match the one in the script' };
    if (data.error === 'busy') return { ok: false, error: 'The Sheet is busy. Try again in a minute' };
    return { ok: false, error: scrub(`The script reported a problem: ${String(data.error ?? 'unknown')}`) };
  }
  // An old script treats {action:'import'} as an empty batch of sets and answers with a write receipt, no log.
  if (data?.ok === true && !Array.isArray(data.log) && typeof (data as { written?: unknown }).written === 'number') {
    return { ok: false, error: 'Update your Apps Script to the latest version and redeploy' };
  }
  if (!Array.isArray(data?.log)) return { ok: false, error: 'That URL did not answer like the script' };
  return { ok: true, data };
}

/** Checks the saved URL and key against the script without changing anything in the app. */
export async function testConnection(fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<{ ok: true; rows: number } | { ok: false; error: string }> {
  const s = await loadSettings();
  const bad = checkScriptUrl(s.scriptUrl);
  if (bad) return { ok: false, error: bad };
  if (!s.scriptKey?.trim()) return { ok: false, error: 'Paste the key first' };
  const r = await getSheet(fetchFn, s.scriptUrl!, s.scriptKey);
  return r.ok ? { ok: true, rows: r.data.log!.length } : r;
}

const sortKey = (s: SetLog) => [s.date, s.doneAt, s.setNo] as const;
function bySheetOrder(a: SetLog | undefined, b: SetLog | undefined): number {
  if (!a || !b) return a ? 1 : b ? -1 : 0; // orphans first (nothing to send)
  const [ad, at, an] = sortKey(a);
  const [bd, bt, bn] = sortKey(b);
  return ad < bd ? -1 : ad > bd ? 1 : at - bt || an - bn;
}

async function doFlush(fetchFn: typeof fetch, opts: { keepalive?: boolean }): Promise<FlushResult> {
  const settings = await loadSettings();
  if (!settings.scriptUrl || !settings.scriptKey) return { sent: 0, ok: false };
  let sent = 0;
  const held = new Set<string>(); // not acknowledged this flush: stay queued, retried by a later flush
  const skippedNow = new Set<string>();
  const attempts = await loadAttempts();
  const parked = new Set(await attentionIds()); // skipped too often: stay queued but do not block
  while (true) {
    const entries = (await getAll<QueueItem>('queue')).filter((q) => !held.has(q.id) && !parked.has(q.id));
    const withSets = await Promise.all(entries.map(async (q) => ({ q, set: await get<SetLog>('sets', q.id) })));
    withSets.sort((a, b) => bySheetOrder(a.set, b.set));
    const batch = withSets.slice(0, BATCH_SIZE);
    if (batch.length === 0) break;
    const upserts: SheetSet[] = [];
    const deletes: string[] = [];
    const sentSets = new Map<string, number>(); // id -> updatedAt that was sent
    const acked = new Set<string>();
    for (const { q, set } of batch) {
      if (!set) {
        acked.add(q.id); // nothing to send; the queue entry is dropped
        continue;
      }
      sentSets.set(set.id, set.updatedAt);
      if (q.op === 'delete' || set.deleted || set.warmup) deletes.push(q.id);
      else upserts.push(await toSheetSet(set));
    }
    if (upserts.length || deletes.length) {
      const data = await post(fetchFn, settings.scriptUrl, { key: settings.scriptKey, upserts, deletes }, opts.keepalive);
      if (!data) {
        failures++;
        scheduleRetry();
        return { sent, ok: false };
      }
      // Only ids the bridge lists as written (acked) or cleared (deleted) count; anything else is kept.
      for (const id of data.acked ?? []) acked.add(String(id));
      for (const id of data.deleted ?? []) acked.add(String(id));
      for (const id of data.skipped ?? []) skippedNow.add(String(id));
    }
    const queueEntries = batch.map((b) => b.q);
    const done = queueEntries.filter((q) => acked.has(q.id));
    for (const q of queueEntries) if (!acked.has(q.id)) held.add(q.id);
    await confirm(done, sentSets);
    sent += done.length;
  }
  // Count skips (per set version) so an entry the bridge never accepts eventually stops blocking.
  let changed = false;
  for (const id of held) {
    if (!skippedNow.has(id)) continue;
    const set = await get<SetLog>('sets', id);
    const prev = attempts[id];
    attempts[id] = { n: (prev && prev.updatedAt === set?.updatedAt ? prev.n : 0) + 1, updatedAt: set?.updatedAt ?? 0 };
    changed = true;
  }
  for (const id of Object.keys(attempts)) if (!held.has(id) && !parked.has(id)) { delete attempts[id]; changed = true; }
  if (changed) await saveAttempts(attempts);
  const stillBlocking = [...held].some((id) => !(attempts[id] && attempts[id].n >= ATTENTION_AFTER));
  if (stillBlocking) {
    failures++;
    scheduleRetry();
    return { sent, ok: false };
  }
  failures = 0;
  return { sent, ok: true };
}

interface BridgeReply { ok?: boolean; acked?: string[]; skipped?: string[]; deleted?: string[] }

async function post(fetchFn: typeof fetch, url: string, body: unknown, keepalive?: boolean): Promise<BridgeReply | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), tuning.requestMs) : undefined;
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl?.signal,
      ...(keepalive ? { keepalive: true } : {}),
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

export async function syncStatus(): Promise<SyncState> {
  const s = await loadSettings();
  if (!s.scriptUrl || !s.scriptKey) return 'not-set-up';
  const queued = await getAll<QueueItem>('queue');
  if (queued.length === 0) return 'synced';
  const parked = new Set(await attentionIds());
  const blocking = queued.filter((q) => !parked.has(q.id)).length;
  if (blocking === 0) return 'attention';
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

type ImportInfo = { imported: number; customExercises: Exercise[] };
const importListeners = new Set<(info: ImportInfo) => void>();
/** Called after an import added sets, with the full custom-exercise list (so caches can refresh). Returns unsubscribe. */
export function onImported(cb: (info: ImportInfo) => void): () => void {
  importListeners.add(cb);
  return () => importListeners.delete(cb);
}

/**
 * Pulls the Log from the Sheet and merges it by set id: rows whose id the app already has (including deleted
 * ones) are skipped, so it is safe to run any time and any number of times.
 */
export async function importFromSheet(fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<{ imported: number; ok: boolean; error?: string }> {
  const settings = await loadSettings();
  if (!settings.scriptUrl || !settings.scriptKey) return { imported: 0, ok: false, error: 'Add the script URL and key first' };

  const got = await getSheet(fetchFn, settings.scriptUrl, settings.scriptKey);
  if (!got.ok) return { imported: 0, ok: false, error: got.error };
  const data = got.data as { log: LogRow[]; exercises?: LibRow[] };

  const idOf = (r: LogRow) => (r.id ? String(r.id) : '');
  const haveIds = new Set((await getAll<SetLog>('sets')).map((x) => x.id));
  const rows = data.log.filter(
    (r) => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) && Number.isFinite(Number(r.reps)) && String(r.exercise ?? '').trim() && !haveIds.has(idOf(r)),
  );
  if (rows.length === 0) return { imported: 0, ok: true };

  // name -> exercise, creating custom ones only for rows that will be imported.
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

  const db = await openDb();
  const tx = db.transaction(['sets', 'workouts'], 'readwrite');
  const setsStore = tx.objectStore('sets');
  const workoutsStore = tx.objectStore('workouts');
  const existingIds = new Set(((await setsStore.getAllKeys()) as string[]).map(String)); // re-checked inside the transaction
  const existingWorkouts = (await workoutsStore.getAll()) as Workout[];
  let imported = 0;
  for (const g of groups.values()) {
    const sessionId = sessionFromDay(g.day, g.rows.map((r) => r.ex.id));
    // Join the app's own workout of that day and session if there is one, else a deterministic import workout.
    const own = existingWorkouts.find((w) => w.date === g.date && w.sessionId === sessionId);
    const startedAt = own?.startedAt ?? parseDate(g.date);
    const workoutId = own?.id ?? `${IMPORT_ID_PREFIX}${g.date}-${sessionId}`;
    if (!own) workoutsStore.put({ id: workoutId, date: g.date, sessionId, startedAt, endedAt: startedAt + g.rows.length * 60_000, swaps: {} } satisfies Workout);
    const counts = new Map<string, number>();
    g.rows.forEach((r, i) => {
      const setNo = (counts.get(r.ex.id) ?? 0) + 1;
      counts.set(r.ex.id, setNo);
      const id = idOf(r) || `import-${g.date}-${sessionId}-${r.ex.id}-${setNo}`;
      if (existingIds.has(id)) return;
      existingIds.add(id);
      const doneAt = startedAt + (i + 1) * 60_000;
      setsStore.put({
        id, workoutId, date: g.date, sessionId, exerciseId: r.ex.id, setNo,
        kg: Number(r.kg) || 0, reps: Number(r.reps), warmup: false, feltIt: false,
        ...(r.note ? { note: String(r.note) } : {}),
        doneAt, updatedAt: doneAt, deleted: false, synced: true,
      } satisfies SetLog);
      imported++;
    });
  }
  await tx.done;
  if (imported > 0) {
    const info = { imported, customExercises: await getAll<Exercise>('customExercises') };
    for (const cb of importListeners) cb(info);
  }
  return { imported, ok: true };
}

// ---- auto sync -------------------------------------------------------------------------------

let started = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;

function scheduleRetry() {
  if (!started) return;
  clearTimeout(retry);
  const delay = Math.min(tuning.backoffBaseMs * 2 ** (failures - 1), BACKOFF_MAX_MS);
  retry = setTimeout(() => void flush(), delay);
}

/** Call after a queue write. No-op until startAutoSync() has run. Debounced (2 s). */
export function scheduleFlush(): void {
  notify(); // something was queued: the status is no longer "Synced"
  if (!started) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => void flush(), tuning.debounceMs);
}

export function startAutoSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => void flush());
  window.addEventListener('offline', notify);
  // Leaving the page (switching to Spotify, closing the tab): send what is queued now, with keepalive.
  window.addEventListener('pagehide', () => void flush(undefined, { keepalive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush();
    else void flush(undefined, { keepalive: true });
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
  dirty = false;
  clearTimeout(debounce);
  clearTimeout(retry);
}
