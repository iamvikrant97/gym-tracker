<script lang="ts">
  let { message = '', duration = 2200, onhide }: { message?: string; duration?: number; onhide?: () => void } = $props();

  let shown = $state(false);
  // Keep the last text while sliding out.
  let text = $state('');

  $effect(() => {
    if (!message) return;
    text = message;
    shown = true;
    const t = setTimeout(() => {
      shown = false;
      onhide?.();
    }, duration);
    return () => clearTimeout(t);
  });
</script>

<!-- The visible toast is decorative; the live region carries the text only while shown. -->
<div class="toast" class:show={shown} aria-hidden="true">{text}</div>
<div class="sr-only" role="status" aria-live="polite">{shown ? text : ''}</div>

<style>
  .toast {
    position: fixed; left: 50%; top: 14px; z-index: 30; transform: translate(-50%, -140%);
    transition: transform 380ms var(--ease-drawer); background: var(--amber); color: #1a1406;
    font-weight: 600; font-size: 14px; padding: 10px 16px; border-radius: 12px;
    width: max-content; max-width: calc(100vw - 32px); text-align: center;
    pointer-events: none;
  }
  .toast.show { transform: translate(-50%, 0); }
  @media (prefers-reduced-motion: reduce) {
    .toast { transition: opacity 200ms ease; transform: translate(-50%, 0); opacity: 0; }
    .toast.show { opacity: 1; }
  }
</style>
