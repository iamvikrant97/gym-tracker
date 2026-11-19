// Front-view poses for the muscle-man figure. Everything is for the right side of the body (x > 100); the left is its mirror.
// Joints are chosen by hand per exercise (a front view foreshortens limbs, so a plain bone solver would look wrong).
import type { V } from './shapes';
import type { MuscleId } from './muscles';

export type FrontId = 'fly' | 'pulldown' | 'press' | 'curl' | 'pushdown' | 'overhead' | 'squat';

export const SHOULDER: V = { x: 150, y: 80 };
const HIP0: V = { x: 118, y: 196 };
const KNEE0: V = { x: 124, y: 282 };
const ANKLE0: V = { x: 128, y: 362 };

export interface FPose {
  /** How far the whole upper body has dropped (squat). */
  dy: number;
  elbow: V;
  hand: V;
  hip: V;
  knee: V;
  ankle: V;
  /** Effort, 0..1: how strongly the worked muscle glows. */
  glow: number;
  prop: 'none' | 'dumbbells' | 'bar' | 'one' | 'goblet';
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lv = (a: V, b: V, f: number): V => ({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) });
const clamp = (p: number) => Math.min(Math.max(p, 0), 1);

/** Elbow and hand at the start (p = 0) and the finish (p = 1) of each exercise. */
const ARMS: Record<FrontId, { e0: V; h0: V; e1: V; h1: V; prop: FPose['prop'] }> = {
  fly: { e0: { x: 190, y: 92 }, h0: { x: 222, y: 82 }, e1: { x: 160, y: 118 }, h1: { x: 110, y: 112 }, prop: 'dumbbells' },
  pulldown: { e0: { x: 184, y: 40 }, h0: { x: 198, y: -8 }, e1: { x: 160, y: 128 }, h1: { x: 140, y: 94 }, prop: 'bar' },
  press: { e0: { x: 186, y: 96 }, h0: { x: 180, y: 44 }, e1: { x: 164, y: 40 }, h1: { x: 142, y: -12 }, prop: 'dumbbells' },
  curl: { e0: { x: 154, y: 148 }, h0: { x: 158, y: 206 }, e1: { x: 154, y: 148 }, h1: { x: 150, y: 98 }, prop: 'dumbbells' },
  pushdown: { e0: { x: 156, y: 140 }, h0: { x: 146, y: 104 }, e1: { x: 156, y: 140 }, h1: { x: 162, y: 198 }, prop: 'bar' },
  overhead: { e0: { x: 130, y: 30 }, h0: { x: 108, y: 56 }, e1: { x: 130, y: 30 }, h1: { x: 110, y: -22 }, prop: 'one' },
  squat: { e0: { x: 146, y: 132 }, h0: { x: 110, y: 112 }, e1: { x: 146, y: 132 }, h1: { x: 110, y: 112 }, prop: 'goblet' },
};

export function fpose(id: FrontId, p: number): FPose {
  const q = clamp(p);
  const a = ARMS[id];
  const dy = id === 'squat' ? 56 * q : 0;
  let elbow = lv(a.e0, a.e1, q);
  let hand = lv(a.h0, a.h1, q);
  if (id === 'curl') {
    // the forearm swings up in front of the body, so from the front it shortens as it rises
    const th = (150 * q * Math.PI) / 180;
    hand = { x: elbow.x - 6 * Math.sin(th), y: elbow.y + 58 * Math.cos(th) };
  }
  if (id === 'pushdown') {
    // the forearm swings from up in front of the chest down to straight; from the front it lengthens as it goes
    const th = (150 * (1 - q) * Math.PI) / 180;
    hand = { x: elbow.x + 6 * Math.sin(th), y: elbow.y + 58 * Math.cos(th) };
  }
  if (id === 'squat') {
    elbow = { x: elbow.x, y: elbow.y + dy };
    hand = { x: hand.x, y: hand.y + dy };
  }
  const hip = { x: HIP0.x, y: HIP0.y + dy };
  const knee = id === 'squat' ? lv(KNEE0, { x: 152, y: 300 }, q) : KNEE0;
  const ankle = id === 'squat' ? lv(ANKLE0, { x: 140, y: 362 }, q) : ANKLE0;
  return { dy, elbow, hand, hip, knee, ankle, glow: 0.3 + 0.7 * q, prop: a.prop };
}

export const FRONT_MUSCLES: Record<FrontId, { main: MuscleId[]; also: MuscleId[] }> = {
  fly: { main: ['chest'], also: ['front-delts'] },
  pulldown: { main: ['lats'], also: ['biceps', 'traps', 'forearms'] },
  press: { main: ['front-delts', 'side-delts'], also: ['triceps', 'traps', 'chest'] },
  curl: { main: ['biceps'], also: ['forearms'] },
  pushdown: { main: ['triceps'], also: ['forearms'] },
  overhead: { main: ['triceps'], also: ['forearms'] },
  squat: { main: ['quads', 'glutes'], also: ['hamstrings', 'adductors', 'calves', 'abs'] },
};

/** What the drawing should show: upper-body moves crop to the waist, the squat shows the whole body. */
export const VIEW: Record<FrontId, string> = {
  fly: '-30 -40 260 300', pulldown: '-30 -48 260 308', press: '-30 -48 260 308', curl: '-30 -30 260 290', pushdown: '-30 -48 260 308', overhead: '-30 -44 260 304', squat: '-30 -10 260 396',
};
