// Form guides: an animated mannequin, the muscles worked, and plain-language do / avoid cues for an exercise.
import type { AnimDef, Region } from './rig';
import { PATTERNS, EXERCISE_PATTERN } from './patterns';

export type AnimId = string;

export interface Callout {
  /** The joint the pointer follows while the figure moves. */
  follow: 'elbow' | 'hand' | 'knee' | 'ankle' | 'pelvis' | 'shoulder';
  text: string;
  /** Where the label sits in the 240 x 170 drawing: its baseline, and the edge it is anchored by. */
  x: number;
  y: number;
  anchor?: 'start' | 'end';
}

export interface Guide {
  anim: AnimId;
  /** Muscles that do the work, and the ones that help. */
  main: string[];
  also: string[];
  /** One line each for: start, going, finish, coming back. */
  phases: [string, string, string, string];
  dos: string[];
  donts: string[];
  callouts: Callout[];
}

export type Anim = AnimDef & { regions: Region[] };

export const ANIMS = {
  // Lying on a bench, head to the left. The bar goes from straight arms to the lower chest.
  bench: {
    armBend: -1,
    legBend: 1,
    slowForward: true,
    keys: [
      { pelvis: { x: 132, y: 107 }, torso: -90, hand: { x: 88, y: 54 }, foot: { x: 160, y: 151 }, glow: 0.3 },
      { pelvis: { x: 132, y: 107 }, torso: -90, hand: { x: 94, y: 76 }, foot: { x: 160, y: 151 }, glow: 0.6 },
      { pelvis: { x: 132, y: 107 }, torso: -90, hand: { x: 101, y: 93 }, foot: { x: 160, y: 151 }, glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.5, t1: 0.95, side: 'front', off: 3, w: 18 },
      { bone: 'upperArm', t0: 0.1, t1: 0.9, side: 'back', w: 8, also: true },
    ],
  },
  // Seated at a pulldown machine. The bar goes from overhead to the upper chest.
  pulldown: {
    armBend: -1,
    legBend: 1,
    keys: [
      { pelvis: { x: 118, y: 118 }, torso: -4, hand: { x: 130, y: 22 }, foot: { x: 158, y: 151 }, glow: 0.3 },
      { pelvis: { x: 118, y: 118 }, torso: -9, hand: { x: 131, y: 50 }, foot: { x: 158, y: 151 }, glow: 0.6 },
      { pelvis: { x: 118, y: 118 }, torso: -14, hand: { x: 132, y: 82 }, foot: { x: 158, y: 151 }, glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.25, t1: 0.85, side: 'back', off: 4, w: 17 },
      { bone: 'upperArm', t0: 0.15, t1: 0.9, side: 'front', w: 8, also: true },
    ],
  },
  // Seated dumbbell shoulder press, from the shoulders to overhead. Forearms stay upright; `upper` is the foreshortened upper arm.
  press: {
    armBend: -1,
    legBend: 1,
    keys: [
      { pelvis: { x: 120, y: 118 }, torso: -14, hand: { rx: 6, ry: -8 }, upper: 0.68, foot: { x: 160, y: 151 }, glow: 0.3 },
      { pelvis: { x: 120, y: 118 }, torso: -14, hand: { rx: 4, ry: -24 }, upper: 0.16, foot: { x: 160, y: 151 }, glow: 0.6 },
      { pelvis: { x: 120, y: 118 }, torso: -14, hand: { rx: 3, ry: -52 }, upper: 1, foot: { x: 160, y: 151 }, glow: 0.95 },
    ],
    regions: [
      { bone: 'upperArm', t0: 0, t1: 0.3, off: 0, w: 21 },
      { bone: 'upperArm', t0: 0.4, t1: 0.95, side: 'back', w: 8, also: true },
    ],
  },
  // Standing curl: the elbow stays at the side, the hand swings up.
  curl: {
    armBend: -1,
    legBend: 1,
    keys: [
      { pelvis: { x: 118, y: 77 }, torso: 0, hand: { rx: 0.5, ry: 53 }, foot: { x: 118, y: 151 }, glow: 0.2 },
      { pelvis: { x: 118, y: 77 }, torso: 0, hand: { rx: 18.4, ry: 46.4 }, foot: { x: 118, y: 151 }, glow: 0.5 },
      { pelvis: { x: 118, y: 77 }, torso: 0, hand: { rx: 26, ry: 28 }, foot: { x: 118, y: 151 }, glow: 0.8 },
      { pelvis: { x: 118, y: 77 }, torso: 0, hand: { rx: 22.5, ry: 15 }, foot: { x: 118, y: 151 }, glow: 0.95 },
      { pelvis: { x: 118, y: 77 }, torso: 0, hand: { rx: 15, ry: 7 }, foot: { x: 118, y: 151 }, glow: 1 },
    ],
    regions: [
      { bone: 'upperArm', t0: 0.12, t1: 0.92, side: 'front', off: 3, w: 10 },
      { bone: 'forearm', t0: 0.1, t1: 0.6, side: 'front', w: 7, also: true },
    ],
  },
  // Cable pushdown: the elbow is pinned at the side, the forearm swings down.
  pushdown: {
    armBend: -1,
    legBend: 1,
    keys: [
      { pelvis: { x: 116, y: 77 }, torso: 6, hand: { rx: 26, ry: 28 }, foot: { x: 118, y: 151 }, glow: 0.3 },
      { pelvis: { x: 116, y: 77 }, torso: 6, hand: { rx: 18.4, ry: 46.4 }, foot: { x: 118, y: 151 }, glow: 0.65 },
      { pelvis: { x: 116, y: 77 }, torso: 6, hand: { rx: 1, ry: 53.5 }, foot: { x: 118, y: 151 }, glow: 1 },
    ],
    regions: [{ bone: 'upperArm', t0: 0.1, t1: 0.92, side: 'back', off: 3, w: 11 }],
  },
  // Goblet squat: hips back and down while the dumbbell stays at the chest.
  squat: {
    armBend: -1,
    legBend: 1,
    slowForward: true,
    keys: [
      { pelvis: { x: 118, y: 77 }, torso: 2, hand: { rx: 14, ry: 10 }, foot: { x: 122, y: 151 }, glow: 0.2 },
      { pelvis: { x: 104, y: 95 }, torso: 20, hand: { rx: 14, ry: 10 }, foot: { x: 122, y: 151 }, glow: 0.6 },
      { pelvis: { x: 92, y: 108 }, torso: 38, hand: { rx: 14, ry: 10 }, foot: { x: 122, y: 151 }, glow: 0.95 },
    ],
    regions: [
      { bone: 'thigh', t0: 0.1, t1: 0.95, side: 'front', off: 4, w: 15 },
      { bone: 'torso', t0: 0, t1: 0.1, side: 'back', off: 6, w: 15, also: true },
    ],
  },
} as Record<AnimId, Anim>;

