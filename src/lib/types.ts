export type Muscle = 'Chest' | 'Back' | 'Shoulders' | 'Biceps' | 'Triceps' | 'Quads' | 'Hamstrings' | 'Calves' | 'Abs' | 'Other';
export type Group = 'CB' | 'L' | 'SA';
export type SessionId = 'CB-A' | 'CB-B' | 'L-A' | 'L-B' | 'SA-A' | 'SA-B';

export interface Exercise {
  id: string;
  name: string;
  slot: string;
  muscle: Muscle;
  kind: 'compound' | 'isolation';
  step: number;
  repMin: number;
  repMax: number;
  restSec: number;
  perArm?: boolean;
  assisted?: boolean;
  note?: string;
}

export interface TemplateItem {
  exerciseId: string;
  sets: number;
  /** Per-session rep range overriding the library range. */
  repMin?: number;
  repMax?: number;
}

export interface SessionTemplate {
  id: SessionId;
  name: string;
  group: Group;
  variant: 'A' | 'B';
  items: TemplateItem[];
}

export interface SetLog {
  id: string;
  workoutId: string;
  date: string;
  sessionId: SessionId | 'Other';
  exerciseId: string;
  setNo: number;
  kg: number;
  reps: number;
  warmup: boolean;
  feltIt: boolean;
  note?: string;
  doneAt: number;
  updatedAt: number;
  deleted: boolean;
  synced: boolean;
}

export interface Workout {
  id: string;
  date: string;
  sessionId: SessionId;
  startedAt: number;
  endedAt?: number;
  /** template exerciseId -> chosen exerciseId for this workout */
  swaps: Record<string, string>;
}

export interface Settings {
  scriptUrl?: string;
  scriptKey?: string;
  spotifyClientId?: string;
  paused: boolean;
  weeklyTarget: number;
  restOverrides: Record<string, number>;
  stepOverrides: Record<string, number>;
  pinnedPlaylists: string[];
  /** permanent swaps */
  templateOverrides: Partial<Record<SessionId, Record<string, string>>>;
}
