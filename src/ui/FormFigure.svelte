<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ANIMS, type AnimId, type Callout } from '../lib/formGuides';
  import { sample, regionLine, timeline, FLOOR, type Skeleton, type V } from '../lib/rig';
  import { sideShape, type MuscleId } from '../lib/muscles';
  import { PATTERNS } from '../lib/patterns';
  import Gear from './Gear.svelte';

  let {
    anim,
    callouts = [],
    mode = 'play',
    speed = 1,
    onphase,
    fixedP,
    look = 'mannequin',
    muscles,
    vb,
    defOverride,
  }: {
    anim: AnimId;
    callouts?: Callout[];
    /** play loops the rep; start / finish hold that pose. */
    mode?: 'play' | 'start' | 'finish';
    speed?: number;
    onphase?: (phase: 0 | 1 | 2 | 3) => void;
    /** Pin the pose (for screenshots and tests). */
    fixedP?: number;
    /** The drawing style: soft mannequin, dark anatomy with a strong glow, or a clean outline. */
    look?: 'mannequin' | 'anatomy' | 'outline' | 'muscle' | 'athlete' | 'pictogram' | 'xray' | 'dummy' | 'soft' | 'dark';
    /** For the 'muscle' look: which muscles work (red) and help (orange). */
    muscles?: { main: MuscleId[]; also: MuscleId[] };
    /** Crop the drawing (a viewBox string) so the figure fills the card. */
    vb?: string;
    /** Use this movement instead of the built-in one for `anim` (the "avoid" versions). */
    defOverride?: (typeof ANIMS)[AnimId];
  } = $props();

  const def = $derived(defOverride ?? ANIMS[anim]);
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

  const tl = $derived(timeline(t, !!def.slowForward));
  const p = $derived(fixedP ?? (mode === 'start' ? 0 : mode === 'finish' ? 1 : tl.p));
  const sk: Skeleton = $derived(sample(def, p));
  $effect(() => {
    if (mode === 'play') onphase?.(tl.phase);
    else onphase?.(mode === 'start' ? 0 : 2);
  });

  const joint = (c: Callout) => {
    switch (c.follow) {
      case 'elbow': return sk.elbow;
      case 'hand': return sk.hand;
      case 'knee': return sk.knee;
      case 'ankle': return sk.ankle;
      case 'pelvis': return sk.pelvis;
      default: return sk.shoulder;
    }
  };
  const mainR = $derived(def.regions.filter((r) => !r.also).map((r) => regionLine(sk, r)));
  const alsoR = $derived(def.regions.filter((r) => r.also).map((r) => regionLine(sk, r)));
  const glow = $derived(look === 'anatomy' ? 0.6 + 0.4 * sk.glow : 0.35 + 0.65 * sk.glow);


  // ---- the 'muscle' look: every muscle is its own shape on a dark body, like a muscle map that moves ----
  const neg = (v: V): V => ({ x: -v.x, y: -v.y });
  const mainSet = $derived(new Set((muscles?.main ?? []).map(sideShape)));
  const alsoSet = $derived(new Set((muscles?.also ?? []).map(sideShape)));
  type Shape = { id: string; cx: number; cy: number; rx: number; ry: number; rot: number };
  /** An oval along a bone, from t0 to t1 of its length, pushed `off` toward one side. */
  function along(a: V, b: V, t0: number, t1: number, side: V, off: number, thick: number, id: string): Shape {
    const m = (t0 + t1) / 2;
    return {
      id,
      cx: a.x + (b.x - a.x) * m + side.x * off,
      cy: a.y + (b.y - a.y) * m + side.y * off,
      rx: (Math.hypot(b.x - a.x, b.y - a.y) * (t1 - t0)) / 2,
      ry: thick,
      rot: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    };
  }
  /** A pointed, muscle-belly shape (two curves meeting at the ends) centred on the oval's centre and turned along its bone. */
  function lens(o: Shape): string {
    const c = Math.cos((o.rot * Math.PI) / 180), sn = Math.sin((o.rot * Math.PI) / 180);
    const pt = (x: number, y: number) => `${(o.cx + x * c - y * sn).toFixed(2)} ${(o.cy + x * sn + y * c).toFixed(2)}`;
    const k = o.ry * 1.55;
    return `M ${pt(-o.rx, 0)} Q ${pt(-o.rx * 0.1, -k)} ${pt(o.rx, 0)} Q ${pt(-o.rx * 0.1, k)} ${pt(-o.rx, 0)} Z`;
  }
  /** A tapered limb: wide at `a`, narrow at `b`. */
  function taper(a: V, b: V, ra: number, rb: number): string {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    const f = (x: number) => x.toFixed(2);
    return `M ${f(a.x + nx * ra)} ${f(a.y + ny * ra)} L ${f(b.x + nx * rb)} ${f(b.y + ny * rb)} L ${f(b.x - nx * rb)} ${f(b.y - ny * rb)} L ${f(a.x - nx * ra)} ${f(a.y - ny * ra)} Z`;
  }
  function limbShapes(s: Skeleton, ox: number): Shape[] {
    const sh = { x: s.shoulder.x + ox, y: s.shoulder.y }, el = { x: s.elbow.x + ox, y: s.elbow.y }, ha = { x: s.hand.x + ox, y: s.hand.y };
    return [
      along(sh, el, 0.14, 0.9, s.armFront, 3, 4.6, 'biceps'),
      along(sh, el, 0.14, 0.9, neg(s.armFront), 3, 4.6, 'triceps'),
      along(el, ha, 0.08, 0.92, s.armFront, 0, 4, 'forearms'),
    ];
  }
  const trunk = $derived<Shape[]>([
    along(sk.pelvis, sk.shoulder, 0.1, 0.36, neg(sk.torsoFront), 5, 5, 'lower-back'),
    along(sk.pelvis, sk.shoulder, 0.34, 0.86, neg(sk.torsoFront), 6, 6.4, 'lats'),
    along(sk.shoulder, sk.headC, 0, 0.9, neg(sk.torsoFront), 2, 4.6, 'traps'),
    along(sk.pelvis, sk.shoulder, 0.1, 0.55, sk.torsoFront, 5, 5, 'abs'),
    along(sk.pelvis, sk.shoulder, 0.56, 0.95, sk.torsoFront, 7, 7, 'chest'),
    { id: 'glutes', cx: sk.pelvis.x - sk.torsoFront.x * 6 + sk.legFront.x * -2, cy: sk.pelvis.y + 2, rx: 10, ry: 6.2, rot: 20 },
  ]);
  const legs = $derived<Shape[]>([
    along(sk.pelvis, sk.knee, 0.12, 0.92, neg(sk.legFront), 6, 6.8, 'hamstrings'),
    along(sk.pelvis, sk.knee, 0.1, 0.92, sk.legFront, 6, 7.4, 'quads'),
    along(sk.knee, sk.ankle, 0.1, 0.68, neg(sk.legFront), 4, 5.4, 'calves'),
  ]);
  const arms = $derived<Shape[]>([...limbShapes(sk, 0), { id: 'front-delts', cx: sk.shoulder.x + (sk.elbow.x - sk.shoulder.x) * 0.1, cy: sk.shoulder.y + (sk.elbow.y - sk.shoulder.y) * 0.1, rx: 9, ry: 5.2, rot: (Math.atan2(sk.elbow.y - sk.shoulder.y, sk.elbow.x - sk.shoulder.x) * 180) / Math.PI }]);
  const tone = (id: string) => (mainSet.has(id as MuscleId) ? 'main' : alsoSet.has(id as MuscleId) ? 'also' : '');


  // ---- human figure options: athlete, pictogram, x-ray, crash-test dummy ----
  type Rr = Record<'torso' | 'neck' | 'thigh' | 'shin' | 'foot' | 'arm' | 'fore', [number, number]>;
  const RAD: Record<string, Rr> = {
    athlete: { torso: [8.5, 11.5], neck: [3.4, 3], thigh: [8.8, 5.2], shin: [5.4, 3.4], foot: [3.4, 2.2], arm: [5, 3.8], fore: [3.9, 2.7] },
    pictogram: { torso: [8, 9.5], neck: [3.6, 3.6], thigh: [6.4, 5], shin: [5, 4], foot: [3.6, 3], arm: [4.6, 4], fore: [4, 3.4] },
    xray: { torso: [8.5, 11], neck: [3, 3], thigh: [8, 5], shin: [5, 3], foot: [3, 2], arm: [4.6, 3.6], fore: [3.6, 2.6] },
    dummy: { torso: [8, 10], neck: [3.4, 3.4], thigh: [7.2, 5.6], shin: [5.6, 4.2], foot: [3.8, 3], arm: [4.8, 4], fore: [4.2, 3.4] },
  };
  const rad = $derived(RAD[look] ?? RAD.athlete);
  const isHuman = $derived(look === 'athlete' || look === 'pictogram' || look === 'xray' || look === 'dummy');
  const mid = (a: V, b: V, f: number): V => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  const shift = (v: V, dx: number, dy = 0): V => ({ x: v.x + dx, y: v.y + dy });


  // ---- athlete: smooth anatomical outlines (calf, quad, glute, chest bulges) with the working muscle lighting up inside the body ----
  type Prof = [number, number, number][]; // [position along the bone, half-width on the front side, half-width on the back side]
  const PROF: Record<string, Prof> = {
    thigh: [[0, 8, 9.4], [0.3, 8.8, 8], [0.65, 7, 5.4], [1, 4.8, 4.8]],
    shin: [[0, 4.8, 5], [0.3, 4.2, 6.6], [0.7, 3.4, 3.8], [1, 2.6, 2.8]],
    arm: [[0, 5.4, 5.2], [0.35, 5.4, 5.2], [0.75, 4.1, 4.4], [1, 3.4, 3.6]],
    fore: [[0, 3.9, 3.9], [0.3, 4.2, 3.7], [0.75, 2.9, 2.9], [1, 2.4, 2.4]],
    torso: [[0, 8.2, 9.4], [0.28, 7.2, 7.8], [0.55, 7.4, 7.2], [0.82, 9.8, 8.8], [1, 7, 7.6]],
    short: [[0, 8.6, 9.8], [0.3, 9.2, 8.4], [0.5, 8.2, 6.8]],
  };
  /** A narrow band along the lit (front) side of each shape, drawn soft to give the body volume. */
  const SHADE: Record<string, Prof> = Object.fromEntries(Object.entries(PROF).map(([k, v]) => [k, v.map(([t, fw]) => [t, fw * 0.92, -fw * 0.3] as [number, number, number])]));
  const f2 = (n: number) => n.toFixed(2);
  /** A smooth closed outline along a bone, wider or narrower on its front and back sides. */
  function contour(a: V, b: V, front: V, prof: Prof): string {
    const dx = b.x - a.x, dy = b.y - a.y;
    const fr: V[] = [], bk: V[] = [];
    for (const [t, fw, bw] of prof) {
      const c = { x: a.x + dx * t, y: a.y + dy * t };
      fr.push({ x: c.x + front.x * fw, y: c.y + front.y * fw });
      bk.push({ x: c.x - front.x * bw, y: c.y - front.y * bw });
    }
    const pts = [...fr, ...bk.reverse()];
    const n = pts.length;
    const mp = (p: V, q: V) => `${f2((p.x + q.x) / 2)} ${f2((p.y + q.y) / 2)}`;
    let d = `M ${mp(pts[n - 1], pts[0])}`;
    for (let i = 0; i < n; i++) d += ` Q ${f2(pts[i].x)} ${f2(pts[i].y)} ${mp(pts[i], pts[(i + 1) % n])}`;
    return d + ' Z';
  }
  const aFar = (v: V) => shift(v, 4);
  const aShape = $derived({
    torso: contour(sk.pelvis, sk.shoulder, sk.torsoFront, PROF.torso),
    thigh: contour(sk.pelvis, sk.knee, sk.legFront, PROF.thigh),
    shorts: contour(sk.pelvis, sk.knee, sk.legFront, PROF.short),
    shin: contour(sk.knee, sk.ankle, sk.legFront, PROF.shin),
    arm: contour(sk.shoulder, sk.elbow, sk.armFront, PROF.arm),
    fore: contour(sk.elbow, sk.hand, sk.armFront, PROF.fore),
    fthigh: contour(sk.pelvis, aFar(sk.knee), sk.legFront, PROF.thigh),
    fshin: contour(aFar(sk.knee), shift(sk.ankle, 9), sk.legFront, PROF.shin),
    farm: contour(aFar(sk.shoulder), aFar(sk.elbow), sk.armFront, PROF.arm),
    ffore: contour(aFar(sk.elbow), aFar(sk.hand), sk.armFront, PROF.fore),
  });
  const sh = $derived({
    torso: contour(sk.pelvis, sk.shoulder, sk.torsoFront, SHADE.torso),
    thigh: contour(sk.pelvis, sk.knee, sk.legFront, SHADE.thigh),
    shin: contour(sk.knee, sk.ankle, sk.legFront, SHADE.shin),
    arm: contour(sk.shoulder, sk.elbow, sk.armFront, SHADE.arm),
    fore: contour(sk.elbow, sk.hand, sk.armFront, SHADE.fore),
  });

  /** A muscle's patch on the body: from `i` to `o` away from the bone's axis on one side, tapering to points at both ends. */
  const band = (a: V, b: V, n: V, prof: [number, number, number][]) => contour(a, b, n, prof.map(([t, i, o]) => [t, o, -i] as [number, number, number]));
  const sym = (a: V, b: V, n: V, prof: [number, number][]) => contour(a, b, n, prof.map(([t, w]) => [t, w, w] as [number, number, number]));
  const FWD = (v: V) => v, BWD = (v: V): V => ({ x: -v.x, y: -v.y });
  const bands = $derived<{ id: string; d: string }[]>([
    { id: 'chest', d: band(sk.pelvis, sk.shoulder, FWD(sk.torsoFront), [[0.5, 3, 4], [0.62, 1.5, 13], [0.82, 1.5, 14], [0.98, 3, 6]]) },
    { id: 'abs', d: band(sk.pelvis, sk.shoulder, FWD(sk.torsoFront), [[0.08, 3, 4], [0.18, 1.5, 13], [0.44, 1.5, 13], [0.56, 3, 4]]) },
    { id: 'lats', d: band(sk.pelvis, sk.shoulder, BWD(sk.torsoFront), [[0.28, 3, 4], [0.42, 1.5, 14], [0.7, 1.5, 14], [0.9, 3, 5]]) },
    { id: 'lower-back', d: band(sk.pelvis, sk.shoulder, BWD(sk.torsoFront), [[0.04, 3, 4], [0.12, 1.5, 13], [0.3, 1.5, 13], [0.38, 3, 4]]) },
    { id: 'traps', d: band(sk.shoulder, sk.headC, BWD(sk.torsoFront), [[-0.5, 3, 4], [-0.2, 1.5, 12], [0.5, 1.5, 9], [0.95, 3, 4]]) },
    { id: 'glutes', d: band(sk.pelvis, sk.knee, BWD(sk.legFront), [[-0.12, 3, 4], [0.02, 1.5, 14], [0.22, 1.5, 14], [0.36, 3, 5]]) },
    { id: 'quads', d: band(sk.pelvis, sk.knee, FWD(sk.legFront), [[0.08, 3, 4], [0.22, 1.5, 14], [0.62, 1.5, 12], [0.95, 3, 5]]) },
    { id: 'hamstrings', d: band(sk.pelvis, sk.knee, BWD(sk.legFront), [[0.3, 3, 4], [0.42, 1.5, 12], [0.7, 1.5, 11], [0.95, 3, 5]]) },
    { id: 'calves', d: band(sk.knee, sk.ankle, BWD(sk.legFront), [[0.06, 3, 4], [0.22, 1.5, 12], [0.48, 1.5, 11], [0.74, 3, 4]]) },
    { id: 'biceps', d: band(sk.shoulder, sk.elbow, FWD(sk.armFront), [[0.12, 3, 4], [0.28, 1.5, 9], [0.65, 1.5, 9], [0.92, 3, 4]]) },
    { id: 'triceps', d: band(sk.shoulder, sk.elbow, BWD(sk.armFront), [[0.1, 3, 4], [0.25, 1.5, 9], [0.7, 1.5, 9], [0.95, 3, 4]]) },
    { id: 'forearms', d: sym(sk.elbow, sk.hand, sk.armFront, [[0.06, 1], [0.22, 6], [0.6, 5], [0.95, 1.5]]) },
    { id: 'front-delts', d: sym(sk.shoulder, sk.elbow, sk.armFront, [[-0.16, 3], [0.02, 9], [0.2, 8.6], [0.36, 3]]) },
  ]);
  const smooth = $derived(look === 'soft' || look === 'dark');
  // A thin curved line along a bone: the seam between two muscles (quad / hamstring, biceps / triceps, calf, abs).
  const seam = (a: V, b: V, t0: number, t1: number, off: number) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const pt = (t: number) => ({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
    const m = pt((t0 + t1) / 2), q = pt(t0), r = pt(t1);
    return `M ${q.x} ${q.y} Q ${m.x + nx * 1.3} ${m.y + ny * 1.3} ${r.x} ${r.y}`;
  };
  const seams = $derived([
    seam(sk.pelvis, sk.knee, 0.14, 0.9, 0.5),
    seam(sk.pelvis, sk.knee, 0.3, 0.8, 4.4),
    seam(sk.shoulder, sk.elbow, 0.18, 0.86, 0.4),
    seam(sk.elbow, sk.hand, 0.12, 0.72, 0.6),
    seam(sk.knee, sk.ankle, 0.14, 0.62, 1.6),
    seam(sk.pelvis, sk.shoulder, 0.1, 0.52, 0),
    seam(sk.pelvis, sk.shoulder, 0.58, 0.88, 4),
  ]);
  const hl = $derived(bands.filter((o) => tone(o.id)));

  // Far limbs: the same joints nudged back, drawn darker, so the figure has depth.
  const FAR = { x: 4, y: 0 };
</script>


{#snippet shapes(list: Shape[])}
  {#each list as o (o.id)}
    {@const tn = tone(o.id)}
    {#if tn === 'main'}
      <path d={lens(o)} class="mus-bloom" style:opacity={0.25 + 0.4 * sk.glow} filter="url(#blur3)" />
    {/if}
    <path d={lens(o)} class="mus {tn}" style:--g="{tn === 'main' ? Math.round((0.35 + 0.65 * sk.glow) * 100) : 100}%" />
  {/each}
{/snippet}

{#snippet muscleBody()}
  <g class="mbase">
    <g opacity="0.55">
      <path d={taper(sk.shoulder, sk.elbow, 5, 3.6)} class="mb" /><path d={taper(sk.elbow, sk.hand, 3.8, 2.6)} class="mb" />
      <path d={taper(sk.pelvis, { x: sk.knee.x + 4, y: sk.knee.y }, 8, 5)} class="mb" /><path d={taper({ x: sk.knee.x + 4, y: sk.knee.y }, { x: sk.ankle.x + 9, y: sk.ankle.y }, 5.4, 3.2)} class="mb" />
    </g>
    <path d={taper(sk.pelvis, sk.shoulder, 8.5, 12.5)} class="mb" />
    <path d={taper(sk.shoulder, sk.headC, 3.6, 3)} class="mb" />
    <path d={taper(sk.pelvis, sk.knee, 8.5, 5.4)} class="mb" />
    <path d={taper(sk.knee, sk.ankle, 5.6, 3.2)} class="mb" />
    <path d={taper(sk.ankle, sk.toe, 3.4, 2)} class="mb" />
    <path d={taper(sk.shoulder, sk.elbow, 5.4, 3.8)} class="mb" />
    <path d={taper(sk.elbow, sk.hand, 4, 2.6)} class="mb" />
  </g>
  <ellipse cx={sk.headC.x} cy={sk.headC.y} rx="8.5" ry="10.5" class="mhead" transform="rotate({sk.torsoDeg} {sk.headC.x} {sk.headC.y})" />
  {@render shapes(trunk)}
  {@render shapes(legs)}
  {@render shapes(arms)}
{/snippet}

{#snippet bone(a: V, b: V, key: 'torso' | 'neck' | 'thigh' | 'shin' | 'foot' | 'arm' | 'fore', cls: string)}
  <path d={taper(a, b, rad[key][0], rad[key][1])} class="hb {cls}" />
{/snippet}

{#snippet humanBody()}
  {@const fa = shift(sk.shoulder, 4)}{@const fe = shift(sk.elbow, 4)}{@const fh = shift(sk.hand, 4)}
  {@const fk = shift(sk.knee, 4)}{@const fan = shift(sk.ankle, 9)}{@const ft = shift(sk.toe, 9)}
  <g class="far">
    {@render bone(fa, fe, 'arm', 'skin')}
    {@render bone(fe, fh, 'fore', 'skin')}
    {@render bone(sk.pelvis, fk, 'thigh', 'skin short')}
    {@render bone(fk, fan, 'shin', 'skin')}
    {@render bone(fan, ft, 'foot', 'shoe')}
  </g>
  {@render bone(sk.pelvis, sk.shoulder, 'torso', 'torso')}
  {@render bone(sk.shoulder, sk.headC, 'neck', 'skin')}
  {#if look === 'xray'}
    <g class="bones">
      <line x1={sk.pelvis.x} y1={sk.pelvis.y} x2={sk.shoulder.x} y2={sk.shoulder.y} class="bn" />
      <ellipse cx={mid(sk.pelvis, sk.shoulder, 0.68).x} cy={mid(sk.pelvis, sk.shoulder, 0.68).y} rx="13" ry="8" transform="rotate({sk.torsoDeg} {mid(sk.pelvis, sk.shoulder, 0.68).x} {mid(sk.pelvis, sk.shoulder, 0.68).y})" class="rib" />
      <ellipse cx={mid(sk.pelvis, sk.shoulder, 0.5).x} cy={mid(sk.pelvis, sk.shoulder, 0.5).y} rx="10" ry="6" transform="rotate({sk.torsoDeg} {mid(sk.pelvis, sk.shoulder, 0.5).x} {mid(sk.pelvis, sk.shoulder, 0.5).y})" class="rib" />
      <ellipse cx={sk.pelvis.x} cy={sk.pelvis.y} rx="8" ry="5.5" class="rib" />
      <line x1={sk.pelvis.x} y1={sk.pelvis.y} x2={sk.knee.x} y2={sk.knee.y} class="bn" />
      <line x1={sk.knee.x} y1={sk.knee.y} x2={sk.ankle.x} y2={sk.ankle.y} class="bn" />
      <line x1={sk.shoulder.x} y1={sk.shoulder.y} x2={sk.elbow.x} y2={sk.elbow.y} class="bn" />
      <line x1={sk.elbow.x} y1={sk.elbow.y} x2={sk.hand.x} y2={sk.hand.y} class="bn" />
      <circle cx={sk.knee.x} cy={sk.knee.y} r="2.8" class="jt" /><circle cx={sk.elbow.x} cy={sk.elbow.y} r="2.4" class="jt" />
      <circle cx={sk.shoulder.x} cy={sk.shoulder.y} r="3" class="jt" /><circle cx={sk.pelvis.x} cy={sk.pelvis.y} r="3" class="jt" />
    </g>
  {/if}
  {@render bone(sk.pelvis, sk.knee, 'thigh', 'skin')}
  {#if look === 'athlete'}{@render bone(sk.pelvis, mid(sk.pelvis, sk.knee, 0.5), 'thigh', 'short')}{/if}
  {@render bone(sk.knee, sk.ankle, 'shin', 'skin')}
  {@render bone(sk.ankle, sk.toe, 'foot', 'shoe')}
  {@render bone(sk.shoulder, sk.elbow, 'arm', 'skin')}
  {@render bone(sk.elbow, sk.hand, 'fore', 'skin')}
  <g transform="translate({sk.headC.x} {sk.headC.y}) rotate({sk.torsoDeg})">
    {#if look === 'athlete'}
      <path d="M -8 -2 C -9 -10 -2 -12 4 -10 C 8 -8 9 -4 9.5 -1 L 11.8 1.2 L 9.4 2.6 L 9 6 C 7 9.5 3 10.5 -2 9.5 C -6 8.5 -8 4.5 -8 -2 Z" class="face" />
      <path d="M -8.6 -1 C -9.4 -11 -1 -13.4 5 -10.4 C 8.4 -9 9.2 -6 9 -4 C 5 -6.4 0 -6 -3 -3 Z" class="hair" />
    {:else if look === 'xray'}
      <path d="M -8 -2 C -9 -10 -2 -12 4 -10 C 8 -8 9 -4 9 -1 L 10 2 L 8 3 L 8 7 L 2 9 C -4 9 -8 5 -8 -2 Z" class="skull" />
      <circle cx="3" cy="-2" r="2" class="eye" />
    {:else if look === 'dummy'}
      <circle r="9.4" class="dhead" /><path d="M -9.4 0 H 9.4 M 0 -9.4 V 9.4" class="dline" />
    {:else}
      <circle r="9" class="pic" />
    {/if}
  </g>
  {#if look === 'dummy'}
    {#each [sk.shoulder, sk.elbow, sk.knee, sk.pelvis, sk.ankle] as j}
      <circle cx={j.x} cy={j.y} r="3.6" class="dpin" /><circle cx={j.x} cy={j.y} r="1.4" class="dpin2" />
    {/each}
  {/if}
{/snippet}

{#snippet athleteBody()}
  <defs>
    <clipPath id="bodyclip">
      <path d={aShape.torso} /><path d={aShape.thigh} /><path d={aShape.shin} /><path d={aShape.arm} /><path d={aShape.fore} />
    </clipPath>
  </defs>
  <g class="a-far">
    <path d={aShape.farm} /><path d={aShape.ffore} /><path d={aShape.fthigh} /><path d={aShape.fshin} />
    <path d={taper(shift(sk.ankle, 9), shift(sk.toe, 9), 3.4, 2.2)} class="a-shoe" />
  </g>
  <path d={taper(sk.shoulder, sk.headC, 3.6, 3.1)} class="a-skin" />
  <path d={aShape.torso} class="a-shirt" />
  {#if smooth}<path d={sh.torso} class="a-shade" filter="url(#blur2)" />{/if}
  <path d={aShape.thigh} class="a-skin" />
  {#if smooth}<path d={sh.thigh} class="a-shade" filter="url(#blur2)" />{/if}
  <path d={aShape.shorts} class="a-short" />
  <path d={aShape.shin} class="a-skin" />
  {#if smooth}<path d={sh.shin} class="a-shade" filter="url(#blur2)" />{/if}
  <path d={taper(sk.ankle, sk.toe, 3.6, 2.3)} class="a-shoe" />
  <path d={aShape.arm} class="a-skin" />
  {#if smooth}<path d={sh.arm} class="a-shade" filter="url(#blur2)" />{/if}
  <path d={aShape.fore} class="a-skin" />
  {#if smooth}<path d={sh.fore} class="a-shade" filter="url(#blur2)" />{/if}
  <ellipse cx={sk.hand.x} cy={sk.hand.y} rx="3.4" ry="3.8" class="a-skin" />
  <g transform="translate({sk.headC.x} {sk.headC.y}) rotate({sk.torsoDeg})">
    {#if smooth}
      <ellipse rx="8.6" ry="10.8" class="a-skin" /><ellipse cx="-2.4" cy="-3" rx="3.6" ry="5.4" class="a-shade" filter="url(#blur2)" />
      <path d="M -8.6 -1 C -9.4 -11 -1 -13.4 5 -10.4 C 8.4 -9 9.2 -6 9 -4 C 5 -6.4 0 -6 -3 -3 Z" class="a-hairs" />
      <ellipse cx="-1.5" cy="1.5" rx="1.7" ry="2.4" class="a-ear" />
    {:else}
      <path d="M -8 -2 C -9 -10 -2 -12 4 -10 C 8 -8 9 -4 9.5 -1 L 11.8 1.2 L 9.4 2.6 L 9 6 C 7 9.5 3 10.5 -2 9.5 C -6 8.5 -8 4.5 -8 -2 Z" class="a-skin" />
      <path d="M -8.6 -1 C -9.4 -11 -1 -13.4 5 -10.4 C 8.4 -9 9.2 -6 9 -4 C 5 -6.4 0 -6 -3 -3 Z" class="a-hair" />
    {/if}
  </g>
  {#if smooth}
    <g clip-path="url(#bodyclip)">
      {#each seams as d}<path {d} class="seam" /><path {d} class="seam-hi" transform="translate(0.7 0.7)" />{/each}
    </g>
  {/if}
  <!-- the working muscles light up inside the body -->
  <g clip-path="url(#bodyclip)">
    {#each hl as o (o.id)}
      {@const tn = tone(o.id)}
      {#if look === 'dark' && tn === 'main'}<path d={o.d} class="a-bloom" filter="url(#blur3)" style:opacity={0.3 + 0.5 * sk.glow} />{/if}
      <path d={o.d} class="a-hl {tn}" style:opacity={tn === 'main' ? 0.5 + 0.5 * sk.glow : 0.6} filter="url(#blur2)" />
    {/each}
  </g>
{/snippet}

{#snippet seg(x1: number, y1: number, x2: number, y2: number, cls: string)}
  {#if look === 'outline'}
    <line {x1} {y1} {x2} {y2} class="{cls} edge" />
    <line {x1} {y1} {x2} {y2} class="{cls} fill" />
  {:else}
    <line {x1} {y1} {x2} {y2} class={cls} />
    <line x1={x1 - 1.6} y1={y1 - 1.6} x2={x2 - 1.6} y2={y2 - 1.6} class="{cls} rim" />
  {/if}
{/snippet}

<svg viewBox={vb ?? PATTERNS[anim]?.vb ?? '0 0 240 170'} role="img" aria-label="Animated figure showing the exercise" class="fig {look}">
  <defs>
    <filter id="blur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.8" /></filter>
    <filter id="blur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" /></filter>
    <filter id="blur7" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="7" /></filter>
    <radialGradient id="headg" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#eef1f7" /><stop offset="1" stop-color="#aeb6c6" /></radialGradient>
    <radialGradient id="headd" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#6b7388" /><stop offset="1" stop-color="#2a303d" /></radialGradient>
    <linearGradient id="floorg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232a38" /><stop offset="1" stop-color="#171b24" /></linearGradient>
    <radialGradient id="spot" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="#3a4256" stop-opacity="0.4" /><stop offset="1" stop-color="#3a4256" stop-opacity="0" /></radialGradient>
  </defs>

  <!-- room -->
  <rect x="-200" y="-100" width="640" height="400" class="bgfill" />
  {#if look === 'anatomy'}<ellipse cx="120" cy="85" rx="150" ry="110" fill="url(#spot)" />{/if}
  <rect x="-200" y={FLOOR} width="640" height="140" fill="url(#floorg)" />
  <ellipse cx={sk.pelvis.x + (anim === 'bench' ? 10 : 6)} cy={FLOOR + 1} rx="62" ry="4" fill="#000" opacity="0.35" />

  <!-- equipment behind the figure -->
  {#if anim === 'bench'}
    <rect class="gear dark" x="60" y="118" width="112" height="9" rx="4" />
    <rect class="gear dark" x="72" y="126" width="7" height={FLOOR - 126} />
    <rect class="gear dark" x="152" y="126" width="7" height={FLOOR - 126} />
    <rect class="gear dark" x="34" y="30" width="6" height={FLOOR - 30} rx="2" />
    <rect class="gear dark" x="26" y="146" width="22" height="10" rx="2" />
    <path d="M 40 52 h 14" class="gear-line" />
  {:else if anim === 'pulldown'}
    <rect class="gear dark" x="172" y="4" width="8" height={FLOOR - 4} rx="2" />
    <rect class="gear dark" x="132" y="4" width="46" height="7" rx="3" />
    <circle cx="136" cy="9" r="5" class="gear" />
    <rect class="gear dark" x="86" y="129" width="56" height="8" rx="4" />
    <rect class="gear dark" x="104" y="136" width="8" height={FLOOR - 136} />
    <line x1="136" y1="12" x2={sk.hand.x} y2={sk.hand.y} class="cable" />
  {:else if anim === 'press'}
    <rect class="gear dark" x="86" y="129" width="62" height="8" rx="4" />
    <rect class="gear dark" x="104" y="136" width="8" height={FLOOR - 136} />
    <line x1={sk.pelvis.x - 17} y1={sk.pelvis.y + 4} x2={sk.shoulder.x - 19} y2={sk.shoulder.y - 12} class="gear-pad" />
    <line x1={sk.pelvis.x - 22} y1={sk.pelvis.y + 12} x2={sk.pelvis.x - 36} y2={FLOOR - 4} class="gear-leg" />
  {:else if anim === 'pushdown'}
    <rect class="gear dark" x="176" y="4" width="8" height={FLOOR - 4} rx="2" />
    <rect class="gear dark" x="146" y="4" width="38" height="7" rx="3" />
    <circle cx="150" cy="9" r="5" class="gear" />
    <line x1="150" y1="12" x2={sk.hand.x} y2={sk.hand.y} class="cable" />
  {:else if PATTERNS[anim]}
    <Gear {anim} {sk} />
  {/if}

  {#if look === 'muscle'}
    {@render muscleBody()}
  {:else if look === 'athlete' || smooth}
    {@render athleteBody()}
  {:else if isHuman}
    {@render humanBody()}
  {:else}
  <!-- far arm and far leg -->
  <g class="far">
    {@render seg(sk.shoulder.x + FAR.x, sk.shoulder.y, sk.elbow.x + FAR.x, sk.elbow.y, 'limb arm')}
    {@render seg(sk.elbow.x + FAR.x, sk.elbow.y, sk.hand.x + FAR.x, sk.hand.y, 'limb fore')}
    {@render seg(sk.pelvis.x, sk.pelvis.y, sk.knee.x + FAR.x, sk.knee.y, 'limb thigh')}
    {@render seg(sk.knee.x + FAR.x, sk.knee.y, sk.ankle.x + FAR.x + 5, sk.ankle.y, 'limb shin')}
    {@render seg(sk.ankle.x + FAR.x + 5, sk.ankle.y, sk.toe.x + FAR.x + 5, sk.toe.y, 'limb foot')}
  </g>

  <!-- torso, neck and head -->
  {@render seg(sk.pelvis.x, sk.pelvis.y, sk.shoulder.x, sk.shoulder.y, 'torso')}
  {@render seg(sk.pelvis.x + (sk.shoulder.x - sk.pelvis.x) * 0.45, sk.pelvis.y + (sk.shoulder.y - sk.pelvis.y) * 0.45, sk.shoulder.x, sk.shoulder.y, 'chest')}
  {@render seg(sk.shoulder.x, sk.shoulder.y, sk.headC.x, sk.headC.y, 'neck')}
  <ellipse
    cx={sk.headC.x} cy={sk.headC.y} rx="8.5" ry="10.5" class="head"
    fill={look === 'mannequin' ? 'url(#headg)' : look === 'anatomy' ? 'url(#headd)' : undefined}
    transform="rotate({sk.torsoDeg} {sk.headC.x} {sk.headC.y})"
  />

  <!-- near leg -->
  {@render seg(sk.pelvis.x, sk.pelvis.y, sk.knee.x, sk.knee.y, 'limb thigh near')}
  {@render seg(sk.knee.x, sk.knee.y, sk.ankle.x, sk.ankle.y, 'limb shin near')}
  {@render seg(sk.ankle.x, sk.ankle.y, sk.toe.x, sk.toe.y, 'limb foot near')}

  <!-- near arm -->
  {@render seg(sk.shoulder.x, sk.shoulder.y, sk.elbow.x, sk.elbow.y, 'limb arm near')}
  {@render seg(sk.elbow.x, sk.elbow.y, sk.hand.x, sk.hand.y, 'limb fore near')}
  <circle cx={sk.shoulder.x} cy={sk.shoulder.y} r="7" class="joint" />
  {#if look === 'outline'}
    <circle cx={sk.elbow.x} cy={sk.elbow.y} r="3" class="pin" />
    <circle cx={sk.knee.x} cy={sk.knee.y} r="3" class="pin" />
  {/if}
  {/if}

  <!-- what the hand holds -->
  {#if anim === 'bench'}
    <circle cx={sk.hand.x} cy={sk.hand.y} r="10" class="plate" />
    <circle cx={sk.hand.x} cy={sk.hand.y} r="3" class="hub" />
  {:else if anim === 'pulldown' || anim === 'pushdown'}
    <rect x={sk.hand.x - 4} y={sk.hand.y - 3} width="8" height="6" rx="3" class="grip" />
  {:else if anim === 'press'}
    <!-- semi-neutral grip: the dumbbell is turned about 35° from pointing straight forward, so it looks a little shorter from the side -->
    <rect x={sk.hand.x - 7.4} y={sk.hand.y - 1.6} width="14.8" height="3.2" rx="1.6" class="grip" />
    <rect x={sk.hand.x - 11.4} y={sk.hand.y - 6.4} width="5" height="12.8" rx="2" class="plate" />
    <rect x={sk.hand.x + 6.4} y={sk.hand.y - 6.4} width="5" height="12.8" rx="2" class="plate" />
  {:else if PATTERNS[anim]?.hold === 'bar'}
    <circle cx={sk.hand.x} cy={sk.hand.y} r="10" class="plate" />
    <circle cx={sk.hand.x} cy={sk.hand.y} r="3" class="hub" />
  {:else if PATTERNS[anim]?.hold === 'handle' || PATTERNS[anim]?.hold === 'rope'}
    <rect x={sk.hand.x - 4} y={sk.hand.y - 3} width="8" height="6" rx="3" class="grip" />
  {:else if PATTERNS[anim]?.hold === 'none'}
    <!-- nothing in the hand -->
  {:else}
    <circle cx={sk.hand.x} cy={sk.hand.y} r="6" class="plate" />
    <circle cx={sk.hand.x} cy={sk.hand.y} r="2" class="hub" />
  {/if}

  <!-- the muscles that work -->
  <g class="glow" style:opacity={glow}>
    {#if look === 'anatomy'}
      {#each mainR as l}
        <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke-width={l.w * 2.6} class="bloom" filter="url(#blur7)" />
      {/each}
    {/if}
    {#each alsoR as l}
      <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke-width={l.w} class="also" filter={look === 'outline' ? undefined : 'url(#blur3)'} />
    {/each}
    {#each mainR as l}
      <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke-width={look === 'anatomy' ? l.w * 1.3 : l.w} class="main" filter={look === 'outline' ? undefined : 'url(#blur3)'} />
      <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke-width={Math.max(l.w * 0.45, 4)} class="core" />
    {/each}
  </g>

  <!-- cue pointers -->
  {#each callouts as c}
    {@const j = joint(c)}
    {@const w = c.text.length * 4.5}
    {@const sx = c.anchor === 'end' ? c.x - w : c.x + w}
    <g class="callout">
      <line x1={sx} y1={c.y - 3} x2={j.x} y2={j.y} />
      <circle cx={j.x} cy={j.y} r="2.6" />
      <text x={c.x} y={c.y} text-anchor={c.anchor ?? 'start'} class="ctext">{c.text}</text>
    </g>
  {/each}
</svg>

<style>
  .fig { width: 100%; height: auto; display: block; border-radius: 14px; }
  .bgfill { fill: #161a24; }
  .fig.anatomy .bgfill { fill: #0d1017; }
  .fig.outline .bgfill { fill: #0f1722; }
  .gear { fill: #3a4256; }
  .gear.dark { fill: #2c3345; }
  .fig.outline .gear, .fig.outline .gear.dark { fill: none; stroke: #5b6a86; stroke-width: 1.4; }
  .gear-line { stroke: #4a546c; stroke-width: 2; }
  .gear-leg { stroke: #2a3040; stroke-width: 6; stroke-linecap: round; }
  .gear-pad { stroke: #3a4256; stroke-width: 9; stroke-linecap: round; }
  .fig.outline .gear-pad { stroke: #5b6a86; stroke-width: 3; }
  .cable { stroke: #6a7490; stroke-width: 1.3; }

  .limb, .torso, .chest, .neck { stroke-linecap: round; fill: none; }
  .arm { --w: 10; } .fore { --w: 8.5; } .thigh { --w: 15; } .shin { --w: 11; } .foot { --w: 6; }
  .torso { --w: 20; } .chest { --w: 25; } .neck { --w: 6; }
  .limb, .torso, .chest, .neck { stroke-width: var(--w); }

  /* A. soft mannequin */
  .fig.mannequin .limb { stroke: #9aa3b8; }
  .fig.mannequin .limb.near { stroke: #dfe4ee; }
  .fig.mannequin .torso { stroke: #c5ccdb; }
  .fig.mannequin .chest { stroke: #cfd5e2; }
  .fig.mannequin .neck { stroke: #b4bccd; }
  .fig.mannequin .rim { stroke: #ffffff; opacity: 0.35; stroke-width: calc(var(--w) * 0.3); }
  .fig.mannequin .joint { fill: #dfe4ee; }
  .fig.mannequin .plate { fill: #2b3142; stroke: #7e89a6; stroke-width: 1.6; }

  /* B. dark anatomy with a strong glow */
  .fig.anatomy .limb { stroke: #2f3644; }
  .fig.anatomy .limb.near { stroke: #3d4556; }
  .fig.anatomy .torso { stroke: #343b4b; }
  .fig.anatomy .chest { stroke: #3b4354; }
  .fig.anatomy .neck { stroke: #2f3644; }
  .fig.anatomy .rim { stroke: #8fa3cc; opacity: 0.55; stroke-width: calc(var(--w) * 0.14); }
  .fig.anatomy .joint { fill: #3d4556; }
  .fig.anatomy .head { stroke: #8fa3cc; stroke-width: 0.8; stroke-opacity: 0.5; }
  .fig.anatomy .plate { fill: #1b202b; stroke: #8fa3cc; stroke-width: 1.2; }
  .fig.anatomy .gear, .fig.anatomy .gear.dark { fill: #1c212c; }
  .bloom { stroke: #ff1f1f; stroke-linecap: round; opacity: 1; }

  /* C. clean outline */
  .fig.outline .edge { stroke: #e8eefc; stroke-width: calc(var(--w) + 2.4); }
  .fig.outline .fill { stroke: #0f1722; stroke-width: calc(var(--w) - 0.4); }
  .fig.outline .far .edge { stroke: #7f8da8; }
  .fig.outline .joint { fill: #0f1722; stroke: #e8eefc; stroke-width: 1.6; }
  .fig.outline .head { fill: #0f1722; stroke: #e8eefc; stroke-width: 1.8; }
  .fig.outline .pin { fill: #e8eefc; }
  .fig.outline .plate { fill: #0f1722; stroke: #e8eefc; stroke-width: 1.8; }
  .fig.outline .hub { fill: #e8eefc; }


  /* D. muscle map that moves: dark body, every muscle its own grey shape, working muscles red */
  .fig.muscle .bgfill { fill: #0d0e11; }
  .fig.muscle .gear, .fig.muscle .gear.dark { fill: #20242d; }
  .fig.muscle .plate { fill: none; stroke: #aab3c8; stroke-width: 2.2; }
  .mb { fill: #454b59; stroke: #454b59; stroke-width: 1.4; stroke-linejoin: round; }
  .mhead { fill: #3a3e48; stroke: #ffffff; stroke-width: 0.9; stroke-opacity: 0.8; }
  .mus { fill: #666c7a; stroke: #ffffff; stroke-width: 0.6; stroke-opacity: 0.4; }
  .mus.main { fill: color-mix(in srgb, #ff3b30 var(--g), #666c7a); stroke-opacity: 1; stroke-width: 0.9; }
  .mus.also { fill: #ff9d6e; fill-opacity: 0.9; stroke-opacity: 0.9; stroke-width: 0.8; }
  .mus-bloom { fill: #ff3b30; }
  .mus { stroke-linejoin: round; }
  .fig.muscle .glow { display: none; }


  /* human figure options */
  .hb { stroke-linejoin: round; stroke-width: 1.2; }
  .fig.athlete .bgfill { fill: #161a24; }
  .fig.athlete .skin { fill: #d2a285; stroke: #d2a285; }
  .fig.athlete .far .skin { fill: #a87c66; stroke: #a87c66; }
  .fig.athlete .torso { fill: #2f5fd0; stroke: #2f5fd0; }
  .fig.athlete .far .torso { fill: #274eaa; }
  .fig.athlete .short, .fig.athlete .far .short { fill: #141a29; stroke: #141a29; }
  .fig.athlete .shoe { fill: #f2f4f9; stroke: #f2f4f9; }
  .face { fill: #d2a285; } .hair { fill: #2a1d18; }
  .fig.pictogram .bgfill { fill: #0f141c; }
  .fig.pictogram .skin, .fig.pictogram .torso, .fig.pictogram .shoe { fill: #e9edf6; stroke: #e9edf6; }
  .fig.pictogram .far .skin, .fig.pictogram .far .shoe { fill: #9aa4ba; stroke: #9aa4ba; }
  .pic { fill: #e9edf6; }
  .fig.xray .bgfill { fill: #0a1020; }
  .fig.xray .skin, .fig.xray .torso, .fig.xray .shoe { fill: #121b30; stroke: #3a4c78; stroke-width: 0.9; }
  .fig.xray .far .skin, .fig.xray .far .shoe { opacity: 0.6; }
  .bn { stroke: #d6e4ff; stroke-width: 2; stroke-linecap: round; }
  .rib { fill: none; stroke: #b9cdf5; stroke-width: 1.3; }
  .jt { fill: #0a1020; stroke: #d6e4ff; stroke-width: 1.3; }
  .skull { fill: #0a1020; stroke: #d6e4ff; stroke-width: 1.4; stroke-linejoin: round; } .eye { fill: #d6e4ff; }
  .fig.dummy .bgfill { fill: #20242d; }
  .fig.dummy .skin, .fig.dummy .torso { fill: #f2c230; stroke: #14161b; stroke-width: 1.5; }
  .fig.dummy .far .skin, .fig.dummy .far .torso { fill: #c79a1f; }
  .fig.dummy .shoe { fill: #14161b; stroke: #14161b; }
  .dhead { fill: #f2c230; stroke: #14161b; stroke-width: 1.5; } .dline { stroke: #14161b; stroke-width: 1.3; fill: none; }
  .dpin { fill: #14161b; } .dpin2 { fill: #f2c230; }
  .fig.athlete .main, .fig.pictogram .main, .fig.dummy .main { opacity: 0.8; }


  .fig.athlete .glow { display: none; }
  .a-skin { fill: #d2a285; } .a-far path { fill: #a67a64; }
  .a-far .a-shoe { fill: #c9ced9; }
  .a-shirt { fill: #d2a285; } .a-short { fill: #141a29; } .a-shoe { fill: #f2f4f9; } .a-hair { fill: #2a1d18; }
  .a-hl.main { fill: #ff2f26; } .a-hl.also { fill: #ff9d6e; }


  .fig.soft .glow, .fig.dark .glow { display: none; }
  .fig.soft .bgfill { fill: #1a1f2a; } .fig.dark .bgfill { fill: #0d1017; }
  .fig.soft .a-skin, .fig.soft .a-shirt { fill: #c9d0de; } .fig.soft .a-far path { fill: #959eb2; }
  .fig.soft .a-shade { fill: #ffffff; opacity: 0.5; } .fig.soft .a-short { fill: #2a303e; } .fig.soft .a-shoe { fill: #e3e7f0; }
  .fig.dark .a-skin, .fig.dark .a-shirt { fill: #363d4d; } .fig.dark .a-far path { fill: #262c39; }
  .fig.dark .a-shade { fill: #9fb4de; opacity: 0.42; } .fig.dark .a-short { fill: #171b25; } .fig.dark .a-shoe { fill: #222836; }
  .fig.dark .a-far .a-shoe { fill: #1b2030; }
  .a-bloom { fill: #ff2d24; }
  .seam { fill: none; stroke: #05070b; stroke-width: 0.7; opacity: 0.55; stroke-linecap: round; }
  .seam-hi { fill: none; stroke: #b4c6ee; stroke-width: 0.5; opacity: 0.22; stroke-linecap: round; }
  .fig.soft .seam { stroke: #6f7a93; opacity: 0.5; } .fig.soft .seam-hi { stroke: #fff; opacity: 0.6; }
  .a-hairs { fill: #151a24; } .fig.soft .a-hairs { fill: #3a4256; }
  .a-ear { fill: #2b3241; opacity: 0.8; } .fig.soft .a-ear { fill: #aab3c8; }
  .fig.dark .a-skin, .fig.dark .a-shirt { stroke: #5a688c; stroke-width: 0.5; stroke-opacity: 0.7; }
  .fig.dark .a-short { stroke: #2d3750; stroke-width: 0.5; }
  .fig.dark .gear, .fig.dark .gear.dark { fill: #1c212c; }

  .hub { fill: #aab3c8; }
  .grip { fill: #7e89a6; }
  .fig.outline .grip { fill: #e8eefc; }
  .glow { transition: opacity 0.1s linear; }
  .glow line { stroke-linecap: round; }
  .main { stroke: #ff4d4d; }
  .core { stroke: #ff8a7a; opacity: 0.55; }
  .also { stroke: #ffb347; opacity: 0.6; }
  .fig.outline .main { stroke: #ff5d5d; opacity: 0.9; }
  .fig.outline .core { opacity: 0; }
  .fig.outline .also { stroke: #ffb347; opacity: 0.75; }
  .fig.anatomy .main { stroke: #ff2d24; }
  .fig.anatomy .core { stroke: #ff7a6a; opacity: 0.45; }
  .callout line { stroke: #8fb4ff; stroke-width: 0.9; }
  .callout circle { fill: #4c8dff; }
  .ctext { fill: #dce7ff; font: 600 8.5px var(--body, system-ui); }
</style>
