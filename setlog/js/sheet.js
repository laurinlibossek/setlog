// The running workout: full-screen sheet, mini bar, rest timer, finish flow.
import { html, useRef } from './lib.js';
import { Icon } from './icons.js';
import {
  S, useStore, touchActive, startWorkout, discardActive, finishActive, startRest, adjustRest, skipRest,
  getTemplate, templateDiffers, updateTemplateFromWorkout, stats, exName,
} from './store.js';
import { WorkoutEditor, pendingSets } from './editor.js';
import {
  nav, openSheet, closeSheet, actionSheet, confirmDialog, openDialog, openScreenModal, useNow, toast, NavBar,
  promptDialog, setTab, push,
} from './ui.js';
import { PR_LABEL, bestSet } from './calc.js';
import {
  fmtClock, fmtDur, fmt, toLocalInput, fromLocalInput, plural,
} from './util.js';
import { volume, setText, metricValue } from './format.js';

// ---------- start ----------
export async function beginWorkout(opts = {}) {
  if (S.active) {
    const c = await actionSheet({
      title: 'A workout is already running',
      message: `“${S.active.name}” started ${fmt.time(S.active.startedAt)}.`,
      actions: [
        { label: 'Resume that workout', value: 'resume' },
        { label: 'Discard it and start new', value: 'new', destructive: true },
      ],
    });
    if (c === 'resume') { openSheet(); return; }
    if (c !== 'new') return;
    discardActive();
  }
  startWorkout(opts);
  openSheet();
}

// ---------- rest timer ----------
function RestPill() {
  useStore('active');
  const r = S.active?.rest;
  const now = useNow(250, !!r);
  if (!r) {
    return html`<button class="rest-pill idle" onClick=${openRestModal} aria-label="Rest timer"><${Icon} name="timer" /></button>`;
  }
  const left = Math.max(0, (r.end - now) / 1000);
  const pct = Math.max(0, Math.min(100, (left / r.total) * 100));
  return html`<button class="rest-pill" onClick=${openRestModal} aria-label=${`Rest timer, ${Math.ceil(left)} seconds left`}>
    <div class="fill" style=${`width:${pct}%`}></div><${Icon} name="timer" /><span>${fmtClock(Math.ceil(left))}</span></button>`;
}

export function openRestModal() {
  openDialog((close) => html`<${RestModal} close=${close} />`);
}
function RestModal({ close }) {
  useStore('active');
  const r = S.active?.rest;
  const now = useNow(200, !!r);
  const wasRunning = useRef(false);
  // close by itself when the running timer ends or is skipped
  if (!S.active || (wasRunning.current && !r)) { setTimeout(close, 0); return null; }
  if (r) wasRunning.current = true;
  const R = 96, C = 2 * Math.PI * R;
  if (!r) {
    const presets = [30, 60, 90, 120, 150, 180, 240, 300, 0];
    return html`<div class="dialog">
      <h3>Rest timer</h3>
      <p>Starts on its own when you check off a set. Start one by hand:</p>
      <div class="preset-grid">${presets.filter(Boolean).map((s) => html`<button class="btn" key=${s} onClick=${() => startRest(s, 'Rest')}>${fmtClock(s)}</button>`)}</div>
      <button class="btn btn-ghost" onClick=${() => close()}>Close</button>
    </div>`;
  }
  const left = Math.max(0, (r.end - now) / 1000);
  const frac = Math.max(0, Math.min(1, left / r.total));
  return html`<div class="dialog">
    <div class="timer-face">
      <svg viewBox="0 0 220 220"><circle cx="110" cy="110" r=${R} fill="none" stroke="var(--surface-3)" stroke-width="10" />
        <circle cx="110" cy="110" r=${R} fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round"
          stroke-dasharray=${C} stroke-dashoffset=${C * (1 - frac)} style="transition:stroke-dashoffset .2s linear" /></svg>
      <div><div class="t">${fmtClock(Math.ceil(left))}</div><div class="of">of ${fmtClock(r.total)}${r.label ? html`<br />${r.label}` : ''}</div></div>
    </div>
    <div class="btns two">
      <button class="btn" onClick=${() => adjustRest(-15)}>−15 s</button>
      <button class="btn" onClick=${() => adjustRest(15)}>+15 s</button>
    </div>
    <button class="btn btn-primary btn-block" onClick=${() => { skipRest(); close(); }}>Skip rest</button>
    <p class="small muted">Keep the app open to hear the end signal — a locked phone pauses web apps.</p>
  </div>`;
}

