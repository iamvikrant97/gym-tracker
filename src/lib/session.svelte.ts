import { keepAwake, persistOnce } from './device';
import { workout as defaultStore, type WorkoutStore } from './workout.svelte';

export const AUTO_END_CHECK_MS = 60_000;

/**
 * App-wide effects of an open workout: screen kept awake while one is active, the 15-min auto-end
 * rule checked every minute and whenever the page becomes visible, storage persistence asked once.
 * Returns a cleanup.
 */
export function watchWorkout(store: WorkoutStore = defaultStore): () => void {
  persistOnce();
  const stopEffects = $effect.root(() => {
    $effect(() => {
      void keepAwake(store.active);
    });
  });
  const check = () => {
    if (store.active) store.checkAutoEnd().catch(() => undefined);
  };
  const timer = setInterval(check, AUTO_END_CHECK_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopEffects();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    void keepAwake(false);
  };
}
