/** Release velocity (px/ms) above which a downward drag dismisses the sheet. */
export const DISMISS_VELOCITY = 0.11;
/** Fraction of the sheet height that, once dragged past, dismisses it. */
export const DISMISS_FRACTION = 0.4;

/** Downward drags follow the finger; upward drags rubber-band as -sqrt(-dy) * 2. */
export function dragOffset(dy: number): number {
  return dy < 0 ? -Math.sqrt(-dy) * 2 : dy;
}

export type DragSample = [y: number, t: number];

/** Velocity in px/ms across the recent samples (positive = moving down). */
export function releaseVelocity(samples: DragSample[]): number {
  if (samples.length < 2) return 0;
  const a = samples[0];
  const b = samples[samples.length - 1];
  return (b[0] - a[0]) / Math.max(1, b[1] - a[1]);
}

export function shouldDismiss(velocity: number, dy: number, height: number): boolean {
  return velocity > DISMISS_VELOCITY || dy > height * DISMISS_FRACTION;
}