ANIMS.rdl = {
  // Dumbbell Romanian deadlift: hips travel back, knees stay soft, the weights slide down the legs.
  armBend: -1,
  legBend: 1,
  slowForward: true,
  keys: [
    { pelvis: { x: 122, y: 77 }, torso: 0, hand: { rx: -4, ry: 53 }, foot: { x: 122, y: 151 }, glow: 0.2 },
    { pelvis: { x: 110, y: 79 }, torso: 32, hand: { rx: -6, ry: 53 }, foot: { x: 122, y: 151 }, glow: 0.6 },
    { pelvis: { x: 98, y: 80 }, torso: 58, hand: { rx: -6, ry: 52 }, foot: { x: 122, y: 151 }, glow: 0.95 },
  ],
  regions: [
    { bone: 'thigh', t0: 0.1, t1: 0.95, side: 'back', off: 3, w: 12 },
    { bone: 'torso', t0: 0, t1: 0.2, side: 'back', off: 5, w: 13, also: true },
  ],
};

const P = (x: number, y: number) => ({ x, y });
const sameRegions = (id: AnimId) => ANIMS[id].regions;

/** The common mistake for each exercise, drawn with the same figure, for the "avoid" half of the zoom view. */
export const BAD_ANIMS: Record<AnimId, Anim> = {
  // Sitting down into a squat instead of hinging: knees bend a lot and the weights drift away from the legs.
  rdl: { ...ANIMS.rdl, keys: [
    { pelvis: P(122, 77), torso: 0, hand: { rx: -4, ry: 53 }, foot: P(122, 151), glow: 0.2 },
    { pelvis: P(114, 94), torso: 26, hand: { rx: 4, ry: 52 }, foot: P(122, 151), glow: 0.5 },
    { pelvis: P(106, 108), torso: 40, hand: { rx: 14, ry: 50 }, foot: P(122, 151), glow: 0.7 },
  ] },
  // Hips lift off the bench and the lower back arches hard to heave the bar up.
  bench: { ...ANIMS.bench, keys: [
    { pelvis: P(132, 96), torso: -96, hand: P(88, 54), foot: P(160, 151), glow: 0.3 },
    { pelvis: P(132, 92), torso: -100, hand: P(94, 76), foot: P(160, 151), glow: 0.6 },
    { pelvis: P(132, 90), torso: -102, hand: P(101, 93), foot: P(160, 151), glow: 0.95 },
  ] },
  // The whole body swings back to heave the bar down, so the back stops doing the work.
  pulldown: { ...ANIMS.pulldown, keys: [
    { pelvis: P(118, 118), torso: -4, hand: P(130, 22), foot: P(158, 151), glow: 0.3 },
    { pelvis: P(118, 118), torso: -26, hand: P(131, 50), foot: P(158, 151), glow: 0.6 },
    { pelvis: P(118, 118), torso: -44, hand: P(132, 82), foot: P(158, 151), glow: 0.95 },
  ] },
  // The lower back arches and the dumbbells drift out in front.
  press: { ...ANIMS.press, keys: [
    { pelvis: P(120, 118), torso: -14, hand: { rx: 6, ry: -8 }, upper: 0.68, foot: P(160, 151), glow: 0.3 },
    { pelvis: P(120, 118), torso: -24, hand: { rx: 16, ry: -24 }, upper: 0.3, foot: P(160, 151), glow: 0.6 },
    { pelvis: P(120, 118), torso: -33, hand: { rx: 18, ry: -50 }, upper: 1, foot: P(160, 151), glow: 0.95 },
  ] },
  // The body rocks back and the elbow drifts forward to swing the weight up.
  curl: { ...ANIMS.curl, keys: [
    { pelvis: P(118, 77), torso: 0, hand: { rx: 0.5, ry: 53 }, foot: P(118, 151), glow: 0.2 },
    { pelvis: P(118, 77), torso: -10, hand: { rx: 26, ry: 40 }, foot: P(118, 151), glow: 0.5 },
    { pelvis: P(118, 77), torso: -18, hand: { rx: 36, ry: 20 }, foot: P(118, 151), glow: 0.8 },
    { pelvis: P(118, 77), torso: -20, hand: { rx: 34, ry: 8 }, foot: P(118, 151), glow: 0.95 },
  ] },
  // Hunched over the bar with the elbows drifting forward, pushing with body weight.
  pushdown: { ...ANIMS.pushdown, keys: [
    { pelvis: P(116, 77), torso: 26, hand: { rx: 34, ry: 18 }, foot: P(118, 151), glow: 0.3 },
    { pelvis: P(116, 77), torso: 32, hand: { rx: 30, ry: 38 }, foot: P(118, 151), glow: 0.65 },
    { pelvis: P(116, 77), torso: 36, hand: { rx: 18, ry: 52 }, foot: P(118, 151), glow: 1 },
  ] },
  // Folding forward at the bottom, back rounding, instead of sitting down with the chest up.
  squat: { ...ANIMS.squat, keys: [
    { pelvis: P(118, 77), torso: 2, hand: { rx: 14, ry: 10 }, foot: P(122, 151), glow: 0.2 },
    { pelvis: P(108, 92), torso: 36, hand: { rx: 14, ry: 10 }, foot: P(122, 151), glow: 0.6 },
    { pelvis: P(100, 100), torso: 62, hand: { rx: 14, ry: 10 }, foot: P(122, 151), glow: 0.95 },
  ] },
};
void sameRegions;

