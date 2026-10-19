// App state, persistence and all data actions. UI components subscribe to
// "topics" so a keystroke in the active workout doesn't re-render History.
import { tr } from './i18n.js';
import * as db from './db.js';
import { useEffect, useReducer } from './lib.js';
import { SEED_EXERCISES, SEED_VERSION } from './seed.js';
import { buildSampleData } from './demo.js';
import {
  buildStats, prsForNewWorkout, workoutVolume, configureCalc, sessionsByExercise,
} from './calc.js';
import { DEFAULT_SETTINGS, changeSetting } from './core/settings.js';
import {
  uid, debounce, workoutNameForTime,
} from './util.js';
import { convertDraftUnits } from './core/drafts.js';
import { newActiveWorkout, finishWorkout, newEntries } from './core/workout.js';
import { applyWorkoutToTemplate } from './core/templates.js';
import {
  copyTemplateRecord, folderNames, findExerciseByName as findByName, newExerciseRecord, exerciseInDraft, patchDraftExercise,
} from './core/editing.js';
import { suggestTemplate as suggestFrom } from './core/suggest.js';
import { previousSetsFrom, bodyweightFrom } from './core/sessions.js';

export { templateChanges, templateDiffers } from './core/templates.js';

export const APP_VERSION = '1.6.2';

export { DEFAULT_SETTINGS };

export const S = {
  ready: false,
  storage: 'ok', // 'ok' | 'memory'
  persisted: null,
  exercises: new Map(),
  workouts: [], // newest first
  templates: [],
  measurements: [],
  settings: { ...DEFAULT_SETTINGS },
  profile: { name: '' },
  meta: {},
  active: null,
  v: {},
};

// ---------- pub/sub ----------
const subs = new Map();
export function subscribe(topics, fn) {
  for (const t of topics) {
    if (!subs.has(t)) subs.set(t, new Set());
    subs.get(t).add(fn);
  }
  return () => { for (const t of topics) subs.get(t)?.delete(fn); };
}
export function emit(...topics) {
  const fns = new Set();
  for (const t of topics) {
    S.v[t] = (S.v[t] || 0) + 1;
    subs.get(t)?.forEach((f) => fns.add(f));
    subs.get('*')?.forEach((f) => fns.add(f));
  }
  fns.forEach((f) => f());
}
/** Re-render the calling component when any of the topics change. */
export function useStore(...topics) {
  const [, force] = useReducer((x) => x + 1, 0);
  const seen = topics.map((t) => S.v[t] || 0).join(',');
  useEffect(() => {
    const unsub = subscribe(topics, force);
    // an emit between this render and the subscription would otherwise be missed
    if (topics.map((t) => S.v[t] || 0).join(',') !== seen) force();
    return unsub;
  }, [topics.join(',')]);
  return S;
}

// Hooks the UI registers (toasts, timer sound) without a circular import.
export const ui = {
  toast: (msg) => console.log(msg),
  onRestDone: () => {},
  onSaveError: (e) => console.error(e),
};

// ---------- persistence ----------
function persist(p) {
  if (S.storage !== 'ok') return Promise.resolve();
  return p.catch((e) => { ui.onSaveError(e); throw e; }).catch(() => {});
}
const save = (store, obj) => persist(db.put(store, obj));
const saveMany = (store, arr) => persist(db.putMany(store, arr));
const remove = (store, id) => persist(db.del(store, id));
const saveKV = (k, v) => persist(db.kvSet(k, v));

const LS_ACTIVE = 'setlog.active';
function mirrorActive() {
  try {
    if (S.active) localStorage.setItem(LS_ACTIVE, JSON.stringify(S.active));
    else localStorage.removeItem(LS_ACTIVE);
  } catch (e) { /* storage may be unavailable */ }
}
const persistActive = debounce(() => {
  mirrorActive();
  saveKV('active', S.active ? JSON.parse(JSON.stringify(S.active)) : null);
}, 250);
export function flushActive() { persistActive.flush(); }

// ---------- loading ----------
export async function load() {
  let data = null;
  if (await db.probe()) {
    try { data = await db.loadAll(); } catch (e) { data = null; }
  }
  if (!data) {
    S.storage = 'memory';
    data = { exercises: [], workouts: [], templates: [], measurements: [], kv: {} };
  }
  applyData(data);

  // recover the active workout from whichever copy is newer
  let lsActive = null;
  try { lsActive = JSON.parse(localStorage.getItem(LS_ACTIVE) || 'null'); } catch (e) { lsActive = null; }
  if (lsActive && (!S.active || (lsActive.updatedAt || 0) > (S.active.updatedAt || 0))) S.active = lsActive;

  await ensureSeed();
  if (isPreview() && !S.meta.sampleLoaded && !S.workouts.length) await loadSampleData();
  S.ready = true;
  checkPersisted();
  if (S.active?.rest) watchRest();
  emit('exercises', 'workouts', 'templates', 'measurements', 'settings', 'profile', 'meta', 'active', 'ready');
}

