// Exercises tab and the exercise detail screen (about, history, charts, records).
import { html, useState, useMemo } from '../lib.js';
import { Icon } from '../icons.js';
import {
  S, useStore, stats, exerciseList, updateExercise, deleteExercise, mergeExercise, exerciseUsage,
} from '../store.js';
import {
  exerciseRecords, exerciseSeries, chartMetricsFor, est1RM, hasLoadRecords, usesWeight, isWorking, formulaLabel,
} from '../calc.js';
import { BODY_PARTS, BODY_PART_LABEL, CATEGORY_LABEL } from '../seed.js';
import { editExercise, pickExercises, matchExercise } from '../pickers.js';
import { LineChart } from '../charts.js';
import {
  Screen, Empty, push, pop, actionSheet, confirmDialog, toast, promptDialog, Seg, Cell,
} from '../ui.js';
import {
  fmt, relDay, fmtClock, fmtNum, kgTo, kmTo, DAY, plural,
} from '../util.js';
import {
  setText, setLabels, metricValue, w as fmtW, wu, dist, wUnit, dUnit,
} from '../format.js';

export function ExercisesTab() {
  useStore('exercises', 'workouts');
  const [q, setQ] = useState('');
  const [part, setPart] = useState('all');
  const [sort, setSort] = useState('name');
  const [showHidden, setShowHidden] = useState(false);
  const st = stats();
  let list = exerciseList().filter((e) => (showHidden ? true : !e.hidden) && (part === 'all' || e.bodyPart === part) && matchExercise(e, q));
  const count = (id) => st.byExercise.get(id)?.length || 0;
  if (sort === 'freq') list = [...list].sort((a, b) => count(b.id) - count(a.id) || a.name.localeCompare(b.name));
  if (sort === 'recent') {
    const last = (id) => st.byExercise.get(id)?.[0]?.startedAt || 0;
    list = [...list].sort((a, b) => last(b.id) - last(a.id) || a.name.localeCompare(b.name));
  }
  const create = async () => { const ex = await editExercise(null, { name: q.trim() }); if (ex) push('exercise', { id: ex.id }); };
  const menu = async () => {
    const c = await actionSheet({ actions: [{ label: showHidden ? 'Hide hidden exercises' : 'Show hidden exercises', value: 'hidden' }] });
    if (c === 'hidden') setShowHidden(!showHidden);
  };
  let lastL = null;
  return html`<${Screen} large="Exercises" nav=${{
    left: html`<button class="nav-btn" onClick=${menu} aria-label="More options"><${Icon} name="more" /></button>`,
    right: html`<button class="nav-btn" id="new-exercise" onClick=${create} aria-label="New exercise"><${Icon} name="plus" /></button>`,
  }}>
    <div class="sticky-top" style="top:0">
      <label class="search"><${Icon} name="search" />
        <input type="search" id="exercise-search" placeholder=${`Search ${exerciseList().filter((e) => !e.hidden).length} exercises`}
          value=${q} autocomplete="off" autocorrect="off" spellcheck=${false} onInput=${(e) => setQ(e.target.value)} />
        ${q && html`<button onClick=${() => setQ('')} aria-label="Clear search"><${Icon} name="x" size=${16} /></button>`}
      </label>
      <div class="chips" style="margin-top:10px">
        <button class=${'chip' + (part === 'all' ? ' on' : '')} onClick=${() => setPart('all')}>All</button>
        ${BODY_PARTS.map((b) => html`<button class=${'chip' + (part === b.id ? ' on' : '')} onClick=${() => setPart(b.id)}>${b.label}</button>`)}
      </div>
      <div style="margin-top:10px"><${Seg} value=${sort} onChange=${setSort}
        options=${[{ value: 'name', label: 'A–Z' }, { value: 'freq', label: 'Most done' }, { value: 'recent', label: 'Recent' }]} /></div>
    </div>
    <div class="group">
      ${list.map((ex) => {
        const L = sort === 'name' ? (/[a-z]/i.test(ex.name[0]) ? ex.name[0].toUpperCase() : '#') : null;
        const head = L && L !== lastL;
        lastL = L;
        const n = count(ex.id);
        const last = st.byExercise.get(ex.id)?.[0]?.startedAt;
        return html`${head && html`<div class="letter-head" style="padding-left:14px;background:var(--surface)">${L}</div>`}
          <button class="cell" key=${ex.id} onClick=${() => push('exercise', { id: ex.id })}>
            <div class="cell-main"><div class="cell-title">${ex.name}${ex.hidden ? html` <span class="tag">Hidden</span>` : ''}</div>
              <div class="cell-sub">${BODY_PART_LABEL[ex.bodyPart] || 'Other'}${n ? ` · ${plural(n, 'time')} · ${relDay(last).toLowerCase()}` : ''}</div></div>
            <span class="chev"><${Icon} name="chevronRight" /></span>
          </button>`;
      })}
    </div>
    ${!list.length && html`<div class="empty"><h3>Nothing found</h3><p>Try another word, or create your own exercise.</p>
      <div style="margin-top:14px"><button class="btn btn-tinted" onClick=${create}><${Icon} name="plus" />New exercise</button></div></div>`}
  <//>`;
}

