import { requestPersist } from './db';

let sentinel: WakeLockSentinel | null = null;
let wanted = false;
let listening = false;

async function acquire(): Promise<void> {
  if (sentinel && !sentinel.released) return;
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || !navigator.wakeLock) return;
  try {
    const s = await navigator.wakeLock.request('screen');
    sentinel = s;
    s.addEventListener?.('release', () => {
      if (sentinel === s) sentinel = null;
    });
    // Turned off while the request was in flight.
    if (!wanted) await release();
  } catch {
    /* denied (battery saver, not visible): try again on the next visibilitychange */
  }
}

async function release(): Promise<void> {
  const s = sentinel;
  sentinel = null;
  try {
    await s?.release();
  } catch {
    /* already released */
  }
}

function onVisibility() {
  // The browser drops the lock whenever the page is hidden; take it back on return.
  if (wanted && document.visibilityState === 'visible') void acquire();
}

/** Keeps the screen on (Wake Lock API) while `on`; re-acquires after the page becomes visible again. */
export async function keepAwake(on: boolean): Promise<void> {
  wanted = on;
  if (!listening && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    listening = true;
  }
  if (on) await acquire();
  else await release();
}

/** Vibrates if the device supports it; never throws. */
export function buzz(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

let persistAsked = false;
/** Asks once per page load for persistent storage, so Chrome does not evict the workout log. */
export function persistOnce(): void {
  if (persistAsked) return;
  persistAsked = true;
  void requestPersist();
}