function applyData(data) {
  S.exercises = new Map((data.exercises || []).map((e) => [e.id, e]));
  S.workouts = (data.workouts || []).slice().sort((a, b) => b.startedAt - a.startedAt);
  S.templates = data.templates || [];
  S.measurements = (data.measurements || []).slice().sort((a, b) => b.at - a.at);
  S.settings = { ...DEFAULT_SETTINGS, ...(data.kv?.settings || {}) };
  S.profile = { name: '', ...(data.kv?.profile || {}) };
  S.meta = { ...(data.kv?.meta || {}) };
  S.active = data.kv?.active || null;
  statsKey = '';
  syncCalc();
}

async function ensureSeed() {
  if ((S.meta.seedVersion || 0) >= SEED_VERSION && S.exercises.size) return;
  const added = [];
  for (const ex of SEED_EXERCISES) {
    if (!S.exercises.has(ex.id)) { S.exercises.set(ex.id, { ...ex }); added.push(ex); }
  }
  if (added.length) await saveMany('exercises', added);
  S.meta.seedVersion = SEED_VERSION;
  if (!S.meta.createdAt) S.meta.createdAt = Date.now();
  await saveKV('meta', S.meta);
}

export async function checkPersisted(request = false) {
  try {
    if (!navigator.storage) return;
    if (request && navigator.storage.persist) S.persisted = await navigator.storage.persist();
    else if (navigator.storage.persisted) S.persisted = await navigator.storage.persisted();
    emit('meta');
  } catch (e) { /* not supported */ }
}

// ---------- preview sample data ----------
export const isPreview = () => typeof window !== 'undefined' && !!window.SETLOG_PREVIEW;
async function loadSampleData() {
  const { workouts, measurements } = buildSampleData();
  S.workouts.push(...workouts);
  S.workouts.sort((a, b) => b.startedAt - a.startedAt);
  S.measurements.push(...measurements);
  S.measurements.sort((a, b) => b.at - a.at);
  await saveMany('workouts', workouts);
  await saveMany('measurements', measurements);
  S.meta.sampleLoaded = true;
  await saveKV('meta', { ...S.meta });
}
export const hasSampleData = () => S.workouts.some((w) => w.sample) || S.measurements.some((m) => m.sample);
export function clearSampleData() {
  const ws = S.workouts.filter((w) => w.sample);
  const ms = S.measurements.filter((m) => m.sample);
  S.workouts = S.workouts.filter((w) => !w.sample);
  S.measurements = S.measurements.filter((m) => !m.sample);
  for (const w of ws) remove('workouts', w.id);
  for (const m of ms) remove('measurements', m.id);
  emit('workouts', 'measurements');
}

// ---------- derived stats ----------
/** Body weight (kg) on or before `at`; the earliest one if `at` is before all of them. */
export const bodyweightAt = (at = Date.now()) => bodyweightFrom(S.measurements, at);
function syncCalc() {
  const st = S.settings;
  configureCalc({
    formula: st.formula, dumbbellTwice: !!st.dumbbellTwice, bwWeighted: !!st.bwWeighted, bwAssisted: !!st.bwAssisted, bodyweightAt,
  });
}
let statsCache = null;
let statsKey = '';
export function stats() {
  const st = S.settings;
  syncCalc();
  const key = [S.v.workouts || 0, S.v.exercises || 0, st.formula, st.dumbbellTwice, st.bwWeighted, st.bwAssisted,
    st.historyStart, st.bwWeighted || st.bwAssisted ? S.v.measurements || 0 : 0].join(':');
  if (key !== statsKey || !statsCache) {
    const from = st.historyStart || 0;
    statsCache = buildStats(from ? S.workouts.filter((w) => w.startedAt >= from) : S.workouts, S.exercises, st.formula);
    statsKey = key;
  }
  return statsCache;
}

/**
 * Every session of every exercise, ignoring "Start history from" (newest first).
 * For the History tab, counts and safety checks, which must see old workouts too.
 */
let allCache = null, allKey = -1;
export function allSessions(exerciseId) {
  if (allKey !== (S.v.workouts || 0) || !allCache) {
    allCache = sessionsByExercise(S.workouts);
    allKey = S.v.workouts || 0;
  }
  return exerciseId === undefined ? allCache : allCache.get(exerciseId) || [];
}

