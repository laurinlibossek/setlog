// An exercise: about (settings and notes), its history, charts and records,
// and the ⋯ menu (edit, pinned note, hide, delete). Charts and records follow
// "Start history from"; History and the counts show everything.
import { useMemo, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import {
  BODY_PARTS, CATEGORIES, exerciseRecords, exerciseSeries, chartMetricsFor, hasLoadRecords, est1RM, formulaLabel,
  kgTo, kmTo, DAY, EXERCISE_RANGES, REST_CHOICES,
} from '@setlog/core';

import {
  allSessions, deleteExercise, exerciseUsage, stats, updateExercise, useAppState,
} from '@/data/store';
import type { Exercise, Workout } from '@/data/types';
import { editExercise } from '@/lib/exerciseForm';
import { setLabels, useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import {
  Button, Card, Cell, Empty, Group, IconButton, Page, Segments, SectionTitle, Txt,
} from '@/ui/kit';
import { LineChart } from '@/ui/Chart';
import {
  actionSheet, ask, prompt, toast,
} from '@/ui/overlay';

type Rec = { value: number; at: number; w?: number; r?: number } | null;
type Session = { workoutId: string; startedAt: number; name: string; entry: Workout['exercises'][number] };
type Tab = 'about' | 'history' | 'charts' | 'records';

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const ex = s.exercises.get(id);
  const every = (allSessions(s).get(id) || []) as Session[];
  const counted = (stats(s).byExercise.get(id) || []) as Session[];
  const [tab, setTab] = useState<Tab>(counted.length >= 2 ? 'charts' : every.length ? 'history' : 'about');
  if (!ex) return <Page><Stack.Screen options={{ title: '' }} /><Empty title={tr('Exercise not found')} text={tr('It may have been merged or deleted.')} /></Page>;

  const label = (list: { id: string; label: string }[], key: string) => tr(list.find((x) => x.id === key)?.label || 'Other');
  const menu = async () => {
    const c = await actionSheet<string>({
      title: ex.name,
      actions: [
        { label: tr('Edit exercise'), value: 'edit', icon: 'edit', testID: 'ex-edit' },
        { label: ex.pinnedNote ? tr('Edit pinned note') : tr('Pin a note'), value: 'pin', icon: 'pin' },
        { label: ex.hidden ? tr('Show in lists again') : tr('Hide from lists'), value: 'hide', icon: ex.hidden ? 'eye' : 'eyeOff', testID: 'ex-hide' },
        { label: tr('Delete exercise'), value: 'delete', destructive: true, icon: 'trash', testID: 'ex-delete' },
      ],
    });
    if (c === 'edit') editExercise({ id: ex.id });
    if (c === 'pin') {
      const v = await prompt({ title: tr('Pinned note'), message: tr('Shown every time you do this exercise.'), value: ex.pinnedNote || '', multiline: true });
      if (v !== null) updateExercise(ex.id, { pinnedNote: v.trim() });
    }
    if (c === 'hide') {
      await updateExercise(ex.id, { hidden: !ex.hidden });
      toast(ex.hidden ? tr('Visible again') : tr('Hidden from lists'));
    }
    if (c === 'delete') {
      const u = exerciseUsage(ex.id);
      if (u.sessions > 0 || u.inActive) {
        const ok = await ask({
          title: tr('This exercise has history'),
          message: tr('It’s in {n}. Deleting it would break those workouts, so hide it from lists instead — your history stays.', { n: f.plural(u.sessions, 'workout') }),
          ok: tr('Hide it'), cancel: tr('Cancel'),
        });
        if (ok) updateExercise(ex.id, { hidden: true });
        return;
      }
      const ok = await ask({
        title: tr('Delete “{name}”?', { name: ex.name }),
        message: u.templates ? tr('It will also be removed from {n}.', { n: f.plural(u.templates, 'template') }) : tr('It has never been used.'),
        ok: tr('Delete'), cancel: tr('Cancel'), destructive: true, testID: 'confirm-delete',
      });
      if (!ok) return;
      if (router.canGoBack()) router.back();
      await deleteExercise(ex.id);
      toast(tr('Exercise deleted'));
    }
  };

  return (
    <Page>
      <Stack.Screen options={{ title: ex.name, headerRight: () => <IconButton icon="more" label={tr('Exercise options')} onPress={menu} testID="exercise-options" /> }} />
      <Txt style={{ fontSize: 26, fontWeight: '800' }}>{ex.name}</Txt>
      <Txt tone="ink3" style={{ fontSize: 14, marginTop: 2, marginBottom: 14 }}>
        {`${label(BODY_PARTS, ex.bodyPart)} · ${label(CATEGORIES, ex.category)}${ex.hidden ? ` · ${tr('Hidden')}` : ''}`}
      </Txt>
      <Segments value={tab} onChange={setTab} testID="exercise-tabs" options={[
        { value: 'about', label: tr('About') }, { value: 'history', label: tr('History') },
        { value: 'charts', label: tr('Charts') }, { value: 'records', label: tr('Records') },
      ]} />
      <View style={{ marginTop: 14 }}>
        {tab === 'about' && <About ex={ex} sessions={every} />}
        {tab === 'history' && <History ex={ex} sessions={every} />}
        {tab === 'charts' && <Charts ex={ex} sessions={counted} />}
        {tab === 'records' && <Records ex={ex} sessions={counted} />}
      </View>
    </Page>
  );
}

function About({ ex, sessions }: { ex: Exercise; sessions: Session[] }) {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const rest = ex.restSec ?? s.settings.defaultRest;
  const label = (list: { id: string; label: string }[], key: string) => tr(list.find((x) => x.id === key)?.label || 'Other');
  const setRest = async () => {
    const v = await actionSheet<string>({
      title: tr('Rest timer'),
      actions: (REST_CHOICES as number[]).map((sec) => ({ label: sec ? f.clock(sec) : tr('Off'), value: String(sec), checked: rest === sec })),
    });
    if (v !== undefined) updateExercise(ex.id, { restSec: Number(v) });
  };
  return (
    <View style={{ gap: 12 }}>
      {!!ex.pinnedNote && (
        <View style={{ flexDirection: 'row', gap: 8, borderRadius: 10, padding: 10, backgroundColor: c.note }}>
          <Text style={{ color: c.noteInk, fontSize: 14, flex: 1 }}>{ex.pinnedNote}</Text>
        </View>
      )}
      <Group>
        <Cell first title={tr('What you log')} value={label(CATEGORIES, ex.category)} />
        <Cell title={tr('Body part')} value={label(BODY_PARTS, ex.bodyPart)} />
        <Cell title={tr('Rest timer')} value={rest ? f.clock(rest) : tr('Off')} onPress={setRest} testID="about-rest" />
        <Cell title={tr('Times done')} value={f.num(sessions.length, 0)} />
        {sessions.length > 0 && <Cell title={tr('Last done')} value={f.date.short(sessions[0].startedAt)} />}
        {sessions.length > 0 && <Cell title={tr('First done')} value={f.date.short(sessions[sessions.length - 1].startedAt)} />}
      </Group>
      {!!ex.notes && <Card><Txt tone="ink2" style={{ fontSize: 15 }}>{ex.notes}</Txt></Card>}
      <Button kind="tinted" icon="edit" title={tr('Edit name, type or notes')} onPress={() => editExercise({ id: ex.id })} testID="about-edit" />
    </View>
  );
}

function History({ ex, sessions }: { ex: Exercise; sessions: Session[] }) {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const [limit, setLimit] = useState(20);
  if (!sessions.length) return <Empty title={tr('Not done yet')} text={tr('Every workout with this exercise will show up here.')} />;
  const load = hasLoadRecords(ex.category);
  return (
    <View>
      {sessions.slice(0, limit).map((x) => {
        const labels = setLabels(x.entry.sets);
        return (
          <View key={x.workoutId + x.entry.id} style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <Pressable onPress={() => router.push({ pathname: '/workout/[id]', params: { id: x.workoutId } })} accessibilityRole="link" style={{ flex: 1 }}>
                <Txt tone="accent" style={{ fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{x.name}</Txt>
              </Pressable>
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
      {sessions.length > limit && <Button kind="tinted" title={tr('Show more')} onPress={() => setLimit(limit + 40)} />}
    </View>
  );
}

type Metric = { id: string; label: string; kind: 'weight' | 'count' | 'distance' | 'time' | 'pace' };

function Charts({ ex, sessions }: { ex: Exercise; sessions: Session[] }) {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const metrics = chartMetricsFor(ex.category) as Metric[];
  const [metric, setMetric] = useState(metrics[0].id);
  const [range, setRange] = useState('0');
  const m = metrics.find((x) => x.id === metric) || metrics[0];
  const all = useMemo(() => exerciseSeries(sessions, ex.category, m.id, s.settings.formula) as { x: number; y: number }[], [sessions, m.id, s.settings.formula, ex.category]);
  const from = Number(range) ? Date.now() - Number(range) * DAY : 0;
  const toDisplay = (v: number) => (m.kind === 'weight' ? kgTo(v, f.unit) : m.kind === 'distance' ? kmTo(v, f.dUnit) : m.kind === 'pace' && f.dUnit === 'mi' ? v * 1.609344 : v);
  const pts = all.filter((p) => p.x >= from).map((p) => ({ x: p.x, y: toDisplay(p.y) }));
  const fmtVal = (v: number) => {
    if (m.kind === 'weight') return `${f.num(v, 1)} ${f.unit}`;
    if (m.kind === 'distance') return `${f.num(v, 2)} ${f.dUnit}`;
    if (m.kind === 'time') return f.clock(v);
    if (m.kind === 'pace') return `${f.clock(v)} /${f.dUnit}`;
    return f.num(v, 0);
  };
  const fmtAxis = (v: number, dec: number) => (m.kind === 'time' || m.kind === 'pace' ? f.clock(v) : Math.abs(v) >= 10000 ? `${f.num(v / 1000, 0)}k` : f.num(v, dec));
  const first = pts[0], last = pts[pts.length - 1];
  const change = first && last && pts.length > 1 ? last.y - first.y : null;
  const lowerBetter = m.kind === 'pace';
  const changeColor = change === null || change === 0 ? c.ink3 : (change > 0) !== lowerBetter ? c.up : c.danger;
  return (
    <View style={{ gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {metrics.map((x) => {
          const on = x.id === metric;
          return (
            <Pressable key={x.id} onPress={() => setMetric(x.id)} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`metric-${x.id}`}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? c.chipOn : c.surface }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: on ? c.chipOnInk : c.ink2 }}>{tr(x.label)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Card>
        <Txt style={{ fontSize: 16, fontWeight: '700' }}>{tr(m.label)}</Txt>
        <Txt tone="ink3" style={{ fontSize: 13, marginTop: 2 }}>
          {last ? tr('{value} last time', { value: fmtVal(last.y) }) : tr('No data in this range')}
          {change !== null ? <Txt style={{ fontSize: 13, color: changeColor }}>{` · ${change > 0 ? '+' : change < 0 ? '−' : '±'}${fmtVal(Math.abs(change))}`}</Txt> : null}
          {change !== null ? ` ${tr('in range')}` : ''}
        </Txt>
        <LineChart points={pts} fmtVal={fmtVal} fmtAxis={fmtAxis} time={m.kind === 'time' || m.kind === 'pace'} testID="exercise-chart"
          label={tr('{metric} for {name}', { metric: tr(m.label), name: ex.name })}
          emptyText={sessions.length ? tr('No sessions in this range') : tr('Log this exercise to see your progress')} />
        <View style={{ marginTop: 10 }}>
          <Segments value={range} onChange={setRange} options={(EXERCISE_RANGES as { value: number; label: string }[]).map((r) => ({ value: String(r.value), label: tr(r.label) }))} />
        </View>
      </Card>
      {m.id === 'e1rm' && (
        <Txt tone="ink3" style={{ fontSize: 13, paddingHorizontal: 4 }}>
          {s.settings.formula === 'average'
            ? tr('Estimated 1RM uses the average of all formulas on your best working set of each session. Change it in Settings.')
            : tr('Estimated 1RM uses the {name} formula on your best working set of each session. Change it in Settings.', { name: formulaLabel(s.settings.formula) })}
        </Txt>
      )}
    </View>
  );
}

function Records({ ex, sessions }: { ex: Exercise; sessions: Session[] }) {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  if (!sessions.length) return <Empty title={tr('No records yet')} text={tr('Your best lifts for this exercise will be tracked here.')} />;
  const load = hasLoadRecords(ex.category);
  const rec = exerciseRecords(sessions, ex.category, s.settings.formula) as unknown as Record<string, Rec> & { sessions: number; totalSets: number; totalReps: number; totalVolume: number };
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
  );
}

const st = StyleSheet.create({
  set: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  n: { width: 22, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  records: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rec: { flexGrow: 1, flexBasis: '45%', borderRadius: 12, padding: 12 },
});
