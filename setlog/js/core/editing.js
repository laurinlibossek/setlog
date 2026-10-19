// Editing outside the running workout: the template editor, "Edit workout"
// for a finished one, copies of templates, template folders and new
// exercises. Pure functions over plain records; each app saves the results.
// Problems are English texts (translation keys), translated by the UI.
import { uid, slug } from './units.js';
import { entryToDraft, draftEntries, remapSupersets } from './drafts.js';
import { cleanTemplateExercises } from './templates.js';

export const EDIT_MESSAGES = {
  templateName: 'Give the template a name',
  templateEmpty: 'Add at least one exercise',
  workoutEmpty: 'Keep at least one complete set',
  exerciseName: 'Give the exercise a name',
};

/**
 * The editable form of a template: an existing one (`template`), a new one
 * from a finished workout (`workout`, its notes are left out) or an empty one.
 * @param {{ template?: any, workout?: any, settings: any, hasExercise?: (id: string) => boolean }} o
 */
export function templateDraft({
  template = null, workout = null, settings, hasExercise = () => true,
} = {}) {
  const src = template || workout;
  return {
    kind: 'template',
    id: template ? template.id : uid(),
    name: src?.name || '',
    folder: (template && template.folder) || '',
    notes: (template && template.notes) || '',
    exercises: src ? remapSupersets(src.exercises.filter((e) => hasExercise(e.exerciseId))
      .map((e) => entryToDraft({ ...e, notes: template ? e.notes : '' }, settings))) : [],
  };
}

/**
 * The template to save from the editor, or { problem }. `existing` is the
 * stored template being edited (its other fields are kept).
 * @param {any} draft
 * @param {{ settings: any, exercises: Map<string, any>, existing?: any, now?: number }} o
 */
export function templateFromDraft(draft, {
  settings, exercises, existing = null, now = Date.now(),
}) {
  const name = (draft.name || '').trim();
  if (!name) return { problem: EDIT_MESSAGES.templateName };
  if (!draft.exercises.length) return { problem: EDIT_MESSAGES.templateEmpty };
  return {
    template: {
      ...(existing || { createdAt: now }),
      id: draft.id,
      name,
      folder: (draft.folder || '').trim(),
      notes: (draft.notes || '').trim(),
      exercises: draftEntries(draft, settings, exercises, { keepEmpty: true }).map((e) => ({
        exerciseId: e.exerciseId, notes: e.notes, supersetId: e.supersetId, restSec: e.restSec, focus: e.focus,
        sets: e.sets.map(({ id: _id, ...rest }) => rest),
      })),
    },
  };
}

/**
 * The editable form of a finished workout ("Edit workout"). Entry ids are kept.
 * @param {any} w
 * @param {any} settings
 * @param {(id: string) => boolean} [hasExercise]
 */
export function workoutEditDraft(w, settings, hasExercise = () => true) {
  return {
    kind: 'edit',
    id: w.id,
    name: w.name,
    notes: w.notes || '',
    startedAt: w.startedAt,
    durationMin: String(Math.max(1, Math.round((w.endedAt - w.startedAt) / 60000))),
    templateId: w.templateId || null,
    exercises: w.exercises.filter((e) => hasExercise(e.exerciseId)).map((e) => {
      const d = entryToDraft(e, settings);
      d.id = e.id;
      return d;
    }),
    source: w.source,
  };
}

/**
 * The workout to save from "Edit workout", or { problem }. Sets without reps (or time) are dropped.
 * @param {any} draft
 * @param {{ settings: any, exercises: Map<string, any>, defaultName?: string }} o
 */
export function workoutFromEditDraft(draft, { settings, exercises, defaultName = 'Workout' }) {
  const entries = draftEntries(draft, settings, exercises, {});
  if (!entries.length) return { problem: EDIT_MESSAGES.workoutEmpty };
  const mins = Math.max(1, Math.round(parseFloat(String(draft.durationMin).replace(',', '.')) || 1));
  return {
    workout: {
      id: draft.id,
      name: (draft.name || '').trim() || defaultName,
      notes: (draft.notes || '').trim(),
      startedAt: draft.startedAt,
      endedAt: draft.startedAt + mins * 60000,
      templateId: draft.templateId,
      exercises: entries,
      ...(draft.source ? { source: draft.source } : {}),
    },
  };
}

/**
 * A new template copied from `src` (Duplicate, Add to my templates, a shared template).
 * @param {any} src
 * @param {{ patch?: any, hasExercise?: (id: string) => boolean, now?: number }} [o]
 */
export function copyTemplateRecord(src, { patch = {}, hasExercise = () => true, now = Date.now() } = {}) {
  return {
    id: uid(),
    name: src.name,
    folder: src.folder || '',
    notes: src.notes || '',
    exercises: cleanTemplateExercises(src.exercises, hasExercise),
    createdAt: now,
    ...patch,
  };
}

/**
 * Folder names: the ones templates use plus empty ones created with "New folder", sorted.
 * @param {{ folder?: string }[]} templates
 * @param {string[]} [extra]
 * @returns {string[]}
 */
export function folderNames(templates, extra = []) {
  const names = [...templates.map((t) => t.folder || ''), ...(extra || [])];
  return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const nameKey = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The exercise with this name (any case and spacing), or null. `exercises` is a Map or a list.
 * @param {Map<string, any> | any[]} exercises
 * @param {string} name
 */
export function findExerciseByName(exercises, name) {
  const n = nameKey(name);
  for (const e of exercises.values()) if (nameKey(e.name) === n) return e;
  return null;
}

/**
 * A new custom exercise. Its id comes from the name unless that's taken.
 * @param {{ name: string, category?: string, bodyPart?: string, notes?: string }} o
 * @param {{ hasId?: (id: string) => boolean, now?: number }} [opts]
 */
export function newExerciseRecord({
  name, category, bodyPart, notes = '',
}, { hasId = () => false, now = Date.now() } = {}) {
  let id = 'c-' + slug(name);
  if (!id || id === 'c-' || hasId(id)) id = 'c-' + uid();
  return {
    id, name: String(name).trim(), category, bodyPart, notes, createdAt: now,
  };
}

// Exercise changes made in the template editor or "Edit workout" (rest timer,
// pinned note) wait in draft.exPatches until the screen is saved, so Cancel
// really discards them. The running workout applies them right away.

/**
 * The exercise as the draft sees it (with its waiting changes).
 * @param {Map<string, any>} exercises
 * @param {any} draft
 * @param {string} id
 */
export function exerciseInDraft(exercises, draft, id) {
  const ex = exercises.get(id);
  const p = draft && draft.exPatches && draft.exPatches[id];
  return ex && p ? { ...ex, ...p } : ex;
}

/**
 * Remember a change to an exercise until the draft is saved.
 * @param {any} draft
 * @param {string} id
 * @param {any} patch
 */
export function patchDraftExercise(draft, id, patch) {
  draft.exPatches = draft.exPatches || {};
  draft.exPatches[id] = { ...(draft.exPatches[id] || {}), ...patch };
}
