// Profile tab (dashboard) and Settings, including all data management.
import { html, useState } from '../lib.js';
import { Icon } from '../icons.js';
import {
  S, useStore, stats, setSetting, setProfile, setMeta, importBatch, replaceAllData, checkPersisted, APP_VERSION,
  isPreview, hasSampleData, clearSampleData,
} from '../store.js';
import { PR_LABEL, workoutVolume } from '../calc.js';
import { BarChart } from '../charts.js';
import {
  Screen, push, openDialog, confirmDialog, promptDialog, toast, Seg, Switch, Cell,
} from '../ui.js';
import {
  fmt, fmtNum, plural, isIOS, isStandalone, DAY, fmtClock, relDay, parseNum,
} from '../util.js';
import { metricValue, volume } from '../format.js';
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
    const v = await promptDialog({ title: 'Your name', value: name, placeholder: 'Name' });
    if (v !== null) setProfile({ name: v.trim() });
  };
  return html`<${Screen} large=${name || 'Profile'} nav=${{
    right: html`<button class="nav-btn" id="open-settings" onClick=${() => push('settings')} aria-label="Settings"><${Icon} name="gear" /></button>`,
  }}>
    ${!name && html`<button class="link-btn" style="margin:-6px 0 10px" onClick=${editName}>Add your name</button>`}
    <div class="stack">
      ${S.storage !== 'ok' && html`<div class="banner warn"><${Icon} name="warn" /><div><strong>Storage is unavailable.</strong>
        This browser blocked on-device storage (private mode?), so nothing you log will be kept.</div></div>`}
      ${isPreview() && html`<div class="banner warn"><${Icon} name="info" /><div>
        <strong>Preview with sample workouts.</strong> Everything here stays in this browser only and backups are blocked,
        so don’t log real training in the preview. For real use, host the app and add it to your Home Screen.
        ${hasSampleData() && html`<div class="actions"><button class="link-btn" onClick=${() => { clearSampleData(); toast('Sample data cleared'); }}>Clear sample data</button></div>`}
      </div></div>`}
      ${showInstall && html`<${InstallBanner} />`}
      ${needsBackup && html`<div class="banner info"><${Icon} name="shield" /><div>
        <strong>Back up your training log.</strong> It lives only on this phone — a backup file in iCloud Drive protects it if the phone is lost or reset.
        <div class="actions"><button class="link-btn" onClick=${doBackup}>Back up now</button>
        <button class="link-btn" style="color:var(--ink-3)" onClick=${() => setMeta({ backupSnoozedAt: Date.now() })}>Later</button></div></div></div>`}

      <div class="tiles">
        <div class="tile"><div class="k">Workouts</div><div class="v">${fmtNum(ws.length, 0)}</div><div class="d">all time</div></div>
        <div class="tile"><div class="k">This week</div><div class="v">${thisWeek}<span class="muted" style="font-size:16px">/${goal}</span></div>
          <div class="d">${thisWeek >= goal ? 'goal reached' : `${goal - thisWeek} to go`}</div></div>
        <div class="tile"><div class="k">Streak</div><div class="v">${streak}</div><div class="d">${streak === 1 ? 'week' : 'weeks'} on goal</div></div>
      </div>

      <div class="card">
        <div class="card-title">Workouts per week</div>
        <div class="card-sub">Last 12 weeks · goal ${goal} per week${monthVol ? ` · ${volume(monthVol)} lifted in 30 days` : ''}</div>
        <${BarChart} bars=${weeks.map((w) => ({ label: fmt.dayMonth(w.start), value: w.value, title: `Week of ${fmt.dayMonth(w.start)}` }))}
          goal=${goal} fmtVal=${(v) => String(v)} label="Workouts per week" />
      </div>

      ${recentPrs.length > 0 && html`<div><div class="section"><span class="section-title">Records in the last 30 days</span></div>
        <div class="group pr-list">${recentPrs.slice(0, 8).map((p, i) => {
          const kind = ['e1rm', 'weight', 'volume'].includes(p.metric) ? 'weight' : p.metric === 'reps' ? 'count' : p.metric;
          return html`<button class="cell" key=${i} onClick=${() => push('exercise', { id: p.exerciseId })}>
            <span class="trophy"><${Icon} name="trophy" size=${20} /></span>
            <div class="cell-main"><div class="cell-title">${S.exercises.get(p.exerciseId)?.name}</div>
              <div class="cell-sub">${PR_LABEL[p.metric]} · ${relDay(p.at)}</div></div>
            <div class="cell-value">${metricValue(kind, p.value)}</div></button>`;
        })}</div></div>`}

      <div><div class="section"><span class="section-title">Tools</span></div>
        <div class="group">
          <${Cell} icon="plate" title="Plate calculator" onClick=${() => openTools({ tab: 'plates' })} />
          <${Cell} icon="calc" title="1RM calculator" onClick=${() => openTools({ tab: 'rm' })} />
          <${Cell} icon="gear" title="Settings & data" sub="Units, rest timer, backup, Strong import" onClick=${() => push('settings')} />
        </div></div>
    </div>
  <//>`;
}

