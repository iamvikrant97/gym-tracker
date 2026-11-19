<script lang="ts">
  import FormFigure from './ui/FormFigure.svelte';
  import AngleView, { type Kind } from './ui/AngleView.svelte';
  import MuscleMap from './ui/MuscleMap.svelte';
  import { guideFor, ANIMS, BAD_ANIMS } from './lib/formGuides';
  import { MUSCLES, LABELS } from './lib/muscles';
  import { PATTERNS } from './lib/patterns';
  import { EXERCISES } from './lib/seed';

  // Every exercise that has a form guide, grouped by muscle.
  const withGuide = EXERCISES.filter((e) => guideFor(e.id));
  const groups = [...new Set(withGuide.map((e) => e.muscle as string))];
  const LEGACY: Record<string, Kind> = { Chest: 'press-top', Legs: 'squat-front', Back: 'pulldown-back', Shoulders: 'press-front', Biceps: 'curl-front', Triceps: 'pushdown-front' };
  const FROM: Record<string, string> = { 'press-top': 'From above', 'fly-top': 'From above', 'squat-front': 'From front', 'pulldown-back': 'From behind', 'press-front': 'From front', 'curl-front': 'From front', 'pushdown-front': 'From front', 'lateral-front': 'From front', 'abduct-front': 'From front' };

  let group = $state(groups[0]);
  let exId = $state(withGuide.find((e) => e.muscle === groups[0])!.id);
  let mode = $state<'play' | 'start' | 'finish'>('play');
  let look = $state<'soft' | 'dark'>('dark');
  let view = $state<'side' | 'zoom' | 'angle'>('side');
  const list = $derived(withGuide.filter((e) => e.muscle === group));
  const ex = $derived(withGuide.find((e) => e.id === exId) ?? list[0]);
  const g = $derived(guideFor(ex.id)!);
  const mu = $derived(MUSCLES[g.anim]);
  const angleKind = $derived((PATTERNS[g.anim]?.angle ?? (PATTERNS[g.anim] ? undefined : LEGACY[group])) as Kind | undefined);
  $effect(() => { if (view === 'angle' && !angleKind) view = 'side'; });
  const pick = (m: string) => { group = m; exId = withGuide.find((e) => e.muscle === m)!.id; };
</script>

