// App state: loaded from storage once, then replaced (never mutated) on every
// change, so screens re-render through useAppState(). All the logic for
// backups, Strong import, records and suggestions is the shared core's.
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  SEED_EXERCISES, SEED_VERSION, withDefaults, buildStats, sessionsByExercise, configureCalc, bodyweightFrom,
  parseBackup, parseStrongCSV, suggestTemplate, previousSetsFrom, newActiveWorkout, finishWorkout, prsForNewWorkout,
  workoutVolume, applyWorkoutToTemplate,
} from '@setlog/core';

import * as db from './storage';
import type {
  ActiveWorkout, Data, EntryDraft, Exercise, Measurement, Meta, Profile, Settings, Template, TemplateEntry, WorkSet, Workout,
} from './types';

export interface State {
  ready: boolean;
  error: string | null;
  exercises: Map<string, Exercise>;
  /** newest first */
  workouts: Workout[];
  templates: Template[];
  /** newest first */
  measurements: Measurement[];
  settings: Settings;
  profile: Profile;
  meta: Meta;
  /** the running workout, or null */
  active: ActiveWorkout | null;
}

let state: State = {
  ready: false,
  error: null,
  exercises: new Map(),
  workouts: [],
  templates: [],
  measurements: [],
  settings: withDefaults({}) as Settings,
  profile: { name: '' },
  meta: {},
  active: null,
};

const listeners = new Set<() => void>();
function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  syncCalc();
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getState = () => state;
export const useAppState = () => useSyncExternalStore(subscribe, getState, getState);
/** Re-render only when the selected part changes (it must keep its identity otherwise). */
export function useAppSelector<T>(select: (s: State) => T): T {
  const get = () => select(state);
  return useSyncExternalStore(subscribe, get, get);
}
export const useSettings = () => useAppSelector((s) => s.settings);

// ---------- loading ----------
const byNewest = <T extends { startedAt?: number; at?: number }>(a: T, b: T) => ((b.startedAt ?? b.at ?? 0) - (a.startedAt ?? a.at ?? 0));

function fromData(data: Data): Partial<State> {
  return {
    exercises: new Map(data.exercises.map((e) => [e.id, e])),
    workouts: [...data.workouts].sort(byNewest),
    templates: data.templates,
    measurements: [...data.measurements].sort(byNewest),
    settings: withDefaults(data.kv.settings) as Settings,
    profile: { name: '', ...(data.kv.profile || {}) },
    meta: { ...(data.kv.meta || {}) },
    active: data.kv.active || null,
  };
}

/** Add built-in exercises the data doesn't have yet (first start, older backups). */
async function ensureSeed() {
  if ((state.meta.seedVersion || 0) >= SEED_VERSION && state.exercises.size) return;
  const added = (SEED_EXERCISES as Exercise[]).filter((e) => !state.exercises.has(e.id));
  if (added.length) await db.putMany('exercises', added);
  const meta = { ...state.meta, seedVersion: SEED_VERSION, createdAt: state.meta.createdAt || Date.now() };
  await db.kvSet('meta', meta);
  const exercises = new Map(state.exercises);
  for (const e of added) exercises.set(e.id, { ...e });
  setState({ exercises, meta });
}

let watchingAppState = false;
export async function load() {
  if (!watchingAppState) {
    watchingAppState = true;
    // write the running workout right away when the app goes to the background
    AppState.addEventListener('change', (s) => { if (s !== 'active') flushActive(); });
  }
  try {
    setState(fromData(await db.loadAll()));
    await ensureSeed();
    setState({ ready: true });
  } catch (e) {
    setState({ ready: true, error: e instanceof Error ? e.message : String(e) });
  }
}

// ---------- derived ----------
function syncCalc() {
  const st = state.settings;
  configureCalc({
    formula: st.formula, dumbbellTwice: !!st.dumbbellTwice, bwWeighted: !!st.bwWeighted, bwAssisted: !!st.bwAssisted,
    bodyweightAt: (at: number) => bodyweightFrom(state.measurements, at),
  });
}