/**
 * Sets from the most recent earlier session of an exercise. With the "same
 * template" setting, sessions from the same template come first.
 */
export function previousSets(exerciseId, { before = Infinity, excludeWorkoutId = null, templateId = null } = {}) {
  return previousSetsFrom(stats().byExercise.get(exerciseId), {
    before, excludeWorkoutId, templateId: S.settings.prevSource === 'template' ? templateId : null,
  });
}

// ---------- settings / profile / meta ----------
export function setSetting(key, value) {
  const prev = { ...S.settings };
  Object.assign(S.settings, changeSetting(prev, key, value));
  if ((key === 'unit' || key === 'distUnit') && S.active) {
    convertDraftUnits(S.active, prev, S.settings);
    touchActive();
  }
  saveKV('settings', { ...S.settings });
  syncCalc();
  emit('settings');
}
export function setProfile(patch) {
  Object.assign(S.profile, patch);
  saveKV('profile', { ...S.profile });
  emit('profile');
}
export function setMeta(patch) {
  Object.assign(S.meta, patch);
  saveKV('meta', { ...S.meta });
  emit('meta');
}

// ---------- exercises ----------
let exListCache = null, exListKey = -1;
export function exerciseList() {
  if (exListKey !== S.v.exercises || !exListCache) {
    exListCache = [...S.exercises.values()].sort((a, b) => a.name.localeCompare(b.name));
    exListKey = S.v.exercises;
  }
  return exListCache;
}
export const exName = (id) => S.exercises.get(id)?.name || tr('Unknown exercise');

export const findExerciseByName = (name) => findByName(S.exercises, name);

export function addExercise({ name, category, bodyPart, notes = '' }) {
  const ex = newExerciseRecord({
    name, category, bodyPart, notes,
  }, { hasId: (id) => S.exercises.has(id) });
  S.exercises.set(ex.id, ex);
  save('exercises', ex);
  emit('exercises');
  return ex;
}
export function updateExercise(id, patch) {
  const ex = S.exercises.get(id);
  if (!ex) return;
  Object.assign(ex, patch);
  save('exercises', { ...ex });
  emit('exercises');
}
export function exerciseUsage(id) {
  const sessions = allSessions(id).length;
  const templates = S.templates.filter((t) => t.exercises.some((e) => e.exerciseId === id)).length;
  const inActive = !!S.active?.exercises.some((e) => e.exerciseId === id);
  return { sessions, templates, inActive };
}
export function deleteExercise(id) {
  S.exercises.delete(id);
  remove('exercises', id);
  // drop from templates
  for (const t of S.templates) {
    const before = t.exercises.length;
    t.exercises = t.exercises.filter((e) => e.exerciseId !== id);
    if (t.exercises.length !== before) save('templates', t);
  }
  emit('exercises', 'templates');
}
/**
 * Move all history/templates of `fromId` onto `intoId`, then delete `fromId`.
 * The target keeps its own rest timer and notes; ones it lacks come from the source.
 */
export function mergeExercise(fromId, intoId) {
  if (fromId === intoId) return;
  const from = S.exercises.get(fromId), into = S.exercises.get(intoId);
  if (from && into) {
    const patch = {};
    if ((into.restSec === null || into.restSec === undefined) && from.restSec !== null && from.restSec !== undefined) patch.restSec = from.restSec;
    if (!into.notes && from.notes) patch.notes = from.notes;
    if (!into.pinnedNote && from.pinnedNote) patch.pinnedNote = from.pinnedNote;
    if (Object.keys(patch).length) { Object.assign(into, patch); save('exercises', { ...into }); }
  }
  const changed = [];
  for (const w of S.workouts) {
    let hit = false;
    for (const e of w.exercises) if (e.exerciseId === fromId) { e.exerciseId = intoId; hit = true; }
    if (hit) changed.push(w);
  }
  if (changed.length) saveMany('workouts', changed);
  for (const t of S.templates) {
    let hit = false;
    for (const e of t.exercises) if (e.exerciseId === fromId) { e.exerciseId = intoId; hit = true; }
    if (hit) save('templates', t);
  }
  if (S.active) {
    for (const e of S.active.exercises) if (e.exerciseId === fromId) e.exerciseId = intoId;
    touchActive();
  }
  S.exercises.delete(fromId);
  remove('exercises', fromId);
  emit('exercises', 'workouts', 'templates');
}

// ---------- workouts ----------
export const getWorkout = (id) => S.workouts.find((w) => w.id === id) || null;

