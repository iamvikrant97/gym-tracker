<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { fmtKg } from '../lib/workoutView';
  import type { DayVisit } from '../lib/stats';

  /** The workout(s) of one day: session, volume, sets, time and every set. Shared by the Week calendar and Home. */
  let { open, onclose, title, visits }: { open: boolean; onclose: () => void; title: string; visits: DayVisit[] } = $props();

  const num = (n: number) => Math.round(n).toLocaleString('en-IN');
</script>

<Sheet {open} {onclose} {title} sub={visits.length > 1 ? `${visits.length} workouts` : undefined}>
  {#each visits as v (v.key)}
    <div class="visit" data-testid="day-workout">
      <h3>{v.name}</h3>
      <dl class="figs">
        <div><dt>Volume</dt><dd><span data-testid="day-volume">{num(v.volume)}</span><small>kg</small></dd></div>
        <div><dt>Sets</dt><dd data-testid="day-sets">{v.sets}</dd></div>
        {#if v.minutes !== null}<div><dt>Time</dt><dd><span data-testid="day-minutes">{v.minutes}</span><small>min</small></dd></div>{/if}
      </dl>
      <ul class="exs">
        {#each v.exercises as ex (ex.exerciseId)}
          <li>
            <span class="en">{ex.name}</span>
            <span class="ss">{#each ex.sets as st (st.id)}<span>{fmtKg(st.kg)} × {st.reps}</span>{/each}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</Sheet>

<style>
  .visit + .visit { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
  .visit h3 { font: 700 16px/1.2 var(--body); margin: 0 0 10px; }
  .figs { display: flex; gap: 10px; margin: 0 0 12px; }
  .figs > div { flex: 1; background: var(--raised); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }
  .figs dt { font-size: 11px; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; }
  .figs dd { margin: 4px 0 0; font: 700 20px/1 var(--display); font-variant-numeric: tabular-nums; }
  .figs small { font: 500 12px/1 var(--body); color: var(--muted); margin-left: 3px; }
  .exs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .exs li { display: grid; gap: 4px; font-size: 14px; }
  .en { font-weight: 600; }
  .ss { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
