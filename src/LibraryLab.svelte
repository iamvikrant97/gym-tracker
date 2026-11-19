<script lang="ts">
  import FormFigure from './ui/FormFigure.svelte';
  import AngleView, { type Kind } from './ui/AngleView.svelte';
  import MuscleMap from './ui/MuscleMap.svelte';
  import { guideFor, ANIMS, BAD_ANIMS } from './lib/formGuides';
  import { MUSCLES as MUSCLE_MAP } from './lib/muscles';
  import { PATTERNS } from './lib/patterns';
  import { EXERCISES, EQUIPMENT, swapOptions, type Equip } from './lib/seed';
  import type { Exercise, Muscle } from './lib/types';

  const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];
  const EQUIP: Equip[] = ['Machine', 'Cable', 'Smith', 'Barbell', 'Dumbbells', 'Bodyweight'];
  const LEGACY: Record<string, Kind> = { Chest: 'press-top', Legs: 'squat-front', Back: 'pulldown-back', Shoulders: 'press-front', Biceps: 'curl-front', Triceps: 'pushdown-front' };
  const FROM: Record<string, string> = { 'press-top': 'From above', 'fly-top': 'From above', 'squat-front': 'From front', 'pulldown-back': 'From behind', 'press-front': 'From front', 'curl-front': 'From front', 'pushdown-front': 'From front', 'lateral-front': 'From front', 'abduct-front': 'From front' };

  let q = $state('');
  let muscle = $state<Muscle | 'All'>('All');
  let equip = $state<Equip | 'All'>('All');
  let openId = $state<string | null>(null);
  let view = $state<'side' | 'angle' | 'compare'>('side');
  let mode = $state<'play' | 'start' | 'finish'>('play');

  const norm = (s: string) => s.toLowerCase();
  const results = $derived(
    EXERCISES.filter((e) => e.muscle !== 'Other')
      .filter((e) => muscle === 'All' || e.muscle === muscle)
      .filter((e) => equip === 'All' || EQUIPMENT[e.id] === equip)
      .filter((e) => {
        const t = norm(q.trim());
        return !t || norm(`${e.name} ${e.muscle} ${EQUIPMENT[e.id] ?? ''}`).includes(t);
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const filtered = $derived(q.trim() !== '' || muscle !== 'All' || equip !== 'All');
  const reset = () => { q = ''; muscle = 'All'; equip = 'All'; };

  const ex = $derived(openId ? EXERCISES.find((e) => e.id === openId) ?? null : null);
  const guide = $derived(openId ? guideFor(openId) : null);
  const mu = $derived(guide ? MUSCLE_MAP[guide.anim] : null);
  const angleKind = $derived.by(() => {
    if (!guide || !ex) return undefined;
    const pat = PATTERNS[guide.anim];
    return (pat ? pat.angle : LEGACY[ex.muscle]) as Kind | undefined;
  });
  const alternatives = $derived(ex ? swapOptions(ex.id).filter((e) => e.id !== ex.id) : []);
  function open(id: string) { openId = id; view = 'side'; mode = 'play'; }
  const close = () => (openId = null);
  const meta = (e: Exercise) => `${e.muscle} · ${EQUIPMENT[e.id] ?? 'Other'} · ${e.repMin}–${e.repMax} reps`;
  $effect(() => { if (view === 'angle' && !angleKind) view = 'side'; });
  function key(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
</script>

<svelte:window onkeydown={key} />

<main>
  <p class="eyebrow">Preview · not in your app</p>
  <h1>Exercise library</h1>

  <label class="search">
    <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5 17 17" /></svg>
    <input type="search" placeholder="Search exercises" bind:value={q} aria-label="Search exercises" enterkeyhint="search" />
    {#if q}<button type="button" class="x" aria-label="Clear search" onclick={() => (q = '')}>×</button>{/if}
  </label>

  <div class="chips" role="group" aria-label="Muscle">
    <button type="button" class="chip press" aria-pressed={muscle === 'All'} onclick={() => (muscle = 'All')}>All muscles</button>
    {#each MUSCLES as m}<button type="button" class="chip press" aria-pressed={muscle === m} onclick={() => (muscle = muscle === m ? 'All' : m)}>{m}</button>{/each}
  </div>
  <div class="chips" role="group" aria-label="Equipment">
    <button type="button" class="chip press" aria-pressed={equip === 'All'} onclick={() => (equip = 'All')}>All equipment</button>
    {#each EQUIP as e}<button type="button" class="chip press" aria-pressed={equip === e} onclick={() => (equip = equip === e ? 'All' : e)}>{e}</button>{/each}
  </div>

  <p class="count" aria-live="polite">{results.length} exercise{results.length === 1 ? '' : 's'}{#if filtered}<button type="button" class="link" onclick={reset}>Clear filters</button>{/if}</p>

  {#key `${muscle}|${equip}|${q}`}
    <ul class="list">
      {#each results as e, i (e.id)}
        <li style="--i:{Math.min(i, 12)}">
          <button type="button" class="row press" onclick={() => open(e.id)}>
            <span class="r-main"><span class="nm">{e.name}</span><span class="sub">{meta(e)}</span></span>
            {#if guideFor(e.id)}<span class="tag">Guide</span>{/if}
            <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
          </button>
        </li>
      {:else}
        <li class="empty">Nothing matches. <button type="button" class="link" onclick={reset}>Clear filters</button></li>
      {/each}
    </ul>
  {/key}
</main>

{#if ex}
  <div class="scrim" onclick={close} role="presentation"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={ex.name}>
    <div class="grab" aria-hidden="true"></div>
    <div class="s-head">
      <div><h2>{ex.name}</h2><p class="sub">{meta(ex)} · {ex.kind === 'compound' ? 'Compound' : 'Isolation'}</p></div>
      <button type="button" class="x big" aria-label="Close" onclick={close}>×</button>
    </div>

    <div class="s-body">
      {#if guide && mu}
        <div class="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'side'} onclick={() => (view = 'side')}>Side</button>
          {#if angleKind}<button type="button" aria-pressed={view === 'angle'} onclick={() => (view = 'angle')}>{FROM[angleKind]}</button>{/if}
          <button type="button" aria-pressed={view === 'compare'} onclick={() => (view = 'compare')}>Avoid vs ideal</button>
        </div>
        {#key openId + view}
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
            <button type="button" class="alt press" onclick={() => open(a.id)}><span>{a.name}</span><em>{EQUIPMENT[a.id] ?? ''}</em></button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  :global(body) { margin: 0; background: radial-gradient(120% 50% at 50% -10%, #11203d 0%, #0b0d11 55%) no-repeat #0b0d11; color: #e8eaee; font: 400 15px/1.45 var(--body); font-variant-numeric: tabular-nums; }
  main { max-width: 440px; margin: 0 auto; padding: 18px 16px 80px; --out: cubic-bezier(0.23, 1, 0.32, 1); }
  button { font-family: inherit; cursor: pointer; color: inherit; background: none; border: 0; padding: 0; }
  button:focus-visible, input:focus-visible { outline: 2px solid #4c8dff; outline-offset: 2px; }
  .eyebrow { margin: 0; font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #f2b544; font-weight: 700; }
  h1 { font: 800 32px/1.05 var(--body); letter-spacing: -0.02em; margin: 10px 0 14px; }
  .press { transition: transform 160ms var(--out); } .press:active { transform: scale(0.97); }
  .search { display: flex; align-items: center; gap: 10px; background: #13161c; border: 1px solid #242934; border-radius: 14px; padding: 0 14px; min-height: 50px; margin-bottom: 10px; }
  .search:focus-within { border-color: #4c8dff; }
  .search svg { width: 18px; height: 18px; flex: none; fill: none; stroke: #8c94a3; stroke-width: 1.8; stroke-linecap: round; }
  .search input { flex: 1; min-width: 0; background: none; border: 0; color: #e8eaee; font: inherit; font-size: 16px; outline: none; }
  .search input::-webkit-search-cancel-button { display: none; }
  .x { width: 32px; height: 32px; border-radius: 16px; background: #1f2530; color: #c4cad6; font-size: 20px; line-height: 1; }
  .x.big { width: 40px; height: 40px; border-radius: 20px; flex: none; }
  .chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 10px; scrollbar-width: none; margin: 0 -16px; padding-left: 16px; padding-right: 16px; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; min-height: 40px; padding: 0 14px; border-radius: 12px; background: #13161c; border: 1px solid #242934; color: #8c94a3; font-weight: 600; font-size: 13.5px; white-space: nowrap; }
  .chip[aria-pressed='true'] { background: #16305c; border-color: #4c8dff; color: #dce7ff; }
  .count { display: flex; justify-content: space-between; margin: 4px 2px 6px; font-size: 12.5px; color: #8c94a3; }
  .link { color: #6aa3ff; font-size: 12.5px; min-height: 24px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { animation: rise 380ms var(--out) both; animation-delay: calc(var(--i) * 30ms); border-bottom: 1px solid #1d222c; }
  .empty { padding: 28px 4px; color: #8c94a3; }
  .row { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 60px; padding: 10px 2px; text-align: left; }
  .r-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .nm { font-weight: 600; } .sub { font-size: 12px; color: #8c94a3; }
  .tag { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 7px; background: #16305c; color: #9cc0ff; }
  .chev { width: 16px; height: 16px; fill: none; stroke: #5b6475; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .scrim { position: fixed; inset: 0; background: rgba(4, 6, 10, 0.62); animation: fadeIn 220ms var(--out); z-index: 10; }
  .sheet { position: fixed; z-index: 11; left: 50%; bottom: 0; width: min(100%, 460px); max-height: 92vh; display: flex; flex-direction: column; background: #0f1218; border: 1px solid #242934; border-bottom: 0; border-radius: 22px 22px 0 0; transform: translateX(-50%); animation: slide 380ms cubic-bezier(0.32, 0.72, 0, 1); }
  .grab { width: 38px; height: 4px; border-radius: 2px; background: #3a4150; margin: 8px auto 0; }
  .s-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 10px 16px 8px; }
  h2 { margin: 0; font: 800 21px/1.2 var(--display); }
  .s-body { overflow-y: auto; padding: 0 16px 28px; overscroll-behavior: contain; }
  .seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; background: #13161c; border: 1px solid #242934; border-radius: 12px; padding: 3px; margin: 4px 0 10px; }
  .seg button { min-height: 40px; border-radius: 9px; color: #8c94a3; font-size: 13px; font-weight: 600; transition: background 200ms var(--out), color 200ms; }
  .seg button[aria-pressed='true'] { background: #16305c; color: #dce7ff; box-shadow: inset 0 0 0 1px #4c8dff; }
  .stage { animation: fadeIn 260ms var(--out); border-radius: 16px; overflow: hidden; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  figure { margin: 0; border-radius: 14px; overflow: hidden; background: #0e1116; border: 1.5px solid #3a2326; }
  figure.good { border-color: #1f4a33; }
  figcaption { padding: 6px 10px; font: 700 13px var(--display); color: #ff6b61; } figure.good figcaption { color: #4cd98a; }
  figure p { margin: 0; padding: 6px 10px 10px; font-size: 12px; line-height: 1.3; color: #cfd4de; }
  .ctrl { display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
  .muscles { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
  .m { font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 8px; } .m.main { background: rgba(255, 59, 48, .16); color: #ff8a80; } .m.also { background: rgba(255, 157, 110, .13); color: #ffb48a; }
  details { border-top: 1px solid #1d222c; } details:last-of-type { border-bottom: 1px solid #1d222c; }
  summary { list-style: none; display: flex; justify-content: space-between; align-items: center; min-height: 50px; font-weight: 700; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: ''; width: 8px; height: 8px; border-right: 2px solid #6b7384; border-bottom: 2px solid #6b7384; transform: rotate(45deg); transition: transform 200ms var(--out); margin-right: 4px; }
  details[open] summary::after { transform: rotate(-135deg); }
  .steps { margin: 0 0 12px; padding-left: 20px; color: #cfd4de; font-size: 14px; line-height: 1.5; }
  .dl { margin: 0 0 8px; padding: 0; list-style: none; font-size: 14px; color: #cfd4de; }
  .dl li { padding: 7px 0 7px 22px; position: relative; line-height: 1.4; }
  .dl li::before { position: absolute; left: 0; font-weight: 800; } .dl.do li::before { content: '✓'; color: #4cd98a; } .dl.dont li::before { content: '✗'; color: #ff6b61; }
  h3 { margin: 18px 0 2px; font: 800 17px var(--display); }
  .alts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .alt { display: flex; flex-direction: column; align-items: flex-start; min-height: 48px; padding: 8px 12px; border-radius: 12px; background: #13161c; border: 1px solid #242934; font-size: 13.5px; font-weight: 600; }
  .alt em { font-style: normal; font-size: 11px; color: #8c94a3; font-weight: 500; }
  .nog { padding: 12px 0; color: #cfd4de; }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
  @keyframes fadeIn { from { opacity: 0; } }
  @keyframes slide { from { transform: translate(-50%, 100%); } }
  @media (prefers-reduced-motion: reduce) { .list li, .scrim, .sheet, .stage { animation: fadeIn 120ms linear both; } .sheet { transform: translateX(-50%); } .press:active { transform: none; opacity: .7; } }
</style>
