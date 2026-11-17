<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { workout } from '../lib/workout.svelte';
  import { lastSessionSets } from '../lib/progression';
  import { fmtKg } from '../lib/workoutView';
  import { SETUP, WEIGHT_RULE } from '../lib/setupGuides';
  import { exerciseById, rangeFor } from '../lib/seed';

  let { open, exerciseId, onclose }: { open: boolean; exerciseId: string; onclose: () => void } = $props();

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

<Sheet {open} {onclose} title={ex?.name ?? 'Set up'} sub="Set up">
  <div class="body">
    {#if tip}<p class="tip">{tip}</p>{/if}
    {#if rule}<p class="rule">{rule}</p>{/if}
    {#if last}<p class="last">Last time: <strong>{last}</strong></p>{/if}
    {#if !tip && !rule}<p class="tip">Set the machine so the movement feels smooth, and stop if anything hurts.</p>{/if}
    <button type="button" class="ok press" onclick={onclose}>Got it</button>
  </div>
</Sheet>

<style>
  .body { padding: 4px 20px 22px; display: flex; flex-direction: column; gap: 12px; font-family: var(--body); }
  .tip { margin: 0; font: 700 18px/1.35 var(--display); color: var(--text); }
  .rule { margin: 0; font-size: 15px; line-height: 1.4; color: var(--muted); }
  .last { margin: 0; font-size: 15px; color: var(--text); }
  .last strong { color: var(--blue); font-variant-numeric: tabular-nums; }
  .ok { margin-top: 6px; min-height: 52px; border-radius: 14px; background: var(--blue); color: var(--on-blue); font: 700 16px var(--body); }
</style>
