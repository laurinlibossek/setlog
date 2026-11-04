// An exercise, on one scrolling page (docs/design/navigation.md, Detail): its
// name with equipment and muscle, the hero number (estimated 1RM, or the
// exercise's own first metric) from the last session with its change over the
// range, the range control, the line chart with record dots, Best set ·
// Sessions · Last, Rep maxes, History and How to. The ⋯ menu edits, pins a
// note, sets the rest timer, merges, hides and deletes. Charts and records
// follow "Start history from"; History and the counts show everything.
import { useMemo, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import {
  BODY_PARTS, CATEGORIES, exerciseRecords, exerciseSeries, chartMetricsFor, hasLoadRecords, formulaLabel,
  kgTo, kmTo, DAY, EXERCISE_RANGES, REST_CHOICES, canMergeExercises, startOfDay,
} from '@setlog/core';

import {
  allSessions, deleteExercise, exerciseUsage, getState, mergeExercise, stats, updateExercise, useAppState,
} from '@/data/store';
import type { Category, Exercise, Workout } from '@/data/types';
import { SPACE, TYPE } from '@/design/tally';
import { editExercise } from '@/lib/exerciseForm';
import { pickExercises } from '@/lib/picker';
import { useFormat } from '@/lib/format';
import { useTally } from '@/lib/theme';
import {
  Mark, MARGIN, Row, SectionHead, StatStrip, tnum, type Stat,
} from '@/ui/facts';
import { Button, Empty, IconButton, Page } from '@/ui/kit';
import { LineChart, type LineChartPoint } from '@/ui/tally/LineChart';
import { NumberDisplay } from '@/ui/tally/NumberDisplay';
import { SegmentedControl } from '@/ui/tally/SegmentedControl';
import {
  actionSheet, ask, prompt, toast,
} from '@/ui/overlay';

type Rec = { value: number; at: number; w?: number; r?: number; workoutId?: string } | null;
type Records = Record<string, Rec> & { repMax: Map<number, { w: number; at: number; workoutId: string }> };
type Session = { workoutId: string; startedAt: number; name: string; entry: Workout['exercises'][number] };
type Metric = { id: string; label: string; kind: 'weight' | 'count' | 'distance' | 'time' | 'pace' };

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const { colors: t } = useTally();
  const ex = s.exercises.get(id);
  const every = (allSessions(s).get(id) || []) as Session[];
  const counted = (stats(s).byExercise.get(id) || []) as Session[];
  const category = (ex?.category || 'barbell') as Category;
  const formula = s.settings.formula;
  const metrics = chartMetricsFor(category) as Metric[];
  const [metricId, setMetricId] = useState(metrics[0].id);
  const [chosenRange, setRange] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);
  const m = metrics.find((x) => x.id === metricId) || metrics[0];
  const lowerBetter = m.kind === 'pace';
  // every session's value, oldest first; a record beats every session before it
  const series = useMemo(() => {
    const raw = exerciseSeries(counted, category, m.id, formula) as { x: number; y: number }[];
    let best: number | null = null;
    return raw.map((p) => {
      const record = best !== null && (lowerBetter ? p.y < best - 1e-9 : p.y > best + 1e-9);
      if (best === null || (lowerBetter ? p.y < best : p.y > best)) best = p.y;
      return { at: p.x, y: p.y, record };
    });
  }, [counted, category, m.id, formula, lowerBetter]);
  const rec = useMemo(() => exerciseRecords(counted, category, formula) as unknown as Records, [counted, category, formula]);

  if (!ex) return <Page><Stack.Screen options={{ title: '' }} /><Empty title={tr('Exercise not found')} text={tr('It may have been merged or deleted.')} /></Page>;

  const now = Date.now();
  // the range opens on 6 months, or the shortest that has a line to draw
  const range = chosenRange ?? ([182, 365].find((days) => series.filter((p) => p.at >= now - days * DAY).length >= 2)?.toString() || '0');
  const from = Number(range) ? now - Number(range) * DAY : 0;
  const toDisplay = (v: number) => (m.kind === 'weight' ? kgTo(v, f.unit) : m.kind === 'distance' ? kmTo(v, f.dUnit) : m.kind === 'pace' && f.dUnit === 'mi' ? v * 1.609344 : v);
  const points: LineChartPoint[] = series.filter((p) => p.at >= from).map((p) => ({ at: p.at, value: toDisplay(p.y), record: p.record }));
  const unit = m.kind === 'weight' ? f.unit : m.kind === 'distance' ? f.dUnit : m.kind === 'pace' ? `/${f.dUnit}` : m.kind === 'count' ? tr('reps') : '';
  const number = (v: number) => (m.kind === 'weight' ? f.num(v, 1) : m.kind === 'distance' ? f.num(v, 2) : m.kind === 'time' || m.kind === 'pace' ? f.clock(v) : f.num(v, 0));
  const withUnit = (v: number) => (unit ? `${number(v)} ${unit}` : number(v));
  const axis = (v: number, dec: number) => (m.kind === 'time' || m.kind === 'pace' ? f.clock(v) : Math.abs(v) >= 10000 ? `${f.num(v / 1000, 0)}k` : f.num(v, dec));

  const last = series.length ? toDisplay(series[series.length - 1].y) : null;
  const first = points[0];
  const diff = points.length > 1 && last !== null ? last - first.value : 0;
  const up = diff !== 0 && (diff > 0) !== lowerBetter;
  const change = Math.abs(diff) >= 0.05 ? `${diff > 0 ? '+' : '−'}${withUnit(Math.abs(diff))}` : undefined;
  const heroLabel = m.id === 'e1rm' ? tr('Estimated 1RM, best of last session') : tr('{metric}, last session', { metric: tr(m.label) });

  const lastId = every[0]?.workoutId;
  const label = (list: { id: string; label: string }[], key: string) => tr(list.find((x) => x.id === key)?.label || 'Other');
  /** today, yesterday, a weekday within the week, then the date */
  const when = (at: number, compact = false) => {
    const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
    if (days <= 0) return tr('Today');
    if (days === 1) return tr('Yesterday');
    if (days < 7) return f.date.weekdayLong(at);
    if (new Date(at).getFullYear() === new Date(now).getFullYear()) return f.date.dayMonth(at);
    return compact ? `${f.date.monthShort(at)} ${new Date(at).getFullYear()}` : f.date.short(at);
  };

  const load = hasLoadRecords(category);
  const best: Stat = load
    ? { label: tr('Best set'), value: rec.e1rm ? `${f.w(rec.e1rm.w)} × ${rec.e1rm.r}` : '—', mark: !!rec.e1rm && counted.length > 1 && rec.e1rm.workoutId === lastId }
    : category === 'cardio' ? { label: tr('Longest distance'), value: rec.distance ? f.dist(rec.distance.value) : '—' }
      : category === 'duration' ? { label: tr('Longest time'), value: rec.time ? f.clock(rec.time.value) : '—' }
        : { label: tr('Most reps'), value: rec.reps ? f.num(rec.reps.value, 0) : '—', mark: !!rec.reps && counted.length > 1 && rec.reps.workoutId === lastId };
  const stripStats: Stat[] = [
    { ...best, testID: 'exercise-best' },
    { label: tr('Sessions'), value: f.num(every.length, 0), testID: 'exercise-sessions' },
    { label: tr('Last'), value: every.length ? when(every[0].startedAt, true) : '—', testID: 'exercise-last' },
  ];

  // a rep max only counts if no heavier weight was lifted for more reps
  const reps = load ? [...rec.repMax.entries()].sort((a, b) => a[0] - b[0]).filter(([r]) => r <= 20) : [];
  const repMaxes = reps.filter(([r, v]) => !reps.some(([r2, v2]) => r2 > r && v2.w > v.w));

  const pickMetric = async () => {
    const v = await actionSheet<string>({
      title: tr('Chart'),
      message: metrics.some((x) => x.id === 'e1rm') ? (formula === 'average'
        ? tr('Estimated 1RM uses the average of all formulas on your best working set of each session. Change it in Settings.')
        : tr('Estimated 1RM uses the {name} formula on your best working set of each session. Change it in Settings.', { name: formulaLabel(formula) })) : undefined,
      actions: metrics.map((x) => ({ label: tr(x.label), value: x.id, checked: x.id === m.id, testID: `metric-${x.id}` })),
    });
    if (v) setMetricId(v);
  };
  const menu = () => exerciseMenu(ex, every.length, f);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.paper }} contentContainerStyle={{ paddingTop: SPACE.s1, paddingBottom: SPACE.s12 }} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title: '', headerRight: () => <IconButton icon="more" label={tr('Exercise options')} onPress={menu} testID="exercise-options" /> }} />
      <View style={{ paddingHorizontal: MARGIN }}>
        <Text style={{ ...TYPE.title1, color: t.ink }} accessibilityRole="header" testID="exercise-title">{f.exName(ex)}</Text>
        <Text style={{ ...TYPE.footnote, color: t.ink2 }}>
          {[label(CATEGORIES, ex.category), label(BODY_PARTS, ex.bodyPart), ex.hidden ? tr('Hidden') : ''].filter(Boolean).join(' · ')}
        </Text>

        {last !== null && (
          <View style={{ marginTop: SPACE.s5 }}>
            <NumberDisplay size="xl" value={number(last)} unit={unit || undefined} label={heroLabel} change={change} changeUp={up}
              onLabelPress={metrics.length > 1 ? pickMetric : undefined} labelTestID="exercise-metric" testID="exercise-hero" />
          </View>
        )}
        <View style={{ marginTop: SPACE.s4 }}>
          <SegmentedControl value={range} onChange={setRange} label={tr('Range')} testID="exercise-range"
            options={(EXERCISE_RANGES as { value: number; label: string }[]).map((r) => ({ value: String(r.value), label: tr(r.label) }))} />
        </View>
        <View style={{ marginTop: SPACE.s3 }}>
          <LineChart points={points} formatValue={withUnit} formatAxis={axis} time={m.kind === 'time' || m.kind === 'pace'} testID="exercise-chart"
            label={tr('{metric} for {name}', { metric: tr(m.label), name: f.exName(ex) })}
            emptyText={counted.length ? tr('No sessions in this range') : tr('Log this exercise to see your progress')} />
        </View>
        <StatStrip style={{ marginTop: SPACE.s4 }} stats={stripStats} />
      </View>

      {repMaxes.length > 0 && (
        <>
          <SectionHead title={tr('Rep maxes')} />
          {repMaxes.map(([r, v], i) => (
            <Row key={r} first={i === 0} testID={`repmax-${r}`}
              lead={<Text style={[{ ...TYPE.headline, color: t.ink, width: 58 }, tnum]}>{tr('{n} RM', { n: r })}</Text>}
              title={counted.length > 1 && v.workoutId === lastId
                ? <Mark style={{ ...TYPE.body }}>{f.wu(v.w)}</Mark>
                : <Text style={[{ ...TYPE.body, color: t.ink }, tnum]}>{f.wu(v.w)}</Text>}
              trailing={<Text style={{ ...TYPE.subhead, color: t.ink2 }}>{when(v.at)}</Text>} />
          ))}
        </>
      )}

      {every.length > 0 && (
        <>
          <SectionHead title={tr('History')} scope={tr('Since {date}', { date: f.date.short(every[every.length - 1].startedAt) })} />
          {every.slice(0, limit).map((x, i) => (
            <Row key={x.workoutId + x.entry.id} first={i === 0} chevron testID={`ex-session-${x.workoutId}`}
              onPress={() => router.push({ pathname: '/workout/[id]', params: { id: x.workoutId } })}
              title={x.name}
              subtitle={(
                <Text style={[{ ...TYPE.footnote, color: t.ink2 }, tnum]} numberOfLines={2}>
                  {x.entry.sets.map((set, j) => (
                    <Text key={set.id || j} style={set.type === 'warmup' ? { color: t.ink3 } : undefined}>
                      {`${j ? ' · ' : ''}${f.setText(set, category, true)}`}
                    </Text>
                  ))}
                </Text>
              )}
              trailing={<Text style={{ ...TYPE.subhead, color: t.ink2 }}>{when(x.startedAt)}</Text>} />
          ))}
          {every.length > limit && (
            <View style={{ paddingHorizontal: MARGIN, marginTop: SPACE.s3 }}>
              <Button kind="tinted" title={tr('Show more')} onPress={() => setLimit(limit + 20)} testID="history-more" />
            </View>
          )}
        </>
      )}

      {(!!ex.notes || !!ex.pinnedNote) && (
        <>
          <SectionHead title={tr('How to')} action={{ title: tr('Edit'), onPress: () => editExercise({ id: ex.id }), testID: 'howto-edit' }} />
          <View style={{ paddingHorizontal: MARGIN, gap: SPACE.s3 }}>
            {!!ex.pinnedNote && (
              <View style={{ gap: 2 }}>
                <Text style={{ ...TYPE.footnote, color: t.ink2 }}>{tr('Pinned note')}</Text>
                <Text style={{ ...TYPE.subhead, color: t.ink }}>{ex.pinnedNote}</Text>
              </View>
            )}
            {!!ex.notes && <Text style={{ ...TYPE.subhead, color: t.ink }} testID="exercise-notes">{ex.notes}</Text>}
          </View>
        </>
      )}
      {!every.length && !ex.notes && !ex.pinnedNote && (
        <Empty title={tr('Not done yet')} text={tr('Every workout with this exercise will show up here.')} />
      )}
    </ScrollView>
  );
}

