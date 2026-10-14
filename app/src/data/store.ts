// App state: loaded from storage once, then replaced (never mutated) on every
// change, so screens re-render through useAppState(). All the logic for
// backups, Strong import, records and suggestions is the shared core's.
import { useSyncExternalStore } from 'react';
import {
  SEED_EXERCISES, SEED_VERSION, withDefaults, buildStats, sessionsByExercise, configureCalc, bodyweightFrom,
  parseBackup, parseStrongCSV, suggestTemplate,
} from '@setlog/core';

import * as db from './storage';
import type {
  Data, Exercise, Measurement, Meta, Profile, Settings, Template, Workout,
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

export async function load() {
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
  setState(fromData(data));
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