export function saveWorkout(w) {
  const i = S.workouts.findIndex((x) => x.id === w.id);
  if (i >= 0) S.workouts.splice(i, 1);
  S.workouts.push(w);
  S.workouts.sort((a, b) => b.startedAt - a.startedAt);
  save('workouts', w);
  emit('workouts');
}
/** Fill in notes on stored workouts: [{ id, notes?, entries: [[index, note]] }]. */
export function addWorkoutNotes(updates) {
  const changed = [];
  for (const u of updates) {
    const w = getWorkout(u.id);
    if (!w) continue;
    if (u.notes && !w.notes) w.notes = u.notes;
    for (const [i, note] of u.entries) if (w.exercises[i] && !w.exercises[i].notes) w.exercises[i].notes = note;
    changed.push(w);
  }
  if (changed.length) { saveMany('workouts', changed); emit('workouts'); }
  return changed.length;
}
export function deleteWorkout(id) {
  S.workouts = S.workouts.filter((w) => w.id !== id);
  remove('workouts', id);
  emit('workouts');
}

// ---------- templates ----------
export const getTemplate = (id) => S.templates.find((t) => t.id === id) || null;
export function saveTemplate(t) {
  t.updatedAt = Date.now();
  const i = S.templates.findIndex((x) => x.id === t.id);
  if (i >= 0) S.templates[i] = t; else S.templates.push(t);
  save('templates', t);
  emit('templates');
}
export function deleteTemplate(id) {
  S.templates = S.templates.filter((t) => t.id !== id);
  remove('templates', id);
  emit('templates');
}
export function copyTemplate(src, patch = {}) {
  const t = copyTemplateRecord(src, { patch, hasExercise: (id) => S.exercises.has(id) });
  saveTemplate(t);
  return t;
}
/** Folder names: the ones templates use plus empty ones created with "New folder". */
export const templateFolders = () => folderNames(S.templates, S.meta.folders);
export function addFolder(name) {
  const n = String(name || '').trim();
  if (!n || templateFolders().includes(n)) return false;
  setMeta({ folders: [...(S.meta.folders || []), n] });
  return true;
}
export function renameFolder(from, to) {
  const n = String(to || '').trim();
  if (!n || n === from) return;
  for (const t of S.templates) if ((t.folder || '') === from) { t.folder = n; save('templates', t); }
  setMeta({ folders: [...new Set((S.meta.folders || []).map((f) => (f === from ? n : f)))] });
  emit('templates');
}
/** Remove a folder; its templates move out of it (they aren't deleted). */
export function removeFolder(name) {
  for (const t of S.templates) if ((t.folder || '') === name) { t.folder = ''; save('templates', t); }
  setMeta({ folders: (S.meta.folders || []).filter((f) => f !== name) });
  emit('templates');
}
export function setTemplateArchived(id, archived) {
  const t = getTemplate(id);
  if (!t) return;
  if (archived) t.archived = true; else delete t.archived;
  saveTemplate(t);
}
/**
 * Save a finished workout into its template (see applyWorkoutToTemplate).
 * Returns the template's previous exercises, for undo.
 */
export function updateTemplateFromWorkout(templateId, workout, opts = {}) {
  const t = getTemplate(templateId);
  if (!t) return null;
  const before = JSON.parse(JSON.stringify(t.exercises));
  t.exercises = applyWorkoutToTemplate(t.exercises, workout, opts);
  saveTemplate(t);
  return before;
}
/** Undo for updateTemplateFromWorkout. */
export function restoreTemplateExercises(templateId, exercises) {
  const t = getTemplate(templateId);
  if (!t) return;
  t.exercises = exercises;
  saveTemplate(t);
}

// ---------- suggested workout ----------
/** The template that probably comes next (see core/suggest.js), or null. */
export const suggestTemplate = (now = Date.now()) => suggestFrom(S.templates, S.workouts, now);

// ---------- measurements ----------
export function addMeasurement({ type, value, at }) {
  const m = { id: uid(), type, value, at: at || Date.now() };
  S.measurements.push(m);
  S.measurements.sort((a, b) => b.at - a.at);
  save('measurements', m);
  emit('measurements');
  return m;
}
export function deleteMeasurement(id) {
  S.measurements = S.measurements.filter((m) => m.id !== id);
  remove('measurements', id);
  emit('measurements');
}
export const measurementsOf = (type) => S.measurements.filter((m) => m.type === type);

// ---------- active workout ----------
export function touchActive() {
  if (S.active) S.active.updatedAt = Date.now();
  persistActive();
  emit('active');
}

