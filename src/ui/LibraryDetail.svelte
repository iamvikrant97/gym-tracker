<script lang="ts">
  import FormFigure from './FormFigure.svelte';
  import AngleView, { type Kind } from './AngleView.svelte';
  import MuscleMap from './MuscleMap.svelte';
  import { guideFor, ANIMS, BAD_ANIMS } from '../lib/formGuides';
  import { MUSCLES as MUSCLE_MAP } from '../lib/muscles';
  import { PATTERNS } from '../lib/patterns';
  import { EXERCISES, EQUIPMENT, swapOptions } from '../lib/seed';

  let { exerciseId, onopen }: { exerciseId: string; onopen: (id: string) => void } = $props();

  const LEGACY: Record<string, Kind> = { Chest: 'press-top', Legs: 'squat-front', Back: 'pulldown-back', Shoulders: 'press-front', Biceps: 'curl-front', Triceps: 'pushdown-front' };
  const FROM: Record<string, string> = { 'press-top': 'From above', 'fly-top': 'From above', 'squat-front': 'From front', 'pulldown-back': 'From behind', 'press-front': 'From front', 'curl-front': 'From front', 'pushdown-front': 'From front', 'lateral-front': 'From front', 'abduct-front': 'From front' };

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let view = $state<'side' | 'angle' | 'compare'>('side');
  let mode = $state<'play' | 'start' | 'finish'>(reduced ? 'start' : 'play');

  const ex = $derived(EXERCISES.find((e) => e.id === exerciseId) ?? null);
  const guide = $derived(guideFor(exerciseId));
  const mu = $derived(guide ? MUSCLE_MAP[guide.anim] : null);
  const angleKind = $derived.by(() => {
    if (!guide || !ex) return undefined;
    const pat = PATTERNS[guide.anim];
    return (pat ? pat.angle : LEGACY[ex.muscle]) as Kind | undefined;
  });
  const alternatives = $derived(ex ? swapOptions(ex.id).filter((e) => e.id !== ex.id) : []);
  // Another exercise from the alternatives: start from the side view again.
  $effect(() => { void exerciseId; view = 'side'; });
  $effect(() => { if (view === 'angle' && !angleKind) view = 'side'; });
</script>

