/** Release velocity (px/ms) above which a downward flick dismisses the sheet. */
export const DISMISS_VELOCITY = 0.11;
/** A flick must also travel at least this far (px), so a tap with finger drift never closes. */
export const MIN_FLICK_TRAVEL = 24;
/** Fraction of the sheet height that, once dragged past, dismisses it. */
export const DISMISS_FRACTION = 0.4;
/** Only samples this recent (ms) count towards release velocity. */
export const VELOCITY_WINDOW_MS = 100;

/** Downward drags follow the finger; upward drags rubber-band as -sqrt(-dy) * 2. */
export function dragOffset(dy: number): number {
  return dy < 0 ? -Math.sqrt(-dy) * 2 : dy;
}

export type DragSample = [y: number, t: number];

/** Velocity in px/ms (positive = down) over samples from the last 100 ms before `now`; 0 if the finger paused. */
export function releaseVelocity(samples: DragSample[], now: number): number {
  const recent = samples.filter(([, t]) => now - t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return 0;
  const a = recent[0];
  const b = recent[recent.length - 1];
  return (b[0] - a[0]) / Math.max(1, b[1] - a[1]);
}

export function shouldDismiss(velocity: number, dy: number, height: number): boolean {
  return (velocity > DISMISS_VELOCITY && dy >= MIN_FLICK_TRAVEL) || dy > height * DISMISS_FRACTION;
}
