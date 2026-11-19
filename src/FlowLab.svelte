<script lang="ts">
  // Preview: how the guide, the Swap link and the Library entry would connect in the app (look-alike screens).
  import WorkoutLab from './WorkoutLab.svelte';
  import LibraryLab from './LibraryLab.svelte';
  let screen = $state<'workout' | 'settings' | 'library'>('workout');
  let from = $state<'workout' | 'settings'>('workout');
  const open = (f: 'workout' | 'settings') => { from = f; screen = 'library'; };
</script>

{#if screen === 'library'}
  <button class="back press" type="button" onclick={() => (screen = from)}>← Back to {from === 'workout' ? 'workout' : 'Settings'}</button>
  <LibraryLab />
{:else}
  <nav class="seg" aria-label="Preview screen">
    <button type="button" aria-selected={screen === 'workout'} onclick={() => (screen = 'workout')}>Workout</button>
    <button type="button" aria-selected={screen === 'settings'} onclick={() => (screen = 'settings')}>Settings</button>
  </nav>
  {#if screen === 'workout'}
    <WorkoutLab onlibrary={() => open('workout')} />
  {:else}
    <section class="screen">
      <p class="eyebrow">Preview · not in your app · look-alike</p>
      <h1>Settings</h1>
      <article class="card">
        <h2>Training</h2>
        <p class="hint">Your plan, greeting and rest rules live here.</p>
      </article>
      <article class="card">
        <h2>Exercise library</h2>
        <p class="hint">Search every exercise, see how it's done, and find alternatives.</p>
        <button class="row press" type="button" onclick={() => open('settings')}>Open library <span aria-hidden="true">→</span></button>
      </article>
      <article class="card"><h2>Exercises</h2><p class="hint">Rest and weight step per exercise.</p></article>
    </section>
  {/if}
{/if}

<style>
  .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin: 14px 20px 0; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 3px; position: sticky; top: 8px; z-index: 5; }
  .seg button { height: 40px; border-radius: 9px; font: 600 14px var(--body); color: var(--muted); } .seg button[aria-selected='true'] { background: var(--raised); color: var(--text); }
  .back { margin: 14px 20px 0; min-height: 44px; color: var(--blue); font: 600 14.5px var(--body); }
  .eyebrow { margin: 22px 0 0; font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--amber); font-weight: 700; }
  h1 { font: 800 22px/1.1 var(--body); margin: 10px 0 12px; } h2 { font: 700 16px var(--body); margin: 0; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
  .hint { margin: 6px 0 0; font-size: 13px; color: var(--muted); }
  .row { margin-top: 10px; width: 100%; min-height: 52px; padding: 0 14px; border-radius: 12px; background: var(--raised); display: flex; justify-content: space-between; align-items: center; font: 600 15px var(--body); }
</style>
