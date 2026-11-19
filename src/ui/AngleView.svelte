<script lang="ts">
  export type Kind = 'press-top' | 'squat-front' | 'pulldown-back' | 'press-front' | 'curl-front' | 'pushdown-front' | 'lateral-front' | 'fly-top' | 'abduct-front';
  import { onDestroy } from 'svelte';
  // A second camera for the cues a side view cannot show: the elbow angle in a bench press (from above)
  // and the knee line in a squat (from the front). Dark mannequin style, same colours as the side view.
  import { smoothClosed, type Pt as P2 } from '../lib/smoothPath';
  let { kind, bad = false, mode = 'play' }: { kind: Kind; bad?: boolean; mode?: 'play' | 'start' | 'finish' } = $props();

  let t = $state(0);
  let raf = 0;
  let last = 0;
  function loop(now: number) {
    if (last) t += now - last;
    last = now;
    raf = requestAnimationFrame(loop);
  }
  $effect(() => {
    cancelAnimationFrame(raf);
    last = 0;
    if (mode === 'play') raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });
  onDestroy(() => cancelAnimationFrame(raf));
  const p = $derived(mode === 'start' ? 0 : mode === 'finish' ? 1 : 0.5 - 0.5 * Math.cos((t / 3200) * Math.PI * 2));

  const GOOD = '#4cd98a';
  const BAD = '#ff6b61';
  const col = $derived(bad ? BAD : GOOD);

  // ---- bench press from above: lying with the head at the top, arms lowering toward the feet ----
  const deg = $derived(bad ? 85 : 45);
  const L = 46;
  const SH = { l: { x: 74, y: 70 }, r: { x: 126, y: 70 } };
  const reach = $derived(L * (0.14 + 0.86 * p));
  const ex = $derived(Math.sin((deg * Math.PI) / 180) * reach);
  const ey = $derived(Math.cos((deg * Math.PI) / 180) * reach);
  const elL = $derived({ x: SH.l.x - ex, y: SH.l.y + ey });
  const elR = $derived({ x: SH.r.x + ex, y: SH.r.y + ey });
  const arc = (c: { x: number; y: number }, sign: 1 | -1, r: number) => {
    const a = (deg * Math.PI) / 180;
    return `M ${c.x} ${c.y + r} A ${r} ${r} 0 0 ${sign === 1 ? 0 : 1} ${c.x + sign * Math.sin(a) * r} ${c.y + Math.cos(a) * r}`;
  };

  // ---- squat from the front: knees should follow the toes ----
  const FOOT = { l: { x: 66, y: 178 }, r: { x: 134, y: 178 } };
  const hipY = $derived(52 + 40 * p);
  const kneeX = $derived(bad ? 76 + 15 * p : 74 - 10 * p); // caving in toward the middle vs. tracking over the toes
  const kneeY = $derived(116 + 4 * p);
  const kl = $derived({ x: kneeX, y: kneeY });
  const kr = $derived({ x: 200 - kneeX, y: kneeY });
  const hipL = $derived({ x: 84, y: hipY });
  const hipR = $derived({ x: 116, y: hipY });
  const gap = $derived(Math.round(200 - 2 * kneeX));

  // ---- the four arm exercises, seen from the front (or behind for the pulldown): left arm, mirrored for the right ----
  type Pt = { x: number; y: number };
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const mix = (a: Pt, b: Pt, k: number): Pt => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
  // [shoulder, elbow, hand] at the start (p = 0) and the end (p = 1) of the rep, for the ideal and the mistake.
  const ARM: Record<string, { good: [Pt, Pt, Pt][]; bad: [Pt, Pt, Pt][]; text: [string, string]; glow: 'shoulder' | 'upper' | 'back' }> = {
    'pulldown-back': {
      good: [[{ x: 75, y: 68 }, { x: 48, y: 42 }, { x: 40, y: 12 }], [{ x: 75, y: 68 }, { x: 56, y: 96 }, { x: 52, y: 70 }]],
      bad: [[{ x: 75, y: 68 }, { x: 48, y: 42 }, { x: 40, y: 12 }], [{ x: 75, y: 54 }, { x: 52, y: 90 }, { x: 52, y: 62 }]],
      text: ['Shoulders down, elbows drive down', 'Shoulders shrug up to the ears'],
      glow: 'back',
    },
    'press-front': {
      good: [[{ x: 75, y: 68 }, { x: 52, y: 84 }, { x: 52, y: 52 }], [{ x: 75, y: 68 }, { x: 74, y: 36 }, { x: 74, y: 6 }]],
      bad: [[{ x: 75, y: 68 }, { x: 52, y: 84 }, { x: 52, y: 52 }], [{ x: 75, y: 68 }, { x: 54, y: 40 }, { x: 34, y: 16 }]],
      text: ['Palms angled in, forearms vertical', 'Forearms tilt out, wrists drift wide'],
      glow: 'shoulder',
    },
    'curl-front': {
      good: [[{ x: 75, y: 68 }, { x: 68, y: 112 }, { x: 68, y: 156 }], [{ x: 75, y: 68 }, { x: 68, y: 112 }, { x: 80, y: 74 }]],
      bad: [[{ x: 75, y: 68 }, { x: 68, y: 112 }, { x: 68, y: 156 }], [{ x: 75, y: 68 }, { x: 52, y: 100 }, { x: 62, y: 62 }]],
      text: ['Elbow stays pinned at your side', 'Elbow flares out and swings up'],
      glow: 'upper',
    },
    'lateral-front': {
      good: [[{ x: 75, y: 68 }, { x: 66, y: 110 }, { x: 64, y: 150 }], [{ x: 75, y: 68 }, { x: 46, y: 72 }, { x: 22, y: 80 }]],
      bad: [[{ x: 75, y: 68 }, { x: 66, y: 110 }, { x: 64, y: 150 }], [{ x: 75, y: 56 }, { x: 46, y: 44 }, { x: 28, y: 22 }]],
      text: ['Lift to shoulder height, elbows lead', 'Shrugging, swinging too high'],
      glow: 'shoulder',
    },
    'pushdown-front': {
      good: [[{ x: 75, y: 68 }, { x: 68, y: 112 }, { x: 84, y: 98 }], [{ x: 75, y: 68 }, { x: 68, y: 112 }, { x: 68, y: 156 }]],
      bad: [[{ x: 75, y: 68 }, { x: 56, y: 104 }, { x: 74, y: 94 }], [{ x: 75, y: 68 }, { x: 46, y: 108 }, { x: 56, y: 150 }]],
      text: ['Elbows pinned, only the forearm moves', 'Elbows flare out as you push'],
      glow: 'upper',
    },
  };
  const armCfg = $derived(ARM[kind]);
  const arm = $derived.by(() => {
    if (!armCfg) return null;
    const [a, b] = bad ? armCfg.bad : armCfg.good;
    const sh = mix(a[0], b[0], p), el = mix(a[1], b[1], p), ha = mix(a[2], b[2], p);
    return { sh, el, ha };
  });
  const sm = (pts: P2[], k = 0.8) => smoothClosed(pts, k);
  // torso seen from the front or behind, shoulders at y 62
  const TORSO = sm([[91, 50], [109, 50], [127, 60], [130, 90], [123, 140], [121, 158], [79, 158], [77, 140], [70, 90], [73, 60]], 0.9);
  const SHORTS = sm([[78, 148], [122, 148], [124, 176], [104, 180], [100, 168], [96, 180], [76, 176]], 0.5);
  const sqTorso = $derived(sm([[90, hipY - 62], [110, hipY - 62], [128, hipY - 52], [128, hipY - 20], [118, hipY + 4], [82, hipY + 4], [72, hipY - 20], [72, hipY - 52]], 0.9));
  const sqShorts = $derived(sm([[80, hipY - 8], [120, hipY - 8], [124, hipY + 22], [106, hipY + 26], [100, hipY + 12], [94, hipY + 26], [76, hipY + 22]], 0.5));
  const mirror = (q: Pt): Pt => ({ x: 200 - q.x, y: q.y });
