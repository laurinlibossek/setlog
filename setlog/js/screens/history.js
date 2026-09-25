// History tab: workout list, calendar, workout detail, edit finished workouts.
import { tr } from '../i18n.js';
import { html, useState, useRef } from '../lib.js';
import { Icon } from '../icons.js';
import {
  S, useStore, stats, getWorkout, deleteWorkout, saveWorkout, exName,
} from '../store.js';
import { workoutVolume, bestSet, est1RM, hasLoadRecords, PR_LABEL } from '../calc.js';
import { WorkoutEditor } from '../editor.js';
import { beginWorkout } from '../sheet.js';
import { entryToDraft, draftEntries } from '../drafts.js';
import {
  Screen, Empty, push, pop, actionSheet, confirmDialog, toast, useForce, Seg,
} from '../ui.js';
import {
  fmt, fmtDur, startOfMonth, addMonths, startOfDay, startOfWeek, addDays, DAY, toLocalInput, fromLocalInput, plural, fmtNum,
} from '../util.js';
import { volume, setText, setLabels, w as fmtW, wUnit } from '../format.js';
import { shareText } from '../io.js';

export function WorkoutCard({ w, onClick }) {
  const prs = stats().prsByWorkout.get(w.id)?.length || 0;
  const vol = workoutVolume(w, S.exercises);
  const lines = w.exercises.slice(0, 6);
  return html`<button class="wcard" onClick=${onClick}>
    <div class="top"><div class="name">${w.name}</div></div>
    <div class="date">${fmt.medium(w.startedAt)} · ${fmt.time(w.startedAt)}</div>
    <div class="facts">
      <span><${Icon} name="clock" />${fmtDur((w.endedAt || w.startedAt) - w.startedAt)}</span>
      ${vol > 0 && html`<span><${Icon} name="weight" />${volume(vol)}</span>`}
      ${prs > 0 && html`<span class="gold"><${Icon} name="trophy" />${prs} ${prs > 1 ? tr('PRs') : tr('PR')}</span>`}
    </div>
    <div class="ex-lines">
      <div class="h">${tr('Exercise')}</div><div class="h" style="text-align:right">${tr('Best set')}</div>
      ${lines.map((e) => {
        const ex = S.exercises.get(e.exerciseId);
        const b = bestSet(e.sets, ex?.category, S.settings.formula);
        return html`<div class="ellipsis" key=${e.id + 'n'}>${e.sets.length} × ${ex?.name || tr('Unknown exercise')}</div>
          <div class="v" key=${e.id + 'v'}>${b ? setText(b, ex?.category) : ''}</div>`;
      })}
    </div>
    ${w.exercises.length > 6 && html`<div class="more">${tr('+ {n} more', { n: w.exercises.length - 6 })}</div>`}
  </button>`;
}

export function HistoryTab() {
  useStore('workouts', 'exercises', 'settings');
  const [view, setView] = useState('list');
  const [limit, setLimit] = useState(30);
  const ws = S.workouts;
  const toggle = html`<button class="nav-btn" id="history-view" onClick=${() => setView(view === 'list' ? 'cal' : 'list')}
    aria-label=${view === 'list' ? tr('Show calendar') : tr('Show list')}><${Icon} name=${view === 'list' ? 'calendar' : 'list'} /></button>`;
  if (!ws.length) {
    return html`<${Screen} large=${tr('History')}>
      <${Empty} icon="history" title=${tr('No workouts yet')} text=${tr('Finished workouts land here with their best sets, records and totals. Coming from Strong? Import your history in Profile → Settings.')} />
    <//>`;
  }
  if (view === 'cal') return html`<${Screen} large=${tr('History')} nav=${{ right: toggle }}><${Calendar} /><//>`;
  const groups = [];
  let cur = null;
  for (const w of ws.slice(0, limit)) {
    const m = startOfMonth(w.startedAt);
    if (!cur || cur.m !== m) { cur = { m, items: [] }; groups.push(cur); }
    cur.items.push(w);
  }
  const monthCount = (m) => ws.filter((w) => startOfMonth(w.startedAt) === m).length;
  return html`<${Screen} large=${tr('History')} nav=${{ right: toggle }}>
    ${groups.map((g) => html`<div key=${g.m}>
      <div class="month-head"><h3>${fmt.monthYear(g.m)}</h3><span>${plural(monthCount(g.m), 'workout')}</span></div>
      ${g.items.map((w) => html`<${WorkoutCard} key=${w.id} w=${w} onClick=${() => push('workout-detail', { id: w.id })} />`)}
    </div>`)}
    ${ws.length > limit && html`<button class="btn btn-tinted btn-block" onClick=${() => setLimit(limit + 40)}>${tr('Show older workouts')}</button>`}
  <//>`;
}