/** The ⋯ menu: edit, pinned note, rest timer, merge into another, hide, delete. */
async function exerciseMenu(ex: Exercise, sessions: number, f: ReturnType<typeof useFormat>) {
  const { tr } = f;
  const rest = ex.restSec ?? getState().settings.defaultRest;
  const c = await actionSheet<string>({
    title: f.exName(ex),
    actions: [
      { label: tr('Edit exercise'), value: 'edit', icon: 'edit', testID: 'ex-edit' },
      { label: ex.pinnedNote ? tr('Edit pinned note') : tr('Pin a note'), value: 'pin', icon: 'pin' },
      { label: `${tr('Rest timer')} · ${rest ? f.clock(rest) : tr('Off')}`, value: 'rest', icon: 'timer', testID: 'ex-rest' },
      { label: tr('Merge into another exercise…'), value: 'merge', icon: 'swap', testID: 'ex-merge' },
      { label: ex.hidden ? tr('Show in lists again') : tr('Hide from lists'), value: 'hide', icon: ex.hidden ? 'eye' : 'eyeOff', testID: 'ex-hide' },
      { label: tr('Delete exercise'), value: 'delete', destructive: true, icon: 'trash', testID: 'ex-delete' },
    ],
  });
  if (c === 'edit') editExercise({ id: ex.id });
  if (c === 'pin') {
    const v = await prompt({ title: tr('Pinned note'), message: tr('Shown every time you do this exercise.'), value: ex.pinnedNote || '', multiline: true });
    if (v !== null) updateExercise(ex.id, { pinnedNote: v.trim() });
  }
  if (c === 'rest') {
    const v = await actionSheet<string>({
      title: tr('Rest timer'),
      actions: (REST_CHOICES as number[]).map((sec) => ({ label: sec ? f.clock(sec) : tr('Off'), value: String(sec), checked: rest === sec, testID: `rest-${sec}` })),
    });
    if (v !== undefined) updateExercise(ex.id, { restSec: Number(v) });
  }
  if (c === 'merge') {
    const ids = await pickExercises({ title: tr('Merge “{name}” into', { name: f.exName(ex) }) });
    const into = ids?.[0];
    if (!into || into === ex.id) return;
    const target = getState().exercises.get(into);
    if (!target) return;
    if (!canMergeExercises(ex, target)) {
      toast(tr('“{from}” and “{to}” log different things, so they can’t be merged.', { from: f.exName(ex), to: f.exName(target) }));
      return;
    }
    const ok = await ask({
      title: tr('Merge exercises?'),
      message: tr('All {n} of “{from}” move to “{to}”, and “{from}” is deleted. This can’t be undone.', { n: f.plural(sessions, 'session'), from: f.exName(ex), to: f.exName(target) }),
      ok: tr('Merge'), cancel: tr('Cancel'), destructive: true, testID: 'confirm-merge',
    });
    if (!ok) return;
    // to the target's page first, so this one never shows "not found"
    router.replace({ pathname: '/exercise/[id]', params: { id: into } });
    await mergeExercise(ex.id, into);
    toast(tr('Exercises merged'));
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
      title: tr('Delete “{name}”?', { name: f.exName(ex) }),
      message: u.templates ? tr('It will also be removed from {n}.', { n: f.plural(u.templates, 'routine') }) : tr('It has never been used.'),
      ok: tr('Delete'), cancel: tr('Cancel'), destructive: true, testID: 'confirm-delete',
    });
    if (!ok) return;
    if (router.canGoBack()) router.back();
    await deleteExercise(ex.id);
    toast(tr('Exercise deleted'));
  }
}
