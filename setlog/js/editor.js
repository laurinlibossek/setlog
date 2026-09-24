// The workout/template editor: exercise blocks, set rows, set types, supersets.
// Used for the running workout (mode "active"), editing a finished workout
// ("edit") and templates ("template"). Drafts are mutated in place and the
// owner re-renders through onChange().
import { html, useState, useRef } from './lib.js';
import { Icon } from './icons.js';
import {
  S, previousSets, stats, startRest, updateExercise, addEntries, touchActive,
} from './store.js';
import {
  usesWeight, setIsValid, est1RM, warmupSets, hasLoadRecords, countsVolume, setVolume, isWorking,
} from './calc.js';
import { newSetDraft, setToDraft, draftToSet, weightToInput } from './drafts.js';
import {
  setText, setLabels, SET_TYPE_NAME, wUnit, dUnit, volume as fmtVolume, w as fmtW,
} from './format.js';
import {
  uid, fmtDigits, fmtClock, parseNum, fmtNum,
} from './util.js';
import {
  actionSheet, promptDialog, toast, openScreenModal, openDialog, NavBar, useForce, push, closeSheet,
} from './ui.js';
import { pickExercises } from './pickers.js';
import { openTools } from './tools.js';

const SS_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#d55181', '#8a6fe0'];
const REST_CHOICES = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

function fieldsFor(cat) {
  if (usesWeight(cat)) return ['w', 'r'];
  if (cat === 'reps') return ['r'];
  if (cat === 'cardio') return ['d', 't'];
  return ['t'];
}

/** The template a draft belongs to (for "previous values from the same template"). */
const draftTemplateId = (draft) => (draft.kind === 'template' ? draft.id : draft.templateId || null);

export function restFor(entry, ex) {
  if (entry.restSec !== null && entry.restSec !== undefined) return entry.restSec;
  if (ex && ex.restSec !== null && ex.restSec !== undefined) return ex.restSec;
  return S.settings.defaultRest;
}

/** Placeholder strings + "previous" sets for each row of an entry. */
function computePrev(entry, prevSets) {
  const st = S.settings;
  const prevWarm = (prevSets || []).filter((s) => s.type === 'warmup');
  const prevWork = (prevSets || []).filter((s) => s.type !== 'warmup');
  let wi = 0, ki = 0;
  let lastPh = null;
  return entry.sets.map((s) => {
    const p = s.type === 'warmup' ? prevWarm[wi++] : prevWork[ki++];
    let ph;
    if (p) ph = setToDraft(p, st);
    else if (s.tpl) ph = setToDraft(s.tpl, st);
    else if (lastPh) ph = lastPh;
    else ph = { w: '', r: '', d: '', t: '' };
    // next rows fall back to what this row has (typed values beat placeholders)
    lastPh = {
      w: s.w || ph.w, r: s.r || ph.r, d: s.d || ph.d, t: s.t || ph.t,
    };
    return { prev: p || null, ph };
  });
}

/**
 * Unchecked sets the user started typing into. Missing fields are completed
 * from the grey placeholders, exactly like tapping the check button would.
 * Returns [{ set, filled }] for sets that would be valid.
 */
export function pendingSets(draft) {
  const out = [];
  for (const entry of draft.exercises) {
    const ex = S.exercises.get(entry.exerciseId);
    if (!ex) continue;
    const fields = fieldsFor(ex.category);
    const rows = computePrev(entry, previousSets(entry.exerciseId, { templateId: draftTemplateId(draft) }));
    entry.sets.forEach((set, i) => {
      if (set.done || !fields.some((f) => String(set[f] || '').trim())) return;
      const filled = { ...set };
      for (const f of fields) if (!String(filled[f] || '').trim() && rows[i].ph[f]) filled[f] = rows[i].ph[f];
      if (usesWeight(ex.category) && !String(filled.w || '').trim() && (ex.category === 'weighted_bw' || ex.category === 'assisted_bw')) filled.w = '0';
      if (setIsValid(draftToSet(filled, S.settings), ex.category)) out.push({ set, filled });
    });
  }
  return out;
}

