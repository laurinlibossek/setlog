// Workout tab: quick start, templates (own + examples), template editor.
import { html, useState, useRef } from '../lib.js';
import { Icon } from '../icons.js';
import {
  S, useStore, setSetting, getTemplate, saveTemplate, deleteTemplate, copyTemplate, templateFolders, getWorkout,
  addFolder, renameFolder, removeFolder, setTemplateArchived,
} from '../store.js';
import { EXAMPLE_TEMPLATES } from '../seed.js';
import { WorkoutEditor } from '../editor.js';
import { beginWorkout } from '../sheet.js';
import { entryToDraft, draftEntries, remapSupersets } from '../drafts.js';
import {
  Screen, openSheet, openScreenModal, NavBar, actionSheet, confirmDialog, toast, push, pop, useForce, promptDialog,
  closeAllModals, setTab,
} from '../ui.js';
import {
  relDay, fmtClock, uid, fmt, plural, isIOS, isStandalone,
} from '../util.js';
import {
  shareText, templateShareText, parseSharedTemplate, addSharedTemplate,
} from '../io.js';
import { setText } from '../format.js';

function lastUsed(t) {
  let at = t.lastUsedAt || 0;
  if (!at) for (const w of S.workouts) if (w.templateId === t.id) { at = w.startedAt; break; }
  return at;
}

function TemplateCard({ t, onOpen, onMenu }) {
  const lines = t.exercises.filter((e) => S.exercises.has(e.exerciseId));
  const at = t.example ? 0 : lastUsed(t);
  return html`<div class="tpl-card-wrap">
    <button class="tpl-card" onClick=${onOpen}>
      <div class="name">${t.name}</div>
      <div class="lines">
        ${lines.slice(0, 4).map((e, i) => html`<div key=${i}>${e.sets.length} × ${S.exercises.get(e.exerciseId).name}</div>`)}
        ${lines.length > 4 && html`<div class="muted">+ ${lines.length - 4} more</div>`}
        ${!lines.length && html`<div class="muted">No exercises</div>`}
      </div>
      ${!t.example && html`<div class="when"><${Icon} name="clock" />${at ? relDay(at) : 'Not done yet'}</div>`}
    </button>
    ${onMenu && html`<button class="tpl-more" onClick=${onMenu} aria-label=${`Options for ${t.name}`}><${Icon} name="more" /></button>`}
  </div>`;
}

// ---------- template actions (card ⋯ and the preview's ⋯) ----------
async function moveToFolder(t) {
  const folders = templateFolders();
  const f = await actionSheet({
    title: 'Move to folder',
    actions: [{ label: 'No folder', value: '__none', checked: !t.folder },
      ...folders.map((x) => ({ label: x, value: x, checked: t.folder === x })),
      { label: 'New folder…', value: '__new' }],
  });
  if (!f) return;
  let folder = f;
  if (f === '__none') folder = '';
  if (f === '__new') {
    folder = ((await promptDialog({ title: 'New folder', placeholder: 'e.g. Upper / Lower', ok: 'Create' })) || '').trim();
    if (!folder) return;
  }
  t.folder = folder;
  saveTemplate(t);
}

export async function shareTemplate(t) {
  const r = await shareText(templateShareText(t), t.name);
  if (r === 'copied') toast('Template link copied');
  else if (r === 'failed') toast('Couldn’t share the template');
}

/** The template menu. Returns 'deleted' when the template is gone. */
export async function templateMenu(t) {
  const c = await actionSheet({
    title: t.name,
    actions: [
      { label: 'Edit template', value: 'edit', icon: 'edit' },
      { label: 'Rename', value: 'rename', icon: 'edit' },
      { label: 'Duplicate', value: 'dup', icon: 'copy' },
      { label: 'Move to folder', value: 'folder', icon: 'folder' },
      { label: t.archived ? 'Unarchive' : 'Archive', value: 'archive', icon: 'archive' },
      { label: 'Share', value: 'share', icon: 'share' },
      { label: 'Delete template', value: 'delete', destructive: true, icon: 'trash' },
    ],
  });
  if (c === 'edit') { closeAllModals(); push('template-edit', { id: t.id }); }
  if (c === 'rename') {
    const v = await promptDialog({ title: 'Rename template', value: t.name });
    if (v && v.trim()) { t.name = v.trim(); saveTemplate(t); }
  }
  if (c === 'dup') { copyTemplate(t, { name: `${t.name} (copy)` }); toast('Template duplicated'); }
  if (c === 'folder') await moveToFolder(t);
  if (c === 'archive') {
    const archived = !t.archived;
    setTemplateArchived(t.id, archived);
    toast(archived ? `“${t.name}” archived` : `“${t.name}” is back in your templates`, archived
      ? { action: { label: 'Undo', fn: () => setTemplateArchived(t.id, false) } } : {});
  }
  if (c === 'share') await shareTemplate(t);
  if (c === 'delete') {
    const ok = await confirmDialog({ title: `Delete “${t.name}”?`, message: 'Past workouts stay in your history.', ok: 'Delete', destructive: true });
    if (ok) { deleteTemplate(t.id); toast('Template deleted'); return 'deleted'; }
  }
  return c;
}

