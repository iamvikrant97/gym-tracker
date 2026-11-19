// Muscle ids shared by the body map (front and back view) and the moving muscle figure (side view).
import type { AnimId } from './formGuides';
import { PATTERNS } from './patterns';

export type MuscleId =
  | 'traps' | 'front-delts' | 'side-delts' | 'rear-delts' | 'chest' | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'obliques' | 'lats' | 'lower-back' | 'glutes' | 'quads' | 'hamstrings' | 'adductors' | 'calves';

export const LABELS: Record<MuscleId, string> = {
  traps: 'Traps', 'front-delts': 'Front shoulders', 'side-delts': 'Side shoulders', 'rear-delts': 'Rear shoulders',
  chest: 'Chest', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', abs: 'Abs', obliques: 'Obliques',
  lats: 'Lats', 'lower-back': 'Lower back', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings',
  adductors: 'Inner thighs', calves: 'Calves',
};

/** From the side the three shoulder heads are one shape, obliques sit with the abs, and inner thighs with the quads. */
export const sideShape = (id: MuscleId): MuscleId =>
  id === 'front-delts' || id === 'side-delts' || id === 'rear-delts' ? 'front-delts' : id === 'obliques' ? 'abs' : id === 'adductors' ? 'quads' : id;

export const MUSCLES: Record<AnimId, { main: MuscleId[]; also: MuscleId[] }> = {
  bench: { main: ['chest'], also: ['front-delts', 'triceps'] },
  pulldown: { main: ['lats'], also: ['biceps', 'rear-delts', 'traps', 'forearms'] },
  press: { main: ['front-delts', 'side-delts'], also: ['triceps', 'traps', 'chest'] },
  curl: { main: ['biceps'], also: ['forearms'] },
  pushdown: { main: ['triceps'], also: ['forearms'] },
  rdl: { main: ['hamstrings', 'glutes'], also: ['lower-back', 'forearms', 'traps'] },
  squat: { main: ['quads', 'glutes'], also: ['hamstrings', 'adductors', 'calves', 'abs'] },
};

for (const [id, p] of Object.entries(PATTERNS)) MUSCLES[id] = p.muscles;