// ---------- sheet ----------
export function WorkoutSheet() {
  useStore('active', 'nav', 'settings', 'exercises', 'workouts');
  const a = S.active;
  const now = useNow(1000, !!a && nav.sheetOpen);
  const scrollRef = useRef();
  if (!a || !nav.sheetOpen) return null;
  const elapsed = (now - a.startedAt) / 1000;

  const workoutMenu = async () => {
    const c = await actionSheet({
      title: a.name,
      actions: [
        { label: a.showNotes ? 'Remove workout note' : 'Add workout note', value: 'note', icon: 'note' },
        { label: 'Change start time', value: 'time', icon: 'clock' },
        { label: 'Discard workout', value: 'discard', destructive: true, icon: 'trash' },
      ],
    });
    if (c === 'note') { a.showNotes = !a.showNotes; if (!a.showNotes) a.notes = ''; touchActive(); }
    if (c === 'time') {
      const v = await promptDialog({
        title: 'Start time', type: 'datetime-local', value: toLocalInput(a.startedAt), ok: 'Set',
      });
      const t = fromLocalInput(v);
      if (t && t <= Date.now()) { a.startedAt = t; touchActive(); } else if (v) toast('The start time has to be in the past');
    }
    if (c === 'discard') discard();
  };
  const discard = async () => {
    const hasSets = a.exercises.some((e) => e.sets.some((s) => s.done));
    const ok = await confirmDialog({
      title: 'Discard this workout?',
      message: hasSets ? 'Everything you logged in it will be deleted.' : 'Nothing has been logged yet.',
      ok: 'Discard', cancel: 'Keep going', destructive: true,
    });
    if (ok) { discardActive(); closeSheet(); toast('Workout discarded'); }
  };

  const header = html`<div class="wo-head">
    <div class="row">
      <input class="wo-name grow" id="workout-name" value=${a.name} aria-label="Workout name" enterkeyhint="done"
        onInput=${(e) => { a.name = e.target.value; touchActive(); }} />
      <button class="icon-btn accent" onClick=${workoutMenu} aria-label="Workout options"><${Icon} name="more" /></button>
    </div>
    <div class="wo-meta">
      <span><${Icon} name="calendar" />${fmt.medium(a.startedAt)}</span>
      <span class="tnum"><${Icon} name="clock" />Started ${fmt.time(a.startedAt)}</span>
    </div>
    ${(a.showNotes || a.notes) && html`<textarea class="textarea wo-notes" placeholder="How did it go?" value=${a.notes}
      onInput=${(e) => { a.notes = e.target.value; touchActive(); }}></textarea>`}
  </div>`;
  const footer = html`<button class="btn btn-danger btn-block" onClick=${discard}>Discard workout</button>`;

  return html`<div class="sheet" role="dialog" aria-label="Current workout">
    <header class="nav solid"><div class="nav-inner">
      <div class="nav-side" style="gap:6px">
        <button class="nav-btn" onClick=${closeSheet} aria-label="Minimize workout"><${Icon} name="chevronDown" /></button>
        <${RestPill} />
      </div>
      <div class="nav-title tnum">${fmtClock(elapsed)}</div>
      <div class="nav-side right"><button class="btn btn-done btn-sm" id="finish-workout" onClick=${finishFlow}>Finish</button></div>
    </div></header>
    <div class="scroll" ref=${scrollRef}><div class="page">
      <${WorkoutEditor} draft=${a} mode="active" onChange=${touchActive} header=${header} footer=${footer} />
      <div style="height:40px"></div>
    </div></div>
  </div>`;
}

// ---------- mini bar ----------
export function MiniBar() {
  useStore('active', 'nav');
  const a = S.active;
  const now = useNow(1000, !!a && !nav.sheetOpen);
  if (!a || nav.sheetOpen) return null;
  const r = a.rest;
  return html`<button class="mini-bar" onClick=${openSheet} aria-label="Open current workout">
    <span class="dot"></span>
    <div class="grow"><div class="title ellipsis">${a.name}</div><div class="time tnum">${fmtClock((now - a.startedAt) / 1000)}</div></div>
    ${r && html`<span class="rest tnum"><${Icon} name="timer" size=${14} /> ${fmtClock(Math.max(0, Math.ceil((r.end - now) / 1000)))}</span>`}
    <${Icon} name="chevronRight" size=${18} />
  </button>`;
}

