// Templates: comparing a finished workout with the template it came from,
// writing it back, and cleaning template data. Plain data in, plain data out.
import { remapSupersets } from './drafts.js';

const VALUE_KEYS = ['w', 'r', 'd', 't'];
const setType = (s) => s.type || 'normal';
const setBucket = (s) => (setType(s) === 'warmup' ? 'warmup' : 'work');

/** "exerciseId#n" per entry, so the n-th Bench Press pairs with the n-th Bench Press. */
function entryKeys(entries) {
  const n = new Map();
  return entries.map((e) => {
    const i = n.get(e.exerciseId) || 0;
    n.set(e.exerciseId, i + 1);
    return `${e.exerciseId}#${i}`;
  });
}
/** For each template entry, the index of the matching workout entry (or -1). */
function pairEntries(tplEntries, woEntries) {
  const tk = entryKeys(tplEntries), wk = entryKeys(woEntries);
  const at = new Map(wk.map((k, i) => [k, i]));
  return { pairs: tk.map((k) => (at.has(k) ? at.get(k) : -1)), tk, wk };
}
/**
 * For each template set, the index of the workout set it lines up with (or -1).
 * Warm-ups pair with warm-ups and working sets with working sets, each in order,
 * so skipping a warm-up doesn't shift the working weights onto it.
 */
function pairSets(tplSets, woSets) {
  const pos = { warmup: [], work: [] };
  woSets.forEach((s, i) => pos[setBucket(s)].push(i));
  const used = { warmup: 0, work: 0 };
  return tplSets.map((s) => {
    const b = setBucket(s);
    const j = pos[b][used[b]++];
    return j === undefined ? -1 : j;
  });
}
function sameValues(a, b) {
  for (const k of VALUE_KEYS) {
    const x = a[k] ?? null, y = b[k] ?? null;
    if ((x === null) !== (y === null)) return false;
    if (x !== null && Math.abs(x - y) > 1e-6) return false;
  }
  return true;
}
function templateSet(type, from) {
  const o = { type };
  for (const k of [...VALUE_KEYS, 'rpe']) if (from[k] !== null && from[k] !== undefined) o[k] = from[k];
  return o;
}
/** Superset grouping as "key → first key of its group", over the given keys only. */
function supersetLeaders(entries, keys, only) {
  const leader = new Map(), first = new Map();
  entries.forEach((e, i) => {
    const k = keys[i];
    if (!only.has(k)) return;
    if (!e.supersetId) { leader.set(k, k); return; }
    if (!first.has(e.supersetId)) first.set(e.supersetId, k);
    leader.set(k, first.get(e.supersetId));
  });
  return leader;
}

/**
 * What finishing `workout` would change in `template`.
 * `structure` is true when exercises, their order, set counts, set types or
 * supersets differ; `valueSets` counts template sets whose numbers would change
 * with "Update values only"; `added` and `removed` are the exercise ids of the
 * entries only the workout or only the template has.
 */
export function templateChanges(template, workout) {
  const T = template.exercises, W = workout.exercises;
  const { pairs, tk, wk } = pairEntries(T, W);
  const c = {
    addedExercises: 0, removedExercises: 0, reordered: false, addedSets: 0, removedSets: 0,
    typesChanged: false, supersetsChanged: false, valueSets: 0, structure: false,
    added: [], removed: [],
  };
  const order = [];
  const matched = new Set();
  pairs.forEach((wi, ti) => {
    if (wi < 0) { c.removedExercises++; c.removed.push(T[ti].exerciseId); return; }
    order.push(wi);
    matched.add(tk[ti]);
    const ts = T[ti].sets, ws = W[wi].sets;
    const sp = pairSets(ts, ws);
    let paired = 0;
    sp.forEach((j, i) => {
      if (j < 0) { c.removedSets++; return; }
      paired++;
      if (setType(ts[i]) !== setType(ws[j])) c.typesChanged = true;
      if (!sameValues(ts[i], ws[j])) c.valueSets++;
    });
    c.addedSets += ws.length - paired;
    // same set types, but in another order (a warm-up moved after a working set)
    if (ts.length === ws.length && ts.some((s, i) => setType(s) !== setType(ws[i]))) c.typesChanged = true;
  });
  c.addedExercises = W.length - order.length;
  c.added = W.filter((e, wi) => !order.includes(wi)).map((e) => e.exerciseId);
  c.reordered = order.some((w, i) => i > 0 && w < order[i - 1]);
  const lt = supersetLeaders(T, tk, matched), lw = supersetLeaders(W, wk, matched);
  c.supersetsChanged = [...matched].some((k) => lt.get(k) !== lw.get(k));
  c.structure = !!(c.addedExercises || c.removedExercises || c.reordered || c.addedSets || c.removedSets
    || c.typesChanged || c.supersetsChanged);
  return c;
}
/** Did a finished workout change the structure of its template? */
export const templateDiffers = (template, workout) => templateChanges(template, workout).structure;

