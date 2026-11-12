<script lang="ts">
  import { DEFAULT_SETTINGS, getAll, loadSettings } from '../lib/db';
  import { exerciseById } from '../lib/seed';
  import { dayVisits, daysSince, visitKeysInWeek, weekStart, weeklySets } from '../lib/stats';
  import type { Exercise, Muscle, SetLog, Settings, Workout } from '../lib/types';
  import { localDate, workout } from '../lib/workout.svelte';
  import { fmtKg } from '../lib/workoutView';
  import Sheet from '../ui/Sheet.svelte';

  // App passes syncStatus / syncWarn to every screen; this one has no sync indicator, so they are ignored.

  const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Calves', 'Abs'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_MS = 86_400_000;
  const WEEKS = 8;
  const today = localDate(Date.now());

  let sets = $state.raw<SetLog[]>([]);
  let workouts = $state.raw<Workout[]>([]);
  let settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  let custom = $state.raw<Exercise[]>([]);

  const lookup = (id: string): Exercise | undefined => exerciseById(id) ?? custom.find((e) => e.id === id) ?? workout.exercise(id);

  async function load() {
    try {
      const [all, w, s, c] = await Promise.all([
        getAll<SetLog>('sets'), getAll<Workout>('workouts'), loadSettings(), getAll<Exercise>('customExercises'),
      ]);
      sets = all.filter((x) => !x.deleted);
      workouts = w;
      settings = s;
      custom = c;
    } catch {
      // No storage available: show an empty week.
    }
  }

  $effect(() => {
    void workout.current?.id;
    void workout.sets.length;
    load();
  });

  const counts = $derived(weeklySets(sets, today, lookup));
  const trainedDays = $derived(new Set(sets.filter((s) => !s.warmup).map((s) => s.date)));
  // One gym visit counts once even if a long break split it into two workouts.
  const sessionsDone = $derived(visitKeysInWeek(workouts, sets, today).size);

  const calendar = $derived.by(() => {
    const first = Date.parse(`${weekStart(today)}T00:00:00Z`) - (WEEKS - 1) * 7 * DAY_MS;
    return Array.from({ length: WEEKS * 7 }, (_, i) => {
      const date = new Date(first + i * DAY_MS).toISOString().slice(0, 10);
      const dom = Number(date.slice(8, 10));
      return {
        date,
        dom,
        label: `${dom} ${MONTHS[Number(date.slice(5, 7)) - 1]}`,
        trained: trainedDays.has(date) && date <= today, // a future date with sets (typo, wrong clock) is not a trained day
        future: date > today,
        isToday: date === today,
      };
    });
  });

  function freshness(m: Muscle): string {
    const d = daysSince(sets, m, today, lookup);
    return d === null ? 'Not trained yet' : d === 0 ? 'Trained today' : d === 1 ? 'Trained yesterday' : `Trained ${d} days ago`;
  }

  // Tap a trained day: bottom sheet with that day's workout(s).
  let picked = $state<string | null>(null);
  let shown = $state<string | null>(null); // kept while the sheet slides out, so its content does not vanish mid-animation
  const visits = $derived(shown ? dayVisits(shown, workouts, sets, lookup) : []);
  const pickedLabel = $derived(calendar.find((c) => c.date === shown)?.label ?? '');
  const num = (n: number) => Math.round(n).toLocaleString('en-IN');
  function openDay(date: string) {
    shown = date;
    picked = date;
  }

  async function togglePause() {
    settings = await workout.updateSettings((cur) => ({ ...cur, paused: !cur.paused }));
  }
</script>

