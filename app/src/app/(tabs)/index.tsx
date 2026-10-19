import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { EXAMPLE_TEMPLATES } from '@setlog/core';

import {
  setSetting, suggestion, templateFolders, useAppState,
} from '@/data/store';
import type { Template } from '@/data/types';
import { useFormat } from '@/lib/format';
import {
  folderMenu, newFolder, openTemplateEditor, templateMenu, templatesMenu,
} from '@/lib/templates';
import { beginWorkout, openWorkout } from '@/lib/workout';
import { useColors } from '@/lib/theme';
import {
  Button, Card, Icon, Screen, SectionTitle, Txt,
} from '@/ui/kit';
import { toast } from '@/ui/overlay';

function lastUsed(t: Template, workouts: { templateId: string | null; startedAt: number }[]) {
  if (t.lastUsedAt) return t.lastUsedAt;
  for (const w of workouts) if (w.templateId === t.id) return w.startedAt;
  return 0;
}

export default function WorkoutTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const sug = useMemo(() => (s.active ? null : suggestion(s)), [s.templates, s.workouts, !s.active]);
  const [closed, setClosed] = useState<Record<string, boolean>>({ __archived: true });
  const toggle = (k: string) => setClosed({ ...closed, [k]: !closed[k] });

  const { order, folders, archived } = useMemo(() => {
    const byName = (a: Template, b: Template) => a.name.localeCompare(b.name);
    const recent = (s.settings.templateSort || 'name') === 'recent';
    const sort = (list: Template[]) => list.sort(recent ? (a, b) => (lastUsed(b, s.workouts) - lastUsed(a, s.workouts)) || byName(a, b) : byName);
    const map = new Map<string, Template[]>();
    for (const name of templateFolders(s)) map.set(name, []);
    for (const t of sort(s.templates.filter((x) => !x.archived))) {
      const key = t.folder || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    const keys = [...map.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
    return { order: keys, folders: map, archived: sort(s.templates.filter((x) => x.archived)) };
  }, [s.templates, s.workouts, s.settings.templateSort, s.meta.folders]);
  const archivedIn = (name: string) => archived.filter((t) => (t.folder || '') === name).length;

  const why = (w: NonNullable<typeof sug>['why']) => {
    if (w.kind === 'weekday') {
      const d = new Date(); d.setDate(d.getDate() + (((w.day ?? 0) - d.getDay() + 7) % 7));
      const day = f.date.weekdayLong(d.getTime());
      return tr('Usually on {days}', { days: f.lang === 'de' ? `${day.toLowerCase()}s` : `${day}s` });
    }
    if (w.kind === 'after') return tr('Usually after {name}', { name: w.name ?? '' });
    return tr('Last done {when}', { when: f.relDayLower(w.at ?? 0) });
  };

  const card = (t: Template) => {
    const lines = t.exercises.filter((e) => s.exercises.has(e.exerciseId));
    const at = t.example ? 0 : lastUsed(t, s.workouts);
    return (
      <Card key={t.id} onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })} style={st.tpl} testID={`template-${t.id}`}>
        <Txt style={[st.tplName, !t.example && { paddingRight: 26 }]} numberOfLines={1}>{t.name}</Txt>
        {lines.slice(0, 4).map((e, i) => (
          <Txt key={i} tone="ink2" style={st.tplLine} numberOfLines={1}>{`${e.sets.length} × ${s.exercises.get(e.exerciseId)!.name}`}</Txt>
        ))}
        {lines.length > 4 && <Txt tone="ink3" style={st.tplLine}>{tr('+ {n} more', { n: lines.length - 4 })}</Txt>}
        {!lines.length && <Txt tone="ink3" style={st.tplLine}>{tr('No exercises')}</Txt>}
        {!t.example && (
          <View style={st.when}>
            <Icon name="clock" size={12} color={c.ink3} />
            <Txt tone="ink3" style={{ fontSize: 13 }}>{at ? f.relDay(at) : tr('Not done yet')}</Txt>
          </View>
        )}
        {!t.example && (
          <Pressable onPress={() => templateMenu(t, f)} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('Options for {name}', { name: t.name })}
            testID={`template-menu-${t.id}`} style={({ pressed }) => [st.more, { backgroundColor: pressed ? c.surface3 : 'transparent' }]}>
            <Icon name="more" size={17} color={c.accentText} />
          </Pressable>
        )}
      </Card>
    );
  };
  const grid = (list: Template[]) => <View style={st.grid}>{list.map(card)}</View>;
  const examples = (EXAMPLE_TEMPLATES as Template[]).map((t) => ({ ...t, name: tr(t.name), folder: tr(t.folder || '') }));
  const showExamples = s.settings.showExamples !== false;
  const hideExamples = () => {
    setSetting('showExamples', false);
    toast(tr('Examples hidden — turn them back on in Settings'), { label: tr('Undo'), fn: () => { setSetting('showExamples', true); } });
  };
  const live = s.templates.filter((t) => !t.archived);
  const folderHead = (key: string, count: number, testID: string) => (
    <View style={st.folderRow}>
      <Pressable onPress={() => toggle(key)} accessibilityRole="button" accessibilityState={{ expanded: !closed[key] }} testID={testID}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingVertical: 6 }}>
        <View style={{ transform: [{ rotate: closed[key] ? '-90deg' : '0deg' }] }}><Icon name="chevronDown" size={14} color={c.ink2} /></View>
        <Txt tone="ink2" style={{ fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {key === '__archived' ? tr('Archived') : key || tr('My templates')}
          <Txt tone="ink3" style={{ fontSize: 13, fontWeight: '500' }}>{` (${count})`}</Txt>
        </Txt>
      </Pressable>
      {key && key !== '__archived' && (
        <Pressable onPress={() => folderMenu(key, count + archivedIn(key), f)} hitSlop={8} accessibilityRole="button"
          accessibilityLabel={tr('Options for folder {name}', { name: key })} testID={`folder-menu-${key}`} style={st.smallBtn}>
          <Icon name="more" size={17} color={c.accentText} />
        </Pressable>
      )}
    </View>
  );

  return (
    <Screen title={tr('Start workout')}>
      {s.active ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.done }} />
            <Txt style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>{s.active.name}</Txt>
            <Txt tone="ink3" style={{ fontSize: 13 }}>{tr('since {time}', { time: f.date.time(s.active.startedAt) })}</Txt>
          </View>
          <Button large icon="play" title={tr('Resume workout')} onPress={openWorkout} testID="resume-workout" />
        </Card>
      ) : (
        <Card style={{ gap: 10 }}>
          {sug && (
            <View style={{ gap: 8 }}>
              <Text style={[st.label, { color: c.label }]}>{tr('Suggested')}</Text>
              <Button large icon="play" title={tr('Start {name}', { name: sug.template.name })} onPress={() => beginWorkout({ template: sug.template }, f)} testID="start-suggested" />
              <Txt tone="ink3" style={{ fontSize: 13, textAlign: 'center' }}>{why(sug.why)}</Txt>
            </View>
          )}
          <Button large icon="plus" kind={sug ? 'tinted' : 'primary'} title={tr('Start an empty workout')} onPress={() => beginWorkout({}, f)} testID="start-empty" />
        </Card>
      )}

      <SectionTitle right={(
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable onPress={() => openTemplateEditor()} accessibilityRole="button" testID="new-template"
            style={({ pressed }) => [st.pill, { backgroundColor: pressed ? c.surface3 : c.accentSoft }]}>
            <Icon name="plus" size={15} color={c.accentText} />
            <Text style={{ color: c.accentText, fontSize: 14, fontWeight: '600' }}>{tr('Template')}</Text>
          </Pressable>
          <Pressable onPress={() => newFolder(f)} accessibilityRole="button" accessibilityLabel={tr('New folder')} testID="new-folder"
            style={({ pressed }) => [st.pill, { backgroundColor: pressed ? c.surface3 : c.accentSoft }]}>
            <Icon name="folder" size={16} color={c.accentText} />
          </Pressable>
          <Pressable onPress={() => templatesMenu(f)} accessibilityRole="button" accessibilityLabel={tr('Template options')} testID="templates-menu"
            style={({ pressed }) => [st.pill, { backgroundColor: pressed ? c.surface3 : c.accentSoft }]}>
            <Icon name="more" size={16} color={c.accentText} />
          </Pressable>
        </View>
      )}>{tr('Templates')}</SectionTitle>
      {!live.length && !folders.size && (
        <Txt tone="ink3" style={{ fontSize: 14, paddingHorizontal: 4 }}>
          {showExamples ? tr('Save the workouts you repeat as templates. Start from an example, tap + Template, or finish a workout and tap “Save as template” in History.')
            : tr('Save the workouts you repeat as templates. Tap + Template, or finish a workout and tap “Save as template” in History.')}
        </Txt>
      )}
      {order.map((key) => {
        const list = folders.get(key)!;
        const inArchive = archivedIn(key);
        return (
          <View key={'f' + key}>
            {(key || order.length > 1 || archived.length > 0) && folderHead(key, list.length, `folder-${key || 'mine'}`)}
            {!closed[key] && (list.length ? grid(list) : (
              <Txt tone="ink3" style={{ fontSize: 14, paddingHorizontal: 4, marginBottom: 6 }}>
                {inArchive ? (inArchive === 1 ? tr('Its template is archived. Find it under Archived below.') : tr('Its {n} templates are archived. Find them under Archived below.', { n: inArchive }))
                  : tr('Empty. Use ⋯ → Move to folder on a template to put it here.')}
              </Txt>
            ))}
          </View>
        );
      })}
      {archived.length > 0 && (
        <View>
          {folderHead('__archived', archived.length, 'archived-head')}
          {!closed.__archived && grid(archived)}
        </View>
      )}

      {showExamples && (
        <>
          <SectionTitle right={(
            <Pressable onPress={hideExamples} hitSlop={8} accessibilityRole="button" testID="hide-examples">
              <Text style={{ color: c.ink3, fontSize: 14, fontWeight: '600' }}>{tr('Hide')}</Text>
            </Pressable>
          )}>{tr('Examples')}</SectionTitle>
          {grid(examples)}
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  tpl: { width: '48.5%', flexGrow: 1, flexBasis: '45%', minHeight: 118, gap: 2 },
  tplName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  tplLine: { fontSize: 13 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto', paddingTop: 6 },
  more: { position: 'absolute', top: 8, right: 6, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 6, paddingHorizontal: 4 },
  smallBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, borderRadius: 15, paddingHorizontal: 10 },
});
