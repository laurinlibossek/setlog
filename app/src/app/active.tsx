// The running workout (docs/design/navigation.md, The session). It slides up
// over the app; the chevron (or pulling it down) minimizes it to the bar above
// the tabs, and it keeps running. Header with the hero tally, the exercise on
// screen with its set rows, the others as rows ("Up next"), and the Action
// bar: Log → Rest → Finish workout. The keypad takes the Action bar's place
// while a number is typed.
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type ScrollViewInstance, type TextInputInstance, type ViewInstance,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import {
  newEntries, sessionState, hasPendingSets, placeholders, loggedFields, rateSet, setRir, REST_PRESETS,
} from '@setlog/core';

import {
  adjustRest, discardActive, editActive, getState, patchActive, previousSets, skipRest, startRest, useAppSelector, useSettings,
} from '@/data/store';
import type { ActiveWorkout, EntryDraft, SetDraft } from '@/data/types';
import { SPACE, STROKE, TYPE, CONTROL } from '@/design/tally';
import { useFormat } from '@/lib/format';
import { pickExercises } from '@/lib/picker';
import { useTally } from '@/lib/theme';
import { confirmDiscard, finishFlow } from '@/lib/workout';
import { Empty, Icon } from '@/ui/kit';
import {
  OverlayHost, actionSheet, pickDateTime, toast,
} from '@/ui/overlay';
import { ActionBar, type ActionBarState } from '@/ui/tally/ActionBar';
import { EffortPicker } from '@/ui/tally/EffortPicker';
import { CapsuleButton } from '@/ui/tally/RestBar';
import { Tally } from '@/ui/tally/Tally';
import { useBlockProps } from '@/ui/workout/DraftBlocks';
import { ExerciseBlock } from '@/ui/workout/ExerciseBlock';
import {
  KeypadHost, SessionProvider, UnitRows, useElapsed, useSession, useSessionStrokes,
} from '@/ui/workout/Session';
import type { Field } from '@/ui/workout/SetRow';
import { effortText, setValueText } from '@/ui/workout/text';

function KeepAwake() { useKeepAwake('workout'); return null; }

type Unit = { id: string; entries: EntryDraft[] };
/** core sessionState: the unit on screen and the set to log next */
type SessionAt = { units: Unit[]; unit: Unit | null; next: { entry: EntryDraft; set: SetDraft; index: number } | null };

export default function ActiveWorkoutScreen() {
  const current = useAppSelector((s) => s.active);
  // after Finish or Discard the workout is gone while the screen closes; keep showing it
  const last = useRef(current);
  if (current) last.current = current;
  const a = current || last.current;
  const { tr } = useFormat();
  const { colors: t } = useTally();
  const insets = useSafeAreaInsets();
  // the field the keypad types into, so the list keeps it in view
  const reveal = useRef<(ref: TextInputInstance | null) => void>(() => {});
  const onTarget = useCallback((ref: TextInputInstance | null) => reveal.current(ref), []);

  if (!a) {
    return (
      <View style={{ flex: 1, backgroundColor: t.paper, paddingTop: Platform.OS === 'ios' ? 0 : insets.top }}>
        <Empty title={tr('No workout running')}><CapsuleButton title={tr('Close')} onPress={() => router.back()} /></Empty>
        <OverlayHost />
      </View>
    );
  }
  return (
    <SessionProvider onTarget={onTarget}>
      <Running a={a} reveal={reveal} />
    </SessionProvider>
  );
}