function InstallBanner() {
  const ios = isIOS();
  return html`<div class="banner info"><${Icon} name="download" /><div>
    <strong>Install Setlog on your Home Screen</strong>
    ${ios ? html`<ol class="install-steps"><li>Tap <strong>Share</strong> in Safari’s toolbar</li><li>Choose <strong>Add to Home Screen</strong></li><li>Open Setlog from the new icon</li></ol>
      <div class="small" style="margin-top:4px">The installed app keeps its own storage — log your workouts there, not in this Safari tab.</div>`
      : html`<div class="small">Use your browser’s “Install app” or “Add to Home Screen” option so it opens full-screen and works offline.</div>`}
    <div class="actions"><button class="link-btn" style="color:var(--ink-3)" onClick=${() => setMeta({ installHintDismissed: true })}>Dismiss</button></div>
  </div></div>`;
}

// ---------- data actions ----------
export async function doBackup() {
  let r;
  try { r = await saveFile(`setlog-backup-${dateStamp()}.json`, backupJSON(), 'application/json'); } catch (e) { toast(e.message); return; }
  if (r !== 'cancelled') { setMeta({ lastBackupAt: Date.now() }); toast(r === 'shared' ? 'Backup ready' : 'Backup downloaded'); }
}

async function doExportCSV() {
  let r;
  try { r = await saveFile(`setlog-workouts-${dateStamp()}.csv`, exportCSV(), 'text/csv'); } catch (e) { toast(e.message); return; }
  if (r !== 'cancelled') toast('CSV exported');
}

async function doRestore() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let parsed;
  try { parsed = parseBackup(f.text); } catch (e) { toast(e.message); return; }
  const d = parsed.data;
  const ok = await confirmDialog({
    title: 'Replace all data?',
    message: `The backup${parsed.exportedAt ? ` from ${fmt.short(new Date(parsed.exportedAt).getTime())}` : ''} has ${plural(d.workouts.length, 'workout')}, ${plural(d.templates.length, 'template')} and ${plural(d.measurements.length, 'measurement')}. Everything currently in the app is replaced.`,
    ok: 'Replace', destructive: true,
  });
  if (!ok) return;
  await replaceAllData(d);
  toast('Backup restored');
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
  if (!s.workouts) {
    toast(s.duplicates ? `All ${plural(s.duplicates, 'workout')} are already imported` : 'No workouts found in this file');
    return;
  }
  const ok = await openDialog((close) => html`<${ImportPreview} close=${close} s=${s} />`);
  if (!ok) return;
  await importBatch({ exercises: res.exercises, workouts: res.workouts });
  toast(`Imported ${plural(s.workouts, 'workout')}`);
}

function UnitDialog({ close, initial }) {
  const [w, setW] = useState(initial.weightUnit);
  const [d, setD] = useState(initial.distUnit);
  return html`<div class="dialog">
    <h3>Which units did Strong use?</h3>
    <p>Strong’s export doesn’t say, so pick what the app was set to.</p>
    <${Seg} value=${w} onChange=${setW} options=${[{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }]} />
    <${Seg} value=${d} onChange=${setD} options=${[{ value: 'km', label: 'Kilometres' }, { value: 'mi', label: 'Miles' }]} />
    <div class="btns two"><button class="btn" onClick=${() => close(null)}>Cancel</button>
      <button class="btn btn-primary" id="units-ok" onClick=${() => close({ weightUnit: w, distUnit: d })}>Continue</button></div>
  </div>`;
}