/**
 * The template's exercises after saving a finished workout into it. `valuesOnly`
 * keeps the template's exercises and sets and copies the performed numbers into
 * the matching sets; otherwise the workout's structure and numbers replace them.
 */
export function applyWorkoutToTemplate(templateExercises, workout, { valuesOnly = false } = {}) {
  const { pairs } = pairEntries(templateExercises, workout.exercises);
  if (valuesOnly) {
    return templateExercises.map((e, ti) => {
      const wi = pairs[ti];
      if (wi < 0) return e;
      const ws = workout.exercises[wi].sets;
      const sp = pairSets(e.sets, ws);
      return { ...e, sets: e.sets.map((s, i) => (sp[i] < 0 ? s : templateSet(setType(s), ws[sp[i]]))) };
    });
  }
  const tplOf = new Map();
  pairs.forEach((wi, ti) => { if (wi >= 0) tplOf.set(wi, templateExercises[ti]); });
  return workout.exercises.map((e, wi) => {
    const out = { exerciseId: e.exerciseId, sets: e.sets.map((s) => templateSet(setType(s), s)) };
    const notes = tplOf.get(wi)?.notes; // keep the template's own exercise notes
    if (notes) out.notes = notes;
    if (e.supersetId) out.supersetId = e.supersetId;
    if (e.restSec !== null && e.restSec !== undefined) out.restSec = e.restSec;
    if (e.focus) out.focus = e.focus;
    return out;
  });
}

// ---------- progressive overload ----------
// What "better" means per kind of exercise, compared key by key: more weight
// (or, for assisted exercises, less assistance), then more reps; for timed
// exercises more time; for cardio more distance, then more time.
const BETTER = {
  barbell: [['w', 1], ['r', 1]],
  dumbbell: [['w', 1], ['r', 1]],
  machine: [['w', 1], ['r', 1]],
  weighted_bw: [['w', 1], ['r', 1]],
  assisted_bw: [['w', -1], ['r', 1]],
  reps: [['r', 1]],
  duration: [['t', 1]],
  cardio: [['d', 1], ['t', 1]],
};
const valueOf = (s, k) => (Number.isFinite(Number(s[k])) && s[k] !== null && s[k] !== '' ? Number(s[k]) : 0);
const hasNumbers = (s) => VALUE_KEYS.some((k) => valueOf(s, k) !== 0);

/**
 * Compares a done set with the routine's set for an exercise of `category`:
 * 1 when the done set is better, 0 when it's as good, -1 when it's worse.
 * More weight wins, or the same weight and more reps; for assisted exercises
 * less assistance; for time and distance, more. A routine set without numbers
 * is beaten by any done set that has some.
 */
export function compareSets(routineSet, doneSet, category) {
  if (!hasNumbers(doneSet)) return hasNumbers(routineSet) ? -1 : 0;
  if (!hasNumbers(routineSet)) return 1;
  for (const [k, dir] of BETTER[category] || BETTER.barbell) {
    const d = (valueOf(doneSet, k) - valueOf(routineSet, k)) * dir;
    if (d > 1e-6) return 1;
    if (d < -1e-6) return -1;
  }
  return 0;
}

