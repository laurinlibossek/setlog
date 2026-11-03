// The exercise blocks of a draft being edited (a template in the editor or a
// finished workout), each with what it needs from the history, plus the
// "Done" bar above the iPhone number pad. The running workout shows its
// exercises one at a time (active.tsx) with the same blocks.
import { useMemo } from 'react';
import {
  InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { supersetLetters, draftTemplateId } from '@setlog/core';

import {
  exerciseFor, getState, previousSets, stats, useAppSelector, useSettings,
} from '@/data/store';
import type { AnyDraft, DraftKey, EntryDraft } from '@/data/types';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { ExerciseBlock, type EditorMode } from './ExerciseBlock';
import { KEYBOARD_BAR } from './SetRow';

/** What an exercise block of this draft needs: the exercise, last time's sets, records, superset letter. */
export function useBlockProps(draftKey: DraftKey, draft: AnyDraft) {
  const exercises = useAppSelector((s) => s.exercises);
  const workouts = useAppSelector((s) => s.workouts);
  const settings = useSettings();
  // records and previous values follow the history and the settings
  const st = useMemo(() => stats(), [workouts, exercises, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const letters = supersetLetters(draft.exercises) as Map<string, { index: number; letter: string }>;
  const templateId = draftTemplateId(draft) as string | null;
  // editing a finished workout: "previous" is what came before it
  const before = draft.kind === 'edit' ? draft.startedAt : undefined;
  const excludeWorkoutId = draft.kind === 'edit' ? draft.id : null;
  return (e: EntryDraft) => ({
    draftKey,
    entry: e,
    settings,
    ex: draft.kind === 'workout' ? exercises.get(e.exerciseId) : exerciseFor(draftKey, e.exerciseId, getState()),
    prevSets: previousSets(e.exerciseId, { templateId, before, excludeWorkoutId }),
    bests: st.bests.get(e.exerciseId),
    superset: e.supersetId ? letters.get(e.supersetId) : undefined,
  });
}

export function DraftBlocks({ draftKey, mode, draft }: { draftKey: DraftKey; mode: EditorMode; draft: AnyDraft }) {
  const props = useBlockProps(draftKey, draft);
  return <>{draft.exercises.map((e) => <ExerciseBlock key={e.id} {...props(e)} mode={mode} />)}</>;
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
