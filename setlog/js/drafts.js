// Drafts are the editable form of workouts/templates: every number is kept as
// the string the user typed (in display units), so "62," survives while typing.
// Saved records use canonical numbers: kg, km, seconds.
import {
  uid, parseNum, numToInput, kgTo, toKg, kmTo, toKm, roundW, digitsToSec, secToDigits,
} from './util.js';
import { setIsValid } from './calc.js';

export function newSetDraft(type = 'normal', extra = {}) {
  return { id: uid(), type, w: '', r: '', d: '', t: '', rpe: '', done: false, ...extra };
}

export function weightToInput(kg, st) {
  if (kg === null || kg === undefined) return '';
  return numToInput(roundW(kgTo(kg, st.unit), st.unit));
}

export function setToDraft(s, st, keepId = true) {
  return {
    id: keepId && s.id ? s.id : uid(),
    type: s.type || 'normal',
    w: weightToInput(s.w, st),
    r: s.r !== null && s.r !== undefined ? String(s.r) : '',
    d: s.d !== null && s.d !== undefined ? numToInput(kmTo(s.d, st.distUnit), 3) : '',
    t: secToDigits(s.t),
    rpe: s.rpe !== null && s.rpe !== undefined ? numToInput(s.rpe, 1) : '',
    done: false,
  };
}

export function draftToSet(sd, st) {
  const out = { id: sd.id || uid(), type: sd.type || 'normal' };
  const w = parseNum(sd.w), r = parseNum(sd.r), d = parseNum(sd.d), t = digitsToSec(sd.t), rpe = parseNum(sd.rpe);
  if (w !== null) out.w = toKg(w, st.unit);
  if (r !== null) out.r = Math.max(0, Math.round(r));
  if (d !== null) out.d = toKm(d, st.distUnit);
  if (t !== null && t > 0) out.t = t;
  if (rpe !== null && rpe > 0) out.rpe = Math.min(10, rpe);
  return out;
}

export function entryToDraft(e, st, { asTemplateTargets = false } = {}) {
  return {
    id: uid(),
    exerciseId: e.exerciseId,
    notes: e.notes || '',
    showNotes: !!e.notes,
    supersetId: e.supersetId || null,
    restSec: e.restSec ?? null,
    sets: e.sets.map((s) => (asTemplateTargets
      ? newSetDraft(s.type || 'normal', { tpl: { w: s.w ?? null, r: s.r ?? null, d: s.d ?? null, t: s.t ?? null } })
      : setToDraft(s, st))),
  };
}

export function newEntryDraft(exerciseId, sets = 1) {
  return {
    id: uid(), exerciseId, notes: '', showNotes: false, supersetId: null, restSec: null,
    sets: Array.from({ length: sets }, () => newSetDraft()),
  };
}

export function remapSupersets(entries) {
  // fresh superset ids so drafts never share ids with stored records
  const map = new Map();
  for (const e of entries) {
    if (!e.supersetId) continue;
    if (!map.has(e.supersetId)) map.set(e.supersetId, uid());
    e.supersetId = map.get(e.supersetId);
  }
  return entries;
}

/** Convert a draft into saved exercise entries. */
export function draftEntries(draft, st, exById, { onlyDone = false, keepEmpty = false } = {}) {
  const out = [];
  for (const e of draft.exercises) {
    const ex = exById.get(e.exerciseId);
    if (!ex) continue;
    let sets = e.sets.filter((s) => !onlyDone || s.done).map((s) => draftToSet(s, st));
    if (!keepEmpty) sets = sets.filter((s) => setIsValid(s, ex.category));
    if (!sets.length && !keepEmpty) continue;
    const entry = { id: e.id, exerciseId: e.exerciseId, sets };
    if (e.notes && e.notes.trim()) entry.notes = e.notes.trim();
    if (e.supersetId) entry.supersetId = e.supersetId;
    if (e.restSec !== null && e.restSec !== undefined) entry.restSec = e.restSec;
    out.push(entry);
  }
  // drop superset ids that no longer group two or more entries
  const counts = new Map();
  for (const e of out) if (e.supersetId) counts.set(e.supersetId, (counts.get(e.supersetId) || 0) + 1);
  for (const e of out) if (e.supersetId && counts.get(e.supersetId) < 2) delete e.supersetId;
  return out;
}

/** Convert the weight strings of a draft when the unit setting changes. */
export function convertDraftUnits(draft, from, to) {
  if (!draft) return;
  const conv = (s, kind) => {
    const n = parseNum(s);
    if (n === null) return s;
    if (kind === 'w') {
      if (from.unit === to.unit) return s;
      return numToInput(roundW(kgTo(toKg(n, from.unit), to.unit), to.unit));
    }
    if (from.distUnit === to.distUnit) return s;
    return numToInput(kmTo(toKm(n, from.distUnit), to.distUnit), 3);
  };
  for (const e of draft.exercises) {
    for (const s of e.sets) { s.w = conv(s.w, 'w'); s.d = conv(s.d, 'd'); }
  }
}
