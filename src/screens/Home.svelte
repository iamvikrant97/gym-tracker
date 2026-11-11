<script lang="ts">
  import { getAll, loadSettings, DEFAULT_SETTINGS } from '../lib/db';
  import { exerciseById, TEMPLATES } from '../lib/seed';
  import { homeNotes, weekStart } from '../lib/stats';
  import { nextSession } from '../lib/selection';
  import { workout, localDate } from '../lib/workout.svelte';
  import type { SessionId, SessionTemplate, SetLog, Settings, Workout } from '../lib/types';
  import Sheet from '../ui/Sheet.svelte';

  let { syncStatus = 'Saved on phone', syncWarn = false }: { syncStatus?: string; syncWarn?: boolean } = $props();

  let workouts = $state.raw<Workout[]>([]);
  let sets = $state.raw<SetLog[]>([]);
  let settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  let picked = $state<SessionId | null>(null);
  let swapOpen = $state(false);

  const now = Date.now();
  const today = localDate(now);
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(now);
  const dateLabel = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const greeting = d.getHours() < 12 ? 'Morning' : d.getHours() < 17 ? 'Afternoon' : 'Evening';

  async function load() {
    try {
      const [w, all, s] = await Promise.all([getAll<Workout>('workouts'), getAll<SetLog>('sets'), loadSettings()]);
      workouts = w;
      sets = all.filter((x) => !x.deleted);
      settings = s;
    } catch {
      // No storage available: show the plan with no history.
    }
  }

  // Reload when a workout starts, ends or is restored.
  $effect(() => {
    void workout.current?.id;
    void workout.active;
    load();
  });

  const resuming = $derived(workout.active);
  const sessionId = $derived<SessionId>(
    resuming ? workout.current!.sessionId : (picked ?? nextSession(workouts, TEMPLATES)),
  );
  const template = $derived(TEMPLATES.find((t) => t.id === sessionId)!);

  const effectiveId = (t: SessionTemplate, templateId: string) =>
    (resuming ? workout.current?.swaps[templateId] : undefined) ?? settings.templateOverrides[t.id]?.[templateId] ?? templateId;

  function describe(t: SessionTemplate) {
    let setCount = 0;
    let seconds = 0;
    const items = t.items.map((item) => {
      const id = effectiveId(t, item.exerciseId);
      const ex = exerciseById(id) ?? workout.exercise(id);
      const rest = Math.min(settings.restOverrides[id] ?? ex?.restSec ?? 120, 300);
      setCount += item.sets;
      seconds += item.sets * (rest + 40);
      return { id, name: ex?.name ?? id, sets: item.sets };
    });
    return { items, setCount, minutes: Math.max(5, Math.round(seconds / 60 / 5) * 5) };
  }

  const plan = $derived(describe(template));
  const doneThisWeek = $derived(workouts.filter((w) => weekStart(w.date) === weekStart(today)).length);
  const sessionNo = $derived(Math.max(1, resuming ? doneThisWeek : doneThisWeek + 1));
  const notes = $derived(homeNotes(sets, workouts, settings, today, (id) => workout.exercise(id)));

  /** Splits a note into plain and emphasised parts (counts and ages read as the figures). */
  function parts(line: string): { text: string; strong: boolean }[] {
    return line
      .split(/(\d+ of \d+|\d+ days? ago|yesterday|today)/)
      .filter(Boolean)
      .map((text, i) => ({ text, strong: i % 2 === 1 }));
  }

  async function start() {
    if (!workout.active) await workout.startWorkout(sessionId);
    location.hash = '#/workout';
  }

  function choose(id: SessionId) {
    picked = id;
    setTimeout(() => (swapOpen = false), 140);
  }
</script>

