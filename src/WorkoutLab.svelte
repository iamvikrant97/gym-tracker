<script lang="ts">
  // Preview: how the exercise guide would sit inside the workout screen. The cards are a look-alike of the real ones
  // (static rows); the sheet is the real Sheet component.
  import Sheet from './ui/Sheet.svelte';
  import FormGuide from './ui/FormGuide.svelte';
  import { guideFor } from './lib/formGuides';
  import { SETUP, WEIGHT_RULE } from './lib/setupGuides';
  import { swapOptions, EXERCISES } from './lib/seed';

  let { onlibrary = () => {} }: { onlibrary?: () => void } = $props();

  const CARDS = [
    { code: 'A1', id: 'smith-incline-press', name: 'Smith incline press', sub: '8–12 reps · rest 3:00 · steps of 2.5 kg', rows: [['1', '62.5 × 10', '65', '10', true], ['2', '62.5 × 9', '65', '', false], ['3', '60 × 10', '65', '', false]] },
    { code: 'A2', id: 'cable-fly', name: 'Cable fly', sub: '12–15 reps · rest 2:00 · steps of 2.5 kg', rows: [['1', '15 × 14', '15', '', false], ['2', '15 × 13', '15', '', false]] },
    { code: 'A3', id: 'hammer-curl', name: 'Hammer curl', sub: '10–12 reps · rest 2:00 · steps of 1 kg', rows: [['1', '14 × 12', '14', '', false], ['2', '14 × 11', '14', '', false]] },
  ];
  let openId = $state<string | null>(null);
  let tab = $state<'form' | 'setup'>('form');
  let lastTab = $state<'form' | 'setup'>('form'); // remembered between opens
  let swapId = $state<string | null>(null);
  const swapList = $derived.by(() => { if (!swapId) return []; const out: typeof EXERCISES = []; for (const e of [EXERCISES.find((x) => x.id === swapId), ...swapOptions(swapId)]) if (e && !out.some((o) => o.id === e.id)) out.push(e); return out; });
  const pick = (t: 'form' | 'setup') => { tab = t; lastTab = t; };
  const card = $derived(CARDS.find((c) => c.id === openId));
  const guide = $derived(openId ? guideFor(openId) : null);
  function openSheet(id: string) { openId = id; tab = guideFor(id) ? lastTab : 'setup'; }
</script>