<main>
  <header>
    <p class="eyebrow">Preview · not in your app</p>
    <h1>Form guides</h1>
    <p class="lede">Pick a muscle, then an exercise. Side view, a second camera angle where it helps, and avoid vs ideal.</p>
  </header>
  <nav class="tabs" aria-label="Muscle groups">
    {#each groups as m}
      <button type="button" class="tab" aria-pressed={group === m} onclick={() => pick(m)}>{m}</button>
    {/each}
  </nav>
  <nav class="tabs sub" aria-label="Exercises">
    {#each list as e}
      <button type="button" class="chip" aria-pressed={exId === e.id} onclick={() => (exId = e.id)}>{e.name}</button>
    {/each}
  </nav>
  <div class="ctrl" role="group" aria-label="View">
    <button type="button" class="chip" aria-pressed={view === 'side'} onclick={() => (view = 'side')}>Side view</button>
    {#if angleKind}<button type="button" class="chip" aria-pressed={view === 'angle'} onclick={() => (view = 'angle')}>{FROM[angleKind]}</button>{/if}
    <button type="button" class="chip" aria-pressed={view === 'zoom'} onclick={() => (view = 'zoom')}>Avoid vs ideal</button>
  </div>
  <div class="ctrl" role="group" aria-label="Animation">
    <button type="button" class="chip" aria-pressed={mode === 'play'} onclick={() => (mode = 'play')}>▶ Play</button>
    <button type="button" class="chip" aria-pressed={mode === 'start'} onclick={() => (mode = 'start')}>Start</button>
    <button type="button" class="chip" aria-pressed={mode === 'finish'} onclick={() => (mode = 'finish')}>Finish</button>
  </div>
  <section class="card">
    {#key exId + view}
      {#if view === 'side'}
        <FormFigure anim={g.anim} {look} muscles={mu} {mode} />
      {:else if view === 'angle' && angleKind}
        <div class="zoom">
          <figure class="bad"><figcaption>✗ Avoid</figcaption><AngleView kind={angleKind} bad {mode} /></figure>
          <figure class="good"><figcaption>✓ Ideal</figcaption><AngleView kind={angleKind} {mode} /></figure>
        </div>
      {:else}
        <div class="zoom">
          <figure class="bad"><figcaption>✗ Avoid</figcaption><FormFigure anim={g.anim} defOverride={BAD_ANIMS[g.anim]} {look} muscles={mu} {mode} /><p>{g.donts[0]}</p></figure>
          <figure class="good"><figcaption>✓ Ideal</figcaption><FormFigure anim={g.anim} defOverride={ANIMS[g.anim]} {look} muscles={mu} {mode} /><p>{g.dos[0]}</p></figure>
        </div>
      {/if}
    {/key}
    <p class="legend"><span class="key red"></span>Working: {mu.main.map((m) => LABELS[m]).join(', ')}</p>
    {#if mu.also.length}<p class="legend"><span class="key orange"></span>Helping: {mu.also.map((m) => LABELS[m]).join(', ')}</p>{/if}
  </section>
  <section class="card">
    <h2>How it goes</h2>
    <ol class="steps">{#each g.phases as ph}<li>{ph}</li>{/each}</ol>
  </section>
  <section class="card">
    <h2>Muscle map</h2>
    <MuscleMap main={mu.main} also={mu.also} />
  </section>
</main>

<style>
  :global(body) { margin: 0; background: #0b0d11; color: #e8eaee; font-family: var(--body, system-ui); }
  main { max-width: 460px; margin: 0 auto; padding: 18px 14px 48px; }
  .eyebrow { margin: 0; font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #f2b544; font-weight: 700; }
  h1 { margin: 4px 0 6px; font: 800 24px/1.15 var(--display, system-ui); }
  .lede { margin: 0 0 14px; color: #8c94a3; font-size: 14px; line-height: 1.4; }
  .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .tab, .chip { min-height: 44px; padding: 0 14px; border-radius: 12px; background: #1a1e26; border: 1px solid #242934; color: #8c94a3; font: 600 13.5px var(--body, system-ui); }
  .tab[aria-pressed='true'], .chip[aria-pressed='true'] { background: #16305c; border-color: #4c8dff; color: #dce7ff; }
  .tabs.sub { margin-top: -2px; }
  .ctrl { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .steps { margin: 6px 0 0; padding-left: 20px; color: #cfd4de; font-size: 14px; line-height: 1.45; }
  .card { background: #13161c; border: 1px solid #242934; border-radius: 18px; padding: 12px; margin-bottom: 14px; }
  .zoom { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  figure { margin: 0; border-radius: 14px; overflow: hidden; background: #0e1116; border: 1.5px solid #3a2326; }
  figure.good { border-color: #1f4a33; }
  figcaption { padding: 6px 10px; font: 700 13px var(--display, system-ui); color: #ff6b61; }
  figure.good figcaption { color: #4cd98a; }
  figure p { margin: 0 !important; padding: 6px 10px 10px; font-size: 12.5px !important; line-height: 1.3; color: #cfd4de !important; }
  h2 { margin: 0 0 2px; font: 700 17px var(--display, system-ui); }
  .card p { margin: 0 0 10px; color: #8c94a3; font-size: 13.5px; }
  .legend { display: flex; align-items: center; gap: 8px; margin: 8px 0 0 !important; color: #dfe3ec !important; font-size: 14px !important; }
  .key { width: 12px; height: 12px; border-radius: 4px; flex: none; }
  .key.red { background: #ff3b30; } .key.orange { background: #ff9d6e; }
</style>
