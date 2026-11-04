// A finished workout from History (docs/design/navigation.md, Detail): back and
// ⋯ in the bar, the name with its date and times, Time · Volume · Sets, its
// tally (records in signal), the notes, then every exercise with its sets
// (records marked), and "Do this workout again". ⋯ edits, repeats, saves as a
// template, shares as text or deletes (with Undo).
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import {
  workoutVolume, est1RM, hasLoadRecords, kgTo, PR_LABEL,
} from '@setlog/core';

import {
  deleteWorkout, saveWorkout, stats, useAppState, type State,
} from '@/data/store';
import type { Workout } from '@/data/types';
import { SPACE, TYPE } from '@/design/tally';
import { setLabels, useFormat, type Format } from '@/lib/format';
import type { Tr } from '@/lib/i18n';
import { openTemplateEditor, shareText } from '@/lib/templates';
import { beginWorkout } from '@/lib/workout';
import { useTally } from '@/lib/theme';
import {
  hm, Mark, MARGIN, StatStrip, tnum, workoutStrokes, WorkoutTally,
} from '@/ui/facts';
import {
  Button, Empty, Icon, IconButton, Page,
} from '@/ui/kit';
import { actionSheet, ask, toast } from '@/ui/overlay';

/** A finished workout as plain text, for sharing. */
function workoutAsText(w: Workout, s: State, f: Format & { tr: Tr }) {
  const { tr } = f;
  const lines = [`${w.name} — ${f.date.medium(w.startedAt)}`];
  const vol = workoutVolume(w, s.exercises);
  lines.push([f.dur(w.endedAt - w.startedAt), vol ? f.volume(vol) : null].filter(Boolean).join(' · '));
  if (w.notes) lines.push(w.notes);
  for (const e of w.exercises) {
    const ex = s.exercises.get(e.exerciseId);
    lines.push('', f.exName(ex) || tr('Exercise'));
    const labels = setLabels(e.sets);
    e.sets.forEach((x, i) => lines.push(`  ${labels[i].padEnd(2)} ${f.setText(x, ex?.category)}`));
    if (e.notes) lines.push(`  ${tr('“{name}”', { name: e.notes })}`);
  }
  return lines.join('\n');
}

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const { colors: t } = useTally();
  const w = s.workouts.find((x) => x.id === id);
  if (!w) return <Page><Empty title={tr('Workout not found')} text={tr('It may have been deleted.')} /></Page>;

  const st = stats(s);
  const vol = workoutVolume(w, s.exercises) as number;
  const prs = st.prsByWorkout.get(w.id) || [];
  const recordSets = new Set<string>(prs.map((p: { setId: string }) => p.setId));
  const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const shown = kgTo(vol || 0, f.unit);
  const label = (k: string) => tr((PR_LABEL as Record<string, string>)[k] || k);
  const tallyLine = [f.plural(sets, 'set'), recordSets.size ? f.plural(recordSets.size, 'record') : ''].filter(Boolean).join(' · ');
  const menu = async () => {
    const c = await actionSheet<string>({
      title: w.name,
      actions: [
        { label: tr('Edit workout'), value: 'edit', icon: 'edit', testID: 'wo-menu-edit' },
        { label: tr('Do this workout again'), value: 'again', icon: 'play' },
        { label: tr('Save as routine'), value: 'template', icon: 'copy', testID: 'wo-menu-template' },
        { label: tr('Share as text'), value: 'share', icon: 'share' },
        { label: tr('Delete workout'), value: 'delete', destructive: true, icon: 'trash', testID: 'wo-menu-delete' },
      ],
    });
    if (c === 'edit') router.push({ pathname: '/workout-edit/[id]', params: { id: w.id } });
    if (c === 'again') beginWorkout({ fromWorkout: w }, f);
    if (c === 'template') openTemplateEditor({ from: w.id });
    if (c === 'share' && !(await shareText(workoutAsText(w, s, f), w.name))) toast(tr('Sharing isn’t available here'));
    if (c === 'delete') {
      const ok = await ask({
        title: tr('Delete this workout?'), message: tr('Its sets and records will be removed from your history.'), ok: tr('Delete'), cancel: tr('Cancel'), destructive: true, testID: 'confirm-delete',
      });
      if (!ok) return;
      const gone = await deleteWorkout(w.id);
      if (router.canGoBack()) router.back();
      if (gone) toast(tr('Workout deleted'), { label: tr('Undo'), fn: () => { saveWorkout(gone); } });
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.paper }} contentContainerStyle={{ paddingTop: SPACE.s1, paddingBottom: SPACE.s12 }} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{
        title: '',
        headerRight: () => <IconButton icon="more" label={tr('Workout options')} onPress={menu} testID="workout-options" />,
      }} />
      <View style={{ paddingHorizontal: MARGIN }}>
        <Text style={{ ...TYPE.title1, color: t.ink }} accessibilityRole="header" testID="workout-title">{w.name}</Text>
        <Text style={{ ...TYPE.footnote, color: t.ink2 }}>
          {`${f.date.full(w.startedAt)} · ${f.date.time(w.startedAt)}–${f.date.time(w.endedAt)}`}
        </Text>
        <StatStrip style={{ marginTop: SPACE.s5 }} stats={[
          { label: tr('Time'), value: hm(w.endedAt - w.startedAt) },
          vol ? { label: tr('Volume'), value: shown >= 100000 ? f.compact(shown) : f.num(shown, 0), unit: f.unit } : { label: tr('Volume'), value: '—' },
          { label: tr('Sets'), value: f.num(sets, 0) },
        ]} />
        <View style={{ marginTop: SPACE.s5 }}>
          <WorkoutTally groups={workoutStrokes(w, recordSets)} size="regular" label={tallyLine} testID="workout-tally" />
        </View>
        <Text style={{ ...TYPE.footnote, color: t.ink2, marginTop: SPACE.s2 }}>{tallyLine}</Text>
        {!!w.notes && <Text style={{ ...TYPE.subhead, color: t.ink, marginTop: SPACE.s4 }}>{w.notes}</Text>}
      </View>

      {w.exercises.map((e) => {
        const ex = s.exercises.get(e.exerciseId);
        const labels = setLabels(e.sets);
        return (
          <View key={e.id}>
            <SectionHeadLink title={f.exName(ex) || tr('Unknown exercise')} testID={`ex-link-${e.exerciseId}`}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: e.exerciseId } })} />
            {!!e.notes && <Text style={{ ...TYPE.footnote, color: t.ink2, paddingHorizontal: MARGIN, marginBottom: SPACE.s1 }}>{e.notes}</Text>}
            {e.sets.map((x, i) => {
              const flags: string[] | undefined = st.prSets.get(x.id);
              const oneRm = ex && hasLoadRecords(ex.category) && x.type !== 'warmup' ? est1RM(x.w, x.r, s.settings.formula) : 0;
              return (
                <View key={x.id || i} style={[styles.set, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                  <Text style={[styles.n, { color: x.type === 'warmup' ? t.ink3 : t.ink2 }]}>{labels[i]}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[{ ...TYPE.body, color: x.type === 'warmup' ? t.ink2 : t.ink }, tnum]} numberOfLines={1}>{f.setText(x, ex?.category)}</Text>
                    {!!flags && <Text style={{ ...TYPE.footnote, color: t.ink2 }} numberOfLines={1}>{flags.map(label).join(' · ')}</Text>}
                  </View>
                  {flags ? <View><Mark style={{ ...TYPE.footnote, fontWeight: '600' }} testID={`record-${x.id}`}>{tr('Record')}</Mark></View>
                    : oneRm ? <Text style={[{ ...TYPE.footnote, color: t.ink2 }, tnum]}>{`1RM ${f.w(oneRm, 1)}`}</Text> : null}
                </View>
              );
            })}
          </View>
        );
      })}
      <View style={{ paddingHorizontal: MARGIN, marginTop: SPACE.s8 }}>
        <Button large title={tr('Do this workout again')} onPress={() => beginWorkout({ fromWorkout: w }, f)} testID="do-again" />
      </View>
    </ScrollView>
  );
}

/** An exercise's name as a section header that opens its page. */
function SectionHeadLink({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) {
  const { colors: t } = useTally();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" testID={testID}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: MARGIN, marginTop: SPACE.s6, marginBottom: SPACE.s1, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ ...TYPE.title3, color: t.ink, flexShrink: 1 }} numberOfLines={1}>{title}</Text>
      <Icon name="chevron" size={13} color={t.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  set: { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, minHeight: 44, paddingVertical: 6, marginHorizontal: MARGIN },
  n: { width: 22, fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
