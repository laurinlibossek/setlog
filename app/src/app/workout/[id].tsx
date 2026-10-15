import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  workoutVolume, est1RM, hasLoadRecords, PR_LABEL,
} from '@setlog/core';

import { stats, useAppState } from '@/data/store';
import { setLabels, useFormat } from '@/lib/format';
import { beginWorkout } from '@/lib/workout';
import { useColors } from '@/lib/theme';
import {
  Button, Card, Empty, Icon, Page, Txt,
} from '@/ui/kit';

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

  return (
    <Page>
      <Stack.Screen options={{ title: w.name }} />
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
