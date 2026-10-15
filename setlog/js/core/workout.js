// The running workout: starting one, the grey placeholders next to every set,
// checking sets off, supersets, warm-ups, the focus metric and finishing.
// Everything works on the active draft (the shape both apps store, see
// drafts.js) and changes it in place; the apps own the state around it.
// Messages are English translation keys (WORKOUT_MESSAGES), translated by the UI.
import { uid, numToInput, parseNum } from './units.js';
import {
  usesWeight, setIsValid, loggedFields, warmupSets, newRecords, countsVolume, setVolume, isWorking,
} from './calc.js';
import {
  newSetDraft, setToDraft, draftToSet, entryToDraft, newEntryDraft, remapSupersets, draftEntries,
} from './drafts.js';

export const SET_TYPES = ['normal', 'warmup', 'drop', 'failure'];
/** Rest timer choices per exercise (seconds; 0 = off). */
export const REST_CHOICES = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
/** Rest timer started by hand. */
export const REST_PRESETS = [30, 60, 90, 120, 150, 180, 240, 300];
export const RPE_CHOICES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

export const WORKOUT_MESSAGES = {
  weightFirst: 'Enter the weight first',
  repsFirst: 'Enter reps first',
  distOrTimeFirst: 'Enter distance or time first',
  timeFirst: 'Enter a time first',
  warmupNeedsWeight: 'Enter the weight of your first working set first',
  warmupTooLight: 'That weight is too light for warm-up sets',
};

/** The default name for a workout started at `t` (an English key). */
export function workoutNameKey(t) {
  const h = new Date(t).getHours();
  if (h < 5) return 'Night Workout';
  if (h < 12) return 'Morning Workout';
  if (h < 17) return 'Afternoon Workout';
  if (h < 22) return 'Evening Workout';
  return 'Night Workout';
}

/**
 * A new running workout: empty, from a template (its sets become grey
 * targets) or again from a finished workout. `name` is the (translated)
 * default name for an empty one.
 * @param {{ template?: any, fromWorkout?: any, hasExercise?: (id: string) => boolean, settings: any, now?: number, name?: string }} [o]
 */
export function newActiveWorkout({
  template = null, fromWorkout = null, hasExercise = () => true, settings, now = Date.now(), name = '',
} = {}) {
  let exercises = [];
  let templateNotes = '';
  if (template) {
    name = template.name;
    templateNotes = template.notes || '';
    exercises = remapSupersets(template.exercises.filter((e) => hasExercise(e.exerciseId))
      .map((e) => entryToDraft(e, settings, { asTemplateTargets: true })));
  } else if (fromWorkout) {
    name = fromWorkout.name;
    exercises = remapSupersets(fromWorkout.exercises.filter((e) => hasExercise(e.exerciseId))
      .map((e) => entryToDraft({ ...e, notes: '' }, settings, { asTemplateTargets: true })));
  }
  return {
    id: uid(),
    kind: 'workout',
    name,
    notes: '',
    startedAt: now,
    templateId: template && !template.example ? template.id : null,
    templateNotes,
    exercises,
    rest: null,
    updatedAt: now,
  };
}

/** The template a draft belongs to (for "previous values from the same template"). */
export const draftTemplateId = (draft) => (draft.kind === 'template' ? draft.id : draft.templateId || null);

/** Rest after a set of this entry: its own, else the exercise's, else the default. */
export function restFor(entry, ex, defaultRest) {
  if (entry.restSec !== null && entry.restSec !== undefined) return entry.restSec;
  if (ex && ex.restSec !== null && ex.restSec !== undefined) return ex.restSec;
  return defaultRest;
}

/**
 * The grey placeholder strings and the "previous" set for each row of an
 * entry: last time's set (warm-ups pair with warm-ups), else the template's
 * target, else whatever the row above has.
 */
export function placeholders(entry, prevSets, settings) {
  const prevWarm = (prevSets || []).filter((s) => s.type === 'warmup');
  const prevWork = (prevSets || []).filter((s) => s.type !== 'warmup');
  let wi = 0, ki = 0;
  let lastPh = null;
  return entry.sets.map((s) => {
    const p = s.type === 'warmup' ? prevWarm[wi++] : prevWork[ki++];
    let ph;
    if (p) ph = setToDraft(p, settings);
    else if (s.tpl) ph = setToDraft(s.tpl, settings);
    else if (lastPh) ph = lastPh;
    else ph = { w: '', r: '', d: '', t: '' };
    // next rows fall back to what this row has (typed values beat placeholders)
    lastPh = {
      w: s.w || ph.w, r: s.r || ph.r, d: s.d || ph.d, t: s.t || ph.t,
    };
    return { prev: p || null, ph };
  });
}

/** Copy a placeholder value into a set, with the stored number behind it (no rounding drift). */
export function fillFrom(set, f, ph) {
  set[f] = ph[f];
  if (ph.orig && ph.orig[f]) set.orig = { ...(set.orig || {}), [f]: ph.orig[f] };
}

const blank = (v) => !String(v || '').trim();