export function WorkoutEditor({
  draft, mode, onChange, before = Infinity, excludeWorkoutId = null, header = null, footer = null,
}) {
  const addExercises = async () => {
    const ids = await pickExercises({ multi: true });
    if (!ids || !ids.length) return;
    addEntries(draft, ids);
    onChange();
  };
  const ssIndex = new Map();
  for (const e of draft.exercises) if (e.supersetId && !ssIndex.has(e.supersetId)) ssIndex.set(e.supersetId, ssIndex.size);

  return html`<div class="editor">
    ${header}
    ${draft.exercises.map((entry, i) => html`<${ExerciseBlock} key=${entry.id} entry=${entry} index=${i} draft=${draft} mode=${mode}
      onChange=${onChange} before=${before} excludeWorkoutId=${excludeWorkoutId}
      ssColor=${entry.supersetId ? SS_COLORS[ssIndex.get(entry.supersetId) % SS_COLORS.length] : null}
      ssLetter=${entry.supersetId ? String.fromCharCode(65 + ssIndex.get(entry.supersetId)) : null} />`)}
    ${!draft.exercises.length && html`<div class="empty" style="padding:28px 12px 8px">
      <h3>${mode === 'template' ? 'Build your template' : 'No exercises yet'}</h3>
      <p>${mode === 'template' ? 'Add the exercises and sets you want to repeat.' : 'Add the exercises you’re about to do. Your numbers from last time show up next to every set.'}</p></div>`}
    <div class="stack" style="margin-top:16px">
      <button class="btn btn-tinted btn-block btn-lg" id="add-exercises" onClick=${addExercises}><${Icon} name="plus" />Add exercises</button>
      ${footer}
    </div>
  </div>`;
}

