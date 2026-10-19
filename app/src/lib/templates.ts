// Template actions: the ⋯ menu on a template (card and preview), folders,
// the Templates ⋯ menu, sharing a template as a link and adding one someone
// shared. Template links open the Setlog web app, which reads the same code.
import { Share } from 'react-native';
import { router } from 'expo-router';
import {
  encodeTemplate, decodeTemplate, usesWeight, CATEGORIES, BODY_PARTS,
} from '@setlog/core';

import {
  addExercise, addFolder, copyTemplate, deleteTemplate, findExercise, getState, patchTemplate, removeFolder, renameFolder,
  saveTemplate, setSetting, templateFolders,
} from '@/data/store';
import type { Category, Template, TemplateEntry } from '@/data/types';
import {
  actionSheet, ask, prompt, toast,
} from '@/ui/overlay';
import { setLabels, type Format } from './format';
import type { Tr } from './i18n';

type F = Format & { tr: Tr };

/** Where shared template links point: the web app, which anyone can open. */
export const WEB_APP_URL = 'https://laurinlibossek.github.io/setlog/';

export const openTemplateEditor = (params: { id?: string; from?: string } = {}) => router.push({ pathname: '/template-edit', params });

/** Share some text with the system share sheet. Returns false when sharing isn't possible here. */
export async function shareText(message: string, title?: string): Promise<boolean> {
  try {
    await Share.share({ message, title });
    return true;
  } catch {
    return false;
  }
}

export function templateShareText(t: Template, f: F) {
  const { tr } = f;
  const s = getState();
  const lines = [tr('{name} (Setlog template)', { name: t.name })];
  if (t.notes) lines.push(t.notes);
  for (const x of t.exercises) {
    const ex = s.exercises.get(x.exerciseId);
    if (!ex) continue;
    const labels = setLabels(x.sets);
    const sets = x.sets.map((st, i) => {
      let v = '';
      if (st.w === undefined && st.r && usesWeight(ex.category)) v = `${st.r} ${tr(st.r === 1 ? 'rep' : 'reps')}`;
      else if (st.w || st.r || st.d || st.t) v = f.setText(st, ex.category);
      return v && labels[i] === 'W' ? `W ${v}` : v;
    }).filter(Boolean);
    lines.push(`• ${ex.name}: ${f.plural(x.sets.length, 'set')}${sets.length ? ` (${sets.join(', ')})` : ''}`);
  }
  lines.push('', tr('Add it to Setlog: open this link, or copy it and choose Templates ⋯ → Add shared template in the app.'),
    `${WEB_APP_URL}#template=${encodeTemplate(t, s.exercises)}`);
  return lines.join('\n');
}

export async function moveToFolder(t: Template, f: F) {
  const { tr } = f;
  const folders = templateFolders();
  const v = await actionSheet<string>({
    title: tr('Move to folder'),
    actions: [
      { label: tr('No folder'), value: '__none', checked: !t.folder },
      ...folders.map((x) => ({ label: x, value: x, checked: t.folder === x })),
      { label: tr('New folder…'), value: '__new', testID: 'folder-new' },
    ],
  });
  if (!v) return;
  let folder = v === '__none' ? '' : v;
  if (v === '__new') {
    folder = ((await prompt({ title: tr('New folder'), placeholder: tr('e.g. Upper / Lower'), ok: tr('Create') })) || '').trim();
    if (!folder) return;
  }
  await patchTemplate(t.id, { folder });
}

/** The ⋯ menu of a template. Resolves to 'deleted' when it's gone. */
export async function templateMenu(t: Template, f: F): Promise<string | undefined> {
  const { tr } = f;
  const c = await actionSheet<string>({
    title: t.name,
    actions: [
      { label: tr('Edit template'), value: 'edit', icon: 'edit', testID: 'tpl-menu-edit' },
      { label: tr('Rename'), value: 'rename', icon: 'edit', testID: 'tpl-menu-rename' },
      { label: tr('Duplicate'), value: 'dup', icon: 'copy', testID: 'tpl-menu-dup' },
      { label: tr('Move to folder'), value: 'folder', icon: 'folder', testID: 'tpl-menu-folder' },
      { label: t.archived ? tr('Unarchive') : tr('Archive'), value: 'archive', icon: 'archive', testID: 'tpl-menu-archive' },
      { label: tr('Share'), value: 'share', icon: 'share' },
      { label: tr('Delete template'), value: 'delete', destructive: true, icon: 'trash', testID: 'tpl-menu-delete' },
    ],
  });
  if (c === 'edit') openTemplateEditor({ id: t.id });
  if (c === 'rename') {
    const v = await prompt({ title: tr('Rename template'), value: t.name });
    if (v && v.trim()) await patchTemplate(t.id, { name: v.trim() });
  }
  if (c === 'dup') { await copyTemplate(t, { name: tr('{name} (copy)', { name: t.name }) }); toast(tr('Template duplicated')); }
  if (c === 'folder') await moveToFolder(t, f);
  if (c === 'archive') {
    const archived = !t.archived;
    await patchTemplate(t.id, { archived });
    toast(archived ? tr('“{name}” archived', { name: t.name }) : tr('“{name}” is back in your templates', { name: t.name }),
      archived ? { label: tr('Undo'), fn: () => { patchTemplate(t.id, { archived: false }); } } : undefined);
  }
  if (c === 'share' && !(await shareText(templateShareText(t, f), t.name))) toast(tr('Couldn’t share the template'));
  if (c === 'delete') {
    const ok = await ask({
      title: tr('Delete “{name}”?', { name: t.name }), message: tr('Past workouts stay in your history.'), ok: tr('Delete'), cancel: tr('Cancel'), destructive: true, testID: 'confirm-delete',
    });
    if (!ok) return undefined;
    const gone = await deleteTemplate(t.id);
    if (gone) toast(tr('Template deleted'), { label: tr('Undo'), fn: () => { saveTemplate(gone); } });
    return 'deleted';
  }
  return c;
}

