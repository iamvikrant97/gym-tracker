<script lang="ts">
  import { onMount } from 'svelte';
  import { workout, UNDO_MS } from '../lib/workout.svelte';
  import { exerciseById, rangeFor, sessionName, templateFor } from '../lib/seed';
  import { addWeightDue, isPR } from '../lib/progression';
  import { buildCards, finishAt, fmtClock, fmtElapsed, fmtKg, fmtTime, meter, nextUp, remaining, round2 } from '../lib/workoutView';
  import { buzz } from '../lib/device';
  import { showToast } from '../ui/toast.svelte';
  import SetRow, { type Field } from '../ui/SetRow.svelte';
  import AdjustSheet from '../ui/AdjustSheet.svelte';
  import SwapSheet from '../ui/SwapSheet.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import type { Exercise, Muscle, SetLog } from '../lib/types';

  const LEGS: Muscle[] = ['Quads', 'Hamstrings', 'Calves'];
  const PER_ARM_KEY = 'gym.perArmConfirmed';
  const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let now = $state(Date.now());
  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  type Draft = { kg: number; reps: number; touched: boolean; warmup: boolean };
  let drafts = $state<Record<string, Draft>>({});

  const w = $derived(workout.current);
  const template = $derived(w ? templateFor(w.sessionId) : undefined);
  const planned = $derived(w ? workout.plannedSets() : []);
  const cards = $derived(buildCards(planned, workout.sets));
  const progress = $derived(meter(cards));
  const next = $derived(nextUp(cards));

  function prFor(ex: Exercise, s: SetLog): boolean {
    const prior = [
      ...workout.history.filter((h) => h.exerciseId === ex.id && !h.warmup && !h.deleted),
      ...workout.sets.filter((o) => o.exerciseId === ex.id && !o.warmup && o.id !== s.id && o.doneAt < s.doneAt),
    ];
    return isPR(ex, s, prior);
  }

  const views = $derived(
    cards.map((c, i) => {
      const ex = workout.exercise(c.exerciseId);
      const range = w && exerciseById(c.exerciseId) ? rangeFor(w.sessionId, c.exerciseId) : { repMin: ex?.repMin ?? 0, repMax: ex?.repMax ?? 0 };
      const step = workout.settings?.stepOverrides[c.exerciseId] ?? ex?.step ?? 2.5;
      const restSec = workout.restSecFor(c.exerciseId);
      let prev: { kg: number; reps: number } | null = null;
      const rows = c.rows.map((r) => {
        const d = drafts[r.key];
        let kg: number | null;
        let reps: number | null;
        let ghost = true;
        if (r.done) {
          kg = r.done.kg;
          reps = r.done.reps;
          ghost = false;
        } else if (d?.touched) {
          kg = d.kg;
          reps = d.reps;
          ghost = false;
        } else {
          const base = r.target ?? prev;
          kg = base?.kg ?? null;
          reps = base?.reps ?? null;
        }
        if (!r.warmup && !(d?.warmup && !r.done) && kg !== null && reps !== null) prev = { kg, reps };
        return {
          ...r,
          kg,
          reps,
          ghost,
          pendingWarmup: !r.done && !!d?.warmup,
          pr: !!(r.done && !r.warmup && ex && prFor(ex, r.done)),
        };
      });
      const addWeight = !!(w && ex && !c.orphan && addWeightDue(ex, workout.history, w.date, range));
      return { ...c, code: c.orphan ? '–' : String(i + 1), ex, range, step, restSec, rows, addWeight };
    }),
  );
  type CardView = (typeof views)[number];
  type RowView = CardView['rows'][number];

  const usedIds = $derived(cards.filter((c) => !c.orphan).map((c) => c.exerciseId));

  // ---- header ----
  const elapsed = $derived(w ? fmtElapsed((w.endedAt ?? now) - w.startedAt) : '00:00');
  const finishLabel = $derived.by(() => {
    const left = remaining(cards).map((r) => workout.restSecFor(r.exerciseId));
    const restLeft = workout.restEndsAt ? workout.restEndsAt - now : 0;
    return fmtTime(finishAt(now, restLeft, left));
  });

  // ---- completing ----
  /** Confirmed once, saved in IndexedDB settings (the localStorage flag of older builds still counts). */
  function perArmOk(): boolean {
    if (workout.settings?.perArmConfirmed) return true;
    try {
      return localStorage.getItem(PER_ARM_KEY) === '1';
    } catch {
      return false;
    }
  }
  let perArmAsk = $state<{ cardKey: string; rowKey: string; kg: number; reps: number } | null>(null);
  let perArmOpen = $state(false);

  function find(cardKey: string, rowKey: string): { c: CardView; r: RowView } | null {
    const c = views.find((v) => v.key === cardKey);
    const r = c?.rows.find((x) => x.key === rowKey);
    return c && r ? { c, r } : null;
  }

  async function complete(c: CardView, r: RowView, vals?: { kg: number; reps: number }) {
    const kg = vals?.kg ?? r.kg;
    const reps = vals?.reps ?? r.reps;
    if (kg === null || reps === null) return openAdjust(c, r);
    if (c.ex?.perArm && !perArmOk()) {
      perArmAsk = { cardKey: c.key, rowKey: r.key, kg, reps };
      perArmOpen = true;
      return;
    }
    const warm = r.pendingWarmup;
    buzz(12);
    try {
      const { set, pr } = await workout.completeSet(c.exerciseId, r.setNo, kg, reps);
      delete drafts[r.key];
      if (warm) await workout.editSet(set.id, { warmup: true });
      else if (pr) showToast(`New PR · ${c.ex?.name ?? 'exercise'}`);
    } catch (e) {
      console.error(e);
      showToast('Could not save the set. Try again');
    }
  }

  async function confirmPerArm() {
    try {
      await workout.updateSettings({ perArmConfirmed: true });
    } catch {
      /* storage error: ask again next time */
    }
    perArmOpen = false;
    const ask = perArmAsk;
    perArmAsk = null;
    const hit = ask && find(ask.cardKey, ask.rowKey);
    if (ask && hit) {
      // Remembered now, so complete() goes straight through.
      complete(hit.c, hit.r, { kg: ask.kg, reps: ask.reps });
    }
  }

  // ---- undo ----
  let undo = $state<{ text: string; run: (now?: number) => Promise<void> } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  async function remove(set: SetLog) {
    try {
      const run = await workout.deleteSet(set.id);
      buzz(8);
      clearTimeout(undoTimer);
      undo = { text: set.warmup ? 'Warm-up deleted' : `Set ${set.setNo} deleted`, run };
      undoTimer = setTimeout(() => (undo = null), UNDO_MS);
    } catch (e) {
      console.error(e);
    }
  }
  async function doUndo() {
    const u = undo;
    undo = null;
    clearTimeout(undoTimer);
    await u?.run();
  }

  // ---- adjust sheet ----
  let adj = $state<{ cardKey: string; rowKey: string; doneId: string | null; title: string; sub: string; step: number; last: { kg: number; reps: number } | null; perArm: boolean } | null>(null);
  let adjOpen = $state(false);
  let adjKg = $state(0);
  let adjReps = $state(0);

  function openAdjust(c: CardView, r: RowView) {
    const name = c.ex?.name ?? 'Exercise';
    const which = r.warmup || r.pendingWarmup ? 'warm-up' : `set ${r.setNo}`;
    const parts = [r.last ? `Last ${fmtKg(r.last.kg)} × ${r.last.reps}` : 'No history yet'];
    if (r.target) parts.push(`target ${fmtKg(r.target.kg)} × ${r.target.reps}`);
    adj = {
      cardKey: c.key,
      rowKey: r.key,
      doneId: r.done?.id ?? null,
      title: `${name} · ${which}`,
      sub: parts.join(' · '),
      step: c.step,
      last: r.last ? { kg: r.last.kg, reps: r.last.reps } : null,
      perArm: !!c.ex?.perArm,
    };
    adjKg = r.kg ?? r.last?.kg ?? 0;
    adjReps = r.reps ?? c.range.repMin ?? 8;
    adjOpen = true;
  }

  async function deleteFromSheet() {
    const id = adj?.doneId;
    adjOpen = false;
    const set = id ? workout.sets.find((s) => s.id === id) : undefined;
    if (set) await remove(set);
  }

  async function saveAdjust(kg: number, reps: number) {
    const a = adj;
    adjOpen = false;
    if (!a) return;
    if (a.doneId) {
      await workout.editSet(a.doneId, { kg, reps }).catch((e) => console.error(e));
      return;
    }
    const hit = find(a.cardKey, a.rowKey);
    if (!hit) return;
    drafts[a.rowKey] = { kg, reps, touched: true, warmup: hit.r.pendingWarmup };
    await complete(hit.c, hit.r, { kg, reps });
  }

  // ---- row gestures ----
  function bump(c: CardView, r: RowView, f: Field, delta: number) {
    const kg = r.kg ?? r.last?.kg ?? 0;
    const reps = r.reps ?? c.range.repMin;
    drafts[r.key] = {
      kg: f === 'kg' ? Math.max(0, round2(kg + delta * c.step)) : kg,
      reps: f === 'reps' ? Math.max(1, reps + delta) : reps,
      touched: true,
      warmup: drafts[r.key]?.warmup ?? false,
    };
  }

  function toggleWarmup(r: RowView) {
    if (r.done) {
      workout.editSet(r.done.id, { warmup: !r.done.warmup }).catch((e) => console.error(e));
      return;
    }
    const d = drafts[r.key];
    drafts[r.key] = d ? { ...d, warmup: !d.warmup } : { kg: r.kg ?? 0, reps: r.reps ?? 0, touched: false, warmup: true };
  }

  // ---- swap ----
  let swapFor = $state<string | null>(null);
  let swapOpen = $state(false);
  let swapping = $state<string | null>(null);

  function openSwap(c: CardView) {
    swapFor = c.exerciseId;
    swapOpen = true;
  }
  function pick(id: string) {
    const from = swapFor;
    setTimeout(() => (swapOpen = false), 140);
    if (!from || id === from) return;
    const card = views.find((v) => v.exerciseId === from && !v.orphan);
    swapping = card?.key ?? null;
    setTimeout(
      async () => {
        try {
          await workout.swap(from, id, false);
        } catch (e) {
          console.error(e);
        }
        swapFor = id;
        swapping = null;
      },
      reduceMotion() ? 0 : 180,
    );
  }

  async function finish() {
    try {
      if (workout.active) await workout.finish();
      location.hash = '#/summary';
    } catch {
      showToast('Could not finish. Try again');
    }
  }

  async function discard() {
    try {
      await workout.discard();
      location.hash = '#/';
      showToast('Workout discarded');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not discard');
    }
  }

  const nextName = (c: CardView, r: RowView) => !!next && next.exerciseId === c.exerciseId && next.setNo === r.setNo && !r.warmup;