const PATTERN_GUIDES: Record<string, Guide> = {};

const BENCH: Guide = {
  anim: 'bench',
  main: ['Chest'],
  also: ['Front shoulders', 'Triceps'],
  phases: [
    'Arms straight over your chest, shoulder blades pinched back',
    'Lower slowly, about 2 to 3 seconds',
    'Bar lightly touches your lower chest',
    'Press up and slightly back over your shoulders',
  ],
  dos: [
    'Pinch your shoulder blades together and down before you unrack',
    'Keep a small, natural arch in your lower back and your feet flat',
    'Elbows tucked about 45°: your arms and body make an arrow, not a T',
    'Wrists straight, stacked right over your elbows',
  ],
  donts: [
    'Flaring your elbows straight out to the sides',
    'Bouncing the bar off your chest',
    'Lifting your hips or head off the bench',
  ],
  callouts: [
    { follow: 'elbow', text: 'Elbows ~45°', x: 234, y: 84, anchor: 'end' },
    { follow: 'hand', text: 'Touch lower chest', x: 234, y: 18, anchor: 'end' },
  ],
};

const PULLDOWN: Guide = {
  anim: 'pulldown',
  main: ['Lats (sides of your back)'],
  also: ['Biceps', 'Upper back'],
  phases: [
    'Sit tall, arms reaching up, grip a little wider than your shoulders',
    'Pull the bar down, driving your elbows down and back',
    'Bar at your upper chest, shoulder blades down',
    'Let the bar rise slowly until your arms are straight',
  ],
  dos: [
    'Lean back just a little and keep your chest up',
    'Think of pulling your elbows to your back pockets',
    'Pull the bar to your upper chest, not behind your neck',
    'Control it all the way up so you feel the stretch',
  ],
  donts: [
    'Swinging your body back to heave the weight down',
    'Shrugging your shoulders up toward your ears',
    'Letting the bar yank your arms up at the top',
  ],
  callouts: [
    { follow: 'elbow', text: 'Elbows down', x: 6, y: 104 },
    { follow: 'hand', text: 'Bar to upper chest', x: 234, y: 50, anchor: 'end' },
  ],
};

