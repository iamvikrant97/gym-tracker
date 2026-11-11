<script lang="ts" module>
  /** Hold a ± button: one step at once, then repeat after 450 ms every 90 ms. */
  export const HOLD_DELAY_MS = 450;
  export const REPEAT_MS = 90;
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import Sheet from './Sheet.svelte';
  import { buzz } from '../lib/device';
  import { dropSet, fmtKg, round2 } from '../lib/workoutView';

  type Field = 'kg' | 'reps';

  let {
    open,
    title,
    sub = '',
    kg = $bindable(0),
    reps = $bindable(0),
    step,
    last = null,
    perArm = false,
    onsave,
    onclose,
  }: {
    open: boolean;
    title: string;
    sub?: string;
    kg?: number;
    reps?: number;
    step: number;
    last?: { kg: number; reps: number } | null;
    perArm?: boolean;
    onsave: (kg: number, reps: number) => void;
    onclose: () => void;
  } = $props();

  function change(f: Field, d: number) {
    if (f === 'kg') kg = Math.max(0, round2(kg + d * step));
    else reps = Math.max(1, reps + d);
    buzz(6);
  }

  let delay: ReturnType<typeof setTimeout> | undefined;
  let repeat: ReturnType<typeof setInterval> | undefined;
  function stop() {
    clearTimeout(delay);
    clearInterval(repeat);
  }
  function hold(e: PointerEvent, f: Field, d: number) {
    e.preventDefault();
    stop();
    change(f, d);
    delay = setTimeout(() => {
      repeat = setInterval(() => change(f, d), REPEAT_MS);
    }, HOLD_DELAY_MS);
  }
  function keyClick(e: MouseEvent, f: Field, d: number) {
    // Pointer presses are handled on pointerdown; this is Enter / Space.
    if (e.detail === 0) change(f, d);
  }
  function spinKey(e: KeyboardEvent, f: Field) {
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    change(f, d);
  }

  $effect(() => {
    if (!open) stop();
  });
  onDestroy(stop);
</script>

<Sheet {open} {onclose} {title} {sub}>
  <div class="stepper">
    <button class="sb" type="button" aria-label="Less weight" onpointerdown={(e) => hold(e, 'kg', -1)} onpointerup={stop} onpointerleave={stop} onpointercancel={stop} onclick={(e) => keyClick(e, 'kg', -1)}>−</button>
    <div class="big" role="spinbutton" tabindex="0" aria-label="Weight in kg" aria-valuenow={kg} aria-valuemin={0} aria-valuetext="{fmtKg(kg)} kg" onkeydown={(e) => spinKey(e, 'kg')}>
      <span data-testid="adjust-kg">{fmtKg(kg)}</span><small>kg{perArm ? ' per arm' : ''} · steps of {fmtKg(step)}</small>
    </div>
    <button class="sb" type="button" aria-label="More weight" onpointerdown={(e) => hold(e, 'kg', 1)} onpointerup={stop} onpointerleave={stop} onpointercancel={stop} onclick={(e) => keyClick(e, 'kg', 1)}>+</button>
  </div>
  <div class="stepper">
    <button class="sb" type="button" aria-label="Fewer reps" onpointerdown={(e) => hold(e, 'reps', -1)} onpointerup={stop} onpointerleave={stop} onpointercancel={stop} onclick={(e) => keyClick(e, 'reps', -1)}>−</button>
    <div class="big" role="spinbutton" tabindex="0" aria-label="Reps" aria-valuenow={reps} aria-valuemin={1} onkeydown={(e) => spinKey(e, 'reps')}>
      <span data-testid="adjust-reps">{reps}</span><small>reps</small>
    </div>
    <button class="sb" type="button" aria-label="More reps" onpointerdown={(e) => hold(e, 'reps', 1)} onpointerup={stop} onpointerleave={stop} onpointercancel={stop} onclick={(e) => keyClick(e, 'reps', 1)}>+</button>
  </div>
  <div class="chips">
    <button class="chip press" type="button" disabled={!last} onclick={() => last && ((kg = last.kg), (reps = last.reps))}>Same as last</button>
    <button class="chip press" type="button" onclick={() => (kg = round2(kg + step))}>+1 step</button>
    <button class="chip press" type="button" onclick={() => (kg = dropSet(kg, step))}>Drop set</button>
  </div>
  <button class="save press" type="button" onclick={() => onsave(kg, reps)}>Save set</button>
</Sheet>

<style>
  .stepper { display: grid; grid-template-columns: 64px 1fr 64px; align-items: center; gap: 10px; margin: 8px 0; }
  .sb {
    width: 64px; height: 64px; border-radius: 16px; background: var(--raised); font: 600 30px/1 var(--display);
    display: grid; place-items: center; touch-action: manipulation; user-select: none; -webkit-user-select: none;
    transition: transform 120ms var(--ease-out), background 120ms;
  }
  .sb:active { transform: scale(0.95); background: #252a35; }
  .big { text-align: center; font: 700 52px/1 var(--display); font-variant-numeric: tabular-nums; border-radius: 12px; outline: none; }
  .big:focus-visible { outline: 2px solid var(--blue); }
  .big small { display: block; font: 500 12px/1.4 var(--body); color: var(--muted); }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 18px; }
  .chip { height: 48px; padding: 0 16px; border-radius: 24px; background: var(--raised); font-size: 13.5px; }
  .chip:disabled { opacity: 0.4; }
  .save { width: 100%; height: 56px; border-radius: 14px; background: var(--blue); color: #fff; font-weight: 600; font-size: 16px; }
  @media (prefers-reduced-motion: reduce) {
    .sb { transition: background 120ms; }
    .sb:active { transform: none; }
  }
</style>
