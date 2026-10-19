// Edit a finished workout: name, start, duration, note and every set.
// Sets without reps (or time) are dropped when it's saved.
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { newEntries, workoutEditDraft } from '@setlog/core';

import {
  editDraft, getState, patchDraft, previousSets, saveWorkoutEdit,
} from '@/data/store';
import type { WorkoutEditDraft } from '@/data/types';
import { useFormat } from '@/lib/format';
import { pickExercises } from '@/lib/picker';
import { useColors } from '@/lib/theme';
import {
  Button, Empty, Field, HeaderButton, Icon, Txt,
} from '@/ui/kit';
import { pickDateTime, toast } from '@/ui/overlay';
import { DraftBlocks, KeyboardDoneBar } from '@/ui/workout/DraftBlocks';
import { useEditor } from '@/ui/workout/useEditor';

export default function WorkoutEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { draft: d, leave } = useEditor<WorkoutEditDraft>(() => {
    const s = getState();
    const w = s.workouts.find((x) => x.id === id);
    return w ? workoutEditDraft(w, s.settings, (x: string) => s.exercises.has(x)) as WorkoutEditDraft : null;
  });

  const save = async () => {
    const r = await saveWorkoutEdit(tr('Workout'));
    if (r.problem) { toast(tr(r.problem)); return; }
    toast(tr('Workout saved'));
    leave();
  };
  const addExercises = async () => {
    const ids = await pickExercises({ multi: true, title: tr('Add exercises') });
    if (!ids) return;
    editDraft('edit', (x) => { x.exercises.push(...newEntries(ids, { previousSets: (eid: string) => previousSets(eid) })); });
  };
  const changeStart = async () => {
    if (!d) return;
    const t = await pickDateTime({ title: tr('Started'), value: d.startedAt, max: Date.now(), maxMessage: tr('The start time has to be in the past'), ok: tr('Set') });
    if (t !== null) patchDraft('edit', { startedAt: t });
  };

  const header = (
    <Stack.Screen options={{
      title: tr('Edit workout'),
      headerBackVisible: false,
      gestureEnabled: false,
      headerLeft: () => <HeaderButton title={tr('Cancel')} onPress={() => router.back()} testID="edit-cancel" />,
      headerRight: () => (d ? <HeaderButton title={tr('Save')} strong onPress={save} testID="edit-save" /> : null),
    }} />
  );
  if (!d) return <View style={{ flex: 1, backgroundColor: c.bg }}>{header}<Empty title={tr('Workout not found')} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: insets.bottom + 48 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <View style={{ gap: 10, paddingHorizontal: 4 }}>
          <Field value={d.name} onChange={(v) => patchDraft('edit', { name: v })} placeholder={tr('Workout name')} big testID="edit-name" />
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Txt tone="ink2" style={{ fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>{tr('Started')}</Txt>
              <Pressable onPress={changeStart} accessibilityRole="button" testID="edit-start"
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, minHeight: 46, backgroundColor: pressed ? c.surface2 : c.surface })}>
                <Icon name="calendar" size={15} color={c.ink2} />
                <Txt style={{ fontSize: 15, flex: 1 }} numberOfLines={1}>{`${f.date.short(d.startedAt)} · ${f.date.time(d.startedAt)}`}</Txt>
              </Pressable>
            </View>
            <View style={{ width: 110 }}>
              <Field label={tr('Minutes')} value={d.durationMin} onChange={(v) => patchDraft('edit', { durationMin: v.replace(/[^\d.,]/g, '') })} keyboardType="number-pad" testID="edit-duration" />
            </View>
          </View>
          <Field value={d.notes} onChange={(v) => patchDraft('edit', { notes: v })} placeholder={tr('Workout note')} multiline testID="edit-notes" />
        </View>
        <DraftBlocks draftKey="edit" mode="edit" draft={d} />
        <View style={{ marginTop: 16 }}>
          <Button large kind="tinted" icon="plus" title={tr('Add exercises')} onPress={addExercises} testID="add-exercises" />
        </View>
        <Txt tone="ink3" style={{ fontSize: 13, marginTop: 12, paddingHorizontal: 4 }}>{tr('Sets without reps (or time) are dropped when you save.')}</Txt>
      </ScrollView>
      <KeyboardDoneBar />
    </View>
  );
}
