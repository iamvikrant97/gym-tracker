<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { fmtKg } from '../lib/workoutView';
  import type { DayVisit } from '../lib/stats';
  /** The workout(s) of one day: what you lifted, what beat last time, PRs, and every set. Shared by the Week calendar and Home. */
  let {
    open,
    onclose,
    title,
    visits,
    onprev,
    onnext,
  }: { open: boolean; onclose: () => void; title: string; visits: DayVisit[]; onprev?: () => void; onnext?: () => void } = $props();

  type Ex = DayVisit['exercises'][number];
  const top = (e: Ex) => e.sets.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && b.reps > a.reps) ? b : a));
  /** "+2.5 kg", "+1 rep", "same" or "first time", against the previous visit to this exercise. */
  function change(e: Ex): { text: string; tone: 'up' | 'down' | 'same' | 'new' } {
    if (!e.prev) return { text: 'First time', tone: 'new' };
    const t = top(e);
    if (t.kg !== e.prev.kg) {
      const d = Math.round((t.kg - e.prev.kg) * 100) / 100;
      return { text: `${d > 0 ? '+' : '−'}${fmtKg(Math.abs(d))} kg`, tone: d > 0 ? 'up' : 'down' };
    }
    const r = t.reps - e.prev.reps;
    return r === 0 ? { text: 'Same as last time', tone: 'same' } : { text: `${r > 0 ? '+' : '−'}${Math.abs(r)} rep${Math.abs(r) === 1 ? '' : 's'}`, tone: r > 0 ? 'up' : 'down' };
  }
  const compared = (v: DayVisit) => v.exercises.filter((e) => e.prev).length;
</script>

