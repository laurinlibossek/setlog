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

export const APP_VERSION = '1.2.0';

export const DEFAULT_SETTINGS = {
  unit: 'kg',
  distUnit: 'km',
  defaultRest: 120,
  sound: true,
  keepAwake: true,
  showExamples: true,
  askTemplateUpdate: true,
  templateSort: 'name',
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
/** Folder names: the ones templates use plus empty ones created with "New folder". */
export function templateFolders() {
  const names = [...S.templates.map((t) => t.folder || ''), ...(S.meta.folders || [])];
  return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
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
// ----- comparing a finished workout with its template -----
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
  for (const k of VALUE_KEYS) if (from[k] !== null && from[k] !== undefined) o[k] = from[k];
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
 * with "Update values only".
 */
export function templateChanges(template, workout) {
  const T = template.exercises, W = workout.exercises;
  const { pairs, tk, wk } = pairEntries(T, W);
  const c = {
    addedExercises: 0, removedExercises: 0, reordered: false, addedSets: 0, removedSets: 0,
    typesChanged: false, supersetsChanged: false, valueSets: 0, structure: false,
  };
  const order = [];
  const matched = new Set();
  pairs.forEach((wi, ti) => {
    if (wi < 0) { c.removedExercises++; return; }
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
 * Save a finished workout into its template. `valuesOnly` keeps the template's
 * exercises and sets and copies the performed numbers into the matching sets;
 * otherwise the workout's structure and numbers replace the template's.
 * Returns the template's previous exercises, for undo.
 */
export function updateTemplateFromWorkout(templateId, workout, { valuesOnly = false } = {}) {
  const t = getTemplate(templateId);
  if (!t) return null;
  const before = JSON.parse(JSON.stringify(t.exercises));
  const { pairs } = pairEntries(t.exercises, workout.exercises);
  if (valuesOnly) {
    t.exercises = t.exercises.map((e, ti) => {
      const wi = pairs[ti];
      if (wi < 0) return e;
      const ws = workout.exercises[wi].sets;
      const sp = pairSets(e.sets, ws);
      return { ...e, sets: e.sets.map((s, i) => (sp[i] < 0 ? s : templateSet(setType(s), ws[sp[i]]))) };
    });
  } else {
    const tplOf = new Map();
    pairs.forEach((wi, ti) => { if (wi >= 0) tplOf.set(wi, t.exercises[ti]); });
    t.exercises = workout.exercises.map((e, wi) => {
      const out = { exerciseId: e.exerciseId, sets: e.sets.map((s) => templateSet(setType(s), s)) };
      const notes = tplOf.get(wi)?.notes; // keep the template's own exercise notes
      if (notes) out.notes = notes;
      if (e.supersetId) out.supersetId = e.supersetId;
      if (e.restSec !== null && e.restSec !== undefined) out.restSec = e.restSec;
      return out;
    });
  }
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