<section class="screen">
  <p class="eyebrow">Preview · not in your app · look-alike cards</p>
  <header class="top"><h1>Chest + Back A</h1><div class="clock"><b>18:42</b><span>elapsed</span></div></header>
  <div class="hint">Tap the <span class="i">i</span> next to an exercise name. Nothing else on the card changes.</div>

  <main class="list">
    {#each CARDS as c}
      <article class="card">
        <div class="card-head">
          <span class="code">{c.code}</span>
          <div class="head-text">
            <div class="ex-name">{c.name}
              <button class="info press" type="button" aria-label="Guide for {c.name}" onclick={() => openSheet(c.id)}><span aria-hidden="true">i</span></button>
            </div>
            <div class="ex-sub">{c.sub}</div>
          </div>
          <div class="head-actions">
            <button class="swap press iconbtn" type="button" aria-label="Add a set">+</button>
            <button class="swap press" type="button" onclick={() => (swapId = c.id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>Swap</button>
          </div>
        </div>
        <div class="sets">
          <div class="shead" aria-hidden="true"><span>Set</span><span>Last</span><span>kg</span><span>Reps</span><span></span></div>
          {#each c.rows as r}
            <div class="srow" class:done={r[4]}><span>{r[0]}</span><span class="last">{r[1]}</span><span class="box">{r[2]}</span><span class="box">{r[3] || '·'}</span><span class="tick" aria-hidden="true">{r[4] ? '✓' : ''}</span></div>
          {/each}
        </div>
      </article>
    {/each}
  </main>
</section>

<Sheet open={openId !== null} onclose={() => (openId = null)} title={card?.name ?? ''} sub={tab === 'form' ? 'How to do it' : 'Set up'}>
  {#if openId}
    {#if guide}
      <div class="tabs" role="tablist" aria-label="Guide">
        <button type="button" role="tab" aria-selected={tab === 'form'} onclick={() => pick('form')}>Form</button>
        <button type="button" role="tab" aria-selected={tab === 'setup'} onclick={() => pick('setup')}>Set up</button>
      </div>
    {/if}
    <div class="sheet-body">
      {#if tab === 'form' && guide}
        <FormGuide exerciseId={openId} />
      {:else}
        <p class="tip">{SETUP[openId] ?? 'Set the machine so the movement feels smooth, and stop if anything hurts.'}</p>
        <p class="rule">{WEIGHT_RULE(12)}</p>
      {/if}
      <button type="button" class="ok press" onclick={() => (openId = null)}>Got it</button>
    </div>
  {/if}
</Sheet>

<Sheet open={swapId !== null} onclose={() => (swapId = null)} title="Swap exercise" sub="Your history stays with each exercise">
  <div class="sheet-body">
    {#each swapList as o, i (o.id)}
      <button type="button" class="opt press" onclick={() => (swapId = null)}><span><span class="nm">{o.name}</span><span class="meta">{o.repMin}–{o.repMax} reps</span></span><span class="dot" class:on={i === 0}></span></button>
    {/each}
    <button type="button" class="lib press" onclick={() => { swapId = null; onlibrary(); }}>Not sure which? Browse the exercise library <span aria-hidden="true">→</span></button>
  </div>
</Sheet>

<style>
  .opt { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; padding: 8px 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); text-align: left; }
  .nm { display: block; font-weight: 600; font-size: 15px; } .meta { display: block; font-size: 12.5px; color: var(--muted); margin-top: 2px; }
  .dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--ring); flex: none; } .dot.on { border-color: var(--blue); background: radial-gradient(var(--blue) 40%, transparent 45%); }
  .lib { min-height: 52px; padding: 0 14px; border-radius: 12px; color: var(--blue); font: 600 14.5px var(--body); text-align: left; display: flex; justify-content: space-between; align-items: center; }
  .eyebrow { margin: 22px 0 0; font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--amber); font-weight: 700; }
  .top { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
  h1 { font: 800 22px/1.1 var(--body); letter-spacing: -0.01em; margin: 0; }
  .clock { margin-left: auto; text-align: right; } .clock b { display: block; font: 600 20px/1 var(--display); } .clock span { font-size: 11px; color: var(--muted); }
  .hint { margin: 12px 0 0; font-size: 13px; color: var(--muted); } .i { display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center; border-radius: 50%; border: 1.5px solid var(--ring); font: italic 700 11px var(--display); }
  .list { display: grid; gap: 12px; margin-top: 12px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 14px 8px; overflow: hidden; }
  .card-head { display: flex; align-items: flex-start; gap: 10px; }
  .head-text { min-width: 0; }
  .code { font: 600 13px/1 var(--display); color: var(--muted); padding-top: 4px; min-width: 20px; }
  .ex-name { font: 600 17px/1.25 var(--body); }
  .info { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; width: 22px; height: 22px; margin: -11px 0 -11px 4px; border-radius: 50%; border: 1.5px solid var(--ring); color: var(--muted); font: italic 700 12px/1 var(--display); position: relative; }
  .info::after { content: ''; position: absolute; inset: -11px; }
  .ex-sub { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
  .head-actions { margin-left: auto; display: flex; gap: 6px; flex: none; margin-top: -6px; margin-right: -6px; }
  .swap { flex: none; height: 48px; padding: 0 12px; border-radius: 10px; background: var(--raised); font-size: 12.5px; color: var(--muted); display: flex; gap: 6px; align-items: center; }
  .iconbtn { min-width: 48px; justify-content: center; font-size: 22px; line-height: 1; color: var(--text); } .swap svg { width: 14px; height: 14px; }
  .sets { margin-top: 10px; }
  .shead, .srow { display: grid; grid-template-columns: 28px 1fr 66px 54px 48px; column-gap: 8px; align-items: center; }
  .shead { padding-bottom: 6px; font: 500 11px/1 var(--body); color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; } .shead span:nth-child(3), .shead span:nth-child(4) { text-align: center; }
  .srow { min-height: 52px; border-top: 1px solid var(--line); } .srow .last { color: var(--muted); font-size: 13px; }
  .box { text-align: center; background: var(--raised); border-radius: 9px; padding: 9px 0; font-weight: 600; }
  .tick { text-align: center; color: var(--blue); font-weight: 800; } .srow.done .box { color: var(--blue); }
  .tabs { display: grid; grid-template-columns: 1fr 1fr; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 3px; margin: 0 20px 12px; }
  .tabs button { height: 44px; border-radius: 9px; font-size: 14px; color: var(--muted); font-weight: 600; transition: background 200ms var(--ease-out), color 200ms var(--ease-out); }
  .tabs button[aria-selected='true'] { background: var(--raised); color: var(--text); }
  .sheet-body { padding: 4px 20px 22px; display: flex; flex-direction: column; gap: 12px; font-family: var(--body); }
  .tip { margin: 0; font: 700 18px/1.35 var(--display); } .rule { margin: 0; font-size: 15px; line-height: 1.4; color: var(--muted); }
  .ok { margin-top: 6px; min-height: 52px; border-radius: 14px; background: var(--blue); color: var(--on-blue); font: 700 16px var(--body); }
</style>
