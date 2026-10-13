// Import and export in the web app: files, the share sheet, and the shared
// formats from core/ (Strong CSV, backups, template links) wired to the app's data.
import { tr } from './i18n.js';
import {
  S, snapshot, findExerciseByName, APP_VERSION, addExercise, copyTemplate,
} from './store.js';
import { SEED_EXERCISES, CATEGORIES, BODY_PARTS } from './seed.js';
import { setText, setLabels } from './format.js';
import { usesWeight } from './calc.js';
import { plural } from './util.js';
import * as csv from './core/csv.js';
import * as backup from './core/backup.js';
import { encodeTemplate, decodeTemplate } from './core/share.js';

export {
  detectDelimiter, parseCSV, parseDuration, strongDuration,
} from './core/csv.js';

/** Core errors carry English messages that are translation keys. */
const translated = (e) => new Error(tr(e.message, e.vars));

// ---------- Strong CSV ----------
/** Parse a Strong export against the app's exercises and workouts (see core/csv.js). */
export function parseStrongCSV(text, opts = {}) {
  try {
    return csv.parseStrongCSV(text, {
      ...opts,
      findExercise: findExerciseByName,
      hasExercise: (id) => S.exercises.has(id),
      workouts: S.workouts,
      defaultName: tr('Workout'),
    });
  } catch (e) { throw translated(e); }
}
export const exportCSV = () => csv.exportCSV({
  workouts: S.workouts, exercises: S.exercises, unit: S.settings.unit, distUnit: S.settings.distUnit, unknownName: tr('Unknown exercise'),
});

// ---------- JSON backup ----------
export const backupJSON = () => backup.makeBackup(snapshot(), APP_VERSION);
export function parseBackup(text) {
  try { return backup.parseBackup(text, SEED_EXERCISES); } catch (e) { throw translated(e); }
}

// ---------- files ----------
/** Offer a file to the user: share sheet on iOS ("Save to Files"), download elsewhere. */
export async function saveFile(filename, content, mime) {
  if (typeof window !== 'undefined' && window.SETLOG_PREVIEW) {
    throw new Error(tr('Saving files is blocked in this preview. Install the app from your own link to back up.'));
  }
  const blob = new Blob([content], { type: mime });
  let file = null;
  try { file = new File([blob], filename, { type: mime }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.share) {
    let can = false;
    try { can = navigator.canShare({ files: [file] }); } catch (e) { can = false; }
    if (can) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        // fall through to download
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  return 'downloaded';
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.left = '-1000px';
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) { resolve(null); return; }
      resolve({ name: f.name, text: await f.text() });
    });
    document.body.appendChild(input);
    input.click();
  });
}

export async function shareText(text, title) {
  if (navigator.share) {
    try { await navigator.share({ text, title }); return 'shared'; } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { return 'failed'; }
}

const pad = (n) => String(n).padStart(2, '0');
export const dateStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ---------- sharing templates ----------
export function templateShareLink(t) {
  const base = `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
  return `${base}#template=${encodeTemplate(t, S.exercises)}`;
}

export function templateShareText(t) {
  const lines = [tr('{name} (Setlog template)', { name: t.name })];
  if (t.notes) lines.push(t.notes);
  for (const x of t.exercises) {
    const ex = S.exercises.get(x.exerciseId);
    if (!ex) continue;
    const labels = setLabels(x.sets);
    const sets = x.sets.map((st, i) => {
      let v = '';
      if (st.w === undefined && st.r && usesWeight(ex.category)) v = `${st.r} ${tr(st.r === 1 ? 'rep' : 'reps')}`;
      else if (st.w || st.r || st.d || st.t) v = setText(st, ex.category);
      return v && labels[i] === 'W' ? `W ${v}` : v;
    }).filter(Boolean);
    lines.push(`• ${ex.name}: ${plural(x.sets.length, 'set')}${sets.length ? ` (${sets.join(', ')})` : ''}`);
  }
  lines.push('', tr('Add it to Setlog: open this link, or copy it and choose Templates ⋯ → Add shared template in the app.'), templateShareLink(t));
  return lines.join('\n');
}

/** Read a shared template out of a link (or any text containing one). Returns null if there's none. */
export function parseSharedTemplate(text) {
  const p = decodeTemplate(text, { categories: CATEGORIES.map((c) => c.id), bodyParts: BODY_PARTS.map((b) => b.id) });
  if (!p) return null;
  const newExercises = p.exercises.filter((x) => !(x.id && S.exercises.has(x.id)) && !findExerciseByName(x.name)).map((x) => x.name);
  return { ...p, newExercises: [...new Set(newExercises)] };
}

/** Save a parsed shared template, creating any exercises the receiver doesn't have. */
export function addSharedTemplate(p) {
  const exercises = p.exercises.map((x) => {
    let id = x.id && S.exercises.has(x.id) ? x.id : findExerciseByName(x.name)?.id;
    if (!id) id = addExercise({ name: x.name, category: x.category, bodyPart: x.bodyPart }).id;
    const e = { exerciseId: id, sets: x.sets };
    if (x.restSec !== null) e.restSec = x.restSec;
    if (x.notes) e.notes = x.notes;
    if (x.group !== null) e.supersetId = `g${x.group}`;
    if (x.focus) e.focus = x.focus;
    return e;
  });
  return copyTemplate({ name: p.name, notes: p.notes, exercises });
}
