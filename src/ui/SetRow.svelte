<script lang="ts" module>
  export type Field = 'kg' | 'reps';

  /** Long-press on the set number toggles warm-up. */
  export const LONG_PRESS_MS = 500;
  /** Horizontal swipe on a value: starts after 10 px, one step per 22 px. */
  export const SWIPE_THRESHOLD = 10;
  export const SWIPE_STEP = 22;
  /** Swipe a done row this far left to delete it. */
  export const DELETE_DISTANCE = 80;
</script>

<script lang="ts">
  import { buzz } from '../lib/device';
  import { fmtKg } from '../lib/workoutView';
  import type { SetLog } from '../lib/types';

  let {
    setNo,
    done = null,
    warmup = false,
    pendingWarmup = false,
    kg,
    reps,
    ghost = true,
    last = null,
    pr = false,
    next = false,
    perArm = false,
    leg = false,
    oncheck,
    onadjust,
    onbump,
    ontogglewarmup,
    onfelt,
    ondelete,
  }: {
    setNo: number;
    done?: SetLog | null;
    warmup?: boolean;
    pendingWarmup?: boolean;
    kg: number | null;
    reps: number | null;
    ghost?: boolean;
    last?: SetLog | null;
    pr?: boolean;
    next?: boolean;
    perArm?: boolean;
    leg?: boolean;
    oncheck: () => void;
    onadjust: (field: Field) => void;
    onbump: (field: Field, delta: number) => void;
    ontogglewarmup: () => void;
    onfelt?: () => void;
    ondelete: () => void;
  } = $props();

  const isDone = $derived(!!done);
  const label = $derived(warmup || pendingWarmup ? 'W' : String(setNo));
  const name = $derived(warmup || pendingWarmup ? 'warm-up set' : `set ${setNo}`);

  // ---- swipe a value to step it (rows not yet done) ----
  let dragging = $state<Field | null>(null);
  let vx0 = 0;
  let acc = 0;
  let moved = false;
  let vpid: number | null = null;

  function valDown(e: PointerEvent) {
    if (isDone) return;
    e.stopPropagation();
    vx0 = e.clientX;
    acc = 0;
    moved = false;
    vpid = e.pointerId;
  }
  function valMove(e: PointerEvent, f: Field) {
    if (isDone || vpid !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - vx0;
    if (!moved && Math.abs(dx) > SWIPE_THRESHOLD) {
      moved = true;
      dragging = f;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (moved) {
      const steps = Math.trunc(dx / SWIPE_STEP);
      if (steps !== acc) {
        onbump(f, steps - acc);
        acc = steps;
        buzz(4);
      }
    }
  }
  function valEnd() {
    vpid = null;
    dragging = null;
  }
  function valClick(f: Field) {
    if (moved || suppress) {
      moved = false;
      return;
    }
    onadjust(f);
  }

  // ---- swipe a done row left to delete ----
  let swipeX = $state(0);
  let rowSwiping = $state(false);
  let rx0 = 0;
  let ry0 = 0;
  let rpid: number | null = null;
  let suppress = false;

  function rowDown(e: PointerEvent) {
    if (!isDone) return;
    rx0 = e.clientX;
    ry0 = e.clientY;
    rpid = e.pointerId;
    suppress = false;
  }
  function rowMove(e: PointerEvent) {
    if (!isDone || rpid !== e.pointerId) return;
    const dx = e.clientX - rx0;
    const dy = e.clientY - ry0;
    if (!rowSwiping && dx < -SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      rowSwiping = true;
      suppress = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (rowSwiping) swipeX = Math.min(0, dx);
  }
  function rowUp() {
    rpid = null;
    if (!rowSwiping) return;
    const go = swipeX <= -DELETE_DISTANCE;
    rowSwiping = false;
    swipeX = 0;
    if (go) ondelete();
    // The click that follows a swipe must not open the sheet.
    setTimeout(() => (suppress = false), 0);
  }

  // ---- long-press the set number ----
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let fired = false;
  let sx0 = 0;
  function snDown(e: PointerEvent) {
    fired = false;
    sx0 = e.clientX;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      fired = true;
      buzz(10);
      ontogglewarmup();
    }, LONG_PRESS_MS);
  }
  function snMove(e: PointerEvent) {
    if (Math.abs(e.clientX - sx0) > SWIPE_THRESHOLD) clearTimeout(pressTimer);
  }
  function snCancel() {
    clearTimeout(pressTimer);
  }
  function snClick(e: MouseEvent) {
    if (fired) {
      fired = false;
      return;
    }
    // Keyboard (Enter / Space) toggles straight away.
    if (e.detail === 0) ontogglewarmup();
  }

  function chkClick() {
    if (suppress) return;
    if (isDone) ondelete();
    else oncheck();
  }
</script>

<div class="wrap" class:swiping={rowSwiping}>
  {#if isDone}<span class="del" aria-hidden="true" style:opacity={Math.min(1, -swipeX / DELETE_DISTANCE)}>Delete</span>{/if}
  <!-- Swipe-left-to-delete is a shortcut; the ✓ button does the same for keyboard and screen readers. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="set"
    class:done={isDone}
    class:next={next && !isDone}
    class:warm={warmup || pendingWarmup}
    style:transform={swipeX ? `translateX(${swipeX}px)` : undefined}
    style:transition={rowSwiping ? 'none' : undefined}
    onpointerdown={rowDown}
    onpointermove={rowMove}
    onpointerup={rowUp}
    onpointercancel={rowUp}
    data-testid="set-row"
  >
    <span class="fill" aria-hidden="true"></span>
    <button
      class="sn"
      type="button"
      aria-label="{warmup || pendingWarmup ? 'Warm-up' : `Set ${setNo}`}, hold to {warmup || pendingWarmup ? 'make it a working set' : 'mark as warm-up'}"
      onpointerdown={snDown}
      onpointermove={snMove}
      onpointerup={snCancel}
      onpointerleave={snCancel}
      onpointercancel={snCancel}
      oncontextmenu={(e) => e.preventDefault()}
      onclick={snClick}>{label}</button
    >
    <span class="prev">
      {last ? `${fmtKg(last.kg)} × ${last.reps}` : '–'}<span class="pr" class:show={pr}>PR</span>
    </span>
    <button
      class="val"
      class:ghost={ghost && !isDone}
      class:dragging={dragging === 'kg'}
      type="button"
      aria-label="kg, {name}: {kg === null ? 'not set' : fmtKg(kg)}. Tap to change{isDone ? '' : ', swipe sideways to step'}"
      onpointerdown={valDown}
      onpointermove={(e) => valMove(e, 'kg')}
      onpointerup={valEnd}
      onpointercancel={valEnd}
      onclick={() => valClick('kg')}
    >
      {kg === null ? '–' : fmtKg(kg)}
      {#if perArm}<span class="arm">per arm</span>{/if}
      <span class="hint" aria-hidden="true">swipe</span>
    </button>
    <button
      class="val"
      class:ghost={ghost && !isDone}
      class:dragging={dragging === 'reps'}
      type="button"
      aria-label="reps, {name}: {reps === null ? 'not set' : reps}. Tap to change{isDone ? '' : ', swipe sideways to step'}"
      onpointerdown={valDown}
      onpointermove={(e) => valMove(e, 'reps')}
      onpointerup={valEnd}
      onpointercancel={valEnd}
      onclick={() => valClick('reps')}
    >
      {reps === null ? '–' : reps}
      <span class="hint" aria-hidden="true">swipe</span>
    </button>
    <button class="chk" type="button" aria-pressed={isDone} aria-label={isDone ? `Remove ${name}` : `Complete ${name}`} onclick={chkClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </button>
  </div>
</div>
{#if leg && done && !warmup}
  <div class="felt-row">
    <button class="felt" type="button" aria-pressed={done.feltIt} onclick={onfelt}>Felt it</button>
  </div>
{/if}

<style>
  .wrap { position: relative; }
  .del {
    position: absolute; right: 4px; top: 0; bottom: 0; display: flex; align-items: center;
    font-size: 13px; font-weight: 600; color: var(--muted); pointer-events: none;
  }
  .set {
    position: relative; display: grid; grid-template-columns: 28px 1fr 66px 54px 48px; align-items: center;
    column-gap: 8px; padding: 4px 0; touch-action: pan-y; transition: transform 260ms var(--ease-out);
    font-variant-numeric: tabular-nums; background: var(--surface);
  }
  .set > :not(.fill) { position: relative; }
  .fill {
    position: absolute; inset: 1px -8px; border-radius: 9px; background: var(--blue-deep);
    clip-path: inset(0 100% 0 0 round 9px); transition: clip-path 300ms var(--ease-out); pointer-events: none;
  }
  .set.done .fill { clip-path: inset(0 0 0 0 round 9px); }
  .sn {
    width: 40px; height: 48px; margin-left: -8px; text-align: center; border-radius: 10px;
    font: 600 15px/1 var(--display); color: var(--muted); user-select: none; -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .set.next .sn { color: var(--blue); }
  .set.warm .sn { color: var(--amber); }
  .prev { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; }
  .set.done .prev { color: #a9b6d3; }
  .pr {
    margin-left: 6px; font: 600 11px/1 var(--body); color: #1a1406; background: var(--amber); border-radius: 4px;
    padding: 3px 5px; opacity: 0; display: inline-block; transform: translateY(4px);
    transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out);
  }
  .pr.show { opacity: 1; transform: none; }
  .val {
    height: 48px; border-radius: 9px; background: var(--raised); font: 600 18px/1 var(--display); text-align: center;
    touch-action: pan-y; user-select: none; -webkit-user-select: none; position: relative; overflow: hidden;
    transition: background 200ms var(--ease-out); font-variant-numeric: tabular-nums;
  }
  .val.ghost { color: #9aa2b0; }
  .set.done .val { background: transparent; color: var(--blue-ink); }
  .val .hint, .val .arm {
    position: absolute; inset: auto 0 3px 0; font: 500 10px/1 var(--body); color: #c3c9d3;
  }
  .val .hint { opacity: 0; transition: opacity 160ms; }
  .val .arm { color: var(--muted); }
  .val.dragging { background: #232936; }
  .val.dragging .hint { opacity: 1; }
  .val.dragging .arm { opacity: 0; }
  .chk {
    width: 48px; height: 48px; border-radius: 11px; background: var(--raised); display: grid; place-items: center;
    transition: transform 160ms var(--ease-out), background 200ms var(--ease-out);
  }
  .chk:active { transform: scale(0.94); }
  .chk svg { width: 20px; height: 20px; stroke: #7a8291; transition: stroke 200ms; }
  .set.done .chk { background: var(--blue); }
  .set.done .chk svg { stroke: #fff; }
  .felt-row { display: flex; padding: 0 0 4px 36px; }
  .felt {
    position: relative; height: 30px; padding: 0 12px; border-radius: 15px; font-size: 12px; color: var(--muted);
    background: var(--raised); transition: background 200ms var(--ease-out), color 200ms var(--ease-out);
  }
  /* 48 px hit area around a compact pill. */
  .felt::before { content: ''; position: absolute; inset: -9px -4px; }
  .felt[aria-pressed='true'] { background: var(--blue-deep); color: var(--blue-ink); }
  @media (prefers-reduced-motion: reduce) {
    .set { transition: none; }
    .fill { clip-path: none; opacity: 0; transition: opacity 200ms ease; }
    .set.done .fill { opacity: 1; }
    .pr { transform: none; transition: opacity 200ms ease; }
    .chk:active { transform: none; }
  }
</style>