export function startWorkout({ template = null, fromWorkout = null } = {}) {
  const now = Date.now();
  S.active = newActiveWorkout({
    template, fromWorkout, hasExercise: (id) => S.exercises.has(id), settings: S.settings, now, name: workoutNameForTime(now),
  });
  touchActive();
  flushActive();
  checkPersisted(true);
  return S.active;
}

export function discardActive() {
  S.active = null;
  persistActive.cancel();
  mirrorActive();
  saveKV('active', null);
  stopRestWatch();
  emit('active');
}

/**
 * Save the active workout. `mode`: 'done' keeps only checked sets,
 * 'all' also keeps unchecked sets that have valid values.
 */
export function finishActive(mode = 'done') {
  const a = S.active;
  if (!a) return null;
  const now = Date.now();
  const workout = finishWorkout(a, {
    settings: S.settings, exercises: S.exercises, now, mode, defaultName: workoutNameForTime(a.startedAt),
  });
  const prs = prsForNewWorkout(workout, stats(), S.exercises, S.settings.formula);
  saveWorkout(workout);
  if (workout.templateId) {
    const t = getTemplate(workout.templateId);
    if (t) { t.lastUsedAt = now; save('templates', t); emit('templates'); }
  }
  discardActive();
  // its place in the history by start time (the start can have been moved earlier)
  const number = S.workouts.filter((w) => w.startedAt <= workout.startedAt).length;
  return { workout, prs, volume: workoutVolume(workout, S.exercises), number };
}

/**
 * Exercise changes made in the template editor or Edit workout (rest timer,
 * pinned note) wait in draft.exPatches until the screen is saved, so Cancel
 * really discards them. The running workout applies them right away.
 */
export const exerciseView = (draft, id) => exerciseInDraft(S.exercises, draft, id);
export function patchExercise(draft, id, patch) {
  if (!draft || draft.kind === 'workout') { updateExercise(id, patch); return; }
  patchDraftExercise(draft, id, patch);
}
export function applyExercisePatches(draft) {
  for (const [id, patch] of Object.entries(draft.exPatches || {})) if (S.exercises.has(id)) updateExercise(id, patch);
  draft.exPatches = {};
}

export function addEntries(draft, exerciseIds) {
  draft.exercises.push(...newEntries(exerciseIds, { previousSets: (id) => previousSets(id), kind: draft.kind }));
}

// ---------- rest timer ----------
let restTimer = null;
function watchRest() {
  if (restTimer) return;
  restTimer = setInterval(checkRest, 400);
}
function stopRestWatch() { clearInterval(restTimer); restTimer = null; }
function checkRest() {
  const r = S.active?.rest;
  if (!r) { stopRestWatch(); return; }
  const now = Date.now();
  if (now >= r.end) {
    const late = now - r.end;
    S.active.rest = null;
    touchActive();
    stopRestWatch();
    ui.onRestDone(late);
  }
}
export function startRest(sec, label = '') {
  if (!S.active || !(sec > 0)) return;
  const now = Date.now();
  S.active.rest = { start: now, end: now + sec * 1000, total: sec, label };
  touchActive();
  watchRest();
}
export function adjustRest(deltaSec) {
  const r = S.active?.rest;
  if (!r) return;
  r.end += deltaSec * 1000;
  r.total = Math.max(1, r.total + deltaSec);
  if (r.end <= Date.now()) { skipRest(); return; }
  touchActive();
}
export function skipRest() {
  if (!S.active) return;
  S.active.rest = null;
  stopRestWatch();
  touchActive();
}

// ---------- bulk data (import / restore / wipe) ----------
export async function importBatch({ exercises = [], workouts = [] }) {
  for (const e of exercises) S.exercises.set(e.id, e);
  for (const w of workouts) S.workouts.push(w);
  S.workouts.sort((a, b) => b.startedAt - a.startedAt);
  if (S.storage === 'ok') {
    await db.putMany('exercises', exercises);
    await db.putMany('workouts', workouts);
  }
  emit('exercises', 'workouts');
}

export function snapshot() {
  return {
    exercises: [...S.exercises.values()],
    workouts: S.workouts,
    templates: S.templates,
    measurements: S.measurements,
    kv: { settings: S.settings, profile: S.profile, meta: S.meta },
  };
}

export async function replaceAllData(data) {
  const kv = { ...(data.kv || {}) };
  kv.meta = { ...(kv.meta || {}), seedVersion: 0 };
  delete kv.active;
  if (S.storage === 'ok') await db.replaceAll({ ...data, kv });
  const active = S.active;
  applyData({ ...data, kv });
  S.active = active; // keep a running workout
  await ensureSeed();
  emit('exercises', 'workouts', 'templates', 'measurements', 'settings', 'profile', 'meta', 'active');
}
