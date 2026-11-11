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

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const INTERACTIVE = 'button, input, select, textarea, a, label, [contenteditable]';

  // Elements made inert by open sheets (counted, so stacked sheets restore correctly).
  const inertCount = (globalThis as { __sheetInert?: Map<Element, number> });
  const counts = (inertCount.__sheetInert ??= new Map());

  /** Makes everything outside the sheet's ancestor chain inert (except scrims); returns the undo. */
  function isolate(node: HTMLElement): () => void {
    const made: Element[] = [];
    for (let cur: HTMLElement | null = node; cur && cur !== document.body; cur = cur.parentElement) {
      for (const sib of Array.from(cur.parentElement?.children ?? [])) {
        if (sib === cur || sib.classList.contains('scrim')) continue;
        const n = counts.get(sib) ?? 0;
        if (n === 0 && sib.hasAttribute('inert')) continue; // already inert for another reason
        counts.set(sib, n + 1);
        sib.setAttribute('inert', '');
        made.push(sib);
      }
    }
    return () => {
      for (const sib of made) {
        const n = (counts.get(sib) ?? 1) - 1;
        if (n <= 0) {
          counts.delete(sib);
          sib.removeAttribute('inert');
        } else counts.set(sib, n);
      }
    };
  }

  // While open: remember the opener, isolate the page, move focus in. On close: undo, then refocus the opener.
  $effect(() => {
    if (!open || !el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const undo = isolate(el);
    el.focus({ preventScroll: true });
    return () => {
      undo();
      opener?.focus({ preventScroll: true });
    };
  });

  function keydown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === el)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Drag starts only from the header (grab handle and title), never from controls, so the body scrolls and forms work.
  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    dragging = true;
    dragY = 0;
    y0 = e.clientY;
    samples = [[e.clientY, performance.now()]];
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    dragY = dragOffset(e.clientY - y0);
    samples.push([e.clientY, performance.now()]);
    if (samples.length > 8) samples.shift();
  }
  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const dy = e.clientY - y0;
    const v = releaseVelocity(samples, performance.now());
    dragY = 0;
    if (shouldDismiss(v, dy, el?.offsetHeight ?? 0)) onclose();
  }
  /** A browser takeover (scroll, system gesture) snaps back and never dismisses. */
  function cancel() {
    dragging = false;
    dragY = 0;
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
  onkeydown={keydown}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="head" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={cancel}>
    <div class="grab" aria-hidden="true"></div>
    <h2 id="{uid}-title">{title}</h2>
    {#if sub}<p class="sub">{sub}</p>{/if}
  </div>
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
    max-height: 88vh; overflow-y: auto;
    background: var(--surface); border: 1px solid var(--line); border-bottom: 0;
    border-radius: 22px 22px 0 0; padding: 8px 18px 26px; outline: none;
    transform: translate(-50%, 100%); transition: transform 420ms var(--ease-drawer);
  }
  .sheet.open { transform: translate(-50%, 0); }
  .head { touch-action: none; }
  .grab { width: 40px; height: 5px; border-radius: 3px; background: var(--ring); margin: 4px auto 14px; }
  h2 { font: 800 21px/1.15 var(--body); margin: 0 0 4px; }
  .sub { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
  @media (prefers-reduced-motion: reduce) {
    .scrim, .sheet { transition: opacity 200ms ease; }
    .sheet { transform: translate(-50%, 0); opacity: 0; pointer-events: none; }
    .sheet.open { opacity: 1; pointer-events: auto; }
  }
</style>