function Calendar() {
  const [month, setMonth] = useState(startOfMonth(Date.now()));
  const [sel, setSel] = useState(null);
  const ws = S.workouts;
  const byDay = new Map();
  for (const w of ws) {
    const d = startOfDay(w.startedAt);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(w);
  }
  const weekStart = S.settings.weekStart;
  const gridStart = startOfWeek(month, weekStart);
  const days = [];
  for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i));
  const nextMonth = addMonths(month, 1);
  const rows = days[35] >= nextMonth ? 5 : 6;
  const inMonth = ws.filter((w) => w.startedAt >= month && w.startedAt < nextMonth);
  const today = startOfDay(Date.now());
  const selected = sel ? byDay.get(sel) || [] : [];
  const totalTime = inMonth.reduce((a, w) => a + ((w.endedAt || w.startedAt) - w.startedAt), 0);
  const activeDays = new Set(inMonth.map((w) => startOfDay(w.startedAt))).size;
  return html`<div>
    <div class="cal">
      <div class="cal-head">
        <button class="icon-btn" onClick=${() => { setMonth(addMonths(month, -1)); setSel(null); }} aria-label=${tr('Previous month')}><${Icon} name="chevronLeft" /></button>
        <strong>${fmt.monthYear(month)}</strong>
        <button class="icon-btn" onClick=${() => { setMonth(addMonths(month, 1)); setSel(null); }} aria-label=${tr('Next month')}><${Icon} name="chevronRight" /></button>
      </div>
      <div class="cal-grid">
        ${days.slice(0, 7).map((d) => html`<div class="wd" key=${'w' + d}>${fmt.weekdayNarrow(d)}</div>`)}
        ${days.slice(0, rows * 7).map((d) => {
          const has = byDay.has(d);
          const cls = ['cal-day', d < month || d >= nextMonth ? 'out' : '', d === today ? 'today' : '', has ? 'has' : '', sel === d ? 'sel' : ''].join(' ');
          return html`<button key=${d} class=${cls} onClick=${() => setSel(has ? d : null)} aria-label=${fmt.full(d) + (has ? ', workout' : '')}>${new Date(d).getDate()}</button>`;
        })}
      </div>
      <div class="cal-stats">
        <div><div class="v tnum">${inMonth.length}</div><div class="k">${tr('Workouts')}</div></div>
        <div><div class="v tnum">${activeDays}</div><div class="k">${tr('Days trained')}</div></div>
        <div><div class="v tnum">${fmtDur(totalTime)}</div><div class="k">${tr('Time')}</div></div>
      </div>
    </div>
    ${sel && html`<div class="month-head"><h3>${fmt.full(sel)}</h3></div>
      ${selected.map((w) => html`<${WorkoutCard} key=${w.id} w=${w} onClick=${() => push('workout-detail', { id: w.id })} />`)}`}
    ${!sel && inMonth.length > 0 && html`<p class="footnote center">${tr('Tap a highlighted day to see that workout.')}</p>`}
  </div>`;
}

// ---------- detail ----------
export function workoutAsText(w) {
  const lines = [`${w.name} — ${fmt.medium(w.startedAt)}`];
  const vol = workoutVolume(w, S.exercises);
  lines.push([fmtDur(w.endedAt - w.startedAt), vol ? volume(vol) : null].filter(Boolean).join(' · '));
  if (w.notes) lines.push(w.notes);
  for (const e of w.exercises) {
    const ex = S.exercises.get(e.exerciseId);
    lines.push('', ex?.name || tr('Exercise'));
    const labels = setLabels(e.sets);
    e.sets.forEach((s, i) => lines.push(`  ${labels[i].padEnd(2)} ${setText(s, ex?.category)}`));
    if (e.notes) lines.push(`  ${tr('“{name}”', { name: e.notes })}`);
  }
  return lines.join('\n');
}

