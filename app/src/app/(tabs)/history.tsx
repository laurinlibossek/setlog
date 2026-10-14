import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { startOfMonth, workoutVolume, bestSet } from '@setlog/core';

import { stats, useAppState, type State } from '@/data/store';
import type { Workout } from '@/data/types';
import { useFormat, type Format } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button, Card, Empty, Icon, LargeTitle, Txt,
} from '@/ui/kit';

type Row = { kind: 'month'; m: number; count: number } | { kind: 'workout'; w: Workout };

export default function HistoryTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [limit, setLimit] = useState(40);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const counts = new Map<number, number>();
    for (const w of s.workouts) { const m = startOfMonth(w.startedAt); counts.set(m, (counts.get(m) || 0) + 1); }
    let cur = -1;
    for (const w of s.workouts.slice(0, limit)) {
      const m = startOfMonth(w.startedAt);
      if (m !== cur) { out.push({ kind: 'month', m, count: counts.get(m) || 0 }); cur = m; }
      out.push({ kind: 'workout', w });
    }
    return out;
  }, [s.workouts, limit]);

  if (!s.workouts.length) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        <LargeTitle title={tr('History')} />
        <Empty title={tr('No workouts yet')} text={tr('Bring your workouts over from the Setlog web app: make a backup there, then restore it here in Settings.')}>
          <Button kind="tinted" icon="download" title={tr('Restore from backup')} onPress={() => router.push('/settings')} testID="history-restore" />
        </Empty>
      </View>
    );
  }
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 32 }}
      data={rows}
      keyExtractor={(r) => (r.kind === 'month' ? 'm' + r.m : r.w.id)}
      ListHeaderComponent={<LargeTitle title={tr('History')} />}
      renderItem={({ item }) => (item.kind === 'month'
        ? (
          <View style={st.month}>
            <Txt style={{ fontSize: 20, fontWeight: '700' }}>{f.date.monthYear(item.m)}</Txt>
            <Txt tone="ink3" style={{ fontSize: 14 }}>{f.plural(item.count, 'workout')}</Txt>
          </View>
        )
        : <View style={{ paddingHorizontal: 16, marginBottom: 10 }}><WorkoutCard w={item.w} s={s} f={f} /></View>)}
      ListFooterComponent={s.workouts.length > limit
        ? <View style={{ paddingHorizontal: 16 }}><Button kind="tinted" title={tr('Show older workouts')} onPress={() => setLimit(limit + 60)} /></View>
        : null}
      initialNumToRender={12}
      windowSize={7}
    />
  );
}

export function WorkoutCard({ w, s, f }: { w: Workout; s: State; f: Format & { tr: (t: string, v?: Record<string, string | number>) => string } }) {
  const c = useColors();
  const { tr } = f;
  const prs = stats(s).prsByWorkout.get(w.id)?.length || 0;
  const vol = workoutVolume(w, s.exercises);
  return (
    <Card onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })} testID={`workout-${w.id}`}>
      <Txt style={{ fontSize: 17, fontWeight: '700' }} numberOfLines={1}>{w.name}</Txt>
      <Txt tone="ink3" style={{ fontSize: 13, marginTop: 2 }}>{`${f.date.medium(w.startedAt)} · ${f.date.time(w.startedAt)}`}</Txt>
      <View style={st.facts}>
        <Fact icon="clock" text={f.dur((w.endedAt || w.startedAt) - w.startedAt)} color={c.ink2} />
        {vol > 0 && <Fact icon="weight" text={f.volume(vol)} color={c.ink2} />}
        {prs > 0 && <Fact icon="trophy" text={`${prs} ${prs > 1 ? tr('PRs') : tr('PR')}`} color={c.gold} />}
      </View>
      <View style={st.linesHead}>
        <Txt tone="ink3" style={st.head}>{tr('Exercise')}</Txt>
        <Txt tone="ink3" style={st.head}>{tr('Best set')}</Txt>
      </View>
      {w.exercises.slice(0, 6).map((e) => {
        const ex = s.exercises.get(e.exerciseId);
        const b = bestSet(e.sets, ex?.category, s.settings.formula);
        return (
          <View key={e.id} style={st.line}>
            <Txt tone="ink2" style={{ fontSize: 14, flex: 1 }} numberOfLines={1}>{`${e.sets.length} × ${ex?.name || tr('Unknown exercise')}`}</Txt>
            <Txt tone="ink2" style={{ fontSize: 14, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{b ? f.setText(b, ex?.category) : ''}</Txt>
          </View>
        );
      })}
      {w.exercises.length > 6 && <Txt tone="ink3" style={{ fontSize: 13, marginTop: 4 }}>{tr('+ {n} more', { n: w.exercises.length - 6 })}</Txt>}
    </Card>
  );
}

function Fact({ icon, text, color }: { icon: 'clock' | 'weight' | 'trophy'; text: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={13} color={color} />
      <Txt style={{ fontSize: 13, color }}>{text}</Txt>
    </View>
  );
}

const st = StyleSheet.create({
  month: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 14, marginBottom: 8 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  linesHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 2 },
  head: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  line: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
});