function ExerciseBlock({
  entry, index, draft, mode, onChange, before, excludeWorkoutId, ssColor, ssLetter,
}) {
  const ex = S.exercises.get(entry.exerciseId);
  const [shakeId, setShakeId] = useState(null);
  if (!ex) return null;
  const cat = ex.category;
  const prevSets = previousSets(entry.exerciseId, { before, excludeWorkoutId, templateId: draftTemplateId(draft) });
  const rows = computePrev(entry, prevSets);
  const labels = setLabels(entry.sets);
  const showCheck = mode === 'active';
  const fields = fieldsFor(cat);
  const one = fields.length === 1;
  const bests = stats().bests.get(entry.exerciseId);
  const rest = restFor(entry, ex);

  const addSet = () => {
    const last = entry.sets[entry.sets.length - 1];
    entry.sets.push(newSetDraft(last && last.type === 'drop' ? 'drop' : 'normal'));
    onChange();
  };
  const removeSet = (set) => {
    const i = entry.sets.indexOf(set);
    if (i < 0) return;
    entry.sets.splice(i, 1);
    onChange();
    toast('Set deleted', { action: { label: 'Undo', fn: () => { entry.sets.splice(i, 0, set); onChange(); } } });
  };

  const toggleDone = (set, i) => {
    if (set.done) { set.done = false; onChange(); return; }
    const ph = rows[i].ph;
    for (const f of fields) if (!String(set[f] || '').trim() && ph[f]) set[f] = ph[f];
    if (usesWeight(cat) && !String(set.w || '').trim() && (cat === 'weighted_bw' || cat === 'assisted_bw')) set.w = '0';
    const c = draftToSet(set, S.settings);
    if (!setIsValid(c, cat)) {
      setShakeId(set.id);
      setTimeout(() => setShakeId(null), 400);
      const msg = usesWeight(cat) ? (c.r > 0 ? 'Enter the weight first' : 'Enter reps first')
        : cat === 'reps' ? 'Enter reps first' : cat === 'cardio' ? 'Enter distance or time first' : 'Enter a time first';
      toast(msg);
      onChange();
      return;
    }
    set.done = true;
    onChange();
    // rest timer: inside a superset only after the last exercise of the round
    if (entry.supersetId) {
      const group = draft.exercises.filter((e) => e.supersetId === entry.supersetId);
      if (group[group.length - 1] !== entry) return;
    }
    if (rest > 0) startRest(set.type === 'warmup' ? Math.min(rest, 60) : rest, ex.name);
  };

  const setMenu = async (set, i) => {
    const choice = await actionSheet({
      title: `Set ${labels[i]}`,
      actions: [
        ...['normal', 'warmup', 'drop', 'failure'].map((t) => ({ label: SET_TYPE_NAME[t], value: t, checked: set.type === t })),
        usesWeight(cat) || cat === 'reps' ? { label: set.rpe ? `RPE (${set.rpe})` : 'Add RPE', value: 'rpe' } : null,
        { label: 'Delete set', value: 'delete', destructive: true },
      ],
    });
    if (!choice) return;
    if (choice === 'delete') { removeSet(set); return; }
    if (choice === 'rpe') {
      const v = await actionSheet({
        title: 'Rate of perceived exertion',
        message: '10 = nothing left, 8 = two reps left',
        actions: [...[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((n) => ({ label: fmtNum(n, 1), value: String(n), checked: parseNum(set.rpe) === n })),
          set.rpe ? { label: 'Clear RPE', value: 'clear', destructive: true } : null],
      });
      if (!v) return;
      set.rpe = v === 'clear' ? '' : v;
      onChange();
      return;
    }
    set.type = choice;
    onChange();
  };

  const copyPrev = (set, i) => {
    const p = rows[i].prev;
    if (!p || set.done) return;
    const d = setToDraft(p, S.settings);
    for (const f of fields) set[f] = d[f];
    onChange();
  };

  const menu = async () => {
    const isBarbell = cat === 'barbell';
    const inSuperset = !!entry.supersetId;
    const others = draft.exercises.filter((e) => e !== entry);
    const choice = await actionSheet({
      title: ex.name,
      actions: [
        { label: entry.showNotes ? 'Remove note' : 'Add note', value: 'note', icon: 'note' },
        { label: ex.pinnedNote ? 'Edit pinned note' : 'Pin a note to this exercise', value: 'pin', icon: 'pin' },
        { label: 'Replace exercise', value: 'replace', icon: 'swap' },
        others.length ? { label: inSuperset ? 'Change superset' : 'Superset with…', value: 'superset', icon: 'link' } : null,
        inSuperset ? { label: 'Remove from superset', value: 'unsuperset', icon: 'unlink' } : null,
        { label: `Rest timer: ${rest ? fmtClock(rest) : 'off'}`, value: 'rest', icon: 'timer' },
        usesWeight(cat) && cat !== 'assisted_bw' ? { label: 'Add warm-up sets', value: 'warmup', icon: 'flame' } : null,
        isBarbell ? { label: 'Plate calculator', value: 'plates', icon: 'plate' } : null,
        draft.exercises.length > 1 ? { label: 'Reorder exercises', value: 'reorder', icon: 'reorder' } : null,
        { label: 'History & records', value: 'info', icon: 'history' },
        { label: 'Remove exercise', value: 'remove', destructive: true, icon: 'trash' },
      ],
    });
    if (!choice) return;
    if (choice === 'note') { entry.showNotes = !entry.showNotes; if (!entry.showNotes) entry.notes = ''; onChange(); }
    if (choice === 'pin') {
      const v = await promptDialog({ title: 'Pinned note', message: 'Shown every time you do this exercise.', value: ex.pinnedNote || '', placeholder: 'Seat height 4, grip on the rings…', multiline: true });
      if (v !== null) { updateExercise(ex.id, { pinnedNote: v.trim() }); onChange(); }
    }
    if (choice === 'replace') {
      const id = await pickExercises({ multi: false, title: 'Replace exercise' });
      if (!id) return;
      const nex = S.exercises.get(id);
      const sameKind = nex && fieldsFor(nex.category).join() === fields.join();
      entry.exerciseId = id;
      if (!sameKind) for (const s of entry.sets) { s.w = ''; s.r = ''; s.d = ''; s.t = ''; s.done = false; }
      for (const s of entry.sets) delete s.tpl;
      onChange();
    }
    if (choice === 'superset') {
      const target = await actionSheet({
        title: 'Superset with',
        actions: others.map((o) => ({ label: S.exercises.get(o.exerciseId)?.name || 'Exercise', value: o.id })),
      });
      if (!target) return;
      const other = draft.exercises.find((e) => e.id === target);
      const id = other.supersetId || entry.supersetId || uid();
      if (entry.supersetId && entry.supersetId !== id) {
        const old = entry.supersetId;
        for (const e of draft.exercises) if (e.supersetId === old) e.supersetId = id;
      }
      other.supersetId = id; entry.supersetId = id;
      // keep the group together: move this entry right after the other one
      const list = draft.exercises;
      list.splice(list.indexOf(entry), 1);
      const lastOfGroup = list.map((e, i2) => (e.supersetId === id ? i2 : -1)).filter((i2) => i2 >= 0).pop();
      list.splice(lastOfGroup + 1, 0, entry);
      onChange();
    }
    if (choice === 'unsuperset') {
      const id = entry.supersetId;
      entry.supersetId = null;
      const rest2 = draft.exercises.filter((e) => e.supersetId === id);
      if (rest2.length < 2) for (const e of rest2) e.supersetId = null;
      onChange();
    }
    if (choice === 'rest') {
      const v = await actionSheet({
        title: `Rest timer · ${ex.name}`,
        message: 'Starts when you check off a set. Saved for this exercise.',
        actions: REST_CHOICES.map((sec) => ({ label: sec ? fmtClock(sec) : 'Off', value: String(sec), checked: rest === sec })),
      });
      if (v === undefined) return;
      entry.restSec = +v;
      updateExercise(ex.id, { restSec: +v });
      onChange();
    }
    if (choice === 'warmup') addWarmups();
    if (choice === 'plates') {
      const firstWork = entry.sets.find((s) => s.type !== 'warmup');
      const i = entry.sets.indexOf(firstWork);
      const v = firstWork ? parseNum(firstWork.w) ?? parseNum(rows[i]?.ph.w) : null;
      openTools({ tab: 'plates', weight: v !== null && v !== undefined ? (wUnit() === 'lb' ? v * 0.45359237 : v) : undefined });
    }
    if (choice === 'reorder') reorder(draft, onChange);
    if (choice === 'info') {
      if (mode === 'active') closeSheet();
      push('exercise', { id: ex.id });
    }
    if (choice === 'remove') {
      const i = draft.exercises.indexOf(entry);
      draft.exercises.splice(i, 1);
      onChange();
      toast(`${ex.name} removed`, { action: { label: 'Undo', fn: () => { draft.exercises.splice(i, 0, entry); onChange(); } } });
    }
  };

  const addWarmups = () => {
    const firstWorkIdx = entry.sets.findIndex((s) => s.type !== 'warmup');
    const src = firstWorkIdx >= 0 ? (parseNum(entry.sets[firstWorkIdx].w) ?? parseNum(rows[firstWorkIdx].ph.w)) : null;
    if (!src) { toast('Enter the weight of your first working set first'); return; }
    const st = S.settings;
    const kg = st.unit === 'lb' ? src * 0.45359237 : src;
    const ws = warmupSets(kg, st.bar * (st.unit === 'lb' ? 0.45359237 : 1),
      st.plates.map((p) => (st.unit === 'lb' ? p * 0.45359237 : p)), cat === 'barbell', st.warmup);
    if (!ws.length) { toast('That weight is too light for warm-up sets'); return; }
    const existing = entry.sets.filter((s) => s.type === 'warmup' && !s.done);
    entry.sets = entry.sets.filter((s) => !existing.includes(s));
    const newSets = ws.map((x) => newSetDraft('warmup', { w: weightToInput(x.w, st), r: String(x.r) }));
    entry.sets.unshift(...newSets);
    onChange();
    toast(`${ws.length} warm-up sets added`);
  };

  const focusOpts = focusOptions(cat);
  const focus = focusOpts.includes(entry.focus) ? entry.focus : null;
  const focusVals = focusOpts.length ? focusValues(entry, rows, cat, prevSets) : null;
  const pickFocus = async () => {
    const v = await openDialog((close) => html`<${FocusDialog} close=${close} options=${focusOpts} values=${focusVals} current=${focus} />`);
    if (v === undefined) return;
    entry.focus = v || null;
    onChange();
  };

  const wLabel = (cat === 'assisted_bw' ? '−' : cat === 'weighted_bw' ? '+' : '') + wUnit().toUpperCase();
  const headers = usesWeight(cat) ? [wLabel, 'Reps'] : cat === 'reps' ? ['Reps'] : cat === 'cardio' ? [dUnit().toUpperCase(), 'Time'] : ['Time'];
  const gridCls = 'set-grid' + (one ? ' one' : '') + (showCheck ? '' : ' no-check');
  const doneCount = entry.sets.filter((s) => s.done).length;

  return html`<section class=${'ex-block' + (ssColor ? ' superset' : '')} style=${ssColor ? `--ss-color:${ssColor}` : ''} aria-label=${ex.name}>
    <div class="ex-head">
      <button class="ex-title" onClick=${menu}>${ex.name}</button>
      ${showCheck && entry.sets.length > 0 && html`<span class="muted small tnum" style="margin-right:2px">${doneCount}/${entry.sets.length}</span>`}
      ${focusOpts.length > 0 && html`<button class=${'focus-btn' + (focus ? ' on' : '')} onClick=${pickFocus}
        aria-label=${focus ? `${FOCUS_LABEL[focus]}: ${fmtFocus(focus, focusVals)}` : `Focus metric for ${ex.name}`}>
        <${Icon} name="trend" />${focus && html`<span class="tnum">${fmtFocus(focus, focusVals)}</span>`}</button>`}
      <button class="icon-btn accent" onClick=${menu} aria-label=${`Options for ${ex.name}`}><${Icon} name="more" /></button>
    </div>
    ${(ssLetter || (rest && showCheck)) && html`<div class="ex-tags">
      ${ssLetter && html`<span class="tag ss" style=${`color:${ssColor};background:color-mix(in srgb, ${ssColor} 14%, transparent)`}><${Icon} name="link" />Superset ${ssLetter}</span>`}
      ${showCheck && rest > 0 && html`<span class="tag"><${Icon} name="timer" />${fmtClock(rest)}</span>`}
    </div>`}
    ${ex.pinnedNote && html`<div class="pinned"><${Icon} name="pin" /><span>${ex.pinnedNote}</span></div>`}
    ${entry.showNotes && html`<div class="ex-note"><textarea class="textarea" rows="2" placeholder="Note for this exercise"
      value=${entry.notes} onInput=${(e) => { entry.notes = e.target.value; onChange(); }}></textarea></div>`}
    <div class="set-table" role="table">
      <div class=${gridCls + ' set-hdr'} role="row">
        <div>Set</div><div>Previous</div>${headers.map((h) => html`<div key=${h}>${h}</div>`)}${showCheck && html`<div></div>`}
      </div>
      ${entry.sets.map((set, i) => html`<${SetRow} key=${set.id} set=${set} i=${i} label=${labels[i]} cat=${cat} fields=${fields}
        gridCls=${gridCls} showCheck=${showCheck} row=${rows[i]} shake=${shakeId === set.id} bests=${bests}
        onInput=${onChange} onToggle=${() => toggleDone(set, i)} onMenu=${() => setMenu(set, i)}
        onPrev=${() => copyPrev(set, i)} onDelete=${() => removeSet(set)} />`)}
    </div>
    <button class="btn btn-sm btn-block add-set" onClick=${addSet}><${Icon} name="plus" />Add set</button>
  </section>`;
}

// ---------- focus metric ----------
// One number per exercise the user wants to push (Strong's "focus metric").
// It's worked out from the sets as they stand (typed values, else the grey
// placeholders) and compared with the previous session.
const FOCUS_LABEL = {
  volume: 'Total volume', volumeChange: 'Volume increase', reps: 'Total reps', weightPerRep: 'Weight/rep', repsChange: 'Reps increase',
};
function focusOptions(cat) {
  if (usesWeight(cat) && countsVolume(cat)) return ['volume', 'volumeChange', 'reps', 'weightPerRep'];
  if (cat === 'reps' || cat === 'assisted_bw') return ['reps', 'repsChange'];
  return [];
}
function focusValues(entry, rows, cat, prevSets) {
  const st = S.settings;
  const now = Date.now();
  const cur = entry.sets.map((s, i) => draftToSet({ ...s, w: s.w || rows[i].ph.w, r: s.r || rows[i].ph.r }, st))
    .filter((s) => isWorking(s) && s.r > 0);
  const prev = (prevSets || []).filter((s) => isWorking(s) && s.r > 0);
  const sum = (list, f) => list.reduce((a, s) => a + f(s), 0);
  const vol = sum(cur, (s) => setVolume(s, cat, now));
  const pvol = sum(prev, (s) => setVolume(s, cat, now));
  const reps = sum(cur, (s) => s.r);
  const preps = sum(prev, (s) => s.r);
  return {
    volume: vol,
    volumeChange: pvol > 0 && vol > 0 ? (vol - pvol) / pvol : null,
    reps,
    weightPerRep: reps > 0 && vol > 0 ? vol / reps : null,
    repsChange: preps > 0 && reps > 0 ? (reps - preps) / preps : null,
  };
}
function fmtFocus(key, v) {
  const x = v[key];
  if (x === null || x === undefined) return '—';
  if (key === 'volume') return fmtVolume(x);
  if (key === 'reps') return `${fmtNum(x, 0)} rep${x === 1 ? '' : 's'}`;
  if (key === 'weightPerRep') return `${fmtW(x, 1)} ${wUnit()}`;
  const pct = Math.round(x * 100);
  return `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)}%`;
}
function FocusDialog({ close, options, values, current }) {
  const [help, setHelp] = useState(false);
  return html`<div class="dialog focus-dialog" role="dialog" aria-label="Set a focus metric">
    <div class="focus-head"><h3>Set a focus metric</h3>
      <button class="icon-btn" aria-label="What is this?" onClick=${() => setHelp(!help)}><span class="q">?</span></button></div>
    ${help && html`<p class="small">The number you want to push for this exercise. It shows next to the name and updates as you log; increases compare with last time. Tap it again to turn it off.</p>`}
    <div class="focus-list">${options.map((k) => html`<button class=${'focus-row' + (current === k ? ' on' : '')} key=${k}
      onClick=${() => close(current === k ? '' : k)}><span class="grow">${FOCUS_LABEL[k]}</span>
      <span class="tnum">${fmtFocus(k, values)}</span>${current === k && html`<${Icon} name="check" />`}</button>`)}</div>
  </div>`;
}

/** Would this checked set beat the stored records? (live PR hint while training) */
function isPR(set, cat, bests) {
  if (!bests || !set.done || set.type === 'warmup') return false;
  const c = draftToSet(set, S.settings);
  const beats = (k, v) => bests[k] !== undefined && v > bests[k] + 1e-9;
  if (hasLoadRecords(cat)) {
    if (!(c.w > 0 && c.r > 0)) return false;
    return beats('e1rm', est1RM(c.w, c.r, S.settings.formula)) || beats('weight', c.w);
  }
  if (cat === 'reps') return beats('reps', c.r || 0);
  if (cat === 'cardio') return beats('distance', c.d || 0);
  if (cat === 'duration') return beats('time', c.t || 0);
  return false;
}

function SetRow({
  set, i, label, cat, fields, gridCls, showCheck, row, shake, bests, onInput, onToggle, onMenu, onPrev, onDelete,
}) {
  const [dx, setDx] = useState(0);
  const [bump, setBump] = useState(false);
  const t = useRef(null);
  const onTouchStart = (e) => { const p = e.touches[0]; t.current = { x: p.clientX, y: p.clientY, lock: null }; };
  const onTouchMove = (e) => {
    const s = t.current; if (!s) return;
    const p = e.touches[0];
    const ddx = p.clientX - s.x, ddy = p.clientY - s.y;
    if (s.lock === null && (Math.abs(ddx) > 10 || Math.abs(ddy) > 10)) s.lock = Math.abs(ddx) > Math.abs(ddy) * 1.2 ? 'h' : 'v';
    if (s.lock === 'h') setDx(Math.min(0, ddx));
  };
  const onTouchEnd = () => {
    const s = t.current; t.current = null;
    if (s && s.lock === 'h' && dx < -90) { setDx(-window.innerWidth); setTimeout(onDelete, 160); return; }
    setDx(0);
  };
  const pr = isPR(set, cat, bests);
  const prevTxt = row.prev ? setText(row.prev, cat, { short: true }) : '—';
  const ph = row.ph;
  const inputFor = (f) => {
    if (f === 't') {
      return html`<input class="set-input" inputmode="numeric" aria-label="Time" placeholder=${fmtDigits(ph.t) || '0:00'}
        value=${fmtDigits(set.t)} onFocus=${selectAll}
        onInput=${(e) => { set.t = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6); e.target.value = fmtDigits(set.t); onInput(); }} />`;
    }
    const mode = f === 'r' ? 'numeric' : 'decimal';
    const aria = f === 'w' ? 'Weight' : f === 'r' ? 'Reps' : 'Distance';
    return html`<input class="set-input" inputmode=${mode} aria-label=${aria} placeholder=${ph[f] || ''} value=${set[f]}
      onFocus=${selectAll} autocomplete="off"
      onInput=${(e) => { set[f] = e.target.value.replace(/[^\d.,]/g, '').slice(0, 7); if (e.target.value !== set[f]) e.target.value = set[f]; onInput(); }} />`;
  };
  const sub = pr ? html`<small style="color:var(--gold)">PR</small>` : set.rpe ? html`<small>@${set.rpe}</small>` : null;
  return html`<div class="set-row-wrap">
    ${dx < 0 && html`<div class="set-row-del">Delete</div>`}
    <div class=${gridCls + ' set-row' + (set.done ? ' done' : '') + (shake ? ' shake' : '')} role="row"
      style=${dx ? `transform:translateX(${dx}px)` : (t.current ? '' : 'transition:transform .2s, background .18s')}
      onTouchStart=${onTouchStart} onTouchMove=${onTouchMove} onTouchEnd=${onTouchEnd} onTouchCancel=${onTouchEnd}>
      <button class=${'set-label ' + set.type} onClick=${onMenu} aria-label=${`Set ${label}, change type`}>${label}${sub}</button>
      <button class="prev tnum" onClick=${onPrev} aria-label=${`Previous: ${prevTxt}`}>${prevTxt}</button>
      ${fields.map((f) => html`<div key=${f}>${inputFor(f)}</div>`)}
      ${showCheck && html`<button class=${'check' + (set.done ? ' on' : '') + (bump ? ' bump' : '')} aria-pressed=${set.done}
        aria-label=${set.done ? 'Mark set as not done' : 'Mark set as done'}
        onClick=${() => { if (!set.done) { setBump(true); setTimeout(() => setBump(false), 260); } onToggle(); }}><${Icon} name="check" /></button>`}
    </div>
  </div>`;
}

function selectAll(e) {
  const el = e.target;
  setTimeout(() => { try { el.setSelectionRange(0, el.value.length); } catch (err) { /* ignore */ } }, 0);
}

// ---------- reorder ----------
function reorder(draft, onChange) {
  openScreenModal((close) => html`<${Reorder} draft=${draft} onChange=${onChange} close=${close} />`);
}
function Reorder({ draft, onChange, close }) {
  const force = useForce();
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= draft.exercises.length) return;
    const list = draft.exercises;
    [list[i], list[j]] = [list[j], list[i]];
    onChange(); force();
  };
  return html`<${NavBar} title="Reorder" solid right=${html`<button class="nav-btn strong" onClick=${() => close()}>Done</button>`} />
    <div class="scroll"><div class="page" style="padding-top:12px">
      <div class="group">${draft.exercises.map((e, i) => html`<div class="reorder-row" key=${e.id}>
        <div class="grow"><div class="cell-title ellipsis">${S.exercises.get(e.exerciseId)?.name}</div>
          <div class="cell-sub">${e.sets.length} set${e.sets.length === 1 ? '' : 's'}${e.supersetId ? ' · superset' : ''}</div></div>
        <button class="icon-btn" disabled=${i === 0} onClick=${() => move(i, -1)} aria-label="Move up"><${Icon} name="arrowUp" /></button>
        <button class="icon-btn" disabled=${i === draft.exercises.length - 1} onClick=${() => move(i, 1)} aria-label="Move down"><${Icon} name="arrowDown" /></button>
      </div>`)}</div>
    </div></div>`;
}

export { touchActive };
