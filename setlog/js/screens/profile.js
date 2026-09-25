// Profile tab (dashboard) and Settings, including all data management.
import { html, useState } from '../lib.js';
import { Icon } from '../icons.js';
import {
  S, useStore, stats, setSetting, setProfile, setMeta, importBatch, addWorkoutNotes, replaceAllData, checkPersisted, APP_VERSION,
  bodyweightAt, flushActive,
  isPreview, hasSampleData, clearSampleData,
} from '../store.js';
import {
  PR_LABEL, workoutVolume, FORMULAS, DEFAULT_WARMUP,
} from '../calc.js';
import { BarChart } from '../charts.js';
import {
  Screen, push, openDialog, confirmDialog, promptDialog, toast, Seg, Switch, Cell,
} from '../ui.js';
import {
  fmt, fmtNum, plural, isIOS, isStandalone, DAY, fmtClock, relDay, relDayLower, parseNum,
} from '../util.js';
import { tr, saveLangPref, getLangPref } from '../i18n.js';
import {
  metricValue, volume, bwUnit, lenUnit,
} from '../format.js';
import { weeklyCounts, weekStreak } from './history.js';
import {
  parseStrongCSV, backupJSON, parseBackup, exportCSV, saveFile, pickFile, dateStamp,
} from '../io.js';
import { openTools } from '../tools.js';
import { beep, unlockAudio } from '../sound.js';