async function folderMenu(name, count) {
  const c = await actionSheet({
    title: name,
    actions: [
      { label: 'Rename folder', value: 'rename', icon: 'edit' },
      { label: 'Remove folder', value: 'remove', destructive: true, icon: 'trash' },
    ],
  });
  if (c === 'rename') {
    const v = await promptDialog({ title: 'Rename folder', value: name });
    if (v && v.trim() && v.trim() !== name) {
      if (templateFolders().includes(v.trim())) { toast('A folder with that name already exists'); return; }
      renameFolder(name, v.trim());
    }
  }
  if (c === 'remove') {
    const ok = !count || await confirmDialog({
      title: `Remove “${name}”?`,
      message: `Its ${plural(count, 'template')} move${count === 1 ? 's' : ''} to My templates. Nothing is deleted.`,
      ok: 'Remove folder',
    });
    if (ok) removeFolder(name);
  }
}

async function newFolder() {
  const v = ((await promptDialog({ title: 'New folder', placeholder: 'e.g. Upper / Lower', ok: 'Create' })) || '').trim();
  if (!v) return;
  if (!addFolder(v)) { toast('A folder with that name already exists'); return; }
  toast(`Folder “${v}” created — use ⋯ → Move to folder on a template`);
}

async function templatesMenu() {
  const sort = S.settings.templateSort || 'name';
  const showExamples = S.settings.showExamples !== false;
  const c = await actionSheet({
    title: 'Templates',
    actions: [
      { label: 'Sort by name', value: 'sort-name', checked: sort === 'name' },
      { label: 'Sort by last used', value: 'sort-recent', checked: sort === 'recent' },
      { label: 'New folder', value: 'folder', icon: 'folder' },
      { label: 'Add shared template', value: 'shared', icon: 'download' },
      { label: showExamples ? 'Hide examples' : 'Show examples', value: 'examples', icon: 'list' },
    ],
  });
  if (c === 'sort-name') setSetting('templateSort', 'name');
  if (c === 'sort-recent') setSetting('templateSort', 'recent');
  if (c === 'folder') await newFolder();
  if (c === 'examples') setSetting('showExamples', !showExamples);
  if (c === 'shared') {
    const v = await promptDialog({
      title: 'Add a shared template', message: 'Paste the link someone sent you.', placeholder: 'https://…#template=…', multiline: true, ok: 'Add',
    });
    if (v === null) return;
    if (!(await offerSharedTemplate(v))) toast('That doesn’t look like a Setlog template link');
  }
}

/** Ask to add the template in a shared link. Returns false if the text holds none. */
export async function offerSharedTemplate(text) {
  const p = parseSharedTemplate(text);
  if (!p) return false;
  const inBrowserOnIOS = isIOS() && !isStandalone();
  const ok = await confirmDialog({
    title: `Add “${p.name}”?`,
    message: `A template with ${plural(p.exercises.length, 'exercise')}${p.newExercises.length ? `. ${plural(p.newExercises.length, 'exercise')} you don’t have yet will be created: ${p.newExercises.join(', ')}` : ''}.`,
    extra: inBrowserOnIOS ? html`<p class="small">Using Setlog from your Home Screen? It keeps its own data, so copy the link and add it there with Templates ⋯ → Add shared template.</p>` : null,
    ok: 'Add template',
  });
  if (!ok) return true;
  const t = addSharedTemplate(p);
  setTab('workout');
  toast(`“${t.name}” added to your templates`);
  return true;
}

function sortTemplates(list) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  if ((S.settings.templateSort || 'name') !== 'recent') return list.sort(byName);
  return list.sort((a, b) => (lastUsed(b) - lastUsed(a)) || byName(a, b));
}