const PRESS: Guide = {
  anim: 'press',
  main: ['Shoulders'],
  also: ['Triceps', 'Upper chest'],
  phases: [
    'Dumbbells at shoulder height, turned in about 35°, forearms straight up',
    'Press up until your arms are almost straight',
    'Dumbbells overhead, over your shoulders',
    'Lower slowly back to your shoulders',
  ],
  dos: [
    'Set the bench back at about 75-80°, not fully upright, back flat on the pad',
    'Semi-neutral grip: dumbbells turned about 35°, palms angled slightly forward, kinder to your shoulders',
    'Elbows slightly in front of your body, not straight out to the sides',
    'Keep your wrists straight and your forearms vertical',
    'Press in a smooth line up, over your shoulders',
    'Lower until your upper arms are about level with the floor',
  ],
  donts: [
    'Arching your lower back to push the weight up',
    'Letting the dumbbells drift out in front of you',
    'Shrugging your shoulders up at the top',
  ],
  callouts: [
    { follow: 'hand', text: 'Forearms vertical', x: 234, y: 30, anchor: 'end' },
    { follow: 'shoulder', text: 'Back on the pad', x: 6, y: 50 },
  ],
};

const CURL: Guide = {
  anim: 'curl',
  main: ['Biceps'],
  also: ['Forearms'],
  phases: [
    'Stand tall, arms hanging, elbows at your sides',
    'Curl up, keeping your elbows still',
    'Squeeze at the top, biceps tight',
    'Lower slowly until your arms are almost straight',
  ],
  dos: [
    'Keep your elbows pinned beside your ribs',
    'Stand tall with your shoulders relaxed and down',
    'Squeeze your biceps at the top for a moment',
    'Take about 2 seconds to lower the weight',
  ],
  donts: [
    'Swinging your body to throw the weight up',
    'Letting your elbows drift forward',
    'Dropping the weight fast on the way down',
  ],
  callouts: [
    { follow: 'elbow', text: 'Elbow stays still', x: 6, y: 80 },
    { follow: 'hand', text: 'Squeeze at the top', x: 234, y: 24, anchor: 'end' },
  ],
};