// ---------- profile ----------
export function ProfileTab() {
  useStore('workouts', 'profile', 'meta', 'settings', 'exercises');
  const name = S.profile.name;
  const ws = S.workouts;
  const weeks = weeklyCounts(12);
  const thisWeek = weeks[weeks.length - 1].value;
  const goal = S.settings.weeklyGoal;
  const streak = weekStreak();
  const st = stats();
  const since = Date.now() - 30 * DAY;
  const recentPrs = [];
  for (const w of ws) {
    if (w.startedAt < since) break;
    for (const p of st.prsByWorkout.get(w.id) || []) recentPrs.push({ ...p, at: w.startedAt, workoutId: w.id });
  }
  const monthVol = ws.filter((w) => w.startedAt >= since).reduce((a, w) => a + workoutVolume(w, S.exercises), 0);

  const needsBackup = !isPreview() && ws.length >= 3 && (!S.meta.lastBackupAt || Date.now() - S.meta.lastBackupAt > 14 * DAY)
    && (!S.meta.backupSnoozedAt || Date.now() - S.meta.backupSnoozedAt > 7 * DAY);
  const showInstall = !isPreview() && !isStandalone() && !S.meta.installHintDismissed;

  const editName = async () => {
    const v = await promptDialog({ title: tr('Your name'), value: name, placeholder: tr('Name') });
    if (v !== null) setProfile({ name: v.trim() });
  };
  return html`<${Screen} large=${name || tr('Profile')} nav=${{
    right: html`<button class="nav-btn" id="open-settings" onClick=${() => push('settings')} aria-label=${tr('Settings')}><${Icon} name="gear" /></button>`,
  }}>
    ${!name && html`<button class="link-btn" style="margin:-6px 0 10px" onClick=${editName}>${tr('Add your name')}</button>`}
    <div class="stack">
      ${S.storage !== 'ok' && html`<div class="banner warn"><${Icon} name="warn" /><div><strong>${tr('Storage is unavailable.')}</strong>
        ${tr('This browser blocked on-device storage (private mode?), so nothing you log will be kept.')}</div></div>`}
      ${isPreview() && html`<div class="banner warn"><${Icon} name="info" /><div>
        <strong>${tr('Preview with sample workouts.')}</strong> ${tr('Everything here stays in this browser only and backups are blocked, so don’t log real training in the preview. For real use, host the app and add it to your Home Screen.')}
        ${hasSampleData() && html`<div class="actions"><button class="link-btn" onClick=${() => { clearSampleData(); toast(tr('Sample data cleared')); }}>${tr('Clear sample data')}</button></div>`}
      </div></div>`}
      ${showInstall && html`<${InstallBanner} />`}
      ${needsBackup && html`<div class="banner info"><${Icon} name="shield" /><div>
        <strong>${tr('Back up your training log.')}</strong> ${tr('It lives only on this phone — a backup file in iCloud Drive protects it if the phone is lost or reset.')}
        <div class="actions"><button class="link-btn" onClick=${doBackup}>${tr('Back up now')}</button>
        <button class="link-btn" style="color:var(--ink-3)" onClick=${() => setMeta({ backupSnoozedAt: Date.now() })}>${tr('Later')}</button></div></div></div>`}

      <div class="tiles">
        <div class="tile"><div class="k">${tr('Workouts')}</div><div class="v">${fmtNum(ws.length, 0)}</div><div class="d">${tr('all time')}</div></div>
        <div class="tile"><div class="k">${tr('This week')}</div><div class="v">${thisWeek}<span class="muted" style="font-size:16px">/${goal}</span></div>
          <div class="d">${thisWeek >= goal ? tr('goal reached') : tr('{n} to go', { n: goal - thisWeek })}</div></div>
        <div class="tile"><div class="k">${tr('Streak')}</div><div class="v">${streak}</div><div class="d">${streak === 1 ? tr('week on goal') : tr('weeks on goal')}</div></div>
      </div>

      <div class="card">
        <div class="card-title">${tr('Workouts per week')}</div>
        <div class="card-sub">${tr('Last 12 weeks · goal {n} per week', { n: goal })}${monthVol ? ` · ${tr('{volume} lifted in 30 days', { volume: volume(monthVol) })}` : ''}</div>
        <${BarChart} bars=${weeks.map((w) => ({ label: fmt.dayMonth(w.start), value: w.value, title: tr('Week of {date}', { date: fmt.dayMonth(w.start) }) }))}
          goal=${goal} fmtVal=${(v) => String(v)} label=${tr('Workouts per week')} />
      </div>

      ${recentPrs.length > 0 && html`<div><div class="section"><span class="section-title">${tr('Records in the last 30 days')}</span></div>
        <div class="group pr-list">${recentPrs.slice(0, 8).map((p, i) => {
          const kind = ['e1rm', 'weight', 'volume'].includes(p.metric) ? 'weight' : p.metric === 'reps' ? 'count' : p.metric;
          return html`<button class="cell" key=${i} onClick=${() => push('exercise', { id: p.exerciseId })}>
            <span class="trophy"><${Icon} name="trophy" size=${20} /></span>
            <div class="cell-main"><div class="cell-title">${S.exercises.get(p.exerciseId)?.name}</div>
              <div class="cell-sub">${PR_LABEL[p.metric]} · ${relDay(p.at)}</div></div>
            <div class="cell-value">${metricValue(kind, p.value)}</div></button>`;
        })}</div></div>`}

      <div><div class="section"><span class="section-title">${tr('Tools')}</span></div>
        <div class="group">
          <${Cell} icon="plate" title=${tr('Plate calculator')} onClick=${() => openTools({ tab: 'plates' })} />
          <${Cell} icon="calc" title=${tr('1RM calculator')} onClick=${() => openTools({ tab: 'rm' })} />
          <${Cell} icon="gear" title=${tr('Settings & data')} sub=${tr('Units, rest timer, backup, Strong import')} onClick=${() => push('settings')} />
        </div></div>
    </div>
  <//>`;
}

function InstallBanner() {
  const ios = isIOS();
  return html`<div class="banner info"><${Icon} name="download" /><div>
    <strong>${tr('Install Setlog on your Home Screen')}</strong>
    ${ios ? html`<ol class="install-steps"><li>${tr('Tap Share in Safari’s toolbar')}</li><li>${tr('Choose Add to Home Screen')}</li><li>${tr('Open Setlog from the new icon')}</li></ol>
      <div class="small" style="margin-top:4px">${tr('The installed app keeps its own storage — log your workouts there, not in this Safari tab.')}</div>`
      : html`<div class="small">${tr('Use your browser’s “Install app” or “Add to Home Screen” option so it opens full-screen and works offline.')}</div>`}
    <div class="actions"><button class="link-btn" style="color:var(--ink-3)" onClick=${() => setMeta({ installHintDismissed: true })}>${tr('Dismiss')}</button></div>
  </div></div>`;
}

// ---------- data actions ----------
export async function doBackup() {
  let r;
  try { r = await saveFile(`setlog-backup-${dateStamp()}.json`, backupJSON(), 'application/json'); } catch (e) { toast(e.message); return; }
  if (r !== 'cancelled') { setMeta({ lastBackupAt: Date.now() }); toast(r === 'shared' ? tr('Backup ready') : tr('Backup downloaded')); }
}

