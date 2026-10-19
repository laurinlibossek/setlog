// The template editor: a new template, an existing one (?id=) or one made
// from a finished workout (?from=). Numbers entered here are targets; when
// the template is started, last time's numbers take priority.
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { newEntries, templateDraft } from '@setlog/core';

import {
  editDraft, getState, patchDraft, previousSets, saveTemplateDraft, templateFolders, useAppSelector,
} from '@/data/store';
import type { TemplateDraft } from '@/data/types';
import { useFormat } from '@/lib/format';
import { pickExercises } from '@/lib/picker';
import { useColors } from '@/lib/theme';
import {
  Button, Empty, Field, HeaderButton, Txt,
} from '@/ui/kit';
import { toast } from '@/ui/overlay';
import { DraftBlocks, KeyboardDoneBar } from '@/ui/workout/DraftBlocks';
import { useEditor } from '@/ui/workout/useEditor';

export default function TemplateEditScreen() {
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { draft: d, leave } = useEditor<TemplateDraft>(() => {
    const s = getState();
    const template = id ? s.templates.find((t) => t.id === id) || null : null;
    if (id && !template) return null;
    return templateDraft({
      template, workout: !id && from ? s.workouts.find((w) => w.id === from) || null : null,
      settings: s.settings, hasExercise: (x: string) => s.exercises.has(x),
    }) as TemplateDraft;
  });
  const templates = useAppSelector((s) => s.templates);
  const meta = useAppSelector((s) => s.meta);
  const folders = useMemo(() => templateFolders(getState()), [templates, meta]);

  const save = async () => {
    const r = await saveTemplateDraft();
    if (r.problem) { toast(tr(r.problem)); return; }
    toast(r.created ? tr('“{name}” created', { name: r.template!.name }) : tr('Template saved'));
    leave();
  };
  const addExercises = async () => {
    const ids = await pickExercises({ multi: true, title: tr('Add exercises') });
    if (!ids) return;
    editDraft('edit', (x) => { x.exercises.push(...newEntries(ids, { previousSets: (eid: string) => previousSets(eid), kind: 'template' })); });
  };

  const header = (
    <Stack.Screen options={{
      title: id ? tr('Edit template') : tr('New template'),
      headerBackVisible: false,
      gestureEnabled: false,
      headerLeft: () => <HeaderButton title={tr('Cancel')} onPress={() => router.back()} testID="tpl-cancel" />,
      headerRight: () => (d ? <HeaderButton title={tr('Save')} strong onPress={save} testID="template-save" /> : null),
    }} />
  );
  if (!d) return <View style={{ flex: 1, backgroundColor: c.bg }}>{header}<Empty title={tr('Template not found')} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: insets.bottom + 48 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <View style={{ gap: 10, paddingHorizontal: 4 }}>
          <Field value={d.name} onChange={(v) => patchDraft('edit', { name: v })} placeholder={tr('Template name')} big testID="tpl-name" />
          <Field value={d.folder} onChange={(v) => patchDraft('edit', { folder: v })} placeholder={tr('Folder (optional)')} testID="tpl-folder" />
          {folders.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
              {folders.map((name) => {
                const on = d.folder.trim() === name;
                return (
                  <Pressable key={name} onPress={() => patchDraft('edit', { folder: on ? '' : name })} accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? c.chipOn : c.surface }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: on ? c.chipOnInk : c.ink2 }}>{name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Field value={d.notes} onChange={(v) => patchDraft('edit', { notes: v })} placeholder={tr('Notes (optional)')} multiline testID="tpl-notes" />
        </View>
        <DraftBlocks draftKey="edit" mode="template" draft={d} />
        {!d.exercises.length && <Empty title={tr('Build your template')} text={tr('Add the exercises and sets you want to repeat.')} />}
        <View style={{ marginTop: 16 }}>
          <Button large kind="tinted" icon="plus" title={tr('Add exercises')} onPress={addExercises} testID="add-exercises" />
        </View>
        <Txt tone="ink3" style={{ fontSize: 13, marginTop: 12, paddingHorizontal: 4 }}>
          {tr('Numbers you enter here are targets. When you start the template, your actual numbers from last time take priority.')}
        </Txt>
      </ScrollView>
      <KeyboardDoneBar />
    </View>
  );
}