export function ExerciseDetailScreen({ id }) {
  useStore('exercises', 'workouts', 'settings');
  const ex = S.exercises.get(id);
  const sessions = stats().byExercise.get(id) || [];
  const [tab, setTab] = useState(sessions.length >= 2 ? 'charts' : sessions.length ? 'history' : 'about');
  if (!ex) return html`<${Screen} nav=${{ back: '' }}><${Empty} title="Exercise not found" text="It may have been merged or deleted." /><//>`;

  const menu = async () => {
    const c = await actionSheet({
      title: ex.name,
      actions: [
        { label: 'Edit exercise', value: 'edit', icon: 'edit' },
        { label: ex.pinnedNote ? 'Edit pinned note' : 'Pin a note', value: 'pin', icon: 'pin' },
        { label: 'Merge into another exercise…', value: 'merge', icon: 'swap' },
        { label: ex.hidden ? 'Show in lists again' : 'Hide from lists', value: 'hide', icon: 'filter' },
        { label: 'Delete exercise', value: 'delete', destructive: true, icon: 'trash' },
      ],
    });
    if (c === 'edit') editExercise(ex);
    if (c === 'pin') {
      const v = await promptDialog({ title: 'Pinned note', message: 'Shown every time you do this exercise.', value: ex.pinnedNote || '', multiline: true });
      if (v !== null) updateExercise(ex.id, { pinnedNote: v.trim() });
    }
    if (c === 'hide') { updateExercise(ex.id, { hidden: !ex.hidden }); toast(ex.hidden ? 'Hidden from lists' : 'Visible again'); }
    if (c === 'merge') {
      const into = await pickExercises({ multi: false, title: `Merge “${ex.name}” into` });
      if (!into || into === ex.id) return;
      const target = S.exercises.get(into);
      const ok = await confirmDialog({
        title: 'Merge exercises?',
        message: `All ${plural(sessions.length, 'session')} of “${ex.name}” move to “${target.name}”, and “${ex.name}” is deleted. This can’t be undone.`,
        ok: 'Merge', destructive: true,
      });
      if (!ok) return;
      mergeExercise(ex.id, into);
      pop();
      push('exercise', { id: into });
      toast('Exercises merged');
    }
    if (c === 'delete') {
      const u = exerciseUsage(ex.id);
      if (u.sessions > 0 || u.inActive) {
        const ok = await confirmDialog({
          title: 'This exercise has history',
          message: `It’s in ${plural(u.sessions, 'workout')}. Deleting it would break those workouts, so hide it from lists instead — your history stays.`,
          ok: 'Hide it', cancel: 'Cancel',
        });
        if (ok) updateExercise(ex.id, { hidden: true });
        return;
      }
      const ok = await confirmDialog({
        title: `Delete “${ex.name}”?`,
        message: u.templates ? `It will also be removed from ${plural(u.templates, 'template')}.` : 'It has never been used.',
        ok: 'Delete', destructive: true,
      });
      if (ok) { pop(); deleteExercise(ex.id); toast('Exercise deleted'); }
    }
  };

  return html`<${Screen} nav=${{ back: '', title: ex.name, right: html`<button class="nav-btn" onClick=${menu} aria-label="Exercise options"><${Icon} name="more" /></button>` }}>
    <h1 class="large-title" style="font-size:26px;margin-bottom:4px">${ex.name}</h1>
    <p class="subtitle" style="margin:0 0 14px">${BODY_PART_LABEL[ex.bodyPart] || 'Other'} · ${CATEGORY_LABEL[ex.category]}</p>
    <${Seg} value=${tab} onChange=${setTab} id="exercise-tabs" options=${[
      { value: 'about', label: 'About' }, { value: 'history', label: 'History' },
      { value: 'charts', label: 'Charts' }, { value: 'records', label: 'Records' }]} />
    <div style="margin-top:14px">
      ${tab === 'about' && html`<${About} ex=${ex} sessions=${sessions} />`}
      ${tab === 'history' && html`<${ExHistory} ex=${ex} sessions=${sessions} />`}
      ${tab === 'charts' && html`<${ExCharts} ex=${ex} sessions=${sessions} />`}
      ${tab === 'records' && html`<${ExRecords} ex=${ex} sessions=${sessions} />`}
    </div>
  <//>`;
}

