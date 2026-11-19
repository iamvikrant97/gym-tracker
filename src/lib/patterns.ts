// More form guides, one movement pattern at a time. Each pattern is one animated rep (the good one and the "avoid" one),
// the muscles it works, the plain-language cues, and the kit it needs. Exercises map onto patterns in EXERCISE_PATTERN.
import type { Anim, Guide } from './formGuides';
import type { MuscleId } from './muscles';
import type { V } from './rig';

const P = (x: number, y: number): V => ({ x, y });
export type Hold = 'bar' | 'db' | 'handle' | 'rope' | 'none';

export interface Pattern {
  anim: Anim;
  bad: Anim;
  muscles: { main: MuscleId[]; also: MuscleId[] };
  guide: Omit<Guide, 'anim'>;
  hold: Hold;
  /** An extra camera angle that shows what the side view cannot. */
  angle?: string;
  /** Crop for the drawing, when the default frame cuts the figure off. */
  vb?: string;
}

/** The same movement with other keys: used for the "avoid" version. */
const alt = (a: Anim, keys: Anim['keys']): Anim => ({ ...a, keys });

export const PATTERNS: Record<string, Pattern> = {};
const add = (id: string, p: Pattern) => { PATTERNS[id] = p; };

// ---------- chest ----------
{
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: true,
    keys: [
      { pelvis: P(126, 114), torso: -48, hand: P(93, 29), foot: P(158, 151), glow: 0.3 },
      { pelvis: P(126, 114), torso: -48, hand: P(100, 55), foot: P(158, 151), glow: 0.6 },
      { pelvis: P(126, 114), torso: -48, hand: P(107, 79), foot: P(158, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.6, t1: 1, side: 'front', off: 3, w: 15 },
      { bone: 'upperArm', t0: 0.1, t1: 0.9, side: 'back', w: 8, also: true },
    ],
  };
  add('incline', {
    anim,
    bad: alt(anim, [
      { pelvis: P(126, 108), torso: -54, hand: P(86, 29), foot: P(158, 151), glow: 0.3 },
      { pelvis: P(126, 106), torso: -56, hand: P(90, 49), foot: P(158, 151), glow: 0.6 },
      { pelvis: P(126, 104), torso: -58, hand: P(94, 66), foot: P(158, 151), glow: 0.95 },
    ]),
    muscles: { main: ['chest'], also: ['front-delts', 'triceps'] },
    hold: 'bar',
    angle: 'press-top',
    guide: {
      main: ['Upper chest'], also: ['Front shoulders', 'Triceps'],
      phases: ['Arms straight over your upper chest, shoulder blades pinched', 'Lower slowly, about 2 to 3 seconds', 'Weight touches your upper chest, just below the collarbone', 'Press up and slightly back over your shoulders'],
      dos: ['Set the bench at about 30°, a low incline; any steeper turns it into a shoulder press', 'Pinch your shoulder blades back and down and keep your head on the pad', 'Elbows tucked about 45° from your body, not flared wide', 'Keep your feet flat and your hips on the seat'],
      donts: ['Setting the bench too steep, so the shoulders do the work', 'Lowering the weight toward your neck or face', 'Lifting your hips off the seat to push it up'],
      callouts: [{ follow: 'hand', text: 'Upper chest', x: 234, y: 90, anchor: 'end' }, { follow: 'shoulder', text: 'Hips stay down', x: 6, y: 150 }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(108, 118), torso: -6, hand: P(118, 78), foot: P(150, 151), glow: 0.3 },
      { pelvis: P(108, 118), torso: -6, hand: P(138, 76), foot: P(150, 151), glow: 0.6 },
      { pelvis: P(108, 118), torso: -6, hand: P(156, 75), foot: P(150, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.6, t1: 1, side: 'front', off: 3, w: 17 },
      { bone: 'upperArm', t0: 0.1, t1: 0.9, side: 'back', w: 8, also: true },
    ],
  };
  add('machinePress', {
    anim,
    bad: alt(anim, [
      { pelvis: P(108, 118), torso: 2, hand: P(120, 76), foot: P(150, 151), glow: 0.3 },
      { pelvis: P(112, 118), torso: 12, hand: P(143, 70), foot: P(150, 151), glow: 0.6 },
      { pelvis: P(116, 118), torso: 22, hand: P(165, 64), foot: P(150, 151), glow: 0.95 },
    ]),
    muscles: { main: ['chest'], also: ['front-delts', 'triceps'] },
    hold: 'handle',
    angle: 'press-top',
    guide: {
      main: ['Chest'], also: ['Front shoulders', 'Triceps'],
      phases: ['Handles at mid-chest, elbows back, shoulder blades pinched on the pad', 'Press forward in a straight line', 'Arms almost straight, chest squeezed', 'Let the handles come back slowly'],
      dos: ['Set the seat so the handles line up with the middle of your chest', 'Keep your back and head against the pad the whole time', 'Pinch your shoulder blades back before the first rep', 'Stop just short of locking your elbows'],
      donts: ['Peeling your back off the pad as you press', 'Rolling your shoulders forward at the end', 'Slamming the weight stack on the way back'],
      callouts: [{ follow: 'hand', text: 'Handles at mid-chest', x: 234, y: 106, anchor: 'end' }, { follow: 'shoulder', text: 'Back on the pad', x: 6, y: 58 }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: false,
    keys: [
      { pelvis: P(108, 118), torso: -6, hand: { rx: 14, ry: 22 }, upper: 0.5, foot: P(150, 151), glow: 0.3 },
      { pelvis: P(108, 118), torso: -6, hand: { rx: 29, ry: 17 }, upper: 0.75, foot: P(150, 151), glow: 0.6 },
      { pelvis: P(108, 118), torso: -6, hand: { rx: 44, ry: 10 }, upper: 1, foot: P(150, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.6, t1: 1, side: 'front', off: 3, w: 17 },
      { bone: 'upperArm', t0: 0, t1: 0.4, side: 'front', w: 8, also: true },
    ],
  };
  add('pecFly', {
    anim,
    bad: alt(anim, [
      { pelvis: P(108, 118), torso: 4, hand: { rx: 14, ry: 24 }, upper: 0.5, foot: P(150, 151), glow: 0.3 },
      { pelvis: P(112, 118), torso: 14, hand: { rx: 20, ry: 8 }, upper: 0.7, foot: P(150, 151), glow: 0.6 },
      { pelvis: P(116, 118), torso: 24, hand: { rx: 40, ry: 0 }, upper: 1, foot: P(150, 151), glow: 0.95 },
    ]),
    muscles: { main: ['chest'], also: ['front-delts'] },
    hold: 'handle',
    angle: 'fly-top',
    guide: {
      main: ['Chest'], also: ['Front shoulders'],
      phases: ['Elbows level with your shoulders, arms open, back flat on the pad', 'Bring your arms together in a wide hug', 'Squeeze your chest where the pads meet', 'Open slowly until you feel a stretch across your chest'],
      dos: ['Keep a soft bend in your elbows, like hugging a tree', 'Set the seat so your elbows sit level with your shoulders', 'Keep your shoulder blades pinched and your chest proud', 'Stop opening when you feel a stretch, not a pull in the shoulder'],
      donts: ['Letting your arms go far behind your body', 'Leaning forward to push the pads together', 'Shrugging your shoulders up toward your ears'],
      callouts: [{ follow: 'elbow', text: 'Soft elbows', x: 6, y: 100 }, { follow: 'shoulder', text: 'Back on the pad', x: 6, y: 58 }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(116, 77), torso: 14, hand: { rx: 12, ry: 26 }, upper: 0.5, foot: P(116, 151), glow: 0.3 },
      { pelvis: P(116, 77), torso: 14, hand: { rx: 27, ry: 24 }, upper: 0.75, foot: P(116, 151), glow: 0.6 },
      { pelvis: P(116, 77), torso: 14, hand: { rx: 40, ry: 20 }, upper: 1, foot: P(116, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.55, t1: 1, side: 'front', off: 3, w: 16 },
      { bone: 'upperArm', t0: 0, t1: 0.5, side: 'front', w: 8, also: true },
    ],
  };
  add('cableFly', {
    anim,
    bad: alt(anim, [
      { pelvis: P(116, 77), torso: 28, hand: { rx: 12, ry: 30 }, upper: 0.5, foot: P(116, 151), glow: 0.3 },
      { pelvis: P(116, 77), torso: 34, hand: { rx: 30, ry: 28 }, upper: 1, foot: P(116, 151), glow: 0.6 },
      { pelvis: P(116, 77), torso: 40, hand: { rx: 38, ry: 44 }, upper: 1, foot: P(116, 151), glow: 0.95 },
    ]),
    muscles: { main: ['chest'], also: ['front-delts', 'biceps'] },
    hold: 'handle',
    angle: 'fly-top',
    guide: {
      main: ['Chest'], also: ['Front shoulders', 'Biceps'],
      phases: ['Stand tall with one foot forward, arms open, hands in line with your chest', 'Sweep your hands together in a wide arc', 'Hands meet in front of your chest, chest squeezed', 'Open slowly, keeping the same soft elbow bend'],
      dos: ['Lean forward only a little and keep your chest up', 'Keep the same soft bend in your elbows the whole time', 'Bring your hands together at chest height, then pause and squeeze', 'Use a stagger stance so you stay steady'],
      donts: ['Straightening your arms and turning it into a push', 'Bending your elbows more and more, so it becomes a press', 'Leaning far forward and swinging the weight'],
      callouts: [{ follow: 'elbow', text: 'Soft elbow bend', x: 6, y: 100 }, { follow: 'hand', text: 'Squeeze together', x: 234, y: 110, anchor: 'end' }],
    },
  });
}

// ---------- back ----------
const noAlso = { also: true } as const;
void noAlso;
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(110, 122), torso: 12, hand: { rx: 50, ry: 8 }, foot: P(176, 142), glow: 0.3 },
      { pelvis: P(110, 122), torso: 2, hand: { rx: 28, ry: 14 }, foot: P(176, 142), glow: 0.6 },
      { pelvis: P(110, 122), torso: -6, hand: { rx: 8, ry: 24 }, foot: P(176, 142), glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.3, t1: 0.9, side: 'back', off: 4, w: 16 },
      { bone: 'upperArm', t0: 0.1, t1: 0.9, side: 'back', w: 8, also: true },
    ],
  };
  add('row', {
    anim,
    bad: alt(anim, [
      { pelvis: P(110, 122), torso: 12, hand: { rx: 50, ry: 8 }, foot: P(176, 142), glow: 0.3 },
      { pelvis: P(110, 122), torso: -14, hand: { rx: 30, ry: 6 }, foot: P(176, 142), glow: 0.6 },
      { pelvis: P(110, 122), torso: -34, hand: { rx: 14, ry: 0 }, foot: P(176, 142), glow: 0.95 },
    ]),
    muscles: { main: ['lats', 'traps'], also: ['biceps', 'rear-delts', 'forearms'] },
    hold: 'handle',
    guide: {
      main: ['Mid back and lats'], also: ['Biceps', 'Rear shoulders'],
      phases: ['Sit tall, arms reaching forward, shoulder blades relaxed forward', 'Pull the handle to your belly, elbows going straight back', 'Handle at your stomach, shoulder blades squeezed together', 'Let your arms reach forward slowly, keeping your back tall'],
      dos: ['Keep your chest up and your back straight the whole time', 'Think of driving your elbows back, not pulling with your hands', 'Squeeze your shoulder blades together at the end', 'Keep a soft bend in your knees'],
      donts: ['Swinging your body back to yank the weight', 'Shrugging your shoulders up toward your ears', 'Rounding your back as you reach forward'],
      callouts: [{ follow: 'elbow', text: 'Elbows back', x: 6, y: 104 }, { follow: 'shoulder', text: 'Chest up', x: 6, y: 28 }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: false,
    keys: [
      { pelvis: P(108, 84), torso: 30, hand: { rx: 40, ry: -36 }, foot: P(116, 151), glow: 0.3 },
      { pelvis: P(108, 84), torso: 30, hand: { rx: 54, ry: 0 }, foot: P(116, 151), glow: 0.5 },
      { pelvis: P(108, 84), torso: 30, hand: { rx: 44, ry: 31 }, foot: P(116, 151), glow: 0.7 },
      { pelvis: P(108, 84), torso: 30, hand: { rx: 20, ry: 50 }, foot: P(116, 151), glow: 0.85 },
      { pelvis: P(108, 84), torso: 30, hand: { rx: -13, ry: 52 }, foot: P(116, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.2, t1: 0.8, side: 'back', off: 4, w: 15 },
      { bone: 'upperArm', t0: 0.2, t1: 0.9, side: 'back', w: 8, also: true },
    ],
  };
  add('straightArm', {
    anim,
    bad: alt(anim, [
      { pelvis: P(108, 84), torso: 30, hand: { rx: 40, ry: -36 }, foot: P(116, 151), glow: 0.3 },
      { pelvis: P(108, 84), torso: 38, hand: { rx: 34, ry: 8 }, foot: P(116, 151), glow: 0.5 },
      { pelvis: P(108, 84), torso: 46, hand: { rx: 12, ry: 32 }, foot: P(116, 151), glow: 0.8 },
      { pelvis: P(108, 84), torso: 52, hand: { rx: 2, ry: 38 }, foot: P(116, 151), glow: 0.95 },
    ]),
    muscles: { main: ['lats'], also: ['triceps', 'abs', 'rear-delts'] },
    hold: 'handle',
    guide: {
      main: ['Lats'], also: ['Triceps', 'Core'],
      phases: ['Hinge forward a little, arms straight and reaching up toward the cable', 'Sweep your straight arms down in a big arc', 'Hands by your thighs, lats squeezed', 'Let your arms rise slowly, keeping them straight'],
      dos: ['Keep a slight bend in your knees and your back flat', 'Keep your arms almost straight, just a soft elbow bend', 'Think of pushing the bar down with your lats, not your hands', 'Squeeze at the bottom, hands by your thighs'],
      donts: ['Bending your elbows and pushing down with your triceps', 'Rounding your back or folding forward more as you pull', 'Letting your arms swing back past your hips'],
      callouts: [{ follow: 'elbow', text: 'Arms almost straight', x: 234, y: 130, anchor: 'end' }, { follow: 'shoulder', text: 'Back flat', x: 6, y: 30 }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(120, 92), torso: 118, hand: { rx: 6, ry: 10 }, foot: P(64, 142), glow: 0.3 },
      { pelvis: P(120, 92), torso: 82, hand: { rx: 6, ry: 10 }, foot: P(64, 142), glow: 0.6 },
      { pelvis: P(120, 92), torso: 48, hand: { rx: 6, ry: 10 }, foot: P(64, 142), glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.05, t1: 0.7, side: 'back', off: 4, w: 14 },
      { bone: 'thigh', t0: 0.2, t1: 0.9, side: 'back', off: 3, w: 11, also: true },
    ],
  };
  add('backExt', {
    anim,
    bad: alt(anim, [
      { pelvis: P(120, 92), torso: 118, hand: { rx: 6, ry: 10 }, foot: P(64, 142), glow: 0.3 },
      { pelvis: P(120, 92), torso: 70, hand: { rx: 6, ry: 10 }, foot: P(64, 142), glow: 0.6 },
      { pelvis: P(120, 92), torso: 18, hand: { rx: 6, ry: 10 }, foot: P(64, 142), glow: 0.95 },
    ]),
    muscles: { main: ['lower-back', 'glutes'], also: ['hamstrings'] },
    hold: 'none',
    guide: {
      main: ['Lower back and glutes'], also: ['Hamstrings'],
      phases: ['Hips on the pad, body folded forward, back flat, arms crossed on your chest', 'Raise your body up in a smooth line, squeezing your glutes', 'Body in one straight line from head to heels, stop there', 'Lower slowly back down, folding at your hips'],
      dos: ['Set the pad so it sits at your hip bones, not your belly', 'Move by hinging at your hips, keeping your back flat', 'Squeeze your glutes and stop when your body is in a straight line', 'Keep your neck in line with your spine, looking down'],
      donts: ['Swinging up past a straight line and arching your lower back', 'Rounding your back at the bottom', 'Using speed or jerking the weight up'],
      callouts: [{ follow: 'shoulder', text: 'Stop in a straight line', x: 234, y: 40, anchor: 'end' }, { follow: 'pelvis', text: 'Hinge at the hips', x: 6, y: 80 }],
    },
  });
}

// ---------- shoulders ----------
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(116, 77), torso: -4, hand: { rx: 50, ry: 4 }, foot: P(116, 151), glow: 0.3 },
      { pelvis: P(116, 77), torso: -4, hand: { rx: 28, ry: -4 }, upper: 0.85, foot: P(116, 151), glow: 0.6 },
      { pelvis: P(116, 77), torso: -4, hand: { rx: 14, ry: -10 }, upper: 0.5, foot: P(116, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'upperArm', t0: 0, t1: 0.6, side: 'back', off: 4, w: 11 },
      { bone: 'torso', t0: 0.7, t1: 1, side: 'back', off: 3, w: 9, also: true },
    ],
  };
  add('facePull', {
    anim,
    bad: alt(anim, [
      { pelvis: P(116, 77), torso: -4, hand: { rx: 50, ry: 4 }, foot: P(116, 151), glow: 0.3 },
      { pelvis: P(116, 77), torso: -14, hand: { rx: 30, ry: 18 }, foot: P(116, 151), glow: 0.6 },
      { pelvis: P(116, 77), torso: -24, hand: { rx: 12, ry: 26 }, foot: P(116, 151), glow: 0.95 },
    ]),
    muscles: { main: ['rear-delts'], also: ['traps', 'lats'] },
    hold: 'rope',
    guide: {
      main: ['Rear shoulders'], also: ['Upper back', 'Rotator cuff'],
      phases: ['Rope at face height, arms straight, standing tall', 'Pull the rope toward your face, elbows high and wide', 'Hands by your ears, elbows above your wrists, shoulder blades squeezed', 'Let the rope go forward slowly'],
      dos: ['Set the cable at about face height', 'Pull the rope apart as it comes to you, hands finishing beside your ears', 'Keep your elbows high, level with or above your hands', 'Stand tall and keep your ribs down'],
      donts: ['Pulling to your chest with your elbows low', 'Leaning back to heave the weight', 'Shrugging your shoulders up'],
      callouts: [{ follow: 'elbow', text: 'Elbows high', x: 6, y: 60 }, { follow: 'hand', text: 'Hands by your ears', x: 234, y: 20, anchor: 'end' }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(118, 77), torso: 0, hand: { rx: 2, ry: 53 }, foot: P(118, 151), glow: 0.3 },
      { pelvis: P(118, 77), torso: 0, hand: { rx: 9, ry: 24 }, upper: 0.55, foot: P(118, 151), glow: 0.6 },
      { pelvis: P(118, 77), torso: 0, hand: { rx: 10, ry: -2 }, upper: 0.3, foot: P(118, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'upperArm', t0: 0, t1: 0.55, off: 0, w: 16 },
      { bone: 'torso', t0: 0.85, t1: 1, side: 'back', off: 2, w: 8, also: true },
    ],
  };
  const bad = alt(anim, [
    { pelvis: P(118, 77), torso: 0, hand: { rx: 2, ry: 53 }, foot: P(118, 151), glow: 0.3 },
    { pelvis: P(118, 77), torso: -10, hand: { rx: 10, ry: 18 }, upper: 0.6, foot: P(118, 151), glow: 0.6 },
    { pelvis: P(118, 77), torso: -18, hand: { rx: 12, ry: -22 }, upper: 0.4, foot: P(118, 151), glow: 0.95 },
  ]);
  const guide: Pattern['guide'] = {
    main: ['Side shoulders'], also: ['Upper traps'],
    phases: ['Stand tall, arms by your sides, elbows slightly bent', 'Raise your arms out to the sides, leading with your elbows', 'Arms level with your shoulders, no higher', 'Lower slowly, taking about 3 seconds'],
    dos: ['Keep a soft bend in your elbows and lead with your elbows, not your hands', 'Raise until your arms are about level with your shoulders', 'Keep your body still, chest up, shoulders relaxed down', 'Pour the water out: your pinky stays a touch higher than your thumb'],
    donts: ['Swinging your body to throw the weight up', 'Shrugging your shoulders toward your ears', 'Lifting your hands higher than your shoulders'],
    callouts: [{ follow: 'elbow', text: 'Lead with elbows', x: 6, y: 60 }, { follow: 'shoulder', text: 'Body still', x: 6, y: 30 }],
  };
  add('lateral', { anim, bad, muscles: { main: ['side-delts'], also: ['traps'] }, hold: 'db', angle: 'lateral-front', guide });
  add('cableLateral', { anim, bad, muscles: { main: ['side-delts'], also: ['traps'] }, hold: 'handle', angle: 'lateral-front', guide });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(116, 120), torso: 4, hand: { rx: 50, ry: 8 }, foot: P(158, 151), glow: 0.3 },
      { pelvis: P(116, 120), torso: 4, hand: { rx: 28, ry: 6 }, upper: 0.8, foot: P(158, 151), glow: 0.6 },
      { pelvis: P(116, 120), torso: 4, hand: { rx: 8, ry: 6 }, upper: 0.4, foot: P(158, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.7, t1: 1, side: 'back', off: 3, w: 11 },
      { bone: 'upperArm', t0: 0, t1: 0.5, side: 'back', w: 9, also: true },
    ],
  };
  add('rearFly', {
    anim,
    bad: alt(anim, [
      { pelvis: P(116, 120), torso: 4, hand: { rx: 50, ry: 8 }, foot: P(158, 151), glow: 0.3 },
      { pelvis: P(116, 120), torso: -8, hand: { rx: 26, ry: 0 }, foot: P(158, 151), glow: 0.6 },
      { pelvis: P(116, 120), torso: -18, hand: { rx: 10, ry: -10 }, upper: 0.5, foot: P(158, 151), glow: 0.95 },
    ]),
    muscles: { main: ['rear-delts'], also: ['traps', 'lats'] },
    hold: 'handle',
    angle: 'fly-top',
    guide: {
      main: ['Rear shoulders'], also: ['Upper back'],
      phases: ['Chest against the pad, arms straight out in front at shoulder height', 'Sweep your arms out and back in a wide arc', 'Arms level with your shoulders, shoulder blades squeezed', 'Bring your arms forward slowly'],
      dos: ['Set the seat so the handles are level with your shoulders', 'Keep your chest on the pad and a soft bend in your elbows', 'Lead with your elbows, as if opening a book', 'Squeeze your shoulder blades gently at the back'],
      donts: ['Leaning back to swing the weight', 'Shrugging your shoulders up', 'Going so heavy that your arms bend and pull in'],
      callouts: [{ follow: 'elbow', text: 'Lead with elbows', x: 6, y: 100 }, { follow: 'shoulder', text: 'Chest on the pad', x: 6, y: 50 }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(104, 82), torso: 50, hand: { rx: 6, ry: 52 }, foot: P(112, 151), glow: 0.3 },
      { pelvis: P(104, 82), torso: 50, hand: { rx: 8, ry: 30 }, upper: 0.7, foot: P(112, 151), glow: 0.6 },
      { pelvis: P(104, 82), torso: 50, hand: { rx: 8, ry: 6 }, upper: 0.35, foot: P(112, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'torso', t0: 0.7, t1: 1, side: 'back', off: 4, w: 12 },
      { bone: 'upperArm', t0: 0, t1: 0.5, side: 'back', w: 8, also: true },
    ],
  };
  add('rearFlyBent', {
    anim,
    bad: alt(anim, [
      { pelvis: P(104, 82), torso: 50, hand: { rx: 6, ry: 52 }, foot: P(112, 151), glow: 0.3 },
      { pelvis: P(104, 82), torso: 40, hand: { rx: 10, ry: 24 }, upper: 0.7, foot: P(112, 151), glow: 0.6 },
      { pelvis: P(104, 82), torso: 24, hand: { rx: 12, ry: -12 }, upper: 0.4, foot: P(112, 151), glow: 0.95 },
    ]),
    muscles: { main: ['rear-delts'], also: ['traps', 'lats'] },
    hold: 'handle',
    angle: 'fly-top',
    guide: {
      main: ['Rear shoulders'], also: ['Upper back'],
      phases: ['Hinge forward with a flat back, arms hanging down, handles crossed in front', 'Raise your arms out to the sides in a wide arc', 'Arms level with your shoulders, shoulder blades squeezed', 'Lower slowly under control'],
      dos: ['Hinge at your hips with your back flat and your knees soft', 'Keep a soft bend in your elbows and lead with them', 'Raise your arms until they are level with your shoulders', 'Keep your neck long, looking at the floor'],
      donts: ['Standing up taller as you lift to swing the weight', 'Rounding your back', 'Pulling with your hands so your biceps take over'],
      callouts: [{ follow: 'elbow', text: 'Lead with elbows', x: 6, y: 90 }, { follow: 'shoulder', text: 'Back flat', x: 6, y: 30 }],
    },
  });
}
{
  const mk = (hold: Hold): Pattern => {
    const anim: Anim = {
      armBend: -1, legBend: 1,
      keys: [
        { pelvis: P(112, 118), torso: -6, hand: { rx: 6, ry: -8 }, upper: 0.68, foot: P(152, 151), glow: 0.3 },
        { pelvis: P(112, 118), torso: -6, hand: { rx: 4, ry: -24 }, upper: 0.16, foot: P(152, 151), glow: 0.6 },
        { pelvis: P(112, 118), torso: -6, hand: { rx: 3, ry: -52 }, upper: 1, foot: P(152, 151), glow: 0.95 },
      ],
      regions: [
        { bone: 'upperArm', t0: 0, t1: 0.3, off: 0, w: 21 },
        { bone: 'upperArm', t0: 0.4, t1: 0.95, side: 'back', w: 8, also: true },
      ],
    };
    return {
      anim,
      bad: alt(anim, [
        { pelvis: P(112, 118), torso: -6, hand: { rx: 6, ry: -8 }, upper: 0.68, foot: P(152, 151), glow: 0.3 },
        { pelvis: P(112, 118), torso: -16, hand: { rx: 14, ry: -24 }, upper: 0.3, foot: P(152, 151), glow: 0.6 },
        { pelvis: P(112, 118), torso: -26, hand: { rx: 16, ry: -50 }, upper: 1, foot: P(152, 151), glow: 0.95 },
      ]),
      muscles: { main: ['front-delts', 'side-delts'], also: ['triceps', 'traps', 'chest'] },
      hold,
      guide: {
        main: ['Shoulders'], also: ['Triceps', 'Upper chest'],
        phases: ['Handles at shoulder height, forearms straight up', 'Press up until your arms are almost straight', 'Arms overhead, over your shoulders', 'Lower slowly back to your shoulders'],
        dos: ['Set the seat so the handles start level with your shoulders', 'Keep your back against the pad and your ribs down', 'Press straight up, elbows slightly in front of your body', 'Lower until your upper arms are about level with the floor'],
        donts: ['Arching your lower back to push the weight up', 'Shrugging your shoulders up at the top', 'Locking your elbows hard at the top'],
        callouts: [{ follow: 'hand', text: 'Forearms vertical', x: 234, y: 30, anchor: 'end' }, { follow: 'shoulder', text: 'Back on the pad', x: 6, y: 50 }],
      },
    };
  };
  add('shoulderMachine', mk('handle'));
  add('smithShoulder', mk('bar'));
}

// ---------- legs ----------
const LP_D = { x: 0.788, y: -0.616 };
// A foot on the leg-press plate: `dist` along the sled rail from the hip, `lift` up the plate.
const lpFoot = (dist: number, lift = 0): V => ({ x: 92 + LP_D.x * dist - 0.616 * lift, y: 118 + LP_D.y * dist - 0.788 * lift });
{
  const mk = (lift: number, press = false): Pattern => {
    const hands = { rx: 30, ry: 26 };
    const anim: Anim = {
      armBend: -1, legBend: 1, slowForward: true,
      keys: press
        ? [
            { pelvis: P(92, 118), torso: -52, hand: hands, foot: lpFoot(73), toe: P(lpFoot(73).x + 11, lpFoot(73).y - 6), glow: 0.3 },
            { pelvis: P(92, 118), torso: -52, hand: hands, foot: lpFoot(75), toe: P(lpFoot(73).x + 11, lpFoot(73).y - 6), glow: 0.7 },
            { pelvis: P(92, 118), torso: -52, hand: hands, foot: lpFoot(77), toe: P(lpFoot(73).x + 11, lpFoot(73).y - 6), glow: 0.95 },
          ]
        : [
            { pelvis: P(92, 118), torso: -52, hand: hands, foot: lpFoot(74, lift), glow: 0.3 },
            { pelvis: P(92, 118), torso: -52, hand: hands, foot: lpFoot(64, lift), glow: 0.6 },
            { pelvis: P(92, 118), torso: -52, hand: hands, foot: lpFoot(52, lift), glow: 0.95 },
          ],
      regions: press
        ? [{ bone: 'shin', t0: 0.1, t1: 0.9, side: 'back', off: 3, w: 10 }]
        : [
            { bone: 'thigh', t0: 0.1, t1: 0.95, side: 'front', off: 4, w: 15 },
            { bone: 'thigh', t0: 0.1, t1: 0.7, side: 'back', off: 3, w: 9, also: true },
          ],
    };
    return {
      anim,
      bad: press
        ? alt(anim, [
            { pelvis: P(92, 118), torso: -52, hand: hands, foot: lpFoot(66), glow: 0.3 },
            { pelvis: P(92, 118), torso: -52, hand: hands, foot: lpFoot(70), glow: 0.7 },
            { pelvis: P(92, 118), torso: -52, hand: hands, foot: lpFoot(75), glow: 0.95 },
          ])
        : alt(anim, [
            { pelvis: P(92, 118), torso: -52, hand: hands, foot: lpFoot(74, lift), glow: 0.3 },
            { pelvis: P(94, 112), torso: -46, hand: hands, foot: lpFoot(60, lift), glow: 0.6 },
            { pelvis: P(98, 104), torso: -38, hand: hands, foot: lpFoot(44, lift), glow: 0.95 },
          ]),
      muscles: press ? { main: ['calves'], also: [] } : { main: ['quads', 'glutes'], also: ['hamstrings', 'adductors'] },
      hold: 'none',
      guide: press
        ? {
            main: ['Calves'], also: [],
            phases: ['Legs almost straight, balls of your feet on the lower edge of the plate, heels hanging', 'Push the plate away with your toes, lifting your heels', 'Up on your toes, calves squeezed hard', 'Lower your heels slowly until you feel a deep stretch'],
            dos: ['Keep your legs almost straight and your knees soft, never locked', 'Move only at the ankle: up as high as you can, down for a full stretch', 'Pause for a second at the top and at the bottom', 'Use a slow count of about 2 seconds down'],
            donts: ['Bending your knees to bounce the weight', 'Cutting the range short at the bottom', 'Locking your knees hard with a heavy plate'],
            callouts: [{ follow: 'ankle', text: 'Full stretch, full squeeze', x: 6, y: 40 }, { follow: 'knee', text: 'Knees soft', x: 6, y: 80 }],
          }
        : {
            main: ['Quads', 'Glutes'], also: ['Hamstrings', 'Inner thighs'],
            phases: lift
              ? ['Feet high on the plate, shoulder width apart, legs nearly straight', 'Lower the plate slowly, knees heading toward your chest', 'Knees about 90° or a little deeper, hips and lower back still on the seat', 'Press through your whole foot, driving your heels']
              : ['Feet in the middle of the plate, shoulder width apart, legs nearly straight', 'Lower the plate slowly, knees heading toward your chest', 'Knees about 90°, hips and lower back still on the seat', 'Press through your whole foot, driving your heels'],
            dos: lift
              ? ['Put your feet high on the plate to bring in more glutes and hamstrings', 'Keep your whole foot flat, pressing through the heels', 'Keep your hips and lower back against the seat the whole time', 'Push your knees out in line with your toes']
              : ['Keep your feet flat and push through your whole foot', 'Keep your hips and lower back against the seat the whole time', 'Push your knees out in line with your toes', 'Stop just short of locking your knees'],
            donts: ['Letting your hips lift and your lower back curl off the seat at the bottom', 'Locking your knees hard at the top', 'Letting your knees cave in toward each other'],
            callouts: [{ follow: 'pelvis', text: 'Hips stay down', x: 6, y: 150 }, { follow: 'knee', text: 'Knees over toes', x: 234, y: 40, anchor: 'end' }],
          },
    };
  };
  add('legPress', mk(0));
  add('legPressHigh', mk(14));
  add('legPressCalf', mk(0, true));
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: true,
    keys: [
      { pelvis: P(100, 112), torso: -8, hand: { rx: 20, ry: 36 }, foot: P(138, 148), glow: 0.3 },
      { pelvis: P(100, 112), torso: -8, hand: { rx: 20, ry: 36 }, foot: P(160, 130), glow: 0.6 },
      { pelvis: P(100, 112), torso: -8, hand: { rx: 20, ry: 36 }, foot: P(175, 114), glow: 0.95 },
    ],
    regions: [{ bone: 'thigh', t0: 0.15, t1: 0.95, side: 'front', off: 4, w: 15 }],
  };
  add('legExt', {
    anim,
    bad: alt(anim, [
      { pelvis: P(100, 112), torso: -8, hand: { rx: 20, ry: 36 }, foot: P(138, 148), glow: 0.3 },
      { pelvis: P(100, 108), torso: -18, hand: { rx: 20, ry: 36 }, foot: P(160, 128), glow: 0.6 },
      { pelvis: P(100, 102), torso: -28, hand: { rx: 20, ry: 36 }, foot: P(176, 110), glow: 0.95 },
    ]),
    muscles: { main: ['quads'], also: [] },
    hold: 'none',
    guide: {
      main: ['Quads'], also: [],
      phases: ['Sit back against the pad, shins behind the roller, knees bent', 'Straighten your legs, lifting the weight smoothly', 'Legs straight, quads squeezed for a second', 'Lower slowly, taking about 3 seconds'],
      dos: ['Set the back pad so your knees line up with the machine\'s pivot', 'Keep your hips and back against the seat', 'Squeeze your quads hard at the top', 'Lower slowly and stop before the weights touch'],
      donts: ['Swinging your body back to throw the weight up', 'Lifting your hips off the seat', 'Slamming your knees straight at the top'],
      callouts: [{ follow: 'pelvis', text: 'Hips stay down', x: 6, y: 150 }, { follow: 'ankle', text: 'Squeeze at the top', x: 234, y: 140, anchor: 'end' }],
    },
  });
}
{
  const hand = { rx: -7, ry: -3 };
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: true,
    keys: [
      { pelvis: P(118, 77), torso: 4, hand, foot: P(128, 151), glow: 0.2 },
      { pelvis: P(106, 96), torso: 16, hand, foot: P(128, 151), glow: 0.6 },
      { pelvis: P(98, 110), torso: 26, hand, foot: P(128, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'thigh', t0: 0.1, t1: 0.95, side: 'front', off: 4, w: 15 },
      { bone: 'thigh', t0: 0, t1: 0.45, side: 'back', off: 4, w: 11, also: true },
    ],
  };
  add('smithSquat', {
    anim,
    bad: alt(anim, [
      { pelvis: P(118, 77), torso: 4, hand, foot: P(128, 151), glow: 0.2 },
      { pelvis: P(108, 93), torso: 30, hand, foot: P(128, 151), glow: 0.6 },
      { pelvis: P(102, 104), torso: 52, hand, foot: P(128, 151), glow: 0.95 },
    ]),
    muscles: { main: ['quads', 'glutes'], also: ['hamstrings', 'adductors', 'abs', 'lower-back'] },
    hold: 'bar',
    angle: 'squat-front',
    guide: {
      main: ['Quads', 'Glutes'], also: ['Hamstrings', 'Core'],
      phases: ['Bar on your upper back, feet a little in front of the bar, chest up', 'Sit your hips back and down, slowly', 'Thighs about parallel, chest still up', 'Drive through your whole foot to stand'],
      dos: ['Place your feet slightly forward of the bar so your back can stay upright', 'Keep your chest up and the bar over your mid-foot', 'Push your knees out in line with your toes', 'Brace your core before each rep'],
      donts: ['Folding forward and rounding your lower back', 'Letting your heels lift off the floor', 'Letting your knees cave in toward each other'],
      callouts: [{ follow: 'knee', text: 'Knees over toes', x: 234, y: 100, anchor: 'end' }, { follow: 'shoulder', text: 'Chest up', x: 6, y: 30 }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: true,
    keys: [
      { pelvis: P(122, 77), torso: 0, hand: { rx: -4, ry: 53 }, foot: P(122, 151), glow: 0.2 },
      { pelvis: P(110, 79), torso: 32, hand: { rx: -6, ry: 53 }, foot: P(122, 151), glow: 0.6 },
      { pelvis: P(98, 80), torso: 58, hand: { rx: -6, ry: 52 }, foot: P(122, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'thigh', t0: 0.1, t1: 0.95, side: 'back', off: 3, w: 12 },
      { bone: 'torso', t0: 0, t1: 0.2, side: 'back', off: 5, w: 13, also: true },
    ],
  };
  add('barbellRdl', {
    anim,
    bad: alt(anim, [
      { pelvis: P(122, 77), torso: 0, hand: { rx: -4, ry: 53 }, foot: P(122, 151), glow: 0.2 },
      { pelvis: P(114, 94), torso: 26, hand: { rx: 4, ry: 52 }, foot: P(122, 151), glow: 0.5 },
      { pelvis: P(106, 108), torso: 40, hand: { rx: 14, ry: 50 }, foot: P(122, 151), glow: 0.7 },
    ]),
    muscles: { main: ['hamstrings', 'glutes'], also: ['lower-back', 'forearms', 'traps'] },
    hold: 'bar',
    guide: {
      main: ['Hamstrings', 'Glutes'], also: ['Lower back', 'Forearms'],
      phases: ['Stand tall, bar in front of your thighs, soft knees', 'Push your hips back, the bar slides down your legs', 'Bar at mid-shin, back flat, hamstrings stretched', 'Squeeze your glutes and drive your hips forward'],
      dos: ['Keep your knees softly bent and don\'t change the bend as you go down', 'Send your hips back, as if closing a car door with your bum', 'Keep the bar brushing your thighs and shins the whole way', 'Keep your back flat, chest proud and eyes ahead'],
      donts: ['Bending your knees more and squatting down', 'Letting the bar drift away from your legs', 'Rounding your back to reach lower'],
      callouts: [{ follow: 'pelvis', text: 'Hips back', x: 6, y: 80 }, { follow: 'hand', text: 'Bar close to legs', x: 234, y: 130, anchor: 'end' }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: true,
    keys: [
      { pelvis: P(122, 77), torso: 0, hand: { rx: -4, ry: 53 }, foot: P(122, 151), glow: 0.2 },
      { pelvis: P(108, 92), torso: 30, hand: P(122, 112), foot: P(122, 151), glow: 0.6 },
      { pelvis: P(98, 100), torso: 48, hand: P(122, 128), foot: P(122, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'thigh', t0: 0.1, t1: 0.95, side: 'back', off: 3, w: 13 },
      { bone: 'torso', t0: 0, t1: 0.3, side: 'back', off: 5, w: 13, also: true },
    ],
  };
  add('deadlift', {
    anim,
    bad: alt(anim, [
      { pelvis: P(122, 77), torso: 0, hand: { rx: -4, ry: 53 }, foot: P(122, 151), glow: 0.2 },
      { pelvis: P(108, 92), torso: 44, hand: P(136, 110), foot: P(122, 151), glow: 0.6 },
      { pelvis: P(98, 100), torso: 66, hand: P(142, 130), foot: P(122, 151), glow: 0.95 },
    ]),
    muscles: { main: ['glutes', 'hamstrings'], also: ['quads', 'lower-back', 'forearms', 'traps'] },
    hold: 'db',
    guide: {
      main: ['Glutes', 'Hamstrings'], also: ['Quads', 'Lower back', 'Grip'],
      phases: ['Stand tall, dumbbells by your sides, feet hip-width apart', 'Push your hips back and bend your knees, lowering the weights down your legs', 'Dumbbells at mid-shin, back flat, chest proud', 'Push the floor away and stand tall, squeezing your glutes'],
      dos: ['Keep the dumbbells close, brushing your legs', 'Keep your back flat and your chest up, eyes forward', 'Push the floor away with your whole foot', 'Squeeze your glutes at the top without leaning back'],
      donts: ['Rounding your back to reach the weights', 'Letting the dumbbells drift out in front of you', 'Leaning back at the top'],
      callouts: [{ follow: 'hand', text: 'Weights stay close', x: 234, y: 130, anchor: 'end' }, { follow: 'shoulder', text: 'Back flat', x: 6, y: 30 }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: false,
    keys: [
      { pelvis: P(96, 116), torso: -10, hand: { rx: 20, ry: 34 }, foot: P(172, 116), glow: 0.3 },
      { pelvis: P(96, 116), torso: -10, hand: { rx: 20, ry: 34 }, foot: P(161, 143), glow: 0.6 },
      { pelvis: P(96, 116), torso: -10, hand: { rx: 20, ry: 34 }, foot: P(134, 154), glow: 0.95 },
    ],
    regions: [{ bone: 'thigh', t0: 0.2, t1: 0.95, side: 'back', off: 4, w: 13 }, { bone: 'shin', t0: 0.1, t1: 0.7, side: 'back', off: 3, w: 8, also: true }],
  };
  add('seatedCurl', {
    anim,
    bad: alt(anim, [
      { pelvis: P(96, 116), torso: -10, hand: { rx: 20, ry: 34 }, foot: P(172, 116), glow: 0.3 },
      { pelvis: P(96, 112), torso: 6, hand: { rx: 20, ry: 34 }, foot: P(161, 143), glow: 0.6 },
      { pelvis: P(96, 108), torso: 24, hand: { rx: 20, ry: 34 }, foot: P(134, 154), glow: 0.95 },
    ]),
    muscles: { main: ['hamstrings'], also: ['calves'] },
    hold: 'none',
    guide: {
      main: ['Hamstrings'], also: ['Calves'],
      phases: ['Sit back, legs straight, pad just above your heels', 'Curl your heels down and back', 'Heels tucked under you, hamstrings squeezed', 'Let the pad rise slowly, taking about 3 seconds'],
      dos: ['Adjust the machine so your knees line up with its pivot', 'Keep your back against the pad and hold the handles', 'Squeeze your hamstrings at the bottom for a second', 'Control the weight back up, don\'t let it snap'],
      donts: ['Leaning forward and pulling with your body', 'Lifting your hips off the seat', 'Letting the weight yank your legs back up'],
      callouts: [{ follow: 'ankle', text: 'Heels under you', x: 234, y: 130, anchor: 'end' }, { follow: 'pelvis', text: 'Hips stay down', x: 6, y: 150 }],
    },
  });
}
{
  const hand = { rx: 12, ry: 4 };
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: true,
    keys: [
      { pelvis: P(100, 112), torso: 90, hand, foot: P(24, 112), glow: 0.3 },
      { pelvis: P(100, 112), torso: 90, hand, foot: P(35, 85), glow: 0.6 },
      { pelvis: P(100, 112), torso: 90, hand, foot: P(62, 74), glow: 0.95 },
    ],
    regions: [{ bone: 'thigh', t0: 0.2, t1: 0.95, side: 'back', off: 4, w: 13 }, { bone: 'shin', t0: 0.1, t1: 0.7, side: 'back', off: 3, w: 8, also: true }],
  };
  add('lyingCurl', {
    anim,
    bad: alt(anim, [
      { pelvis: P(100, 112), torso: 90, hand, foot: P(24, 112), glow: 0.3 },
      { pelvis: P(100, 104), torso: 94, hand, foot: P(35, 80), glow: 0.6 },
      { pelvis: P(100, 94), torso: 100, hand, foot: P(62, 68), glow: 0.95 },
    ]),
    muscles: { main: ['hamstrings'], also: ['calves'] },
    hold: 'none',
    guide: {
      main: ['Hamstrings'], also: ['Calves'],
      phases: ['Lie face down, pad just above your heels, legs straight', 'Curl your heels up toward your glutes', 'Heels close to your glutes, hamstrings squeezed', 'Lower slowly, taking about 3 seconds'],
      dos: ['Keep your hips pressed into the pad the whole time', 'Line your knees up with the machine\'s pivot', 'Squeeze hard at the top and lower with control', 'Keep your head relaxed and in line with your spine'],
      donts: ['Lifting your hips and arching your back to swing the weight', 'Letting the weight drop fast on the way down', 'Using so much weight that your hips pop up'],
      callouts: [{ follow: 'pelvis', text: 'Hips stay down', x: 234, y: 150, anchor: 'end' }, { follow: 'ankle', text: 'Heels to glutes', x: 6, y: 40 }],
    },
  });
}

// ---------- glutes ----------
{
  const S = P(72, 116);
  const at = (t: number): V => ({ x: S.x - 46 * Math.sin((t * Math.PI) / 180), y: S.y + 46 * Math.cos((t * Math.PI) / 180) });
  const key = (t: number, glow: number) => {
    const pel = at(t);
    return { pelvis: pel, torso: t, hand: P(pel.x + 4, pel.y - 6), foot: P(152, 151), head: 12, glow };
  };
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: true,
    keys: [key(-55, 0.3), key(-75, 0.6), key(-92, 0.95)],
    regions: [{ bone: 'thigh', t0: 0, t1: 0.45, side: 'back', off: 4, w: 20 }, { bone: 'thigh', t0: 0.4, t1: 0.95, side: 'back', off: 3, w: 9, also: true }],
  };
  add('hipThrust', {
    anim,
    bad: alt(anim, [key(-55, 0.3), key(-82, 0.6), key(-112, 0.95)]),
    muscles: { main: ['glutes'], also: ['hamstrings', 'quads', 'adductors'] },
    hold: 'bar',
    guide: {
      main: ['Glutes'], also: ['Hamstrings', 'Quads'],
      phases: ['Upper back on the bench, hips low, feet flat, shins about vertical when you are up', 'Drive through your heels, squeezing your glutes to lift your hips', 'Hips fully up, body in a straight line from shoulders to knees, glutes squeezed', 'Lower your hips slowly'],
      dos: ['Tuck your chin and keep your ribs down so your lower back stays neutral', 'Drive through your heels and keep your whole foot flat', 'Stop when your body makes a straight line, then squeeze', 'Keep your knees pushing slightly out'],
      donts: ['Arching your lower back at the top to go higher', 'Pushing through your toes so your hamstrings take over', 'Letting your knees cave in toward each other'],
      callouts: [{ follow: 'pelvis', text: 'Squeeze at the top', x: 234, y: 40, anchor: 'end' }, { follow: 'knee', text: 'Shins vertical', x: 234, y: 140, anchor: 'end' }],
    },
  });
  add('smithHipThrust', { ...PATTERNS.hipThrust });
  add('singleHipThrust', { ...PATTERNS.hipThrust });
}
{
  const hand = { rx: 18, ry: 20 };
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(112, 82), torso: 28, hand, foot: P(118, 140), glow: 0.2 },
      { pelvis: P(112, 82), torso: 28, hand, foot: P(80, 128), glow: 0.6 },
      { pelvis: P(112, 82), torso: 28, hand, foot: P(44, 110), glow: 0.95 },
    ],
    regions: [{ bone: 'thigh', t0: 0, t1: 0.7, side: 'back', off: 4, w: 19 }],
  };
  const bad = alt(anim, [
    { pelvis: P(112, 82), torso: 28, hand, foot: P(118, 140), glow: 0.2 },
    { pelvis: P(112, 82), torso: 16, hand, foot: P(74, 112), glow: 0.6 },
    { pelvis: P(112, 82), torso: 4, hand, foot: P(46, 84), glow: 0.95 },
  ]);
  const guide: Pattern['guide'] = {
    main: ['Glutes'], also: ['Hamstrings'],
    phases: ['Lean forward holding the frame, working leg bent under you', 'Kick your leg back and slightly up, leading with your heel', 'Leg straight behind you, glute squeezed', 'Bring your knee back under you slowly'],
    dos: ['Hold on and keep your hips square, facing forward', 'Lead with your heel and squeeze your glute at the top', 'Keep your ribs down and your back flat', 'Stop when your leg is in line with your body'],
    donts: ['Arching your lower back to swing the leg higher', 'Twisting your hips open to the side', 'Swinging the leg with momentum'],
    callouts: [{ follow: 'ankle', text: 'Squeeze at the top', x: 6, y: 40 }, { follow: 'shoulder', text: 'Back flat', x: 234, y: 30, anchor: 'end' }],
  };
  add('kickback', { anim, bad, muscles: { main: ['glutes'], also: ['hamstrings', 'lower-back'] }, hold: 'none', guide });
  add('kickbackMachine', { anim, bad, muscles: { main: ['glutes'], also: ['hamstrings', 'lower-back'] }, hold: 'none', guide });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(108, 118), torso: -6, hand: { rx: 22, ry: 32 }, foot: P(150, 151), glow: 0.3 },
      { pelvis: P(108, 118), torso: -6, hand: { rx: 22, ry: 32 }, foot: P(150, 151), glow: 0.65 },
      { pelvis: P(108, 118), torso: -6, hand: { rx: 22, ry: 32 }, foot: P(150, 151), glow: 0.95 },
    ],
    regions: [{ bone: 'thigh', t0: 0, t1: 0.5, side: 'back', off: 5, w: 19 }],
  };
  const guide: Pattern['guide'] = {
    main: ['Outer glutes'], also: ['Hip stabilisers'],
    phases: ['Sit tall with your back on the pad, pads against the outside of your knees', 'Push your knees apart, smoothly', 'Knees wide, outer glutes squeezed', 'Bring them back together slowly, without letting the weight crash'],
    dos: ['Keep your back flat against the pad and your hips down', 'Lean forward a little to work the glutes more', 'Pause for a second when your knees are wide', 'Control the weight on the way back'],
    donts: ['Rocking your body to swing the weight', 'Letting the pads slam together', 'Letting your feet slide around'],
    callouts: [{ follow: 'pelvis', text: 'Hips stay down', x: 6, y: 150 }],
  };
  add('abductionMachine', { anim, bad: alt(anim, [
    { pelvis: P(108, 118), torso: -6, hand: { rx: 22, ry: 32 }, foot: P(150, 151), glow: 0.3 },
    { pelvis: P(108, 118), torso: 4, hand: { rx: 22, ry: 32 }, foot: P(150, 151), glow: 0.6 },
    { pelvis: P(108, 118), torso: -14, hand: { rx: 22, ry: 32 }, foot: P(150, 151), glow: 0.95 },
  ]), muscles: { main: ['glutes'], also: ['adductors'] }, hold: 'none', angle: 'abduct-front', guide });
  add('cableAbduction', { anim: { ...anim, keys: anim.keys.map((k) => ({ ...k, pelvis: P(118, 77), torso: 0, foot: P(118, 151), hand: { rx: 18, ry: 24 } })) }, bad: alt(anim, anim.keys.map((k) => ({ ...k, pelvis: P(118, 77), torso: -14, foot: P(118, 151), hand: { rx: 18, ry: 24 } }))), muscles: { main: ['glutes'], also: ['side-delts', 'obliques'] }, hold: 'none', angle: 'abduct-front', guide: { ...guide, phases: ['Stand tall, holding on, cuff on your outer ankle, leg under you', 'Lift your leg out to the side, leading with your heel', 'Leg out about 30 to 45°, outer glute squeezed', 'Lower slowly without letting the weight pull you'], dos: ['Hold on and keep your hips and chest facing forward', 'Keep your toes pointing forward, not up', 'Lift only as high as you can without leaning'], donts: ['Leaning your body away to lift the leg higher', 'Swinging the leg with momentum', 'Twisting your hips open'] } });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(130, 80), torso: 8, hand: { rx: 0, ry: 53 }, foot: P(150, 118), glow: 0.3 },
      { pelvis: P(139, 62), torso: 4, hand: { rx: 0, ry: 53 }, foot: P(150, 118), glow: 0.6 },
      { pelvis: P(148, 44), torso: 0, hand: { rx: 0, ry: 53 }, foot: P(150, 118), glow: 0.95 },
    ],
    regions: [{ bone: 'thigh', t0: 0.1, t1: 0.95, side: 'front', off: 4, w: 15 }, { bone: 'thigh', t0: 0, t1: 0.5, side: 'back', off: 4, w: 11, also: true }],
  };
  add('stepUp', {
    anim,
    bad: alt(anim, [
      { pelvis: P(132, 84), torso: 28, hand: { rx: 12, ry: 52 }, foot: P(150, 118), glow: 0.3 },
      { pelvis: P(140, 66), torso: 30, hand: { rx: 14, ry: 52 }, foot: P(150, 118), glow: 0.6 },
      { pelvis: P(148, 48), torso: 26, hand: { rx: 14, ry: 52 }, foot: P(150, 118), glow: 0.95 },
    ]),
    muscles: { main: ['quads', 'glutes'], also: ['hamstrings', 'calves', 'forearms'] },
    hold: 'db',
    vb: '0 -26 240 196',
    guide: {
      main: ['Quads', 'Glutes'], also: ['Hamstrings', 'Calves'],
      phases: ['Foot flat on the box, dumbbells by your sides, chest up', 'Drive through your front heel to stand up on the box', 'Standing tall on the box, glute squeezed', 'Lower slowly back down, controlling it with the front leg'],
      dos: ['Put your whole foot on the box and push through the heel', 'Keep your chest up and your body tall', 'Use the front leg: the back foot only touches down lightly', 'Lower slowly, don\'t drop back down'],
      donts: ['Pushing off the back foot to cheat the step', 'Leaning far forward over your front knee', 'Using a box so high that your hips tilt up'],
      callouts: [{ follow: 'knee', text: 'Front leg does the work', x: 6, y: 90 }, { follow: 'shoulder', text: 'Chest up', x: 6, y: 20 }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: true,
    keys: [
      { pelvis: P(122, 77), torso: 0, hand: { rx: -4, ry: 53 }, foot: P(122, 151), glow: 0.2 },
      { pelvis: P(110, 79), torso: 32, hand: { rx: -6, ry: 53 }, foot: P(122, 151), glow: 0.6 },
      { pelvis: P(98, 80), torso: 58, hand: { rx: -6, ry: 52 }, foot: P(122, 151), glow: 0.95 },
    ],
    regions: [
      { bone: 'thigh', t0: 0, t1: 0.5, side: 'back', off: 4, w: 18 },
      { bone: 'torso', t0: 0, t1: 0.2, side: 'back', off: 5, w: 12, also: true },
    ],
  };
  add('pullThrough', {
    anim,
    bad: alt(anim, [
      { pelvis: P(122, 77), torso: 0, hand: { rx: -4, ry: 53 }, foot: P(122, 151), glow: 0.2 },
      { pelvis: P(114, 94), torso: 26, hand: { rx: 4, ry: 52 }, foot: P(122, 151), glow: 0.5 },
      { pelvis: P(106, 108), torso: 40, hand: { rx: 14, ry: 50 }, foot: P(122, 151), glow: 0.7 },
    ]),
    muscles: { main: ['glutes', 'hamstrings'], also: ['lower-back'] },
    hold: 'rope',
    guide: {
      main: ['Glutes', 'Hamstrings'], also: ['Lower back'],
      phases: ['Face away from the cable, rope between your legs, soft knees', 'Push your hips back, arms straight, the rope trailing between your legs', 'Hips far back, back flat, hamstrings stretched', 'Drive your hips forward hard, squeezing your glutes'],
      dos: ['Walk forward until the cable is tight with you standing', 'Hinge at the hips with your knees only slightly bent', 'Keep your arms straight: the hips do the pulling', 'Squeeze your glutes hard at the top'],
      donts: ['Squatting down instead of pushing your hips back', 'Rounding your back at the bottom', 'Pulling the rope up with your arms'],
      callouts: [{ follow: 'pelvis', text: 'Hips back, then drive', x: 6, y: 80 }, { follow: 'shoulder', text: 'Back flat', x: 234, y: 30, anchor: 'end' }],
    },
  });
}
{
  const hand = { rx: 8, ry: 52 };
  const anim: Anim = {
    armBend: -1, legBend: 1, slowForward: true,
    keys: [
      { pelvis: P(118, 77), torso: 0, hand, foot: P(118, 151), glow: 0.2 },
      { pelvis: P(114, 92), torso: 6, hand, foot: P(118, 151), glow: 0.6 },
      { pelvis: P(110, 106), torso: 12, hand, foot: P(118, 151), glow: 0.95 },
    ],
    regions: [{ bone: 'thigh', t0: 0.1, t1: 0.95, side: 'front', off: 4, w: 15 }, { bone: 'thigh', t0: 0, t1: 0.5, side: 'back', off: 4, w: 12, also: true }],
  };
  add('sumoSquat', {
    anim,
    bad: alt(anim, [
      { pelvis: P(118, 77), torso: 0, hand, foot: P(118, 151), glow: 0.2 },
      { pelvis: P(110, 92), torso: 28, hand, foot: P(118, 151), glow: 0.6 },
      { pelvis: P(102, 104), torso: 52, hand, foot: P(118, 151), glow: 0.95 },
    ]),
    muscles: { main: ['quads', 'glutes', 'adductors'], also: ['hamstrings', 'forearms'] },
    hold: 'db',
    angle: 'squat-front',
    guide: {
      main: ['Glutes', 'Inner thighs', 'Quads'], also: ['Hamstrings'],
      phases: ['Feet wide, toes turned out about 30 to 45°, dumbbell hanging between your legs', 'Sit straight down between your legs, slowly', 'Thighs about parallel, chest up, knees over your toes', 'Drive through your whole foot to stand, squeezing your glutes'],
      dos: ['Turn your toes out and push your knees out over them', 'Keep your chest up and your torso fairly upright', 'Let the dumbbell hang straight down between your legs', 'Squeeze your glutes and inner thighs as you stand'],
      donts: ['Letting your knees cave in toward each other', 'Folding forward and rounding your back', 'Letting your heels lift off the floor'],
      callouts: [{ follow: 'knee', text: 'Knees over toes', x: 234, y: 100, anchor: 'end' }, { follow: 'shoulder', text: 'Chest up', x: 6, y: 30 }],
    },
  });
}

// ---------- calves ----------
{
  const toe = P(128, 150);
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(118, 76), torso: 0, hand: { rx: 12, ry: 8 }, upper: 0.7, foot: P(120, 152), toe, glow: 0.3 },
      { pelvis: P(118, 70), torso: 0, hand: { rx: 12, ry: 8 }, upper: 0.7, foot: P(122, 146), toe, glow: 0.6 },
      { pelvis: P(118, 64), torso: 0, hand: { rx: 12, ry: 8 }, upper: 0.7, foot: P(124, 140), toe, glow: 0.95 },
    ],
    regions: [{ bone: 'shin', t0: 0.05, t1: 0.9, side: 'back', off: 3, w: 11 }],
  };
  add('calfRaise', {
    anim,
    bad: alt(anim, [
      { pelvis: P(114, 88), torso: 4, hand: { rx: 12, ry: 8 }, upper: 0.7, foot: P(120, 152), toe, glow: 0.3 },
      { pelvis: P(114, 82), torso: 4, hand: { rx: 12, ry: 8 }, upper: 0.7, foot: P(122, 146), toe, glow: 0.6 },
      { pelvis: P(114, 76), torso: 4, hand: { rx: 12, ry: 8 }, upper: 0.7, foot: P(124, 140), toe, glow: 0.95 },
    ]),
    muscles: { main: ['calves'], also: [] },
    hold: 'none',
    guide: {
      main: ['Calves'], also: [],
      phases: ['Balls of your feet on the edge of the block, heels hanging, legs straight', 'Rise up onto your toes as high as you can', 'Up on your toes, calves squeezed hard for a second', 'Lower your heels slowly until you feel a deep stretch'],
      dos: ['Keep your legs straight with only a soft bend in your knees', 'Go all the way up and all the way down: full range matters', 'Pause for a second at the top and bottom', 'Count about 2 seconds on the way down'],
      donts: ['Bending your knees to bounce the weight up', 'Bouncing out of the bottom without a stretch', 'Rolling your ankles in or out'],
      callouts: [{ follow: 'ankle', text: 'Full stretch, full squeeze', x: 6, y: 100 }, { follow: 'knee', text: 'Legs straight', x: 234, y: 90, anchor: 'end' }],
    },
  });
}

// ---------- abs ----------
{
  const hand = { rx: 10, ry: -4 };
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(112, 114), torso: 0, hand, upper: 0.8, foot: P(74, 152), glow: 0.3 },
      { pelvis: P(112, 114), torso: 35, hand, upper: 0.8, head: 10, foot: P(74, 152), glow: 0.6 },
      { pelvis: P(112, 114), torso: 70, hand, upper: 0.8, head: 25, foot: P(74, 152), glow: 0.95 },
    ],
    regions: [{ bone: 'torso', t0: 0.05, t1: 0.75, side: 'front', off: 3, w: 16 }],
  };
  add('cableCrunch', {
    anim,
    bad: alt(anim, [
      { pelvis: P(112, 114), torso: 0, hand, upper: 0.8, foot: P(74, 152), glow: 0.3 },
      { pelvis: P(104, 118), torso: 22, hand, upper: 0.8, foot: P(74, 152), glow: 0.6 },
      { pelvis: P(92, 124), torso: 40, hand, upper: 0.8, foot: P(74, 152), glow: 0.95 },
    ]),
    muscles: { main: ['abs'], also: ['obliques'] },
    hold: 'rope',
    guide: {
      main: ['Abs'], also: ['Obliques'],
      phases: ['Kneel facing away from the cable, rope held beside your head, back long', 'Curl your ribs toward your hips, rounding your spine', 'Elbows near your knees, abs squeezed hard', 'Uncurl slowly, keeping the cable tension'],
      dos: ['Keep your hips still and bend through your spine only', 'Exhale hard as you curl, pulling your ribs down toward your hips', 'Keep the rope pinned beside your head', 'Control the way back up'],
      donts: ['Sitting your hips back toward your heels as you pull', 'Pulling with your arms instead of your abs', 'Going so heavy that your hips take over'],
      callouts: [{ follow: 'pelvis', text: 'Hips stay still', x: 6, y: 100 }, { follow: 'shoulder', text: 'Curl the spine', x: 234, y: 40, anchor: 'end' }],
    },
  });
}
{
  const hand = P(122, -28);
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(118, 74), torso: 0, hand, foot: P(116, 146), glow: 0.3 },
      { pelvis: P(118, 74), torso: -4, hand, foot: P(140, 118), glow: 0.6 },
      { pelvis: P(118, 72), torso: -10, hand, foot: P(150, 100), glow: 0.95 },
    ],
    regions: [{ bone: 'torso', t0: 0.1, t1: 0.8, side: 'front', off: 3, w: 14 }, { bone: 'thigh', t0: 0, t1: 0.5, side: 'front', off: 3, w: 9, also: true }],
  };
  add('hangKnee', {
    anim,
    bad: alt(anim, [
      { pelvis: P(118, 86), torso: 0, hand, foot: P(116, 150), glow: 0.3 },
      { pelvis: P(106, 86), torso: -16, hand, foot: P(134, 122), glow: 0.6 },
      { pelvis: P(96, 84), torso: -26, hand, foot: P(130, 100), glow: 0.95 },
    ]),
    muscles: { main: ['abs'], also: ['obliques', 'forearms'] },
    hold: 'none',
    vb: '0 -44 240 214',
    guide: {
      main: ['Lower abs'], also: ['Hip flexors', 'Grip'],
      phases: ['Hang from the bar with straight arms, shoulders pulled down, legs together', 'Bring your knees up toward your chest, curling your hips up', 'Knees at chest height, lower abs squeezed', 'Lower your legs slowly, without swinging'],
      dos: ['Pull your shoulders down so you are not hanging limp', 'Curl your pelvis up at the top, not just lift your knees', 'Keep your body still and lower with control', 'Breathe out as you lift'],
      donts: ['Swinging your body to throw your knees up', 'Dropping your legs fast on the way down', 'Shrugging up toward your ears'],
      callouts: [{ follow: 'pelvis', text: 'Curl your hips up', x: 6, y: 100 }, { follow: 'shoulder', text: 'Body still', x: 6, y: 30 }],
    },
  });
}
{
  const anim: Anim = {
    armBend: -1, legBend: 1,
    keys: [
      { pelvis: P(130, 146), torso: -90, hand: P(88, 94), foot: P(168, 108), glow: 0.3 },
      { pelvis: P(130, 146), torso: -90, hand: P(62, 124), foot: P(188, 124), glow: 0.6 },
      { pelvis: P(130, 146), torso: -90, hand: P(38, 142), foot: P(206, 140), glow: 0.95 },
    ],
    regions: [{ bone: 'torso', t0: 0.1, t1: 0.9, side: 'front', off: 3, w: 14 }],
  };
  add('deadBug', {
    anim,
    bad: alt(anim, [
      { pelvis: P(130, 146), torso: -90, hand: P(88, 94), foot: P(168, 108), glow: 0.3 },
      { pelvis: P(130, 138), torso: -96, hand: P(62, 124), foot: P(188, 118), glow: 0.6 },
      { pelvis: P(130, 130), torso: -102, hand: P(38, 142), foot: P(206, 126), glow: 0.95 },
    ]),
    muscles: { main: ['abs'], also: ['obliques', 'quads'] },
    hold: 'none',
    guide: {
      main: ['Deep abs'], also: ['Obliques', 'Hip flexors'],
      phases: ['Lie on your back, arms straight up, hips and knees bent at 90°', 'Slowly lower one arm overhead and straighten the opposite leg', 'Arm and leg hovering just above the floor, lower back pressed down', 'Bring them back and switch sides'],
      dos: ['Press your lower back flat into the floor the whole time', 'Move slowly and breathe out as you reach', 'Move the opposite arm and leg together', 'Stop reaching if your back starts to lift'],
      donts: ['Letting your lower back arch off the floor', 'Rushing the reps', 'Holding your breath'],
      callouts: [{ follow: 'pelvis', text: 'Back pressed down', x: 234, y: 60, anchor: 'end' }],
    },
  });
}

// ---------- arms ----------
{
  const curlKeys = (x: number): Anim['keys'] => [
    { pelvis: P(118, 77), torso: 0, hand: { rx: 0.5, ry: 53 }, foot: P(x, 151), glow: 0.2 },
    { pelvis: P(118, 77), torso: 0, hand: { rx: 18.4, ry: 46.4 }, foot: P(x, 151), glow: 0.5 },
    { pelvis: P(118, 77), torso: 0, hand: { rx: 26, ry: 28 }, foot: P(x, 151), glow: 0.8 },
    { pelvis: P(118, 77), torso: 0, hand: { rx: 22.5, ry: 15 }, foot: P(x, 151), glow: 0.95 },
    { pelvis: P(118, 77), torso: 0, hand: { rx: 15, ry: 7 }, foot: P(x, 151), glow: 1 },
  ];
  const regions: Anim['regions'] = [
    { bone: 'upperArm', t0: 0.12, t1: 0.92, side: 'front', off: 3, w: 10 },
    { bone: 'forearm', t0: 0.1, t1: 0.6, side: 'front', w: 7, also: true },
  ];
  const anim: Anim = { armBend: -1, legBend: 1, keys: curlKeys(118), regions };
  const bad = alt(anim, [
    { pelvis: P(118, 77), torso: 0, hand: { rx: 0.5, ry: 53 }, foot: P(118, 151), glow: 0.2 },
    { pelvis: P(118, 77), torso: -10, hand: { rx: 26, ry: 40 }, foot: P(118, 151), glow: 0.5 },
    { pelvis: P(118, 77), torso: -18, hand: { rx: 36, ry: 20 }, foot: P(118, 151), glow: 0.8 },
    { pelvis: P(118, 77), torso: -20, hand: { rx: 34, ry: 8 }, foot: P(118, 151), glow: 0.95 },
  ]);
  const muscles = { main: ['biceps'] as MuscleId[], also: ['forearms'] as MuscleId[] };
  const phases: [string, string, string, string] = ['Stand tall, arms hanging, elbows at your sides', 'Curl up, keeping your elbows still', 'Squeeze at the top, biceps tight', 'Lower slowly until your arms are almost straight'];
  const callouts = [{ follow: 'elbow' as const, text: 'Elbow stays still', x: 6, y: 80 }, { follow: 'hand' as const, text: 'Squeeze at the top', x: 234, y: 24, anchor: 'end' as const }];
  const donts = ['Swinging your body to throw the weight up', 'Letting your elbows drift forward', 'Dropping the weight fast on the way down'];
  add('hammerCurl', {
    anim, bad, muscles: { main: ['biceps'], also: ['forearms'] }, hold: 'db',
    guide: {
      main: ['Biceps', 'Forearms'], also: ['Brachialis (under the biceps)'], phases, callouts, donts,
      dos: ['Hold the dumbbells with your palms facing each other, like holding a hammer', 'Keep your elbows pinned beside your ribs', 'Keep your wrists straight, not bent back', 'Take about 2 seconds to lower the weight'],
    },
  });
  add('cableCurl', {
    anim, bad, muscles, hold: 'handle',
    guide: {
      main: ['Biceps'], also: ['Forearms'], phases, callouts, donts: ['Swinging your body to pull the cable', 'Letting your elbows drift forward', 'Letting the weight stack crash on the way down'],
      dos: ['Stand close enough that the cable is tight even at the bottom', 'Keep your elbows pinned beside your ribs', 'Squeeze your biceps at the top for a moment', 'Take about 2 seconds to lower: the cable keeps the tension on'],
    },
  });
  add('ropeCurl', {
    anim, bad, muscles: { main: ['biceps'], also: ['forearms'] }, hold: 'rope',
    guide: {
      main: ['Biceps', 'Forearms'], also: ['Brachialis (under the biceps)'], phases, callouts, donts: ['Swinging your body to pull the cable', 'Letting your elbows drift forward', 'Letting the weight stack crash on the way down'],
      dos: ['Hold the rope with your palms facing each other', 'Keep your elbows pinned beside your ribs', 'Pull the rope ends slightly apart as you finish', 'Take about 2 seconds to lower'],
    },
  });
}
{
  const keys: Anim['keys'] = [
    { pelvis: P(116, 77), torso: 6, hand: { rx: 26, ry: 28 }, foot: P(118, 151), glow: 0.3 },
    { pelvis: P(116, 77), torso: 6, hand: { rx: 18.4, ry: 46.4 }, foot: P(118, 151), glow: 0.65 },
    { pelvis: P(116, 77), torso: 6, hand: { rx: 1, ry: 53.5 }, foot: P(118, 151), glow: 1 },
  ];
  const anim: Anim = { armBend: -1, legBend: 1, keys, regions: [{ bone: 'upperArm', t0: 0.1, t1: 0.92, side: 'back', off: 3, w: 11 }] };
  const bad = alt(anim, [
    { pelvis: P(116, 77), torso: 26, hand: { rx: 34, ry: 18 }, foot: P(118, 151), glow: 0.3 },
    { pelvis: P(116, 77), torso: 32, hand: { rx: 30, ry: 38 }, foot: P(118, 151), glow: 0.65 },
    { pelvis: P(116, 77), torso: 36, hand: { rx: 18, ry: 52 }, foot: P(118, 151), glow: 1 },
  ]);
  const phases: [string, string, string, string] = ['Elbows at your sides, hands at chest height', 'Push the rope down until your arms are straight', 'Arms locked out, rope ends pulled apart, triceps squeezed', 'Let the rope rise slowly, elbows still pinned'];
  const callouts = [{ follow: 'elbow' as const, text: 'Elbow pinned', x: 6, y: 80 }, { follow: 'hand' as const, text: 'Lock out, squeeze', x: 234, y: 120, anchor: 'end' as const }];
  add('ropePushdown', {
    anim, bad, muscles: { main: ['triceps'], also: ['forearms'] }, hold: 'rope',
    guide: {
      main: ['Triceps'], also: [], phases, callouts,
      dos: ['Pin your elbows against your ribs the whole time', 'Pull the rope ends apart at the bottom to squeeze harder', 'Lean forward just slightly and keep your chest up', 'Control the rope on the way back up'],
      donts: ['Letting your elbows swing forward as the rope goes up', 'Leaning over and pushing with your body weight', 'Using weight so heavy that your shoulders roll forward'],
    },
  });
  add('singleRopeExt', {
    anim, bad, muscles: { main: ['triceps'], also: ['forearms'] }, hold: 'rope',
    guide: {
      main: ['Triceps'], also: [], phases, callouts,
      dos: ['Work one arm at a time, with the other hand on your hip or the machine', 'Pin your elbow against your side the whole time', 'Straighten your arm fully and squeeze at the bottom', 'Keep your body still and your shoulders level'],
      donts: ['Letting your elbow swing forward as the rope rises', 'Twisting your body toward the working arm', 'Using so much weight that you lean over the cable'],
    },
  });
}

// ---------- which exercise uses which pattern (ids are the exercise names, lower-cased and dashed) ----------
const slug = (n: string) => n.toLowerCase().replace(/[()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const EXERCISE_PATTERN: Record<string, string> = {};
const use = (pattern: string, names: string[]) => names.forEach((n) => { EXERCISE_PATTERN[slug(n)] = pattern; });
use('incline', ['Smith incline press', 'DB incline press', 'Incline machine press']);
use('machinePress', ['Converging chest press', 'Machine chest press']);
use('pecFly', ['Pec fly machine']);
use('cableFly', ['Cable fly']);
use('row', ['Cable row V-handle', 'Wide-grip cable row', 'Seated machine row']);
use('straightArm', ['Straight-arm cable pulldown']);
use('backExt', ['Back extension', 'Glute hyperextension']);
use('facePull', ['Face pull', 'Rope face pull']);
use('shoulderMachine', ['Machine shoulder press']);
use('smithShoulder', ['Smith shoulder press']);
use('lateral', ['DB lateral raise']);
use('cableLateral', ['Cable lateral raise']);
use('rearFly', ['Pec fly reverse (rear delt)']);
use('rearFlyBent', ['Cable rear delt fly']);
use('pulldown', ['Neutral-grip pulldown']);
use('legPress', ['Leg press']);
use('legPressHigh', ['Leg press feet high']);
use('legPressCalf', ['Leg press calf raise']);
use('legExt', ['Leg extension']);
use('smithSquat', ['Smith squat']);
use('barbellRdl', ['Romanian deadlift']);
use('deadlift', ['DB deadlift']);
use('seatedCurl', ['Seated leg curl']);
use('lyingCurl', ['Lying leg curl']);
use('hipThrust', ['Hip thrust']);
use('smithHipThrust', ['Smith hip thrust', 'Machine hip thrust']);
use('singleHipThrust', ['Single-leg hip thrust']);
use('kickback', ['Cable glute kickback']);
use('kickbackMachine', ['Glute kickback machine']);
use('abductionMachine', ['Hip abduction machine']);
use('cableAbduction', ['Cable hip abduction']);
use('stepUp', ['DB step-up']);
use('pullThrough', ['Cable pull-through']);
use('sumoSquat', ['DB sumo squat']);
use('calfRaise', ['Calf raise machine']);
use('cableCrunch', ['Cable crunch']);
use('hangKnee', ['Hanging knee raise']);
use('deadBug', ['Dead bug']);
use('hammerCurl', ['Hammer curl']);
use('cableCurl', ['Cable curl']);
use('ropeCurl', ['Rope hammer curl']);
use('ropePushdown', ['Rope pushdown']);
use('singleRopeExt', ['Single-arm rope extension']);