async function doExportCSV() {
  let r;
  try { r = await saveFile(`setlog-workouts-${dateStamp()}.csv`, exportCSV(), 'text/csv'); } catch (e) { toast(e.message); return; }
  if (r !== 'cancelled') toast(tr('CSV exported'));
}

async function doRestore() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let parsed;
  try { parsed = parseBackup(f.text); } catch (e) { toast(e.message); return; }
  const d = parsed.data;
  const ok = await confirmDialog({
    title: tr('Replace all data?'),
    message: tr('The backup{from} has {workouts}, {templates} and {measurements}. Everything currently in the app is replaced.', {
      from: parsed.exportedAt ? ` ${tr('from {date}', { date: fmt.short(new Date(parsed.exportedAt).getTime()) })}` : '',
      workouts: plural(d.workouts.length, 'workout'), templates: plural(d.templates.length, 'template'), measurements: plural(d.measurements.length, 'measurement'),
    }),
    ok: tr('Replace'), destructive: true,
  });
  if (!ok) return;
  await replaceAllData(d);
  toast(tr('Backup restored'));
}

async function doStrongImport() {
  const f = await pickFile('.csv,text/csv,text/comma-separated-values,application/csv,text/plain');
  if (!f) return;
  let units = { weightUnit: S.settings.unit, distUnit: S.settings.distUnit };
  let res;
  try { res = parseStrongCSV(f.text, units); } catch (e) { toast(e.message); return; }
  if (!res.stats.hasWeightUnitColumn && res.workouts.length) {
    units = await openDialog((close) => html`<${UnitDialog} close=${close} initial=${units} />`);
    if (!units) return;
    res = parseStrongCSV(f.text, units);
  }
  const s = res.stats;
  if (!s.workouts && !s.notesAdded) {
    toast(s.duplicates ? tr('All {n} are already imported', { n: plural(s.duplicates, 'workout') }) : tr('No workouts found in this file'));
    return;
  }
  if (!s.workouts) {
    const ok = await confirmDialog({
      title: tr('Add notes to {n}?', { n: plural(s.notesAdded, 'workout') }),
      message: tr('All {n} are already in Setlog, but the file has notes that are missing there. Existing notes aren’t changed.', { n: plural(s.duplicates, 'workout') }),
      ok: tr('Add notes'),
    });
    if (!ok) return;
    addWorkoutNotes(res.noteUpdates);
    toast(tr('Notes added to {n}', { n: plural(s.notesAdded, 'workout') }));
    return;
  }
  const ok = await openDialog((close) => html`<${ImportPreview} close=${close} s=${s} />`);
  if (!ok) return;
  await importBatch({ exercises: res.exercises, workouts: res.workouts });
  if (res.noteUpdates.length) addWorkoutNotes(res.noteUpdates);
  toast(tr('Imported {n}', { n: plural(s.workouts, 'workout') }));
}

function UnitDialog({ close, initial }) {
  const [w, setW] = useState(initial.weightUnit);
  const [d, setD] = useState(initial.distUnit);
  return html`<div class="dialog">
    <h3>${tr('Which units did Strong use?')}</h3>
    <p>${tr('Strong’s export doesn’t say, so pick what the app was set to.')}</p>
    <${Seg} value=${w} onChange=${setW} options=${[{ value: 'kg', label: tr('Kilograms') }, { value: 'lb', label: tr('Pounds') }]} />
    <${Seg} value=${d} onChange=${setD} options=${[{ value: 'km', label: tr('Kilometres') }, { value: 'mi', label: tr('Miles') }]} />
    <div class="btns two"><button class="btn" onClick=${() => close(null)}>${tr('Cancel')}</button>
      <button class="btn btn-primary" id="units-ok" onClick=${() => close({ weightUnit: w, distUnit: d })}>${tr('Continue')}</button></div>
  </div>`;
}

