// "Set up" tips shown by the (i) button on an exercise: how to adjust the machine and stand or sit, in one or two short
// sentences with distances in steps. Kept short on purpose, so it can be read between sets.

export const SETUP: Record<string, string> = {
  // Chest
  'smith-flat-press': 'Lie with your eyes under the bar, feet flat, shoulder blades pinched back. Set the bar to hit your lower chest.',
  'db-flat-press': 'Sit with the dumbbells on your knees, lie back and kick them up. Feet flat, shoulder blades pinched back.',
  'converging-chest-press': 'Adjust the seat so the handles are level with your mid chest. Back flat on the pad, shoulders down.',
  'machine-chest-press': 'Adjust the seat so the handles are level with your mid chest. Back flat on the pad, shoulders down.',
  'smith-incline-press': 'Set the bench to a low slope, about two notches up. Eyes under the bar, bar to your upper chest.',
  'db-incline-press': 'Set the bench to a low slope, about two notches up. Back flat on the pad, shoulder blades pinched.',
  'incline-machine-press': 'Adjust the seat so the handles are level with your upper chest. Back flat on the pad.',
  'pec-fly-machine': 'Adjust the seat so the handles are at chest height. Back flat, elbows slightly bent.',
  'cable-fly': 'Cables at shoulder height. Take one step forward, lean slightly, arms wide with a soft bend in the elbows.',
  'barbell-bench-press': 'Lie with your eyes under the bar, feet flat, shoulder blades pinched back. Use safety catches or a spotter.',
  'push-up': 'Hands just wider than your shoulders, body in a straight line. Knees down if it is too hard.',

  // Back
  'lat-pulldown-wide': 'Adjust the thigh pad so it just touches your thighs. Grip a little wider than your shoulders, sit tall.',
  'neutral-grip-pulldown': 'Adjust the thigh pad so it just touches your thighs. Palms facing each other, sit tall.',
  'single-arm-cable-pulldown': 'Cable at the top, sit or kneel one step back. Reach up with one hand, chest tall.',
  'assisted-pull-up': 'Kneel on the pad and set a weight that lets you do your reps. Grip a little wider than your shoulders.',
  'cable-row-v-handle': 'Sit tall with knees slightly bent, feet on the plates. Reach forward with straight arms, chest up.',
  'wide-grip-cable-row': 'Sit tall with knees slightly bent, feet on the plates. Grip wide, chest up.',
  'single-arm-cable-row': 'Cable at chest height, one step back. Slight knee bend, chest tall, reach forward.',
  'seated-machine-row': 'Adjust the seat so the handles are at mid chest. Chest against the pad, arms straight to start.',
  'straight-arm-cable-pulldown': 'Cable at the top, take two steps back. Lean forward a little, arms straight, hands shoulder-width.',
  'db-row': 'One hand and one knee on a bench, back flat. Dumbbell hanging straight down.',
  'back-extension': 'Adjust the pad so it sits below your hips. Cross your arms and keep your body in one line.',

  // Shoulders
  'face-pull': 'Cable at face height. Take two steps back, grip the rope, elbows high.',
  'rope-face-pull': 'Cable at face height. Take two steps back, grip the rope, elbows high.',
  'db-shoulder-press': 'Sit with your back against the pad. Dumbbells at shoulder height, forearms straight up.',
  'machine-shoulder-press': 'Adjust the seat so the handles start at shoulder height. Back flat on the pad.',
  'smith-shoulder-press': 'Set the bench upright and sit under the bar. Bar starts at your chin, forearms straight up.',
  'db-lateral-raise': 'Stand tall, soft knees, a slight forward lean. Dumbbells at your sides.',
  'cable-lateral-raise': 'Cable at the bottom. Stand side-on, one step away, hand across your body.',
  'pec-fly-reverse-rear-delt': 'Face the pad and adjust the seat so the handles are at shoulder height. Chest on the pad.',
  'cable-rear-delt-fly': 'Cables at shoulder height, cross them over. Take one step back, slight forward lean.',

  // Biceps
  'barbell-curl': 'Stand tall, feet shoulder-width apart. Grip shoulder-width, elbows at your sides.',
  'db-curl': 'Stand tall, feet shoulder-width apart. Elbows at your sides, palms forward.',
  'hammer-curl': 'Stand tall, feet shoulder-width apart. Palms facing each other, elbows at your sides.',
  'incline-db-curl': 'Set the bench to a slope and lean back. Arms hang straight down behind your body.',
  'cable-curl': 'Cable at the bottom. Take one step back, elbows at your sides.',
  'rope-hammer-curl': 'Cable at the bottom with the rope. Take one step back, elbows at your sides.',

  // Triceps
  'bar-pushdown': 'Cable at the top. Stand two steps back, lean forward a little, elbows glued to your ribs.',
  'rope-pushdown': 'Cable at the top. Stand two steps back, lean forward a little, elbows glued to your ribs.',
  'overhead-cable-extension': 'Cable at the top, face away from it. Take two steps forward, one foot ahead, elbows by your ears.',
  'single-arm-rope-extension': 'Cable at the top. Stand two steps back, elbow glued to your ribs.',

  // Legs
  'leg-press': 'Adjust the seat so your knees bend to about 90°. Feet shoulder-width apart in the middle of the plate.',
  'leg-press-feet-high': 'Adjust the seat so your knees bend to about 90°. Feet shoulder-width apart, high on the plate.',
  'leg-extension': 'Adjust the back so your knees line up with the machine joint. Pad rests on your lower shins.',
  'romanian-deadlift': 'Stand with the bar over your mid foot, feet hip-width apart. Soft knees, push your hips back.',
  'db-romanian-deadlift': 'Stand with feet hip-width apart, dumbbells in front of your thighs. Soft knees, push your hips back.',
  'db-deadlift': 'Stand with feet hip-width apart, dumbbells at your sides. Hips back, flat back, dumbbells close to your legs.',
  'seated-leg-curl': 'Adjust the back so your knees line up with the machine joint. Pad sits just above your heels.',
  'lying-leg-curl': 'Lie face down with your knees just off the edge of the pad. Pad sits just above your heels.',
  'calf-raise-machine': 'Adjust the pad to your shoulders. Balls of your feet on the edge, heels hanging down.',
  'leg-press-calf-raise': 'Sit in the leg press with only the balls of your feet on the bottom of the plate. Legs straight, heels hanging.',
  'goblet-squat': 'Hold one dumbbell at your chest. Feet shoulder-width apart, toes slightly out.',
  'smith-squat': 'Bar on your upper back, feet a little in front of the bar. Feet shoulder-width apart.',
  'barbell-back-squat': 'Bar on your upper back, not your neck. Feet shoulder-width apart, set the safety bars below your lowest depth.',
  'split-squat': 'Take one big step forward, back heel up. Dumbbells at your sides, torso upright.',
  'walking-lunge': 'Dumbbells at your sides. Take long steps with room ahead of you, torso upright.',
  'hip-thrust': 'Upper back against a bench, bar over your hips with a pad. Feet flat, knees bent about 90° at the top.',
  'glute-bridge': 'Lie on your back, knees bent, feet flat. Dumbbell resting on your hips.',
  'cable-glute-kickback': 'Ankle strap on, cable at the bottom. Hold the frame, lean forward slightly.',
  'hip-abduction-machine': 'Sit with your back against the pad. Pads on the outside of your knees, feet on the plates.',
  'db-step-up': 'Use a box about knee height. Dumbbells at your sides, whole foot on the box.',

  // Core
  'cable-crunch': 'Cable at the top with a rope. Kneel two steps back, rope beside your head.',
  'hanging-knee-raise': 'Hang from the bar with straight arms. Shoulders down, no swinging.',
  'dead-bug': 'Lie on your back, knees bent over your hips, arms straight up. Lower back pressed to the floor.',
};

/** The weight rule shown under the tip, for exercises that use a weight. */
export const WEIGHT_RULE = (reps: number) => `Pick a weight you can do ${reps} reps with. Start light.`;
