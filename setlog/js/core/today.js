// Today, the store app's first tab: the week strip, sets per muscle and the
// size of the routine that is up next. Labels are English translation keys.
import { startOfDay, startOfWeek, addDays } from './units.js';
import { BODY_PARTS } from './seed.js';
import { restFor } from './workout.js';

const lookup = (exercises) => (exercises instanceof Map ? (id) => exercises.get(id) : (id) => exercises?.[id]);

/** Index of the day a time falls on in a list of day starts, or -1. */
function dayIndex(days, t) {
  for (let i = days.length - 1; i >= 0; i--) if (t >= days[i]) return t < addDays(days[i], 1) ? i : -1;
  return -1;
}

/**
 * The current week for the week strip: each day from `weekStart` with the
 * sessions done on it, and which days are still planned to reach the weekly
 * goal. Without a block there is no schedule, so a planned day is one the
 * person usually trains on (a weekday with at least 2 workouts in the 8 weeks
 * before this one, most often first), from today on and without a session yet,
 * until the goal is covered.
 * Returns { days: [{ start, done, planned }], today (index), done, goal }.
 */
export function weekStrip(workouts, { weekStart = 1, goal = 3, now = Date.now() } = {}) {
  const first = startOfWeek(now, weekStart);
  const starts = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  const days = starts.map((start) => ({ start, done: 0, planned: false }));
  const since = addDays(first, -56);
  const habit = new Array(7).fill(0); // workouts per weekday (getDay) in the 8 weeks before
  let done = 0;
  for (const w of workouts) {
    const i = dayIndex(starts, w.startedAt);
    if (i >= 0) { days[i].done++; done++; } else if (w.startedAt >= since && w.startedAt < first) habit[new Date(w.startedAt).getDay()]++;
  }
  const today = dayIndex(starts, startOfDay(now));
  const left = Math.max(0, goal - done);
  days
    .map((d, i) => ({ i, n: habit[new Date(d.start).getDay()] }))
    .filter(({ i, n }) => i >= today && n >= 2 && !days[i].done)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, left)
    .forEach(({ i }) => { days[i].planned = true; });
  return { days, today, done, goal };
}

// Body parts that are muscles, in the order Sets per muscle lists them.
const MUSCLES = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full'];

/**
 * Working sets per muscle (the exercise's body part) over the last `days`
 * days including today. Warm-ups and cardio don't count. Only muscles with
 * sets, in a fixed order: [{ muscle, label, sets }].
 */
export function setsPerMuscle(workouts, exercises, { days = 7, now = Date.now() } = {}) {
  const get = lookup(exercises);
  const since = startOfDay(addDays(now, -(days - 1)));
  const counts = new Map();
  for (const w of workouts) {
    if (w.startedAt < since || w.startedAt > now) continue;
    for (const e of w.exercises) {
      const part = get(e.exerciseId)?.bodyPart;
      if (!MUSCLES.includes(part)) continue;
      const n = e.sets.filter((s) => s.type !== 'warmup').length;
      if (n) counts.set(part, (counts.get(part) || 0) + n);
    }
  }
  return BODY_PARTS.filter((b) => counts.has(b.id)).map((b) => ({ muscle: b.id, label: b.label, sets: counts.get(b.id) }));
}

// Rough time per set, for the estimate on a routine card.
const WORK_SEC = 45, WARMUP_SEC = 30, WARMUP_REST_SEC = 60;

/**
 * A routine's size for its card: exercises, working sets and about how many
 * minutes it takes (each set's work plus the rest after it, the last set
 * without; rounded to 5 minutes). Exercises missing from the library are left out.
 */
export function routineSize(template, exercises, { defaultRest = 120 } = {}) {
  const get = lookup(exercises);
  const entries = template.exercises.filter((e) => get(e.exerciseId));
  let sets = 0, sec = 0, all = 0, lastRest = 0;
  for (const e of entries) {
    const rest = restFor(e, get(e.exerciseId), defaultRest) || 0;
    for (const s of e.sets) {
      all++;
      lastRest = s.type === 'warmup' ? Math.min(rest, WARMUP_REST_SEC) : rest;
      if (s.type === 'warmup') sec += WARMUP_SEC + lastRest;
      else { sets++; sec += WORK_SEC + lastRest; }
    }
  }
  sec -= lastRest; // nothing to rest for after the last set
  const minutes = all ? Math.max(5, Math.round(sec / 60 / 5) * 5) : 0;
  return { exercises: entries.length, sets, minutes };
}
