// Exercise picker and the create/edit exercise form.
import { html, useState, useMemo, useRef, useEffect } from './lib.js';
import { Icon } from './icons.js';
import {
  S, exerciseList, stats, addExercise, updateExercise, findExerciseByName,
} from './store.js';
import {
  BODY_PARTS, BODY_PART_LABEL, CATEGORIES, CATEGORY_LABEL,
} from './seed.js';
import { NavBar, openScreenModal, toast } from './ui.js';

const ALIASES = {
  db: 'dumbbell', bb: 'barbell', ohp: 'overhead press', rdl: 'romanian deadlift', bp: 'bench press',
  dl: 'deadlift', kb: 'kettlebell', ez: 'ez bar', smith: 'smith', tri: 'triceps', tris: 'triceps', bi: 'bicep',
  bis: 'bicep', lat: 'lat', pulldown: 'pulldown', pullup: 'pull up', pushup: 'push up', chinup: 'chin up',
  situp: 'sit up', hamstring: 'leg curl', quad: 'leg extension', delt: 'raise', abs: 'crunch',
};
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compactStr = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function matchExercise(ex, query) {
  const q = norm(query);
  if (!q) return true;
  const name = norm(ex.name);
  const nameC = compactStr(ex.name);
  return q.split(' ').every((tok) => {
    const al = ALIASES[tok];
    if (name.includes(tok) || nameC.includes(tok)) return true;
    if (al) return al.split(' ').every((a) => name.includes(a));
    return false;
  });
}

