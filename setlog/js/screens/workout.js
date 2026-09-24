// Workout tab: quick start, templates (own + examples), template editor.
import { html, useState, useRef } from '../lib.js';
import { Icon } from '../icons.js';
import {
  S, useStore, getTemplate, saveTemplate, deleteTemplate, copyTemplate, templateFolders, getWorkout,
} from '../store.js';
import { EXAMPLE_TEMPLATES } from '../seed.js';
import { WorkoutEditor } from '../editor.js';
import { beginWorkout } from '../sheet.js';
import { entryToDraft, draftEntries, remapSupersets } from '../drafts.js';
import {
  Screen, openSheet, openScreenModal, NavBar, actionSheet, confirmDialog, toast, push, pop, useForce, promptDialog,
} from '../ui.js';
import {
  relDay, fmtClock, uid, fmt,
} from '../util.js';
import { setText } from '../format.js';

function lastUsed(t) {
  let at = t.lastUsedAt || 0;
  if (!at) for (const w of S.workouts) if (w.templateId === t.id) { at = w.startedAt; break; }
  return at;
}

function TemplateCard({ t, onOpen }) {
  const lines = t.exercises.filter((e) => S.exercises.has(e.exerciseId));
  const at = t.example ? 0 : lastUsed(t);
  return html`<button class="tpl-card" onClick=${onOpen}>
    <div class="name">${t.name}</div>
    <div class="lines">
      ${lines.slice(0, 4).map((e, i) => html`<div key=${i}>${e.sets.length} × ${S.exercises.get(e.exerciseId).name}</div>`)}
      ${lines.length > 4 && html`<div class="muted">+ ${lines.length - 4} more</div>`}
      ${!lines.length && html`<div class="muted">No exercises</div>`}
    </div>
    ${!t.example && html`<div class="when"><${Icon} name="clock" />${at ? relDay(at) : 'Not done yet'}</div>`}
  </button>`;
}

