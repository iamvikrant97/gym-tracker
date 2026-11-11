<script lang="ts">
  import type { Snippet } from 'svelte';
  import { dragOffset, releaseVelocity, shouldDismiss, type DragSample } from './sheetDrag';

  let {
    open,
    onclose,
    title,
    sub,
    children,
  }: { open: boolean; onclose: () => void; title: string; sub?: string; children?: Snippet } = $props();

  const uid = $props.id();
  let el: HTMLDivElement | undefined = $state();
  let opener: HTMLElement | null = null;
  let dragging = $state(false);
  let dragY = $state(0);
  let y0 = 0;
  let samples: DragSample[] = [];

  // Remember the opener on open, hand focus to the sheet, and give it back on close.
  $effect(() => {
    if (open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el?.focus({ preventScroll: true });
    } else if (opener) {
      const back = opener;
      opener = null;
      back.focus({ preventScroll: true });
    }
  });

  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    dragging = true;
    dragY = 0;
    y0 = e.clientY;
    samples = [[e.clientY, e.timeStamp]];
    el?.setPointerCapture?.(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    dragY = dragOffset(e.clientY - y0);
    samples.push([e.clientY, e.timeStamp]);
    if (samples.length > 5) samples.shift();
  }
  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const dy = e.clientY - y0;
    const v = releaseVelocity(samples);
    dragY = 0;
    if (shouldDismiss(v, dy, el?.offsetHeight ?? 0)) onclose();
  }
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && onclose()} />

<div class="scrim" class:open onclick={onclose} aria-hidden="true"></div>
<div
  class="sheet"
  class:open
  bind:this={el}
  role="dialog"
  aria-modal="true"
  aria-labelledby="{uid}-title"
  aria-hidden={!open}
  inert={!open}
  tabindex="-1"
  style:transform={dragging ? `translate(-50%, ${dragY}px)` : undefined}
  style:transition={dragging ? 'none' : undefined}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
>
  <div class="grab" aria-hidden="true"></div>
  <h2 id="{uid}-title">{title}</h2>
  {#if sub}<p class="sub">{sub}</p>{/if}
  {@render children?.()}
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 20; background: rgba(0, 0, 0, 0.5);
    opacity: 0; pointer-events: none; transition: opacity 300ms var(--ease-out);
  }
  .scrim.open { opacity: 1; pointer-events: auto; }
  .sheet {
    position: fixed; left: 50%; bottom: 0; z-index: 21; width: min(440px, 100%);
    max-height: 88vh; overflow-y: auto; touch-action: pan-x;
    background: var(--surface); border: 1px solid var(--line); border-bottom: 0;
    border-radius: 22px 22px 0 0; padding: 8px 18px 26px; outline: none;
    transform: translate(-50%, 100%); transition: transform 420ms var(--ease-drawer);
  }
  .sheet.open { transform: translate(-50%, 0); }
  .grab { width: 40px; height: 5px; border-radius: 3px; background: #3a404c; margin: 4px auto 14px; }
  h2 { font: 800 21px/1.15 var(--body); margin: 0 0 4px; }
  .sub { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
  @media (prefers-reduced-motion: reduce) {
    .scrim, .sheet { transition: opacity 200ms ease; }
    .sheet { transform: translate(-50%, 0); opacity: 0; pointer-events: none; }
    .sheet.open { opacity: 1; pointer-events: auto; }
  }
</style>
