// The app's data, in the same shape the Setlog web app stores and backs up:
// weights in kg, distances in km, times in seconds, timestamps in ms.

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';
export type Category =
  | 'barbell' | 'dumbbell' | 'machine' | 'weighted_bw' | 'assisted_bw' | 'reps' | 'cardio' | 'duration';

export interface WorkSet {
  id: string;
  type: SetType;
  w?: number;
  r?: number;
  d?: number;
  t?: number;
  rpe?: number;
}

export interface Entry {
  id: string;
  exerciseId: string;
  sets: WorkSet[];
  notes?: string;
  supersetId?: string;
  restSec?: number;
  focus?: string;
}

export interface Workout {
  id: string;
  name: string;
  notes?: string;
  startedAt: number;
  endedAt: number;
  templateId: string | null;
  exercises: Entry[];
  source?: string;
}

export type TemplateSet = Omit<WorkSet, 'id'>;
export interface TemplateEntry extends Omit<Entry, 'id' | 'sets'> {
  sets: TemplateSet[];
}

export interface Template {
  id: string;
  name: string;
  folder?: string;
  notes?: string;
  exercises: TemplateEntry[];
  archived?: boolean;
  lastUsedAt?: number;
  createdAt?: number;
  example?: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  category: Category;
  bodyPart: string;
  builtin?: boolean;
  hidden?: boolean;
  notes?: string;
  pinnedNote?: string;
  restSec?: number;
  imported?: boolean;
  createdAt?: number;
}

export interface Measurement {
  id: string;
  type: string;
  value: number;
  at: number;
}

export type ThemeSetting = 'system' | 'light' | 'dark' | 'strawberry-matcha' | 'intense-red';
export type LanguageSetting = 'auto' | 'en' | 'de';

export interface Settings {
  unit: 'kg' | 'lb';
  distUnit: 'km' | 'mi';
  theme: ThemeSetting;
  language: LanguageSetting;
  showExamples: boolean;
  weeklyGoal: number;
  weekStart: number;
  formula: string;
  historyStart: number | null;
  dumbbellTwice: boolean;
  bwWeighted: boolean;
  bwAssisted: boolean;
  bodyUnit: 'kg' | 'lb' | null;
  sizeUnit: 'cm' | 'in' | null;
  [key: string]: unknown;
}

export interface Profile {
  name: string;
}

export type Meta = Record<string, unknown> & { seedVersion?: number; lastBackupAt?: number };

export interface Kv {
  settings?: Partial<Settings>;
  profile?: Partial<Profile>;
  meta?: Meta;
}

/** Everything that is stored; also the `data` part of a backup file. */
export interface Data {
  exercises: Exercise[];
  workouts: Workout[];
  templates: Template[];
  measurements: Measurement[];
  kv: Kv;
}

export type StoreName = 'exercises' | 'workouts' | 'templates' | 'measurements';
export const STORES: StoreName[] = ['exercises', 'workouts', 'templates', 'measurements'];
