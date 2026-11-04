// Starting and finishing a workout: the questions on the way (a workout is
// already running, unchecked sets), where the app goes next, and what a
// finished workout does to its routine: better numbers go in by themselves,
// a changed layout is asked about once over the summary. The rules are the
// shared core's (core/workout.js, templates.js).
import { useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import {
  progressOf, workoutNameKey, pendingSets, templateChanges, progressTemplate,
} from '@setlog/core';

import {
  discardActive, editActive, finishActive, getState, previousSets, restoreTemplateExercises, saveTemplate, startWorkout,
} from '@/data/store';
import type {
  ActiveWorkout, Template, TemplateEntry, Workout,
} from '@/data/types';
import {
  actionSheet, ask, choose, toast,
} from '@/ui/overlay';
import type { Format } from './format';
import type { Tr } from './i18n';

type F = Format & { tr: Tr };

export function openWorkout() { router.push('/active'); }

/** One question for every way of throwing a running workout away. */
export function confirmDiscard(a: ActiveWorkout, title: string, tr: Tr) {
  const { done, typed } = progressOf(a);
  return ask({
    title,
    message: done ? tr('Everything you logged in it will be deleted.')
      : typed ? tr('The numbers you typed in it will be lost.') : tr('Nothing has been logged yet.'),
    ok: tr('Discard'), cancel: tr('Keep going'), destructive: true, testID: 'confirm-discard',
  });
}

/** Start a workout (empty, from a template, or again from a finished one) and open it. */
export async function beginWorkout(from: { template?: Template | null; fromWorkout?: Workout | null }, f: F) {
  const { tr } = f;
  const a = getState().active;
  if (a) {
    const c = await actionSheet<string>({
      title: tr('A workout is already running'),
      message: tr('“{name}” started {time}.', { name: a.name, time: f.date.time(a.startedAt) }),
      actions: [
        { label: tr('Resume that workout'), value: 'resume', testID: 'resume-running' },
        { label: tr('Discard it and start new'), value: 'new', destructive: true, testID: 'replace-running' },
      ],
    });
    if (c === 'resume') { openWorkout(); return; }
    if (c !== 'new') return;
    const { done, typed } = progressOf(a);
    if ((done || typed) && !(await confirmDiscard(a, tr('Discard “{name}”?', { name: a.name }), tr))) return;
    discardActive();
  }
  startWorkout(from, tr(workoutNameKey(Date.now())));
  openWorkout();
}

/** Finish: ask about unchecked sets, save, then show the summary in place of the workout. */
export async function finishFlow(f: F) {
  const { tr } = f;
  const a = getState().active;
  if (!a) return;
  const s = getState();
  let done = 0;
  for (const e of a.exercises) for (const x of e.sets) if (x.done) done++;
  const pending = pendingSets(a, {
    exercises: s.exercises, settings: s.settings, previousSets: (id: string, templateId: string | null) => previousSets(id, { templateId }),
  }) as { set: { id: string }; filled: Record<string, unknown> }[];
  if (!done && !pending.length) {
    const ok = await ask({
      title: tr('Nothing logged yet'), message: tr('Check off at least one set to save this workout. Discard it instead?'),
      ok: tr('Discard workout'), cancel: tr('Keep going'), destructive: true,
    });
    if (ok) { discardActive(); router.back(); }
    return;
  }
  if (pending.length) {
    const c = await actionSheet<'all' | 'done'>({
      title: pending.length === 1 ? tr('1 set with numbers isn’t checked off') : tr('{n} sets with numbers aren’t checked off', { n: pending.length }),
      actions: [
        { label: tr('Save them as done'), value: 'all', testID: 'save-pending' },
        { label: tr('Leave them out'), value: 'done', destructive: true, testID: 'drop-pending' },
      ],
    });
    if (!c) return;
    if (c === 'done' && !done) { toast(tr('Nothing checked off to save')); return; }
    if (c === 'all') {
      const filled = new Map(pending.map((p) => [p.set.id, p.filled]));
      editActive((draft) => {
        for (const e of draft.exercises) for (const x of e.sets) if (filled.has(x.id)) Object.assign(x, filled.get(x.id), { done: true });
      });
    }
  } else {
    const ok = await ask({
      title: tr('Finish workout?'), message: tr('{sets} logged in {time}.', { sets: f.plural(done, 'set'), time: f.dur(Date.now() - a.startedAt) }),
      ok: tr('Finish'), cancel: tr('Cancel'), testID: 'confirm-finish',
    });
    if (!ok) return;
  }
  const result = await finishActive('done', tr(workoutNameKey(a.startedAt)));
  if (!result) return;
  await progressRoutine(result.workout);
  router.replace({ pathname: '/summary/[id]', params: { id: result.workout.id } });
}

/** What a finished workout changed in its routine (core templateChanges). */
export interface TemplateDiff {
  addedExercises: number; removedExercises: number; reordered: boolean; addedSets: number; removedSets: number;
  typesChanged: boolean; supersetsChanged: boolean; valueSets: number; structure: boolean;
  added: string[]; removed: string[];
}

/**
 * What finishing a workout did to its routine, for the summary. The better
 * numbers are saved at Finish; when the layout changed too, `answer` is
 * 'pending' until the summary has asked "Update Push A?".
 */
export interface RoutineResult {
  templateId: string;
  /** The routine's exercises before the workout, for Undo. */
  before: TemplateEntry[];
  /** Sets whose numbers went up. */
  raised: number;
  /** The layout changes, when there are any. */
  diff: TemplateDiff | null;
  answer: 'pending' | 'updated' | 'kept' | null;
  undone: boolean;
  announced: boolean;
}
const results = new Map<string, RoutineResult>();
const routineListeners = new Set<() => void>();
function setResult(workoutId: string, patch: Partial<RoutineResult>) {
  const r = results.get(workoutId);
  if (!r) return;
  results.set(workoutId, { ...r, ...patch });
  routineListeners.forEach((l) => l());
}
const subscribeRoutine = (l: () => void) => { routineListeners.add(l); return () => { routineListeners.delete(l); }; };
/** The routine result of a workout finished in this session (or null), kept current for the summary. */
export function useRoutineResult(workoutId: string | undefined) {
  const get = () => (workoutId ? results.get(workoutId) || null : null);
  return useSyncExternalStore(subscribeRoutine, get, get);
}

const categoryOf = (exerciseId: string) => getState().exercises.get(exerciseId)?.category || 'barbell';
const routineOf = (templateId: string) => getState().templates.find((x) => x.id === templateId) || null;

/**
 * Progressive overload, right after Finish: a workout from a routine raises
 * the routine's numbers where the done sets were better (core progressTemplate);
 * equal or worse sets and anything skipped keep theirs. Nothing happens for
 * examples, "Do this workout again" or empty workouts (no templateId), or with
 * Settings → Update routines after workouts off. The summary then announces
 * it, and asks about the layout when that changed too.
 */
export async function progressRoutine(workout: Workout) {
  const s = getState();
  if (s.settings.askTemplateUpdate === false || !workout.templateId) return null;
  const t = routineOf(workout.templateId);
  if (!t || t.example) return null;
  const diff = templateChanges(t, workout) as TemplateDiff;
  const { exercises, raised } = progressTemplate(t.exercises, workout, categoryOf) as { exercises: TemplateEntry[]; raised: number };
  if (!raised && !diff.structure) return null;
  const before = JSON.parse(JSON.stringify(t.exercises)) as TemplateEntry[];
  if (raised) await saveTemplate({ ...t, exercises });
  const r: RoutineResult = {
    templateId: t.id, before, raised, diff: diff.structure ? diff : null, answer: diff.structure ? 'pending' : null, undone: false, announced: false,
  };
  results.set(workout.id, r);
  return r;
}

/** One line of what's different in the layout: "1 set fewer. Adds Cable Fly." */
export function describeLayout(d: TemplateDiff, f: F) {
  const { tr } = f;
  const names = (ids: string[]) => ids.map((id) => f.exName(getState().exercises.get(id)) || tr('Unknown exercise')).join(', ');
  const swap = d.added.length === 1 && d.removed.length === 1;
  return [
    d.addedSets ? (d.addedSets === 1 ? tr('1 set more.') : tr('{n} sets more.', { n: d.addedSets })) : '',
    d.removedSets ? (d.removedSets === 1 ? tr('1 set fewer.') : tr('{n} sets fewer.', { n: d.removedSets })) : '',
    swap ? tr('Swaps {from} for {to}.', { from: names(d.removed), to: names(d.added) }) : '',
    !swap && d.added.length ? tr('Adds {names}.', { names: names(d.added) }) : '',
    !swap && d.removed.length ? tr('Removes {names}.', { names: names(d.removed) }) : '',
    d.reordered ? tr('Reorders exercises.') : '',
    d.typesChanged ? tr('Changes set types.') : '',
    d.supersetsChanged ? tr('Changes supersets.') : '',
  ].filter(Boolean).join(' ');
}

/** The summary's line about the routine, or '' when there's nothing to say (yet). */
export function routineLine(r: RoutineResult | null, f: F) {
  if (!r || r.undone || r.answer === 'pending') return '';
  const name = routineOf(r.templateId)?.name || '';
  if (r.answer === 'updated') return f.tr('{name} now has this workout’s exercises and sets', { name });
  return r.raised ? f.tr('New numbers for {n} in {name}', { n: f.plural(r.raised, 'set'), name }) : '';
}

/**
 * Once, when the summary of a just-finished workout opens: ask about the
 * layout if it changed ("Update routine" or "Keep routine"; the better numbers
 * are saved either way), then a toast with Undo, which puts the routine back
 * as it was before the workout.
 */
export async function announceRoutine(workout: Workout, f: F) {
  const { tr } = f;
  const r = results.get(workout.id);
  if (!r || r.announced) return;
  setResult(workout.id, { announced: true });
  const name = () => routineOf(r.templateId)?.name || '';
  const undo = { label: tr('Undo'), fn: () => {
    restoreTemplateExercises(r.templateId, r.before).then(() => { setResult(workout.id, { undone: true }); toast(tr('Routine change undone')); });
  } };
  if (r.answer === 'pending' && r.diff) {
    const choice = await choose<'update' | 'keep'>({
      title: tr('Update {name}?', { name: name() }),
      message: describeLayout(r.diff, f),
      cancel: false,
      options: [
        { label: tr('Update routine'), value: 'update', tone: 'primary', testID: 'routine-update' },
        { label: tr('Keep routine'), value: 'keep', tone: 'plain', testID: 'routine-keep' },
      ],
    });
    const t = routineOf(r.templateId);
    if (choice === 'update' && t) {
      const { exercises, raised } = progressTemplate(r.before, workout, categoryOf, { layout: true }) as { exercises: TemplateEntry[]; raised: number };
      await saveTemplate({ ...t, exercises });
      setResult(workout.id, { answer: 'updated', raised });
      toast(tr('{name} updated', { name: name() }), undo);
      return;
    }
    setResult(workout.id, { answer: 'kept' });
  }
  if (r.raised) toast(tr('New numbers for {n} in {name}', { n: f.plural(r.raised, 'set'), name: name() }), undo);
}
