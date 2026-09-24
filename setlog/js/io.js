// Import/export: Strong CSV import, Strong-style CSV export, JSON backup/restore.
import {
  S, snapshot, findExerciseByName, APP_VERSION, addExercise, copyTemplate,
} from './store.js';
import { SEED_EXERCISES, CATEGORIES, BODY_PARTS } from './seed.js';
import { setText, setLabels } from './format.js';
import { usesWeight } from './calc.js';
import {
  uid, slug, parseNum, KG_PER_LB, KM_PER_MI, fmtDur, kgTo, kmTo, roundW,
} from './util.js';

// ---------- CSV ----------
export function detectDelimiter(text) {
  const nl = text.search(/\r?\n/);
  const line = nl >= 0 ? text.slice(0, nl) : text;
  const count = (ch) => {
    let n = 0, q = false;
    for (const c of line) { if (c === '"') q = !q; else if (c === ch && !q) n++; }
    return n;
  };
  const c = count(','), sc = count(';'), tab = count('\t');
  if (sc > c && sc >= tab) return ';';
  if (tab > c) return '\t';
  return ',';
}

export function parseCSV(text, delim) {
  text = String(text).replace(/^\uFEFF/, '');
  delim = delim || detectDelimiter(text);
  const rows = [];
  let row = [], field = '', q = false, i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === delim) { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// ---------- dates & durations ----------
function parseDateFactory(samples) {
  // decide day-first vs month-first for slash dates from the data itself
  let dayFirst = null;
  for (const s of samples) {
    const m = /^(\d{1,2})\/(\d{1,2})\/\d{2,4}/.exec(s.trim());
    if (!m) continue;
    if (+m[1] > 12) { dayFirst = true; break; }
    if (+m[2] > 12) { dayFirst = false; break; }
  }
  return (str) => {
    const s = String(str || '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0)).getTime();
    m = /^(\d{1,2})([./])(\d{1,2})\2(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/.exec(s);
    if (m) {
      let a = +m[1], b = +m[3], y = +m[4];
      if (y < 100) y += 2000;
      const df = m[2] === '.' ? true : (dayFirst ?? false);
      const day = df ? a : b, month = df ? b : a;
      let h = +(m[5] || 12);
      const ap = (m[8] || '').toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      return new Date(y, month - 1, day, h, +(m[6] || 0), +(m[7] || 0)).getTime();
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  };
}

export function parseDuration(str) {
  const s = String(str || '').trim().toLowerCase();
  if (!s) return 0;
  let m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  // "1:02:03" = h:mm:ss; "1:05" = h:mm (workout durations are hours + minutes)
  if (m) return m[3] !== undefined ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : (+m[1] * 3600 + +m[2] * 60);
  let total = 0, found = false;
  for (const [, num, u] of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(h|m|s)/g)) {
    const v = parseFloat(num.replace(',', '.'));
    total += u === 'h' ? v * 3600 : u === 'm' ? v * 60 : v;
    found = true;
  }
  if (found) return Math.round(total);
  const n = parseNum(s);
  if (n === null) return 0;
  return n > 300 ? Math.round(n) : Math.round(n * 60);
}

// ---------- category / body part inference ----------
function inferCategory(name, rows) {
  const n = name.toLowerCase();
  const anyDist = rows.some((r) => r.d > 0);
  const anyW = rows.some((r) => r.w > 0);
  const anyR = rows.some((r) => r.r > 0);
  const anyT = rows.some((r) => r.t > 0);
  if (anyDist) return 'cardio';
  if (n.includes('(assisted)')) return 'assisted_bw';
  if (n.includes('(weighted)')) return 'weighted_bw';
  if (anyW) {
    if (n.includes('(barbell)') || n.includes('(ez bar)') || n.includes('(trap bar)')) return 'barbell';
    if (n.includes('(dumbbell)')) return 'dumbbell';
    if (!n.includes('(') && /clean|snatch|jerk|deadlift|squat|bench press|overhead press/.test(n)) return 'barbell';
    return 'machine';
  }
  if (anyR) return 'reps';
  if (anyT) return 'duration';
  return 'machine';
}

const BODY_RULES = [
  ['cardio', /running|jog|cycling|bike|biking|rowing|swim|walk|elliptical|stair|ski erg|aerobic|cardio|hiking|treadmill|spinning|jump rope/],
  ['core', /crunch|plank|sit ?up|leg raise|knee raise|\bab\b|abs|twist|hollow|l-sit|toes to bar|dead bug|pallof|wood ?chop|v-up|flutter/],
  ['full', /clean|snatch|jerk|thruster|burpee|swing|get ?up|farmer|sled|battle rope/],
  ['legs', /squat|lunge|\bleg|calf|calves|hip thrust|glute|romanian|\brdl\b|good morning|step ?up|abduct|adduct|hamstring|quad/],
  ['chest', /bench|chest|\bfly\b|flye|crossover|push ?up|pec|dip/],
  ['back', /row\b|rows\b|pull ?up|chin ?up|pulldown|pull-down|deadlift|\blat\b|shrug|back ext|hyperext|rack pull/],
  ['shoulders', /overhead|shoulder|military|arnold|lateral|front raise|face pull|rear delt|reverse fly|upright|press/],
  ['arms', /curl|tricep|skull|kickback|pushdown|extension|wrist/],
];
function inferBodyPart(name) {
  const n = name.toLowerCase();
  for (const [part, re] of BODY_RULES) if (re.test(n)) return part;
  return 'other';
}

// ---------- Strong import ----------
/**
 * Notes a stored workout lacks but the import has. Exercises pair by id and
 * occurrence. Returns { id, notes?, entries: [[index, note]] } or null.
 */
function missingNotes(w, notes, entries) {
  const u = { id: w.id, entries: [] };
  if (notes && !w.notes) u.notes = notes;
  const seen = new Map();
  const at = new Map();
  w.exercises.forEach((e, i) => {
    const n = seen.get(e.exerciseId) || 0;
    seen.set(e.exerciseId, n + 1);
    at.set(`${e.exerciseId}#${n}`, i);
  });
  const seen2 = new Map();
  for (const e of entries) {
    const n = seen2.get(e.exerciseId) || 0;
    seen2.set(e.exerciseId, n + 1);
    const i = at.get(`${e.exerciseId}#${n}`);
    if (e.notes && i !== undefined && !w.exercises[i].notes) u.entries.push([i, e.notes]);
  }
  return u.notes || u.entries.length ? u : null;
}

const HEADER_ALIASES = {
  date: ['date'],
  workout: ['workout name', 'workout'],
  duration: ['duration', 'workout duration'],
  exercise: ['exercise name', 'exercise'],
  order: ['set order', 'set', 'set #'],
  weight: ['weight'],
  weightUnit: ['weight unit'],
  reps: ['reps'],
  distance: ['distance'],
  distanceUnit: ['distance unit'],
  seconds: ['seconds', 'time'],
  notes: ['notes'],
  workoutNotes: ['workout notes'],
  rpe: ['rpe'],
};

/**
 * Parse a Strong export. Returns a preview object; nothing is saved yet.
 * opts.weightUnit / opts.distUnit: units the Strong app was set to (used when
 * the file doesn't say).
 */
export function parseStrongCSV(text, opts = {}) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The file is empty or not a CSV export.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [key, names] of Object.entries(HEADER_ALIASES)) {
    col[key] = header.findIndex((h) => names.includes(h));
  }
  if (col.date < 0 || col.exercise < 0) {
    throw new Error('This doesn\'t look like a Strong export — it needs "Date" and "Exercise Name" columns.');
  }
  const get = (r, key) => (col[key] >= 0 ? (r[col[key]] ?? '').trim() : '');
  const parseDate = parseDateFactory(rows.slice(1, 200).map((r) => get(r, 'date')));
  const defW = opts.weightUnit || 'kg';
  const defD = opts.distUnit || 'km';

  const groups = new Map();
  let skippedRows = 0;
  let restRows = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const dateStr = get(r, 'date');
    const exName = get(r, 'exercise');
    const startedAt = parseDate(dateStr);
    if (!startedAt || !exName) { skippedRows++; continue; }
    const wName = get(r, 'workout') || 'Workout';
    const key = dateStr + '|' + wName;
    let g = groups.get(key);
    if (!g) {
      g = {
        startedAt, name: wName, durationSec: parseDuration(get(r, 'duration')),
        notes: get(r, 'workoutNotes'), entries: [],
      };
      groups.set(key, g);
    }
    if (!g.notes && get(r, 'workoutNotes')) g.notes = get(r, 'workoutNotes');

    let last = g.entries[g.entries.length - 1];
    const orderRaw = get(r, 'order');
    const order = orderRaw.toLowerCase();
    if (!last || last.name !== exName) {
      last = { name: exName, sets: [], notes: '', restSec: null };
      g.entries.push(last);
    }
    // an exercise note can sit on any of its rows, including rest-timer rows
    const note = get(r, 'notes');
    if (note && !last.notes) last.notes = note;
    if (order.includes('rest')) {
      const sec = parseNum(get(r, 'seconds'));
      if (sec > 0) last.restSec = Math.round(sec);
      restRows++;
      continue;
    }
    let type = 'normal';
    if (order === 'w') type = 'warmup';
    else if (order === 'd') type = 'drop';
    else if (order === 'f') type = 'failure';
    else if (order && !/^\d+$/.test(order)) { skippedRows++; continue; }

    let w = parseNum(get(r, 'weight'));
    const wu = get(r, 'weightUnit').toLowerCase() || defW;
    if (w !== null && /^lb/.test(wu)) w *= KG_PER_LB;
    let d = parseNum(get(r, 'distance'));
    const du = get(r, 'distanceUnit').toLowerCase() || defD;
    if (d !== null && /^mi/.test(du)) d *= KM_PER_MI;
    else if (d !== null && (du === 'm' || du === 'meters')) d /= 1000;
    const reps = parseNum(get(r, 'reps'));
    const t = parseNum(get(r, 'seconds'));
    const rpe = parseNum(get(r, 'rpe'));
    const set = { id: uid(), type };
    if (w !== null && w !== 0) set.w = Math.round(w * 10000) / 10000;
    if (reps !== null && reps > 0) set.r = Math.round(reps);
    if (d !== null && d > 0) set.d = Math.round(d * 100000) / 100000;
    if (t !== null && t > 0) set.t = Math.round(t);
    if (rpe !== null && rpe > 0) set.rpe = rpe;
    if (set.r > 0 && set.w === undefined) set.w = 0;
    if (!(set.r > 0 || set.d > 0 || set.t > 0)) { skippedRows++; continue; }
    last.sets.push(set);
  }

  // resolve exercises
  const byName = new Map();
  const rowsByName = new Map();
  for (const g of groups.values()) {
    for (const e of g.entries) {
      if (!rowsByName.has(e.name)) rowsByName.set(e.name, []);
      rowsByName.get(e.name).push(...e.sets);
    }
  }
  const newExercises = [];
  for (const [name, sets] of rowsByName) {
    const existing = findExerciseByName(name);
    if (existing) { byName.set(name, existing.id); continue; }
    let id = 'c-' + slug(name);
    if (!slug(name) || S.exercises.has(id) || newExercises.some((x) => x.id === id)) id = 'c-' + uid();
    const ex = {
      id, name: name.trim(), category: inferCategory(name, sets), bodyPart: inferBodyPart(name),
      createdAt: Date.now(), imported: true,
    };
    newExercises.push(ex);
    byName.set(name, id);
  }

  // build workouts, skip ones already present
  const existing = new Map(S.workouts.map((w) => [w.startedAt + '|' + w.name, w]));
  const existingKeys = new Set(existing.keys());
  const workouts = [];
  const noteUpdates = [];
  let duplicates = 0;
  let setCount = 0;
  for (const g of groups.values()) {
    const entries = g.entries.filter((e) => e.sets.length).map((e) => {
      const entry = { id: uid(), exerciseId: byName.get(e.name), sets: e.sets };
      if (e.notes) entry.notes = e.notes;
      if (e.restSec) entry.restSec = e.restSec;
      return entry;
    });
    if (!entries.length) continue;
    if (existingKeys.has(g.startedAt + '|' + g.name)) {
      duplicates++;
      // already imported (maybe by an older version that dropped notes): fill in missing notes
      const w = existing.get(g.startedAt + '|' + g.name);
      const u = w && missingNotes(w, g.notes, entries);
      if (u) noteUpdates.push(u);
      continue;
    }
    existingKeys.add(g.startedAt + '|' + g.name);
    setCount += entries.reduce((a, e) => a + e.sets.length, 0);
    workouts.push({
      id: 's-' + g.startedAt + '-' + (slug(g.name) || 'workout'),
      name: g.name,
      notes: g.notes || '',
      startedAt: g.startedAt,
      endedAt: g.startedAt + Math.max(60, g.durationSec || 0) * 1000,
      templateId: null,
      exercises: entries,
      source: 'strong',
    });
  }
  // only create exercises that are actually used by imported workouts
  const used = new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)));
  const exercisesToAdd = newExercises.filter((e) => used.has(e.id));
  workouts.sort((a, b) => a.startedAt - b.startedAt);
  return {
    workouts,
    exercises: exercisesToAdd,
    noteUpdates,
    stats: {
      workouts: workouts.length,
      notesAdded: noteUpdates.length,
      sets: setCount,
      duplicates,
      skippedRows,
      restRows,
      newExercises: exercisesToAdd.map((e) => e.name),
      matchedExercises: [...byName.values()].filter((id) => !exercisesToAdd.some((e) => e.id === id)).length,
      first: workouts[0]?.startedAt || null,
      last: workouts[workouts.length - 1]?.startedAt || null,
      hasWeightUnitColumn: col.weightUnit >= 0,
    },
  };
}