// ---------- finish ----------
export async function finishFlow() {
  const a = S.active;
  if (!a) return;
  let done = 0;
  for (const e of a.exercises) for (const s of e.sets) if (s.done) done++;
  const pending = pendingSets(a);
  const unfinished = pending.length;
  let mode = 'done';
  if (done === 0 && unfinished === 0) {
    const ok = await confirmDialog({
      title: 'Nothing logged yet',
      message: 'Check off at least one set to save this workout. Discard it instead?',
      ok: 'Discard workout', cancel: 'Keep going', destructive: true,
    });
    if (ok) { discardActive(); closeSheet(); }
    return;
  }
  if (unfinished > 0) {
    const c = await actionSheet({
      title: `${plural(unfinished, 'set')} with numbers ${unfinished === 1 ? 'isn’t' : 'aren’t'} checked off`,
      actions: [
        { label: 'Save them as done', value: 'all' },
        { label: 'Leave them out', value: 'done', destructive: true },
      ],
    });
    if (!c) return;
    mode = c;
    if (mode === 'done' && done === 0) { toast('Nothing checked off to save'); return; }
    if (mode === 'all') {
      for (const { set, filled } of pending) Object.assign(set, filled, { done: true });
      mode = 'done';
    }
  } else {
    const ok = await confirmDialog({ title: 'Finish workout?', message: `${plural(done, 'set')} logged in ${fmtDur(Date.now() - a.startedAt)}.`, ok: 'Finish' });
    if (!ok) return;
  }
  const result = finishActive(mode);
  closeSheet();
  if (!result) return;
  await showSummary(result);
  // offer to update the template it was started from
  const t = result.workout.templateId && getTemplate(result.workout.templateId);
  if (t && templateDiffers(t, result.workout)) {
    const ok = await confirmDialog({
      title: `Update “${t.name}”?`,
      message: 'This workout had different exercises or sets than the template. Save them to the template for next time?',
      ok: 'Update template', cancel: 'Keep as is',
    });
    if (ok) { updateTemplateFromWorkout(t.id, result.workout); toast('Template updated'); }
  }
}

function showSummary(result) {
  return openScreenModal((close) => html`<${Summary} result=${result} close=${close} />`);
}
function Summary({ result, close }) {
  const { workout, prs, number } = result;
  const dur = workout.endedAt - workout.startedAt;
  const sets = workout.exercises.reduce((n, e) => n + e.sets.length, 0);
  const view = () => { close(); setTab('history'); push('workout-detail', { id: workout.id }); };
  return html`<${NavBar} title="" solid right=${html`<button class="nav-btn strong" id="summary-done" onClick=${() => close()}>Done</button>`} />
    <div class="scroll"><div class="page stack" style="padding-top:8px">
      <div class="summary-hero">
        <div class="medal"><${Icon} name=${prs.length ? 'trophy' : 'check'} /></div>
        <div class="big">${prs.length ? 'New records!' : 'Workout saved'}</div>
        <div class="sub">${workout.name} · workout #${number}</div>
      </div>
      <div class="facts-row">
        <div class="fact"><div class="k">Duration</div><div class="v tnum">${fmtDur(dur)}</div></div>
        <div class="fact"><div class="k">Volume</div><div class="v tnum">${volume(result.volume)}</div></div>
        <div class="fact"><div class="k">Sets</div><div class="v tnum">${sets}</div></div>
      </div>
      ${prs.length > 0 && html`<div><div class="section"><span class="section-title">Personal records</span></div>
        <div class="group pr-list">${prs.map((p) => {
          const ex = S.exercises.get(p.exerciseId);
          const kind = ['e1rm', 'weight', 'volume'].includes(p.metric) ? 'weight' : p.metric === 'reps' ? 'count' : p.metric;
          return html`<div class="cell" key=${p.exerciseId + p.metric}><span class="trophy"><${Icon} name="trophy" size=${20} /></span>
            <div class="cell-main"><div class="cell-title">${ex?.name}</div><div class="cell-sub">${PR_LABEL[p.metric]}</div></div>
            <div class="cell-value">${metricValue(kind, p.value)}</div></div>`;
        })}</div></div>`}
      <div><div class="section"><span class="section-title">Exercises</span></div>
        <div class="group">${workout.exercises.map((e) => {
          const ex = S.exercises.get(e.exerciseId);
          const b = bestSet(e.sets, ex?.category, S.settings.formula);
          return html`<div class="cell" key=${e.id}><div class="cell-main"><div class="cell-title">${exName(e.exerciseId)}</div>
            <div class="cell-sub">${plural(e.sets.length, 'set')}</div></div><div class="cell-value tnum">${b ? setText(b, ex?.category) : ''}</div></div>`;
        })}</div></div>
      <button class="btn btn-tinted btn-block" onClick=${view}>View in history</button>
    </div></div>`;
}

export { stats };
