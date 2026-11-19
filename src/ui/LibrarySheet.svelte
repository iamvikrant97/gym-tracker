<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { EXERCISES } from '../lib/seed';
  import type { Exercise } from '../lib/types';
  import type { Component } from 'svelte';

  let { exerciseId, onopen, onclose, meta }: { exerciseId: string | null; onopen: (id: string) => void; onclose: () => void; meta: (e: Exercise) => string } = $props();

  // The drawings and guide text are a separate chunk, loaded the first time a sheet opens.
  let Detail = $state.raw<Component<{ exerciseId: string; onopen: (id: string) => void }> | null>(null);
  let failed = $state(false);
  $effect(() => {
    if (!exerciseId || Detail || failed) return;
    import('./LibraryDetail.svelte')
      .then((m) => (Detail = m.default as typeof Detail))
      .catch(() => (failed = true));
  });

  // Keep the last exercise while the sheet closes, so the title does not blank out mid-animation.
  let last = $state<Exercise | null>(null);
  $effect(() => { if (exerciseId) last = EXERCISES.find((e) => e.id === exerciseId) ?? null; });
</script>

<Sheet open={exerciseId !== null} {onclose} title={last?.name ?? 'Exercise'} sub={last ? `${meta(last)} · ${last.kind === 'compound' ? 'Compound' : 'Isolation'}` : ''}>
  {#if exerciseId && Detail}
    <Detail {exerciseId} {onopen} />
  {:else if failed}
    <p class="msg">Could not load the guide. Check your connection and try again.</p>
  {:else}
    <div class="busy" aria-busy="true"></div>
  {/if}
</Sheet>

<style>
  .msg { color: var(--muted); }
  .busy { min-height: 240px; }
</style>
