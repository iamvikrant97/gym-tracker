// A small side-view "mannequin" rig for the exercise form animations. Everything is plain maths, so it is testable:
// a pose is the hip position, the torso angle and where the hand and foot are; the elbow and knee come from
// two-bone inverse kinematics, so limbs keep their length through the whole movement.

export interface V {
  x: number;
  y: number;
}

/** Segment lengths in drawing units (about 1.17 cm each: a 175 cm person is ~150 units tall). */
export const LEN = { torso: 46, neck: 7, head: 10, upperArm: 28, forearm: 26, thigh: 38, shin: 38 } as const;
export const FLOOR = 156;

/** A hand target: absolute, or relative to the shoulder (for poses where the torso moves, like a squat). */
export type HandTarget = V | { rx: number; ry: number };

export interface Key {
  /** The hip joint. */
  pelvis: V;
  /** Torso angle in degrees from upright; positive leans toward the way the figure faces (right). */
  torso: number;
  hand: HandTarget;
  /** The near ankle. */
  foot: V;
  /** Head tilt on top of the torso angle, degrees. */
  head?: number;
  /** How strongly the worked muscle glows at this key, 0..1 (default 0.5). */
  glow?: number;
  /**
   * How much of the upper arm's length shows from the side, 0..1 (default 1). A raised elbow points out to the side, so
   * from the side the upper arm looks shorter: this keeps the forearm upright in a press.
   */
  upper?: number;
  /** Where the toe is, when the foot is not flat (calf raises). Default: flat, 12 units forward of the ankle. */
  toe?: V;
}

export type Bone = 'torso' | 'upperArm' | 'forearm' | 'thigh' | 'shin';

/** A glowing patch on a bone: from t0 to t1 along it, on its front or back side. */
export interface Region {
  bone: Bone;
  t0: number;
  t1: number;
  /** front = chest / biceps / quads side, back = back / triceps / hamstring side. */
  side?: 'front' | 'back';
  /** Distance from the bone's axis, along the side's normal. */
  off?: number;
  /** Thickness of the glow. */
  w: number;
  /** A helper muscle: glows softer and in amber. */
  also?: boolean;
}

export interface Skeleton {
  pelvis: V;
  shoulder: V;
  headC: V;
  elbow: V;
  hand: V;
  knee: V;
  ankle: V;
  toe: V;
  torsoDeg: number;
  /** Unit vectors pointing to the front of the chest, the biceps side of the arm and the quad side of the thigh. */
  torsoFront: V;
  armFront: V;
  legFront: V;
  glow: number;
}

export interface AnimDef {
  /** Keys from the start pose to the finish pose; the figure passes through them in order. */
  keys: Key[];
  /** Which way the elbow and knee fold (see ik). Knee: +1 forward; arm: -1 puts the elbow behind. */
  armBend: 1 | -1;
  legBend: 1 | -1;
  /** The slow, controlled part of the rep is the way forward (lowering the bar, sitting down), not the way back. */
  slowForward?: boolean;
}

/** Two-bone inverse kinematics: where the middle joint and the end (clamped to the reach) go. */
export function ik(a: V, target: V, l1: number, l2: number, bend: 1 | -1): { mid: V; end: V } {
  const dx = target.x - a.x;
  const dy = target.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / d;
  const uy = dy / d;
  const reach = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  return {
    mid: { x: a.x + ux * along + bend * uy * h, y: a.y + uy * along - bend * ux * h },
    end: { x: a.x + ux * reach, y: a.y + uy * reach },
  };
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const torsoVec = (deg: number): V => ({ x: Math.sin(rad(deg)), y: -Math.cos(rad(deg)) });
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lerpV = (a: V, b: V, f: number): V => ({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) });
const norm = (v: V): V => {
  const d = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / d, y: v.y / d };
};

export function shoulderOf(pelvis: V, torsoDeg: number): V {
  const u = torsoVec(torsoDeg);
  return { x: pelvis.x + u.x * LEN.torso, y: pelvis.y + u.y * LEN.torso };
}

/** A key with its hand target made absolute. */
interface AbsKey {
  pelvis: V;
  torso: number;
  hand: V;
  foot: V;
  head: number;
  glow: number;
  upper: number;
  toe?: V;
}

function absolute(k: Key): AbsKey {
  const sh = shoulderOf(k.pelvis, k.torso);
  const hand = 'rx' in k.hand ? { x: sh.x + k.hand.rx, y: sh.y + k.hand.ry } : k.hand;
  return { pelvis: k.pelvis, torso: k.torso, hand, foot: k.foot, head: k.head ?? 0, glow: k.glow ?? 0.5, upper: k.upper ?? 1, toe: k.toe };
}