{#if ex}
<div class="detail">
  {#if guide && mu}
    <div class="seg" role="group" aria-label="View">
      <button type="button" aria-pressed={view === 'side'} onclick={() => (view = 'side')}>Side</button>
      {#if angleKind}<button type="button" aria-pressed={view === 'angle'} onclick={() => (view = 'angle')}>{FROM[angleKind]}</button>{/if}
      <button type="button" aria-pressed={view === 'compare'} onclick={() => (view = 'compare')}>Avoid vs ideal</button>
    </div>
    {#key exerciseId + view}
      <div class="stage">
        {#if view === 'side'}
          <FormFigure anim={guide.anim} muscles={mu} callouts={guide.callouts} {mode} look="dark" />
        {:else if view === 'angle' && angleKind}
          <div class="pair">
            <figure class="bad"><figcaption>✗ Avoid</figcaption><AngleView kind={angleKind} bad {mode} /></figure>
            <figure class="good"><figcaption>✓ Ideal</figcaption><AngleView kind={angleKind} {mode} /></figure>
          </div>
        {:else}
          <div class="pair">
            <figure class="bad"><figcaption>✗ Avoid</figcaption><FormFigure anim={guide.anim} defOverride={BAD_ANIMS[guide.anim]} muscles={mu} look="dark" {mode} /><p>{guide.donts[0]}</p></figure>
            <figure class="good"><figcaption>✓ Ideal</figcaption><FormFigure anim={guide.anim} defOverride={ANIMS[guide.anim]} muscles={mu} look="dark" {mode} /><p>{guide.dos[0]}</p></figure>
          </div>
        {/if}
      </div>
    {/key}
    <div class="ctrl" role="group" aria-label="Animation">
      <button type="button" class="chip press" aria-pressed={mode === 'play'} onclick={() => (mode = 'play')}>▶ Play</button>
      <button type="button" class="chip press" aria-pressed={mode === 'start'} onclick={() => (mode = 'start')}>Start</button>
      <button type="button" class="chip press" aria-pressed={mode === 'finish'} onclick={() => (mode = 'finish')}>Finish</button>
    </div>

    <div class="muscles">
      {#each guide.main as m}<span class="m main">{m}</span>{/each}
      {#each guide.also as m}<span class="m also">{m}</span>{/each}
    </div>

    <details open>
      <summary>How it goes</summary>
      <ol class="steps">{#each guide.phases as ph}<li>{ph}</li>{/each}</ol>
    </details>
    <details>
      <summary>Do and avoid</summary>
      <ul class="dl do">{#each guide.dos as d}<li>{d}</li>{/each}</ul>
      <ul class="dl dont">{#each guide.donts as d}<li>{d}</li>{/each}</ul>
    </details>
    <details>
      <summary>Muscle map</summary>
      <MuscleMap main={mu.main} also={mu.also} />
    </details>
  {:else}
    <div class="nog">
      <p>The animated guide for this exercise is not ready yet.</p>
      <div class="muscles"><span class="m main">{ex.muscle}</span></div>
      <p class="sub">Aim for {ex.repMin} to {ex.repMax} reps. Rest about {Math.round(ex.restSec / 60 * 10) / 10} minutes between sets.</p>
    </div>
  {/if}

  {#if alternatives.length}
    <h3>Alternatives</h3>
    <p class="sub">Same job, different equipment or angle.</p>
    <div class="alts">
      {#each alternatives as a}
        <button type="button" class="alt press" onclick={() => onopen(a.id)}><span>{a.name}</span><em>{EQUIPMENT[a.id] ?? ''}</em></button>
      {/each}
    </div>
  {/if}
  <p class="note">These guides are a general reference. The drawings are simplified, so they may not match your body or your machine exactly. Not medical advice. Stop if anything hurts, and ask a coach if you are unsure.</p>
</div>
{/if}

<style>
  .detail { padding-bottom: 12px; }
  .sub { font-size: 12px; color: var(--muted); }
  .note { margin: 14px 0 0; font-size: 12px; line-height: 1.4; color: var(--muted); }
  .press { transition: transform 160ms var(--ease-out); } .press:active { transform: scale(0.97); }
  .chip { flex: none; min-height: 40px; padding: 0 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); color: var(--muted); font-weight: 600; font-size: 13.5px; white-space: nowrap; }
  .chip[aria-pressed='true'] { background: var(--blue-deep); border-color: var(--blue); color: var(--blue-ink); }
  button { font-family: inherit; cursor: pointer; color: inherit; background: none; border: 0; padding: 0; }
  .seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 3px; margin: 4px 0 10px; }
  .seg button { min-height: 40px; border-radius: 9px; color: var(--muted); font-size: 13px; font-weight: 600; transition: background 200ms var(--ease-out), color 200ms; }
  .seg button[aria-pressed='true'] { background: var(--blue-deep); color: var(--blue-ink); box-shadow: inset 0 0 0 1px var(--blue); }
  .stage { animation: fadeIn 260ms var(--ease-out); border-radius: 16px; overflow: hidden; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  figure { margin: 0; border-radius: 14px; overflow: hidden; background: #0e1116; border: 1.5px solid #3a2326; }
  figure.good { border-color: #1f4a33; }
  figcaption { padding: 6px 10px; font: 700 13px var(--display); color: #ff6b61; } figure.good figcaption { color: #4cd98a; }
  figure p { margin: 0; padding: 6px 10px 10px; font-size: 12px; line-height: 1.3; color: #cfd4de; }
  .ctrl { display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
  .muscles { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
  .m { font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 8px; } .m.main { background: rgba(255, 59, 48, .16); color: #ff8a80; } .m.also { background: rgba(255, 157, 110, .13); color: #ffb48a; }
  details { border-top: 1px solid var(--line); } details:last-of-type { border-bottom: 1px solid var(--line); }
  summary { list-style: none; display: flex; justify-content: space-between; align-items: center; min-height: 50px; font-weight: 700; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: ''; width: 8px; height: 8px; border-right: 2px solid #6b7384; border-bottom: 2px solid #6b7384; transform: rotate(45deg); transition: transform 200ms var(--ease-out); margin-right: 4px; }
  details[open] summary::after { transform: rotate(-135deg); }
  .steps { margin: 0 0 12px; padding-left: 20px; color: #cfd4de; font-size: 14px; line-height: 1.5; }
  .dl { margin: 0 0 8px; padding: 0; list-style: none; font-size: 14px; color: #cfd4de; }
  .dl li { padding: 7px 0 7px 22px; position: relative; line-height: 1.4; }
  .dl li::before { position: absolute; left: 0; font-weight: 800; } .dl.do li::before { content: '✓'; color: #4cd98a; } .dl.dont li::before { content: '✗'; color: #ff6b61; }
  h3 { margin: 18px 0 2px; font: 800 17px var(--display); }
  .alts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .alt { display: flex; flex-direction: column; align-items: flex-start; min-height: 48px; padding: 8px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); font-size: 13.5px; font-weight: 600; }
  .alt em { font-style: normal; font-size: 11px; color: var(--muted); font-weight: 500; }
  .nog { padding: 12px 0; color: #cfd4de; }
  @keyframes fadeIn { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .stage { animation: none; } }
</style>