export function recentExerciseIds(limit = 8) {
  const out = [];
  const seen = new Set();
  for (const w of S.workouts) {
    for (const e of w.exercises) {
      if (seen.has(e.exerciseId) || !S.exercises.has(e.exerciseId)) continue;
      seen.add(e.exerciseId);
      out.push(e.exerciseId);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function ExerciseRow({ ex, on, onClick, count }) {
  return html`<button class=${'picker-row' + (on ? ' on' : '')} onClick=${onClick} aria-pressed=${on}>
    <div class="avatar">${on ? html`<${Icon} name="check" />` : ex.name.charAt(0).toUpperCase()}</div>
    <div class="cell-main">
      <div class="cell-title">${ex.name}</div>
      <div class="cell-sub">${BODY_PART_LABEL[ex.bodyPart] || 'Other'}${count ? ` · ${count}×` : ''}</div>
    </div>
  </button>`;
}

/** Full-screen exercise picker. Resolves to an array of ids (multi) or one id. */
export function pickExercises({ multi = true, title = 'Add exercises' } = {}) {
  return openScreenModal((close) => html`<${Picker} multi=${multi} title=${title} close=${close} />`);
}

function Picker({ multi, title, close }) {
  const [q, setQ] = useState('');
  const [part, setPart] = useState('all');
  const [sel, setSel] = useState([]);
  const [, setV] = useState(0);
  const inputRef = useRef();
  const counts = useMemo(() => {
    const m = new Map();
    for (const [id, arr] of stats().byExercise) m.set(id, arr.length);
    return m;
  }, [S.v.workouts]);

  const list = exerciseList().filter((e) => !e.hidden && (part === 'all' || e.bodyPart === part) && matchExercise(e, q));
  const recent = !q && part === 'all' ? recentExerciseIds(6).map((id) => S.exercises.get(id)).filter((e) => e && !e.hidden) : [];

  const toggle = (id) => {
    if (!multi) { close(id); return; }
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const create = async () => {
    const ex = await editExercise(null, { name: q.trim() });
    if (ex) {
      setV((v) => v + 1);
      if (!multi) { close(ex.id); return; }
      setSel((s) => [...s, ex.id]);
      setQ('');
    }
  };

  // letter groups
  const groups = [];
  let cur = null;
  for (const ex of list) {
    const L = /[a-z]/i.test(ex.name[0]) ? ex.name[0].toUpperCase() : '#';
    if (!cur || cur.L !== L) { cur = { L, items: [] }; groups.push(cur); }
    cur.items.push(ex);
  }

  return html`
    <${NavBar} title=${title} solid
      left=${html`<button class="nav-btn" onClick=${() => close(undefined)}>Cancel</button>`}
      right=${html`<button class="nav-btn" onClick=${create} aria-label="New exercise">New</button>`} />
    <div class="scroll"><div class="page">
      <div class="sticky-top">
        <label class="search"><${Icon} name="search" />
          <input ref=${inputRef} type="search" id="picker-search" placeholder="Search exercises" value=${q}
            autocomplete="off" autocorrect="off" spellcheck=${false} onInput=${(e) => setQ(e.target.value)} />
          ${q && html`<button onClick=${() => setQ('')} aria-label="Clear search"><${Icon} name="x" size=${16} /></button>`}
        </label>
        <div class="chips" style="margin-top:10px">
          <button class=${'chip' + (part === 'all' ? ' on' : '')} onClick=${() => setPart('all')}>All</button>
          ${BODY_PARTS.map((b) => html`<button class=${'chip' + (part === b.id ? ' on' : '')} onClick=${() => setPart(b.id)}>${b.label}</button>`)}
        </div>
      </div>
      ${recent.length > 0 && html`<div class="letter-head">Recent</div>
        <div class="group">${recent.map((ex) => html`<${ExerciseRow} key=${'r' + ex.id} ex=${ex} on=${sel.includes(ex.id)}
          count=${counts.get(ex.id)} onClick=${() => toggle(ex.id)} />`)}</div>`}
      ${groups.map((g) => html`<div key=${g.L}>
        <div class="letter-head">${g.L}</div>
        <div class="group">${g.items.map((ex) => html`<${ExerciseRow} key=${ex.id} ex=${ex} on=${sel.includes(ex.id)}
          count=${counts.get(ex.id)} onClick=${() => toggle(ex.id)} />`)}</div>
      </div>`)}
      ${!list.length && html`<div class="empty"><h3>No match for “${q}”</h3>
        <p>Create it as your own exercise.</p>
        <div style="margin-top:14px"><button class="btn btn-tinted" onClick=${create}><${Icon} name="plus" />Create “${q.trim() || 'new exercise'}”</button></div></div>`}
    </div></div>
    ${multi && html`<div class="bottom-bar">
      <button class="btn btn-primary btn-block btn-lg" id="picker-add" disabled=${!sel.length} onClick=${() => close(sel)}>
        ${sel.length ? `Add ${sel.length} exercise${sel.length > 1 ? 's' : ''}` : 'Select exercises'}</button>
    </div>`}`;
}

/** Create (ex = null) or edit an exercise. Resolves to the saved exercise or undefined. */
export function editExercise(ex, preset = {}) {
  return openScreenModal((close) => html`<${ExerciseForm} ex=${ex} preset=${preset} close=${close} />`);
}

function ExerciseForm({ ex, preset, close }) {
  const [name, setName] = useState(ex?.name || preset.name || '');
  const [category, setCategory] = useState(ex?.category || preset.category || 'machine');
  const [bodyPart, setBodyPart] = useState(ex?.bodyPart || preset.bodyPart || 'chest');
  const [notes, setNotes] = useState(ex?.notes || '');
  const ref = useRef();
  useEffect(() => { if (!ex) setTimeout(() => ref.current?.focus(), 250); }, []);
  const save = () => {
    const n = name.trim();
    if (!n) { toast('Give the exercise a name'); return; }
    const dupe = findExerciseByName(n);
    if (dupe && dupe.id !== ex?.id) { toast(`“${dupe.name}” already exists`); return; }
    if (ex) {
      updateExercise(ex.id, { name: n, category, bodyPart, notes });
      close(S.exercises.get(ex.id));
    } else {
      close(addExercise({ name: n, category, bodyPart, notes }));
    }
  };
  return html`
    <${NavBar} title=${ex ? 'Edit exercise' : 'New exercise'} solid
      left=${html`<button class="nav-btn" onClick=${() => close(undefined)}>Cancel</button>`}
      right=${html`<button class="nav-btn strong" id="exercise-save" onClick=${save}>Save</button>`} />
    <div class="scroll"><div class="page stack" style="padding-top:16px">
      <div class="field"><label for="ex-name">Name</label>
        <input ref=${ref} id="ex-name" class="input" value=${name} placeholder="e.g. Incline Row (Dumbbell)"
          onInput=${(e) => setName(e.target.value)} autocomplete="off" /></div>
      <div class="field"><label for="ex-cat">What you log</label>
        <select id="ex-cat" class="select" value=${category} onChange=${(e) => setCategory(e.target.value)}>
          ${CATEGORIES.map((c) => html`<option value=${c.id}>${c.label}</option>`)}
        </select></div>
      <div class="field"><label for="ex-part">Body part</label>
        <select id="ex-part" class="select" value=${bodyPart} onChange=${(e) => setBodyPart(e.target.value)}>
          ${BODY_PARTS.map((c) => html`<option value=${c.id}>${c.label}</option>`)}
        </select></div>
      <div class="field"><label for="ex-notes">Notes</label>
        <textarea id="ex-notes" class="textarea" value=${notes} placeholder="Setup, cues, seat height…"
          onInput=${(e) => setNotes(e.target.value)}></textarea></div>
      <p class="footnote">${CATEGORY_HELP[category]}</p>
    </div></div>`;
}

const CATEGORY_HELP = {
  barbell: 'Weight × reps. Gets the plate calculator and warm-up sets.',
  dumbbell: 'Weight × reps. Enter the weight of one dumbbell.',
  machine: 'Weight × reps for machines, cables, kettlebells and anything else with a load.',
  weighted_bw: 'Extra weight × reps (belt, vest). Leave the weight at 0 for plain bodyweight.',
  assisted_bw: 'Assistance weight × reps. Less assistance means progress.',
  reps: 'Reps only, e.g. push-ups or pull-ups.',
  cardio: 'Distance and time, with pace.',
  duration: 'Time only, e.g. planks.',
};
export { CATEGORY_LABEL };