/** A copy of the set with its empty fields taken from the placeholder, as checking it off does. */
export function completeSet(set, ph, cat) {
  const filled = { ...set };
  for (const f of loggedFields(cat)) if (blank(filled[f]) && ph[f]) fillFrom(filled, f, ph);
  if (usesWeight(cat) && blank(filled.w) && (cat === 'weighted_bw' || cat === 'assisted_bw')) filled.w = '0';
  return filled;
}

/** Why a set can't be saved yet (a WORKOUT_MESSAGES text), or null if it can. */
export function setProblem(set, cat, settings) {
  const c = draftToSet(set, settings);
  if (setIsValid(c, cat)) return null;
  if (usesWeight(cat)) return c.r > 0 ? WORKOUT_MESSAGES.weightFirst : WORKOUT_MESSAGES.repsFirst;
  if (cat === 'reps') return WORKOUT_MESSAGES.repsFirst;
  if (cat === 'cardio') return WORKOUT_MESSAGES.distOrTimeFirst;
  return WORKOUT_MESSAGES.timeFirst;
}

/**
 * Check off set `i` of `entry`: empty fields come from the placeholders.
 * Returns { problem } when it can't be checked off yet (the set keeps what
 * was filled in, like the web app always did), else { rest } with the
 * seconds of rest to start (0 for none).
 */
export function checkOffSet(draft, entry, i, { category, ph, rest, settings }) {
  const set = entry.sets[i];
  Object.assign(set, completeSet(set, ph, category));
  const problem = setProblem(set, category, settings);
  if (problem) return { problem };
  set.done = true;
  // inside a superset the rest starts after the last exercise of the round
  if (entry.supersetId) {
    const group = draft.exercises.filter((e) => e.supersetId === entry.supersetId);
    if (group[group.length - 1] !== entry) return { rest: 0 };
  }
  if (!(rest > 0)) return { rest: 0 };
  return { rest: set.type === 'warmup' ? Math.min(rest, 60) : rest };
}

/** Copy the previous set's values into a row (tapping the "Previous" column). */
export function copyPrevious(set, prev, cat, settings) {
  if (!prev || set.done) return false;
  const d = setToDraft(prev, settings);
  for (const f of loggedFields(cat)) fillFrom(set, f, d);
  return true;
}

/**
 * Unchecked sets the user started typing into, completed from the
 * placeholders like checking them off would. Returns [{ set, filled }] for
 * the ones that would be valid. `previousSets(exerciseId, templateId)` looks
 * up last time's sets.
 */
export function pendingSets(draft, { exercises, previousSets, settings }) {
  const out = [];
  for (const entry of draft.exercises) {
    const ex = exercises.get(entry.exerciseId);
    if (!ex) continue;
    const fields = loggedFields(ex.category);
    const rows = placeholders(entry, previousSets(entry.exerciseId, draftTemplateId(draft)), settings);
    entry.sets.forEach((set, i) => {
      if (set.done || !fields.some((f) => !blank(set[f]))) return;
      const filled = completeSet(set, rows[i].ph, ex.category);
      if (!setProblem(filled, ex.category, settings)) out.push({ set, filled });
    });
  }
  return out;
}

/** How much a running workout holds: checked sets, and unchecked sets with typed numbers. */
export function progressOf(a) {
  let done = 0, typed = 0;
  for (const e of a.exercises) {
    for (const s of e.sets) {
      if (s.done) done++;
      else if (['w', 'r', 'd', 't'].some((k) => !blank(s[k]))) typed++;
    }
  }
  return { done, typed };
}

/**
 * The finished workout to save. `mode` 'done' keeps only checked sets, 'all'
 * also unchecked sets that are valid as typed. `defaultName` is used when the
 * name was cleared.
 */
export function finishWorkout(a, { settings, exercises, now = Date.now(), mode = 'done', defaultName = '' }) {
  return {
    id: a.id,
    name: (a.name || '').trim() || defaultName,
    notes: (a.notes || '').trim(),
    startedAt: a.startedAt,
    endedAt: Math.max(now, a.startedAt + 60000),
    templateId: a.templateId || null,
    exercises: draftEntries(a, settings, exercises, { onlyDone: mode === 'done' }),
  };
}

// ---------- editing the list ----------
/** New entries for picked exercises, with as many sets as last time (templates get at least 3). */
export function newEntries(exerciseIds, { previousSets, kind = 'workout' }) {
  return exerciseIds.map((id) => {
    const prev = previousSets(id);
    const count = prev ? Math.min(prev.filter((s) => s.type !== 'warmup').length || 1, 6) : 1;
    return newEntryDraft(id, kind === 'template' ? Math.max(count, 3) : count);
  });
}

/** Add a set at the end; after a drop set comes another drop set. */
export function addSet(entry) {
  const last = entry.sets[entry.sets.length - 1];
  entry.sets.push(newSetDraft(last && last.type === 'drop' ? 'drop' : 'normal'));
}

/** Move an item of a list from one place to another. */
export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return false;
  const [x] = list.splice(from, 1);
  list.splice(to, 0, x);
  return true;
}

