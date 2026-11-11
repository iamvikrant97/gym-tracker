<script lang="ts">
  /** Mini bars of weekly set counts, oldest to newest. The last bar is blue, amber when `low`. */
  let { values, low = false }: { values: number[]; low?: boolean } = $props();
  const max = $derived(Math.max(...values, 12));
</script>

<div class="mbars" class:low aria-hidden="true">
  {#each values as v, i (i)}
    <i style:height="{Math.max(8, (v / max) * 100)}%"></i>
  {/each}
</div>

<style>
  .mbars { display: flex; align-items: flex-end; gap: 3px; height: 28px; width: 52px; }
  i { flex: 1; background: #2c3340; border-radius: 2px; transition: height 300ms var(--ease-out); }
  i:last-child { background: var(--blue); }
  .low i:last-child { background: var(--amber); }
</style>