export function WorkoutDetailScreen({ id }) {
  useStore('workouts', 'exercises', 'settings');
  const w = getWorkout(id);
  if (!w) return html`<${Screen} nav=${{ back: '' }}><${Empty} title=${tr('Workout not found')} text=${tr('It may have been deleted.')} /><//>`;
  const st = stats();
  const prSets = st.prSets;
  const vol = workoutVolume(w, S.exercises);
  const prs = st.prsByWorkout.get(w.id) || [];
  const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const menu = async () => {
    const c = await actionSheet({
      title: w.name,
      actions: [
        { label: tr('Edit workout'), value: 'edit', icon: 'edit' },
        { label: tr('Do this workout again'), value: 'again', icon: 'play' },
        { label: tr('Save as template'), value: 'template', icon: 'copy' },
        { label: tr('Share as text'), value: 'share', icon: 'share' },
        { label: tr('Delete workout'), value: 'delete', destructive: true, icon: 'trash' },
      ],
    });
    if (c === 'edit') push('workout-edit', { id: w.id });
    if (c === 'again') beginWorkout({ fromWorkout: w });
    if (c === 'template') push('template-edit', { fromWorkoutId: w.id });
    if (c === 'share') {
      const r = await shareText(workoutAsText(w), w.name);
      if (r === 'copied') toast(tr('Copied to clipboard'));
      if (r === 'failed') toast(tr('Sharing isn’t available here'));
    }
    if (c === 'delete') {
      const ok = await confirmDialog({ title: tr('Delete this workout?'), message: tr('Its sets and records will be removed from your history.'), ok: tr('Delete'), destructive: true });
      if (ok) {
        const copy = JSON.parse(JSON.stringify(w));
        deleteWorkout(w.id);
        pop();
        toast(tr('Workout deleted'), { action: { label: tr('Undo'), fn: () => saveWorkout(copy) } });
      }
    }
  };
  return html`<${Screen} nav=${{ back: '', title: w.name, right: html`<button class="nav-btn" id="workout-menu" onClick=${menu} aria-label=${tr('Workout options')}><${Icon} name="more" /></button>` }}>
    <h1 class="large-title" style="font-size:28px;margin-bottom:4px">${w.name}</h1>
    <p class="subtitle" style="margin:0 0 12px">${fmt.full(w.startedAt)} · ${fmt.time(w.startedAt)}–${fmt.time(w.endedAt)}</p>
    <div class="facts-row">
      <div class="fact"><div class="k">${tr('Duration')}</div><div class="v tnum">${fmtDur(w.endedAt - w.startedAt)}</div></div>
      <div class="fact"><div class="k">${tr('Volume')}</div><div class="v tnum">${vol ? volume(vol) : '—'}</div></div>
      <div class="fact"><div class="k">${prs.length ? tr('Records') : tr('Sets')}</div><div class="v tnum" style=${prs.length ? 'color:var(--gold)' : ''}>${prs.length || sets}</div></div>
    </div>
    ${w.notes && html`<div class="card ink2" style="margin-top:8px;white-space:pre-wrap">${w.notes}</div>`}
    ${w.exercises.map((e) => {
      const ex = S.exercises.get(e.exerciseId);
      const labels = setLabels(e.sets);
      return html`<div class="detail-ex" key=${e.id}>
        <h4><button onClick=${() => push('exercise', { id: e.exerciseId })}>${ex?.name || tr('Unknown exercise')}</button></h4>
        ${e.notes && html`<div class="small muted" style="margin:-2px 0 6px">${e.notes}</div>`}
        ${e.sets.map((s, i) => {
          const flags = prSets.get(s.id);
          const oneRm = ex && hasLoadRecords(ex.category) && s.type !== 'warmup' ? est1RM(s.w, s.r, S.settings.formula) : 0;
          return html`<div class="dset" key=${s.id || i}>
            <span class=${'n ' + s.type}>${labels[i]}</span>
            <span>${setText(s, ex?.category)}</span>
            <span class="r">${flags ? html`<span class="pr-flag"><${Icon} name="trophy" />${flags.map((f) => PR_LABEL[f]).join(' · ')}</span>`
              : oneRm ? `1RM ${fmtW(oneRm, 1)}` : ''}</span>
          </div>`;
        })}
      </div>`;
    })}
    <div class="stack" style="margin-top:18px">
      <button class="btn btn-tinted btn-block" onClick=${() => beginWorkout({ fromWorkout: w })}><${Icon} name="play" />${tr('Do this workout again')}</button>
    </div>
  <//>`;
}

