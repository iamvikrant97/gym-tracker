<script module lang="ts">
  import { e1rm } from '../lib/progression';
  import type { SetLog } from '../lib/types';

  const isWorking = (s: SetLog) => !s.warmup && !s.deleted;

  /** Session-best e1RM of one exercise by date, oldest first. Warm-up and deleted sets are ignored. */
  export function sessionBests(sets: SetLog[], exerciseId: string): { date: string; value: number }[] {
    const byDate = new Map<string, number>();
    for (const s of sets) {
      if (s.exerciseId !== exerciseId || !isWorking(s) || s.reps <= 0) continue;
      byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, e1rm(s.kg, s.reps)));
    }
    return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
  }
</script>

<script lang="ts">
  import { DEFAULT_SETTINGS, getAll, loadSettings } from '../lib/db';
  import { listExercises } from '../lib/db';
  import { addWeightDue } from '../lib/progression';
  import { exerciseById } from '../lib/seed';
  import { muscleTrend, setsPerWeek, weekStart } from '../lib/stats';
  import type { Exercise, Muscle, Settings } from '../lib/types';
  import { workout, localDate } from '../lib/workout.svelte';
  import AddExerciseForm from '../ui/AddExerciseForm.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Sparkbars from '../ui/Sparkbars.svelte';
  import { showToast } from '../ui/toast.svelte';
  import TrendChart from '../ui/TrendChart.svelte';

  // App passes syncStatus / syncWarn to every screen; this one has no sync indicator, so they are ignored.

  const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Calves', 'Abs'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_MS = 86_400_000;
  const dayLabel = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

  const today = localDate(Date.now());
  /** addWeightDue looks at sessions strictly before its date, so pass tomorrow to include today's sets. */
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

  let view = $state<'muscles' | 'exercises'>('muscles');
  let sets = $state.raw<SetLog[]>([]);
  let library = $state.raw<Exercise[]>([]);
  let settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  let muscleSheet = $state<Muscle | null>(null);
  let exerciseSheet = $state<string | null>(null);
  let addFor = $state<Muscle | null>(null);
  let sheetMuscle = $state<Muscle>('Chest');
  let sheetExercise = $state<string>('');
  let addMuscle = $state<Muscle>('Chest');

  const lookup = (id: string): Exercise | undefined => exerciseById(id) ?? library.find((e) => e.id === id) ?? workout.exercise(id);

  async function load() {
    try {
      const [all, lib, s] = await Promise.all([getAll<SetLog>('sets'), listExercises(), loadSettings()]);
      sets = all.filter((x) => !x.deleted);
      library = lib;
      settings = s;
    } catch {
      // No storage available: show an empty history.
    }
  }

  // Reload when a workout starts, ends, or logs another set.
  $effect(() => {
    void workout.current?.id;
    void workout.sets.length;
    load();
  });

  /** Exercises of a muscle: those with logged sets plus any added by Vik. */
  function exercisesOf(muscle: Muscle): Exercise[] {
    const logged = new Set(sets.filter(isWorking).map((s) => s.exerciseId));
    return library.filter((e) => e.muscle === muscle && (logged.has(e.id) || e.id.startsWith('custom-')));
  }

  const rows = $derived(
    MUSCLES.map((m) => {
      const weeks = setsPerWeek(sets, m, 4, today, lookup);
      const trend = muscleTrend(sets, m, today, lookup);
      return { muscle: m, weeks, trend, thisWeek: weeks[weeks.length - 1], exercises: exercisesOf(m) };
    }),
  );

  function trendText(t: number): string {
    const r = Math.round(t);
    return r > 0 ? `+${r}%` : `${r}%`;
  }
  const trendClass = (t: number) => (Math.round(t) > 0 ? 'up' : Math.round(t) < 0 ? 'down' : 'flat');

  function lastBest(exerciseId: string): { kg: number; reps: number; date: string } | null {
    const mine = sets.filter((s) => s.exerciseId === exerciseId && isWorking(s));
    if (mine.length === 0) return null;
    const date = mine.reduce((d, s) => (s.date > d ? s.date : d), '');
    const ex = lookup(exerciseId);
    const day = mine.filter((s) => s.date === date);
    const best = day.reduce((a, b) =>
      ex?.assisted ? (b.kg < a.kg ? b : a) : e1rm(b.kg, b.reps) > e1rm(a.kg, a.reps) ? b : a,
    );
    return { kg: best.kg, reps: best.reps, date };
  }

  const exerciseRow = (ex: Exercise) => ({
    ex,
    last: lastBest(ex.id),
    due: addWeightDue(ex, sets, tomorrow),
  });

  /** Eight weekly points for a muscle: each exercise's weekly mean best e1RM as % of its first week, averaged. */
  function muscleSeries(muscle: Muscle): number[] {
    const thisWeek = Date.parse(`${weekStart(today)}T00:00:00Z`);
    const perEx = new Map<string, Map<number, number[]>>();
    for (const s of sets) {
      const ex = lookup(s.exerciseId);
      if (!isWorking(s) || s.reps <= 0 || !ex || ex.muscle !== muscle || ex.assisted) continue;
      const back = Math.round((thisWeek - Date.parse(`${weekStart(s.date)}T00:00:00Z`)) / (7 * DAY_MS));
      if (back < 0 || back > 7) continue;
      const weeks = perEx.get(s.exerciseId) ?? new Map<number, number[]>();
      weeks.set(back, [...(weeks.get(back) ?? []), e1rm(s.kg, s.reps)]);
      perEx.set(s.exerciseId, weeks);
    }
    // The best of each date, then the mean per week.
    const out: number[] = [];
    for (let back = 7; back >= 0; back--) {
      const vals: number[] = [];
      for (const weeks of perEx.values()) {
        const here = weeks.get(back);
        if (!here) continue;
        const firstBack = Math.max(...weeks.keys());
        const base = weeks.get(firstBack)!;
        vals.push((mean(here) / mean(base)) * 100);
      }
      if (vals.length) out.push(mean(vals));
    }
    return out;
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const sheetRow = $derived(rows.find((r) => r.muscle === sheetMuscle));
  const sheetSeries = $derived(muscleSeries(sheetMuscle));
  const sheetEx = $derived(lookup(sheetExercise));
  const sheetBests = $derived(sheetExercise ? sessionBests(sets, sheetExercise).slice(-12) : []);

  function openMuscle(m: Muscle) {
    sheetMuscle = m;
    muscleSheet = m;
  }
  function openExercise(id: string) {
    sheetExercise = id;
    exerciseSheet = id;
  }
  function openAdd(m: Muscle) {
    addMuscle = m;
    addFor = m;
  }
  async function added(ex: Exercise) {
    addFor = null;
    await load();
    showToast(`${ex.name} added`);
  }
</script>

<section class="screen">
  <h1 class="page-title">Progress</h1>
  <div class="seg-ctl" role="tablist" aria-label="Progress view">
    <button type="button" role="tab" aria-selected={view === 'muscles'} onclick={() => (view = 'muscles')}>Muscles</button>
    <button type="button" role="tab" aria-selected={view === 'exercises'} onclick={() => (view = 'exercises')}>Exercises</button>
  </div>

  {#if view === 'muscles'}
    <div class="pane">
      <p class="muted small">Strength change over the last 4 weeks · sets per week</p>
      {#each rows as r (r.muscle)}
        <button type="button" class="mrow press" aria-label={r.muscle} onclick={() => openMuscle(r.muscle)}>
          <div>
            <div class="nm">{r.muscle}</div>
            <div class="sub">{r.thisWeek} sets this week · {r.exercises.length} exercise{r.exercises.length === 1 ? '' : 's'}</div>
          </div>
          <Sparkbars values={r.weeks} low={r.thisWeek < 10} />
          {#if r.trend === null}
            <div class="nodata">Not enough data yet</div>
          {:else}
            <div class="delta {trendClass(r.trend)}">{trendText(r.trend)}</div>
          {/if}
        </button>
      {/each}
    </div>
  {:else}
    <div class="pane">
      {#each rows as r (r.muscle)}
        <h2 class="group">{r.muscle}</h2>
        {#each r.exercises as ex (ex.id)}
          {@const row = exerciseRow(ex)}
          <button type="button" class="list-row press" onclick={() => openExercise(ex.id)}>
            <div>
              <div class="nm">{ex.name}</div>
              <div class="sub">{row.last ? `${row.last.kg} × ${row.last.reps} · ${dayLabel(row.last.date)}` : 'No sets yet'}</div>
            </div>
            {#if row.last}
              <span class="flag" class:keep={!row.due}>{row.due ? 'Add weight' : 'Keep building'}</span>
            {/if}
          </button>
        {/each}
        <button type="button" class="add press" onclick={() => openAdd(r.muscle)}>+ Add exercise</button>
      {/each}
    </div>
  {/if}
</section>

<Sheet
  open={muscleSheet !== null}
  onclose={() => (muscleSheet = null)}
  title={sheetMuscle}
  sub={sheetRow?.trend == null
    ? 'Not enough data yet'
    : `Strength ${Math.round(sheetRow.trend) >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(sheetRow.trend))}% in 4 weeks · average of its exercises`}
>
  {#if sheetRow?.trend != null && sheetSeries.length > 1}
    <TrendChart points={sheetSeries} label="{sheetMuscle} strength trend" />
  {/if}
  <div>
    {#each sheetRow?.exercises ?? [] as ex (ex.id)}
      <div class="ex-mini"><span>{ex.name}</span><span>{lastBest(ex.id) ? `${lastBest(ex.id)!.kg} × ${lastBest(ex.id)!.reps}` : 'No sets yet'}</span></div>
    {:else}
      <p class="muted small">No exercises logged yet.</p>
    {/each}
  </div>
</Sheet>

<Sheet
  open={exerciseSheet !== null}
  onclose={() => (exerciseSheet = null)}
  title={sheetEx?.name ?? 'Exercise'}
  sub={sheetEx?.assisted ? 'Chart not available for assisted exercises' : 'Best set each session, estimated 1-rep max'}
>
  {#if sheetBests.length > 1 && !sheetEx?.assisted}
    <TrendChart
      points={sheetBests.map((b) => b.value)}
      startLabel={dayLabel(sheetBests[0].date)}
      endLabel={dayLabel(sheetBests[sheetBests.length - 1].date)}
      label="{sheetEx?.name ?? 'Exercise'} estimated 1-rep max"
    />
    <div class="ex-mini"><span>Latest</span><span>{sheetBests[sheetBests.length - 1].value} kg</span></div>
  {:else if !sheetEx?.assisted}
    <p class="muted small">Not enough data yet</p>
  {/if}
</Sheet>

<Sheet open={addFor !== null} onclose={() => (addFor = null)} title="Add exercise" sub={addMuscle}>
  {#if addFor !== null}
    <AddExerciseForm muscle={addMuscle} onadded={added} />
  {/if}
</Sheet>

<style>
  .small { font-size: 12.5px; margin: 0 0 6px; }
  .seg-ctl { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 3px; margin-bottom: 16px; }
  .seg-ctl button { height: 48px; border-radius: 9px; font-size: 14px; color: var(--muted); transition: background 200ms var(--ease-out), color 200ms var(--ease-out); }
  .seg-ctl button[aria-selected='true'] { background: var(--raised); color: var(--text); }
  .pane { animation: fade 200ms var(--ease-out); }
  @keyframes fade { from { opacity: 0; } }
  .mrow { width: 100%; display: grid; grid-template-columns: 1fr auto 72px; align-items: center; gap: 12px; padding: 14px 2px; min-height: 64px; border-bottom: 1px solid var(--line); text-align: left; }
  .nm { font-weight: 600; }
  .sub { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .delta { font: 700 22px/1 var(--display); font-variant-numeric: tabular-nums; text-align: right; }
  .delta.up { color: var(--blue); }
  .delta.flat { color: var(--muted); }
  .delta.down { color: var(--amber); }
  .nodata { font-size: 11px; line-height: 1.2; color: var(--muted); text-align: right; }
  .group { font: 600 12px/1 var(--body); color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 22px 0 4px; }
  .list-row { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 0; min-height: 56px; border-bottom: 1px solid var(--line); text-align: left; }
  .list-row .nm { font-weight: 500; }
  .flag { margin-left: auto; font-size: 12px; font-weight: 600; padding: 5px 8px; border-radius: 7px; background: var(--blue); color: #fff; white-space: nowrap; }
  .flag.keep { background: var(--raised); color: var(--muted); font-weight: 500; }
  .add { display: flex; align-items: center; min-height: 48px; padding: 0 2px; font-size: 14px; color: var(--blue); }
  .ex-mini { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
  .ex-mini span:last-child { color: var(--muted); font-variant-numeric: tabular-nums; }
</style>
