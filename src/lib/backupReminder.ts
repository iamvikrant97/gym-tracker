// When the user last saved a backup file, and whether it is time to remind them. The time lives on this phone only
// (localStorage): it is not part of a backup, and clearing the app's data clears it together with the history.

const KEY = 'gym.lastBackup';
const DAY_MS = 86_400_000;
/** Never backed up: remind once the first logged set is this many days old (not on day one). */
export const FIRST_DUE_DAYS = 7;
/** Backed up before: remind again this many days after the last backup. */
export const REPEAT_DUE_DAYS = 14;

export function lastBackupAt(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function markBackedUp(now: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(now));
  } catch {
    // Private mode: the reminder just keeps showing.
  }
}

export interface BackupStatus {
  last: number | null;
  /** Whole days since the last backup, or since the first logged set when never backed up; null with no history. */
  days: number | null;
  /** There is history worth protecting and it has been too long. */
  due: boolean;
}

export function backupStatus(sets: { date: string; deleted?: boolean; warmup?: boolean }[], last: number | null, now: number): BackupStatus {
  const live = sets.filter((s) => !s.deleted && !s.warmup);
  if (live.length === 0) return { last, days: null, due: false };
  const first = live.reduce((d, s) => (s.date < d ? s.date : d), live[0].date);
  const anchor = last ?? new Date(`${first}T00:00:00`).getTime();
  const days = Math.floor((now - anchor) / DAY_MS);
  return { last, days, due: days >= (last ? REPEAT_DUE_DAYS : FIRST_DUE_DAYS) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Last backup: today", "…3 days ago (16 Nov)", or "Never backed up". */
export function lastBackupLabel(last: number | null, now: number): string {
  if (!last) return 'Never backed up';
  const d = new Date(last);
  const days = Math.max(0, Math.floor((now - last) / DAY_MS));
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago (${d.getDate()} ${MONTHS[d.getMonth()]})`;
  return `Last backup: ${when}`;
}