// ---------- CSV export (Strong-compatible) ----------
function pad(n) { return String(n).padStart(2, '0'); }
function isoLocal(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function exportCSV() {
  const st = S.settings;
  const lines = [['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE'].join(',')];
  const asc = [...S.workouts].sort((a, b) => a.startedAt - b.startedAt);
  for (const w of asc) {
    const dur = fmtDur((w.endedAt || w.startedAt) - w.startedAt);
    for (const e of w.exercises) {
      const name = S.exercises.get(e.exerciseId)?.name || 'Unknown exercise';
      let n = 0;
      e.sets.forEach((s, i) => {
        let order;
        if (s.type === 'warmup') order = 'W';
        else if (s.type === 'drop') order = 'D';
        else if (s.type === 'failure') order = 'F';
        else order = String(++n);
        lines.push([
          isoLocal(w.startedAt), w.name, dur, name, order,
          s.w !== undefined && s.w !== null ? roundW(kgTo(s.w, st.unit), st.unit) : 0,
          s.r || 0,
          s.d ? Math.round(kmTo(s.d, st.distUnit) * 1000) / 1000 : 0,
          s.t || 0,
          i === 0 ? e.notes || '' : '',
          w.notes || '',
          s.rpe || '',
        ].map(csvCell).join(','));
      });
    }
  }
  return lines.join('\n') + '\n';
}

// ---------- JSON backup ----------
export function backupJSON() {
  return JSON.stringify({
    app: 'setlog', schema: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data: snapshot(),
  });
}

export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error('This file isn\'t valid JSON.'); }
  if (!obj || obj.app !== 'setlog' || !obj.data) throw new Error('This isn\'t a Setlog backup file.');
  const d = obj.data;
  for (const k of ['exercises', 'workouts', 'templates', 'measurements']) {
    if (d[k] !== undefined && !Array.isArray(d[k])) throw new Error(`The backup is damaged (${k}).`);
  }
  // keep the built-in library even if the backup predates it
  const exercises = d.exercises || [];
  const ids = new Set(exercises.map((e) => e.id));
  for (const e of SEED_EXERCISES) if (!ids.has(e.id)) exercises.push({ ...e });
  return {
    exportedAt: obj.exportedAt,
    data: {
      exercises,
      workouts: d.workouts || [],
      templates: d.templates || [],
      measurements: d.measurements || [],
      kv: d.kv || {},
    },
  };
}