type Stats = ReturnType<typeof buildStats>;
let statsFor: { workouts: Workout[]; exercises: Map<string, Exercise>; key: string } | null = null;
let statsCache: Stats | null = null;
/** Records, PRs and sessions per exercise; follows "Start history from" like the web app. */
export function stats(s: State = state): Stats {
  const st = s.settings;
  const key = [st.formula, st.historyStart, st.dumbbellTwice, st.bwWeighted, st.bwAssisted].join(':');
  if (!statsCache || !statsFor || statsFor.workouts !== s.workouts || statsFor.exercises !== s.exercises || statsFor.key !== key) {
    const from = st.historyStart || 0;
    statsCache = buildStats(from ? s.workouts.filter((w) => w.startedAt >= from) : s.workouts, s.exercises, st.formula);
    statsFor = { workouts: s.workouts, exercises: s.exercises, key };
  }
  return statsCache;
}

let allFor: Workout[] | null = null;
let allCache: Map<string, { workoutId: string; startedAt: number; name: string; entry: Workout['exercises'][number] }[]> | null = null;
/** Every session of every exercise, including those before "Start history from". */
export function allSessions(s: State = state) {
  if (!allCache || allFor !== s.workouts) {
    allCache = sessionsByExercise(s.workouts);
    allFor = s.workouts;
  }
  return allCache!;
}

export const suggestion = (s: State = state, now = Date.now()) => suggestTemplate(s.templates, s.workouts, now) as
  | { template: Template; why: { kind: 'after' | 'weekday' | 'due'; name?: string; day?: number; at?: number } }
  | null;

export const exerciseName = (id: string, s: State = state) => s.exercises.get(id)?.name;

// ---------- settings ----------
export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const settings = { ...state.settings, [key]: value };
  setState({ settings });
  await db.kvSet('settings', settings);
}

export async function setProfile(patch: Partial<Profile>) {
  const profile = { ...state.profile, ...patch };
  setState({ profile });
  await db.kvSet('profile', profile);
}

// ---------- backup ----------
export type BackupPreview = ReturnType<typeof readBackup>;

/** Check a backup file and say what's in it. Throws with an English message (a translation key). */
export function readBackup(text: string) {
  const parsed = parseBackup(text, SEED_EXERCISES) as { exportedAt?: string; data: Data };
  const d = parsed.data;
  return {
    data: d,
    exportedAt: parsed.exportedAt ? Date.parse(parsed.exportedAt) : null,
    counts: { workouts: d.workouts.length, templates: d.templates.length, measurements: d.measurements.length },
  };
}

/** Replace everything in the app with a backup. */
export async function restoreBackup(preview: BackupPreview) {
  const data: Data = { ...preview.data, kv: { ...preview.data.kv, meta: { ...(preview.data.kv.meta || {}), seedVersion: 0 } } };
  await db.replaceAll(data);
  // a running workout keeps going
  const active = state.active;
  setState({ ...fromData(data), active });
  if (active) await db.kvSet('active', active);
  await ensureSeed();
}

// ---------- Strong import ----------
export type StrongImport = ReturnType<typeof readStrong>;

/** Parse a Strong export against the app's data. Nothing is saved yet. */
export function readStrong(text: string, units: { weightUnit: 'kg' | 'lb'; distUnit: 'km' | 'mi' }, defaultName: string) {
  const byName = new Map([...state.exercises.values()].map((e) => [e.name.toLowerCase().replace(/\s+/g, ' ').trim(), e]));
  return parseStrongCSV(text, {
    ...units,
    findExercise: (name: string) => byName.get(String(name).trim().toLowerCase().replace(/\s+/g, ' ')) || null,
    hasExercise: (id: string) => state.exercises.has(id),
    workouts: state.workouts,
    defaultName,
  }) as {
    workouts: Workout[];
    exercises: Exercise[];
    noteUpdates: { id: string; notes?: string; entries: [number, string][] }[];
    stats: { workouts: number; sets: number; duplicates: number; notesAdded: number; newExercises: string[]; first: number | null; last: number | null; hasWeightUnitColumn: boolean };
  };
}