export function WorkoutEditScreen({ id }) {
  useStore('exercises');
  const force = useForce();
  const dirty = useRef(false);
  const [draft] = useState(() => {
    const w = getWorkout(id);
    if (!w) return null;
    return {
      kind: 'edit',
      id: w.id,
      name: w.name,
      notes: w.notes || '',
      startedAt: w.startedAt,
      durationMin: String(Math.max(1, Math.round((w.endedAt - w.startedAt) / 60000))),
      templateId: w.templateId || null,
      exercises: w.exercises.filter((e) => S.exercises.has(e.exerciseId)).map((e) => {
        const d = entryToDraft(e, S.settings);
        d.id = e.id;
        return d;
      }),
      source: w.source,
    };
  });
  if (!draft) return html`<${Screen} nav=${{ back: '' }}><${Empty} title=${tr('Workout not found')} /><//>`;
  const onChange = () => { dirty.current = true; force(); };
  const save = () => {
    const exercises = draftEntries(draft, S.settings, S.exercises, {});
    if (!exercises.length) { toast(tr('Keep at least one complete set')); return; }
    const mins = Math.max(1, Math.round(parseFloat(String(draft.durationMin).replace(',', '.')) || 1));
    saveWorkout({
      id: draft.id,
      name: draft.name.trim() || tr('Workout'),
      notes: draft.notes.trim(),
      startedAt: draft.startedAt,
      endedAt: draft.startedAt + mins * 60000,
      templateId: draft.templateId,
      exercises,
      ...(draft.source ? { source: draft.source } : {}),
    });
    toast(tr('Workout saved'));
    pop();
  };
  const cancel = async () => {
    if (dirty.current) {
      const ok = await confirmDialog({ title: tr('Discard changes?'), ok: tr('Discard'), cancel: tr('Keep editing'), destructive: true });
      if (!ok) return;
    }
    pop();
  };
  const header = html`<div class="stack" style="gap:10px;margin-top:8px">
    <input class="wo-name" value=${draft.name} aria-label=${tr('Workout name')} onInput=${(e) => { draft.name = e.target.value; dirty.current = true; }} />
    <div class="row">
      <div class="field grow"><label for="edit-start">${tr('Started')}</label>
        <input id="edit-start" class="input" type="datetime-local" value=${toLocalInput(draft.startedAt)}
          onChange=${(e) => { const t = fromLocalInput(e.target.value); if (t) { draft.startedAt = t; onChange(); } }} /></div>
      <div class="field" style="width:110px"><label for="edit-dur">${tr('Minutes')}</label>
        <input id="edit-dur" class="input tnum" inputmode="numeric" value=${draft.durationMin}
          onInput=${(e) => { draft.durationMin = e.target.value; dirty.current = true; }} /></div>
    </div>
    <textarea class="textarea" placeholder=${tr('Workout note')} value=${draft.notes} style="min-height:48px"
      onInput=${(e) => { draft.notes = e.target.value; dirty.current = true; }}></textarea>
  </div>`;
  return html`<${Screen} nav=${{
    title: tr('Edit workout'),
    left: html`<button class="nav-btn" onClick=${cancel}>${tr('Cancel')}</button>`,
    right: html`<button class="nav-btn strong" id="edit-save" onClick=${save}>${tr('Save')}</button>`,
  }}>
    <${WorkoutEditor} draft=${draft} mode="edit" onChange=${onChange} header=${header}
      before=${draft.startedAt} excludeWorkoutId=${draft.id} />
    <p class="footnote">${tr('Sets without reps (or time) are dropped when you save.')}</p>
  <//>`;
}

// helpers used by the profile screen
export function weeklyCounts(weeks = 12) {
  const ws = S.settings.weekStart;
  const thisWeek = startOfWeek(Date.now(), ws);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 7);
    const n = S.workouts.filter((w) => w.startedAt >= start && w.startedAt < end).length;
    out.push({ start, value: n });
  }
  return out;
}
export function weekStreak() {
  const ws = S.settings.weekStart;
  const goal = S.settings.weeklyGoal || 1;
  let week = startOfWeek(Date.now(), ws);
  const count = (s) => S.workouts.filter((w) => w.startedAt >= s && w.startedAt < addDays(s, 7)).length;
  let streak = 0;
  // the current week counts once the goal is met; otherwise start from last week
  if (count(week) >= goal) streak++;
  week = addDays(week, -7);
  while (count(week) >= goal && streak < 520) { streak++; week = addDays(week, -7); }
  return streak;
}
export { DAY, fmtNum, wUnit, exName, Seg };