export function WorkoutTab() {
  useStore('templates', 'active', 'exercises', 'workouts');
  const [closed, setClosed] = useState({});
  const folders = new Map();
  for (const t of [...S.templates].sort((a, b) => a.name.localeCompare(b.name))) {
    const f = t.folder || '';
    if (!folders.has(f)) folders.set(f, []);
    folders.get(f).push(t);
  }
  const order = [...folders.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  const a = S.active;

  const newTemplate = () => push('template-edit', {});
  return html`<${Screen} large="Start workout">
    ${a ? html`<div class="start-card">
      <div class="row"><span class="mini-bar-dot" style="width:8px;height:8px;border-radius:50%;background:var(--done)"></span>
        <strong class="grow ellipsis">${a.name}</strong><span class="muted small">since ${fmt.time(a.startedAt)}</span></div>
      <button class="btn btn-done btn-block btn-lg" id="resume-workout" onClick=${openSheet}><${Icon} name="play" />Resume workout</button>
    </div>` : html`<div class="start-card">
      <button class="btn btn-primary btn-block btn-lg" id="start-empty" onClick=${() => beginWorkout()}><${Icon} name="plus" />Start an empty workout</button>
      <div class="hint">Or pick a template below — your last numbers fill in automatically.</div>
    </div>`}

    <div class="section"><h2>Templates</h2>
      <button class="link-btn" id="new-template" onClick=${newTemplate}><span class="row" style="gap:4px"><${Icon} name="plus" size=${18} />Template</span></button></div>
    ${!S.templates.length && html`<p class="footnote" style="margin-top:0">Save the workouts you repeat as templates. Start from an example, or finish a workout and tap “Save as template” in History.</p>`}
    ${order.map((f) => html`<div key=${'f' + f}>
      ${(f || order.length > 1) && html`<div class="folder-head"><button class=${closed[f] ? 'closed' : ''}
        onClick=${() => setClosed({ ...closed, [f]: !closed[f] })}><${Icon} name="chevronDown" />${f || 'My templates'}
        <span class="muted small">(${folders.get(f).length})</span></button></div>`}
      ${!closed[f] && html`<div class="tpl-grid">${folders.get(f).map((t) => html`<${TemplateCard} key=${t.id} t=${t} onOpen=${() => previewTemplate(t)} />`)}</div>`}
    </div>`)}

    <div class="section"><h2>Examples</h2></div>
    <div class="tpl-grid">${EXAMPLE_TEMPLATES.map((t) => html`<${TemplateCard} key=${t.id} t=${t} onOpen=${() => previewTemplate(t)} />`)}</div>
  <//>`;
}

export function previewTemplate(t) {
  return openScreenModal((close) => html`<${TemplatePreview} t=${t} close=${close} />`);
}

function TemplatePreview({ t, close }) {
  useStore('templates');
  const cur = t.example ? t : getTemplate(t.id);
  if (!cur) { setTimeout(close, 0); return null; }
  const start = () => { close(); beginWorkout({ template: cur }); };
  const menu = async () => {
    const c = await actionSheet({
      title: cur.name,
      actions: [
        { label: 'Edit template', value: 'edit', icon: 'edit' },
        { label: 'Rename', value: 'rename', icon: 'edit' },
        { label: 'Duplicate', value: 'dup', icon: 'copy' },
        { label: 'Move to folder', value: 'folder', icon: 'folder' },
        { label: 'Delete template', value: 'delete', destructive: true, icon: 'trash' },
      ],
    });
    if (c === 'edit') { close(); push('template-edit', { id: cur.id }); }
    if (c === 'rename') {
      const v = await promptDialog({ title: 'Rename template', value: cur.name });
      if (v && v.trim()) { cur.name = v.trim(); saveTemplate(cur); }
    }
    if (c === 'dup') { copyTemplate(cur, { name: `${cur.name} (copy)` }); toast('Template duplicated'); }
    if (c === 'folder') {
      const folders = templateFolders();
      const f = await actionSheet({
        title: 'Move to folder',
        actions: [{ label: 'No folder', value: '__none', checked: !cur.folder },
          ...folders.map((x) => ({ label: x, value: x, checked: cur.folder === x })),
          { label: 'New folder…', value: '__new' }],
      });
      if (!f) return;
      let folder = f;
      if (f === '__none') folder = '';
      if (f === '__new') { folder = (await promptDialog({ title: 'New folder', placeholder: 'e.g. Upper / Lower' })) || ''; folder = folder.trim(); if (!folder) return; }
      cur.folder = folder; saveTemplate(cur);
    }
    if (c === 'delete') {
      const ok = await confirmDialog({ title: `Delete “${cur.name}”?`, message: 'Past workouts stay in your history.', ok: 'Delete', destructive: true });
      if (ok) { deleteTemplate(cur.id); close(); toast('Template deleted'); }
    }
  };
  const saveExample = () => {
    const copy = copyTemplate(cur, { name: cur.name, folder: cur.folder || '' });
    toast(`“${copy.name}” added to your templates`);
    close();
  };
  const at = cur.example ? 0 : lastUsed(cur);
  return html`<${NavBar} title=${cur.name} solid
      left=${html`<button class="nav-btn" onClick=${() => close()}>Close</button>`}
      right=${cur.example ? null : html`<button class="nav-btn" onClick=${menu} aria-label="Template options"><${Icon} name="more" /></button>`} />
    <div class="scroll"><div class="page stack" style="padding-top:12px">
      <div class="muted small">${cur.example ? `Example · ${cur.folder}` : [cur.folder, at ? `Last done ${relDay(at).toLowerCase()}` : 'Not done yet'].filter(Boolean).join(' · ')}</div>
      ${cur.notes && html`<div class="card small ink2">${cur.notes}</div>`}
      <div class="group">${cur.exercises.filter((e) => S.exercises.has(e.exerciseId)).map((e, i) => {
        const ex = S.exercises.get(e.exerciseId);
        const targets = e.sets.map((s) => (s.w || s.r || s.t || s.d ? setText(s, ex.category, { short: true }) : null)).filter(Boolean);
        return html`<div class="cell" key=${i}>
          <div class="cell-main"><div class="cell-title">${ex.name}</div>
            <div class="cell-sub">${e.sets.length} set${e.sets.length === 1 ? '' : 's'}${targets.length ? ' · ' + [...new Set(targets)].join(', ') : ''}${e.restSec ? ` · rest ${fmtClock(e.restSec)}` : ''}</div></div>
        </div>`;
      })}</div>
    </div></div>
    <div class="bottom-bar stack" style="gap:8px">
      <button class="btn btn-primary btn-block btn-lg" id="start-template" onClick=${start}><${Icon} name="play" />Start workout</button>
      ${cur.example && html`<button class="btn btn-tinted btn-block" onClick=${saveExample}>Add to my templates</button>`}
    </div>`;
}

// ---------- template editor (pushed screen) ----------
export function TemplateEditScreen({ id = null, fromWorkoutId = null }) {
  useStore('exercises');
  const force = useForce();
  const dirty = useRef(false);
  const [draft] = useState(() => {
    const st = S.settings;
    const src = id ? getTemplate(id) : fromWorkoutId ? getWorkout(fromWorkoutId) : null;
    return {
      kind: 'template',
      id: id || uid(),
      name: src?.name || '',
      folder: (id && src?.folder) || '',
      notes: (id && src?.notes) || '',
      exercises: src ? remapSupersets(src.exercises.filter((e) => S.exercises.has(e.exerciseId))
        .map((e) => entryToDraft({ ...e, notes: id ? e.notes : '' }, st))) : [],
    };
  });
  const onChange = () => { dirty.current = true; force(); };
  const folders = templateFolders();
  const save = () => {
    const name = draft.name.trim();
    if (!name) { toast('Give the template a name'); document.getElementById('tpl-name')?.focus(); return; }
    if (!draft.exercises.length) { toast('Add at least one exercise'); return; }
    const existing = id ? getTemplate(id) : null;
    const t = {
      ...(existing || { createdAt: Date.now() }),
      id: draft.id,
      name,
      folder: draft.folder.trim(),
      notes: draft.notes.trim(),
      exercises: draftEntries(draft, S.settings, S.exercises, { keepEmpty: true }).map((e) => ({
        exerciseId: e.exerciseId, notes: e.notes, supersetId: e.supersetId, restSec: e.restSec,
        sets: e.sets.map(({ id: _id, ...rest }) => rest),
      })),
    };
    saveTemplate(t);
    toast(id ? 'Template saved' : `“${name}” created`);
    pop();
  };
  const cancel = async () => {
    if (dirty.current) {
      const ok = await confirmDialog({ title: 'Discard changes?', ok: 'Discard', cancel: 'Keep editing', destructive: true });
      if (!ok) return;
    }
    pop();
  };
  const header = html`<div class="stack" style="gap:10px;margin-top:8px">
    <input class="wo-name" id="tpl-name" placeholder="Template name" value=${draft.name} aria-label="Template name"
      onInput=${(e) => { draft.name = e.target.value; dirty.current = true; }} />
    <div class="row">
      <input class="input" list="tpl-folders" placeholder="Folder (optional)" value=${draft.folder} aria-label="Folder"
        onInput=${(e) => { draft.folder = e.target.value; dirty.current = true; }} />
      <datalist id="tpl-folders">${folders.map((f) => html`<option value=${f}></option>`)}</datalist>
    </div>
    <textarea class="textarea" placeholder="Notes (optional)" value=${draft.notes} style="min-height:48px"
      onInput=${(e) => { draft.notes = e.target.value; dirty.current = true; }}></textarea>
  </div>`;
  return html`<${Screen} nav=${{
    title: id ? 'Edit template' : 'New template',
    left: html`<button class="nav-btn" onClick=${cancel}>Cancel</button>`,
    right: html`<button class="nav-btn strong" id="template-save" onClick=${save}>Save</button>`,
  }}>
    <${WorkoutEditor} draft=${draft} mode="template" onChange=${onChange} header=${header} />
    <p class="footnote">Numbers you enter here are targets. When you start the template, your actual numbers from last time take priority.</p>
  <//>`;
}