function About({ ex, sessions }) {
  const rest = ex.restSec ?? S.settings.defaultRest;
  const setRest = async () => {
    const opts = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
    const v = await actionSheet({ title: 'Rest timer', actions: opts.map((s) => ({ label: s ? fmtClock(s) : 'Off', value: String(s), checked: rest === s })) });
    if (v !== undefined) updateExercise(ex.id, { restSec: +v });
  };
  return html`<div class="stack">
    ${ex.pinnedNote && html`<div class="pinned" style="margin:0"><${Icon} name="pin" /><span>${ex.pinnedNote}</span></div>`}
    <div class="group">
      <${Cell} title="What you log" value=${CATEGORY_LABEL[ex.category]} />
      <${Cell} title="Body part" value=${BODY_PART_LABEL[ex.bodyPart] || 'Other'} />
      <${Cell} title="Rest timer" value=${rest ? fmtClock(rest) : 'Off'} onClick=${setRest} />
      <${Cell} title="Times done" value=${fmtNum(sessions.length, 0)} />
      ${sessions.length > 0 && html`<${Cell} title="Last done" value=${fmt.short(sessions[0].startedAt)} />`}
      ${sessions.length > 0 && html`<${Cell} title="First done" value=${fmt.short(sessions[sessions.length - 1].startedAt)} />`}
    </div>
    ${ex.notes ? html`<div class="card ink2" style="white-space:pre-wrap">${ex.notes}</div>` : null}
    <button class="btn btn-tinted btn-block" onClick=${() => editExercise(ex)}><${Icon} name="edit" />Edit name, type or notes</button>
  </div>`;
}

