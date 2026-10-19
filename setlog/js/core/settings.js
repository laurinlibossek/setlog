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
  restAlert: true, // iPhone/Android app: a notification when rest is over and the app isn't open
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

/**
 * Settings after changing one. Switching the lifting unit swaps the default
 * plates and bar for the other unit's (custom plates are kept).
 * @param {any} settings
 * @param {string} key
 * @param {any} value
 */
export function changeSetting(settings, key, value) {
  const next = { ...settings, [key]: value };
  if (key === 'unit' && settings.unit !== value) {
    const plates = JSON.stringify(settings.plates);
    if (value === 'lb' && plates === JSON.stringify(KG_PLATES)) { next.plates = LB_PLATES; next.bar = 45; }
    if (value === 'kg' && plates === JSON.stringify(LB_PLATES)) { next.plates = KG_PLATES; next.bar = 20; }
  }
  return next;
}
