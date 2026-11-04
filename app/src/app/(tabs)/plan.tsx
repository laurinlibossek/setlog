// Plan: the templates and their folders (what the Workout tab held), the
// examples, and + for an empty workout, a new template or a folder. Rows open
// the template's page, where Start is; ⋯ has the template's menu.
// (Blocks come in phase 5, docs/design/phases.md.)
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { EXAMPLE_TEMPLATES } from '@setlog/core';

import { setSetting, templateFolders, useAppState } from '@/data/store';
import type { Template } from '@/data/types';
import { CONTROL, RADIUS, SPACE, TYPE } from '@/design/tally';
import { useFormat } from '@/lib/format';
import {
  folderMenu, newFolder, openTemplateEditor, templateMenu, templatesMenu,
} from '@/lib/templates';
import { useTally } from '@/lib/theme';
import { beginWorkout } from '@/lib/workout';
import { ListRow, SymbolIcon } from '@/ui/tally/ListRow';
import { SectionHeader } from '@/ui/tally/SectionHeader';
import { TabRoot } from '@/ui/tally/TabRoot';
import { actionSheet, toast } from '@/ui/overlay';

function lastUsed(t: Template, workouts: { templateId: string | null; startedAt: number }[]) {
  if (t.lastUsedAt) return t.lastUsedAt;
  for (const w of workouts) if (w.templateId === t.id) return w.startedAt;
  return 0;
}

