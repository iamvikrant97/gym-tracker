<script lang="ts">
  import { workout } from '../lib/workout.svelte';
  import { sessionName } from '../lib/seed';
  import { getAll } from '../lib/db';
  import { mergeVisit, workoutSummary } from '../lib/stats';
  import { fmtClock } from '../lib/workoutView';
  import type { Workout } from '../lib/types';

  /** Body weight for the calorie estimate when Settings has none. Settings > Training > Body weight wins. */
  const DEFAULT_BODY_KG = 65;

  let { bodyKg }: { bodyKg?: number } = $props();

  // Other workouts of the same visit (a very long break can split one gym visit into two workouts).
  let workouts = $state.raw<Workout[]>([]);
  $effect(() => {
    void workout.current?.id;
    void workout.current?.endedAt;
    getAll<Workout>('workouts').then((all) => (workouts = all)).catch(() => undefined);
  });

  const visit = $derived(workout.current ? mergeVisit(workout.current, workouts, [...workout.history, ...workout.sets]) : null);
  const w = $derived(visit?.workout ?? null);
  const kg = $derived(bodyKg ?? workout.settings?.bodyKg ?? DEFAULT_BODY_KG);
  const s = $derived(w && visit ? workoutSummary(w, visit.sets, kg, (id) => workout.exercise(id)) : null);
  const name = $derived(w ? (sessionName(w.sessionId) ?? 'Workout') : '');
  const work = $derived(s ? Math.round(s.workRatio * 100) : 0);

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dateLabel = $derived.by(() => {
    if (!w) return '';
    const d = new Date(w.startedAt);
    return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  });
  async function continueWorkout() {
    try {
      await workout.resume();
      location.hash = '#/workout';
    } catch {
      /* no longer continuable: stay on the summary */
    }
  }
  const num = (n: number) => Math.round(n).toLocaleString('en-IN');
</script>

<section class="screen">
  {#if !w || !s}
    <h1 class="page-title">No workout yet</h1>
    <p class="muted">Your summary shows here after you finish a workout.</p>
  {:else}
    <h1 class="page-title">{workout.active ? 'Workout so far' : 'Workout done'}</h1>
    <p class="sub">{name} · {dateLabel}</p>

    <dl class="grid">
      <div class="stat"><dt>Time</dt><dd data-testid="sum-minutes">{s.minutes}<small>min</small></dd></div>
      <div class="stat"><dt>Sets</dt><dd data-testid="sum-sets">{s.sets}</dd></div>
      <div class="stat"><dt>Volume</dt><dd data-testid="sum-volume">{num(s.volume)}<small>kg</small></dd></div>
      <div class="stat"><dt>Average rest</dt><dd data-testid="sum-rest">{fmtClock(s.avgRestSec)}</dd></div>
    </dl>

    <div class="block">
      <div class="row"><span>Work vs waiting</span><span data-testid="sum-ratio">{work}% · {100 - work}%</span></div>
      <div class="split" aria-hidden="true"><i style:width="{work}%"></i></div>
    </div>

    <div class="block">
      <div class="row"><span>PRs</span><span>{s.prs.length || 'None this time'}</span></div>
      {#if s.prs.length}
        <ul class="prs">
          {#each s.prs as p (p)}<li><span class="badge">PR</span>{p}</li>{/each}
        </ul>
      {/if}
    </div>

    <div class="block kcal">
      <div class="big" data-testid="sum-kcal">≈ {num(s.kcal)} kcal</div>
      <p>Don't add this to MyFitnessPal — your 2,650 kcal target already includes training.</p>
    </div>

    {#if workout.canResume()}
      <button class="more press" type="button" onclick={continueWorkout}>Continue workout</button>
    {/if}
    <button class="done press" type="button" onclick={() => (location.hash = '#/')}>Done</button>
  {/if}
</section>

<style>
  .sub { margin: -8px 0 20px; color: var(--muted); font-size: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0; }
  .stat { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
  dt { font-size: 12px; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; }
  dd { margin: 6px 0 0; font: 700 30px/1 var(--display); font-variant-numeric: tabular-nums; }
  dd small { font: 500 13px/1 var(--body); color: var(--muted); margin-left: 4px; }
  .block { margin-top: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
  .row { display: flex; justify-content: space-between; font-size: 14px; }
  .row span:last-child { color: var(--muted); font-variant-numeric: tabular-nums; }
  .split { margin-top: 10px; height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
  .split i { display: block; height: 100%; background: var(--blue); border-radius: 4px; }
  .prs { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; font-size: 14px; }
  .badge { font: 600 11px/1 var(--body); color: #1a1406; background: var(--amber); border-radius: 4px; padding: 3px 5px; margin-right: 8px; }
  .kcal .big { font: 700 26px/1 var(--display); font-variant-numeric: tabular-nums; }
  .kcal p { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
  .more { display: block; width: 100%; height: 52px; margin-top: 20px; border-radius: 14px; background: var(--raised); border: 1px solid var(--line); font-weight: 600; font-size: 15px; }
  .more + .done { margin-top: 10px; }
  .done { display: block; width: 100%; height: 56px; margin-top: 20px; border-radius: 14px; background: var(--blue); color: var(--on-blue); font-weight: 600; font-size: 16px; }
</style>
