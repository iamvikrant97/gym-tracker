<script lang="ts">
  import { EXERCISES } from '../lib/seed';
  import type { Exercise, Muscle } from '../lib/types';
  import { workout } from '../lib/workout.svelte';

  let { slot, muscle, onadded }: { slot?: string; muscle?: Muscle; onadded: (exercise: Exercise) => void } = $props();

  const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Calves', 'Abs', 'Other'];
  const SLOTS = [...new Set(EXERCISES.map((e) => e.slot))];

  let name = $state('');
  // Props only seed the initial selection; the user can change both afterwards.
  // svelte-ignore state_referenced_locally
  let chosenMuscle = $state<Muscle>(muscle ?? EXERCISES.find((e) => e.slot === slot)?.muscle ?? 'Chest');
  // svelte-ignore state_referenced_locally
  let chosenSlot = $state(slot ?? EXERCISES.find((e) => e.muscle === (muscle ?? 'Chest'))?.slot ?? SLOTS[0]);
  let kind = $state<'compound' | 'isolation'>('isolation');
  let step = $state('2.5');
  let repMin = $state('8');
  let repMax = $state('12');
  let error = $state('');
  let busy = $state(false);

  const slotsForMuscle = $derived([...new Set(EXERCISES.filter((e) => e.muscle === chosenMuscle).map((e) => e.slot))]);

  async function save(e: Event) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      const ex = await workout.addExercise({
        name,
        muscle: chosenMuscle,
        slot: chosenSlot,
        kind,
        step: Number(step),
        repMin: Number(repMin),
        repMax: Number(repMax),
        restSec: kind === 'compound' ? 180 : 120,
      });
      name = '';
      onadded(ex);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not add exercise';
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={save}>
  <label>Name<input type="text" bind:value={name} autocomplete="off" required /></label>
  <label>Muscle
    <select bind:value={chosenMuscle} onchange={() => (chosenSlot = slotsForMuscle[0] ?? chosenSlot)}>
      {#each MUSCLES as m (m)}<option value={m}>{m}</option>{/each}
    </select>
  </label>
  <label>Category
    <select bind:value={chosenSlot}>
      {#each slotsForMuscle.includes(chosenSlot) ? slotsForMuscle : [chosenSlot, ...slotsForMuscle] as s (s)}<option value={s}>{s}</option>{/each}
    </select>
  </label>
  <div class="seg" role="radiogroup" aria-label="Type">
    <button type="button" role="radio" aria-checked={kind === 'compound'} onclick={() => (kind = 'compound')}>Compound</button>
    <button type="button" role="radio" aria-checked={kind === 'isolation'} onclick={() => (kind = 'isolation')}>Isolation</button>
  </div>
  <div class="nums">
    <label>Weight step (kg)<input type="number" inputmode="decimal" step="any" min="0" bind:value={step} /></label>
    <label>Reps from<input type="number" inputmode="numeric" min="1" bind:value={repMin} /></label>
    <label>to<input type="number" inputmode="numeric" min="1" bind:value={repMax} /></label>
  </div>
  {#if error}<p class="err" role="alert">{error}</p>{/if}
  <button type="submit" class="save press" disabled={busy}>Add exercise</button>
</form>

<style>
  form { display: grid; gap: 12px; }
  label { display: grid; gap: 4px; font-size: 12.5px; color: var(--muted); }
  input, select { height: 48px; border-radius: 12px; border: 1px solid var(--line); background: var(--raised); color: var(--text); padding: 0 12px; font: inherit; font-size: 15px; }
  .nums { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 10px; }
  .seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--ground); border: 1px solid var(--line); border-radius: 12px; padding: 3px; }
  .seg button { height: 44px; border-radius: 9px; font-size: 14px; color: var(--muted); }
  .seg button[aria-checked='true'] { background: var(--raised); color: var(--text); }
  .err { margin: 0; color: var(--amber); font-size: 13px; }
  .save { height: 56px; border-radius: 14px; background: var(--blue); color: var(--on-blue); font-weight: 600; font-size: 16px; }
  .save:disabled { opacity: 0.6; }
</style>