/** Put `entry` into a superset with `other`: it joins other's group (or they start one) and moves next to it. */
export function joinSuperset(list, entry, other) {
  const old = entry.supersetId;
  const id = other.supersetId || uid();
  other.supersetId = id;
  entry.supersetId = id;
  if (old && old !== id) {
    const left = list.filter((e) => e.supersetId === old);
    if (left.length < 2) for (const e of left) e.supersetId = null;
  }
  // keep the group together: this entry goes right after the group's last one
  list.splice(list.indexOf(entry), 1);
  const lastOfGroup = list.map((e, i) => (e.supersetId === id ? i : -1)).filter((i) => i >= 0).pop();
  list.splice(lastOfGroup + 1, 0, entry);
}

export function leaveSuperset(list, entry) {
  const id = entry.supersetId;
  entry.supersetId = null;
  const rest = list.filter((e) => e.supersetId === id);
  if (rest.length < 2) for (const e of rest) e.supersetId = null;
}

/** Superset letter (A, B, …) and index for every group, in list order. */
export function supersetLetters(list) {
  const out = new Map();
  for (const e of list) if (e.supersetId && !out.has(e.supersetId)) out.set(e.supersetId, { index: out.size, letter: String.fromCharCode(65 + out.size) });
  return out;
}

/** Swap the exercise of an entry. Values go when the new one logs different fields. */
export function replaceExercise(entry, oldEx, newEx) {
  const sameKind = newEx && oldEx && loggedFields(newEx.category).join() === loggedFields(oldEx.category).join();
  entry.exerciseId = newEx.id;
  if (!sameKind) for (const s of entry.sets) { s.w = ''; s.r = ''; s.d = ''; s.t = ''; s.done = false; delete s.orig; }
  for (const s of entry.sets) delete s.tpl;
  // the rest timer and focus metric belonged to the old exercise
  entry.restSec = null;
  if (!focusOptions(newEx.category).includes(entry.focus)) entry.focus = null;
}

/**
 * Put warm-up sets in front of the first working set (replacing unchecked
 * warm-ups). Weights are worked out in the unit you lift in, so lb dumbbells
 * land on 5 lb steps. Returns { added } or { problem }.
 */
export function addWarmups(entry, rows, cat, settings) {
  const firstWork = entry.sets.findIndex((s) => s.type !== 'warmup');
  const src = firstWork >= 0 ? (parseNum(entry.sets[firstWork].w) ?? parseNum(rows[firstWork].ph.w)) : null;
  if (!src) return { problem: WORKOUT_MESSAGES.warmupNeedsWeight };
  const st = settings;
  const ws = warmupSets(src, st.bar, st.plates, cat === 'barbell', st.warmup, st.unit === 'lb' ? 5 : 2);
  if (!ws.length) return { problem: WORKOUT_MESSAGES.warmupTooLight };
  entry.sets = entry.sets.filter((s) => !(s.type === 'warmup' && !s.done));
  entry.sets.unshift(...ws.map((x) => newSetDraft('warmup', { w: numToInput(x.w), r: String(x.r) })));
  return { added: ws.length };
}

/** Would this checked set beat the stored records? Same rules as the summary's records. */
export function isLiveRecord(set, cat, bests, settings, now = Date.now()) {
  if (!bests || !set.done || set.type === 'warmup') return false;
  return newRecords(draftToSet(set, settings), cat, bests, settings.formula, now).length > 0;
}

// ---------- focus metric ----------
// One number per exercise the user wants to push (Strong's "focus metric"),
// from the sets as they stand (typed values, else the grey placeholders),
// compared with the previous session.
export const FOCUS_LABEL = {
  volume: 'Total volume', volumeChange: 'Volume increase', reps: 'Total reps', weightPerRep: 'Weight/rep', repsChange: 'Reps increase',
};
export function focusOptions(cat) {
  if (usesWeight(cat) && countsVolume(cat)) return ['volume', 'volumeChange', 'reps', 'weightPerRep'];
  if (cat === 'reps' || cat === 'assisted_bw') return ['reps', 'repsChange'];
  return [];
}
export function focusValues(entry, rows, cat, prevSets, settings, now = Date.now()) {
  const cur = entry.sets.map((s, i) => draftToSet({ ...s, w: s.w || rows[i].ph.w, r: s.r || rows[i].ph.r }, settings))
    .filter((s) => isWorking(s) && s.r > 0);
  const prev = (prevSets || []).filter((s) => isWorking(s) && s.r > 0);
  const sum = (list, f) => list.reduce((a, s) => a + f(s), 0);
  const vol = sum(cur, (s) => setVolume(s, cat, now));
  const pvol = sum(prev, (s) => setVolume(s, cat, now));
  const reps = sum(cur, (s) => s.r);
  const preps = sum(prev, (s) => s.r);
  return {
    volume: vol,
    volumeChange: pvol > 0 && vol > 0 ? (vol - pvol) / pvol : null,
    reps,
    weightPerRep: reps > 0 && vol > 0 ? vol / reps : null,
    repsChange: preps > 0 && reps > 0 ? (reps - preps) / preps : null,
  };
}