function ExHistory({ ex, sessions }) {
  const [limit, setLimit] = useState(25);
  if (!sessions.length) return html`<${Empty} icon="history" title="Not done yet" text="Every workout with this exercise will show up here." />`;
  const load = hasLoadRecords(ex.category);
  return html`<div>
    ${sessions.slice(0, limit).map((s) => {
      const labels = setLabels(s.entry.sets);
      return html`<div class="detail-ex" key=${s.workoutId + s.entry.id}>
        <h4 style="display:flex;justify-content:space-between;gap:8px"><button onClick=${() => push('workout-detail', { id: s.workoutId })}>${s.name}</button>
          <span class="muted small" style="font-weight:500">${fmt.short(s.startedAt)}</span></h4>
        ${s.entry.sets.map((set, i) => html`<div class="dset" key=${i}>
          <span class=${'n ' + set.type}>${labels[i]}</span><span>${setText(set, ex.category)}</span>
          <span class="r">${load && set.type !== 'warmup' && set.w > 0 && set.r > 0 ? `1RM ${fmtW(est1RM(set.w, set.r, S.settings.formula), 1)}` : ''}</span></div>`)}
      </div>`;
    })}
    ${sessions.length > limit && html`<button class="btn btn-tinted btn-block" style="margin-top:12px" onClick=${() => setLimit(limit + 50)}>Show more</button>`}
  </div>`;
}

const RANGES = [
  { value: 90, label: '3M' }, { value: 182, label: '6M' }, { value: 365, label: '1Y' }, { value: 0, label: 'All' },
];
function ExCharts({ ex, sessions }) {
  const metrics = chartMetricsFor(ex.category);
  const [metric, setMetric] = useState(metrics[0].id);
  const [range, setRange] = useState(0);
  const m = metrics.find((x) => x.id === metric) || metrics[0];
  const all = useMemo(() => exerciseSeries(sessions, ex.category, m.id, S.settings.formula), [sessions, m.id, S.settings.formula]);
  const from = range ? Date.now() - range * DAY : 0;
  const pts = all.filter((p) => p.x >= from);
  const toDisplay = (v) => (m.kind === 'weight' ? kgTo(v, wUnit()) : m.kind === 'distance' ? kmTo(v, dUnit()) : v);
  const disp = pts.map((p) => ({ x: p.x, y: toDisplay(p.y) }));
  const fmtVal = (v) => {
    if (m.kind === 'weight') return `${fmtNum(v, 1)} ${wUnit()}`;
    if (m.kind === 'distance') return `${fmtNum(v, 2)} ${dUnit()}`;
    if (m.kind === 'time') return fmtClock(v);
    if (m.kind === 'pace') return metricValue('pace', v);
    return fmtNum(v, 0);
  };
  const fmtAxis = (v, dec) => (m.kind === 'time' || m.kind === 'pace' ? fmtClock(v) : Math.abs(v) >= 10000 ? `${fmtNum(v / 1000, 0)}k` : fmtNum(v, dec));
  const first = disp[0], last = disp[disp.length - 1];
  const change = first && last && disp.length > 1 ? last.y - first.y : null;
  const lowerBetter = m.kind === 'pace';
  return html`<div class="stack">
    <div class="chips" style="margin:0 -16px">${metrics.map((x) => html`<button key=${x.id} class=${'chip' + (x.id === metric ? ' on' : '')} onClick=${() => setMetric(x.id)}>${x.label}</button>`)}</div>
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><div class="card-title">${m.label}</div>
          <div class="card-sub">${last ? `${fmtVal(last.y)} last time` : 'No data in this range'}${change !== null ? html` · <span style=${`color:${(change > 0) !== lowerBetter ? 'var(--done)' : change === 0 ? 'var(--ink-3)' : 'var(--danger)'}`}>${change > 0 ? '+' : change < 0 ? '−' : '±'}${fmtVal(Math.abs(change))}</span> in range` : ''}</div></div>
      </div>
      <${LineChart} points=${disp} fmtVal=${fmtVal} fmtAxis=${fmtAxis} time=${m.kind === 'time' || m.kind === 'pace'} label=${`${m.label} for ${ex.name}`}
        emptyText=${sessions.length ? 'No sessions in this range' : 'Log this exercise to see your progress'} />
      <div style="margin-top:10px"><${Seg} value=${range} onChange=${setRange} options=${RANGES} /></div>
    </div>
    ${m.id === 'e1rm' && html`<p class="footnote">Estimated 1RM uses ${S.settings.formula === 'average' ? 'the average of all formulas' : `the ${formulaLabel(S.settings.formula)} formula`} on your best working set of each session. Change it in Settings.</p>`}
  </div>`;
}