function ImportPreview({ close, s }) {
  return html`<div class="dialog">
    <h3>Import ${plural(s.workouts, 'workout')}?</h3>
    <p>${plural(s.sets, 'set')} from ${fmt.short(s.first)} to ${fmt.short(s.last)}.</p>
    ${s.duplicates > 0 && html`<p class="small">${plural(s.duplicates, 'workout')} already in Setlog will be skipped.</p>`}
    ${s.newExercises.length > 0 && html`<div class="card small" style="background:var(--surface-2)">
      <strong>${plural(s.newExercises.length, 'new exercise')}</strong> will be created:
      <div class="muted" style="margin-top:4px">${s.newExercises.slice(0, 8).join(', ')}${s.newExercises.length > 8 ? ` and ${s.newExercises.length - 8} more` : ''}</div>
      <div class="muted" style="margin-top:6px">Tip: if one is the same as a built-in exercise, use “Merge into…” on its page afterwards.</div>
    </div>`}
    <div class="btns two"><button class="btn" onClick=${() => close(false)}>Cancel</button>
      <button class="btn btn-primary" id="import-ok" onClick=${() => close(true)}>Import</button></div>
  </div>`;
}

async function doDeleteAll() {
  const ok = await confirmDialog({
    title: 'Delete all data?',
    message: 'Every workout, template, measurement and custom exercise on this phone will be erased.',
    ok: 'Continue', destructive: true,
  });
  if (!ok) return;
  const v = await promptDialog({ title: 'Type DELETE to confirm', placeholder: 'DELETE', ok: 'Delete everything' });
  if ((v || '').trim().toUpperCase() !== 'DELETE') { if (v !== null) toast('Nothing was deleted'); return; }
  await replaceAllData({ exercises: [], workouts: [], templates: [], measurements: [], kv: {} });
  toast('All data deleted');
}

// ---------- settings ----------
const REST = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