</script>

<svg viewBox={kind === 'squat-front' ? '0 -36 200 236' : '0 0 200 200'} role="img" aria-label={kind === 'press-top' ? 'Bench press arms seen from above' : kind === 'squat-front' ? 'Squat seen from the front' : 'Exercise seen from another angle'}>
  <defs>
    <filter id="ab" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
    <radialGradient id="gT" cx="38%" cy="22%" r="85%"><stop offset="0" stop-color="#465069" /><stop offset="1" stop-color="#242a3a" /></radialGradient>
    <radialGradient id="gH" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#586482" /><stop offset="1" stop-color="#2c3346" /></radialGradient>
    <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#171b24" /><stop offset="1" stop-color="#0e1116" /></linearGradient>
  </defs>
  <rect x="-20" y="-60" width="240" height="300" fill="#0e1116" />

  {#snippet limb(x1: number, y1: number, x2: number, y2: number, w: number, base: string)}
    {@const dx = x2 - x1}
    {@const dy = y2 - y1}
    {@const L = Math.hypot(dx, dy) || 1}
    {@const sgn = -dy / L > 0 || (dy === 0 && dx > 0) ? 1 : -1}
    {@const ox = (-dy / L) * sgn * w * 0.2}
    {@const oy = (dx / L) * sgn * w * 0.2}
    <line {x1} {y1} {x2} {y2} stroke="#12161e" stroke-width={w + 2.2} stroke-linecap="round" />
    <line {x1} {y1} {x2} {y2} stroke={base} stroke-width={w} stroke-linecap="round" />
    <line x1={x1 + ox} y1={y1 + oy} x2={x2 + ox} y2={y2 + oy} stroke="#9fb4de" stroke-width={w * 0.24} stroke-linecap="round" opacity="0.28" />
  {/snippet}

  {#snippet dumbbell(x: number, y: number, vertical: boolean)}
    {#if vertical}
      <rect x={x - 2} y={y - 12} width="4" height="24" rx="2" fill="#7d869a" />
      <rect x={x - 9} y={y - 15} width="18" height="8" rx="3" fill="#0a0c10" stroke="#5b6680" stroke-width="1" />
      <rect x={x - 9} y={y + 7} width="18" height="8" rx="3" fill="#0a0c10" stroke="#5b6680" stroke-width="1" />
    {:else}
      <rect x={x - 12} y={y - 2} width="24" height="4" rx="2" fill="#7d869a" />
      <rect x={x - 15} y={y - 9} width="8" height="18" rx="3" fill="#0a0c10" stroke="#5b6680" stroke-width="1" />
      <rect x={x + 7} y={y - 9} width="8" height="18" rx="3" fill="#0a0c10" stroke="#5b6680" stroke-width="1" />
    {/if}
  {/snippet}

  {#snippet head(cx: number, cy: number, back: boolean)}
    <rect x={cx - 8} y={cy + 10} width="16" height="18" rx="7" fill="#394158" />
    <ellipse cx={cx - 13} cy={cy + 1} rx="2.6" ry="4" fill="#3d4660" /><ellipse cx={cx + 13} cy={cy + 1} rx="2.6" ry="4" fill="#3d4660" />
    <ellipse {cx} {cy} rx="12.5" ry="15" fill="url(#gH)" stroke="#12161e" stroke-width="1" />
    {#if back}
      <path d="M {cx - 12.5} {cy + 1} C {cx - 14} {cy - 18} {cx + 14} {cy - 18} {cx + 12.5} {cy + 1} C {cx + 12} {cy + 10} {cx + 6} {cy + 13} {cx} {cy + 13} C {cx - 6} {cy + 13} {cx - 12} {cy + 10} {cx - 12.5} {cy + 1} Z" fill="#161b26" />
    {:else}
      <path d="M {cx - 12.5} {cy - 3} C {cx - 14} {cy - 20} {cx + 14} {cy - 20} {cx + 12.5} {cy - 3} C {cx + 8} {cy - 10} {cx - 8} {cy - 10} {cx - 12.5} {cy - 3} Z" fill="#161b26" />
      <ellipse cx={cx - 4.5} cy={cy + 1} rx="1.5" ry="1.1" fill="#12161e" /><ellipse cx={cx + 4.5} cy={cy + 1} rx="1.5" ry="1.1" fill="#12161e" />
    {/if}
  {/snippet}

  {#if kind === 'press-top'}
    <rect x="52" y="6" width="96" height="196" rx="16" fill="url(#gF)" stroke="#1c212c" />
    <!-- legs run off the bottom, head at the top -->
    {@render limb(89, 150, 84, 210, 16, '#3a435a')}
    {@render limb(111, 150, 116, 210, 16, '#3a435a')}
    <path d={sm([[72, 54], [128, 54], [132, 84], [122, 136], [114, 160], [86, 160], [78, 136], [68, 84]], 0.9)} fill="url(#gT)" stroke="#12161e" stroke-width="1" />
    <path d={sm([[78, 150], [122, 150], [126, 170], [74, 170]], 0.7)} fill="#171b25" />
    <ellipse cx="100" cy="32" rx="12.5" ry="15" fill="url(#gH)" stroke="#12161e" /><path d="M 87.5 30 C 86 12 114 12 112.5 30 C 112 40 106 44 100 44 C 94 44 88 40 87.5 30 Z" fill="#161b26" />
    <ellipse cx="100" cy="48" rx="8" ry="6" fill="#394158" />
    <ellipse cx="100" cy={80 + 4 * p} rx="28" ry="14" fill="#ff3b30" opacity={0.28 + 0.62 * p} filter="url(#ab)" />
    <line x1="100" y1="62" x2="100" y2="130" stroke="#12161e" stroke-width="1" opacity="0.5" />
    <!-- shoulders -->
    <circle cx={SH.l.x} cy={SH.l.y} r="7.5" fill="#4a5470" stroke="#12161e" /><circle cx={SH.r.x} cy={SH.r.y} r="7.5" fill="#4a5470" stroke="#12161e" />
    <!-- ideal 45° lines -->
    <line x1={SH.l.x} y1={SH.l.y} x2={SH.l.x - 64} y2={SH.l.y + 64} stroke={GOOD} stroke-width="1.4" stroke-dasharray="4 4" opacity="0.75" />
    <line x1={SH.r.x} y1={SH.r.y} x2={SH.r.x + 64} y2={SH.r.y + 64} stroke={GOOD} stroke-width="1.4" stroke-dasharray="4 4" opacity="0.75" />
    <line x1={SH.l.x} y1={SH.l.y} x2={SH.l.x} y2={SH.l.y + 60} stroke="#8c94a3" stroke-width="1" stroke-dasharray="2 4" opacity="0.7" />
    <line x1={SH.r.x} y1={SH.r.y} x2={SH.r.x} y2={SH.r.y + 60} stroke="#8c94a3" stroke-width="1" stroke-dasharray="2 4" opacity="0.7" />
    <!-- bar over the hands, which sit above the elbows -->
    <line x1={elL.x - 22} y1={elL.y} x2={elR.x + 22} y2={elR.y} stroke="#8b94a8" stroke-width="3.6" stroke-linecap="round" />
    {@render limb(SH.l.x, SH.l.y, elL.x, elL.y, 10, '#4f5a79')}
    {@render limb(SH.r.x, SH.r.y, elR.x, elR.y, 10, '#4f5a79')}
    <line x1={SH.l.x} y1={SH.l.y} x2={elL.x} y2={elL.y} stroke="#ff9d6e" stroke-width="3.6" stroke-linecap="round" opacity="0.8" />
    <line x1={SH.r.x} y1={SH.r.y} x2={elR.x} y2={elR.y} stroke="#ff9d6e" stroke-width="3.6" stroke-linecap="round" opacity="0.8" />
    <rect x={elL.x - 28} y={elL.y - 10} width="7" height="20" rx="3" fill="#0a0c10" stroke="#5b6680" /><rect x={elR.x + 21} y={elR.y - 10} width="7" height="20" rx="3" fill="#0a0c10" stroke="#5b6680" />
    <circle cx={elL.x} cy={elL.y} r="6.5" fill="#c0c8da" stroke={col} stroke-width="2" /><circle cx={elR.x} cy={elR.y} r="6.5" fill="#c0c8da" stroke={col} stroke-width="2" />
    <path d={arc(SH.l, -1, 30)} fill="none" stroke={col} stroke-width="2.5" /><path d={arc(SH.r, 1, 30)} fill="none" stroke={col} stroke-width="2.5" />
    <text x="10" y="192" fill={col} font-size="22" font-weight="800" font-family="system-ui">{deg}°</text>
    <text x="190" y="22" fill="#8c94a3" font-size="9.5" text-anchor="end" font-family="system-ui">from above</text>
    <text x="190" y="34" fill={GOOD} font-size="9.5" text-anchor="end" font-family="system-ui">dashed = ideal 45°</text>
  {:else if kind === 'fly-top'}
    <rect x="52" y="6" width="96" height="196" rx="16" fill="url(#gF)" stroke="#1c212c" />
    {@render limb(89, 150, 84, 210, 16, '#3a435a')}
    {@render limb(111, 150, 116, 210, 16, '#3a435a')}
    <path d={sm([[72, 54], [128, 54], [132, 84], [122, 136], [114, 160], [86, 160], [78, 136], [68, 84]], 0.9)} fill="url(#gT)" stroke="#12161e" stroke-width="1" />
    <ellipse cx="100" cy="32" rx="12.5" ry="15" fill="url(#gH)" stroke="#12161e" /><path d="M 87.5 30 C 86 12 114 12 112.5 30 C 112 40 106 44 100 44 C 94 44 88 40 87.5 30 Z" fill="#161b26" />
    <ellipse cx="100" cy={80 + 4 * p} rx="28" ry="14" fill="#ff3b30" opacity={0.25 + 0.65 * p} filter="url(#ab)" />
    <circle cx={SH.l.x} cy={SH.l.y} r="7.5" fill="#4a5470" stroke="#12161e" /><circle cx={SH.r.x} cy={SH.r.y} r="7.5" fill="#4a5470" stroke="#12161e" />
    <line x1={SH.l.x - 4} y1="104" x2={SH.l.x - 62} y2="104" stroke={GOOD} stroke-width="1.4" stroke-dasharray="4 4" opacity="0.75" />
    <line x1={SH.r.x + 4} y1="104" x2={SH.r.x + 62} y2="104" stroke={GOOD} stroke-width="1.4" stroke-dasharray="4 4" opacity="0.75" />
    {@const eo = bad ? 40 * (1 - p) + 8 : 30 * (1 - p) + 14}
    {@const ho = bad ? 66 * (1 - p) + 4 : 56 * (1 - p) + 6}
    {@const ey = bad ? 74 + 28 * (1 - p) : 86 - 6 * p}
    {@const hy = bad ? 80 + 30 * (1 - p) : 98 - 4 * p}
    {#each [-1, 1] as sd}
      {@const sx = sd < 0 ? SH.l.x : SH.r.x}
      {@render limb(sx, SH.l.y, 100 + sd * eo, ey, 10, '#4f5a79')}
      {@render limb(100 + sd * eo, ey, 100 + sd * ho, hy, 9, '#414b68')}
      <line x1={sx} y1={SH.l.y} x2={100 + sd * eo} y2={ey} stroke="#ff9d6e" stroke-width="3.6" stroke-linecap="round" opacity="0.75" />
      <circle cx={100 + sd * eo} cy={ey} r="5.4" fill="#c0c8da" stroke={col} stroke-width="2" />
      <circle cx={100 + sd * ho} cy={hy} r="6.5" fill="#0a0c10" stroke="#5b6680" />
    {/each}
    <text x="10" y="192" fill={col} font-size="10" font-weight="700" font-family="system-ui">{bad ? 'Arms straight, too deep' : 'Soft elbow, sweep in a wide arc'}</text>
    <text x="190" y="22" fill="#8c94a3" font-size="9.5" text-anchor="end" font-family="system-ui">from above</text>
    <text x="190" y="34" fill={GOOD} font-size="9.5" text-anchor="end" font-family="system-ui">dashed = chest line</text>
  {:else if kind === 'abduct-front'}
    <rect x="-20" y="176" width="240" height="40" fill="url(#gF)" />
    {@const sway = bad ? 10 * Math.sin(p * Math.PI) : 0}
    {@const sp = 14 + 26 * p}
    {@render head(100 + sway, 24, false)}
    <path d={sm([[90 + sway, 40], [110 + sway, 40], [128 + sway, 50], [126, 90], [118, 112], [82, 112], [74, 90], [72 + sway, 50]], 0.9)} fill="url(#gT)" stroke="#12161e" stroke-width="1" />
    <rect x="62" y="108" width="76" height="10" rx="5" fill="#171b25" stroke="#272f42" />
    <ellipse cx="100" cy="112" rx={22 + 8 * p} ry="10" fill="#ff3b30" opacity={0.25 + 0.65 * p} filter="url(#ab)" />
    {@render limb(86, 112, 100 - sp - 6, 130, 19, '#4f5a79')}
    {@render limb(114, 112, 100 + sp + 6, 130, 19, '#4f5a79')}
    {@render limb(100 - sp - 6, 130, 96 - sp - 6, 172, 13, '#414b68')}
    {@render limb(100 + sp + 6, 130, 104 + sp + 6, 172, 13, '#414b68')}
    <rect x={100 - sp - 22} y="116" width="9" height="26" rx="4" fill="#7d869a" /><rect x={100 + sp + 13} y="116" width="9" height="26" rx="4" fill="#7d869a" />
    <circle cx={100 - sp - 6} cy="130" r="8" fill="#c0c8da" stroke={col} stroke-width="2.2" /><circle cx={100 + sp + 6} cy="130" r="8" fill="#c0c8da" stroke={col} stroke-width="2.2" />
    <path d="M {96 - sp - 6 - 15} 178 C {96 - sp - 6 - 15} 168 {96 - sp - 6 + 8} 168 {96 - sp - 6 + 8} 178 Z" fill="#d6dbe8" /><path d="M {104 + sp + 6 - 8} 178 C {104 + sp + 6 - 8} 168 {104 + sp + 6 + 15} 168 {104 + sp + 6 + 15} 178 Z" fill="#d6dbe8" />
    <text x="10" y="196" fill={col} font-size="10.5" font-weight="700" font-family="system-ui">{bad ? 'Body rocks to swing the weight' : 'Back still, knees press apart'}</text>
    <text x="190" y="12" fill="#8c94a3" font-size="9.5" text-anchor="end" font-family="system-ui">from the front</text>
  {:else if arm}
    {@render limb(88, 148, 86, 204, 17, '#3a435a')}
    {@render limb(112, 148, 114, 204, 17, '#3a435a')}
    {@render head(100, 28, kind === 'pulldown-back')}
    <path d={TORSO} fill="url(#gT)" stroke="#12161e" stroke-width="1" />
    <path d={SHORTS} fill="#171b25" stroke="#272f42" stroke-width="0.8" />
    {#if kind === 'pulldown-back'}
      <g opacity={0.25 + 0.75 * p} filter="url(#ab)">
        <path d="M 86 74 Q 70 102 80 134 Q 95 114 98 80 Z" fill="#ff3b30" />
        <path d="M 114 74 Q 130 102 120 134 Q 105 114 102 80 Z" fill="#ff3b30" />
      </g>
      <path d="M 100 56 L 100 150" stroke="#12161e" stroke-width="1.2" opacity="0.7" />
      <path d="M 78 72 Q 90 82 98 76 M 122 72 Q 110 82 102 76" stroke="#12161e" stroke-width="1" fill="none" opacity="0.6" />
      <line x1="40" y1="68" x2="160" y2="68" stroke={GOOD} stroke-width="1.3" stroke-dasharray="4 4" opacity="0.75" />
    {:else}
      <path d="M 100 70 L 100 148 M 76 82 Q 100 96 124 82 M 86 112 H 114 M 86 126 H 114" stroke="#12161e" stroke-width="1" fill="none" opacity="0.5" />
    {/if}
    {#if kind === 'lateral-front'}
      <line x1="20" y1="68" x2="180" y2="68" stroke={GOOD} stroke-width="1.3" stroke-dasharray="4 4" opacity="0.75" />
      <g opacity={0.25 + 0.75 * p} filter="url(#ab)"><circle cx={arm.sh.x - 4} cy={arm.sh.y + 2} r="11" fill="#ff3b30" /><circle cx={200 - arm.sh.x + 4} cy={arm.sh.y + 2} r="11" fill="#ff3b30" /></g>
    {/if}
    {#if kind === 'press-front'}
      <g opacity={0.25 + 0.75 * p} filter="url(#ab)"><circle cx={arm.sh.x} cy={arm.sh.y + 2} r="12" fill="#ff3b30" /><circle cx={200 - arm.sh.x} cy={arm.sh.y + 2} r="12" fill="#ff3b30" /></g>
      <line x1={arm.el.x} y1="4" x2={arm.el.x} y2="110" stroke={GOOD} stroke-width="1.3" stroke-dasharray="4 4" opacity="0.75" />
      <line x1={200 - arm.el.x} y1="4" x2={200 - arm.el.x} y2="110" stroke={GOOD} stroke-width="1.3" stroke-dasharray="4 4" opacity="0.75" />
    {/if}
    {#if kind === 'curl-front' || kind === 'pushdown-front'}
      <line x1="68" y1="70" x2="68" y2="160" stroke={GOOD} stroke-width="1.3" stroke-dasharray="4 4" opacity="0.75" />
      <line x1="132" y1="70" x2="132" y2="160" stroke={GOOD} stroke-width="1.3" stroke-dasharray="4 4" opacity="0.75" />
      <g opacity={0.25 + 0.75 * p} filter="url(#ab)">
        <line x1={arm.sh.x} y1={arm.sh.y + 6} x2={arm.el.x} y2={arm.el.y - 4} stroke="#ff3b30" stroke-width="11" stroke-linecap="round" />
        <line x1={200 - arm.sh.x} y1={arm.sh.y + 6} x2={200 - arm.el.x} y2={arm.el.y - 4} stroke="#ff3b30" stroke-width="11" stroke-linecap="round" />
      </g>
    {/if}
    {#each [false, true] as m}
      {@const sh = m ? mirror(arm.sh) : arm.sh}
      {@const el = m ? mirror(arm.el) : arm.el}
      {@const ha = m ? mirror(arm.ha) : arm.ha}
      <circle cx={sh.x} cy={sh.y} r="8" fill="#4f5a79" stroke="#12161e" />
      {@render limb(sh.x, sh.y, el.x, el.y, 11.5, '#4f5a79')}
      {@render limb(el.x, el.y, ha.x, ha.y, 9, '#414b68')}
      <line x1={sh.x} y1={sh.y} x2={el.x} y2={el.y} stroke="#ff9d6e" stroke-width="3.6" stroke-linecap="round" opacity="0.75" />
      <circle cx={el.x} cy={el.y} r="5.4" fill="#c0c8da" stroke={col} stroke-width="2" />
      {#if kind === 'press-front'}
        <!-- semi-neutral grip seen from the front: turned about 35° from pointing at you, front end outward -->
        {@const dir = m ? -1 : 1}
        <line x1={ha.x + dir * 5} y1={ha.y} x2={ha.x - dir * 5} y2={ha.y} stroke="#7d869a" stroke-width="3" stroke-linecap="round" />
        <rect x={ha.x - dir * 5 - 3} y={ha.y - 7} width="6" height="14" rx="2.4" fill="#0a0c10" stroke="#5b6680" stroke-width="1" />
        <rect x={ha.x + dir * 5 - 3.8} y={ha.y - 8.5} width="7.6" height="17" rx="2.8" fill="#0a0c10" stroke="#5b6680" stroke-width="1" />
      {:else if kind === 'curl-front'}
        {@render dumbbell(ha.x, ha.y, false)}
      {:else}
        <circle cx={ha.x} cy={ha.y} r="5.4" fill="#b4bdd2" stroke="#12161e" />
      {/if}
    {/each}
    {#if kind === 'pulldown-back'}<line x1="22" y1="12" x2="178" y2="12" stroke="#8b94a8" stroke-width="3.4" stroke-linecap="round" />{/if}
    {#if kind === 'pushdown-front'}<line x1="48" y1={arm.ha.y} x2="152" y2={arm.ha.y} stroke="#8b94a8" stroke-width="3.4" stroke-linecap="round" />{/if}
    <text x="10" y="195" fill={col} font-size="9.5" font-weight="700" font-family="system-ui">{bad ? armCfg.text[1] : armCfg.text[0]}</text>
    <text x="190" y="170" fill="#8c94a3" font-size="9" text-anchor="end" font-family="system-ui">{kind === 'pulldown-back' ? 'from behind' : 'from the front'}</text>
    <text x="190" y="181" fill={GOOD} font-size="9" text-anchor="end" font-family="system-ui">dashed = ideal line</text>
  {:else}
    <rect x="-20" y="176" width="240" height="40" fill="url(#gF)" />
    <line x1={FOOT.l.x} y1="178" x2={FOOT.l.x} y2={hipY - 50} stroke={GOOD} stroke-width="1.4" stroke-dasharray="4 4" opacity="0.75" />
    <line x1={FOOT.r.x} y1="178" x2={FOOT.r.x} y2={hipY - 50} stroke={GOOD} stroke-width="1.4" stroke-dasharray="4 4" opacity="0.75" />
    {@render head(100, hipY - 90, false)}
    <path d={sqTorso} fill="url(#gT)" stroke="#12161e" stroke-width="1" />
    <circle cx="74" cy={hipY - 44} r="7.5" fill="#4f5a79" stroke="#12161e" /><circle cx="126" cy={hipY - 44} r="7.5" fill="#4f5a79" stroke="#12161e" />
    {@render limb(74, hipY - 44, 86, hipY - 14, 10, '#4f5a79')}
    {@render limb(126, hipY - 44, 114, hipY - 14, 10, '#4f5a79')}
    {@render dumbbell(100, hipY - 20, true)}
    <!-- thighs glow as they work, then shins and feet -->
    {@render limb(hipL.x, hipL.y, kl.x, kl.y, 19, '#4f5a79')}
    {@render limb(hipR.x, hipR.y, kr.x, kr.y, 19, '#4f5a79')}
    <g opacity={0.25 + 0.75 * p} filter="url(#ab)">
      <line x1={hipL.x} y1={hipL.y} x2={kl.x} y2={kl.y} stroke="#ff3b30" stroke-width="10" stroke-linecap="round" />
      <line x1={hipR.x} y1={hipR.y} x2={kr.x} y2={kr.y} stroke="#ff3b30" stroke-width="13" stroke-linecap="round" />
    </g>
    <path d={sqShorts} fill="#171b25" stroke="#272f42" stroke-width="0.8" />
    {@render limb(kl.x, kl.y, FOOT.l.x, FOOT.l.y - 6, 13, '#414b68')}
    {@render limb(kr.x, kr.y, FOOT.r.x, FOOT.r.y - 6, 13, '#414b68')}
    <path d="M {FOOT.l.x - 17} 178 C {FOOT.l.x - 17} 168 {FOOT.l.x + 9} 168 {FOOT.l.x + 9} 178 Z" fill="#d6dbe8" /><path d="M {FOOT.r.x - 9} 178 C {FOOT.r.x - 9} 168 {FOOT.r.x + 17} 168 {FOOT.r.x + 17} 178 Z" fill="#d6dbe8" />
    <circle cx={kl.x} cy={kl.y} r="9.5" fill="#c0c8da" stroke={col} stroke-width="2.5" />
    <circle cx={kr.x} cy={kr.y} r="9.5" fill="#c0c8da" stroke={col} stroke-width="2.5" />
    {#if bad}<text x="100" y={kl.y - 24} fill={BAD} font-size="10" text-anchor="middle" font-weight="700" font-family="system-ui">knees {gap > 18 ? 'drifting in' : 'caving in'}</text>{/if}
    <text x="10" y="196" fill={col} font-size="11" font-weight="700" font-family="system-ui">{bad ? 'Knees fall inward' : 'Knees track over toes'}</text>
    <text x="190" y="-18" fill="#8c94a3" font-size="9.5" text-anchor="end" font-family="system-ui">from the front</text>
    <text x="190" y="-6" fill={GOOD} font-size="9.5" text-anchor="end" font-family="system-ui">dashed = toe line</text>
  {/if}
</svg>

<style>
  svg { display: block; width: 100%; height: auto; }
</style>