const PUSHDOWN: Guide = {
  anim: 'pushdown',
  main: ['Triceps'],
  also: [],
  phases: [
    'Elbows at your sides, hands at chest height',
    'Push the bar down until your arms are straight',
    'Arms locked out, triceps squeezed',
    'Let the bar rise slowly, elbows still pinned',
  ],
  dos: [
    'Pin your elbows against your ribs the whole time',
    'Lean forward just slightly and keep your chest up',
    'Straighten your arms fully and squeeze at the bottom',
    'Control the bar on the way back up',
  ],
  donts: [
    'Letting your elbows swing forward as the bar goes up',
    'Leaning over the bar and pushing with your body weight',
    'Using weight so heavy your shoulders roll forward',
  ],
  callouts: [
    { follow: 'elbow', text: 'Elbow pinned', x: 6, y: 80 },
    { follow: 'hand', text: 'Lock out, squeeze', x: 234, y: 120, anchor: 'end' },
  ],
};

const SQUAT: Guide = {
  anim: 'squat',
  main: ['Quads', 'Glutes'],
  also: ['Hamstrings', 'Core'],
  phases: [
    'Stand tall, feet shoulder width apart, dumbbell at your chest',
    'Sit your hips back and down, slowly',
    'Thighs about parallel to the floor, chest up',
    'Drive through your whole foot to stand up',
  ],
  dos: [
    'Keep the dumbbell tight against your chest, elbows pointing down',
    'Push your knees out over your toes, in line with them',
    'Keep your chest tall and your heels on the floor',
    'Go down until your thighs are about parallel, if your hips allow',
  ],
  donts: [
    'Letting your knees cave in toward each other',
    'Rounding your lower back at the bottom',
    'Rising up on your toes or letting your heels lift',
  ],
  callouts: [
    { follow: 'knee', text: 'Knees over toes', x: 234, y: 100, anchor: 'end' },
    { follow: 'shoulder', text: 'Chest tall', x: 6, y: 30 },
  ],
};

const RDL: Guide = {
  anim: 'rdl',
  main: ['Hamstrings', 'Glutes'],
  also: ['Lower back', 'Forearms'],
  phases: [
    'Stand tall, dumbbells in front of your thighs, soft knees',
    'Push your hips back, weights slide down your legs',
    'Dumbbells at mid-shin, back flat, hamstrings stretched',
    'Squeeze your glutes and drive your hips forward',
  ],
  dos: [
    'Knees stay softly bent and don\'t change as you go down',
    'Hips go back, as if closing a car door with your bum',
    'Dumbbells brush your thighs and shins the whole way',
    'Back flat, chest proud, eyes ahead',
  ],
  donts: [
    'Bending your knees more and squatting down',
    'Letting the weights drift away from your legs',
    'Rounding your back to reach lower',
  ],
  callouts: [],
};

const BY_EXERCISE: Record<string, Guide> = {
  'smith-flat-press': BENCH,
  'db-flat-press': BENCH,
  'barbell-bench-press': BENCH,
  'lat-pulldown-wide': PULLDOWN,
  'db-shoulder-press': PRESS,
  'db-curl': CURL,
  'barbell-curl': CURL,
  'bar-pushdown': PUSHDOWN,
  'goblet-squat': SQUAT,
  'db-romanian-deadlift': RDL,
};

for (const [id, p] of Object.entries(PATTERNS)) {
  ANIMS[id] = p.anim;
  BAD_ANIMS[id] = p.bad;
  PATTERN_GUIDES[id] = { anim: id, ...p.guide };
}

const BASE_GUIDES: Record<string, Guide> = { bench: BENCH, pulldown: PULLDOWN, press: PRESS, curl: CURL, pushdown: PUSHDOWN, squat: SQUAT, rdl: RDL };

export function guideFor(exerciseId: string): Guide | null {
  const pattern = EXERCISE_PATTERN[exerciseId];
  return BY_EXERCISE[exerciseId] ?? (pattern ? PATTERN_GUIDES[pattern] ?? BASE_GUIDES[pattern] ?? null : null);
}