<section class="screen">
  <h1 class="page-title">This week</h1>
  <p class="muted lead">Hard sets per muscle · line marks 10, bar end is 20</p>

  <div class="bars">
    {#each MUSCLES as m (m)}
      <div class="bar-row">
        <span class="who">{m}<small>{freshness(m)}</small></span>
        <div class="track" role="img" aria-label="{m}: {counts[m]} sets of 20">
          <i style:width="{Math.min(counts[m], 20) * 5}%"></i>
        </div>
        <span class="n">{counts[m]}</span>
      </div>
    {/each}
  </div>

  <div class="target">
    <div>
      <div class="lbl">Weekly sessions</div>
      <div class="big">{sessionsDone} / {settings.weeklyTarget}</div>
    </div>
    <button type="button" class="pause press" role="switch" aria-checked={settings.paused} onclick={togglePause}>
      <span>
        Pause
        <small>{settings.paused ? 'Paused: no nudges while you recover' : 'Injury or travel'}</small>
      </span>
      <i class="sw" aria-hidden="true"></i>
    </button>
  </div>

  <h2 class="cal-title">Last 8 weeks</h2>
  <div class="cal-days muted" aria-hidden="true">
    {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d, i (i)}<span>{d}</span>{/each}
  </div>
  <div class="cal" role="grid" aria-label="Training days, last 8 weeks">
    {#each calendar as c (c.date)}
      <div class="cell" role="gridcell">
        {#if c.trained}
          <button
            type="button"
            class="day on press"
            class:today={c.isToday}
            aria-label="{c.label}, trained, view summary"
            data-date={c.date}
            data-trained="true"
            onclick={() => openDay(c.date)}
          >{c.dom}</button>
        {:else}
          <span
            class="day"
            class:future={c.future}
            class:today={c.isToday}
            aria-label={c.label}
            role="img"
            data-date={c.date}
            data-trained="false"
          >{c.dom}</span>
        {/if}
      </div>
    {/each}
  </div>
</section>

<Sheet open={picked !== null} onclose={() => (picked = null)} title={pickedLabel} sub={visits.length > 1 ? `${visits.length} workouts` : undefined}>
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
  .lead { margin: 0 0 18px; font-size: 13px; }
  .bars { display: grid; gap: 12px; }
  .bar-row { display: grid; grid-template-columns: 112px 1fr 32px; align-items: center; gap: 10px; font-size: 13.5px; min-height: 40px; }
  .who { display: grid; }
  .who small { font-size: 11.5px; color: var(--muted); }
  .track { height: 8px; border-radius: 4px; background: var(--line); position: relative; overflow: hidden; }
  .track i { position: absolute; inset: 0 auto 0 0; background: var(--blue); border-radius: 4px; transition: width 300ms var(--ease-out); }
  .track::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: #4a5160; }
  .n { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }

  .target { margin-top: 26px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
  .lbl { font-size: 12px; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; }
  .big { font: 800 30px/1.1 var(--display); font-variant-numeric: tabular-nums; }
  .pause { margin-left: auto; min-height: 48px; display: flex; align-items: center; gap: 12px; padding: 0 4px 0 12px; text-align: right; font-size: 14px; font-weight: 500; }
  .pause small { display: block; font-size: 11.5px; font-weight: 400; color: var(--muted); max-width: 150px; }
  .sw { flex: none; width: 44px; height: 26px; border-radius: 13px; background: var(--line); position: relative; transition: background 200ms var(--ease-out); }
  .sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--text); transition: transform 200ms var(--ease-out); }
  .pause[aria-checked='true'] .sw { background: var(--amber); }
  .pause[aria-checked='true'] .sw::after { transform: translateX(18px); background: #fff; }

  .cal-title { font: 600 12px/1 var(--body); color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 28px 0 10px; }
  .cal-days, .cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
  .cal-days { font-size: 11px; text-align: center; margin-bottom: 6px; }
  .cell { display: grid; min-height: 48px; }
  .day { height: 100%; width: 100%; display: grid; place-items: center; border-radius: 8px; background: var(--surface); color: var(--muted); font: 500 12px/1 var(--display); font-variant-numeric: tabular-nums; }
  button.day { border: 0; padding: 0; cursor: pointer; position: relative; }
  button.day::before { content: ''; position: absolute; inset: 0 -2px; } /* hit area reaches 48 px wide as well */
  .day.on { background: var(--blue); color: var(--on-blue); font-weight: 700; }
  .day.today:not(.on) { outline: 1px solid var(--blue); outline-offset: -1px; color: var(--text); }
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
  .day.future { opacity: 0.35; }
</style>