function ExRecords({ ex, sessions }) {
  const rec = exerciseRecords(sessions, ex.category, S.settings.formula);
  if (!sessions.length) return html`<${Empty} icon="trophy" title="No records yet" text="Your best lifts for this exercise will be tracked here." />`;
  const card = (k, r, v, detail) => html`<div class="rec" key=${k}><div class="k">${k}</div><div class="v">${v}</div>
    <div class="d">${detail ? `${detail} · ` : ''}${fmt.short(r.at)}</div></div>`;
  const cards = [];
  if (hasLoadRecords(ex.category)) {
    if (rec.e1rm) cards.push(card('Estimated 1RM', rec.e1rm, wu(rec.e1rm.value), `${fmtW(rec.e1rm.w)} × ${rec.e1rm.r}`));
    if (rec.weight) cards.push(card('Heaviest weight', rec.weight, wu(rec.weight.value), `× ${rec.weight.r}`));
    if (rec.volume) cards.push(card('Best set volume', rec.volume, wu(rec.volume.value), `${fmtW(rec.volume.w)} × ${rec.volume.r}`));
    if (rec.sessionVolume) cards.push(card('Best session volume', rec.sessionVolume, wu(rec.sessionVolume.value)));
  }
  if (rec.reps && (ex.category === 'reps' || ex.category === 'assisted_bw' || ex.category === 'weighted_bw')) cards.push(card('Most reps', rec.reps, fmtNum(rec.reps.value, 0), rec.reps.w ? `${fmtW(rec.reps.w)} ${wUnit()}` : ''));
  if (rec.distance) cards.push(card('Longest distance', rec.distance, dist(rec.distance.value)));
  if (rec.time) cards.push(card('Longest time', rec.time, fmtClock(rec.time.value)));
  const reps = [...rec.repMax.entries()].sort((a, b) => a[0] - b[0]).filter(([r]) => r <= 20);
  // a rep max only counts if no heavier weight was lifted for more reps
  const cleaned = reps.filter(([r, v]) => !reps.some(([r2, v2]) => r2 > r && v2.w > v.w));
  return html`<div class="stack">
    <div class="records">${cards}</div>
    ${cleaned.length > 0 && html`<div><div class="section"><span class="section-title">Best by rep count</span></div>
      <div class="group"><table class="rm-table"><thead><tr><th>Reps</th><th>Weight</th><th>Est. 1RM</th></tr></thead><tbody>
        ${cleaned.map(([r, v]) => html`<tr key=${r}><td>${r}</td><td><strong>${wu(v.w)}</strong> <span class="muted small">${fmt.short(v.at)}</span></td>
          <td>${fmtW(est1RM(v.w, r, S.settings.formula), 1)}</td></tr>`)}
      </tbody></table></div></div>`}
    <div><div class="section"><span class="section-title">Lifetime</span></div>
      <div class="group">
        <${Cell} title="Sessions" value=${fmtNum(rec.sessions, 0)} />
        <${Cell} title="Working sets" value=${fmtNum(rec.totalSets, 0)} />
        ${rec.totalReps > 0 && html`<${Cell} title="Reps" value=${fmtNum(rec.totalReps, 0)} />`}
        ${hasLoadRecords(ex.category) && html`<${Cell} title="Volume" value=${wu(rec.totalVolume)} />`}
        ${rec.totalDistance > 0 && html`<${Cell} title="Distance" value=${dist(rec.totalDistance)} />`}
        ${rec.totalTime > 0 && html`<${Cell} title="Time" value=${fmtClock(rec.totalTime)} />`}
      </div></div>
  </div>`;
}

export { usesWeight, isWorking };