export function WorkoutTab() {
  useStore('templates', 'active', 'exercises', 'workouts', 'settings', 'meta');
  const [closed, setClosed] = useState({ __archived: true });
  const toggle = (f) => setClosed({ ...closed, [f]: !closed[f] });
  const showExamples = S.settings.showExamples !== false;
  const hideExamples = () => {
    setSetting('showExamples', false);
    toast('Examples hidden — turn them back on in Settings', { action: { label: 'Undo', fn: () => setSetting('showExamples', true) } });
  };
  const live = S.templates.filter((t) => !t.archived);
  const archived = sortTemplates(S.templates.filter((t) => t.archived));
  const folders = new Map();
  for (const f of templateFolders()) folders.set(f, []);
  for (const t of sortTemplates(live)) {
    const f = t.folder || '';
    if (!folders.has(f)) folders.set(f, []);
    folders.get(f).push(t);
  }
  const order = [...folders.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  const a = S.active;
  const grid = (list) => html`<div class="tpl-grid">${list.map((t) => html`<${TemplateCard} key=${t.id} t=${t}
    onOpen=${() => previewTemplate(t)} onMenu=${() => templateMenu(t)} />`)}</div>`;

  const newTemplate = () => push('template-edit', {});
  return html`<${Screen} large="Start workout">
    ${a ? html`<div class="start-card">
      <div class="row"><span class="mini-bar-dot" style="width:8px;height:8px;border-radius:50%;background:var(--done)"></span>
        <strong class="grow ellipsis">${a.name}</strong><span class="muted small">since ${fmt.time(a.startedAt)}</span></div>
      <button class="btn btn-done btn-block btn-lg" id="resume-workout" onClick=${openSheet}><${Icon} name="play" />Resume workout</button>
    </div>` : html`<div class="start-card">
      <button class="btn btn-primary btn-block btn-lg" id="start-empty" onClick=${() => beginWorkout()}><${Icon} name="plus" />Start an empty workout</button>
    </div>`}

    <div class="section"><h2>Templates</h2>
      <div class="row" style="gap:6px">
        <button class="btn btn-tinted btn-sm" id="new-template" onClick=${newTemplate}><${Icon} name="plus" size=${18} />Template</button>
        <button class="btn btn-tinted btn-sm icon-only" id="new-folder" onClick=${newFolder} aria-label="New folder"><${Icon} name="folder" size=${18} /></button>
        <button class="btn btn-tinted btn-sm icon-only" id="templates-menu" onClick=${templatesMenu} aria-label="Template options"><${Icon} name="more" size=${18} /></button>
      </div></div>
    ${!live.length && !folders.size && html`<p class="footnote" style="margin-top:0">Save the workouts you repeat as templates. ${showExamples ? 'Start from an example, tap + Template,' : 'Tap + Template'} or finish a workout and tap “Save as template” in History.</p>`}
    ${order.map((f) => {
      const list = folders.get(f);
      return html`<div key=${'f' + f}>
        ${(f || order.length > 1 || archived.length > 0) && html`<div class="folder-head"><button class=${closed[f] ? 'closed' : ''}
          onClick=${() => toggle(f)}><${Icon} name="chevronDown" />${f || 'My templates'}
          <span class="muted small">(${list.length})</span></button>
          ${f && html`<button class="icon-btn accent folder-more" onClick=${() => folderMenu(f, list.length)} aria-label=${`Options for folder ${f}`}><${Icon} name="more" /></button>`}</div>`}
        ${!closed[f] && (list.length ? grid(list) : html`<p class="footnote" style="margin-top:0">Empty. Use ⋯ → Move to folder on a template to put it here.</p>`)}
      </div>`;
    })}
    ${archived.length > 0 && html`<div>
      <div class="folder-head"><button class=${closed.__archived ? 'closed' : ''} id="archived-head" onClick=${() => toggle('__archived')}>
        <${Icon} name="chevronDown" />Archived <span class="muted small">(${archived.length})</span></button></div>
      ${!closed.__archived && grid(archived)}
    </div>`}

    ${showExamples && html`<div class="section"><h2>Examples</h2>
        <button class="link-btn" id="hide-examples" style="color:var(--ink-3)" onClick=${hideExamples}>Hide</button></div>
      <div class="tpl-grid">${EXAMPLE_TEMPLATES.map((t) => html`<${TemplateCard} key=${t.id} t=${t} onOpen=${() => previewTemplate(t)} />`)}</div>`}
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
    const r = await templateMenu(cur);
    if (r === 'deleted') close();
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
      <div class="muted small">${cur.example ? `Example · ${cur.folder}` : [cur.archived ? 'Archived' : '', cur.folder, at ? `Last done ${relDay(at).toLowerCase()}` : 'Not done yet'].filter(Boolean).join(' · ')}</div>
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
