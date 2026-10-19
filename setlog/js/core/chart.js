// Chart maths shared by the apps' charts: round axis steps and the time
// ranges the chart screens offer. Drawing is each app's job.
import { startOfWeek, addDays } from './units.js';

const TIME_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];

function niceStep(range, count, time) {
  const raw = range / count;
  if (time) return TIME_STEPS.find((s) => s >= raw) || Math.ceil(raw / 3600) * 3600;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/** Round axis values from min to max, about `count` steps (seconds-friendly steps with `time`). */
export function niceTicks(min, max, count = 4, { zero = false, time = false } = {}) {
  if (zero) min = Math.min(0, min);
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad; max += pad;
    if (zero) min = Math.max(0, min);
  }
  const step = niceStep(max - min, count, time);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Decimals for axis labels with these ticks. */
export const tickDecimals = (ticks) => {
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  return step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
};

/** Range choices in days (0 = everything) for exercise and measurement charts. */
export const EXERCISE_RANGES = [{ value: 90, label: '3M' }, { value: 182, label: '6M' }, { value: 365, label: '1Y' }, { value: 0, label: 'All' }];
export const MEASURE_RANGES = [{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: 'All' }];

/** Workouts per week for the last `weeks` weeks (oldest first): [{ start, value }]. */
export function weeklyCounts(workouts, { weeks = 12, weekStart = 1, now = Date.now() } = {}) {
  const thisWeek = startOfWeek(now, weekStart);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 7);
    out.push({ start, value: workouts.filter((w) => w.startedAt >= start && w.startedAt < end).length });
  }
  return out;
}

/** Weeks in a row (up to this one) with at least `goal` workouts; this week counts once it's reached. */
export function weekStreak(workouts, { goal = 1, weekStart = 1, now = Date.now() } = {}) {
  const count = (s) => workouts.filter((w) => w.startedAt >= s && w.startedAt < addDays(s, 7)).length;
  let week = startOfWeek(now, weekStart);
  let streak = 0;
  if (count(week) >= goal) streak++;
  week = addDays(week, -7);
  while (count(week) >= goal && streak < 520) { streak++; week = addDays(week, -7); }
  return streak;
}
