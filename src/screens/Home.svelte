<script lang="ts">
  import { getAll, loadSettings, DEFAULT_SETTINGS } from '../lib/db';
  import { greetingFor } from '../lib/greeting';
  import { currentPlan, exerciseById, templateFor } from '../lib/seed';
  import { dayVisits, homeNotes, visitKey, visitKeysInWeek } from '../lib/stats';
  import { showToast } from '../ui/toast.svelte';
  import { onMount } from 'svelte';
  import { nextInPlan, nextPlannedWorkout } from '../lib/selection';
  import { planHintDue, trainingDayNote } from '../lib/planSetup';
  import { workout, localDate, EXTRA_SETS } from '../lib/workout.svelte';
  import { estimateMinutes } from '../lib/workoutView';
  import type { SessionId, SessionTemplate, SetLog, Settings, Workout } from '../lib/types';
  import Sheet from '../ui/Sheet.svelte';
  import DaySummarySheet from '../ui/DaySummarySheet.svelte';

  let { syncStatus = 'Saved on phone', syncWarn = false }: { syncStatus?: string; syncWarn?: boolean } = $props();

  let workouts = $state.raw<Workout[]>([]);
  let sets = $state.raw<SetLog[]>([]);
  let settings = $state.raw<Settings>(workout.settings ?? DEFAULT_SETTINGS);
  let picked = $state<SessionId | null>(null);
  let swapOpen = $state(false);
  let summaryOpen = $state(false);

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
    const line = (id: string, sets: number) => {
      const ex = exerciseById(id) ?? workout.exercise(id);
      const rest = Math.min(settings.restOverrides[id] ?? ex?.restSec ?? 120, 300);
      setCount += sets;
      for (let i = 0; i < sets; i++) rests.push(rest);
      return { id, name: ex?.name ?? id, sets };
    };
    const items = t.items.map((item) => line(effectiveId(t, item.exerciseId), item.sets));
    // Exercises added to the session: kept ones, and today's when this is the running workout.
    const added = [
      ...(settings.templateExtras?.[t.id] ?? []),
      ...(following && workout.current?.sessionId === t.id ? (workout.current.extras ?? []).map((exerciseId) => ({ exerciseId, sets: EXTRA_SETS })) : []),
    ];
    for (const a of added) if (!items.some((i) => i.id === a.exerciseId)) items.push(line(a.exerciseId, a.sets));
    return { items, setCount, minutes: estimateMinutes(rests) };
  }

  const plan = $derived(describe(template));

  // Today is done: a workout with working sets was finished today (not running, and not one to carry on with).
  const todayVisits = $derived(dayVisits(today, workouts, sets, (id) => exerciseById(id) ?? workout.exercise(id)));
  const done = $derived(!following && todayVisits.length > 0);
  // Several workouts today (a second session): the card is about the latest, and says how many there were.
  const lastVisit = $derived(todayVisits.at(-1) ?? null);
  const doneName = $derived(lastVisit?.name ?? '');
  const doneSets = $derived(lastVisit?.sets ?? 0);
  const doneVolume = $derived(lastVisit?.volume ?? 0);
  // Imported workouts have no real duration (the day summary hides it too): minutes is null for them.
  const doneMinutes = $derived(lastVisit?.minutes ?? null);
  const num = (n: number) => Math.round(n).toLocaleString('en-IN');
  const next = $derived(done ? nextPlannedWorkout(planNow, counted, d.getDay()) : null);
  const nextLabel = $derived(next ? (next.weekday === null ? next.session.name : `${DAYS[next.weekday]} · ${next.session.name}`) : '');
  const summaryTitle = $derived(`${d.getDate()} ${MONTHS[d.getMonth()]}`);
  // Visits (date + session), so a long break that split one visit into two workouts still counts once.
  const visits = $derived(visitKeysInWeek(workouts, sets, today));
  const sessionNo = $derived(
    Math.max(1, following && visits.has(visitKey(workout.current!)) ? visits.size : visits.size + 1),
  );
  // A stored name wins. With no name: no plan yet (the original install, before migration) is Vik's; a plan means a new install,
  // which gets the plain greeting and the training-days note.
  const who = $derived(settings.userName ?? (settings.plan ? '' : 'Vik'));
  const greeting = $derived(greetingFor(d.getHours(), who, settings.greetNames).text);
  const isVik = $derived(!settings.plan || settings.userName === 'Vik');
  const notes = $derived([
    ...homeNotes(sets, workouts, settings, today, (id) => workout.exercise(id)),
    ...(isVik ? [] : [trainingDayNote(planNow, new Date(now))].filter(Boolean)),
  ]);

  // A gentle, one-time nudge after 8 weeks of data on a plan (not for Vik's own install). Dismissing it is saved.
  let hintGone = $state(false);
  const showHint = $derived(!isVik && !hintGone && !settings.planHintDismissed && planHintDue(planNow, workouts, sets));
  async function dismissHint() {
    hintGone = true;
    try {
      await workout.updateSettings({ planHintDismissed: true });
    } catch {
      showToast('Could not save that');
    }
  }

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

  <h1 class="greet">{greeting}</h1>

  {#if done}
    <button class="today donecard press" type="button" aria-label="Done · {doneName}, view summary" onclick={() => (summaryOpen = true)}>
      <span class="lbl">Today</span>
      <span class="dname">Done · {doneName}</span>
      {#if todayVisits.length > 1}<span class="more">{todayVisits.length} workouts today · tap for all</span>{/if}
      <span class="figs">
        <span class="fig"><span class="k">Volume</span><span class="v"><span data-testid="done-volume">{num(doneVolume)}</span><small>kg</small></span></span>
        <span class="fig"><span class="k">Sets</span><span class="v" data-testid="done-sets">{doneSets}</span></span>
        {#if doneMinutes !== null}<span class="fig"><span class="k">Time</span><span class="v"><span data-testid="done-minutes">{doneMinutes}</span><small>min</small></span></span>{/if}
      </span>
    </button>
    <div class="next" data-testid="next-workout">
      <span class="lbl">Next workout</span>
      <b>{nextLabel}</b>
    </div>
    <button class="another press" type="button" aria-label="Train another session today" disabled={!workout.ready || starting} onclick={start}>
      Train another session today<small>{template.name}</small>
    </button>
    <button class="swapday" type="button" onclick={() => (swapOpen = true)}>Choose a different session</button>
  {:else}
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

  {/if}

  <div class="notes">
    {#each notes as line (line)}
      <p class:warn={line.startsWith('Legs')}>
        <span>{#each parts(line) as p}{#if p.strong}<strong>{p.text}</strong>{:else}{p.text}{/if}{/each}</span>
      </p>
    {/each}
  </div>

  {#if showHint}
    <aside class="plan-hint" aria-label="Plan hint">
      <p>Ready to change things up? Settings → Training plan</p>
      <button class="x press" type="button" aria-label="Dismiss hint" onclick={dismissHint}>✕</button>
    </aside>
  {/if}
</section>

<DaySummarySheet open={summaryOpen} onclose={() => (summaryOpen = false)} title={summaryTitle} visits={todayVisits} />

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
  .donecard { display: block; width: 100%; text-align: left; color: inherit; font: inherit; }
  .donecard .lbl { display: block; }
  .dname { display: block; font: 800 28px/1.1 var(--body); letter-spacing: -0.02em; margin: 8px 0 14px; }
  .more { display: block; margin: -8px 0 12px; font-size: 13px; color: var(--muted); }
  .figs { display: flex; gap: 10px; }
  .fig { flex: 1; display: grid; gap: 4px; background: var(--raised); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }
  .fig .k { font-size: 11px; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; }
  .fig .v { font: 700 20px/1 var(--display); font-variant-numeric: tabular-nums; }
  .fig small { font: 500 12px/1 var(--body); color: var(--muted); margin-left: 3px; }
  .next { margin-top: 12px; min-height: 56px; display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 8px 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; }
  .next b { font: 600 16px/1.2 var(--body); }
  .another { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; min-height: 56px; margin-top: 12px; border-radius: 14px; background: var(--raised); border: 1px solid var(--line); font-weight: 600; font-size: 15px; }
  .another small { font-size: 12px; font-weight: 400; color: var(--muted); }
  .another:disabled { opacity: 0.6; }
  .notes { margin-top: 18px; display: grid; gap: 8px; }
  .notes p { margin: 0; display: flex; gap: 10px; align-items: baseline; font-size: 13.5px; color: var(--muted); }
  .notes p::before { content: ''; flex: none; width: 6px; height: 6px; border-radius: 50%; background: #3a404c; transform: translateY(-1px); }
  .notes p.warn::before { background: var(--amber); }
  .notes strong { color: var(--text); font-weight: 500; }

  .plan-hint { margin-top: 18px; display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 16px; border-radius: 14px; background: var(--raised); }
  .plan-hint p { margin: 0; flex: 1; font-size: 13.5px; color: var(--muted); }
  .plan-hint .x { width: 48px; height: 48px; flex: none; border-radius: 12px; color: var(--muted); font-size: 15px; }

  .opt { width: 100%; display: flex; align-items: center; gap: 12px; padding: 14px 12px; min-height: 56px; border-radius: 12px; text-align: left; }
  .nm { display: block; font-weight: 600; }
  .meta2 { display: block; font-size: 12px; color: var(--muted); }
  .dot { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--ring); display: grid; place-items: center; flex: none; }
  .opt[aria-checked='true'] { background: var(--raised); }
  .opt[aria-checked='true'] .dot { border-color: var(--blue); }
  .opt[aria-checked='true'] .dot::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--blue); }
</style>