<Sheet {open} {onclose} {title} sub={visits.length > 1 ? `${visits.length} workouts` : undefined}>
  {#if onprev || onnext}
    <div class="nav" role="group" aria-label="Other workouts">
      <button type="button" class="step press" aria-label="Older workout" disabled={!onprev} onclick={onprev}>‹ Older</button>
      <button type="button" class="step press" aria-label="Newer workout" disabled={!onnext} onclick={onnext}>Newer ›</button>
    </div>
  {/if}
  {#each visits as v (v.key)}
    <div class="visit" data-testid="day-workout" data-flip>
      <div class="hero" style:--c={v.color}>
        <i class="bar"></i>
        <h3>{v.name}</h3>
        {#if v.muscles.length}<div class="chips">{#each v.muscles.slice(0, 5) as m, mi (m)}<span style:--k={mi}>{m}</span>{/each}</div>{/if}
      </div>
      <dl class="figs">
        <div><dt>Sets</dt><dd data-testid="day-sets">{v.sets}</dd></div>
        {#if v.minutes !== null}<div><dt>Time</dt><dd><span data-testid="day-minutes">{v.minutes}</span><small>min</small></dd></div>{/if}
        <div class:gold={v.prs > 0}><dt>PRs</dt><dd data-testid="day-prs">{v.prs}</dd></div>
      </dl>
      {#if compared(v) > 0}
        <p class="vs" data-testid="day-improved"><b>{v.improved} of {compared(v)}</b> lifts beat last time</p>
      {/if}
      <ul class="exs">
        {#each v.exercises as ex, ei (ex.exerciseId)}
          {@const c = change(ex)}
          <li style:--i={ei}>
            <div class="top">
              <span class="en">{ex.name}{#if ex.pr}<span class="pr">PR</span>{/if}</span>
              <span class="chg {c.tone}">{c.text}</span>
            </div>
            <span class="ss">{#each ex.sets as st (st.id)}<span class:best={st === top(ex)}>{fmtKg(st.kg)} × {st.reps}</span>{/each}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</Sheet>

<style>
  /* Opening a day, or flipping to an older or newer one, slides the new workout in; cards follow one by one. */
  .visit { animation: vin 320ms var(--ease-out) both; }
  .exs li { animation: vin 380ms var(--ease-out) both; animation-delay: calc(120ms + var(--i) * 55ms); }
  .figs > div.gold { animation: vin 320ms var(--ease-out) both, goldglow 1100ms var(--ease-out) 350ms both; }
  .chg.up { animation: chgin 420ms var(--ease-out) both; animation-delay: calc(260ms + var(--i, 0) * 55ms); }
  .pr { animation: prpop 460ms var(--ease-out) both; animation-delay: 300ms; }
  @keyframes vin { from { opacity: 0; transform: translateY(10px); } }
  @keyframes chgin { from { opacity: 0; transform: translateX(-6px); } }
  @keyframes prpop { from { opacity: 0; transform: scale(0.4) rotate(-8deg); } 65% { transform: scale(1.12); } }
  @keyframes goldglow { 0%, 100% { box-shadow: 0 0 0 0 rgba(242, 181, 68, 0); } 40% { box-shadow: 0 0 18px 1px rgba(242, 181, 68, 0.45); } }
  @media (prefers-reduced-motion: reduce) { .visit, .exs li, .figs > div.gold, .chg.up, .pr { animation: none; } }
  .nav { display: flex; gap: 8px; margin-bottom: 12px; }
  .step { flex: 1; min-height: 44px; border-radius: 12px; background: var(--raised); border: 1px solid var(--line); font-weight: 600; font-size: 14px; }
  .step:disabled { opacity: 0.35; }
  .visit + .visit { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
  .hero { position: relative; overflow: hidden; padding: 14px; margin-bottom: 12px; border-radius: 18px; border: 1px solid var(--line); background: linear-gradient(160deg, color-mix(in srgb, var(--c) 28%, #0f1218), #0f1218 70%); }
  .hero > * { position: relative; z-index: 1; }
  .hero::before { content: ''; position: absolute; inset: -45%; background: radial-gradient(circle at 30% 35%, color-mix(in srgb, var(--c) 50%, transparent), transparent 52%); opacity: 0.5; animation: drift 8s ease-in-out infinite alternate; pointer-events: none; }
  .hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 38%, rgba(255, 255, 255, 0.18) 50%, transparent 62%); transform: translateX(-130%); animation: shine 1.2s 300ms var(--ease-out) 1 forwards; pointer-events: none; }
  .hero .bar { position: absolute; left: 0; top: 0; height: 3px; width: 100%; background: var(--c); transform-origin: left; transform: scaleX(0); animation: bar 700ms 100ms var(--ease-out) forwards; z-index: 2; }
  .visit h3 { font: 800 26px/1.1 var(--display); margin: 2px 0 10px; animation: rise 500ms 140ms var(--ease-out) both; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips span { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); animation: chip 400ms var(--ease-out) both; animation-delay: calc(280ms + var(--k, 0) * 70ms); }
  @keyframes drift { from { transform: translate(-6%, -4%) scale(1); } to { transform: translate(10%, 8%) scale(1.15); } }
  @keyframes shine { to { transform: translateX(130%); } }
  @keyframes bar { to { transform: scaleX(1); } }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); filter: blur(4px); } }
  @keyframes chip { from { opacity: 0; transform: scale(0.8) translateY(4px); } }
  @media (prefers-reduced-motion: reduce) { .hero::before, .hero::after, .hero .bar, .visit h3, .chips span { animation: none; } .hero .bar { transform: none; } .hero::after { display: none; } }
  .figs { display: flex; gap: 10px; margin: 0 0 10px; }
  .figs > div { flex: 1; background: var(--raised); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }
  .figs > div.gold { border-color: var(--amber); }
  .figs > div.gold dd { color: var(--amber); }
  .figs dt { font-size: 11px; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; }
  .figs dd { margin: 4px 0 0; font: 700 20px/1 var(--display); font-variant-numeric: tabular-nums; }
  .figs small { font: 500 12px/1 var(--body); color: var(--muted); margin-left: 3px; }
  .vs { margin: 0 0 12px; font-size: 13px; color: var(--muted); }
  .vs b { color: var(--text); }
  .exs { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .exs li { display: grid; gap: 8px; font-size: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 12px; }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .en { font-weight: 600; }
  .pr { font: 700 10.5px/1 var(--body); color: #1a1406; background: var(--amber); border-radius: 5px; padding: 3px 6px; margin-left: 8px; vertical-align: 1px; }
  .chg { font-size: 12px; font-weight: 700; white-space: nowrap; color: var(--muted); }
  .chg.up { color: var(--green); }
  .chg.down { color: #ff6b61; }
  .ss { display: flex; flex-wrap: wrap; gap: 6px; font-variant-numeric: tabular-nums; }
  .ss span { font-size: 12.5px; font-weight: 600; padding: 5px 9px; border-radius: 9px; background: var(--raised); border: 1px solid var(--line); color: var(--muted); }
  .ss span.best { color: var(--text); border-color: var(--ring); }
</style>
