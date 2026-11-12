<script lang="ts">
  import { onMount } from 'svelte';
  import { listExercises } from '../lib/db';
  import { EXERCISES } from '../lib/seed';
  import { GREET_MAX, cleanGreetName } from '../lib/greeting';
  import { DAY_LONG, DAY_SHORT, PLAN_CARDS, WEEK_ORDER, daysLabel, defaultDays, sortDays, suggestedPlanFor, type PlanChoice } from '../lib/planSetup';
  import { currentPlan, planFromTemplate, resolvePlan, VIK_PLAN, type TemplatePlanId } from '../lib/seed';
  import { weekSchedule } from '../lib/selection';
  import { workout } from '../lib/workout.svelte';
  import { fmtKg } from '../lib/workoutView';
  import AddExerciseForm from '../ui/AddExerciseForm.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import type { Exercise, Muscle, Plan } from '../lib/types';

  /**
   * First-run setup, and "Change plan" in Settings. firstRun: no back button on the first step and the greeting
   * name is cleared; otherwise the first step goes back to Settings.
   */
  let { firstRun = true, onfinish, oncancel, onrestore }: { firstRun?: boolean; onfinish: () => void; oncancel?: () => void; onrestore?: () => void } = $props();

  type Step = 'days' | 'plan' | 'build' | 'review';
  type Choice = PlanChoice;
  interface Draft { key: string; id: string; name: string; ids: string[] }

  const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Calves', 'Abs', 'Other'];
  const COUNTS = [2, 3, 4, 5, 6, 7];
  const NOTE = 'Start light for the first 2 weeks — stop 2–3 reps before failure';

  // Changing the plan starts from the current number of days and weekdays.
  // svelte-ignore state_referenced_locally
  const prior = firstRun ? null : currentPlan();
  let step = $state<Step>('days');
  // svelte-ignore state_referenced_locally
  let count = $state(prior ? Math.min(7, Math.max(2, prior.days.length)) : 3);
  // svelte-ignore state_referenced_locally
  let days = $state<number[]>(prior && prior.days.length === count ? sortDays(prior.days) : defaultDays(count));
  // svelte-ignore state_referenced_locally
  let choice = $state<Choice | null>(count <= 3 ? 'fullbody' : null);
  let drafts = $state<Draft[]>([]);
  // The library is known at once; exercises added by hand follow from storage.
  let custom = $state.raw<Exercise[]>([]);
  const library = $derived([...EXERCISES, ...custom]);
  let pickFor = $state<number | null>(null);
  let creating = $state(false);
  let saving = $state(false);
  let error = $state('');
  let callMe = $state('');

  // The number of days from step 1 steers which card is highlighted; any plan can still be picked.
  const suggestedId = $derived(suggestedPlanFor(count));
  const path = $derived<Step[]>(choice === 'custom' ? ['days', 'plan', 'build', 'review'] : ['days', 'plan', 'review']);
  const at = $derived(Math.max(0, path.indexOf(step)));

  onMount(() => {
    void listExercises().then((l) => (custom = l.filter((e) => !EXERCISES.some((s) => s.id === e.id)))).catch(() => undefined);
  });

  const exName = (id: string) => library.find((e) => e.id === id)?.name ?? workout.exercise(id)?.name ?? id;
  const groups = $derived(MUSCLES.map((m) => ({ muscle: m, list: library.filter((e) => e.muscle === m) })).filter((g) => g.list.length > 0));

  // ---- step 1: days ----
  function setCount(n: number) {
    count = n;
    days = defaultDays(n);
    choice = n <= 3 ? 'fullbody' : null;
  }
  function toggleDay(d: number) {
    if (days.includes(d)) days = days.filter((x) => x !== d);
    else days = [...(days.length >= count ? days.slice(1) : days), d]; // full: the day picked longest ago drops out
  }
  const daysHint = $derived(days.length === count ? daysLabel(days) : `Pick ${count} days (${days.length} picked)`);

  // ---- step 3: build my own ----
  let seq = 0;
  function newDraft(): Draft {
    seq++;
    return { key: `d${seq}`, id: `c-${crypto.randomUUID().slice(0, 8)}`, name: `Session ${drafts.length + 1}`, ids: [] };
  }
  function startBuild() {
    if (drafts.length === 0) drafts = Array.from({ length: Math.min(count, 3) }, () => newDraft()).map((d, i) => ({ ...d, name: `Session ${i + 1}` }));
  }
  function addSession() {
    drafts = [...drafts, newDraft()];
  }
  function removeSession(i: number) {
    drafts = drafts.filter((_, j) => j !== i);
  }
  function move(d: Draft, i: number, by: -1 | 1) {
    const j = i + by;
    if (j < 0 || j >= d.ids.length) return;
    const ids = [...d.ids];
    [ids[i], ids[j]] = [ids[j], ids[i]];
    d.ids = ids;
  }
  function removeExercise(d: Draft, i: number) {
    d.ids = d.ids.filter((_, j) => j !== i);
  }
  function addExercise(id: string) {
    if (pickFor === null) return;
    const d = drafts[pickFor];
    if (!d.ids.includes(id)) d.ids = [...d.ids, id];
  }
  async function newExerciseAdded(ex: Exercise) {
    custom = [...custom.filter((e) => e.id !== ex.id), ex];
    addExercise(ex.id);
    creating = false;
  }
  function closePicker() {
    pickFor = null;
    creating = false;
  }
  /** What a session is called: its name, or the default while the name is blank. */
  const label = (d: Draft, i: number) => d.name.trim() || `Session ${i + 1}`;
  const buildReady = $derived(drafts.length > 0 && drafts.every((d) => d.ids.length > 0));

  // ---- the plan being set up ----
  const built = $derived.by<Plan>(() => {
    const sorted = sortDays(days);
    // Same weekdays as the plan being replaced: keep its weekly target as it is now (never silently dropped).
    const same = !!prior && prior.days.length === sorted.length && sortDays(prior.days).every((d, i) => d === sorted[i]);
    const target = same ? (workout.settings?.weeklyTarget ?? prior.weeklyTarget) : sorted.length;
    if (choice === 'custom') {
      return {
        id: 'custom',
        name: 'My plan',
        sessions: drafts.map((d, i) => ({ id: d.id, name: label(d, i), items: d.ids.map((exerciseId) => ({ exerciseId, sets: 3 })) })),
        days: sorted,
        weeklyTarget: target,
      };
    }
    if (choice === 'vik') return { id: 'vik', name: VIK_PLAN.name, sessions: [], days: sorted, weeklyTarget: target };
    return { ...planFromTemplate(choice as TemplatePlanId, sorted), weeklyTarget: target };
  });
  const schedule = $derived(built.sessions.length || built.id === 'vik' ? weekSchedule(resolvePlan(built)) : []);
  const takesTurns = $derived((resolvePlan(built).sessions.length > 1) && days.length % resolvePlan(built).sessions.length !== 0);

  // ---- navigation ----
  const canNext = $derived(step === 'days' ? days.length === count : step === 'plan' ? choice !== null : step === 'build' ? buildReady : true);
  function next() {
    if (!canNext) return;
    const to = path[at + 1];
    if (to === 'build') startBuild();
    if (to) step = to;
  }
  function back() {
    if (at === 0) oncancel?.();
    else step = path[at - 1];
  }

  async function start() {
    if (saving) return;
    saving = true;
    error = '';
    try {
      const plan = built;
      await workout.updateSettings((cur) => {
        const retired = { ...(cur.retiredSessions ?? {}) };
        if (cur.plan) for (const t of resolvePlan(cur.plan).sessions) retired[t.id] = t.name;
        const userName = firstRun ? cleanGreetName(callMe) : '';
        return {
          ...cur,
          ...(userName ? { userName } : {}), // never saves an empty name
          plan,
          weeklyTarget: plan.weeklyTarget,
          retiredSessions: retired,
        };
      });
      onfinish();
    } catch {
      error = 'Could not save your plan. Try again';
    } finally {
      saving = false;
    }
  }

  const titles: Record<Step, string> = { days: 'How many days a week?', plan: 'Choose your plan', build: 'Build your plan', review: 'Your week' };
