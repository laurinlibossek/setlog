import { useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  BODY_PARTS, CATEGORIES, exerciseRecords, hasLoadRecords, est1RM,
} from '@setlog/core';

import { allSessions, stats, useAppState } from '@/data/store';
import { setLabels, useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import {
  Button, Cell, Empty, Group, Page, Segments, SectionTitle, Txt,
} from '@/ui/kit';

type Rec = { value: number; at: number; w?: number; r?: number } | null;

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const ex = s.exercises.get(id);
  const every = allSessions(s).get(id) || [];
  const counted = stats(s).byExercise.get(id) || [];
  const [tab, setTab] = useState<'history' | 'records'>(every.length ? 'history' : 'records');
  const [limit, setLimit] = useState(20);
  if (!ex) return <Page><Empty title={tr('Exercise not found')} text={tr('It may have been merged or deleted.')} /></Page>;

  const label = (list: { id: string; label: string }[], key: string) => tr(list.find((x) => x.id === key)?.label || 'Other');
  const load = hasLoadRecords(ex.category);
  const rec = exerciseRecords(counted, ex.category, s.settings.formula) as unknown as Record<string, Rec> & { repMax: Map<number, { w: number; at: number }>; sessions: number; totalSets: number; totalReps: number; totalVolume: number };
  const cards: [string, string, string][] = [];
  const add = (k: string, r: Rec, v: string, detail = '') => { if (r) cards.push([k, v, `${detail ? `${detail} · ` : ''}${f.date.short(r.at)}`]); };
  if (load) {
    add(tr('Estimated 1RM'), rec.e1rm, rec.e1rm ? f.wu(rec.e1rm.value) : '', rec.e1rm ? `${f.w(rec.e1rm.w)} × ${rec.e1rm.r}` : '');
    add(tr('Heaviest weight'), rec.weight, rec.weight ? f.wu(rec.weight.value) : '', rec.weight ? `× ${rec.weight.r}` : '');
    add(tr('Best set volume'), rec.volume, rec.volume ? f.wu(rec.volume.value) : '');
    add(tr('Best session volume'), rec.sessionVolume, rec.sessionVolume ? f.wu(rec.sessionVolume.value) : '');
  }
  if (rec.reps && ['reps', 'assisted_bw', 'weighted_bw'].includes(ex.category)) add(tr('Most reps'), rec.reps, f.num(rec.reps.value, 0));
  if (rec.distance) add(tr('Longest distance'), rec.distance, f.dist(rec.distance.value));
  if (rec.time) add(tr('Longest time'), rec.time, f.clock(rec.time.value));

  return (
    <Page>
      <Stack.Screen options={{ title: ex.name }} />
      <Txt style={{ fontSize: 26, fontWeight: '800' }}>{ex.name}</Txt>
      <Txt tone="ink3" style={{ fontSize: 14, marginTop: 2, marginBottom: 14 }}>
        {`${label(BODY_PARTS, ex.bodyPart)} · ${label(CATEGORIES, ex.category)}`}
      </Txt>
      <Segments value={tab} onChange={setTab} options={[{ value: 'history', label: tr('History') }, { value: 'records', label: tr('Records') }]} />

      {tab === 'history' && (every.length ? (
        <View>
          {every.slice(0, limit).map((x) => {
            const labels = setLabels(x.entry.sets);
            return (
              <View key={x.workoutId + x.entry.id} style={{ marginTop: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Txt style={{ fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{x.name}</Txt>
                  <Txt tone="ink3" style={{ fontSize: 13 }}>{f.date.short(x.startedAt)}</Txt>
                </View>
                {x.entry.sets.map((set, i) => (
                  <View key={i} style={[st.set, { borderTopColor: c.line }]}>
                    <Txt tone="ink2" style={st.n}>{labels[i]}</Txt>
                    <Txt style={{ flex: 1, fontSize: 15 }}>{f.setText(set, ex.category)}</Txt>
                    {load && set.type !== 'warmup' && (set.w ?? 0) > 0 && (set.r ?? 0) > 0
                      && <Txt tone="ink3" style={{ fontSize: 13 }}>{`1RM ${f.w(est1RM(set.w, set.r, s.settings.formula), 1)}`}</Txt>}
                  </View>
                ))}
              </View>
            );
          })}
          {every.length > limit && <View style={{ marginTop: 14 }}><Button kind="tinted" title={tr('Show more')} onPress={() => setLimit(limit + 40)} /></View>}
        </View>
      ) : <Empty title={tr('Not done yet')} text={tr('Every workout with this exercise will show up here.')} />)}

      {tab === 'records' && (counted.length ? (
        <View>
          <View style={st.records}>
            {cards.map(([k, v, d]) => (
              <View key={k} style={[st.rec, { backgroundColor: c.surface }]}>
                <Txt tone="ink3" style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</Txt>
                <Txt style={{ fontSize: 20, fontWeight: '800', marginTop: 4 }}>{v}</Txt>
                <Txt tone="ink3" style={{ fontSize: 12, marginTop: 2 }}>{d}</Txt>
              </View>
            ))}
          </View>
          <SectionTitle>{tr('Lifetime')}</SectionTitle>
          <Group>
            <Cell first title={tr('Sessions')} value={f.num(rec.sessions, 0)} />
            <Cell title={tr('Working sets')} value={f.num(rec.totalSets, 0)} />
            {rec.totalReps > 0 && <Cell title={tr('Reps')} value={f.num(rec.totalReps, 0)} />}
            {load && <Cell title={tr('Volume')} value={f.wu(rec.totalVolume)} />}
          </Group>
        </View>
      ) : <Empty title={tr('No records yet')} text={tr('Your best lifts for this exercise will be tracked here.')} />)}
    </Page>
  );
}

const st = StyleSheet.create({
  set: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  n: { width: 22, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  records: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  rec: { flexGrow: 1, flexBasis: '45%', borderRadius: 12, padding: 12 },
});
