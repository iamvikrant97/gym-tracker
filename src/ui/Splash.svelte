<script lang="ts" module>
  // Plays once per launch (a module flag, so going back to Home does not replay it).
  let played = false;
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  let visible = $state(false);
  onMount(() => {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (played || reduce || import.meta.env.MODE === 'test') return;
    played = true;
    visible = true;
    const t = setTimeout(() => (visible = false), 2900);
    return () => clearTimeout(t);
  });
</script>

{#if visible}
  <div class="splash" aria-hidden="true">
    <svg viewBox="0 0 512 300" class="logo">
      <rect x="30" y="140" width="452" height="20" rx="8" fill="#8b93a3" />
      <g class="pl l1"><rect x="146" y="36" width="40" height="228" rx="12" fill="#4c8dff" /></g>
      <g class="pl l2"><rect x="106" y="64" width="32" height="172" rx="10" fill="#2dd4bf" /></g>
      <g class="pl l3"><rect x="70" y="92" width="28" height="116" rx="9" fill="#f2b544" /></g>
      <g class="pl r1"><rect x="326" y="36" width="40" height="228" rx="12" fill="#4c8dff" /></g>
      <g class="pl r2"><rect x="374" y="64" width="32" height="172" rx="10" fill="#2dd4bf" /></g>
      <g class="pl r3"><rect x="414" y="92" width="28" height="116" rx="9" fill="#f2b544" /></g>
    </svg>
    <div class="name"><span>Rep</span><span>Rest</span><span>Repeat</span></div>
  </div>
{/if}

<style>
  .splash { position: fixed; inset: 0; z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; background: #0b0d11; pointer-events: none; animation: out 400ms 2500ms var(--ease-out) forwards; }
  .logo { width: min(78vw, 340px); height: auto; overflow: visible; }
  .pl { opacity: 0; animation: plate 520ms var(--ease-out) forwards; }
  .l1, .l2, .l3 { --x: -46px; }
  .r1, .r2, .r3 { --x: 46px; }
  .l1, .r1 { animation-delay: 250ms; }
  .l2, .r2 { animation-delay: 700ms; }
  .l3, .r3 { animation-delay: 1150ms; }
  .name { display: flex; gap: 12px; font: 800 30px/1 var(--display); letter-spacing: -0.02em; color: #eef1f6; }
  .name span { opacity: 0; animation: word 560ms var(--ease-out) forwards; }
  .name span:nth-child(1) { animation-delay: 1300ms; }
  .name span:nth-child(2) { animation-delay: 1500ms; }
  .name span:nth-child(3) { animation-delay: 1700ms; }
  @keyframes plate { from { opacity: 0; transform: translateX(var(--x)); } to { opacity: 1; transform: none; } }
  @keyframes word { from { opacity: 0; transform: translateY(10px); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
  @keyframes out { to { opacity: 0; } }
</style>
