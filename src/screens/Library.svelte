<script lang="ts">
  import { onMount } from 'svelte';
  import { EXERCISES, EQUIPMENT, type Equip } from '../lib/seed';
  import type { Exercise, Muscle } from '../lib/types';
  import { guideKeys } from '../lib/guideKeys';
  import LibrarySheet from '../ui/LibrarySheet.svelte';

  const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];
  const EQUIP: Equip[] = ['Machine', 'Cable', 'Smith', 'Barbell', 'Dumbbells', 'Bodyweight'];

  let q = $state('');
  let muscle = $state<Muscle | 'All'>('All');
  let equip = $state<Equip | 'All'>('All');
  let openId = $state<string | null>(null);
  let from = 'settings';

  onMount(() => {
    try { from = sessionStorage.getItem('gym.libFrom') ?? 'settings'; } catch { /* no storage */ }
  });
  const back = () => (location.hash = from === 'workout' ? '#/workout' : '#/settings');

  const norm = (s: string) => s.toLowerCase();
  const results = $derived(
    EXERCISES.filter((e) => e.muscle !== 'Other')
      .filter((e) => muscle === 'All' || e.muscle === muscle)
      .filter((e) => equip === 'All' || EQUIPMENT[e.id] === equip)
      .filter((e) => {
        const t = norm(q.trim());
        return !t || norm(`${e.name} ${e.muscle} ${EQUIPMENT[e.id] ?? ''}`).includes(t);
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const filtered = $derived(q.trim() !== '' || muscle !== 'All' || equip !== 'All');
  const reset = () => { q = ''; muscle = 'All'; equip = 'All'; };
  const meta = (e: Exercise) => `${e.muscle} · ${EQUIPMENT[e.id] ?? 'Other'} · ${e.repMin}–${e.repMax} reps`;
</script>

<section class="screen" data-testid="library">
  <header class="top">
    <button class="back press" type="button" aria-label="Close library" onclick={back}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
    <h1 class="page-title">Exercise library</h1>
  </header>

  <label class="search">
    <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5 17 17" /></svg>
    <input type="search" placeholder="Search exercises" bind:value={q} aria-label="Search exercises" enterkeyhint="search" />
    {#if q}<button type="button" class="x" aria-label="Clear search" onclick={() => (q = '')}>×</button>{/if}
  </label>

  <div class="chips" role="group" aria-label="Muscle">
    <button type="button" class="chip press" aria-pressed={muscle === 'All'} onclick={() => (muscle = 'All')}>All muscles</button>
    {#each MUSCLES as m}<button type="button" class="chip press" aria-pressed={muscle === m} onclick={() => (muscle = muscle === m ? 'All' : m)}>{m}</button>{/each}
  </div>
  <div class="chips" role="group" aria-label="Equipment">
    <button type="button" class="chip press" aria-pressed={equip === 'All'} onclick={() => (equip = 'All')}>All equipment</button>
    {#each EQUIP as e}<button type="button" class="chip press" aria-pressed={equip === e} onclick={() => (equip = equip === e ? 'All' : e)}>{e}</button>{/each}
  </div>

  <p class="count" aria-live="polite">{results.length} exercise{results.length === 1 ? '' : 's'}{#if filtered}<button type="button" class="link" onclick={reset}>Clear filters</button>{/if}</p>

  <ul class="list">
    {#each results as e (e.id)}
      <li>
        <button type="button" class="row press" onclick={() => (openId = e.id)}>
          <span class="r-main"><span class="nm">{e.name}</span><span class="sub">{meta(e)}</span></span>
          {#if guideKeys.has(e.id)}<span class="tag">Guide</span>{/if}
          <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
        </button>
      </li>
    {:else}
      <li class="empty">Nothing matches. <button type="button" class="link" onclick={reset}>Clear filters</button></li>
    {/each}
  </ul>
</section>

<LibrarySheet exerciseId={openId} onopen={(id) => (openId = id)} onclose={() => (openId = null)} {meta} />

<style>
  .top { display: flex; align-items: center; gap: 4px; }
  .top .page-title { margin: 0; }
  .back { width: 48px; height: 48px; margin-left: -12px; display: grid; place-items: center; border-radius: 12px; flex: none; }
  .back svg { width: 22px; height: 22px; }
  .search { display: flex; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 0 14px; min-height: 50px; margin: 10px 0; }
  .search:focus-within { border-color: var(--blue); }
  .search svg { width: 18px; height: 18px; flex: none; fill: none; stroke: var(--muted); stroke-width: 1.8; stroke-linecap: round; }
  .search input { flex: 1; min-width: 0; background: none; border: 0; color: var(--text); font: inherit; font-size: 16px; outline: none; }
  .search input::-webkit-search-cancel-button { display: none; }
  .x { width: 32px; height: 32px; border-radius: 16px; background: var(--raised); color: var(--muted); font-size: 20px; line-height: 1; }
  .chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 16px 10px; margin: 0 -16px; scrollbar-width: none; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; min-height: 40px; padding: 0 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); color: var(--muted); font-weight: 600; font-size: 13.5px; white-space: nowrap; }
  .chip[aria-pressed='true'] { background: var(--blue-deep); border-color: var(--blue); color: var(--blue-ink); }
  .count { display: flex; justify-content: space-between; margin: 4px 2px 6px; font-size: 12.5px; color: var(--muted); }
  .link { color: var(--blue); font-size: 12.5px; min-height: 24px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { border-bottom: 1px solid var(--line); }
  .empty { padding: 28px 4px; color: var(--muted); }
  .row { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 10px 2px; text-align: left; }
  .r-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .nm { font-weight: 600; }
  .sub { font-size: 12px; color: var(--muted); }
  .tag { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 7px; background: var(--blue-deep); color: var(--blue-ink); }
  .chev { width: 16px; height: 16px; fill: none; stroke: var(--ring); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
</style>
