<script lang="ts">
  // Dev-only contact sheet: every pattern, the good rep (left three) and the "avoid" rep (right three), start / middle / end.
  import FormFigure from './ui/FormFigure.svelte';
  import { ANIMS, BAD_ANIMS } from './lib/formGuides';
  import { PATTERNS } from './lib/patterns';
  const only = new URLSearchParams(location.search).get('only');
  const ids = $derived(Object.keys(PATTERNS).filter((i) => !only || only.split(',').includes(i)));
</script>

<main>
  {#each ids as id (id)}
    <h3>{id}</h3>
    <div class="row">
      {#each [0, 0.5, 1] as p}<FormFigure anim={id} fixedP={p} look="dark" />{/each}
      {#each [0, 0.5, 1] as p}<FormFigure anim={id} fixedP={p} look="dark" defOverride={BAD_ANIMS[id]} />{/each}
    </div>
  {/each}
</main>

<style>
  main { background: #0d0e11; color: #dde3f0; padding: 8px; font: 12px system-ui; width: 1500px; }
  h3 { margin: 8px 0 2px; }
  .row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .row :global(svg) { width: 100%; height: auto; }
</style>
