// Demo data for the store screenshots only (not the test backup): about 16 weeks
// of a 4-day upper/lower split (Mon, Tue, Thu, Fri) up to yesterday, with steady
// progression and one deload week (half the sets at the same weights, so the
// estimated 1RM stays flat instead of dipping). Intermediate numbers, short
// template names, no personal name, weekly body weight. Deterministic for a given day.
//
// As a backup file to restore in the app (iOS Simulator, a phone), for the real screenshots:
//   node tests/browser/store-demo.mjs en > store-demo-en.json
import { fileURLToPath } from 'node:url';
import { SEED_EXERCISES, SEED_VERSION, makeBackup, parseBackup } from '../../setlog/js/core/index.js';

const DAY = 86400000;
const WEEKS = 16;
const DELOAD = 8; // the 9th week

// [exercise id, warm-up?, working sets, reps, start kg, kg added per week, rest s]
// Reps-only exercises use kg null. Accessories add a little load every other week.
const PLAN = {
  upperA: { en: 'Upper A', de: 'Oberkörper A', day: 0, ex: [
    ['x-bench-press-barbell', true, 4, 6, 80, 1.25, 180],
    ['x-bent-over-row-barbell', false, 4, 8, 70, 1.25, 150],
    ['x-seated-overhead-press-dumbbell', false, 3, 10, 22, 0.5, 120],
    ['x-lat-pulldown-cable', false, 3, 10, 60, 1.25, 90],
    ['x-bicep-curl-dumbbell', false, 3, 12, 12, 0.25, 60],
  ] },
  lowerA: { en: 'Lower A', de: 'Unterkörper A', day: 1, ex: [
    ['x-squat-barbell', true, 4, 5, 105, 1.25, 180],
    ['x-romanian-deadlift-barbell', false, 3, 8, 90, 1.25, 150],
    ['x-leg-press-machine', false, 3, 10, 160, 2.5, 120],
    ['x-lying-leg-curl-machine', false, 3, 12, 40, 0.5, 90],
    ['x-standing-calf-raise-machine', false, 3, 12, 70, 1.25, 60],
  ] },
  upperB: { en: 'Upper B', de: 'Oberkörper B', day: 3, ex: [
    ['x-overhead-press-barbell', true, 4, 6, 50, 0.625, 180],
    ['x-pull-up', false, 4, 8, null, 0, 120],
    ['x-incline-bench-press-dumbbell', false, 3, 10, 28, 0.5, 120],
    ['x-seated-row-cable', false, 3, 10, 65, 1.25, 90],
    ['x-triceps-pushdown-cable', false, 3, 12, 30, 0.5, 60],
  ] },
  lowerB: { en: 'Lower B', de: 'Unterkörper B', day: 4, ex: [
    ['x-deadlift-barbell', true, 3, 5, 135, 1.25, 180],
    ['x-bulgarian-split-squat-dumbbell', false, 3, 10, 18, 0.5, 120],
    ['x-hip-thrust-barbell', false, 3, 10, 100, 2.5, 120],
    ['x-leg-extension-machine', false, 3, 12, 50, 1.25, 90],
    ['x-hanging-leg-raise', false, 3, 12, null, 0, 60],
  ] },
};

// a small deterministic random, so minutes and durations vary a little but every run is the same
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const round = (kg, step) => Math.round(kg / step) * step;

/** The weight of an exercise in week `w` (deload weeks repeat the week before). */
function weightAt([, , , , start, perWeek], w) {
  if (start === null) return null;
  const weeks = w > DELOAD ? w - 1 : Math.min(w, DELOAD - 1);
  const step = start >= 40 ? 1.25 : 0.5;
  return round(start + perWeek * weeks, step);
}

const pullUpReps = (w) => 6 + Math.min(4, Math.floor((w > DELOAD ? w - 1 : w) / 3)); // 6 → 10
const legRaiseReps = (w) => 10 + Math.min(5, Math.floor((w > DELOAD ? w - 1 : w) / 3));

function setsFor(ex, w, deload, idPrefix) {
  const [id, warm, n, reps] = ex;
  const kg = weightAt(ex, w);
  const r = id === 'x-pull-up' ? pullUpReps(w) : id === 'x-hanging-leg-raise' ? legRaiseReps(w) : reps;
  const sets = [];
  if (warm && kg) sets.push({ id: `${idPrefix}-w`, type: 'warmup', w: round(kg * 0.5, 2.5), r: 8 });
  for (let i = 0; i < (deload ? Math.ceil(n / 2) : n); i++) sets.push({ id: `${idPrefix}-${i}`, type: 'normal', ...(kg === null ? {} : { w: kg }), r });
  return sets;
}

/** The demo data in the app's storage format, for `localStorage['increment.data']`. */
export function demoData(lang, now = Date.now()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const first = new Date(monday); first.setDate(monday.getDate() - 7 * (WEEKS - 1));
  const rand = rng(Number(today.getTime() / DAY));
  const templates = Object.entries(PLAN).map(([key, p], i) => ({
    id: `demo-${key}`, name: p[lang] || p.en, notes: '', createdAt: first.getTime() - DAY, updatedAt: first.getTime() - DAY,
    exercises: p.ex.map((ex) => ({ exerciseId: ex[0], restSec: ex[6], sets: setsFor(ex, WEEKS - 1, false, `t${i}`).map(({ id, ...s }) => s) })),
  }));
  const workouts = [];
  for (let w = 0; w < WEEKS; w++) {
    for (const [key, p] of Object.entries(PLAN)) {
      const day = new Date(first); day.setDate(first.getDate() + 7 * w + p.day);
      if (day >= today) continue;
      const start = day.getTime() + (17 * 60 + 45 + Math.floor(rand() * 40)) * 60000;
      const minutes = (w === DELOAD ? 42 : 58) + Math.floor(rand() * 14);
      workouts.push({
        id: `demo-${key}-${w}`, name: p[lang] || p.en, notes: '', templateId: `demo-${key}`,
        startedAt: start, endedAt: start + minutes * 60000,
        exercises: p.ex.map((ex, j) => ({ id: `demo-${key}-${w}-${j}`, exerciseId: ex[0], sets: setsFor(ex, w, w === DELOAD, `demo-${key}-${w}-${j}`) })),
      });
    }
  }
  const measurements = [];
  for (let w = 0; w < WEEKS; w++) {
    const at = first.getTime() + 7 * w * DAY + 7.5 * 3600000;
    if (at < today.getTime()) measurements.push({ id: `demo-bw-${w}`, type: 'bodyweight', value: Math.round((80.6 + w * 0.11 + (rand() - 0.5) * 0.4) * 10) / 10, at });
  }
  const data = {
    exercises: SEED_EXERCISES.map((e) => ({ ...e })),
    workouts, templates, measurements,
    kv: {
      settings: { unit: 'kg', distUnit: 'km', defaultRest: 120, showExamples: false, language: lang, theme: 'system', weekStart: 1, weeklyGoal: 4, formula: 'epley', prevSource: 'any' },
      profile: { name: '' },
      meta: { lastBackupAt: now - DAY, seedVersion: SEED_VERSION },
    },
  };
  // through the backup format, so the result is exactly what a restore would store
  return parseBackup(makeBackup(data, 'demo', new Date(now)), SEED_EXERCISES).data;
}

// node tests/browser/store-demo.mjs en|de  → a backup file on stdout
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lang = process.argv[2] === 'de' ? 'de' : 'en';
  process.stdout.write(makeBackup(demoData(lang), 'demo'));
}