<section class="screen">
  <div class="home-top">
    <span class="date">{dateLabel}</span>
    <span class="sync"><i class:warn={syncWarn}></i>{syncStatus}</span>
    <button class="gear press" type="button" aria-label="Settings" onclick={() => (location.hash = '#/settings')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    </button>
  </div>

  <h1 class="greet">{greeting}, Vik</h1>

  <article class="today">
    <div class="lbl">Today · session {sessionNo} of {settings.weeklyTarget}</div>
    <h2>{template.name}</h2>
    <div class="meta">{plan.setCount} sets · about {plan.minutes} min</div>
    <ol class="ex-list">
      {#each plan.items as item, i (i)}
        <li><b>{i + 1}</b><span>{item.name}</span><span>{item.sets} sets</span></li>
      {/each}
    </ol>
    <button class="start press" type="button" onclick={start}>{resuming ? 'Resume workout' : 'Start workout'}</button>
    {#if !resuming}
      <button class="swapday" type="button" onclick={() => (swapOpen = true)}>Swap day</button>
    {/if}
  </article>

  <div class="notes">
    {#each notes as line (line)}
      <p class:warn={line.startsWith('Legs')}>
        <span>{#each parts(line) as p}{#if p.strong}<strong>{p.text}</strong>{:else}{p.text}{/if}{/each}</span>
      </p>
    {/each}
  </div>
</section>

<Sheet open={swapOpen} onclose={() => (swapOpen = false)} title="Swap day" sub="Pick any of your six sessions">
  <div role="radiogroup" aria-label="Session">
    {#each TEMPLATES as t (t.id)}
      {@const info = describe(t)}
      <button type="button" role="radio" class="opt press" aria-checked={t.id === sessionId} onclick={() => choose(t.id)}>
        <span>
          <span class="nm">{t.name}</span>
          <span class="meta2">{info.setCount} sets · about {info.minutes} min</span>
        </span>
        <span class="dot"></span>
      </button>
    {/each}
  </div>
</Sheet>

<style>
  .home-top { display: flex; align-items: center; gap: 12px; padding: 10px 0 0; min-height: 56px; }
  .date { font-size: 13px; color: var(--muted); }
  .sync { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  .sync i { width: 7px; height: 7px; border-radius: 50%; background: var(--blue); }
  .sync i.warn { background: var(--amber); }
  .gear { width: 48px; height: 48px; margin-right: -12px; display: grid; place-items: center; border-radius: 14px; color: var(--muted); }
  .gear svg { width: 22px; height: 22px; }
  .greet { font: 800 38px/1.05 var(--body); letter-spacing: -0.015em; margin: 16px 0 18px; text-wrap: balance; }
  .today { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; padding: 20px; }
  .lbl { font-size: 12px; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; }
  h2 { font: 800 32px/1.05 var(--body); letter-spacing: -0.02em; margin: 8px 0 4px; }
  .meta { font-size: 13px; color: var(--muted); }
  .ex-list { list-style: none; margin: 16px 0 18px; padding: 0; display: grid; gap: 8px; }
  .ex-list li { display: flex; gap: 10px; font-size: 14px; }
  .ex-list li b { font: 600 13px/1.6 var(--display); color: var(--blue); min-width: 22px; }
  .ex-list li span:last-child { margin-left: auto; white-space: nowrap; color: var(--muted); font-size: 13px; }
  .start { display: flex; align-items: center; justify-content: center; width: 100%; height: 56px; border-radius: 14px; background: var(--blue); color: #fff; font-weight: 600; font-size: 16px; }
  .swapday { display: block; margin: 12px auto 0; min-height: 48px; padding: 0 16px; font-size: 13px; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
  .notes { margin-top: 18px; display: grid; gap: 8px; }
  .notes p { margin: 0; display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; color: var(--muted); }
  .notes p::before { content: ''; flex: none; width: 6px; height: 6px; border-radius: 50%; background: #3a404c; transform: translateY(-1px); }
  .notes p.warn::before { background: var(--amber); }
  .notes strong { color: var(--text); font-weight: 500; }

  .opt { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 12px; min-height: 56px; border-radius: 12px; text-align: left; }
  .nm { display: block; font-weight: 600; }
  .meta2 { display: block; font-size: 12px; color: var(--muted); }
  .dot { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; border: 2px solid #3a404c; display: grid; place-items: center; flex: none; }
  .opt[aria-checked='true'] { background: var(--raised); }
  .opt[aria-checked='true'] .dot { border-color: var(--blue); }
  .opt[aria-checked='true'] .dot::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--blue); }
</style>
