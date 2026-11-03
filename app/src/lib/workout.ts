// Starting and finishing a workout: the questions on the way (a workout is
// already running, unchecked sets), where the app goes next, and saving a
// finished workout into its template (the summary's switch row). The rules
// are the shared core's (core/workout.js, templates.js).
import { router } from 'expo-router';
import { progressOf, workoutNameKey, pendingSets, templateChanges } from '@setlog/core';

import {
  discardActive, editActive, finishActive, getState, previousSets, restoreTemplateExercises, startWorkout, updateTemplateFromWorkout,
} from '@/data/store';
import type {
  ActiveWorkout, Template, TemplateEntry, Workout,
} from '@/data/types';
import { actionSheet, ask, toast } from '@/ui/overlay';
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
  if (result) router.replace({ pathname: '/summary/[id]', params: { id: result.workout.id } });
}

/** What a finished workout changed in its template (core templateChanges). */
export interface TemplateDiff {
  addedExercises: number; removedExercises: number; reordered: boolean; addedSets: number; removedSets: number;
  typesChanged: boolean; supersetsChanged: boolean; valueSets: number; structure: boolean;
}

/**
 * The summary's template question: the template a finished workout came from
 * and what saving the workout into it would change, or null when there is
 * nothing to ask (no template, an example or a repeated workout, nothing
 * changed, or Settings → Ask to update templates is off). Ask it once, when
 * the summary opens: after saving, the template no longer differs.
 */
export function templateQuestion(workout: Workout): { templateId: string; diff: TemplateDiff } | null {
  const s = getState();
  if (s.settings.askTemplateUpdate === false || !workout.templateId) return null;
  const t = s.templates.find((x) => x.id === workout.templateId);
  if (!t) return null;
  const diff = templateChanges(t, workout) as TemplateDiff;
  if (!diff.structure && !diff.valueSets) return null;
  return { templateId: t.id, diff };
}

/** One line of what saving into the template changes: "Removes 2 exercises. Updates values for 1 set." */
export function describeTemplateDiff(d: TemplateDiff, f: F) {
  const { tr } = f;
  return [
    d.addedExercises ? tr('Adds {n}.', { n: f.plural(d.addedExercises, 'exercise') }) : '',
    d.removedExercises ? tr('Removes {n}.', { n: f.plural(d.removedExercises, 'exercise') }) : '',
    d.reordered ? tr('Reorders exercises.') : '',
    d.addedSets ? tr('Adds {n}.', { n: f.plural(d.addedSets, 'set') }) : '',
    d.removedSets ? tr('Removes {n}.', { n: f.plural(d.removedSets, 'set') }) : '',
    d.typesChanged ? tr('Changes set types.') : '',
    d.supersetsChanged ? tr('Changes supersets.') : '',
    d.valueSets ? tr('Updates values for {n}.', { n: f.plural(d.valueSets, 'set') }) : '',
  ].filter(Boolean).join(' ');
}

/**
 * Save a finished workout into its template (the summary's switch turned on):
 * its exercises, sets and numbers, or only the numbers when nothing else
 * changed. Toasts with Undo; `onUndo` runs after Undo put the template back.
 * Returns the template's previous exercises, for switching it off again.
 */
export async function saveIntoTemplate(templateId: string, workout: Workout, d: TemplateDiff, f: F, onUndo?: () => void) {
  const { tr } = f;
  const valuesOnly = !d.structure;
  const before = await updateTemplateFromWorkout(templateId, workout, valuesOnly);
  if (!before) return null;
  toast(valuesOnly ? tr('Template values updated') : tr('Template updated'), {
    label: tr('Undo'),
    fn: () => { restoreTemplateExercises(templateId, before).then(() => { onUndo?.(); toast(tr('Template change undone')); }); },
  });
  return before;
}

/** Put a template back as it was before saveIntoTemplate (the switch turned off). */
export async function restoreTemplate(templateId: string, before: TemplateEntry[], f: F) {
  await restoreTemplateExercises(templateId, before);
  toast(f.tr('Template change undone'));
}
