<script lang="ts">
  import { getAll, loadSettings, DEFAULT_SETTINGS } from '../lib/db';
  import { currentPlan, exerciseById, templateFor } from '../lib/seed';
  import { homeNotes, visitKey, visitKeysInWeek } from '../lib/stats';
  import { showToast } from '../ui/toast.svelte';
  import { onMount } from 'svelte';
  import { nextInPlan } from '../lib/selection';
  import { trainingDayNote } from '../lib/planSetup';
  import { workout, localDate } from '../lib/workout.svelte';
  import { estimateMinutes } from '../lib/workoutView';
  import type { SessionId, SessionTemplate, SetLog, Settings, Workout } from '../lib/types';
  import Sheet from '../ui/Sheet.svelte';

  let { syncStatus = 'Saved on phone', syncWarn = false }: { syncStatus?: string; syncWarn?: boolean } = $props();

  let workouts = $state.raw<Workout[]>([]);
  let sets = $state.raw<SetLog[]>([]);
  let settings = $state.raw<Settings>(workout.settings ?? DEFAULT_SETTINGS);
  let picked = $state<SessionId | null>(null);
  let swapOpen = $state(false);

  // The app can sit open (or in the background) overnight: re-read the clock when it comes back and every minute.
  let now = $state(Date.now());
  onMount(() => {
    const tick = () => {
      const t = Date.now();
      if (localDate(t) !== localDate(now)) load();
      now = t;
    };
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    const timer = setInterval(tick, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      clearInterval(timer);
    };
  });
  const today = $derived(localDate(now));
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = $derived(new Date(now));
  const dateLabel = $derived(`${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`);
  const greeting = $derived(d.getHours() < 12 ? 'Morning' : d.getHours() < 17 ? 'Afternoon' : 'Evening');
  let starting = $state(false);

  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    try {
      const [w, all, s] = await Promise.all([getAll<Workout>('workouts'), getAll<SetLog>('sets'), loadSettings()]);
      if (seq !== loadSeq) return; // a newer load started: never let an older result overwrite it
      workouts = w;
      sets = all.filter((x) => !x.deleted);
      settings = s;
    } catch {
      // No storage available: show the plan with no history.
    }
  }

  // Reload when a workout starts, ends or is restored, or settings change (Settings screen).
  $effect(() => {
    void workout.current?.id;
    void workout.active;
    void workout.settings;
    load();
  });

  const planNow = $derived(currentPlan());
  const resuming = $derived(workout.active);
  // Closed by the idle rule earlier today (a call, a queue for the bench): offer to carry on with it.
  // (a session of a plan that was since replaced is not continued)
  const continuing = $derived(!resuming && picked === null && !!workout.current && !!templateFor(workout.current.sessionId) && workout.canResume(now));
  const following = $derived(resuming || continuing);
  // A workout with no sets (discarded, or opened by mistake and closed) does not move the rotation on.
  const counted = $derived.by(() => {
    const withSets = new Set(sets.filter((x) => !x.warmup).map((x) => x.workoutId));
    return workouts.filter((w) => withSets.has(w.id) || w.id === workout.current?.id);
  });
  const sessionId = $derived<SessionId>(
    following ? workout.current!.sessionId : (picked ?? nextInPlan(planNow, counted)),
  );
  const swapSub = $derived(
    planNow.sessions.length === 1 ? 'Your session' : `Pick any of your ${planNow.sessions.length === 6 ? 'six' : planNow.sessions.length} sessions`,
  );
  const resumingEmpty = $derived(resuming && workout.sets.length === 0);
  const template = $derived(templateFor(sessionId) ?? planNow.sessions[0]);

  const effectiveId = (t: SessionTemplate, templateId: string) =>
    (following ? workout.current?.swaps[templateId] : undefined) ?? settings.templateOverrides[t.id]?.[templateId] ?? templateId;

  function describe(t: SessionTemplate) {
    let setCount = 0;
    const rests: number[] = [];
    const items = t.items.map((item) => {
      const id = effectiveId(t, item.exerciseId);
      const ex = exerciseById(id) ?? workout.exercise(id);
      const rest = Math.min(settings.restOverrides[id] ?? ex?.restSec ?? 120, 300);
      setCount += item.sets;
      for (let i = 0; i < item.sets; i++) rests.push(rest);
      return { id, name: ex?.name ?? id, sets: item.sets };
    });
    return { items, setCount, minutes: estimateMinutes(rests) };
  }

  const plan = $derived(describe(template));
  // Visits (date + session), so a long break that split one visit into two workouts still counts once.
  const visits = $derived(visitKeysInWeek(workouts, sets, today));
  const sessionNo = $derived(
    Math.max(1, following && visits.has(visitKey(workout.current!)) ? visits.size : visits.size + 1),
  );
  // userName is undefined only on the original install (Vik's): new installs get the plain greeting and a days note.
  const who = $derived(settings.userName === undefined ? 'Vik' : settings.userName);
  const notes = $derived([
    ...homeNotes(sets, workouts, settings, today, (id) => workout.exercise(id)),
    ...(settings.userName === undefined ? [] : [trainingDayNote(planNow, new Date(now))].filter(Boolean)),
  ]);

  /** Splits a note into plain and emphasised parts (counts and ages read as the figures). */
  function parts(line: string): { text: string; strong: boolean }[] {
    return line
      .split(/(\d+ of \d+|\d+ days? ago|yesterday|today)/)
      .filter(Boolean)
      .map((text, i) => ({ text, strong: i % 2 === 1 }));
  }

  async function start() {
    if (starting || !workout.ready) return;
    starting = true;
    try {
      if (continuing) await workout.resume();
      else if (!workout.active) await workout.startWorkout(sessionId);
      location.hash = '#/workout';
    } catch (e) {
      showToast(e instanceof Error ? `Could not start: ${e.message}` : 'Could not start the workout');
    } finally {
      starting = false;
    }
  }

  async function discard() {
    try {
      await workout.discard();
      picked = null;
      showToast('Workout discarded');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not discard');
    }
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

  <h1 class="greet">{who ? `${greeting}, ${who}` : greeting}</h1>

  <article class="today">
    <div class="lbl">Today · session {sessionNo} of {settings.weeklyTarget}</div>
    <h2>{template.name}</h2>
    <div class="meta">{plan.setCount} sets · about {plan.minutes} min</div>
    <ol class="ex-list">
      {#each plan.items as item, i (i)}
        <li><b>{i + 1}</b><span>{item.name}</span><span>{item.sets} sets</span></li>
      {/each}
    </ol>
    <button class="start btn-primary press" type="button" disabled={!workout.ready || starting} onclick={start}>{resuming ? 'Resume workout' : continuing ? 'Continue workout' : 'Start workout'}</button>
    {#if !resuming}
      <button class="swapday" type="button" onclick={() => (swapOpen = true)}>Swap day</button>
    {:else if resumingEmpty}
      <button class="swapday" type="button" onclick={discard}>Discard workout (no sets yet)</button>
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

<Sheet open={swapOpen} onclose={() => (swapOpen = false)} title="Swap day" sub={swapSub}>
  <div role="radiogroup" aria-label="Session">
    {#each planNow.sessions as t (t.id)}
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
  .start { display: flex; align-items: center; justify-content: center; width: 100%; height: 56px; border-radius: 14px; background: var(--blue); color: var(--on-blue); font-weight: 600; font-size: 16px; transition: transform 160ms var(--ease-out), opacity 160ms; }
  .start:disabled { opacity: 0.6; }
  .swapday { display: block; margin: 12px auto 0; min-height: 48px; padding: 0 16px; font-size: 13px; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
  .notes { margin-top: 18px; display: grid; gap: 8px; }
  .notes p { margin: 0; display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; color: var(--muted); }
  .notes p::before { content: ''; flex: none; width: 6px; height: 6px; border-radius: 50%; background: #3a404c; transform: translateY(-1px); }
  .notes p.warn::before { background: var(--amber); }
  .notes strong { color: var(--text); font-weight: 500; }

  .opt { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 12px; min-height: 56px; border-radius: 12px; text-align: left; }
  .nm { display: block; font-weight: 600; }
  .meta2 { display: block; font-size: 12px; color: var(--muted); }
  .dot { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--ring); display: grid; place-items: center; flex: none; }
  .opt[aria-checked='true'] { background: var(--raised); }
  .opt[aria-checked='true'] .dot { border-color: var(--blue); }
  .opt[aria-checked='true'] .dot::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--blue); }
</style>