export default function PlanTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const { colors: t } = useTally();
  const [closed, setClosed] = useState<Record<string, boolean>>({ __archived: true });
  const toggle = (k: string) => setClosed({ ...closed, [k]: !closed[k] });

  const { order, folders, archived } = useMemo(() => {
    const byName = (a: Template, b: Template) => a.name.localeCompare(b.name);
    const recent = (s.settings.templateSort || 'name') === 'recent';
    const sort = (list: Template[]) => list.sort(recent ? (a, b) => (lastUsed(b, s.workouts) - lastUsed(a, s.workouts)) || byName(a, b) : byName);
    const map = new Map<string, Template[]>();
    for (const name of templateFolders(s)) map.set(name, []);
    for (const x of sort(s.templates.filter((y) => !y.archived))) {
      const key = x.folder || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(x);
    }
    const keys = [...map.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
    return { order: keys, folders: map, archived: sort(s.templates.filter((x) => x.archived)) };
  }, [s.templates, s.workouts, s.settings.templateSort, s.meta.folders]); // eslint-disable-line react-hooks/exhaustive-deps
  const archivedIn = (name: string) => archived.filter((x) => (x.folder || '') === name).length;

  const add = async () => {
    const c = await actionSheet<string>({
      actions: [
        { label: tr('Empty workout'), value: 'empty', icon: 'play', testID: 'start-empty' },
        { label: tr('New routine'), value: 'template', icon: 'plus', testID: 'new-template' },
        { label: tr('New folder'), value: 'folder', icon: 'folder', testID: 'new-folder' },
      ],
    });
    if (c === 'empty') beginWorkout({}, f);
    if (c === 'template') openTemplateEditor();
    if (c === 'folder') newFolder(f);
  };
  const plus = (
    <Pressable onPress={add} accessibilityRole="button" accessibilityLabel={tr('Add')} testID="plan-add" hitSlop={4}
      style={({ pressed }) => ({ width: CONTROL.hitMin, height: CONTROL.hitMin, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.paper2 : t.paper3 })}>
      <SymbolIcon name="plus" size={22} color={t.ink} />
    </Pressable>
  );

  const row = (x: Template, i: number) => {
    const n = x.exercises.filter((e) => s.exercises.has(e.exerciseId)).length;
    const at = x.example ? 0 : lastUsed(x, s.workouts);
    const when = x.example ? '' : at ? f.relDayLower(at) : tr('not done yet');
    return (
      <ListRow key={x.id} first={i === 0} title={x.name} subtitle={[f.plural(n, 'exercise'), when].filter(Boolean).join(' · ')} chevron
        onPress={() => router.push({ pathname: '/template/[id]', params: { id: x.id } })} testID={`template-${x.id}`}
        right={!x.example && (
          <Pressable onPress={() => templateMenu(x, f)} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('Options for {name}', { name: x.name })}
            testID={`template-menu-${x.id}`} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.paper3 : 'transparent' })}>
            <SymbolIcon name="ellipsis" size={18} color={t.ink2} />
          </Pressable>
        )} />
    );
  };
  const folderHead = (key: string, count: number, testID: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, paddingLeft: SPACE.s5, paddingRight: SPACE.s3, marginTop: SPACE.s3 }}>
      <Pressable onPress={() => toggle(key)} accessibilityRole="button" accessibilityState={{ expanded: !closed[key] }} testID={testID}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minHeight: CONTROL.hitMin }}>
        <View style={{ transform: [{ rotate: closed[key] ? '-90deg' : '0deg' }] }}><SymbolIcon name="chevron.down" size={13} color={t.ink2} /></View>
        <Text style={[TYPE.headline, { color: t.ink2 }]} numberOfLines={1}>
          {key === '__archived' ? tr('Archived') : key || tr('My routines')}
          <Text style={[TYPE.footnote, { color: t.ink3 }]}>{` ${count}`}</Text>
        </Text>
      </Pressable>
      {key && key !== '__archived' && (
        <Pressable onPress={() => folderMenu(key, count + archivedIn(key), f)} hitSlop={6} accessibilityRole="button"
          accessibilityLabel={tr('Options for folder {name}', { name: key })} testID={`folder-menu-${key}`}
          style={({ pressed }) => ({ width: 36, height: 36, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.paper3 : 'transparent' })}>
          <SymbolIcon name="ellipsis" size={18} color={t.ink2} />
        </Pressable>
      )}
    </View>
  );
  const note = (text: string) => <Text style={[TYPE.subhead, { color: t.ink2, paddingHorizontal: SPACE.s5, paddingVertical: SPACE.s2 }]}>{text}</Text>;

  const examples = (EXAMPLE_TEMPLATES as Template[]).map((x) => ({ ...x, name: tr(x.name), folder: tr(x.folder || '') }));
  const showExamples = s.settings.showExamples !== false;
  const hideExamples = () => {
    setSetting('showExamples', false);
    toast(tr('Examples hidden — turn them back on in Account'), { label: tr('Undo'), fn: () => { setSetting('showExamples', true); } });
  };
  const live = s.templates.filter((x) => !x.archived);

  return (
    <TabRoot title={tr('Plan')} right={plus}>
      <SectionHeader first title={tr('Routines')} action={{ symbol: 'ellipsis', label: tr('Routine options'), onPress: () => templatesMenu(f), testID: 'templates-menu' }} />
      {!live.length && !folders.size && note(tr('Save the workouts you repeat as routines: tap + and New routine, or open a finished workout and save it as a routine.'))}
      {order.map((key) => {
        const list = folders.get(key)!;
        const inArchive = archivedIn(key);
        return (
          <View key={'f' + key}>
            {(key || order.length > 1 || archived.length > 0) && folderHead(key, list.length, `folder-${key || 'mine'}`)}
            {!closed[key] && (list.length ? list.map(row) : note(
              inArchive ? (inArchive === 1 ? tr('Its routine is archived. Find it under Archived below.') : tr('Its {n} routines are archived. Find them under Archived below.', { n: inArchive }))
                : tr('Empty. Use ⋯ → Move to folder on a routine to put it here.'),
            ))}
          </View>
        );
      })}
      {archived.length > 0 && (
        <View>
          {folderHead('__archived', archived.length, 'archived-head')}
          {!closed.__archived && archived.map(row)}
        </View>
      )}

      {showExamples && (
        <>
          <SectionHeader title={tr('Examples')} action={{ title: tr('Hide'), onPress: hideExamples, testID: 'hide-examples' }} />
          {examples.map(row)}
        </>
      )}
    </TabRoot>
  );
}
