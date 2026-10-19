// The exercise blocks of a draft (the running workout, a template in the
// editor or a finished workout being edited), each with what it needs from
// the history, plus the "Done" bar above the iPhone number pad.
import { useMemo } from 'react';
import {
  InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { supersetLetters, draftTemplateId } from '@setlog/core';

import {
  exerciseFor, getState, previousSets, stats, useAppSelector, useSettings,
} from '@/data/store';
import type { AnyDraft, DraftKey } from '@/data/types';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { ExerciseBlock, type EditorMode } from './ExerciseBlock';
import { KEYBOARD_BAR } from './SetRow';

export function DraftBlocks({ draftKey, mode, draft }: { draftKey: DraftKey; mode: EditorMode; draft: AnyDraft }) {
  const exercises = useAppSelector((s) => s.exercises);
  const workouts = useAppSelector((s) => s.workouts);
  const settings = useSettings();
  // records and previous values follow the history and the settings
  const st = useMemo(() => stats(), [workouts, exercises, settings]);
  const letters = supersetLetters(draft.exercises) as Map<string, { index: number; letter: string }>;
  const templateId = draftTemplateId(draft) as string | null;
  // editing a finished workout: "previous" is what came before it
  const before = draft.kind === 'edit' ? draft.startedAt : undefined;
  const excludeWorkoutId = draft.kind === 'edit' ? draft.id : null;
  return (
    <>
      {draft.exercises.map((e) => (
        <ExerciseBlock key={e.id} draftKey={draftKey} mode={mode} entry={e} settings={settings}
          ex={draft.kind === 'workout' ? exercises.get(e.exerciseId) : exerciseFor(draftKey, e.exerciseId, getState())}
          prevSets={previousSets(e.exerciseId, { templateId, before, excludeWorkoutId })}
          bests={st.bests.get(e.exerciseId)} superset={e.supersetId ? letters.get(e.supersetId) : undefined} />
      ))}
    </>
  );
}

/** "Done" above the number pad on iPhone (the pad has no return key). Mount once per screen. */
export function KeyboardDoneBar() {
  const c = useColors();
  const { tr } = useFormat();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_BAR} backgroundColor={c.surface2}>
      <View style={[styles.keys, { borderTopColor: c.line }]}>
        <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: c.accentText, fontSize: 17, fontWeight: '600' }}>{tr('Done')}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  keys: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
