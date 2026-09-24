// App state, persistence and all data actions. UI components subscribe to
// "topics" so a keystroke in the active workout doesn't re-render History.
import * as db from './db.js';
import { useEffect, useReducer } from './lib.js';
import { SEED_EXERCISES, SEED_VERSION } from './seed.js';
import { buildSampleData } from './demo.js';
import { buildStats, prsForNewWorkout, workoutVolume } from './calc.js';
import {
  uid, debounce, workoutNameForTime, slug,
} from './util.js';
import {
  entryToDraft, newEntryDraft, draftEntries, remapSupersets, convertDraftUnits,
} from './drafts.js';

export const APP_VERSION = '1.0.0';

export const DEFAULT_SETTINGS = {
  unit: 'kg',
  distUnit: 'km',
  defaultRest: 120,
  sound: true,
  keepAwake: true,
  formula: 'epley',
  weekStart: 1,
  weeklyGoal: 3,
  theme: 'system',
  bar: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
};
const LB_PLATES = [45, 35, 25, 10, 5, 2.5];
const KG_PLATES = DEFAULT_SETTINGS.plates;

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
  useEffect(() => subscribe(topics, force), [topics.join(',')]);
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
let statsCache = null;
let statsKey = '';
export function stats() {
  const key = `${S.v.workouts || 0}:${S.v.exercises || 0}:${S.settings.formula}`;
  if (key !== statsKey || !statsCache) {
    statsCache = buildStats(S.workouts, S.exercises, S.settings.formula);
    statsKey = key;
  }
  return statsCache;
}

/** Sets from the most recent earlier session of an exercise. */
export function previousSets(exerciseId, { before = Infinity, excludeWorkoutId = null } = {}) {
  const sessions = stats().byExercise.get(exerciseId);
  if (!sessions) return null;
  for (const s of sessions) {
    if (s.workoutId === excludeWorkoutId) continue;
    if (s.startedAt < before) return s.entry.sets;
  }
  return null;
}

// ---------- settings / profile / meta ----------
export function setSetting(key, value) {
  const prev = { ...S.settings };
  S.settings[key] = value;
  if (key === 'unit' && prev.unit !== value) {
    const plates = JSON.stringify(S.settings.plates);
    if (value === 'lb' && plates === JSON.stringify(KG_PLATES)) { S.settings.plates = LB_PLATES; S.settings.bar = 45; }
    if (value === 'kg' && plates === JSON.stringify(LB_PLATES)) { S.settings.plates = KG_PLATES; S.settings.bar = 20; }
  }
  if ((key === 'unit' || key === 'distUnit') && S.active) {
    convertDraftUnits(S.active, prev, S.settings);
    touchActive();
  }
  saveKV('settings', { ...S.settings });
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
export const exName = (id) => S.exercises.get(id)?.name || 'Unknown exercise';

export function findExerciseByName(name) {
  const n = String(name).trim().toLowerCase().replace(/\s+/g, ' ');
  for (const e of S.exercises.values()) if (e.name.toLowerCase() === n) return e;
  return null;
}

export function addExercise({ name, category, bodyPart, notes = '' }) {
  let id = 'c-' + slug(name);
  if (!id || id === 'c-' || S.exercises.has(id)) id = 'c-' + uid();
  const ex = { id, name: name.trim(), category, bodyPart, notes, createdAt: Date.now() };
  S.exercises.set(id, ex);
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
  const sessions = stats().byExercise.get(id)?.length || 0;
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
/** Move all history/templates of `fromId` onto `intoId`, then delete `fromId`. */
export function mergeExercise(fromId, intoId) {
  if (fromId === intoId) return;
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
  const t = {
    id: uid(),
    name: src.name,
    folder: src.folder || '',
    notes: src.notes || '',
    exercises: remapSupersets(JSON.parse(JSON.stringify(src.exercises)).map((e) => ({
      exerciseId: e.exerciseId,
      notes: e.notes,
      supersetId: e.supersetId,
      restSec: e.restSec,
      sets: e.sets.map((s) => {
        const o = { type: s.type || 'normal' };
        for (const k of ['w', 'r', 'd', 't']) if (s[k] !== null && s[k] !== undefined) o[k] = s[k];
        return o;
      }),
    }))).filter((e) => S.exercises.has(e.exerciseId)),
    createdAt: Date.now(),
    ...patch,
  };
  saveTemplate(t);
  return t;
}
export function templateFolders() {
  return [...new Set(S.templates.map((t) => t.folder || '').filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
/** Did a finished workout change the structure of its template? */
export function templateDiffers(template, workout) {
  const a = template.exercises.map((e) => e.exerciseId + ':' + e.sets.map((s) => s.type || 'normal').join(','));
  const b = workout.exercises.map((e) => e.exerciseId + ':' + e.sets.map((s) => s.type || 'normal').join(','));
  return a.join('|') !== b.join('|');
}
export function updateTemplateFromWorkout(templateId, workout) {
  const t = getTemplate(templateId);
  if (!t) return;
  t.exercises = workout.exercises.map((e) => ({
    exerciseId: e.exerciseId,
    notes: undefined,
    supersetId: e.supersetId,
    restSec: e.restSec,
    sets: e.sets.map((s) => {
      const o = { type: s.type || 'normal' };
      for (const k of ['w', 'r', 'd', 't']) if (s[k] !== null && s[k] !== undefined) o[k] = s[k];
      return o;
    }),
  }));
  saveTemplate(t);
}

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
  const st = S.settings;
  let exercises = [];
  let name = workoutNameForTime(now);
  let notes = '';
  if (template) {
    name = template.name;
    exercises = remapSupersets(template.exercises.filter((e) => S.exercises.has(e.exerciseId))
      .map((e) => entryToDraft(e, st, { asTemplateTargets: true })));
  } else if (fromWorkout) {
    name = fromWorkout.name;
    exercises = remapSupersets(fromWorkout.exercises.filter((e) => S.exercises.has(e.exerciseId))
      .map((e) => entryToDraft({ ...e, notes: '' }, st, { asTemplateTargets: true })));
  }
  S.active = {
    id: uid(),
    kind: 'workout',
    name,
    notes,
    startedAt: now,
    templateId: template && !template.example ? template.id : null,
    exercises,
    rest: null,
    updatedAt: now,
  };
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
  const exercises = draftEntries(a, S.settings, S.exercises, { onlyDone: mode === 'done' });
  const workout = {
    id: a.id,
    name: (a.name || '').trim() || workoutNameForTime(a.startedAt),
    notes: (a.notes || '').trim(),
    startedAt: a.startedAt,
    endedAt: Math.max(now, a.startedAt + 60000),
    templateId: a.templateId || null,
    exercises,
  };
  const prs = prsForNewWorkout(workout, stats(), S.exercises, S.settings.formula);
  saveWorkout(workout);
  if (workout.templateId) {
    const t = getTemplate(workout.templateId);
    if (t) { t.lastUsedAt = now; save('templates', t); emit('templates'); }
  }
  discardActive();
  return { workout, prs, volume: workoutVolume(workout, S.exercises), number: S.workouts.length };
}

export function addEntries(draft, exerciseIds) {
  for (const id of exerciseIds) {
    const prev = previousSets(id);
    const count = prev ? Math.min(prev.filter((s) => s.type !== 'warmup').length || 1, 6) : 1;
    draft.exercises.push(newEntryDraft(id, draft.kind === 'template' ? Math.max(count, 3) : count));
  }
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
