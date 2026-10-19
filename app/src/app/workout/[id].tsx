import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  workoutVolume, est1RM, hasLoadRecords, PR_LABEL,
} from '@setlog/core';

import {
  deleteWorkout, saveWorkout, stats, useAppState, type State,
} from '@/data/store';
import type { Workout } from '@/data/types';
import { setLabels, useFormat, type Format } from '@/lib/format';
import type { Tr } from '@/lib/i18n';
import { openTemplateEditor, shareText } from '@/lib/templates';
import { beginWorkout } from '@/lib/workout';
import { useColors } from '@/lib/theme';
import {
  Button, Card, Empty, Icon, IconButton, Page, Txt,
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
    lines.push('', ex?.name || tr('Exercise'));
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
  const c = useColors();
  const w = s.workouts.find((x) => x.id === id);
  if (!w) return <Page><Empty title={tr('Workout not found')} text={tr('It may have been deleted.')} /></Page>;

  const st = stats(s);
  const vol = workoutVolume(w, s.exercises);
  const prs = st.prsByWorkout.get(w.id) || [];
  const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const label = (k: string) => tr((PR_LABEL as Record<string, string>)[k] || k);
  const menu = async () => {
    const c = await actionSheet<string>({
      title: w.name,
      actions: [
        { label: tr('Edit workout'), value: 'edit', icon: 'edit', testID: 'wo-menu-edit' },
        { label: tr('Do this workout again'), value: 'again', icon: 'play' },
        { label: tr('Save as template'), value: 'template', icon: 'copy', testID: 'wo-menu-template' },
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
    <Page>
      <Stack.Screen options={{
        title: w.name,
        headerRight: () => <IconButton icon="more" label={tr('Workout options')} onPress={menu} testID="workout-options" />,
      }} />
      <Txt style={{ fontSize: 28, fontWeight: '800' }}>{w.name}</Txt>
      <Txt tone="ink3" style={{ fontSize: 14, marginTop: 2, marginBottom: 12 }}>
        {`${f.date.full(w.startedAt)} · ${f.date.time(w.startedAt)}–${f.date.time(w.endedAt)}`}
      </Txt>
      <View style={styles.facts}>
        <Fact k={tr('Duration')} v={f.dur(w.endedAt - w.startedAt)} />
        <Fact k={tr('Volume')} v={vol ? f.volume(vol) : '—'} />
        <Fact k={prs.length ? tr('Records') : tr('Sets')} v={String(prs.length || sets)} gold={prs.length > 0} />
      </View>
      {!!w.notes && <Card style={{ marginTop: 10 }}><Txt tone="ink2" style={{ fontSize: 15 }}>{w.notes}</Txt></Card>}
      {w.exercises.map((e) => {
        const ex = s.exercises.get(e.exerciseId);
        const labels = setLabels(e.sets);
        return (
          <View key={e.id} style={{ marginTop: 18 }}>
            <Pressable onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: e.exerciseId } })} accessibilityRole="link" testID={`ex-link-${e.exerciseId}`}>
              <Txt tone="accent" style={{ fontSize: 17, fontWeight: '700', marginBottom: 4 }}>{ex?.name || tr('Unknown exercise')}</Txt>
            </Pressable>
            {!!e.notes && <Txt tone="ink3" style={{ fontSize: 14, marginBottom: 4 }}>{e.notes}</Txt>}
            {e.sets.map((x, i) => {
              const flags: string[] | undefined = st.prSets.get(x.id);
              const oneRm = ex && hasLoadRecords(ex.category) && x.type !== 'warmup' ? est1RM(x.w, x.r, s.settings.formula) : 0;
              return (
                <View key={x.id || i} style={[styles.set, { borderTopColor: c.line }]}>
                  <Txt style={[styles.n, { color: x.type === 'warmup' ? c.warm : x.type === 'drop' ? c.drop : x.type === 'failure' ? c.danger : c.ink2 }]}>{labels[i]}</Txt>
                  <Txt style={{ flex: 1, fontSize: 15, fontVariant: ['tabular-nums'] }}>{f.setText(x, ex?.category)}</Txt>
                  {flags ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                      <Icon name="trophy" size={12} color={c.gold} />
                      <Txt tone="gold" style={{ fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{flags.map(label).join(' · ')}</Txt>
                    </View>
                  ) : oneRm ? <Txt tone="ink3" style={{ fontSize: 13 }}>{`1RM ${f.w(oneRm, 1)}`}</Txt> : null}
                </View>
              );
            })}
          </View>
        );
      })}
      <View style={{ marginTop: 24 }}>
        <Button kind="tinted" icon="repeat" title={tr('Do this workout again')} onPress={() => beginWorkout({ fromWorkout: w }, f)} testID="do-again" />
      </View>
    </Page>
  );
}

function Fact({ k, v, gold }: { k: string; v: string; gold?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.fact, { backgroundColor: c.surface }]}>
      <Txt tone="ink3" style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</Txt>
      <Txt style={{ fontSize: 18, fontWeight: '700', marginTop: 2, color: gold ? c.gold : c.ink }}>{v}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  facts: { flexDirection: 'row', gap: 8 },
  fact: { flex: 1, borderRadius: 12, padding: 10 },
  set: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  n: { width: 22, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
