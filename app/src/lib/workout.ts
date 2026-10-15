// Starting and finishing a workout: the questions on the way (a workout is
// already running, unchecked sets, update the template?) and where the app
// goes next. The rules are the shared core's (core/workout.js, templates.js).
import { router } from 'expo-router';
import { progressOf, workoutNameKey, pendingSets, templateChanges } from '@setlog/core';

import {
  discardActive, editActive, finishActive, getState, previousSets, restoreTemplateExercises, startWorkout, updateTemplateFromWorkout,
} from '@/data/store';
import type { ActiveWorkout, Template, Workout } from '@/data/types';
import { actionSheet, ask, choose, toast } from '@/ui/overlay';
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

/** After a workout from a template: offer to save what changed into the template. */
export async function offerTemplateUpdate(workout: Workout, f: F) {
  const { tr } = f;
  const s = getState();
  if (s.settings.askTemplateUpdate === false || !workout.templateId) return;
  const t = s.templates.find((x) => x.id === workout.templateId);
  if (!t) return;
  const ch = templateChanges(t, workout) as {
    addedExercises: number; removedExercises: number; reordered: boolean; addedSets: number; removedSets: number;
    typesChanged: boolean; supersetsChanged: boolean; valueSets: number; structure: boolean;
  };
  if (!ch.structure && !ch.valueSets) return;
  const name = tr('“{name}”', { name: t.name });
  const lines = [
    ch.addedExercises ? tr('Adds {n}.', { n: f.plural(ch.addedExercises, 'exercise') }) : '',
    ch.removedExercises ? tr('Removes {n}.', { n: f.plural(ch.removedExercises, 'exercise') }) : '',
    ch.reordered ? tr('Reorders exercises.') : '',
    ch.addedSets ? tr('Adds {n}.', { n: f.plural(ch.addedSets, 'set') }) : '',
    ch.removedSets ? tr('Removes {n}.', { n: f.plural(ch.removedSets, 'set') }) : '',
    ch.typesChanged ? tr('Changes set types.') : '',
    ch.supersetsChanged ? tr('Changes supersets.') : '',
  ].filter(Boolean).join(' ');
  const choice = await choose<'values' | 'all' | 'keep'>({
    title: tr('Update template'),
    message: ch.structure
      ? tr('You changed {name} during this workout. Update the template?', { name })
      : tr('You logged different numbers than {name} has saved. Update the template?', { name }),
    cancel: false,
    options: [
      ch.valueSets > 0 ? { label: ch.structure ? tr('Update values only') : tr('Update values'), sub: tr('Updates values for {n}.', { n: f.plural(ch.valueSets, 'set') }), value: 'values' as const, tone: 'primary' as const, testID: 'tpl-update-values' } : null,
      ch.structure ? { label: tr('Update template and values'), sub: lines, value: 'all' as const, tone: 'danger' as const, testID: 'tpl-update-all' } : null,
      { label: tr('Keep original template'), value: 'keep' as const, tone: 'plain' as const, testID: 'tpl-update-keep' },
    ].filter((x) => x !== null),
  });
  if (choice !== 'values' && choice !== 'all') return;
  const before = await updateTemplateFromWorkout(t.id, workout, choice === 'values');
  if (!before) return;
  toast(choice === 'values' ? tr('Template values updated') : tr('Template updated'), {
    label: tr('Undo'), fn: () => { restoreTemplateExercises(t.id, before).then(() => toast(tr('Template change undone'))); },
  });
}