export async function newFolder(f: F) {
  const { tr } = f;
  const v = ((await prompt({ title: tr('New folder'), placeholder: tr('e.g. Upper / Lower'), ok: tr('Create') })) || '').trim();
  if (!v) return;
  if (!(await addFolder(v))) { toast(tr('A folder with that name already exists')); return; }
  toast(tr('Folder “{name}” created — use ⋯ → Move to folder on a template', { name: v }));
}

export async function folderMenu(name: string, count: number, f: F) {
  const { tr } = f;
  const c = await actionSheet<string>({
    title: name,
    actions: [
      { label: tr('Rename folder'), value: 'rename', icon: 'edit' },
      { label: tr('Remove folder'), value: 'remove', destructive: true, icon: 'trash', testID: 'folder-remove' },
    ],
  });
  if (c === 'rename') {
    const v = await prompt({ title: tr('Rename folder'), value: name });
    if (v && v.trim() && v.trim() !== name) {
      if (templateFolders().includes(v.trim())) { toast(tr('A folder with that name already exists')); return; }
      await renameFolder(name, v.trim());
    }
  }
  if (c === 'remove') {
    const ok = !count || await ask({
      title: tr('Remove “{name}”?', { name }),
      message: count === 1 ? tr('Its template moves to My templates. Nothing is deleted.') : tr('Its {n} templates move to My templates. Nothing is deleted.', { n: count }),
      ok: tr('Remove folder'), cancel: tr('Cancel'),
    });
    if (ok) await removeFolder(name);
  }
}

/** The Templates ⋯ menu: sort, new folder, add a shared template, examples. */
export async function templatesMenu(f: F) {
  const { tr } = f;
  const s = getState();
  const sort = s.settings.templateSort || 'name';
  const showExamples = s.settings.showExamples !== false;
  const c = await actionSheet<string>({
    title: tr('Templates'),
    actions: [
      { label: tr('Sort by name'), value: 'sort-name', checked: sort === 'name' },
      { label: tr('Sort by last used'), value: 'sort-recent', checked: sort === 'recent', testID: 'sort-recent' },
      { label: tr('New folder'), value: 'folder', icon: 'folder' },
      { label: tr('Add shared template'), value: 'shared', icon: 'download', testID: 'add-shared' },
      { label: showExamples ? tr('Hide examples') : tr('Show examples'), value: 'examples', icon: showExamples ? 'eyeOff' : 'eye' },
    ],
  });
  if (c === 'sort-name') setSetting('templateSort', 'name');
  if (c === 'sort-recent') setSetting('templateSort', 'recent');
  if (c === 'folder') await newFolder(f);
  if (c === 'examples') setSetting('showExamples', !showExamples);
  if (c === 'shared') {
    const v = await prompt({
      title: tr('Add a shared template'), message: tr('Paste the link someone sent you.'), placeholder: 'https://…#template=…', multiline: true, ok: tr('Add'),
    });
    if (v === null) return;
    if (!(await offerSharedTemplate(v, f))) toast(tr('That doesn’t look like a Setlog template link'));
  }
}

type Shared = {
  name: string; notes: string;
  exercises: { id: string | null; name: string; category: Category; bodyPart: string; sets: TemplateEntry['sets']; restSec: number | null; notes: string; group: number | null; focus: string | null }[];
};

/** Ask to add the template in a shared link. Returns false if the text holds none. */
export async function offerSharedTemplate(text: string, f: F): Promise<boolean> {
  const { tr } = f;
  const p = decodeTemplate(text, {
    categories: (CATEGORIES as { id: string }[]).map((x) => x.id), bodyParts: (BODY_PARTS as { id: string }[]).map((x) => x.id),
  }) as Shared | null;
  if (!p) return false;
  const s = getState();
  const known = (x: Shared['exercises'][number]) => (x.id && s.exercises.has(x.id)) || findExercise(x.name);
  const fresh = [...new Set(p.exercises.filter((x) => !known(x)).map((x) => x.name))];
  const ok = await ask({
    title: tr('Add “{name}”?', { name: p.name }),
    message: tr('A template with {n}.', { n: f.plural(p.exercises.length, 'exercise') })
      + (fresh.length ? ` ${tr('These exercises are new to you and will be created: {list}.', { list: fresh.join(', ') })}` : ''),
    ok: tr('Add template'), cancel: tr('Cancel'), testID: 'confirm-add-shared',
  });
  if (!ok) return true;
  const exercises: TemplateEntry[] = [];
  for (const x of p.exercises) {
    let id = x.id && getState().exercises.has(x.id) ? x.id : findExercise(x.name)?.id;
    if (!id) id = (await addExercise({ name: x.name, category: x.category, bodyPart: x.bodyPart })).id;
    const e: TemplateEntry = { exerciseId: id, sets: x.sets };
    if (x.restSec !== null) e.restSec = x.restSec;
    if (x.notes) e.notes = x.notes;
    if (x.group !== null) e.supersetId = `g${x.group}`;
    if (x.focus) e.focus = x.focus;
    exercises.push(e);
  }
  const t = await copyTemplate({ id: '', name: p.name, notes: p.notes, exercises });
  toast(tr('“{name}” added to your templates', { name: t.name }));
  return true;
}
