// The running workout. It slides up over the app; pulling it down (or the
// chevron) minimizes it to the bar above the tabs, and it keeps running.
import { useCallback, useRef, useState } from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { newEntries } from '@setlog/core';

import {
  discardActive, editActive, getState, patchActive, previousSets, useAppSelector, useSettings,
} from '@/data/store';
import type { ActiveWorkout } from '@/data/types';
import { useFormat } from '@/lib/format';
import { pickExercises } from '@/lib/picker';
import { useColors } from '@/lib/theme';
import { useNow } from '@/lib/useNow';
import { confirmDiscard, finishFlow } from '@/lib/workout';
import { Button, Empty, Icon } from '@/ui/kit';
import {
  OverlayHost, actionSheet, pickDateTime, toast,
} from '@/ui/overlay';
import { DraftBlocks, KeyboardDoneBar } from '@/ui/workout/DraftBlocks';
import { RestPanel, RestPill } from '@/ui/workout/Rest';

function KeepAwake() { useKeepAwake('workout'); return null; }

function Elapsed({ since }: { since: number }) {
  const now = useNow(1000);
  const { clock } = useFormat();
  const c = useColors();
  return <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }} testID="elapsed">{clock(Math.max(0, Math.floor((now - since) / 1000)))}</Text>;
}