function Running({ a, reveal }: { a: ActiveWorkout; reveal: { current: (ref: TextInputInstance | null) => void } }) {
  const settings = useSettings();
  const f = useFormat();
  const { tr } = f;
  const { colors: t } = useTally();
  const insets = useSafeAreaInsets();
  const session = useSession()!;
  const nameRef = useRef<TextInputInstance>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const contentRef = useRef<ViewInstance>(null);
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const targetRef = useRef<TextInputInstance | null>(null);
  const unitY = useRef(0);
  const scrollToUnit = useRef(false);
  const [dragging, setDragging] = useState(false);

  // ---------- where the session is ----------
  const st = useMemo(() => sessionState(a, { current: a.current ?? null, restEntryId: a.rest?.entryId ?? null }) as SessionAt, [a]);
  const live = st.next?.set.id ?? null;
  const strokes = useSessionStrokes(a, live);
  const at = st.unit ? st.units.indexOf(st.unit) : -1;
  const before = at > 0 ? st.units.slice(0, at) : [];
  const after = at >= 0 ? st.units.slice(at + 1) : [];
  const blockProps = useBlockProps('active', a);

  // ---------- keeping the keypad's field in view ----------
  const show = (ref: TextInputInstance | null) => {
    targetRef.current = ref;
    if (!ref || !contentRef.current) return;
    ref.measureLayout(contentRef.current, (_x, y, _w, h) => {
      const top = scrollY.current;
      const height = viewH.current;
      if (y + h + SPACE.s4 > top + height) scrollRef.current?.scrollTo({ y: y + h + SPACE.s4 - height, animated: true });
      else if (y - SPACE.s4 < top) scrollRef.current?.scrollTo({ y: Math.max(0, y - SPACE.s4), animated: true });
    }, () => {});
  };
  reveal.current = show;

  // ---------- actions ----------
  const jump = (entryId: string) => {
    session.close();
    scrollToUnit.current = true;
    patchActive({ current: entryId });
  };
  const addExercises = async () => {
    const ids = await pickExercises({ multi: true, title: tr('Add exercises') });
    if (!ids) return;
    editActive((d) => { d.exercises.push(...newEntries(ids, { previousSets: (id: string) => previousSets(id) })); });
  };
  const discard = async () => {
    const cur = getState().active;
    if (!cur || !(await confirmDiscard(cur, tr('Discard this workout?'), tr))) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    session.close();
    discardActive();
    router.back();
    setTimeout(() => toast(tr('Workout discarded')), 300);
  };
  const changeStart = async () => {
    const cur = getState().active;
    if (!cur) return;
    const v = await pickDateTime({
      title: tr('Start time'), value: cur.startedAt, max: Date.now(), maxMessage: tr('The start time has to be in the past'), ok: tr('Set'),
    });
    if (v !== null && getState().active) patchActive({ startedAt: v });
  };
  const finish = () => { session.close(); finishFlow(f); };
  const workoutMenu = async () => {
    const cur = getState().active;
    if (!cur) return;
    const v = await actionSheet<string>({
      title: cur.name,
      actions: [
        { label: tr('Rename'), value: 'rename', icon: 'edit', testID: 'menu-rename' },
        { label: cur.showNotes || cur.notes ? tr('Remove workout note') : tr('Add workout note'), value: 'note', icon: 'note', testID: 'menu-workout-note' },
        { label: tr('Change start time'), value: 'time', icon: 'clock', testID: 'menu-start-time' },
        cur.rest ? null : { label: tr('Start rest timer'), value: 'rest', icon: 'timer', testID: 'menu-rest-timer' },
        { label: hasPendingSets(cur) ? tr('Finish early') : tr('Finish workout'), value: 'finish', icon: 'check', testID: 'menu-finish' },
        { label: tr('Discard workout'), value: 'discard', destructive: true, icon: 'trash', testID: 'menu-discard' },
      ],
    });
    if (v === 'rename') setTimeout(() => nameRef.current?.focus(), 250);
    if (v === 'note') {
      const on = !(cur.showNotes || cur.notes);
      patchActive({ showNotes: on, notes: on ? cur.notes : '' });
    }
    if (v === 'time') changeStart();
    if (v === 'rest') {
      const sec = await actionSheet<string>({
        title: tr('Rest timer'), message: tr('Starts on its own when you check off a set. Start one by hand:'),
        actions: (REST_PRESETS as number[]).map((s) => ({ label: f.clock(s), value: String(s), testID: `rest-start-${s}` })),
      });
      if (sec) startRest(Number(sec), tr('Rest'));
    }
    if (v === 'finish') finish();
    if (v === 'discard') discard();
  };

  // ---------- the Action bar ----------
  const next = st.next;
  const nextPh = useMemo(() => {
    if (!next) return null;
    const rows = placeholders(next.entry, previousSets(next.entry.exerciseId, { templateId: a.templateId }), settings) as { ph: Record<string, string> }[];
    return rows[next.index]?.ph || {};
  }, [next, a.templateId, settings]);
  const exercises = useAppSelector((s) => s.exercises);
  let bar: ActionBarState;
  if (!a.exercises.length) bar = { kind: 'add', label: tr('Add exercises'), onAdd: addExercises };
  else if (a.rest) {
    const r = a.rest;
    const entry = r.entryId ? a.exercises.find((e) => e.id === r.entryId) : undefined;
    const i = entry && r.setId ? entry.sets.findIndex((x) => x.id === r.setId) : -1;
    const rated = entry && i >= 0 && entry.sets[i].done ? entry.sets[i] : null;
    bar = {
      kind: 'rest', end: r.end, total: r.total, onAdjust: adjustRest, onSkip: skipRest,
      labels: {
        rest: tr('Rest'), skip: tr('Skip'), minus: tr('−15 s'), plus: tr('+15 s'), clock: f.clock,
        left: (secs) => tr('Rest timer, {n} seconds left', { n: secs }),
      },
      effort: rated && entry ? (
        <View style={styles.effort}>
          <Text style={{ ...TYPE.subhead, color: t.ink2, flexShrink: 1 }}>{tr('Reps left?')}</Text>
          <EffortPicker value={setRir(rated) as number | null} label={tr('Reps left?')} optionLabel={(n) => effortText(n, tr)}
            onChange={(v) => editActive((_d, e) => { const s = e.sets.find((x) => x.id === rated.id); if (s) rateSet(s, v); }, entry.id)} />
        </View>
      ) : undefined,
    };
  } else if (next) {
    const ex = exercises.get(next.entry.exerciseId);
    const fields = (ex ? loggedFields(ex.category) : []) as Field[];
    const vals = Object.fromEntries(fields.map((k) => [k, next.set[k] || nextPh?.[k] || ''])) as Record<Field, string>;
    const value = ex ? setValueText(vals, ex.category, f, tr) : '';
    bar = {
      kind: 'log', label: value ? tr('Log {set}', { set: value }) : tr('Log set'),
      a11y: ex ? `${value ? tr('Log {set}', { set: value }) : tr('Log set')}, ${f.exName(ex)}` : undefined,
      onLog: () => session.logSet(next.entry.id, next.set.id),
    };
  } else if (hasPendingSets(a)) bar = { kind: 'next', label: tr('Next exercise'), onNext: () => patchActive({ current: null }) };
  else bar = { kind: 'finish', label: tr('Finish workout'), onFinish: finish };

  const countText = [
    tr('{done} of {total} sets', { done: strokes.done, total: strokes.total }),
    strokes.records ? (strokes.records === 1 ? tr('1 record') : tr('{n} records', { n: strokes.records })) : '',
  ].filter(Boolean).join(' · ');
  const top = Platform.OS === 'ios' ? 0 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: t.paper }}>
      {settings.appKeepAwake === true && <KeepAwake />}
      <View style={[styles.top, { paddingTop: top + SPACE.s1 }]}>
        <Pressable onPress={() => { session.close(); router.back(); }} accessibilityRole="button" accessibilityLabel={tr('Minimize workout')} testID="minimize"
          style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? t.paper3 : 'transparent' }]}>
          <Icon name="chevronDown" size={22} color={t.ink} />
        </Pressable>
        <Pressable onPress={workoutMenu} accessibilityRole="button" accessibilityLabel={tr('Workout options')} testID="workout-menu"
          style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? t.paper3 : 'transparent' }]}>
          <Icon name="more" size={22} color={t.ink} />
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACE.s8 }} scrollEnabled={!dragging}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets scrollEventThrottle={32}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; if (targetRef.current) show(targetRef.current); }}>
        <View ref={contentRef} collapsable={false}>
          <View style={styles.head}>
            <View style={styles.titleRow}>
              <TextInput ref={nameRef} value={a.name} onChangeText={(v) => patchActive({ name: v })} onFocus={session.close} accessibilityLabel={tr('Workout name')} testID="workout-name"
                returnKeyType="done" style={[styles.name, { color: t.ink }]} />
              <Pressable onPress={changeStart} accessibilityRole="button" accessibilityHint={tr('Change start time')} testID="start-time" hitSlop={8}>
                <View testID="started-at"><Elapsed since={a.startedAt} /></View>
              </Pressable>
            </View>
            {strokes.total > 0 && (
              <View accessible accessibilityRole="image" testID="session-tally"
                accessibilityLabel={`${tr('{done} of {total} sets logged', { done: strokes.done, total: strokes.total })}${strokes.records ? `, ${countText.split(' · ')[1]}` : ''}`}
                style={styles.hero}>
                {a.exercises.filter((e) => e.sets.length).map((e) => <Tally key={e.id} groups={[strokes.byEntry.get(e.id) || []]} size="hero" label="" />)}
              </View>
            )}
            {strokes.total > 0 && <Text style={{ ...TYPE.footnote, color: t.ink2, marginTop: SPACE.s2, fontVariant: ['tabular-nums'] }} testID="session-count">{countText}</Text>}
            {!!a.templateNotes && <Text style={{ ...TYPE.subhead, color: t.ink2, marginTop: SPACE.s3 }}>{a.templateNotes}</Text>}
            {(a.showNotes || !!a.notes) && (
              <TextInput value={a.notes} onChangeText={(v) => patchActive({ notes: v })} onFocus={session.close} multiline placeholder={tr('How did it go?')} placeholderTextColor={t.ink3} testID="workout-notes"
                style={[styles.notes, { color: t.ink, backgroundColor: t.paper3 }]} />
            )}
          </View>

          {before.length > 0 && (
            <View style={{ marginTop: SPACE.s4 }}>
              <UnitRows units={before} strokes={strokes.byEntry} onJump={jump} />
            </View>
          )}
          {st.unit && (
            <View onLayout={(e) => {
              unitY.current = e.nativeEvent.layout.y;
              if (scrollToUnit.current) { scrollToUnit.current = false; scrollRef.current?.scrollTo({ y: Math.max(0, unitY.current - SPACE.s4), animated: true }); }
            }}>
              {st.unit.entries.map((e) => <ExerciseBlock key={e.id} {...blockProps(e)} mode="active" live={live} />)}
            </View>
          )}
          {after.length > 0 && (
            <View style={{ marginTop: SPACE.s6 }}>
              <Text style={{ ...TYPE.headline, color: t.ink, paddingHorizontal: SPACE.s5, marginBottom: SPACE.s1 }} accessibilityRole="header">{tr('Up next')}</Text>
              <UnitRows units={after} strokes={strokes.byEntry} onJump={jump} draggable onDragging={setDragging} />
            </View>
          )}
          {!a.exercises.length && <Empty title={tr('No exercises yet')} text={tr('Add the exercises you’re about to do. Your numbers from last time show up next to every set.')} />}
          <View style={styles.end}>
            {a.exercises.length > 0 && (
              <CapsuleButton kind="secondary" title={tr('Add exercises')} onPress={addExercises} testID="add-exercises" icon={<Icon name="plus" size={17} color={t.ink} />} />
            )}
            <Pressable onPress={discard} accessibilityRole="button" testID="discard-workout" style={styles.discard}>
              <Text style={{ ...TYPE.body, color: t.danger }}>{tr('Discard workout')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {session.target ? <KeypadHost /> : <ActionBar state={bar} />}
      <OverlayHost />
    </View>
  );
}

function Elapsed({ since }: { since: number }) {
  const secs = useElapsed(since);
  const { clock } = useFormat();
  const { colors: t } = useTally();
  return <Text style={{ ...TYPE.numberM, fontWeight: '500', color: t.ink2, fontVariant: ['tabular-nums'] }} testID="elapsed">{clock(secs)}</Text>;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.s2 },
  iconBtn: { width: CONTROL.hitMin, height: CONTROL.hitMin, borderRadius: CONTROL.hitMin / 2, alignItems: 'center', justifyContent: 'center' },
  head: { paddingHorizontal: SPACE.s5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3 },
  name: { ...TYPE.title1, flex: 1, minWidth: 0, paddingVertical: 2, paddingHorizontal: 0 },
  hero: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: STROKE.group, rowGap: SPACE.s2, marginTop: SPACE.s3 },
  notes: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: SPACE.s3, fontSize: 15, minHeight: 60 },
  effort: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s3 },
  end: { paddingHorizontal: SPACE.s5, paddingTop: SPACE.s6, gap: SPACE.s2, alignItems: 'flex-start' },
  discard: { minHeight: CONTROL.hitMin, justifyContent: 'center' },
});
