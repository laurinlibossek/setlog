// Default settings, shared by every app. Stored settings are merged over these,
// so a backup from an older version gets new settings at their defaults.
import { DEFAULT_WARMUP } from './calc.js';

export const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

export const DEFAULT_SETTINGS = {
  unit: 'kg',
  distUnit: 'km',
  defaultRest: 120,
  sound: true,
  keepAwake: true,
  showExamples: true,
  askTemplateUpdate: true,
  language: 'auto', // 'auto' | 'en' | 'de'
  templateSort: 'name',
  formula: 'epley',
  dumbbellTwice: false,
  bwWeighted: false,
  bwAssisted: false,
  historyStart: null, // ms; workouts before it are ignored for previous values, records and charts
  prevSource: 'any', // 'any' | 'template'
  warmup: DEFAULT_WARMUP,
  bodyUnit: null, // null = same as the lifting unit
  sizeUnit: null, // null = cm with km, in with mi
  weekStart: 1,
  weeklyGoal: 3,
  theme: 'system', // 'system' | 'light' | 'dark' | 'strawberry-matcha' | 'intense-red'
  bar: 20,
  plates: KG_PLATES,
};

/** The stored settings over the defaults. */
export const withDefaults = (stored) => ({ ...DEFAULT_SETTINGS, ...(stored || {}) });