/** Pose at progress p (0 = first key, 1 = last), moving linearly between keys. */
export function sample(def: AnimDef, p: number): Skeleton {
  const keys = def.keys.map(absolute);
  const span = keys.length - 1;
  const s = Math.min(Math.max(p, 0), 1) * span;
  const i = Math.min(Math.floor(s), Math.max(span - 1, 0));
  const f = span === 0 ? 0 : s - i;
  const a = keys[i];
  const b = keys[Math.min(i + 1, span)];
  const k: AbsKey = {
    pelvis: lerpV(a.pelvis, b.pelvis, f),
    torso: lerp(a.torso, b.torso, f),
    hand: lerpV(a.hand, b.hand, f),
    foot: lerpV(a.foot, b.foot, f),
    head: lerp(a.head, b.head, f),
    glow: lerp(a.glow, b.glow, f),
    upper: lerp(a.upper, b.upper, f),
    toe: a.toe && b.toe ? lerpV(a.toe, b.toe, f) : a.toe ?? b.toe,
  };
  return solve(def, k);
}

function solve(def: AnimDef, k: AbsKey): Skeleton {
  const shoulder = shoulderOf(k.pelvis, k.torso);
  const arm = ik(shoulder, k.hand, LEN.upperArm * k.upper, LEN.forearm, def.armBend);
  const leg = ik(k.pelvis, k.foot, LEN.thigh, LEN.shin, def.legBend);
  const headDir = torsoVec(k.torso + k.head);
  const reach = LEN.neck + LEN.head;
  const armDir = norm({ x: k.hand.x - shoulder.x, y: k.hand.y - shoulder.y });
  const legDir = norm({ x: k.foot.x - k.pelvis.x, y: k.foot.y - k.pelvis.y });
  // The elbow sticks out on the triceps side, so the biceps side is the opposite one. The knee sticks out on the quad side.
  const elbowSide = { x: def.armBend * armDir.y, y: -def.armBend * armDir.x };
  const kneeSide = { x: def.legBend * legDir.y, y: -def.legBend * legDir.x };
  return {
    pelvis: k.pelvis,
    shoulder,
    headC: { x: shoulder.x + headDir.x * reach, y: shoulder.y + headDir.y * reach },
    elbow: arm.mid,
    hand: arm.end,
    knee: leg.mid,
    ankle: leg.end,
    toe: k.toe ?? { x: leg.end.x + 12, y: leg.end.y + 4 },
    torsoDeg: k.torso,
    torsoFront: { x: Math.cos(rad(k.torso)), y: Math.sin(rad(k.torso)) },
    armFront: { x: -elbowSide.x, y: -elbowSide.y },
    legFront: kneeSide,
    glow: k.glow,
  };
}

const ends = (sk: Skeleton, bone: Bone): [V, V] => {
  switch (bone) {
    case 'torso': return [sk.pelvis, sk.shoulder];
    case 'upperArm': return [sk.shoulder, sk.elbow];
    case 'forearm': return [sk.elbow, sk.hand];
    case 'thigh': return [sk.pelvis, sk.knee];
    case 'shin': return [sk.knee, sk.ankle];
  }
};

/** The line (with round caps) that draws a glowing patch. */
export function regionLine(sk: Skeleton, r: Region): { x1: number; y1: number; x2: number; y2: number; w: number } {
  const [a, b] = ends(sk, r.bone);
  const n = r.bone === 'torso' ? sk.torsoFront : r.bone === 'upperArm' || r.bone === 'forearm' ? sk.armFront : sk.legFront;
  const sign = r.side === 'back' ? -1 : 1;
  const off = (r.off ?? (r.side ? 5 : 0)) * sign;
  const p0 = lerpV(a, b, r.t0);
  const p1 = lerpV(a, b, r.t1);
  return { x1: p0.x + n.x * off, y1: p0.y + n.y * off, x2: p1.x + n.x * off, y2: p1.y + n.y * off, w: r.w };
}

// ---- timeline ---------------------------------------------------------------------------------------------

/** Rep tempo in ms: rest at the start, go, rest at the finish, come back. The slow leg is the controlled one. */
export const TEMPO = { holdStart: 700, fast: 1300, holdEnd: 600, slow: 2100 } as const;
export const CYCLE_MS = TEMPO.holdStart + TEMPO.fast + TEMPO.holdEnd + TEMPO.slow;

const smooth = (f: number) => f * f * (3 - 2 * f);

/** Progress along the keys (0..1) and the phase (0 start, 1 going, 2 finish, 3 coming back) at time t ms. */
export function timeline(t: number, slowForward = false): { p: number; phase: 0 | 1 | 2 | 3 } {
  const fwd = slowForward ? TEMPO.slow : TEMPO.fast;
  const back = slowForward ? TEMPO.fast : TEMPO.slow;
  let m = ((t % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  if (m < TEMPO.holdStart) return { p: 0, phase: 0 };
  m -= TEMPO.holdStart;
  if (m < fwd) return { p: smooth(m / fwd), phase: 1 };
  m -= fwd;
  if (m < TEMPO.holdEnd) return { p: 1, phase: 2 };
  m -= TEMPO.holdEnd;
  return { p: 1 - smooth(m / back), phase: 3 };
}
