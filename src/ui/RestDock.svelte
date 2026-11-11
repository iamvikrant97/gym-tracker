<script lang="ts">
  import { workout as defaultStore, type WorkoutStore } from '../lib/workout.svelte';
  import { buildCards, fmtClock, nextUp } from '../lib/workoutView';
  import { buzz } from '../lib/device';

  let { store = defaultStore }: { store?: WorkoutStore } = $props();

  const ends = $derived(store.restEndsAt);
  /** The rest started when the last set was done. */
  const startAt = $derived(store.sets.reduce((m, s) => Math.max(m, s.doneAt), 0));
  let skipped = $state<number | null>(null);
  const open = $derived(store.active && ends !== null && skipped !== ends);

  let now = $state(Date.now());
  // Never tick-counted: each frame reads the clock, so a backgrounded or reopened app is still right.
  $effect(() => {
    if (!open) return;
    const raf = globalThis.requestAnimationFrame?.bind(globalThis) ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number);
    const caf = globalThis.cancelAnimationFrame?.bind(globalThis) ?? ((id: number) => clearTimeout(id));
    let id = 0;
    const frame = () => {
      now = Date.now();
      id = raf(frame);
    };
    frame();
    return () => caf(id);
  });

  const left = $derived(ends === null ? 0 : ends - now);
  const over = $derived(open && left <= 0);
  const total = $derived(ends === null ? 1 : Math.max(1, ends - startAt));

  // Buzz once when a rest that was seen running reaches zero.
  let sawRunning: number | null = null;
  let buzzed: number | null = null;
  $effect(() => {
    if (!open || ends === null) return;
    if (left > 0) sawRunning = ends;
    else if (sawRunning === ends && buzzed !== ends) {
      buzzed = ends;
      buzz([20, 60, 20]);
    }
  });

  const nextText = $derived.by(() => {
    if (!open) return '';
    const n = nextUp(buildCards(store.plannedSets(), store.sets));
    if (!n) return 'Last set done · tap Finish';
    return `Next: ${store.exercise(n.exerciseId)?.name ?? 'exercise'}, set ${n.setNo}`;
  });

  function addTime() {
    if (store.restEndsAt === null) return;
    // Past zero, +15 counts from now rather than from the old end.
    store.restEndsAt = Math.max(store.restEndsAt, Date.now()) + 15_000;
  }
</script>

<div class="rest" class:open class:over role="status" aria-hidden={!open} inert={!open} data-testid="rest-dock">
  <div class="bar"><i style:transform="scaleX({over ? 1 : Math.max(0, Math.min(1, left / total))})"></i></div>
  <div class="t" data-testid="rest-time">{over ? `+${fmtClock(Math.floor(-left / 1000))}` : fmtClock(Math.ceil(left / 1000))}</div>
  <div class="lbl"><b>{over ? 'Rest over · go when ready' : 'Rest'}</b><span>{nextText}</span></div>
  <div class="ctl">
    <button type="button" class="press" aria-label="Add 15 seconds" onclick={addTime}>+15</button>
    <button type="button" class="skip press" onclick={() => (skipped = ends)}>Skip</button>
  </div>
</div>

<style>
  .rest {
    width: min(408px, calc(100% - 32px)); margin: 0 auto 8px; position: relative;
    display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 14px; border-radius: 16px;
    background: rgba(26, 30, 38, 0.9); border: 1px solid rgba(255, 255, 255, 0.07);
    backdrop-filter: blur(20px) saturate(170%); -webkit-backdrop-filter: blur(20px) saturate(170%);
    transform: translateY(calc(100% + 140px)); transition: transform 420ms var(--ease-drawer);
  }
  .rest.open { transform: translateY(0); }
  .t { font: 700 30px/1 var(--display); font-variant-numeric: tabular-nums; min-width: 62px; transition: color 200ms var(--ease-out); }
  .rest.over .t { color: var(--amber); }
  .lbl { flex: 1; min-width: 0; font-size: 12px; color: var(--muted); line-height: 1.3; }
  .lbl b { display: block; color: var(--text); font-weight: 500; font-size: 13px; }
  .lbl span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ctl { display: flex; gap: 6px; }
  .ctl button { height: 48px; min-width: 48px; padding: 0 10px; border-radius: 11px; background: rgba(255, 255, 255, 0.06); font-size: 13px; }
  .ctl .skip { background: var(--blue); color: #fff; font-weight: 600; }
  .bar { position: absolute; left: 14px; right: 14px; top: 0; height: 2px; overflow: hidden; border-radius: 2px; }
  .bar i { display: block; height: 100%; background: var(--blue); transform-origin: left; }
  .rest.over .bar i { background: var(--amber); }
  @media (prefers-reduced-motion: reduce) {
    .rest { transform: none; opacity: 0; pointer-events: none; transition: opacity 200ms ease; }
    .rest.open { opacity: 1; pointer-events: auto; }
  }
</style>