export async function saveStrongImport(r: StrongImport) {
  const exercises = new Map(state.exercises);
  for (const e of r.exercises) exercises.set(e.id, e);
  // notes for workouts that are already here (older imports that dropped them)
  const updated = new Map<string, Workout>();
  for (const u of r.noteUpdates) {
    const w = state.workouts.find((x) => x.id === u.id);
    if (!w) continue;
    const copy: Workout = JSON.parse(JSON.stringify(w));
    if (u.notes && !copy.notes) copy.notes = u.notes;
    for (const [i, note] of u.entries) if (copy.exercises[i] && !copy.exercises[i].notes) copy.exercises[i].notes = note;
    updated.set(copy.id, copy);
  }
  const workouts = [...state.workouts.map((w) => updated.get(w.id) || w), ...r.workouts].sort(byNewest);
  await db.putMany('exercises', r.exercises);
  await db.putMany('workouts', [...r.workouts, ...updated.values()]);
  setState({ exercises, workouts });
}

// ---------- exercises ----------
export async function updateExercise(id: string, patch: Partial<Exercise>) {
  const ex = state.exercises.get(id);
  if (!ex) return;
  const next = { ...ex, ...patch };
  const exercises = new Map(state.exercises);
  exercises.set(id, next);
  setState({ exercises });
  await db.put('exercises', next);
}

// ---------- templates ----------
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

async function saveTemplate(t: Template) {
  const next = { ...t, updatedAt: Date.now() };
  setState({ templates: state.templates.some((x) => x.id === t.id) ? state.templates.map((x) => (x.id === t.id ? next : x)) : [...state.templates, next] });
  await db.put('templates', next);
}

/** Save a finished workout into its template. Returns the template's previous exercises, for undo. */
export async function updateTemplateFromWorkout(templateId: string, workout: Workout, valuesOnly: boolean): Promise<TemplateEntry[] | null> {
  const t = state.templates.find((x) => x.id === templateId);
  if (!t) return null;
  const before = clone(t.exercises);
  await saveTemplate({ ...t, exercises: applyWorkoutToTemplate(clone(t.exercises), workout, { valuesOnly }) as TemplateEntry[] });
  return before;
}

export async function restoreTemplateExercises(templateId: string, exercises: TemplateEntry[]) {
  const t = state.templates.find((x) => x.id === templateId);
  if (t) await saveTemplate({ ...t, exercises });
}

// ---------- the running workout ----------
// Kept in state.active and written to storage a moment after each change (and
// at once when the app goes to the background), so it survives the app being
// closed. The logic is the core's (core/workout.js).
let activeTimer: ReturnType<typeof setTimeout> | null = null;
function persistActive(now = false) {
  if (activeTimer) clearTimeout(activeTimer);
  activeTimer = null;
  const write = () => { activeTimer = null; db.kvSet('active', state.active).catch(() => {}); };
  if (now) write(); else activeTimer = setTimeout(write, 250);
}
export function flushActive() { if (activeTimer) persistActive(true); }

/**
 * Change the running workout. `fn` gets a copy to change in place (the core's
 * functions work that way). With `entryId` only that exercise is copied, so
 * the other exercises keep their identity and don't re-render.
 */
export function editActive(fn: (a: ActiveWorkout, entry: EntryDraft) => void, entryId?: string) {
  const cur = state.active;
  if (!cur) return;
  let a: ActiveWorkout;
  let entry: EntryDraft | undefined;
  if (entryId) {
    const i = cur.exercises.findIndex((e) => e.id === entryId);
    if (i < 0) return;
    entry = clone(cur.exercises[i]);
    const exercises = cur.exercises.slice();
    exercises[i] = entry;
    a = { ...cur, exercises };
  } else {
    a = clone(cur);
  }
  fn(a, entry as EntryDraft);
  a.updatedAt = Date.now();
  setState({ active: a });
  persistActive();
}