</script>

<section class="setup" aria-labelledby="setup-title">
  <header class="top">
    {#if at > 0 || !firstRun}
      <button class="back press" type="button" aria-label="Back" onclick={back}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
    {:else}
      <span class="back-gap"></span>
    {/if}
    <div class="dots" role="img" aria-label="Step {at + 1} of {path.length}">
      {#each path as _, i (i)}<span class:on={i <= at}></span>{/each}
    </div>
  </header>

  <h1 id="setup-title">{titles[step]}</h1>

  <div class="body">
    {#if step === 'days'}
      <p class="lead">Pick the days you want to train. You can change this later.</p>
      <div class="counts" role="radiogroup" aria-label="Days a week">
        {#each COUNTS as n (n)}
          <button type="button" role="radio" class="count press" aria-checked={count === n} onclick={() => setCount(n)}>{n}</button>
        {/each}
      </div>
      <div class="week" role="group" aria-label="Training days">
        {#each WEEK_ORDER as d (d)}
          <button type="button" class="day press" aria-pressed={days.includes(d)} aria-label={DAY_LONG[d]} onclick={() => toggleDay(d)}>{DAY_SHORT[d]}</button>
        {/each}
      </div>
      <p class="hint" class:warn={days.length !== count} aria-live="polite">{daysHint}</p>
      {#if firstRun}
        <label class="field">What should I call you? (optional)
          <input type="text" autocomplete="off" maxlength={GREET_MAX} placeholder="Your name" bind:value={callMe} />
        </label>
      {/if}
    {:else if step === 'plan'}
      <div class="plans" role="radiogroup" aria-label="Plan">
        {#each PLAN_CARDS as c (c.id)}
          {@const hot = c.id === suggestedId}
          <button type="button" role="radio" class="plan press" class:suggested={hot} aria-checked={choice === c.id} onclick={() => (choice = c.id)}>
            {#if hot}<span class="eyebrow">Suggested for you</span>{/if}
            <span class="nm">{c.name}</span>
            <span class="fit">{c.fit}</span>
            <span class="desc">{c.desc}</span>
          </button>
        {/each}
      </div>
    {:else if step === 'build'}
      <p class="lead">Name each session and add the exercises you want. Each starts with 3 sets.</p>
      {#each drafts as d, i (d.key)}
        <article class="draft" aria-label="Session {i + 1}">
          <label class="field">Session name
            <input type="text" autocomplete="off" bind:value={d.name} />
          </label>
          {#if d.ids.length === 0}<p class="hint">No exercises yet</p>{/if}
          <ol class="exs">
            {#each d.ids as id, j (id)}
              <li>
                <span class="nm">{exName(id)}</span>
                <button type="button" class="ic press" aria-label="Move {exName(id)} up" disabled={j === 0} onclick={() => move(d, j, -1)}>↑</button>
                <button type="button" class="ic press" aria-label="Move {exName(id)} down" disabled={j === d.ids.length - 1} onclick={() => move(d, j, 1)}>↓</button>
                <button type="button" class="ic press" aria-label="Remove {exName(id)}" onclick={() => removeExercise(d, j)}>✕</button>
              </li>
            {/each}
          </ol>
          <button type="button" class="link press" aria-label="Add exercise to {label(d, i)}" onclick={() => (pickFor = i)}>+ Add exercise</button>
          {#if drafts.length > 1}
            <button type="button" class="link muted-link press" aria-label="Remove session {label(d, i)}" onclick={() => removeSession(i)}>Remove session</button>
          {/if}
        </article>
      {/each}
      <button type="button" class="secondary press" onclick={addSession}>+ Add another session</button>
      {#if !buildReady}<p class="hint warn">Every session needs at least one exercise</p>{/if}
    {:else}
      <ul class="sched" aria-label="Your week">
        {#each schedule as row (row.day)}
          <li><span class="d">{DAY_LONG[row.day]}</span><span class="s">{row.session.name}</span></li>
        {/each}
      </ul>
      {#if takesTurns}<p class="hint">Sessions take turns, so next week carries on where this one stops.</p>{/if}
      <p class="note">{NOTE}</p>
      {#if error}<p class="hint warn" role="alert">{error}</p>{/if}
    {/if}
  </div>

  <footer class="foot">
    {#if step === 'review'}
      <button class="go btn-primary press" type="button" disabled={saving} onclick={start}>Start</button>
    {:else}
      <button class="go btn-primary press" type="button" disabled={!canNext} onclick={next}>Continue</button>
      {#if step === 'days' && firstRun && onrestore}
        <button class="existing press" type="button" onclick={onrestore}>I already use this app: restore from backup or connect Sheet</button>
      {/if}
    {/if}
  </footer>
</section>

<Sheet open={pickFor !== null} onclose={closePicker} title={creating ? 'Add a new exercise' : 'Add exercise'} sub={pickFor !== null && drafts[pickFor] ? label(drafts[pickFor], pickFor) : ''}>
  {#if pickFor !== null}
    {#if creating}
      <AddExerciseForm onadded={newExerciseAdded} />
      <button type="button" class="link press" onclick={() => (creating = false)}>Back to the list</button>
    {:else}
      {#each groups as g (g.muscle)}
        <details>
          <summary><span>{g.muscle}</span><small>{g.list.length}</small></summary>
          {#each g.list as ex (ex.id)}
            {@const used = drafts[pickFor].ids.includes(ex.id)}
            <button type="button" class="pick press" disabled={used} onclick={() => addExercise(ex.id)}>
              <span class="nm">{ex.name}</span>
              <span class="meta">{used ? 'Added' : `${ex.repMin}–${ex.repMax} reps · ${fmtKg(ex.step)} kg steps`}</span>
            </button>
          {/each}
        </details>
      {/each}
      <button type="button" class="link press" onclick={() => (creating = true)}>Add a new exercise</button>
      <button type="button" class="done btn-primary press" onclick={closePicker}>Done</button>
    {/if}
  {/if}
</Sheet>

<style>
  .setup { max-width: 440px; margin: 0 auto; padding: 0 16px; min-height: 100dvh; display: flex; flex-direction: column; }
  .top { display: flex; align-items: center; gap: 8px; min-height: 64px; padding-top: 6px; }
  .back, .back-gap { width: 48px; height: 48px; margin-left: -12px; flex: none; }
  .back { display: grid; place-items: center; border-radius: 12px; }
  .back svg { width: 22px; height: 22px; }
  .dots { display: flex; gap: 8px; margin-left: auto; margin-right: 4px; }
  .dots span { width: 22px; height: 6px; border-radius: 3px; background: var(--line); transition: background 200ms var(--ease-out); }
  .dots span.on { background: var(--blue); }
  h1 { font: 800 32px/1.05 var(--body); letter-spacing: -0.02em; margin: 14px 0 10px; text-wrap: balance; }
  .body { flex: 1; display: grid; gap: 14px; align-content: start; padding-bottom: 24px; }
  .lead { margin: 0; color: var(--muted); font-size: 14.5px; }
  .hint { margin: 0; font-size: 13px; color: var(--muted); }
  .hint.warn { color: var(--amber); }
  .counts { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
  .count { height: 56px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); font: 800 22px/1 var(--display); }
  .count[aria-checked='true'] { background: var(--blue-deep); border-color: var(--blue); color: var(--blue-ink); }
  .week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .day { height: 48px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); font-size: 13px; font-weight: 600; color: var(--muted); }
  .day[aria-pressed='true'] { background: var(--blue-deep); border-color: var(--blue); color: var(--blue-ink); }
  .plans { display: grid; gap: 12px; }
  .plan { display: grid; gap: 4px; text-align: left; padding: 16px; min-height: 84px; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); }
  .plan.suggested { border-color: var(--blue); background: linear-gradient(180deg, #14233f, var(--surface)); }
  .plan[aria-checked='true'] { box-shadow: 0 0 0 2px var(--blue); }
  .eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--blue); }
  .nm { font-weight: 600; font-size: 17px; }
  .fit { font-size: 13.5px; font-weight: 500; }
  .desc { font-size: 13.5px; color: var(--muted); }
  .draft { background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 16px; display: grid; gap: 10px; }
  .field { display: grid; gap: 6px; font-size: 12.5px; color: var(--muted); }
  input { height: 48px; width: 100%; min-width: 0; border-radius: 12px; border: 1px solid var(--line); background: var(--raised); color: var(--text); padding: 0 12px; font: inherit; font-size: 15px; }
  input:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
  .exs { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .exs li { display: flex; align-items: center; gap: 2px; min-height: 48px; }
  .exs .nm { flex: 1; min-width: 0; font-size: 14.5px; font-weight: 500; }
  .ic { width: 44px; height: 48px; border-radius: 10px; color: var(--muted); font-size: 16px; flex: none; }
  .ic:disabled { opacity: 0.3; }
  .link { display: flex; align-items: center; min-height: 48px; font-size: 14.5px; color: var(--blue); }
  .muted-link { color: var(--muted); font-size: 13px; }
  .secondary { height: 52px; border-radius: 14px; background: var(--raised); border: 1px solid var(--line); font-size: 14.5px; }
  .sched { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .sched li { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 16px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
  .sched .d { color: var(--muted); font-size: 13.5px; min-width: 96px; }
  .sched .s { font-weight: 600; }
  .note { margin: 4px 0 0; padding: 14px 16px; border-radius: 14px; background: var(--raised); font-size: 14px; }
  .foot { position: sticky; bottom: 0; padding: 12px 0 calc(16px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, transparent, var(--ground) 30%); }
  .go { width: 100%; height: 56px; border-radius: 14px; font-size: 16px; }
  .existing { display: block; width: 100%; min-height: 48px; margin-top: 4px; font-size: 13.5px; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
  .go:disabled { opacity: 0.45; }
  details { border-top: 1px solid var(--line); }
  summary { display: flex; align-items: center; min-height: 48px; cursor: pointer; font-weight: 600; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary small { margin-left: auto; color: var(--muted); font-weight: 400; font-size: 13px; }
  .pick { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 4px; text-align: left; border-radius: 10px; }
  .pick:disabled { opacity: 0.5; }
  .pick .nm { font-size: 14.5px; font-weight: 500; flex: 1; }
  .meta { font-size: 12px; color: var(--muted); }
  .done { width: 100%; height: 52px; border-radius: 14px; margin-top: 8px; }
  @media (prefers-reduced-motion: reduce) { .dots span { transition: none; } }
</style>