export function SettingsScreen() {
  useStore('settings', 'meta', 'workouts');
  const st = S.settings;
  const set = setSetting;
  const editPlates = async () => {
    const v = await promptDialog({
      title: `Plates you have (${st.unit})`, message: 'Per side, separated by commas.', value: st.plates.join(', '), ok: 'Save',
    });
    if (v === null) return;
    const plates = v.split(/[;\s]+|,(?=\s)|,(?!\d)/).map((x) => parseNum(x)).filter((x) => x && x > 0);
    if (!plates.length) { toast('Enter at least one plate'); return; }
    set('plates', [...new Set(plates)].sort((a, b) => b - a));
  };
  const persisted = S.persisted;
  return html`<${Screen} nav=${{ back: '', title: 'Settings' }}>
    <h1 class="large-title" style="font-size:28px">Settings</h1>

    <div class="section"><span class="section-title">Units</span></div>
    <div class="group">
      <div class="cell"><div class="cell-main"><div class="cell-title">Weight</div></div>
        <div style="width:150px"><${Seg} id="set-unit" value=${st.unit} onChange=${(v) => set('unit', v)} options=${[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} /></div></div>
      <div class="cell"><div class="cell-main"><div class="cell-title">Distance</div></div>
        <div style="width:150px"><${Seg} value=${st.distUnit} onChange=${(v) => set('distUnit', v)} options=${[{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }]} /></div></div>
    </div>

    <div class="section"><span class="section-title">Workouts</span></div>
    <div class="group">
      <label class="cell"><div class="cell-main"><div class="cell-title">Default rest timer</div><div class="cell-sub">Per-exercise timers override this</div></div>
        <select id="set-rest" value=${String(st.defaultRest)} onChange=${(e) => set('defaultRest', +e.target.value)}>
          ${REST.map((s) => html`<option value=${String(s)}>${s ? fmtClock(s) : 'Off'}</option>`)}</select></label>
      <div class="cell"><div class="cell-main"><div class="cell-title">Timer sound</div><div class="cell-sub">Needs the ring/silent switch on ring</div></div>
        <${Switch} checked=${st.sound} label="Timer sound" onChange=${(v) => { set('sound', v); if (v) { unlockAudio(); beep(); } }} /></div>
      <div class="cell"><div class="cell-main"><div class="cell-title">Keep screen on</div><div class="cell-sub">While a workout is running, so the timer can signal</div></div>
        <${Switch} checked=${st.keepAwake} label="Keep screen on" onChange=${(v) => set('keepAwake', v)} /></div>
      <label class="cell"><div class="cell-main"><div class="cell-title">Weekly goal</div></div>
        <select value=${String(st.weeklyGoal)} onChange=${(e) => set('weeklyGoal', +e.target.value)}>
          ${[1, 2, 3, 4, 5, 6, 7].map((n) => html`<option value=${String(n)}>${n} per week</option>`)}</select></label>
      <label class="cell"><div class="cell-main"><div class="cell-title">Week starts on</div></div>
        <select value=${String(st.weekStart)} onChange=${(e) => set('weekStart', +e.target.value)}>
          <option value="1">Monday</option><option value="0">Sunday</option><option value="6">Saturday</option></select></label>
      <label class="cell"><div class="cell-main"><div class="cell-title">1RM formula</div></div>
        <select value=${st.formula} onChange=${(e) => set('formula', e.target.value)}>
          <option value="epley">Epley</option><option value="brzycki">Brzycki</option></select></label>
    </div>

    <div class="section"><span class="section-title">Plates</span></div>
    <div class="group">
      <label class="cell"><div class="cell-main"><div class="cell-title">Bar weight</div></div>
        <select value=${String(st.bar)} onChange=${(e) => set('bar', parseFloat(e.target.value))}>
          ${(st.unit === 'lb' ? [45, 35, 33, 25, 15] : [20, 15, 10, 7.5]).concat(st.bar).filter((x, i, a) => a.indexOf(x) === i)
            .map((b) => html`<option value=${String(b)}>${fmtNum(b, 2)} ${st.unit}</option>`)}</select></label>
      <${Cell} title="Available plates" value=${st.plates.map((p) => fmtNum(p, 2)).join(', ')} onClick=${editPlates} />
    </div>

    <div class="section"><span class="section-title">Appearance</span></div>
    <div class="group"><div class="cell"><div class="cell-main"><div class="cell-title">Theme</div></div>
      <div style="width:210px"><${Seg} value=${st.theme} onChange=${(v) => set('theme', v)}
        options=${[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div></div></div>

    <div class="section"><span class="section-title">Your data</span></div>
    <div class="group">
      <${Cell} icon="upload" id="backup-now" title="Back up now" sub=${S.meta.lastBackupAt ? `Last backup ${relDay(S.meta.lastBackupAt).toLowerCase()}` : 'No backup yet'} onClick=${doBackup} />
      <${Cell} icon="download" id="restore" title="Restore from backup" onClick=${doRestore} />
      <${Cell} icon="swap" id="strong-import" title="Import from Strong" sub="In Strong: Settings → Export Workouts, then pick that CSV here" onClick=${doStrongImport} />
      <${Cell} icon="share" id="export-csv" title="Export as CSV" sub="Spreadsheet-friendly, Strong column format" onClick=${doExportCSV} />
      <div class="cell"><div class="cell-icon"><${Icon} name="shield" /></div>
        <div class="cell-main"><div class="cell-title">Storage</div>
          <div class="cell-sub">${S.storage !== 'ok' ? 'Unavailable — nothing is being saved' : persisted ? 'Protected from automatic clean-up' : 'The system may clear it if space runs low'}</div></div>
        ${S.storage === 'ok' && !persisted && html`<button class="btn btn-sm btn-tinted" onClick=${() => checkPersisted(true)}>Protect</button>`}</div>
    </div>
    <p class="footnote">Everything stays on this device. Nothing is uploaded anywhere — back up regularly and keep the file in iCloud Drive or another safe place.</p>

    <div class="group" style="margin-top:18px">
      <${Cell} title="Delete all data" danger onClick=${doDeleteAll} />
    </div>

    <p class="footnote center" style="margin-top:22px">Setlog ${APP_VERSION} · ${plural(S.workouts.length, 'workout')} stored</p>
  <//>`;
}
