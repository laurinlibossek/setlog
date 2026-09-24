// Sample data for the online preview only (window.SETLOG_PREVIEW). The real
// app starts empty. Everything generated here is flagged `sample: true`.
import { uid, slug, addDays, startOfDay } from './util.js';

const id = (name) => 'x-' + slug(name);

// [exercise, start kg, kg added per session, reps per set, warm-ups?]
const PLAN = {
  Push: [
    ['Bench Press (Barbell)', 62.5, 1.25, [8, 8, 7], true],
    ['Incline Bench Press (Dumbbell)', 22, 0.35, [10, 10, 9]],
    ['Seated Overhead Press (Dumbbell)', 18, 0.35, [10, 9, 8]],
    ['Lateral Raise (Dumbbell)', 8, 0.15, [15, 14, 12]],
    ['Triceps Pushdown - Rope (Cable)', 25, 0.4, [12, 12, 11]],
  ],
  Pull: [
    ['Deadlift (Barbell)', 100, 2.5, [5, 5, 5], true],
    ['Lat Pulldown (Cable)', 55, 0.7, [10, 10, 9]],
    ['Seated Row (Cable)', 55, 0.7, [10, 10, 10]],
    ['Face Pull (Cable)', 20, 0.3, [15, 15, 15]],
    ['Bicep Curl (Dumbbell)', 12, 0.2, [12, 11, 10]],
  ],
  Legs: [
    ['Squat (Barbell)', 80, 2, [6, 6, 6], true],
    ['Romanian Deadlift (Barbell)', 70, 1.5, [8, 8, 8]],
    ['Leg Press (Machine)', 140, 3, [10, 10, 10]],
    ['Lying Leg Curl (Machine)', 40, 0.6, [12, 12, 11]],
    ['Standing Calf Raise (Machine)', 60, 1, [12, 12, 12]],
  ],
};

const round = (w, step) => Math.round(w / step) * step;

export function buildSampleData() {
  const workouts = [];
  const today = startOfDay(Date.now());
  const days = [];
  // Mon / Wed / Fri over the last 8 weeks, plus the odd Saturday
  for (let d = 56; d >= 1; d--) {
    const t = addDays(today, -d);
    const wd = new Date(t).getDay();
    if (wd === 1 || wd === 3 || wd === 5 || (wd === 6 && d % 3 === 0)) days.push(t);
  }
  const order = ['Push', 'Pull', 'Legs'];
  const counts = { Push: 0, Pull: 0, Legs: 0 };
  days.forEach((day, i) => {
    const name = order[i % 3];
    const k = counts[name]++;
    const start = day + (17 * 60 + 40 + (i % 4) * 10) * 60000;
    const exercises = PLAN[name].map(([ex, base, inc, reps, warm]) => {
      const step = base >= 40 ? 2.5 : base >= 15 ? 1 : 0.5;
      const w = round(base + inc * k, step);
      const sets = [];
      if (warm) {
        sets.push({ id: uid(), type: 'warmup', w: 20, r: 10 });
        sets.push({ id: uid(), type: 'warmup', w: round(w * 0.6, 2.5), r: 5 });
      }
      reps.forEach((r, j) => sets.push({ id: uid(), type: 'normal', w, r: j === reps.length - 1 && k % 4 === 3 ? r + 1 : r }));
      return { id: uid(), exerciseId: id(ex), sets };
    });
    workouts.push({
      id: 'sample-' + i,
      name,
      notes: '',
      startedAt: start,
      endedAt: start + (52 + (i * 7) % 18) * 60000,
      templateId: null,
      exercises,
      sample: true,
    });
  });
  const measurements = [];
  let bw = 80.2;
  for (let d = 56; d >= 0; d -= 3) {
    bw += -0.08 + Math.sin(d) * 0.25;
    measurements.push({ id: uid(), type: 'bodyweight', value: Math.round(bw * 10) / 10, at: addDays(today, -d) + 7 * 3600000, sample: true });
  }
  return { workouts, measurements };
}
