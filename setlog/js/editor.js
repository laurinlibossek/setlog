// The workout/template editor: exercise blocks, set rows, set types, supersets.
// Used for the running workout (mode "active"), editing a finished workout
// ("edit") and templates ("template"). Drafts are mutated in place and the
// owner re-renders through onChange().
import { tr } from './i18n.js';
import { html, useState, useRef, useEffect } from './lib.js';
import { Icon } from './icons.js';
import {
  S, previousSets, stats, startRest, addEntries, touchActive, exerciseView, patchExercise,
} from './store.js';
import {
  usesWeight, setIsValid, warmupSets, countsVolume, setVolume, isWorking, loggedFields, newRecords,
} from './calc.js';
import { newSetDraft, setToDraft, draftToSet } from './core/drafts.js';
import {
  setText, setLabels, SET_TYPE_NAME, wUnit, dUnit, volume as fmtVolume, w as fmtW,
} from './format.js';
import {
  uid, fmtDigits, fmtClock, parseNum, fmtNum, plural, numToInput,
} from './util.js';
import {
  actionSheet, promptDialog, toast, openScreenModal, openDialog, NavBar, useForce, push, closeSheet,
} from './ui.js';
import { pickExercises } from './pickers.js';
import { openTools } from './tools.js';

const SS_COLORS = ['var(--accent)', '#eb6834', '#1baf7a', '#d55181', '#8a6fe0'];
const REST_CHOICES = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

const fieldsFor = loggedFields;

/** Copy a placeholder value into a set, with the stored number behind it (no rounding drift). */
function fillFrom(set, f, ph) {
  set[f] = ph[f];
  if (ph.orig && ph.orig[f]) set.orig = { ...(set.orig || {}), [f]: ph.orig[f] };
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
      for (const f of fields) if (!String(filled[f] || '').trim() && rows[i].ph[f]) fillFrom(filled, f, rows[i].ph);
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
      <h3>${mode === 'template' ? tr('Build your template') : tr('No exercises yet')}</h3>
      <p>${mode === 'template' ? tr('Add the exercises and sets you want to repeat.') : tr('Add the exercises you’re about to do. Your numbers from last time show up next to every set.')}</p></div>`}
    <div class="stack" style="margin-top:16px">
      <button class="btn btn-tinted btn-block btn-lg" id="add-exercises" onClick=${addExercises}><${Icon} name="plus" />${tr('Add exercises')}</button>
      ${footer}
    </div>
  </div>`;
}