</script>

{#if !w}
  <section class="screen">
    <h1 class="page-title">No workout running</h1>
    <p class="muted">Start today's session from the Today tab.</p>
    <button class="finish ready press" type="button" onclick={() => (location.hash = '#/')}>Go to Today</button>
  </section>
{:else}
  <section class="screen">
    <header class="top">
      <div class="row">
        <button class="back" type="button" aria-label="Back to Today" onclick={() => (location.hash = '#/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1>{template?.name ?? (w ? sessionName(w.sessionId) : undefined) ?? 'Workout'}</h1>
        <div class="clock" aria-label="Workout time {elapsed}">
          <b data-testid="elapsed">{elapsed}</b>
          <span>{workout.active ? `Finish ≈ ${finishLabel}` : 'Ended'}</span>
        </div>
      </div>
      <div class="meter" aria-hidden="true">
        {#each Array.from({ length: progress.total }) as _, i (i)}<span class="seg" class:on={i < progress.done}></span>{/each}
      </div>
      <div class="meter-label" data-testid="meter-label">
        <span><strong>{progress.done}</strong> of {progress.total} sets</span>
        <span>{progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%</span>
      </div>
    </header>

    {#if !workout.active}
      <p class="ended">{workout.current?.autoEnded ? 'This workout closed after an hour without a set.' : 'This workout is finished.'}{workout.canResume() ? ' Logging a set carries on with it.' : ''}</p>
    {/if}

    <main class="list">
      {#each views as c (c.key)}
        <article class="card" aria-label={c.ex?.name ?? c.exerciseId}>
          <div class="card-head">
            <span class="code">{c.code}</span>
            <div class="head-text">
              <div class="ex-name" class:swapping={swapping === c.key}>{c.ex?.name ?? c.exerciseId}</div>
              <div class="ex-sub">{c.range.repMin}–{c.range.repMax} reps · rest {fmtClock(c.restSec)} · steps of {fmtKg(c.step)} kg</div>
              {#if c.addWeight}<div class="ex-note add">Add weight today: you hit the top of the range</div>{/if}
              {#if c.ex?.note}<div class="ex-note">{c.ex.note}</div>{/if}
              {#if c.orphan}<div class="ex-note">Logged before you swapped it out</div>{/if}
            </div>
            {#if !c.orphan && workout.active}
              <button class="swap press" type="button" aria-label="Swap {c.ex?.name ?? 'exercise'}" onclick={() => openSwap(c)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>Swap
              </button>
            {/if}
          </div>
          <div class="sets">
            <div class="shead" aria-hidden="true"><span>Set</span><span>Last</span><span>{c.ex?.perArm ? 'kg/arm' : 'kg'}</span><span>Reps</span><span></span></div>
            {#each c.rows as r (r.key)}
              <SetRow
                setNo={r.setNo}
                done={r.done}
                warmup={r.warmup}
                pendingWarmup={r.pendingWarmup}
                kg={r.kg}
                reps={r.reps}
                ghost={r.ghost}
                last={r.last}
                pr={r.pr}
                next={nextName(c, r)}
                perArm={!!c.ex?.perArm}
                leg={!!c.ex && LEGS.includes(c.ex.muscle)}
                oncheck={() => complete(c, r)}
                onadjust={() => openAdjust(c, r)}
                onbump={(f, d) => bump(c, r, f, d)}
                ontogglewarmup={() => toggleWarmup(r)}
                onfelt={() => r.done && workout.editSet(r.done.id, { feltIt: !r.done.feltIt }).catch((e) => console.error(e))}
                ondelete={() => r.done && remove(r.done)}
              />
            {/each}
          </div>
        </article>
      {/each}
    </main>

    {#if workout.active}
      <button class="finish press" class:ready={progress.total > 0 && progress.done >= progress.total} type="button" onclick={finish}>Finish workout</button>
      {#if workout.sets.length === 0}
        <button class="discard" type="button" onclick={discard}>Discard workout (no sets yet)</button>
      {/if}
    {:else}
      {#if workout.canResume()}
        <button class="finish ready press" type="button" onclick={() => workout.resume().catch(() => showToast('Could not continue'))}>Continue workout</button>
        <button class="discard" type="button" onclick={finish}>See summary</button>
      {:else}
        <button class="finish ready press" type="button" onclick={finish}>See summary</button>
      {/if}
    {/if}
  </section>
{/if}

{#if undo}
  <div class="undo" role="status">
    <span>{undo.text}</span>
    <button type="button" class="press" onclick={doUndo}>Undo</button>
  </div>
{/if}

<AdjustSheet
  open={adjOpen}
  title={adj?.title ?? 'Set'}
  sub={adj?.sub ?? ''}
  bind:kg={adjKg}
  bind:reps={adjReps}
  step={adj?.step ?? 2.5}
  last={adj?.last ?? null}
  perArm={adj?.perArm ?? false}
  onsave={saveAdjust}
  onclose={() => (adjOpen = false)}
  ondelete={adj?.doneId ? deleteFromSheet : undefined}
/>

<SwapSheet
  open={swapOpen}
  exerciseId={swapFor ?? ''}
  taken={usedIds}
  hasDoneSets={!!swapFor && workout.sets.some((s) => s.exerciseId === swapFor)}
  onpick={pick}
  onclose={() => (swapOpen = false)}
/>

<Sheet open={perArmOpen} onclose={() => ((perArmOpen = false), (perArmAsk = null))} title="Weight per arm" sub="For single-arm exercises, log the weight on one side, not both sides added together.">
  <button class="finish ready press" type="button" onclick={confirmPerArm}>Got it, log set</button>
</Sheet>

<style>
  .top {
    position: sticky; top: 0; z-index: 5; margin: 0 -16px; padding: 12px 16px;
    background: rgba(11, 13, 17, 0.8); backdrop-filter: blur(18px) saturate(160%); -webkit-backdrop-filter: blur(18px) saturate(160%);
  }
  .row { display: flex; align-items: center; gap: 12px; }
  .back { width: 48px; height: 48px; margin-left: -12px; display: grid; place-items: center; border-radius: 12px; flex: none; }
  .back svg { width: 22px; height: 22px; }
  h1 { font: 800 22px/1.1 var(--body); letter-spacing: -0.01em; margin: 0; min-width: 0; }
  .clock { margin-left: auto; text-align: right; font-variant-numeric: tabular-nums; flex: none; }
  .clock b { display: block; font: 600 20px/1 var(--display); }
  .clock span { font-size: 11px; color: var(--muted); white-space: nowrap; }
  .meter { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; margin-top: 12px; height: 6px; }
  .seg { border-radius: 2px; background: var(--line); position: relative; overflow: hidden; }
  .seg::after {
    content: ''; position: absolute; inset: 0; background: var(--blue); transform: scaleX(0); transform-origin: left;
    transition: transform 320ms var(--ease-out);
  }
  .seg.on::after { transform: scaleX(1); }
  .meter-label { display: flex; justify-content: space-between; margin-top: 7px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .meter-label strong { color: var(--text); }
  .ended { margin: 12px 2px 0; font-size: 13px; color: var(--muted); }
  .list { display: grid; gap: 12px; margin-top: 12px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 14px 8px; overflow: hidden; }
  .card-head { display: flex; align-items: flex-start; gap: 10px; }
  .head-text { min-width: 0; }
  .code { font: 600 13px/1 var(--display); color: var(--muted); padding-top: 4px; min-width: 20px; }
  .ex-name { font: 600 17px/1.25 var(--body); transition: filter 180ms var(--ease-out), opacity 180ms var(--ease-out); }
  .ex-name.swapping { filter: blur(2px); opacity: 0; }
  .ex-sub { font-size: 12.5px; color: var(--muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
  .ex-note { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
  .ex-note.add { color: var(--blue); }
  .swap {
    margin-left: auto; flex: none; height: 48px; margin-top: -6px; margin-right: -6px; padding: 0 12px; border-radius: 10px;
    background: var(--raised); font-size: 12.5px; color: var(--muted); display: flex; gap: 6px; align-items: center;
  }
  .swap svg { width: 14px; height: 14px; }
  .sets { margin-top: 10px; font-variant-numeric: tabular-nums; }
  .shead {
    display: grid; grid-template-columns: 28px 1fr 66px 54px 48px; column-gap: 8px; padding-bottom: 6px;
    font: 500 11px/1 var(--body); color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em;
  }
  .shead span:nth-child(3), .shead span:nth-child(4) { text-align: center; }
  .finish {
    display: block; width: 100%; height: 56px; margin-top: 24px; border-radius: 14px; background: var(--raised);
    font-weight: 600; color: var(--muted); transition: background 300ms var(--ease-out), color 300ms var(--ease-out);
  }
  .finish.ready { background: var(--blue); color: var(--on-blue); }
  .discard { display: block; margin: 12px auto 0; min-height: 48px; padding: 0 16px; font-size: 13px; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
  .undo {
    position: fixed; left: 50%; top: 14px; z-index: 31; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
    width: min(408px, calc(100% - 32px)); padding: 4px 4px 4px 16px; border-radius: 14px; background: var(--raised);
    border: 1px solid rgba(255, 255, 255, 0.08); font-size: 14px; animation: drop 380ms var(--ease-drawer);
  }
  .undo button { margin-left: auto; height: 48px; padding: 0 18px; border-radius: 11px; background: var(--blue); color: var(--on-blue); font-weight: 600; }
  @keyframes drop { from { transform: translate(-50%, -140%); } }
  @media (prefers-reduced-motion: reduce) {
    .seg::after { transform: none; opacity: 0; transition: opacity 200ms ease; }
    .seg.on::after { opacity: 1; }
    .ex-name { transition: opacity 180ms ease; }
    .ex-name.swapping { filter: none; }
    .undo { animation: fade 200ms ease; }
    @keyframes fade { from { opacity: 0; } }
  }
</style>
