export type Muscle = 'Chest' | 'Back' | 'Shoulders' | 'Biceps' | 'Triceps' | 'Quads' | 'Hamstrings' | 'Calves' | 'Abs' | 'Other';
export type Group = 'CB' | 'L' | 'SA';
/** Vik's ids are 'CB-A' ... 'SA-B'; plans made in the setup flow use their own ids ('fb-a', 'ul-upper-a', 'ppl-push-a', 'c1-ab12', ...). */
export type SessionId = string;

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
  /** Bodyweight move: always 0 kg, progresses by reps only. */
  bodyweight?: boolean;
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
  /** Rotation by body-part group and A/B variant (Vik's split). Plans without it simply take turns, in order. */
  group?: Group;
  variant?: 'A' | 'B';
  items: TemplateItem[];
}

/**
 * A training plan is data: sessions in order, which weekdays are training days, and the weekly target.
 * Stored in the settings row. The built-in plan 'vik' is stored without sessions (they come from the code).
 */
export interface Plan {
  /** 'vik', 'fullbody', 'upperlower', 'ppl' or 'custom'. */
  id: string;
  name: string;
  sessions: SessionTemplate[];
  /** Training weekdays, 0 = Sunday ... 6 = Saturday (JS Date.getDay). */
  days: number[];
  weeklyTarget: number;
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
  /**
   * Rest changed by hand (+15 or Skip) after the set done at `after` (its doneAt). endsAt null = skipped.
   * Ignored once another set is done, so the next rest starts from the exercise default again.
   */
  rest?: { after: number; endsAt: number | null };
  /** Closed by the idle rule (not by Finish): it can be continued the same day. */
  autoEnded?: true;
  /** Exercises added to this workout only ("Add exercise"), in the order added. Each has its own sets, next to the session's. */
  extras?: string[];
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
  /** Body weight in kg, used for the calorie estimate. */
  bodyKg: number;
  /** The one-time "weight per arm" note was confirmed. */
  perArmConfirmed?: boolean;
  /** permanent swaps */
  templateOverrides: Partial<Record<SessionId, Record<string, string>>>;
  /** Exercises added to a session for good ("Keep in this session from now on"), after the session's own exercises. */
  templateExtras?: Partial<Record<SessionId, TemplateItem[]>>;
  /** The active training plan. Missing on a brand-new install (the setup flow runs). */
  plan?: Plan;
  /** Names of sessions from plans that were replaced, so old sets keep their label in the calendar and summary. */
  retiredSessions?: Record<SessionId, string>;
  /** Greeting name. Written as 'Vik' when an existing install is migrated; new installs leave it unset (plain greeting). Backups carry it. */
  userName?: string;
  /** Optional names for the greeting by time of day; a missing slot uses userName. */
  greetNames?: GreetNames;
  /** The "Ready to change things up?" hint on Home was dismissed (shown once). */
  planHintDismissed?: boolean;
}

export interface GreetNames {
  morning?: string;
  afternoon?: string;
  evening?: string;
  night?: string;
}