// ---------- files ----------
/** Offer a file to the user: share sheet on iOS ("Save to Files"), download elsewhere. */
export async function saveFile(filename, content, mime) {
  if (typeof window !== 'undefined' && window.SETLOG_PREVIEW) {
    throw new Error('Saving files is blocked in this preview. Install the app from your own link to back up.');
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

export const dateStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ---------- sharing templates ----------
// A template travels as a link: <app url>#template=<base64url JSON>. Built-in
// exercises go by id, custom ones by name, category and body part, so the
// receiver gets matching exercises (or new custom ones) without any server.
const TYPE_CODE = { normal: 'n', warmup: 'w', drop: 'd', failure: 'f' };
const CODE_TYPE = Object.fromEntries(Object.entries(TYPE_CODE).map(([k, v]) => [v, k]));

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(code) {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function templateShareLink(t) {
  const groups = new Map();
  const e = t.exercises.filter((x) => S.exercises.has(x.exerciseId)).map((x) => {
    const ex = S.exercises.get(x.exerciseId);
    const o = { n: ex.name, c: ex.category, b: ex.bodyPart };
    if (ex.builtin) o.i = ex.id;
    o.s = x.sets.map((st) => {
      const row = [TYPE_CODE[st.type || 'normal'] || 'n', st.w ?? null, st.r ?? null, st.d ?? null, st.t ?? null];
      while (row.length > 1 && row[row.length - 1] === null) row.pop();
      return row;
    });
    if (x.restSec !== null && x.restSec !== undefined) o.r = x.restSec;
    if (x.notes) o.o = x.notes;
    if (x.focus) o.m = x.focus;
    if (x.supersetId) {
      if (!groups.has(x.supersetId)) groups.set(x.supersetId, groups.size + 1);
      o.g = groups.get(x.supersetId);
    }
    return o;
  });
  const data = { v: 1, n: t.name, e };
  if (t.notes) data.f = t.notes;
  const base = `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
  return `${base}#template=${b64urlEncode(JSON.stringify(data))}`;
}

export function templateShareText(t) {
  const lines = [`${t.name} (Setlog template)`];
  if (t.notes) lines.push(t.notes);
  for (const x of t.exercises) {
    const ex = S.exercises.get(x.exerciseId);
    if (!ex) continue;
    const labels = setLabels(x.sets);
    const sets = x.sets.map((st, i) => {
      let v = '';
      if (st.w === undefined && st.r && usesWeight(ex.category)) v = `${st.r} reps`;
      else if (st.w || st.r || st.d || st.t) v = setText(st, ex.category);
      return v && labels[i] === 'W' ? `W ${v}` : v;
    }).filter(Boolean);
    lines.push(`• ${ex.name}: ${x.sets.length} set${x.sets.length === 1 ? '' : 's'}${sets.length ? ` (${sets.join(', ')})` : ''}`);
  }
  lines.push('', `Add it to Setlog: open this link, or copy it and choose Templates ⋯ → Add shared template in the app.`, templateShareLink(t));
  return lines.join('\n');
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 100000 ? v : null);

/** Read a shared template out of a link (or any text containing one). Returns null if there's none. */
export function parseSharedTemplate(text) {
  const m = String(text || '').match(/template=([A-Za-z0-9_-]{8,})/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(b64urlDecode(m[1])); } catch (e) { return null; }
  if (!d || d.v !== 1 || !Array.isArray(d.e)) return null;
  const cats = new Set(CATEGORIES.map((c) => c.id));
  const parts = new Set(BODY_PARTS.map((b) => b.id));
  const exercises = d.e.slice(0, 40).map((o) => {
    if (!o || typeof o !== 'object') return null;
    const name = str(o.n, 80);
    if (!name) return null;
    const sets = (Array.isArray(o.s) ? o.s : []).slice(0, 30).map((row) => {
      if (!Array.isArray(row)) return null;
      const set = { type: CODE_TYPE[row[0]] || 'normal' };
      ['w', 'r', 'd', 't'].forEach((k, i) => { const v = num(row[i + 1]); if (v !== null) set[k] = v; });
      return set;
    }).filter(Boolean);
    return {
      id: typeof o.i === 'string' && /^x-[a-z0-9-]+$/.test(o.i) ? o.i : null,
      name,
      category: cats.has(o.c) ? o.c : 'barbell',
      bodyPart: parts.has(o.b) ? o.b : 'other',
      sets: sets.length ? sets : [{ type: 'normal' }],
      restSec: num(o.r),
      notes: str(o.o, 500),
      group: Number.isInteger(o.g) ? o.g : null,
      focus: ['volume', 'volumeChange', 'reps', 'weightPerRep', 'repsChange'].includes(o.m) ? o.m : null,
    };
  }).filter(Boolean);
  const name = str(d.n, 80);
  if (!name || !exercises.length) return null;
  const newExercises = exercises.filter((x) => !(x.id && S.exercises.has(x.id)) && !findExerciseByName(x.name)).map((x) => x.name);
  return { name, notes: str(d.f, 1000), exercises, newExercises: [...new Set(newExercises)] };
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
