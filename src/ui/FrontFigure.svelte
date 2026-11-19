<script lang="ts">
  import { onDestroy } from 'svelte';
  import { timeline } from '../lib/rig';
  import { fpose, SHOULDER, VIEW, type FrontId } from '../lib/frontRig';
  import { contour, perp, boneLens, lensPath, type V } from '../lib/shapes';
  import type { MuscleId } from '../lib/muscles';

  let {
    anim, muscles, mode = 'play', speed = 1, fixedP, look = 'soft', vb,
  }: {
    anim: FrontId; muscles: { main: MuscleId[]; also: MuscleId[] }; mode?: 'play' | 'start' | 'finish'; speed?: number; fixedP?: number;
    look?: 'soft' | 'dark'; vb?: string;
  } = $props();

  let t = $state(0);
  let raf = 0;
  let last = 0;
  function loop(now: number) {
    if (last) t += (now - last) * speed;
    last = now;
    raf = requestAnimationFrame(loop);
  }
  $effect(() => {
    cancelAnimationFrame(raf);
    last = 0;
    if (mode === 'play' && fixedP === undefined) raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
  onDestroy(() => cancelAnimationFrame(raf));

  const tl = $derived(timeline(t, anim === 'squat'));
  const p = $derived(fixedP ?? (mode === 'start' ? 0 : mode === 'finish' ? 1 : tl.p));
  const po = $derived(fpose(anim, p));
  const S = $derived<V>({ x: SHOULDER.x, y: SHOULDER.y + po.dy });
  const mir = (v: V): V => ({ x: 200 - v.x, y: v.y });

  const tone = (...ids: MuscleId[]) => (ids.some((i) => muscles.main.includes(i)) ? 'main' : ids.some((i) => muscles.also.includes(i)) ? 'also' : '');
  const towardCentre = (a: V, b: V): V => {
    const n = perp(a, b);
    return n.x * (100 - (a.x + b.x) / 2) >= 0 ? n : { x: -n.x, y: -n.y };
  };
  const outward = (a: V, b: V): V => {
    const n = towardCentre(a, b);
    return { x: -n.x, y: -n.y };
  };

  type P = [number, number, number][];
  const ARM: P = [[0, 8, 8], [0.3, 8.4, 8], [0.7, 6.4, 6], [1, 5, 4.8]];
  const FORE: P = [[0, 5.6, 5.4], [0.25, 6.2, 5.8], [0.7, 4.2, 4], [1, 3.2, 3]];
  const THIGH: P = [[0, 11, 11], [0.3, 12.5, 10], [0.65, 9.6, 7.4], [1, 6.2, 6]];
  const SHIN: P = [[0, 6.4, 6], [0.3, 7.4, 6], [0.7, 5, 4.2], [1, 3.6, 3.4]];
  /** A narrow band along the inner edge of a shape, drawn soft so the body has volume. */
  const shade = (a: V, b: V, prof: P) => contour(a, b, towardCentre(a, b), prof.map(([t, w]) => [t, w * 0.9, -w * 0.3] as [number, number, number]));

  const g = $derived({
    arm: contour(S, po.elbow, perp(S, po.elbow), ARM),
    fore: contour(po.elbow, po.hand, perp(po.elbow, po.hand), FORE),
    thigh: contour(po.hip, po.knee, outward(po.hip, po.knee), THIGH),
    shin: contour(po.knee, po.ankle, outward(po.knee, po.ankle), SHIN),
    armS: shade(S, po.elbow, ARM),
    foreS: shade(po.elbow, po.hand, FORE),
    thighS: shade(po.hip, po.knee, THIGH),
    shinS: shade(po.knee, po.ankle, SHIN),
    delt: lensPath(S.x + (po.elbow.x - S.x) * 0.1, S.y + (po.elbow.y - S.y) * 0.1, 14, 9.6, (Math.atan2(po.elbow.y - S.y, po.elbow.x - S.x) * 180) / Math.PI),
    biceps: boneLens(S, po.elbow, 0.14, 0.88, 6.2),
    triceps: boneLens(S, po.elbow, 0.14, 0.88, 5.6, 2.6),
    forearms: boneLens(po.elbow, po.hand, 0.08, 0.92, 4.6),
    quads: boneLens(po.hip, po.knee, 0.08, 0.94, 10),
    calves: boneLens(po.knee, po.ankle, 0.08, 0.74, 6.2),
  });
  // the V-shaped trunk (one half; the other is its mirror), and the muscles drawn on it
  const TRUNK = 'M 100 58 L 136 64 L 156 72 L 153 104 L 138 148 L 142 188 L 100 194 Z';
  const MUS: [string, MuscleId[], string][] = [
    ['traps', ['traps'], 'M 100 56 L 112 58 L 130 66 L 136 72 L 114 74 L 100 66 Z'],
    ['lats', ['lats'], 'M 126 96 L 141 100 L 146 118 L 138 146 L 128 148 L 130 118 Z'],
    ['obliques', ['obliques'], 'M 118 110 L 131 104 L 136 120 L 134 150 L 124 168 L 117 172 Z'],
    ['abs1', ['abs'], 'M 100 109 L 115 109 L 115 121 L 100 121 Z'],
    ['abs2', ['abs'], 'M 100 123 L 115 123 L 114.5 135 L 100 135 Z'],
    ['abs3', ['abs'], 'M 100 137 L 114 137 L 113.5 149 L 100 149 Z'],
    ['abs4', ['abs'], 'M 100 151 L 113 151 L 112.5 163 L 100 163 Z'],
    ['chest', ['chest'], 'M 100 76 L 112 72 L 134 74 L 142 83 L 139 95 L 130 104 L 116 107 L 108 105 L 100 101 Z'],
  ];
</script>

{#snippet lit(d: string, tn: string)}
  {#if tn}
    {#if look === 'dark' && tn === 'main'}<path {d} class="bloom" filter="url(#fblur)" style:opacity={0.3 + 0.5 * po.glow} />{/if}
    <path {d} class="hl {tn}" filter="url(#fsoft)" style:opacity={tn === 'main' ? 0.5 + 0.5 * po.glow : 0.65} />
    <path {d} class="hlr {tn}" style:opacity={0.35 + 0.4 * po.glow} />
  {/if}
{/snippet}

{#snippet torsoHalf()}
  <path d={TRUNK} class="skin" />
  <path d="M 104 70 L 136 70 L 150 78 L 146 100 L 130 134 L 112 150 L 104 150 Z" class="shade" filter="url(#fsoft)" />
  {#each MUS as m}
    {#if tone(...m[1])}{@render lit(m[2], tone(...m[1]))}{:else if m[0].startsWith('abs') || m[0] === 'chest'}<path d={m[2]} class="seam" />{/if}
  {/each}
{/snippet}

{#snippet legHalf()}
  <path d={g.thigh} class="skin" /><path d={g.thighS} class="shade" filter="url(#fsoft)" />
  <path d={g.shin} class="skin" /><path d={g.shinS} class="shade" filter="url(#fsoft)" />
  <ellipse cx={po.ankle.x + 5} cy={po.ankle.y + 6} rx="12" ry="5.4" class="skin" />
  {@render lit(g.quads, tone('quads'))}
  {@render lit(g.calves, tone('calves'))}
{/snippet}

{#snippet armHalf()}
  <path d={g.arm} class="skin" /><path d={g.armS} class="shade" filter="url(#fsoft)" />
  <path d={g.fore} class="skin" /><path d={g.foreS} class="shade" filter="url(#fsoft)" />
  {@render lit(g.biceps, tone('biceps'))}
  {@render lit(g.triceps, tone('triceps'))}
  {@render lit(g.forearms, tone('forearms'))}
  <path d={g.delt} class="skin" />
  {@render lit(g.delt, tone('front-delts', 'side-delts', 'rear-delts'))}
  <ellipse cx={po.hand.x} cy={po.hand.y} rx="5" ry="5.6" class="skin" />
{/snippet}

{#snippet db(v: V)}
  <g class="gearf"><rect x={v.x - 11} y={v.y - 2} width="22" height="4" rx="2" /><rect x={v.x - 14} y={v.y - 7} width="6" height="14" rx="2.5" /><rect x={v.x + 8} y={v.y - 7} width="6" height="14" rx="2.5" /></g>
{/snippet}

<svg viewBox={vb ?? VIEW[anim]} role="img" aria-label="Animated figure, front view" class="ff {look}">
  <defs>
    <filter id="fblur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3" /></filter>
    <filter id="fsoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1" /></filter>
  </defs>
  <rect x="-200" y="-120" width="640" height="560" class="bgf" />
  <ellipse cx="100" cy="372" rx="70" ry="6" fill="#000" opacity="0.35" />
  {#if anim === 'pulldown' || anim === 'pushdown'}
    <line x1="100" y1="-60" x2="100" y2={po.hand.y} class="cablef" />
  {/if}

  <g>{@render legHalf()}</g>
  <g transform="translate(200 0) scale(-1 1)">{@render legHalf()}</g>

  <g transform="translate(0 {po.dy})">
    <rect x="92" y="44" width="16" height="20" rx="6" class="skin" />
    <ellipse cx="100" cy="26" rx="13.5" ry="18.5" class="skin" /><ellipse cx="95" cy="21" rx="5" ry="9" class="shade" filter="url(#fsoft)" />
    <g>{@render torsoHalf()}</g>
    <g transform="translate(200 0) scale(-1 1)">{@render torsoHalf()}</g>
    <path d="M 62 176 L 138 176 L 146 204 L 142 226 L 104 232 L 100 218 L 96 232 L 58 226 L 54 204 Z" class="shorts" />
    <path d="M 62 176 L 138 176" class="band" />
  </g>

  <g>{@render armHalf()}</g>
  <g transform="translate(200 0) scale(-1 1)">{@render armHalf()}</g>

  {#if po.prop === 'dumbbells'}
    {@render db(po.hand)}{@render db(mir(po.hand))}
  {:else if po.prop === 'bar'}
    <line x1={po.hand.x + 14} y1={po.hand.y} x2={200 - po.hand.x - 14} y2={po.hand.y} class="barf" />
  {:else if po.prop === 'one' || po.prop === 'goblet'}
    {@render db({ x: 100, y: po.hand.y })}
  {/if}
</svg>

<style>
  .ff { width: 100%; height: auto; display: block; border-radius: 14px; }
  .bgf { fill: #1a1f2a; } .dark .bgf { fill: #0d1017; }
  .skin { stroke: none; fill: #c9d0de; } .dark .skin { fill: #363d4d; }
  .shade { fill: #ffffff; opacity: 0.5; stroke: none; } .dark .shade { fill: #9fb4de; opacity: 0.4; }
  .seam { fill: none; stroke: #6d7689; stroke-width: 0.8; stroke-linejoin: round; } .dark .seam { stroke: #1f2430; }
  .hl.main { fill: #ff2f26; } .hl.also { fill: #ff9d6e; }
  .hlr { fill: none; stroke-width: 0.9; stroke-linejoin: round; } .hlr.main { stroke: #ffb0a6; } .hlr.also { stroke: #ffd2b0; }
  .bloom { fill: #ff2d24; }
  .shorts { fill: #2a303e; stroke: none; } .dark .shorts { fill: #171b25; }
  .band { stroke: #3d4556; stroke-width: 3; } .dark .band { stroke: #2b3242; }
  .gearf rect { fill: #20252d; stroke: #596273; stroke-width: 0.8; }
  .barf { stroke: #8a93a6; stroke-width: 3; stroke-linecap: round; }
  .cablef { stroke: #6a7490; stroke-width: 1.3; }
</style>
