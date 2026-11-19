<script lang="ts">
  import { DEFAULT_SETTINGS, getAll, loadSettings } from '../lib/db';
  import { exerciseById } from '../lib/seed';
  import { dayVisits, daysSince, visitKeysInWeek, weekStart, weeklySets } from '../lib/stats';
  import type { Exercise, Muscle, SetLog, Settings, Workout } from '../lib/types';
  import { localDate, workout } from '../lib/workout.svelte';
  import DaySummarySheet from '../ui/DaySummarySheet.svelte';

  // App passes syncStatus / syncWarn to every screen; this one has no sync indicator, so they are ignored.

  const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];
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

  interface Day { color: string; date: string; dom: number; label: string; letter: string; trained: boolean; future: boolean; isToday: boolean; rest: boolean }
  const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  /** Eight week rows, oldest first: which days were trained, sessions done, PRs and hard sets that week. */
  // Colour of each trained day (the session's colour; the first workout when there were several).
  const toneByDate = $derived(new Map([...trainedDays].map((d) => [d, dayVisits(d, workouts, sets, lookup)[0]?.color ?? ''])));
  const rows = $derived.by(() => {
    const first = Date.parse(`${weekStart(today)}T00:00:00Z`) - (WEEKS - 1) * 7 * DAY_MS;
    return Array.from({ length: WEEKS }, (_, w) => {
      const days: Day[] = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(first + (w * 7 + i) * DAY_MS).toISOString().slice(0, 10);
        const dom = Number(date.slice(8, 10));
        return {
          date, dom, letter: LETTERS[i], color: toneByDate.get(date) ?? '',
          label: `${dom} ${MONTHS[Number(date.slice(5, 7)) - 1]}`,
          trained: trainedDays.has(date) && date <= today, // a future date with sets (typo, wrong clock) is not a trained day
          future: date > today,
          isToday: date === today,
          rest: !!settings.restDays?.includes(date) && !trainedDays.has(date),
        };
      });
      const trained = days.filter((d) => d.trained);
      const visits = trained.flatMap((d) => dayVisits(d.date, workouts, sets, lookup));
      const a = days[0], z = days[6];
      const label = a.label.slice(-3) === z.label.slice(-3) ? `${a.dom}–${z.label}` : `${a.label} – ${z.label}`;
      return {
        start: a.date, label, days, done: trained.length, current: w === WEEKS - 1,
        prs: visits.reduce((n, v) => n + v.prs, 0), sets: visits.reduce((n, v) => n + v.sets, 0),
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
  const pickedLabel = $derived(rows.flatMap((r) => r.days).find((c) => c.date === shown)?.label ?? '');
  // Older / newer trained day, for the arrows in the sheet.
  const trainedList = $derived(rows.flatMap((r) => r.days).filter((d) => d.trained).map((d) => d.date));
  const at = $derived(shown ? trainedList.indexOf(shown) : -1);
  const older = $derived(at > 0 ? trainedList[at - 1] : null);
  const newer = $derived(at >= 0 && at < trainedList.length - 1 ? trainedList[at + 1] : null);
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
  <div class="rows" role="grid" aria-label="Training days, last 8 weeks">
    {#each rows as r, ri (r.start)}
      <div class="wk" class:cur={r.current} role="row" style:--i={ri}>
        <span class="wl">{r.current ? 'This week' : r.label}</span>
        <div class="dots">
          {#each r.days as c, di (c.date)}
            {#if c.trained}
              <button
                type="button"
                class="dot on press"
                class:today={c.isToday}
                aria-label="{c.label}, trained, view summary"
                data-date={c.date}
                data-trained="true"
                style:--d={di}
                style:--c={c.color || undefined}
                onclick={() => openDay(c.date)}
              >{c.letter}</button>
            {:else}
              <span class="dot" class:future={c.future} class:today={c.isToday} class:rest={c.rest} aria-label={c.rest ? `${c.label}, rest day` : c.label} role="img" data-rest={c.rest} data-date={c.date} data-trained="false">{c.rest ? 'R' : c.letter}</span>
            {/if}
          {/each}
        </div>
        <div class="wr">
          <b class:hit={r.done >= settings.weeklyTarget && r.done > 0}>{r.done}<span> / {settings.weeklyTarget}</span></b>
          {#if r.prs > 0}<small class="gold">{r.prs} PR{r.prs === 1 ? '' : 's'}</small>{:else if r.sets > 0}<small>{r.sets} sets</small>{:else}<small>rest week</small>{/if}
        </div>
      </div>
    {/each}
  </div>
</section>

<DaySummarySheet open={picked !== null} onclose={() => (picked = null)} title={pickedLabel} {visits} onprev={older ? () => openDay(older) : undefined} onnext={newer ? () => openDay(newer) : undefined} />

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
  .rows { display: grid; }
  /* Rows rise in one after another, trained dots pop in along the row, and the target turns green with a short flash. */
  .wk { animation: wkin 420ms var(--ease-out) both; animation-delay: calc(var(--i) * 45ms); }
  .dot.on { animation: dotpop 380ms var(--ease-out) both; animation-delay: calc(var(--i, 0) * 45ms + var(--d, 0) * 28ms + 120ms); }
  .wr b.hit { animation: hitflash 900ms var(--ease-out) both; animation-delay: calc(var(--i, 0) * 45ms + 300ms); }
  @keyframes wkin { from { opacity: 0; transform: translateY(10px); } }
  @keyframes dotpop { from { opacity: 0; transform: scale(0.5); } 60% { transform: scale(1.08); } }
  @keyframes hitflash { 0% { text-shadow: 0 0 0 transparent; } 40% { text-shadow: 0 0 12px rgba(30, 215, 96, 0.7); } 100% { text-shadow: 0 0 0 transparent; } }
  @media (prefers-reduced-motion: reduce) { .wk, .dot.on, .wr b.hit { animation: none; } }
  .wk { display: grid; grid-template-columns: 50px minmax(0, 1fr) 46px; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--line); }
  .wl { font-size: 11.5px; color: var(--muted); line-height: 1.2; }
  .wk.cur .wl { color: var(--text); font-weight: 600; }
  .dots { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .dot { aspect-ratio: 1; min-width: 0; border-radius: 50%; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--line); color: var(--muted); font: 600 11px/1 var(--display); }
  button.dot { padding: 0; cursor: pointer; position: relative; }
  button.dot::before { content: ''; position: absolute; inset: -9px -2px; } /* hit area reaches about 48 px tall */
  .dot.on { background: var(--c, var(--blue)); border-color: var(--c, var(--blue)); color: #0b0d11; font-weight: 800; }
  .dot.today:not(.on) { border-color: var(--blue); color: var(--text); }
  .dot.future { opacity: 0.35; }
  .dot.rest { color: var(--amber); border-color: color-mix(in srgb, var(--amber) 45%, var(--line)); font-weight: 800; }
  .wr { text-align: right; line-height: 1.15; }
  .wr b { font: 800 16px var(--display); font-variant-numeric: tabular-nums; }
  .wr b span { font: 500 11px var(--body); color: var(--muted); }
  .wr b.hit { color: var(--green); }
  .wr small { display: block; font-size: 11px; color: var(--muted); }
  .wr small.gold { color: var(--amber); font-weight: 700; }
</style>