function ExerciseBlock({
  entry, index, draft, mode, onChange, before, excludeWorkoutId, ssColor, ssLetter,
}) {
  const ex = exerciseView(draft, entry.exerciseId);
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
    toast(tr('Set deleted'), { action: { label: tr('Undo'), fn: () => { entry.sets.splice(i, 0, set); onChange(); } } });
  };

  const toggleDone = (set, i) => {
    if (set.done) { set.done = false; onChange(); return; }
    const ph = rows[i].ph;
    for (const f of fields) if (!String(set[f] || '').trim() && ph[f]) fillFrom(set, f, ph);
    if (usesWeight(cat) && !String(set.w || '').trim() && (cat === 'weighted_bw' || cat === 'assisted_bw')) set.w = '0';
    const c = draftToSet(set, S.settings);
    if (!setIsValid(c, cat)) {
      setShakeId(set.id);
      setTimeout(() => setShakeId(null), 400);
      const msg = usesWeight(cat) ? (c.r > 0 ? 'Enter the weight first' : 'Enter reps first')
        : cat === 'reps' ? 'Enter reps first' : cat === 'cardio' ? 'Enter distance or time first' : 'Enter a time first';
      toast(tr(msg));
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
      title: tr('Set {label}', { label: labels[i] }),
      actions: [
        ...['normal', 'warmup', 'drop', 'failure'].map((t) => ({ label: SET_TYPE_NAME[t], value: t, checked: set.type === t })),
        usesWeight(cat) || cat === 'reps' ? { label: set.rpe ? `RPE (${set.rpe})` : tr('Add RPE'), value: 'rpe' } : null,
        { label: tr('Delete set'), value: 'delete', destructive: true },
      ],
    });
    if (!choice) return;
    if (choice === 'delete') { removeSet(set); return; }
    if (choice === 'rpe') {
      const v = await actionSheet({
        title: tr('Rate of perceived exertion'),
        message: tr('10 = nothing left, 8 = two reps left'),
        actions: [...[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((n) => ({ label: fmtNum(n, 1), value: String(n), checked: parseNum(set.rpe) === n })),
          set.rpe ? { label: tr('Clear RPE'), value: 'clear', destructive: true } : null],
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
    for (const f of fields) fillFrom(set, f, d);
    onChange();
  };

  const menu = async () => {
    const isBarbell = cat === 'barbell';
    const inSuperset = !!entry.supersetId;
    const others = draft.exercises.filter((e) => e !== entry);
    const choice = await actionSheet({
      title: ex.name,
      actions: [
        { label: entry.showNotes ? tr('Remove note') : tr('Add note'), value: 'note', icon: 'note' },
        { label: ex.pinnedNote ? tr('Edit pinned note') : tr('Pin a note to this exercise'), value: 'pin', icon: 'pin' },
        { label: tr('Replace exercise'), value: 'replace', icon: 'swap' },
        others.length ? { label: inSuperset ? tr('Change superset') : tr('Superset with…'), value: 'superset', icon: 'link' } : null,
        inSuperset ? { label: tr('Remove from superset'), value: 'unsuperset', icon: 'unlink' } : null,
        { label: tr('Rest timer: {time}', { time: rest ? fmtClock(rest) : tr('off') }), value: 'rest', icon: 'timer' },
        usesWeight(cat) && cat !== 'assisted_bw' ? { label: tr('Add warm-up sets'), value: 'warmup', icon: 'flame' } : null,
        isBarbell ? { label: tr('Plate calculator'), value: 'plates', icon: 'plate' } : null,
        draft.exercises.length > 1 ? { label: tr('Reorder exercises'), value: 'reorder', icon: 'reorder' } : null,
        { label: tr('History & records'), value: 'info', icon: 'history' },
        { label: tr('Remove exercise'), value: 'remove', destructive: true, icon: 'trash' },
      ],
    });
    if (!choice) return;
    if (choice === 'note') { entry.showNotes = !entry.showNotes; if (!entry.showNotes) entry.notes = ''; onChange(); }
    if (choice === 'pin') {
      const v = await promptDialog({ title: tr('Pinned note'), message: tr('Shown every time you do this exercise.'), value: ex.pinnedNote || '', placeholder: tr('Seat height 4, grip on the rings…'), multiline: true });
      if (v !== null) { patchExercise(draft, ex.id, { pinnedNote: v.trim() }); onChange(); }
    }
    if (choice === 'replace') {
      const id = await pickExercises({ multi: false, title: tr('Replace exercise') });
      if (!id) return;
      const nex = S.exercises.get(id);
      const sameKind = nex && fieldsFor(nex.category).join() === fields.join();
      entry.exerciseId = id;
      if (!sameKind) for (const s of entry.sets) { s.w = ''; s.r = ''; s.d = ''; s.t = ''; s.done = false; delete s.orig; }
      for (const s of entry.sets) delete s.tpl;
      // the rest timer and focus metric belonged to the old exercise
      entry.restSec = null;
      if (nex && !focusOptions(nex.category).includes(entry.focus)) entry.focus = null;
      onChange();
    }
    if (choice === 'superset') {
      const target = await actionSheet({
        title: tr('Superset with'),
        actions: others.map((o) => ({ label: S.exercises.get(o.exerciseId)?.name || tr('Exercise'), value: o.id })),
      });
      if (!target) return;
      const other = draft.exercises.find((e) => e.id === target);
      // only this exercise moves: it joins the other one's group (or they start a new one)
      const old = entry.supersetId;
      const id = other.supersetId || uid();
      other.supersetId = id; entry.supersetId = id;
      if (old && old !== id) {
        const left = draft.exercises.filter((e) => e.supersetId === old);
        if (left.length < 2) for (const e of left) e.supersetId = null;
      }
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
        title: `${tr('Rest timer')} · ${ex.name}`,
        message: tr('Starts when you check off a set. Saved for this exercise.'),
        actions: REST_CHOICES.map((sec) => ({ label: sec ? fmtClock(sec) : tr('Off'), value: String(sec), checked: rest === sec })),
      });
      if (v === undefined) return;
      entry.restSec = +v;
      patchExercise(draft, ex.id, { restSec: +v });
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
      toast(tr('{name} removed', { name: ex.name }), { action: { label: tr('Undo'), fn: () => { draft.exercises.splice(i, 0, entry); onChange(); } } });
    }
  };

  const addWarmups = () => {
    const firstWorkIdx = entry.sets.findIndex((s) => s.type !== 'warmup');
    const src = firstWorkIdx >= 0 ? (parseNum(entry.sets[firstWorkIdx].w) ?? parseNum(rows[firstWorkIdx].ph.w)) : null;
    if (!src) { toast(tr('Enter the weight of your first working set first')); return; }
    const st = S.settings;
    // worked out in the unit you lift in (bar and plates are stored in it), so lb
    // dumbbells land on 5 lb steps instead of converted 2 kg steps
    const ws = warmupSets(src, st.bar, st.plates, cat === 'barbell', st.warmup, st.unit === 'lb' ? 5 : 2);
    if (!ws.length) { toast(tr('That weight is too light for warm-up sets')); return; }
    const existing = entry.sets.filter((s) => s.type === 'warmup' && !s.done);
    entry.sets = entry.sets.filter((s) => !existing.includes(s));
    const newSets = ws.map((x) => newSetDraft('warmup', { w: numToInput(x.w), r: String(x.r) }));
    entry.sets.unshift(...newSets);
    onChange();
    toast(tr('{n} warm-up sets added', { n: ws.length }));
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
  const headers = usesWeight(cat) ? [wLabel, tr('Reps')] : cat === 'reps' ? [tr('Reps')] : cat === 'cardio' ? [dUnit().toUpperCase(), tr('Time')] : [tr('Time')];
  const gridCls = 'set-grid' + (one ? ' one' : '') + (showCheck ? '' : ' no-check');
  const doneCount = entry.sets.filter((s) => s.done).length;

  return html`<section class=${'ex-block' + (ssColor ? ' superset' : '')} style=${ssColor ? `--ss-color:${ssColor}` : ''} aria-label=${ex.name}>
    <div class="ex-head">
      <button class="ex-title" onClick=${menu}>${ex.name}</button>
      ${showCheck && entry.sets.length > 0 && html`<span class="muted small tnum" style="margin-right:2px">${doneCount}/${entry.sets.length}</span>`}
      ${focusOpts.length > 0 && html`<button class=${'focus-btn' + (focus ? ' on' : '')} onClick=${pickFocus}
        aria-label=${focus ? `${FOCUS_LABEL[focus]}: ${fmtFocus(focus, focusVals)}` : tr('Focus metric for {name}', { name: ex.name })}>
        <${Icon} name="trend" />${focus && html`<span class="tnum">${fmtFocus(focus, focusVals)}</span>`}</button>`}
      <button class="icon-btn accent" onClick=${menu} aria-label=${tr('Options for {name}', { name: ex.name })}><${Icon} name="more" /></button>
    </div>
    ${(ssLetter || (rest > 0 && showCheck)) && html`<div class="ex-tags">
      ${ssLetter && html`<span class="tag ss" style=${`color:${ssColor};background:color-mix(in srgb, ${ssColor} 14%, transparent)`}><${Icon} name="link" />${tr('Superset {letter}', { letter: ssLetter })}</span>`}
      ${showCheck && rest > 0 && html`<span class="tag"><${Icon} name="timer" />${fmtClock(rest)}</span>`}
    </div>`}
    ${ex.pinnedNote && html`<div class="pinned"><${Icon} name="pin" /><span>${ex.pinnedNote}</span></div>`}
    ${entry.showNotes && html`<div class="ex-note"><textarea class="textarea" rows="2" placeholder=${tr('Note for this exercise')}
      value=${entry.notes} onInput=${(e) => { entry.notes = e.target.value; onChange(); }}></textarea></div>`}
    <div class="set-table" role="table">
      <div class=${gridCls + ' set-hdr'} role="row">
        <div>${tr('Set')}</div><div>${tr('Previous')}</div>${headers.map((h) => html`<div key=${h}>${h}</div>`)}${showCheck && html`<div></div>`}
      </div>
      ${entry.sets.map((set, i) => html`<${SetRow} key=${set.id} set=${set} i=${i} label=${labels[i]} cat=${cat} fields=${fields}
        gridCls=${gridCls} showCheck=${showCheck} row=${rows[i]} shake=${shakeId === set.id} bests=${bests}
        onInput=${onChange} onToggle=${() => toggleDone(set, i)} onMenu=${() => setMenu(set, i)}
        onPrev=${() => copyPrev(set, i)} onDelete=${() => removeSet(set)} />`)}
    </div>
    <button class="btn btn-sm btn-block add-set" onClick=${addSet}><${Icon} name="plus" />${tr('Add set')}</button>
  </section>`;
}

// ---------- focus metric ----------
// One number per exercise the user wants to push (Strong's "focus metric").
// It's worked out from the sets as they stand (typed values, else the grey
// placeholders) and compared with the previous session.
const FOCUS_LABEL = {
  volume: tr('Total volume'), volumeChange: tr('Volume increase'), reps: tr('Total reps'), weightPerRep: tr('Weight/rep'), repsChange: tr('Reps increase'),
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
  if (key === 'reps') return plural(x, 'rep');
  if (key === 'weightPerRep') return `${fmtW(x, 1)} ${wUnit()}`;
  const pct = Math.round(x * 100);
  return `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)}%`;
}
function FocusDialog({ close, options, values, current }) {
  const [help, setHelp] = useState(false);
  return html`<div class="dialog focus-dialog" role="dialog" aria-label=${tr('Set a focus metric')}>
    <div class="focus-head"><h3>${tr('Set a focus metric')}</h3>
      <button class="icon-btn" aria-label=${tr('What is this?')} onClick=${() => setHelp(!help)}><span class="q">?</span></button></div>
    ${help && html`<p class="small">${tr('The number you want to push for this exercise. It shows next to the name and updates as you log; increases compare with last time. Tap it again to turn it off.')}</p>`}
    <div class="focus-list">${options.map((k) => html`<button class=${'focus-row' + (current === k ? ' on' : '')} key=${k}
      onClick=${() => close(current === k ? '' : k)}><span class="grow">${FOCUS_LABEL[k]}</span>
      <span class="tnum">${fmtFocus(k, values)}</span>${current === k && html`<${Icon} name="check" />`}</button>`)}</div>
  </div>`;
}

/** Would this checked set beat the stored records? Same rules as the summary's records. */
function isPR(set, cat, bests) {
  if (!bests || !set.done || set.type === 'warmup') return false;
  return newRecords(draftToSet(set, S.settings), cat, bests, S.settings.formula, Date.now()).length > 0;
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
      return html`<input class="set-input" inputmode="numeric" aria-label=${tr('Time')} placeholder=${fmtDigits(ph.t) || '0:00'}
        value=${fmtDigits(set.t)} onFocus=${selectAll}
        onInput=${(e) => { set.t = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6); e.target.value = fmtDigits(set.t); onInput(); }} />`;
    }
    const mode = f === 'r' ? 'numeric' : 'decimal';
    const aria = tr(f === 'w' ? 'Weight' : f === 'r' ? 'Reps' : 'Distance');
    return html`<input class="set-input" inputmode=${mode} aria-label=${aria} placeholder=${ph[f] || ''} value=${set[f]}
      onFocus=${selectAll} autocomplete="off"
      onInput=${(e) => { set[f] = e.target.value.replace(/[^\d.,]/g, '').slice(0, 7); if (e.target.value !== set[f]) e.target.value = set[f]; onInput(); }} />`;
  };
  const sub = pr ? html`<small style="color:var(--gold)">PR</small>` : set.rpe ? html`<small>@${set.rpe}</small>` : null;
  return html`<div class="set-row-wrap">
    ${dx < 0 && html`<div class="set-row-del">${tr('Delete')}</div>`}
    <div class=${gridCls + ' set-row' + (set.done ? ' done' : '') + (shake ? ' shake' : '')} role="row"
      style=${dx ? `transform:translateX(${dx}px)` : (t.current ? '' : 'transition:transform .2s, background .18s')}
      onTouchStart=${onTouchStart} onTouchMove=${onTouchMove} onTouchEnd=${onTouchEnd} onTouchCancel=${onTouchEnd}>
      <button class=${'set-label ' + set.type} onClick=${onMenu} aria-label=${tr('Set {label}, change type', { label })}>${label}${sub}</button>
      <button class="prev tnum" onClick=${onPrev} aria-label=${tr('Previous: {value}', { value: prevTxt })}>${prevTxt}</button>
      ${fields.map((f) => html`<div key=${f}>${inputFor(f)}</div>`)}
      ${showCheck && html`<button class=${'check' + (set.done ? ' on' : '') + (bump ? ' bump' : '')} aria-pressed=${set.done}
        aria-label=${set.done ? tr('Mark set as not done') : tr('Mark set as done')}
        onClick=${() => { if (!set.done) { setBump(true); setTimeout(() => setBump(false), 260); } onToggle(); }}><${Icon} name="check" /></button>`}
    </div>
  </div>`;
}

