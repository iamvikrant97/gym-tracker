<script lang="ts">
  import Sheet from './Sheet.svelte';
  import AddExerciseForm from './AddExerciseForm.svelte';
  import { workout } from '../lib/workout.svelte';
  import { fmtKg } from '../lib/workoutView';
  import type { Exercise } from '../lib/types';

  let {
    open,
    exerciseId,
    taken = [],
    hasDoneSets = false,
    onpick,
    onclose,
  }: {
    open: boolean;
    /** The exercise currently in this slot. */
    exerciseId: string;
    /** Exercises already used by other cards in this workout. */
    taken?: string[];
    hasDoneSets?: boolean;
    onpick: (exerciseId: string) => void;
    onclose: () => void;
  } = $props();

  const current = $derived(workout.exercise(exerciseId));
  let added = $state.raw<Exercise[]>([]);
  let adding = $state(false);

  // A different card: start clean.
  $effect(() => {
    void exerciseId;
    added = [];
    adding = false;
  });

  const options = $derived.by(() => {
    const out: Exercise[] = [];
    for (const e of [...(current ? [current] : []), ...workout.swapOptions(exerciseId), ...added]) {
      if (!out.some((o) => o.id === e.id)) out.push(e);
    }
    return out;
  });

  const sub = $derived(
    current
      ? `${current.slot} · ${hasDoneSets ? 'sets already logged stay with ' + current.name : 'your history stays with each exercise'}`
      : '',
  );

  function step(e: Exercise) {
    return workout.settings?.stepOverrides[e.id] ?? e.step;
  }

  function onadded(ex: Exercise) {
    added = [...added, ex];
    adding = false;
  }
</script>

<Sheet {open} {onclose} title="Swap exercise" {sub}>
  <div role="radiogroup" aria-label="Exercise">
    {#each options as o (o.id)}
      {@const inUse = o.id !== exerciseId && taken.includes(o.id)}
      <button type="button" role="radio" class="opt press" aria-checked={o.id === exerciseId} disabled={inUse} onclick={() => onpick(o.id)}>
        <span>
          <span class="nm">{o.name}</span>
          <span class="meta">
            {inUse ? 'Already in this workout' : `${o.repMin}–${o.repMax} reps · steps of ${fmtKg(step(o))} kg${o.id.startsWith('custom-') ? ' · added by you' : ''}`}
          </span>
        </span>
        <span class="dot" aria-hidden="true"></span>
      </button>
    {/each}
  </div>
  <button type="button" class="opt add press" aria-expanded={adding} onclick={() => (adding = !adding)}>
    <span class="plus" aria-hidden="true">+</span><span class="nm">Add exercise</span>
  </button>
  {#if adding && current}
    <div class="form">
      <AddExerciseForm slot={current.slot} muscle={current.muscle} {onadded} />
    </div>
  {/if}
</Sheet>

<style>
  .opt { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px; min-height: 56px; border-radius: 12px; text-align: left; }
  .opt:disabled { opacity: 0.45; }
  .nm { display: block; font-weight: 500; }
  .meta { display: block; font-size: 12px; color: var(--muted); }
  .dot { margin-left: auto; flex: none; width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--ring); display: grid; place-items: center; }
  .opt[aria-checked='true'] { background: var(--raised); }
  .opt[aria-checked='true'] .dot { border-color: var(--blue); }
  .opt[aria-checked='true'] .dot::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--blue); }
  .add { margin-top: 4px; border-top: 1px solid var(--line); border-radius: 0 0 12px 12px; color: var(--blue); }
  .plus { width: 20px; text-align: center; font: 600 20px/1 var(--display); }
  .form { padding: 6px 2px 4px; }
</style>