function ImportPreview({ close, s }) {
  return html`<div class="dialog">
    <h3>${tr('Import {n}?', { n: plural(s.workouts, 'workout') })}</h3>
    <p>${tr('{sets} from {first} to {last}.', { sets: plural(s.sets, 'set'), first: fmt.short(s.first), last: fmt.short(s.last) })}</p>
    ${s.duplicates > 0 && html`<p class="small">${!s.notesAdded ? tr('{n} already in Setlog will be skipped.', { n: plural(s.duplicates, 'workout') })
      : s.notesAdded === 1 ? tr('{n} already in Setlog will be skipped, but one gets its missing notes.', { n: plural(s.duplicates, 'workout') })
        : tr('{n} already in Setlog will be skipped, but {m} get their missing notes.', { n: plural(s.duplicates, 'workout'), m: s.notesAdded })}</p>`}
    ${s.newExercises.length > 0 && html`<div class="card small" style="background:var(--surface-2)">
      <strong>${plural(s.newExercises.length, 'new exercise')}</strong> ${tr('will be created:')}
      <div class="muted" style="margin-top:4px">${s.newExercises.slice(0, 8).join(', ')}${s.newExercises.length > 8 ? ` ${tr('and {n} more', { n: s.newExercises.length - 8 })}` : ''}</div>
      <div class="muted" style="margin-top:6px">${tr('Tip: if one is the same as a built-in exercise, use “Merge into…” on its page afterwards.')}</div>
    </div>`}
    <div class="btns two"><button class="btn" onClick=${() => close(false)}>${tr('Cancel')}</button>
      <button class="btn btn-primary" id="import-ok" onClick=${() => close(true)}>${tr('Import')}</button></div>
  </div>`;
}

async function doDeleteAll() {
  const ok = await confirmDialog({
    title: tr('Delete all data?'),
    message: tr('Every workout, template, measurement and custom exercise on this phone will be erased.'),
    ok: tr('Continue'), destructive: true,
  });
  if (!ok) return;
  const word = tr('DELETE');
  const v = await promptDialog({ title: tr('Type {word} to confirm', { word }), placeholder: word, ok: tr('Delete everything') });
  if ((v || '').trim().toUpperCase() !== word.toUpperCase()) { if (v !== null) toast(tr('Nothing was deleted')); return; }
  await replaceAllData({ exercises: [], workouts: [], templates: [], measurements: [], kv: {} });
  toast(tr('All data deleted'));
}

// ---------- settings ----------
const REST = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

const warmupText = (wu) => [wu.barReps > 0 ? `${tr('Bar')} × ${wu.barReps}` : null, ...wu.steps.map(([p, r]) => `${fmtNum(p, 0)}% × ${r}`)]
  .filter(Boolean).join(', ') || tr('None');

function WarmupDialog({ close }) {
  const cur = S.settings.warmup || DEFAULT_WARMUP;
  const [bar, setBar] = useState(String(cur.barReps || 0));
  const [steps, setSteps] = useState(cur.steps.map(([p, r]) => [String(p), String(r)]));
  const edit = (i, k, v) => setSteps(steps.map((row, j) => (j === i ? (k === 0 ? [v, row[1]] : [row[0], v]) : row)));
  const save = (e) => {
    e.preventDefault();
    const clean = steps.map(([p, r]) => [parseNum(p), Math.round(parseNum(r) || 0)])
      .filter(([p, r]) => p > 0 && p < 100 && r > 0).sort((a, b) => a[0] - b[0]);
    setSetting('warmup', { barReps: Math.max(0, Math.round(parseNum(bar) || 0)), steps: clean });
    close(true);
  };
  const reset = () => { setBar(String(DEFAULT_WARMUP.barReps)); setSteps(DEFAULT_WARMUP.steps.map(([p, r]) => [String(p), String(r)])); };
  return html`<form class="dialog" onSubmit=${save}>
    <h3>${tr('Warm-up sets')}</h3>
    <p class="small">${tr('Used by ⋯ → Add warm-up sets, based on your first working set.')}</p>
    <div class="wu-row"><span class="grow">${tr('Empty bar first')}</span>
      <input class="input tnum" inputmode="numeric" aria-label=${tr('Reps with the empty bar')} value=${bar} onInput=${(e) => setBar(e.target.value)} /><span class="muted">${tr('reps')}</span></div>
    ${steps.map(([p, r], i) => html`<div class="wu-row" key=${i}>
      <input class="input tnum" inputmode="decimal" aria-label=${tr('Step {n} percent', { n: i + 1 })} value=${p} onInput=${(e) => edit(i, 0, e.target.value)} /><span class="muted">%  ×</span>
      <input class="input tnum" inputmode="numeric" aria-label=${tr('Step {n} reps', { n: i + 1 })} value=${r} onInput=${(e) => edit(i, 1, e.target.value)} /><span class="muted grow">${tr('reps')}</span>
      <button type="button" class="icon-btn" aria-label=${tr('Remove step {n}', { n: i + 1 })} onClick=${() => setSteps(steps.filter((_, j) => j !== i))}><${Icon} name="x" /></button>
    </div>`)}
    <div class="row" style="gap:8px">
      <button type="button" class="btn btn-sm btn-tinted" id="wu-add" onClick=${() => setSteps([...steps, ['', '']])}><${Icon} name="plus" />${tr('Add step')}</button>
      <button type="button" class="btn btn-sm btn-ghost" onClick=${reset}>${tr('Reset')}</button>
    </div>
    <div class="btns two">
      <button type="button" class="btn" onClick=${() => close(false)}>${tr('Cancel')}</button>
      <button type="submit" class="btn btn-primary" id="wu-save">${tr('Save')}</button>
    </div>
  </form>`;
}

const toDateInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function HistoryStartDialog({ close }) {
  const [v, setV] = useState(S.settings.historyStart ? toDateInput(S.settings.historyStart) : '');
  const save = (e) => {
    e.preventDefault();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) { toast(tr('Pick a date')); return; }
    setSetting('historyStart', new Date(+m[1], +m[2] - 1, +m[3]).getTime());
    close(true);
  };
  return html`<form class="dialog" onSubmit=${save}>
    <h3>${tr('Start history from')}</h3>
    <p class="small">${tr('Older workouts stay in History but don’t count for previous values, records or charts.')}</p>
    <input class="input" type="date" id="history-start" value=${v} max=${toDateInput(Date.now())} onInput=${(e) => setV(e.target.value)} />
    <div class="btns">
      <button type="submit" class="btn btn-primary" id="history-start-save">${tr('Save')}</button>
      <button type="button" class="btn" id="history-start-all" onClick=${() => { setSetting('historyStart', null); close(true); }}>${tr('Use all workouts')}</button>
    </div>
  </form>`;
}

export function SettingsScreen() {
  useStore('settings', 'meta', 'workouts');
  const st = S.settings;
  const set = setSetting;
  const editPlates = async () => {
    const v = await promptDialog({
      title: tr('Plates you have ({unit})', { unit: st.unit }), message: tr('Per side, separated by commas.'), value: st.plates.join(', '), ok: tr('Save'),
    });
    if (v === null) return;
    const plates = v.split(/[;\s]+|,(?=\s)|,(?!\d)/).map((x) => parseNum(x)).filter((x) => x && x > 0);
    if (!plates.length) { toast(tr('Enter at least one plate')); return; }
    set('plates', [...new Set(plates)].sort((a, b) => b - a));
  };
  const persisted = S.persisted;
  const changeLanguage = (v) => {
    set('language', v);
    saveLangPref(v);
    flushActive();
    setTimeout(() => location.reload(), 150);
  };
  const setBw = (key, v) => {
    set(key, v);
    if (v && bodyweightAt() === null) toast(tr('Log your body weight in Measure — until then it counts as 0'));
  };
  return html`<${Screen} nav=${{ back: '', title: tr('Settings') }}>
    <h1 class="large-title" style="font-size:28px">${tr('Settings')}</h1>

    <div class="section"><span class="section-title">${tr('Units')}</span></div>
    <div class="group">
      ${[
        [tr('Lifting weight'), 'set-unit', st.unit, (v) => set('unit', v), ['kg', 'lb']],
        [tr('Distance'), 'set-dist', st.distUnit, (v) => set('distUnit', v), ['km', 'mi']],
        [tr('Body weight'), 'set-bodyunit', bwUnit(), (v) => set('bodyUnit', v), ['kg', 'lb']],
        [tr('Body measurements'), 'set-sizeunit', lenUnit(), (v) => set('sizeUnit', v), ['cm', 'in']],
      ].map(([label, id, value, onChange, opts]) => html`<div class="cell" key=${id}><div class="cell-main"><div class="cell-title">${label}</div></div>
        <div style="width:150px"><${Seg} id=${id} value=${value} onChange=${onChange} options=${opts.map((o) => ({ value: o, label: o }))} /></div></div>`)}
    </div>

    <div class="section"><span class="section-title">${tr('Workouts')}</span></div>
    <div class="group">
      <label class="cell"><div class="cell-main"><div class="cell-title">${tr('Default rest timer')}</div><div class="cell-sub">${tr('Per-exercise timers override this')}</div></div>
        <select id="set-rest" value=${String(st.defaultRest)} onChange=${(e) => set('defaultRest', +e.target.value)}>
          ${REST.map((s) => html`<option value=${String(s)}>${s ? fmtClock(s) : tr('Off')}</option>`)}</select></label>
      <div class="cell"><div class="cell-main"><div class="cell-title">${tr('Timer sound')}</div><div class="cell-sub">${tr('Needs the ring/silent switch on ring')}</div></div>
        <${Switch} checked=${st.sound} label=${tr('Timer sound')} onChange=${(v) => { set('sound', v); if (v) { unlockAudio(); beep(); } }} /></div>
      <div class="cell"><div class="cell-main"><div class="cell-title">${tr('Keep screen on')}</div><div class="cell-sub">${tr('While a workout is running, so the timer can signal')}</div></div>
        <${Switch} checked=${st.keepAwake} label=${tr('Keep screen on')} onChange=${(v) => set('keepAwake', v)} /></div>
      <label class="cell"><div class="cell-main"><div class="cell-title">${tr('Previous values')}</div></div>
        <select id="set-prev" value=${st.prevSource || 'any'} onChange=${(e) => set('prevSource', e.target.value)}>
          <option value="any">${tr('Any workout')}</option><option value="template">${tr('Same template')}</option></select></label>
      <${Cell} id="set-warmup" title=${tr('Warm-up sets')} value=${warmupText(st.warmup || DEFAULT_WARMUP)} onClick=${() => openDialog((close) => html`<${WarmupDialog} close=${close} />`)} />
      <div class="cell"><div class="cell-main"><div class="cell-title">${tr('Ask to update templates')}</div><div class="cell-sub">${tr('When a finished workout differs from its template')}</div></div>
        <${Switch} checked=${st.askTemplateUpdate !== false} label=${tr('Ask to update templates')} id="set-ask-template" onChange=${(v) => set('askTemplateUpdate', v)} /></div>
      <div class="cell"><div class="cell-main"><div class="cell-title">${tr('Example templates')}</div></div>
        <${Switch} checked=${st.showExamples !== false} label=${tr('Example templates')} id="set-examples" onChange=${(v) => set('showExamples', v)} /></div>
      <label class="cell"><div class="cell-main"><div class="cell-title">${tr('Weekly goal')}</div></div>
        <select value=${String(st.weeklyGoal)} onChange=${(e) => set('weeklyGoal', +e.target.value)}>
          ${[1, 2, 3, 4, 5, 6, 7].map((n) => html`<option value=${String(n)}>${tr('{n} per week', { n })}</option>`)}</select></label>
      <label class="cell"><div class="cell-main"><div class="cell-title">${tr('Week starts on')}</div></div>
        <select value=${String(st.weekStart)} onChange=${(e) => set('weekStart', +e.target.value)}>
          <option value="1">${tr('Monday')}</option><option value="0">${tr('Sunday')}</option><option value="6">${tr('Saturday')}</option></select></label>
    </div>

    <div class="section"><span class="section-title">${tr('Stats')}</span></div>
    <div class="group">
      <label class="cell"><div class="cell-main"><div class="cell-title">${tr('1RM formula')}</div></div>
        <select id="set-formula" value=${st.formula} onChange=${(e) => set('formula', e.target.value)}>
          ${FORMULAS.map((f) => html`<option value=${f.id}>${f.label}</option>`)}</select></label>
      <div class="cell"><div class="cell-main"><div class="cell-title">${tr('Count dumbbells twice')}</div><div class="cell-sub">${tr('For volume')}</div></div>
        <${Switch} checked=${!!st.dumbbellTwice} label=${tr('Count dumbbells twice')} id="set-db2" onChange=${(v) => set('dumbbellTwice', v)} /></div>
      <div class="cell"><div class="cell-main"><div class="cell-title">${tr('Body weight in volume')}</div><div class="cell-sub">${tr('Weighted bodyweight exercises')}</div></div>
        <${Switch} checked=${!!st.bwWeighted} label=${tr('Body weight in weighted bodyweight volume')} id="set-bw-weighted" onChange=${(v) => setBw('bwWeighted', v)} /></div>
      <div class="cell"><div class="cell-main"><div class="cell-title">${tr('Body weight in volume')}</div><div class="cell-sub">${tr('Assisted bodyweight exercises')}</div></div>
        <${Switch} checked=${!!st.bwAssisted} label=${tr('Body weight in assisted bodyweight volume')} id="set-bw-assisted" onChange=${(v) => setBw('bwAssisted', v)} /></div>
      <${Cell} id="set-history-start" title=${tr('Start history from')} value=${st.historyStart ? fmt.short(st.historyStart) : tr('All workouts')}
        onClick=${() => openDialog((close) => html`<${HistoryStartDialog} close=${close} />`)} />
    </div>

    <div class="section"><span class="section-title">${tr('Plates')}</span></div>
    <div class="group">
      <label class="cell"><div class="cell-main"><div class="cell-title">${tr('Bar weight')}</div></div>
        <select value=${String(st.bar)} onChange=${(e) => set('bar', parseFloat(e.target.value))}>
          ${(st.unit === 'lb' ? [45, 35, 33, 25, 15] : [20, 15, 10, 7.5]).concat(st.bar).filter((x, i, a) => a.indexOf(x) === i)
            .map((b) => html`<option value=${String(b)}>${fmtNum(b, 2)} ${st.unit}</option>`)}</select></label>
      <${Cell} title=${tr('Available plates')} value=${st.plates.map((p) => fmtNum(p, 2)).join(', ')} onClick=${editPlates} />
    </div>

    <div class="section"><span class="section-title">${tr('Appearance')}</span></div>
    <div class="group"><div class="cell"><div class="cell-main"><div class="cell-title">${tr('Theme')}</div></div>
      <div style="width:210px"><${Seg} value=${st.theme} onChange=${(v) => set('theme', v)}
        options=${[{ value: 'system', label: tr('Auto') }, { value: 'light', label: tr('Light') }, { value: 'dark', label: tr('Dark') }]} /></div></div>
      <label class="cell"><div class="cell-main"><div class="cell-title">${tr('Language')}</div></div>
        <select id="set-language" value=${getLangPref()} onChange=${(e) => changeLanguage(e.target.value)}>
          <option value="auto">${tr('Phone language')}</option><option value="en">English</option><option value="de">Deutsch</option></select></label></div>

    <div class="section"><span class="section-title">${tr('Your data')}</span></div>
    <div class="group">
      <${Cell} icon="upload" id="backup-now" title=${tr('Back up now')} sub=${S.meta.lastBackupAt ? tr('Last backup {when}', { when: relDayLower(S.meta.lastBackupAt) }) : tr('No backup yet')} onClick=${doBackup} />
      <${Cell} icon="download" id="restore" title=${tr('Restore from backup')} onClick=${doRestore} />
      <${Cell} icon="swap" id="strong-import" title=${tr('Import from Strong')} sub=${tr('In Strong: Settings → Export Workouts, then pick that CSV here')} onClick=${doStrongImport} />
      <${Cell} icon="share" id="export-csv" title=${tr('Export as CSV')} sub=${tr('Spreadsheet-friendly, Strong column format')} onClick=${doExportCSV} />
      <div class="cell"><div class="cell-icon"><${Icon} name="shield" /></div>
        <div class="cell-main"><div class="cell-title">${tr('Storage')}</div>
          <div class="cell-sub">${S.storage !== 'ok' ? tr('Unavailable — nothing is being saved') : persisted ? tr('Protected from automatic clean-up') : tr('The system may clear it if space runs low')}</div></div>
        ${S.storage === 'ok' && !persisted && html`<button class="btn btn-sm btn-tinted" onClick=${() => checkPersisted(true)}>${tr('Protect')}</button>`}</div>
    </div>
    <p class="footnote">${tr('Everything stays on this device. Nothing is uploaded anywhere — back up regularly and keep the file in iCloud Drive or another safe place.')}</p>

    <div class="group" style="margin-top:18px">
      <${Cell} title=${tr('Delete all data')} danger onClick=${doDeleteAll} />
    </div>

    <p class="footnote center" style="margin-top:22px">Setlog ${APP_VERSION} · ${tr('{n} stored', { n: plural(S.workouts.length, 'workout') })}</p>
  <//>`;
}