function selectAll(e) {
  const el = e.target;
  setTimeout(() => { try { el.setSelectionRange(0, el.value.length); } catch (err) { /* ignore */ } }, 0);
}

// ---------- reorder (drag and drop) ----------
// Rows follow the finger and the others slide out of the way. Drag by the ≡
// handle right away, or press and hold anywhere on a row. The handle also
// takes ↑/↓ from a keyboard.
function reorder(draft, onChange) {
  openScreenModal((close) => html`<${Reorder} draft=${draft} onChange=${onChange} close=${close} />`);
}

const HOLD_MS = 320;
const EDGE = 64; // px from the top/bottom of the list where dragging scrolls it

function Reorder({ draft, onChange, close }) {
  const force = useForce();
  const listRef = useRef();
  const scrollRef = useRef();
  const drag = useRef(null);
  const hold = useRef(null);
  const [settling, setSettling] = useState(false);
  const list = draft.exercises;

  const measure = () => [...listRef.current.children].map((el) => ({ top: el.offsetTop, h: el.offsetHeight }));
  const offset = (d) => d.y - d.startY + (scrollRef.current.scrollTop - d.startScroll);
  const target = (d) => {
    const r = d.rows[d.from];
    const center = r.top + r.h / 2 + offset(d);
    return d.rows.filter((x, j) => j !== d.from && x.top + x.h / 2 < center).length;
  };

  const begin = (id, y) => {
    const from = list.findIndex((e) => e.id === id);
    if (from < 0 || drag.current) return;
    drag.current = { id, from, over: from, startY: y, y, rows: measure(), startScroll: scrollRef.current.scrollTop };
    try { navigator.vibrate?.(8); } catch (e) { /* not supported */ }
    force();
    const tick = () => {
      const d = drag.current;
      if (!d) return;
      const box = scrollRef.current.getBoundingClientRect();
      const speed = d.y < box.top + EDGE ? -Math.ceil((box.top + EDGE - d.y) / 6)
        : d.y > box.bottom - EDGE ? Math.ceil((d.y - box.bottom + EDGE) / 6) : 0;
      if (speed) { scrollRef.current.scrollTop += speed; d.over = target(d); force(); }
      d.raf = requestAnimationFrame(tick);
    };
    drag.current.raf = requestAnimationFrame(tick);
  };
  const moveTo = (y) => {
    const d = drag.current;
    if (!d) return;
    d.y = y;
    d.over = target(d);
    force();
  };
  const end = () => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    drag.current = null;
    if (d.over !== d.from) {
      const [e] = list.splice(d.from, 1);
      list.splice(d.over, 0, e);
      onChange();
    }
    // drop without sliding back: transitions stay off for one frame
    setSettling(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)));
    force();
  };
  const step = (i, by) => {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    const [e] = list.splice(i, 1);
    list.splice(j, 0, e);
    onChange(); force();
    setTimeout(() => listRef.current?.children[j]?.querySelector('.drag-handle')?.focus(), 0);
  };

  // press and hold a row (touch); the list scrolls normally until the hold kicks in
  useEffect(() => {
    const el = listRef.current;
    const onStart = (e) => {
      if (e.touches.length !== 1 || e.target.closest('.drag-handle')) return;
      const row = e.target.closest('.reorder-row');
      if (!row) return;
      const t = e.touches[0];
      const h = { x0: t.clientX, y0: t.clientY, y: t.clientY };
      h.timer = setTimeout(() => { if (hold.current === h) { hold.current = null; begin(row.dataset.id, h.y); } }, HOLD_MS);
      hold.current = h;
    };
    const onMove = (e) => {
      const t = e.touches[0];
      if (drag.current) { e.preventDefault(); moveTo(t.clientY); return; }
      const h = hold.current;
      if (h) {
        h.y = t.clientY;
        if (Math.abs(t.clientX - h.x0) > 8 || Math.abs(t.clientY - h.y0) > 8) { clearTimeout(h.timer); hold.current = null; }
      }
    };
    const onEnd = () => {
      if (hold.current) { clearTimeout(hold.current.timer); hold.current = null; }
      end();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // the handle: drag right away with a finger, pen or mouse
  const onHandleDown = (e, id) => {
    if (e.button > 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    begin(id, e.clientY);
  };
  const onHandleMove = (e) => { if (drag.current) moveTo(e.clientY); };

  const d = drag.current;
  // where each row shows up while dragging (the corners follow the visual order)
  const pos = (i) => {
    if (!d) return i;
    if (i === d.from) return d.over;
    if (d.from < d.over && i > d.from && i <= d.over) return i - 1;
    if (d.over < d.from && i >= d.over && i < d.from) return i + 1;
    return i;
  };
  const style = (i) => {
    if (!d) return settling ? 'transition:none' : '';
    if (i === d.from) return `transform:translateY(${offset(d)}px) scale(1.02);transition:none`;
    const shift = (pos(i) - i) * d.rows[d.from].h;
    return shift ? `transform:translateY(${shift}px)` : '';
  };
  const rowClass = (i) => {
    let c = 'reorder-row';
    if (d && d.from === i) c += ' lifted';
    if (d && pos(i) === 0) c += ' v-first';
    if (d && pos(i) === list.length - 1) c += ' v-last';
    return c;
  };
  return html`<${NavBar} title=${tr('Reorder')} solid right=${html`<button class="nav-btn strong" id="reorder-done" onClick=${() => close()}>${tr('Done')}</button>`} />
    <div class="scroll" ref=${scrollRef}><div class="page" style="padding-top:12px">
      <div class=${'group reorder-list' + (d ? ' dragging' : '')} ref=${listRef}>${list.map((e, i) => html`<div
        class=${rowClass(i)} key=${e.id} data-id=${e.id} style=${style(i)}>
        <div class="grow"><div class="cell-title ellipsis">${S.exercises.get(e.exerciseId)?.name}</div>
          <div class="cell-sub">${plural(e.sets.length, 'set')}${e.supersetId ? ` · ${tr('superset')}` : ''}</div></div>
        <button class="icon-btn drag-handle" aria-label=${tr('Move {name}', { name: S.exercises.get(e.exerciseId)?.name || '' })}
          aria-describedby="reorder-hint"
          onPointerDown=${(ev) => onHandleDown(ev, e.id)} onPointerMove=${onHandleMove} onPointerUp=${end} onPointerCancel=${end}
          onKeyDown=${(ev) => { if (ev.key === 'ArrowUp') { ev.preventDefault(); step(i, -1); } if (ev.key === 'ArrowDown') { ev.preventDefault(); step(i, 1); } }}>
          <${Icon} name="grip" /></button>
      </div>`)}</div>
      <p class="footnote" id="reorder-hint">${tr('Drag ≡ to move an exercise, or press and hold it.')}</p>
    </div></div>`;
}

export { touchActive };
