<script lang="ts">
  import { untrack } from 'svelte';
  // Overview numbers and charts for the Progress screen. Everything is worked out from the logged sets (see lib/analytics).
  import { exerciseStrength, monthStats, personalBests, repRanges, sessionsPerWeek, setsLast7Days, topMuscles, weeklyVolume } from '../lib/analytics';
  import type { ExerciseLookup } from '../lib/stats';
  import type { Muscle, SetLog } from '../lib/types';

  let { sets, today, target, lookup }: { sets: SetLog[]; today: string; target: number; lookup: ExerciseLookup } = $props();

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const label = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
  const kfmt = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n)));
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  type Tab = 'volume' | 'strength' | 'muscle' | 'consistency';
  const TABS: [Tab, string][] = [['volume', 'Volume'], ['strength', 'Strength'], ['muscle', 'Muscle'], ['consistency', 'Consistency']];
  let tab = $state<Tab>('volume');
  let focus = $state<Muscle | null>(null);
  let showAll = $state(false);
  let scrub = $state<number | null>(null);

  const hasData = $derived(sets.some((s) => !s.warmup && !s.deleted && s.reps > 0));
  const stats = $derived(monthStats(sets, today, target));
  const vol = $derived(weeklyVolume(sets, today, 12, lookup));
  const top = $derived(topMuscles(vol, 5));
  const ranges = $derived(repRanges(sets, today, 90));
  const strength = $derived(exerciseStrength(sets, today, 12, lookup));
  const week7 = $derived(setsLast7Days(sets, today, lookup));
  const sessions = $derived(sessionsPerWeek(sets, today, 12));
  const bests = $derived(personalBests(sets, today, lookup));
  const MUSCLES: Muscle[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];
  const under = $derived(MUSCLES.filter((m) => (week7[m] ?? 0) < 10));
  const doneThisWeek = $derived(sessions.counts[11] ?? 0);
  const COLORS = ['#4c8dff', '#f2b544', '#4cd98a', '#b08cff', '#ff8a7a'];

  // Numbers count up when the page opens (and settle straight away with reduced motion).
  let shown = $state([0, 0, 0, 0]);
  $effect(() => {
    const to = [doneThisWeek, bests.count, stats.weekStreak, under.length];
    if (reduce || typeof requestAnimationFrame !== 'function') { shown = to; return; }
    const from = untrack(() => [...shown]);
    const t0 = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const f = Math.min(1, (now - t0) / 900);
      const e = 1 - (1 - f) ** 3;
      shown = to.map((n, i) => from[i] + (n - from[i]) * e);
      if (f < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  });

  // ---- the line chart ----
  const W = 340, H = 190, L = 34, R = 330, T = 12, B = 160;
  const max = $derived(Math.max(1, ...top.flatMap((m) => vol.series[m] ?? [])));
  const step = $derived(10 ** Math.floor(Math.log10(max)) / 2);
  const niceMax = $derived(Math.ceil(max / step) * step);
  const xs = (i: number) => L + (i * (R - L)) / 11;
  const ys = (v: number) => B - (v / niceMax) * (B - T);
  function smooth(vals: number[]): string {
    const p = vals.map((v, i) => [xs(i), ys(v)]);
    let d = `M ${p[0][0]} ${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p2;
      d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }
  const grid = $derived([0, 1, 2, 3, 4].map((i) => (niceMax * i) / 4));
  function onMove(e: PointerEvent) {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    scrub = Math.max(0, Math.min(11, Math.round(((x - L) / (R - L)) * 11)));
  }

  const spark = (pts: number[]) => {
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    return pts.map((v, i) => `${(i * 64) / Math.max(1, pts.length - 1)},${24 - ((v - lo) / span) * 20 - 2}`).join(' ');
  };
  const chg = (c: number | null) => (c === null ? '' : `${c > 0 ? '+' : ''}${Math.round(c)}%`);
</script>

<section class="an" aria-label="Overview" data-testid="analytics">
{#if !hasData}
  <div class="empty"><b>Your progress will show up here</b>Log a few workouts and you will see your weekly volume, strength and consistency.</div>
{:else}

  <section class="tiles" aria-label="Summary">
    <div class="tile" style:--i="0">
      <div class="k">Workouts this week</div>
      <div class="v">{Math.round(shown[0])}<small> of {target}</small></div>
      <div class="meter"><i style:--w={Math.min(1, doneThisWeek / target)}></i></div>
    </div>
    <div class="tile" style:--i="1">
      <div class="k">Personal bests this month</div>
      <div class="v">{Math.round(shown[1])}</div>
      <div class="d">{bests.names.length ? bests.names.slice(0, 2).join(', ') + (bests.names.length > 2 ? ` +${bests.names.length - 2}` : '') : 'none yet'}</div>
    </div>
    <div class="tile" style:--i="2">
      <div class="k">Week streak</div>
      <div class="v">{Math.round(shown[2])}</div>
      <div class="d flat">weeks hitting {target} workouts</div>
    </div>
    <div class="tile" class:warn={under.length > 0} style:--i="3">
      <div class="k">Under 10 sets, last 7 days</div>
      <div class="v">{Math.round(shown[3])}<small> muscle{under.length === 1 ? '' : 's'}</small></div>
      <div class="d flat">{under.slice(0, 3).join(', ')}{under.length > 3 ? ` +${under.length - 3}` : ''}</div>
    </div>
  </section>

  <div class="tabs" role="tablist" aria-label="Progress view" style:--n={TABS.findIndex((t) => t[0] === tab)}>
    <span class="pill" aria-hidden="true"></span>
    {#each TABS as [id, name]}
      <button type="button" role="tab" aria-selected={tab === id} onclick={() => { tab = id; scrub = null; }}>{name}</button>
    {/each}
  </div>

  {#key tab}
  <div class="pane">
  {#if tab === 'volume'}
    <section class="card" style:--i="0">
      <p class="cap">Weekly volume · top 5 muscles · last 12 weeks</p>
      <h2>Volume by muscle</h2>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svg viewBox="0 0 {W} {H}" role="img" aria-label="Weekly volume for your five most trained muscles. Touch the chart to read a week." onpointermove={onMove} onpointerdown={onMove} onpointerleave={() => (scrub = null)} style:touch-action="pan-y">
        <defs><filter id="gl" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="3.2" /></filter></defs>
        {#each grid as g}
          <line x1={L} x2={R} y1={ys(g)} y2={ys(g)} stroke="#242934" />
          <text x={L - 6} y={ys(g) + 3.5} fill="#8c94a3" font-size="9.5" text-anchor="end">{g === 0 ? '0' : kfmt(g)}</text>
        {/each}
        {#each top as m, i}
          {@const v = vol.series[m] ?? []}
          <g class="breathe" style:--b="{1300 + i * 140}ms" opacity={focus && focus !== m ? 0 : 1}>
            <path class="ln" d={smooth(v)} pathLength="1" fill="none" stroke={COLORS[i]} stroke-width="5" stroke-linecap="round" filter="url(#gl)" style:--d="{i * 90}ms" />
          </g>
          <path class="ln" d={smooth(v)} pathLength="1" fill="none" stroke={COLORS[i]} stroke-width={focus === m ? 3.4 : 2.2} stroke-linecap="round" opacity={focus && focus !== m ? 0.16 : 1} style:--d="{i * 90}ms" />
          <circle class="ring" cx={xs(11)} cy={ys(v[11])} r="3.4" fill="none" stroke={COLORS[i]} stroke-width="1.5" style:--d="{1400 + i * 260}ms" opacity={focus && focus !== m ? 0 : 1} />
          <circle class="dot" cx={xs(11)} cy={ys(v[11])} r="3.4" fill={COLORS[i]} opacity={focus && focus !== m ? 0.16 : 1} style:--d="{900 + i * 90}ms" />
        {/each}
        {#each [0, 3, 6, 9, 11] as i}
          <text x={xs(i)} y="178" fill="#8c94a3" font-size="9.5" text-anchor={i === 11 ? 'end' : 'middle'}>{label(vol.weeks[i])}</text>
        {/each}
        {#if scrub !== null}
          {@const sx = xs(scrub)}
          {@const right = scrub < 6}
          <line x1={sx} x2={sx} y1={T} y2={B} stroke="#8c94a3" stroke-dasharray="3 3" />
          {#each top as m, i}<circle cx={sx} cy={ys(vol.series[m]?.[scrub] ?? 0)} r="3.6" fill={COLORS[i]} stroke="#13161c" stroke-width="1.5" />{/each}
          <g transform="translate({right ? sx + 8 : sx - 112} {T + 2})">
            <rect width="104" height={18 + top.length * 14} rx="8" fill="#0b0d11" stroke="#242934" />
            <text x="9" y="14" fill="#8c94a3" font-size="9.5">Week of {label(vol.weeks[scrub])}</text>
            {#each top as m, i}
              <circle cx="12" cy={26 + i * 14} r="3" fill={COLORS[i]} />
              <text x="20" y={29.5 + i * 14} fill="#e8eaee" font-size="9.5">{m}</text>
              <text x="97" y={29.5 + i * 14} fill="#e8eaee" font-size="9.5" text-anchor="end">{kfmt(vol.series[m]?.[scrub] ?? 0)}</text>
            {/each}
          </g>
        {/if}
      </svg>
      <div class="legend">
        {#each top as m, i}
          <button type="button" class="lg press" aria-pressed={focus === m} onclick={() => (focus = focus === m ? null : m)}><span style:background={COLORS[i]}></span>{m}</button>
        {/each}
      </div>
      <p class="hint">Volume is weight × reps of your working sets, in kg. Touch the chart to read a week, tap a muscle to highlight it.</p>
    </section>

    <section class="card" style:--i="1">
      <p class="cap">Training emphasis · last 90 days</p>
      <h2>Rep ranges</h2>
      {#each ranges as r, i}
        <div class="rr">
          <div class="rr-top"><span><b>{r.label}</b> <em>{r.reps}</em></span><span><b class="pc">{r.percent}%</b> <em>{r.sets} sets</em></span></div>
          <div class="bar"><i style:--w={r.percent / 100} style:--d="{250 + i * 120}ms"></i></div>
          <div class="note">{r.note}</div>
        </div>
      {/each}
    </section>
  {:else if tab === 'strength'}
    <section class="card" style:--i="0">
      <p class="cap">Estimated 1-rep max · last 12 weeks</p>
      <h2>Strength by exercise</h2>
      {#each showAll ? strength : strength.slice(0, 8) as s, i}
        <div class="ex" style:--i={i}>
          <div class="ex-l"><div class="nm">{s.name}</div><div class="sub">{s.muscle} · {s.latest} kg{#if s.isRecord} · <span class="pr">Best yet</span>{/if}</div></div>
          {#if s.points.length > 1}<svg class="sp" viewBox="0 0 64 24" aria-hidden="true"><polyline class="ln" pathLength="1" style:--d="{i * 50 + 150}ms" points={spark(s.points)} fill="none" stroke="#4c8dff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}
          <div class="dl" class:down={(s.change ?? 0) < 0}>{chg(s.change) || '·'}</div>
        </div>
      {/each}
      {#if strength.length > 8}<button type="button" class="more press" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${strength.length}`}</button>{/if}
    </section>
  {:else if tab === 'muscle'}
    <section class="card" style:--i="0">
      <p class="cap">Working sets · last 7 days</p>
      <h2>Sets per muscle</h2>
      <p class="hint top">The shaded zone is 10 to 20 sets a week, a common range people use for growth. It is a guide, not a rule.</p>
      {#each MUSCLES as m, i}
        {@const n = week7[m] ?? 0}
        <div class="ms">
          <span class="mn">{m}</span>
          <div class="track"><div class="zone"></div><i class:low={n < 10} style:--w={Math.min(1, n / 25)} style:--d="{i * 55}ms"></i></div>
          <span class="mc">{n}</span>
        </div>
      {/each}
    </section>
  {:else}
    <section class="card" style:--i="0">
      <p class="cap">Workouts per week · last 12 weeks</p>
      <h2>Consistency</h2>
      <svg viewBox="0 0 340 150" role="img" aria-label="Workouts per week against your target">
        {#each sessions.counts as c, i}
          {@const h = (c / 7) * 110}
          <rect class="col" x={L + i * 24.5} y={130 - h} width="16" height={h} rx="4" fill={c >= target ? '#4c8dff' : '#2a4a85'} style:--d="{i * 45}ms" />
          {#if c > 0}<text class="dot" x={L + i * 24.5 + 8} y={124 - h} fill="#c9d3e6" font-size="9.5" text-anchor="middle" style:--d="{i * 45 + 400}ms">{c}</text>{/if}
        {/each}
        <line x1={L - 4} x2="330" y1={130 - (target / 7) * 110} y2={130 - (target / 7) * 110} stroke="#f2b544" stroke-dasharray="4 4" />
        <text x="330" y={130 - (target / 7) * 110 - 5} fill="#f2b544" font-size="9.5" text-anchor="end">target {target}</text>
        {#each [0, 4, 8, 11] as i}<text x={L + i * 24.5 + 8} y="146" fill="#8c94a3" font-size="9.5" text-anchor="middle">{label(sessions.weeks[i])}</text>{/each}
      </svg>
      <p class="hint">Brighter bars hit your weekly target. A gap is just a gap: the screen does not score you.</p>
    </section>
  {/if}
  </div>
  {/key}
{/if}
</section>

<style>
  .an { margin-bottom: 18px; --out: cubic-bezier(0.23, 1, 0.32, 1); }
  .empty { padding: 18px; border-radius: 18px; background: #13161c; border: 1px solid #242934; color: #8c94a3; font-size: 14px; line-height: 1.45; } .empty b { display: block; color: #e8eaee; font: 800 17px var(--display); margin-bottom: 4px; }
  button { font-family: inherit; cursor: pointer; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .tile, .card { animation: rise 520ms var(--out) both; animation-delay: calc(var(--i, 0) * 70ms); }
  .tile { background: linear-gradient(160deg, #171c26 0%, #13161c 60%); border: 1px solid #242934; border-radius: 16px; padding: 14px; min-height: 108px; }
  .tile.warn { border-color: #5a4720; }
  .k { font-size: 11.5px; color: #8c94a3; line-height: 1.25; min-height: 29px; }
  .v { font: 800 30px/1.15 var(--display); margin-top: 2px; }
  .v small { font: 600 13px var(--body); color: #8c94a3; }
  .d { font-size: 11.5px; margin-top: 3px; color: #7fb0ff; line-height: 1.3; } .d.flat { color: #8c94a3; }
  .warn .v { color: #f2b544; }
  .meter { height: 5px; border-radius: 3px; background: #1f2530; margin-top: 8px; overflow: hidden; }
  .meter i { display: block; height: 100%; width: 100%; background: #4c8dff; border-radius: 3px; transform-origin: left; transform: scaleX(var(--w)); animation: grow 900ms var(--out) 250ms both; --to: var(--w); }
  .tabs { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); background: #13161c; border: 1px solid #242934; border-radius: 14px; padding: 3px; margin-bottom: 14px; }
  .pill { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 4); border-radius: 11px; background: #16305c; box-shadow: inset 0 0 0 1px #4c8dff; transform: translateX(calc(var(--n) * 100%)); transition: transform 320ms cubic-bezier(0.32, 0.72, 0, 1); }
  .tabs button { position: relative; min-height: 44px; background: none; border: 0; color: #8c94a3; font-weight: 600; font-size: 13px; transition: color 200ms; }
  .tabs button[aria-selected='true'] { color: #dce7ff; }
  .card { background: #13161c; border: 1px solid #242934; border-radius: 18px; padding: 16px; margin-bottom: 14px; }
  .cap { margin: 0; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #8c94a3; }
  h2 { margin: 4px 0 10px; font: 800 20px/1.2 var(--display); }
  svg { display: block; width: 100%; height: auto; }
  .ln { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1100ms var(--out) var(--d, 0ms) forwards; }
  .dot { opacity: 0; animation: pop 300ms var(--out) var(--d, 0ms) forwards; }
  .breathe { opacity: 0.38; animation: breathe 4.2s ease-in-out var(--b, 1300ms) infinite; transition: opacity 200ms; }
  .ring { transform-box: fill-box; transform-origin: center; opacity: 0; animation: ring 3.2s ease-out var(--d, 1400ms) infinite; }
  .col { transform-box: fill-box; transform-origin: bottom; animation: up 600ms var(--out) var(--d, 0ms) both; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .lg { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 0 11px; border-radius: 10px; background: #1a1e26; border: 1px solid #242934; color: #c4cad6; font-size: 12.5px; transition: border-color 160ms, color 160ms, transform 160ms var(--out); }
  .lg:active { transform: scale(0.96); } .lg[aria-pressed='true'] { border-color: #4c8dff; color: #fff; }
  .lg span { width: 12px; height: 3px; border-radius: 2px; }
  .hint { margin: 10px 0 0; font-size: 12.5px; color: #8c94a3; line-height: 1.4; } .hint.top { margin: 0 0 10px; }
  .rr { margin-top: 14px; } .rr-top { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; }
  .rr em { font-style: normal; color: #8c94a3; font-size: 12px; margin-left: 4px; } .pc { font: 800 20px var(--display); }
  .bar { height: 8px; border-radius: 5px; background: #1a1e26; margin: 6px 0 4px; overflow: hidden; }
  .bar i, .track i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #3a74e0, #6aa3ff); border-radius: 5px; transform-origin: left; transform: scaleX(var(--w)); animation: grow 800ms var(--out) var(--d, 0ms) both; }
  .note { font-size: 11.5px; color: #8c94a3; }
  .ex { display: grid; grid-template-columns: 1fr 64px 52px; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid #242934; animation: rise 420ms var(--out) both; animation-delay: calc(var(--i) * 40ms); }
  .ex:first-of-type { border-top: 0; } .nm { font-weight: 600; font-size: 14px; } .sub { font-size: 12px; color: #8c94a3; }
  .pr { color: #6aa3ff; font-weight: 700; } .dl { text-align: right; font: 800 17px var(--display); color: #6aa3ff; } .dl.down { color: #f2b544; }
  .more { margin-top: 6px; min-height: 44px; color: #6aa3ff; background: none; border: 0; font-size: 14px; }
  .press { transition: transform 160ms var(--out); } .press:active { transform: scale(0.97); }
  .ms { display: grid; grid-template-columns: 84px 1fr 28px; align-items: center; gap: 10px; padding: 8px 0; font-size: 14px; }
  .track { position: relative; height: 10px; border-radius: 6px; background: #1a1e26; overflow: hidden; }
  .track i { position: absolute; left: 0; top: 0; bottom: 0; } .track i.low { background: #2a4a85; }
  .zone { position: absolute; left: 40%; width: 40%; top: 0; bottom: 0; background: rgba(76,141,255,.16); }
  .mc { text-align: right; font-weight: 700; }
  .pane { animation: fadeIn 220ms var(--out); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  @keyframes fadeIn { from { opacity: 0; } }
  @keyframes breathe { 0%, 100% { opacity: 0.22; } 50% { opacity: 0.5; } }
  @keyframes ring { 0% { transform: scale(1); opacity: 0.7; } 70%, 100% { transform: scale(3.2); opacity: 0; } }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; } }
  @keyframes grow { from { transform: scaleX(0); } }
  @keyframes up { from { transform: scaleY(0); } }
  @media (prefers-reduced-motion: reduce) {
    .tile, .card, .ex, .pane { animation: fadeIn 120ms linear both; }
    .ln { animation: none; stroke-dashoffset: 0; } .dot { animation: none; opacity: 1; }
    .breathe { animation: none; } .ring { animation: none; opacity: 0; }
    .col, .bar i, .track i, .meter i { animation: none; }
    .pill { transition: none; }
  }
</style>
