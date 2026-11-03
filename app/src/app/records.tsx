// Records (Progress → Records): every workout where an exercise set a record,
// the newest first, as counted for "Start history from": one row per exercise
// with what went up and its headline number. Tap one for the exercise.
import { useMemo } from 'react';
import { FlatList } from 'react-native';
import { router } from 'expo-router';
import { PR_LABEL } from '@setlog/core';

import { stats, useAppState } from '@/data/store';
import { SPACE } from '@/design/tally';
import { useFormat } from '@/lib/format';
import { useTally } from '@/lib/theme';
import { Empty } from '@/ui/kit';
import { ListRow } from '@/ui/tally/ListRow';

type Pr = { exerciseId: string; metric: string; value: number };
type Row = { exerciseId: string; at: number; key: string; prs: Pr[] };
// which record's number a row shows, first one found
const LEAD = ['e1rm', 'weight', 'reps', 'distance', 'time', 'volume'];

export default function RecordsScreen() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const { colors: t } = useTally();
  const list = useMemo(() => {
    const st = stats(s);
    const out: Row[] = [];
    for (const w of s.workouts) {
      const byEx = new Map<string, Pr[]>();
      for (const p of (st.prsByWorkout.get(w.id) || []) as Pr[]) {
        if (!s.exercises.has(p.exerciseId)) continue;
        if (!byEx.has(p.exerciseId)) byEx.set(p.exerciseId, []);
        byEx.get(p.exerciseId)!.push(p);
      }
      for (const [exerciseId, prs] of byEx) out.push({ exerciseId, at: w.startedAt, key: `${w.id}-${exerciseId}`, prs });
    }
    return out;
  }, [s.workouts, s.exercises, s.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = (p: Pr) => {
    if (['e1rm', 'weight', 'volume'].includes(p.metric)) return f.wu(p.value);
    if (p.metric === 'distance') return f.dist(p.value);
    if (p.metric === 'time') return f.clock(p.value);
    return f.num(p.value, 0);
  };
  const lead = (r: Row) => [...r.prs].sort((a, b) => (LEAD.indexOf(a.metric) + 1 || 99) - (LEAD.indexOf(b.metric) + 1 || 99))[0];
  const label = (p: Pr) => tr((PR_LABEL as Record<string, string>)[p.metric] || p.metric);
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.paper }}
      contentContainerStyle={{ paddingTop: SPACE.s2, paddingBottom: SPACE.s8 }}
      contentInsetAdjustmentBehavior="automatic"
      data={list}
      keyExtractor={(p) => p.key}
      renderItem={({ item, index }) => (
        <ListRow first={index === 0} title={f.exName(s.exercises.get(item.exerciseId))} trailing={value(lead(item))} testID={`record-${index}`}
          subtitle={`${f.date.short(item.at)} · ${item.prs.map(label).join(', ')}`}
          onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.exerciseId } })} />
      )}
      ListEmptyComponent={<Empty title={tr('No records yet')} text={tr('Your best weight, reps, volume and estimated 1RM per exercise show up here.')} />}
      initialNumToRender={20}
    />
  );
}