/** The routine set with the done set's numbers; its own type and targets (RPE) stay. */
function raisedSet(routineSet, doneSet, type = setType(routineSet)) {
  const o = { ...routineSet, type };
  for (const k of VALUE_KEYS) if (doneSet[k] !== null && doneSet[k] !== undefined && doneSet[k] !== '') o[k] = doneSet[k];
  return o;
}

/**
 * A routine's exercises after a finished workout from it, for progressive
 * overload. Sets pair as in templateChanges (by exercise and occurrence,
 * warm-ups with warm-ups, working sets with working sets, in order); a paired
 * routine set takes the done set's numbers only when they're better
 * (compareSets), so a routine's numbers only ever go up. Skipped sets and
 * exercises keep theirs. With `layout`, the routine takes the workout's
 * exercises and sets instead: paired sets still only go up, new sets take
 * what was done, and the routine's own exercise notes stay.
 * `categoryOf(exerciseId)` gives each exercise's category.
 * Returns { exercises, raised }: `raised` counts the sets whose numbers went up.
 */
export function progressTemplate(templateExercises, workout, categoryOf, { layout = false } = {}) {
  const T = templateExercises, W = workout.exercises;
  const { pairs } = pairEntries(T, W);
  let raised = 0;
  const better = (r, d, exerciseId) => compareSets(r, d, categoryOf(exerciseId)) > 0;
  if (!layout) {
    const exercises = T.map((e, ti) => {
      const wi = pairs[ti];
      if (wi < 0) return e;
      const ws = W[wi].sets;
      const sp = pairSets(e.sets, ws);
      return {
        ...e,
        sets: e.sets.map((s, i) => {
          if (sp[i] < 0 || !better(s, ws[sp[i]], e.exerciseId)) return s;
          raised++;
          return raisedSet(s, ws[sp[i]]);
        }),
      };
    });
    return { exercises, raised };
  }
  const tplOf = new Map();
  pairs.forEach((wi, ti) => { if (wi >= 0) tplOf.set(wi, T[ti]); });
  const exercises = W.map((we, wi) => {
    const te = tplOf.get(wi);
    let sets;
    if (!te) sets = we.sets.map((s) => templateSet(setType(s), s));
    else {
      const routineOf = new Map();
      pairSets(te.sets, we.sets).forEach((j, i) => { if (j >= 0) routineOf.set(j, te.sets[i]); });
      sets = we.sets.map((s, j) => {
        const r = routineOf.get(j);
        if (!r) return templateSet(setType(s), s);
        if (!better(r, s, we.exerciseId)) return { ...r, type: setType(s) };
        raised++;
        return raisedSet(r, s, setType(s));
      });
    }
    const out = { exerciseId: we.exerciseId, sets };
    if (te?.notes) out.notes = te.notes; // the routine's own exercise notes stay
    if (we.supersetId) out.supersetId = we.supersetId;
    if (we.restSec !== null && we.restSec !== undefined) out.restSec = we.restSec;
    if (we.focus) out.focus = we.focus;
    return out;
  });
  return { exercises, raised };
}

/**
 * A template's exercises as stored: only known exercises, only the fields a
 * template keeps, fresh superset ids. `hasExercise(id)` says which exist.
 */
export function cleanTemplateExercises(exercises, hasExercise = () => true) {
  return remapSupersets(JSON.parse(JSON.stringify(exercises)).map((e) => ({
    exerciseId: e.exerciseId,
    notes: e.notes,
    supersetId: e.supersetId,
    restSec: e.restSec,
    focus: e.focus,
    sets: e.sets.map((s) => {
      const o = { type: s.type || 'normal' };
      for (const k of ['w', 'r', 'd', 't', 'rpe']) if (s[k] !== null && s[k] !== undefined) o[k] = s[k];
      return o;
    }),
  }))).filter((e) => hasExercise(e.exerciseId));
}
