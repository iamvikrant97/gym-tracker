<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { workout } from '../lib/workout.svelte';
  import { lastSessionSets } from '../lib/progression';
  import { fmtKg } from '../lib/workoutView';
  import { SETUP, WEIGHT_RULE } from '../lib/setupGuides';
  import { exerciseById, rangeFor } from '../lib/seed';
  import type { Component } from 'svelte';

  const TAB_KEY = 'gym.guideTab';
  type Tab = 'form' | 'setup';

  let { open, exerciseId, onclose }: { open: boolean; exerciseId: string; onclose: () => void } = $props();

  // The animated guide is a separate chunk: it loads when a sheet first opens, so the main app stays small.
  let guides = $state.raw<{ has: (id: string) => boolean; Form: Component<{ exerciseId: string }> } | null>(null);
  let failed = $state(false);
  $effect(() => {
    if (!open || guides || failed) return;
    Promise.all([import('../lib/formGuides'), import('./FormGuide.svelte')])
      .then(([g, f]) => (guides = { has: (id) => !!g.guideFor(id), Form: f.default as Component<{ exerciseId: string }> }))
      .catch(() => (failed = true));
  });
  const hasGuide = $derived(!!guides && guides.has(exerciseId));
  const ready = $derived(!!guides || failed);

  const readTab = (): Tab => { try { return localStorage.getItem(TAB_KEY) === 'setup' ? 'setup' : 'form'; } catch { return 'form'; } };
  let picked = $state<Tab>(readTab());
  const tab = $derived<Tab>(hasGuide ? picked : 'setup');
  function pick(t: Tab) {
    picked = t;
    try { localStorage.setItem(TAB_KEY, t); } catch { /* private mode: it just will not be remembered */ }
  }

  const ex = $derived(workout.exercise(exerciseId));
  const tip = $derived(SETUP[exerciseId]);
  const w = $derived(workout.current);

  const reps = $derived.by(() => {
    if (!ex) return 0;
    const r = w && exerciseById(exerciseId) ? rangeFor(w.sessionId, exerciseId) : ex;
    return r.repMax;
  });

  /** Heaviest working set from the last session of this exercise, if there is one. */
  const last = $derived.by(() => {
    if (!w || !ex || ex.bodyweight) return null;
    const sets = lastSessionSets(workout.history, exerciseId, w.date).filter((s) => !s.warmup);
    if (!sets.length) return null;
    const top = sets.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a));
    return `${fmtKg(top.kg)} kg × ${top.reps}`;
  });

  const rule = $derived(
    !ex || ex.bodyweight ? '' : ex.assisted ? `Pick the help that lets you do ${reps} reps. Start with more help.` : WEIGHT_RULE(reps),
  );
</script>

<Sheet {open} {onclose} title={ex?.name ?? 'Set up'} sub={tab === 'form' ? 'How to do it' : 'Set up'}>
  {#if open && !ready}
    <div class="body" aria-busy="true"></div>
  {:else}
  {#if hasGuide}
    <div class="tabs" role="tablist" aria-label="Guide">
      <button type="button" role="tab" aria-selected={tab === 'form'} onclick={() => pick('form')}>Form</button>
      <button type="button" role="tab" aria-selected={tab === 'setup'} onclick={() => pick('setup')}>Set up</button>
    </div>
  {/if}
  {#if tab === 'form' && guides}
    <div class="body">
      <guides.Form {exerciseId} />
      <button type="button" class="ok press" onclick={onclose}>Got it</button>
    </div>
  {:else}
  <div class="body">
    {#if tip}<p class="tip">{tip}</p>{/if}
    {#if rule}<p class="rule">{rule}</p>{/if}
    {#if last}<p class="last">Last time: <strong>{last}</strong></p>{/if}
    {#if !tip && !rule}<p class="tip">Set the machine so the movement feels smooth, and stop if anything hurts.</p>{/if}
    <button type="button" class="ok press" onclick={onclose}>Got it</button>
  </div>
  {/if}
  {/if}
</Sheet>

<style>
  .body { padding: 4px 20px 22px; display: flex; flex-direction: column; gap: 12px; font-family: var(--body); }
  .tip { margin: 0; font: 700 18px/1.35 var(--display); color: var(--text); }
  .rule { margin: 0; font-size: 15px; line-height: 1.4; color: var(--muted); }
  .last { margin: 0; font-size: 15px; color: var(--text); }
  .last strong { color: var(--blue); font-variant-numeric: tabular-nums; }
  .tabs { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 3px; margin: 0 20px 12px; }
  .tabs button { height: 44px; border-radius: 9px; font-size: 14px; color: var(--muted); font-weight: 600; transition: background 200ms var(--ease-out), color 200ms var(--ease-out); }
  .tabs button[aria-selected='true'] { background: var(--raised); color: var(--text); }
  .ok { margin-top: 6px; min-height: 52px; border-radius: 14px; background: var(--blue); color: var(--on-blue); font: 700 16px var(--body); }
</style>