/** Change top-level fields (name, notes, rest) without touching the exercises. */
export function patchActive(patch: Partial<ActiveWorkout>) {
  if (!state.active) return;
  setState({ active: { ...state.active, ...patch, updatedAt: Date.now() } });
  persistActive();
}

export function startWorkout(from: { template?: Template | null; fromWorkout?: Workout | null }, defaultName: string) {
  const active = newActiveWorkout({
    template: from.template || null, fromWorkout: from.fromWorkout || null, hasExercise: (id: string) => state.exercises.has(id),
    settings: state.settings, now: Date.now(), name: defaultName,
  }) as ActiveWorkout;
  setState({ active });
  persistActive(true);
  return active;
}

export function discardActive() {
  setState({ active: null });
  persistActive(true);
}

/** Sets from the latest earlier session of an exercise ("Previous"); the same template first if that's the setting. */
export function previousSets(exerciseId: string, opts: { templateId?: string | null; before?: number; excludeWorkoutId?: string | null } = {}): WorkSet[] | null {
  return previousSetsFrom(stats().byExercise.get(exerciseId), {
    before: opts.before ?? Infinity, excludeWorkoutId: opts.excludeWorkoutId ?? null,
    templateId: state.settings.prevSource === 'template' ? opts.templateId ?? null : null,
  });
}

export interface Record_ { exerciseId: string; metric: string; value: number; setId: string }
export interface FinishResult { workout: Workout; prs: Record_[]; volume: number; number: number }
const finished = new Map<string, FinishResult>();
/** The summary of a workout finished in this session. */
export const finishResult = (id: string) => finished.get(id) || null;

/**
 * Save the running workout. `mode` 'done' keeps checked sets only, 'all' also
 * unchecked sets that are valid as typed. `defaultName` replaces an empty name.
 */
export async function finishActive(mode: 'done' | 'all', defaultName: string): Promise<FinishResult | null> {
  const a = state.active;
  if (!a) return null;
  const now = Date.now();
  const workout = finishWorkout(a, { settings: state.settings, exercises: state.exercises, now, mode, defaultName }) as Workout;
  const prs = prsForNewWorkout(workout, stats(), state.exercises, state.settings.formula) as Record_[];
  const workouts = [...state.workouts.filter((w) => w.id !== workout.id), workout].sort(byNewest);
  let templates = state.templates;
  const t = workout.templateId ? templates.find((x) => x.id === workout.templateId) : null;
  const usedTemplate = t ? { ...t, lastUsedAt: now } : null;
  if (usedTemplate) templates = templates.map((x) => (x.id === usedTemplate.id ? usedTemplate : x));
  setState({ workouts, templates, active: null });
  persistActive(true);
  await db.put('workouts', workout);
  if (usedTemplate) await db.put('templates', usedTemplate);
  // its place in the history by start time (the start can have been moved earlier)
  const number = workouts.filter((w) => w.startedAt <= workout.startedAt).length;
  const result = { workout, prs, volume: workoutVolume(workout, state.exercises) as number, number };
  finished.set(workout.id, result);
  return result;
}

// ---------- rest timer ----------
export function startRest(sec: number, label = '') {
  if (!state.active || !(sec > 0)) return;
  const now = Date.now();
  patchActive({ rest: { start: now, end: now + sec * 1000, total: sec, label } });
}
export function adjustRest(deltaSec: number) {
  const r = state.active?.rest;
  if (!r) return;
  const end = r.end + deltaSec * 1000;
  if (end <= Date.now()) { skipRest(); return; }
  patchActive({ rest: { ...r, end, total: Math.max(1, r.total + deltaSec) } });
}
export function skipRest() {
  if (state.active?.rest) patchActive({ rest: null });
}
