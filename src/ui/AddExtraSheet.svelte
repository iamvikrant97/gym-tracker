<script lang="ts">
  import Sheet from './Sheet.svelte';
  import AddExerciseForm from './AddExerciseForm.svelte';
  import { EXERCISES } from '../lib/seed';
  import { workout } from '../lib/workout.svelte';
  import { fmtKg } from '../lib/workoutView';
  import type { Exercise, Muscle } from '../lib/types';

  let {
    open,
    taken = [],
    priority = [],
    onpick,
    onclose,
  }: {
    open: boolean;
    /** Exercises already in this workout (shown as such; picking one takes you to it). */
    taken?: string[];
    /** Muscles of the current session: listed first. */
    priority?: Muscle[];
    onpick: (exerciseId: string, keep: boolean) => void;
    onclose: () => void;
  } = $props();

  const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Calves', 'Abs', 'Other'];

  let query = $state('');
  let keep = $state(false);
  let adding = $state(false);

  // Each time the sheet opens: start clean (the keep option is chosen per exercise, never remembered).
  $effect(() => {
    if (open) {
      query = '';
      keep = false;
      adding = false;
    }
  });

  // Same rule as the library elsewhere: a custom exercise named like a library one is hidden.
  const library = $derived.by(() => {
    const names = new Set(EXERCISES.map((e) => e.name.trim().toLowerCase()));
    return [...EXERCISES, ...workout.customExercises.filter((e) => !names.has(e.name.trim().toLowerCase()))];
  });

  const groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const order = [...priority, ...MUSCLES.filter((m) => !priority.includes(m))];
    return order
      .map((muscle) => ({
        muscle,
        items: library.filter((e) => e.muscle === muscle && (!q || e.name.toLowerCase().includes(q))),
      }))
      .filter((g) => g.items.length > 0);
  });

  const step = (e: Exercise) => workout.settings?.stepOverrides[e.id] ?? e.step;
  const onadded = (ex: Exercise) => onpick(ex.id, keep);
</script>

<Sheet {open} {onclose} title="Add exercise" sub="Added next to today's exercises. Nothing is replaced.">
  <input class="search" type="search" aria-label="Search exercises" placeholder="Search exercises" autocomplete="off" bind:value={query} />
  <label class="keep">
    <input type="checkbox" bind:checked={keep} />
    <span>Keep in this session from now on</span>
  </label>

  {#each groups as g (g.muscle)}
    <h3>{g.muscle}</h3>
    {#each g.items as o (o.id)}
      {@const inUse = taken.includes(o.id)}
      <button type="button" class="opt press" class:used={inUse} onclick={() => onpick(o.id, keep)}>
        <span class="nm">{o.name}</span>
        <span class="meta">
          {inUse ? 'Already in this workout' : `${o.repMin}–${o.repMax} reps · steps of ${fmtKg(step(o))} kg${o.id.startsWith('custom-') ? ' · added by you' : ''}`}
        </span>
      </button>
    {/each}
  {:else}
    <p class="none">No exercise matches. Add it below.</p>
  {/each}

  <button type="button" class="opt add press" aria-expanded={adding} onclick={() => (adding = !adding)}>
    <span class="plus" aria-hidden="true">+</span><span class="nm">Add a new exercise</span>
  </button>
  {#if adding}
    <div class="form">
      <AddExerciseForm muscle={priority[0]} {onadded} />
    </div>
  {/if}
</Sheet>

<style>
  .search { width: 100%; height: 48px; border-radius: 12px; border: 1px solid var(--line); background: var(--raised); color: var(--text); padding: 0 14px; font: inherit; font-size: 15px; }
  .keep { display: flex; align-items: center; gap: 12px; min-height: 48px; margin-top: 4px; font-size: 14px; }
  .keep input { width: 24px; height: 24px; flex: none; accent-color: var(--blue); }
  h3 { margin: 14px 0 2px; padding: 0 12px; font: 600 12px/1 var(--body); color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .opt { width: 100%; display: block; padding: 8px 12px; min-height: 56px; border-radius: 12px; text-align: left; }
  .opt.used { opacity: 0.6; }
  .nm { display: block; font-weight: 500; }
  .meta { display: block; font-size: 12px; color: var(--muted); }
  .none { margin: 16px 12px; color: var(--muted); font-size: 14px; }
  .add { display: flex; align-items: center; gap: 12px; margin-top: 8px; border-top: 1px solid var(--line); border-radius: 0 0 12px 12px; color: var(--blue); }
  .plus { width: 20px; text-align: center; font: 600 20px/1 var(--display); }
  .form { padding: 6px 2px 4px; }
</style>