export default function ActiveWorkoutScreen() {
  const current = useAppSelector((s) => s.active);
  // after Finish or Discard the workout is gone while the screen closes; keep showing it
  const last = useRef(current);
  if (current) last.current = current;
  const a = current || last.current;
  const settings = useSettings();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [restOpen, setRestOpen] = useState(false);
  const closeRest = useCallback(() => setRestOpen(false), []);
  const top = Platform.OS === 'ios' ? 0 : insets.top;

  if (!a) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: top }}>
        <Empty title={tr('No workout running')}><Button title={tr('Close')} onPress={() => router.back()} /></Empty>
        <OverlayHost />
      </View>
    );
  }

  const addExercises = async () => {
    const ids = await pickExercises({ multi: true, title: tr('Add exercises') });
    if (!ids) return;
    editActive((d) => { d.exercises.push(...newEntries(ids, { previousSets: (id: string) => previousSets(id) })); });
  };
  const discard = async () => {
    const cur = getState().active;
    if (!cur || !(await confirmDiscard(cur, tr('Discard this workout?'), tr))) return;
    discardActive();
    router.back();
    setTimeout(() => toast(tr('Workout discarded')), 300);
  };
  const changeStart = async () => {
    const cur = getState().active;
    if (!cur) return;
    const t = await pickDateTime({
      title: tr('Start time'), value: cur.startedAt, max: Date.now(), maxMessage: tr('The start time has to be in the past'), ok: tr('Set'),
    });
    if (t !== null && getState().active) patchActive({ startedAt: t });
  };
  const workoutMenu = async () => {
    const cur = getState().active;
    if (!cur) return;
    const v = await actionSheet<string>({
      title: cur.name,
      actions: [
        { label: cur.showNotes || cur.notes ? tr('Remove workout note') : tr('Add workout note'), value: 'note', icon: 'note', testID: 'menu-workout-note' },
        { label: tr('Change start time'), value: 'time', icon: 'clock', testID: 'menu-start-time' },
        { label: tr('Discard workout'), value: 'discard', destructive: true, icon: 'trash' },
      ],
    });
    if (v === 'note') {
      const on = !(cur.showNotes || cur.notes);
      patchActive({ showNotes: on, notes: on ? cur.notes : '' });
    }
    if (v === 'time') changeStart();
    if (v === 'discard') discard();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {settings.keepAwake !== false && <KeepAwake />}
      <View style={[styles.bar, { paddingTop: top + 8, backgroundColor: c.bg, borderBottomColor: c.line }]}>
        <View style={[styles.side, { gap: 6 }]}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('Minimize workout')} testID="minimize"
            style={({ pressed }) => [styles.navBtn, { backgroundColor: pressed ? c.surface3 : c.surface2 }]}>
            <Icon name="chevronDown" size={20} color={c.ink2} />
          </Pressable>
          <RestPill onPress={() => setRestOpen(true)} />
        </View>
        <Elapsed since={a.startedAt} />
        <View style={[styles.side, { justifyContent: 'flex-end' }]}>
          <Pressable onPress={() => finishFlow(f)} accessibilityRole="button" testID="finish-workout"
            style={({ pressed }) => [styles.finish, { backgroundColor: c.done, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={{ color: c.doneInk, fontSize: 15, fontWeight: '700' }}>{tr('Finish')}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: insets.bottom + 48 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <WorkoutHead a={a} onMenu={workoutMenu} onStart={changeStart} />
        <DraftBlocks draftKey="active" mode="active" draft={a} />
        {!a.exercises.length && <Empty title={tr('No exercises yet')} text={tr('Add the exercises you’re about to do. Your numbers from last time show up next to every set.')} />}
        <View style={{ gap: 10, marginTop: 16 }}>
          <Button large kind="tinted" icon="plus" title={tr('Add exercises')} onPress={addExercises} testID="add-exercises" />
          <Button kind="danger" title={tr('Discard workout')} onPress={discard} testID="discard-workout" />
        </View>
      </ScrollView>

      <KeyboardDoneBar />
      {restOpen && <RestPanel onClose={closeRest} />}
      <OverlayHost />
    </View>
  );
}

function WorkoutHead({ a, onMenu, onStart }: { a: ActiveWorkout; onMenu: () => void; onStart: () => void }) {
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  return (
    <View style={{ paddingHorizontal: 4, paddingTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput value={a.name} onChangeText={(v) => patchActive({ name: v })} accessibilityLabel={tr('Workout name')} testID="workout-name"
          returnKeyType="done" style={{ flex: 1, minWidth: 0, color: c.ink, fontSize: 26, fontWeight: '800', paddingVertical: 4 }} />
        <Pressable onPress={onMenu} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('Workout options')} testID="workout-menu"
          style={({ pressed }) => [styles.navBtn, { backgroundColor: pressed ? c.surface3 : c.accentSoft }]}>
          <Icon name="more" size={18} color={c.accentText} />
        </Pressable>
      </View>
      <Pressable onPress={onStart} accessibilityRole="button" accessibilityHint={tr('Change start time')} testID="start-time" style={{ flexDirection: 'row', gap: 14, marginTop: 2, alignSelf: 'flex-start' }}>
        <View style={styles.meta}><Icon name="calendar" size={13} color={c.ink3} /><Text style={{ color: c.ink3, fontSize: 14 }}>{f.date.medium(a.startedAt)}</Text></View>
        <View style={styles.meta}><Icon name="clock" size={13} color={c.ink3} /><Text style={{ color: c.ink3, fontSize: 14 }} testID="started-at">{tr('Started {time}', { time: f.date.time(a.startedAt) })}</Text></View>
      </Pressable>
      {!!a.templateNotes && (
        <View style={[styles.tplNotes, { backgroundColor: c.surface }]}>
          <Icon name="note" size={15} color={c.ink2} />
          <Text style={{ color: c.ink2, fontSize: 14, flex: 1 }}>{a.templateNotes}</Text>
        </View>
      )}
      {(a.showNotes || !!a.notes) && (
        <TextInput value={a.notes} onChangeText={(v) => patchActive({ notes: v })} multiline placeholder={tr('How did it go?')} placeholderTextColor={c.ink3} testID="workout-notes"
          style={[styles.notes, { color: c.ink, backgroundColor: c.surface }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  navBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  finish: { height: 34, borderRadius: 17, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tplNotes: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 10, marginTop: 10, alignItems: 'flex-start' },
  notes: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10, fontSize: 15, minHeight: 60 },
});
