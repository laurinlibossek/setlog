// After Finish (docs/design/navigation.md, Summary): Done at the top, the date,
// the workout's name, Time · Volume · Sets, the hero tally (one stroke per set,
// records in signal), the records with their highlight, the workout's notes,
// and for a workout from a routine, one line of what it did to the routine:
// the better numbers went in at Finish, and a changed layout is asked about
// once over this screen (lib/workout.ts, announceRoutine), with Undo.
import { useEffect, useMemo } from 'react';
import {
  Platform, Pressable, ScrollView, Text, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kgTo, PR_LABEL, workoutVolume } from '@setlog/core';

import { finishResult, stats, useAppSelector } from '@/data/store';
import type { Category, WorkSet } from '@/data/types';
import { SPACE, TYPE } from '@/design/tally';
import { useFormat } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useTally } from '@/lib/theme';
import { announceRoutine, routineLine, useRoutineResult } from '@/lib/workout';
import {
  hm, Mark, MARGIN, Row, SectionHead, StatStrip, workoutStrokes, WorkoutTally,
} from '@/ui/facts';
import { Empty } from '@/ui/kit';
import { OverlayHost } from '@/ui/overlay';

type Pr = { exerciseId: string; metric: string; value: number; setId?: string };
// the record that leads an exercise's row; the others follow in its second line
const METRIC_ORDER = ['e1rm', 'weight', 'volume', 'reps', 'distance', 'time'];

export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workouts = useAppSelector((s) => s.workouts);
  const exercises = useAppSelector((s) => s.exercises);
  const f = useFormat();
  const { tr } = f;
  const { locale } = useLang();
  const { colors: t } = useTally();
  const insets = useSafeAreaInsets();
  const w = workouts.find((x) => x.id === id);
  const routine = useRoutineResult(w?.id);
  useEffect(() => {
    if (!w) return undefined;
    // let the summary slide in first; it asks and toasts once per workout
    const timer = setTimeout(() => { announceRoutine(w, f); }, 450);
    return () => clearTimeout(timer);
  }, [w?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const eyebrow = useMemo(() => {
    if (!w) return '';
    const sameYear = new Date(w.startedAt).getFullYear() === new Date().getFullYear();
    const day = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(w.startedAt);
    return `${day} · ${f.date.time(w.startedAt)}`;
  }, [w, locale, f]);

  // back to where the app was (a template preview the workout started from closes too)
  const close = () => { if (router.canDismiss()) router.dismissAll(); else router.back(); };
  const top = Platform.OS === 'ios' ? 0 : insets.top;
  const bar = (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: SPACE.s2, paddingTop: top + 6 }}>
      <Pressable onPress={close} hitSlop={8} accessibilityRole="button" testID="summary-done"
        style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...TYPE.headline, color: t.ink }}>{tr('Done')}</Text>
      </Pressable>
    </View>
  );
  if (!w) return <View style={{ flex: 1, backgroundColor: t.paper }}>{bar}<Empty title={tr('Workout not found')} /></View>;

  const r = finishResult(w.id);
  const prs = (r ? r.prs : stats().prsByWorkout.get(w.id) || []) as Pr[];
  const number = r ? r.number : workouts.filter((x) => x.startedAt <= w.startedAt).length;
  const volume = r ? r.volume : workoutVolume(w, exercises) as number;
  const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const recordSets = new Set(prs.map((p) => p.setId).filter((x): x is string => !!x));
  const setById = new Map<string, WorkSet>();
  for (const e of w.exercises) for (const s of e.sets) setById.set(s.id, s);

  const value = (metric: string, v: number) => {
    if (['e1rm', 'weight', 'volume'].includes(metric)) return `${f.w(v, 1)} ${f.unit}`;
    if (metric === 'reps') return f.plural(v, 'rep');
    if (metric === 'distance') return f.dist(v);
    if (metric === 'time') return f.clock(v);
    return f.num(v, 1);
  };
  const label = (metric: string) => tr((PR_LABEL as Record<string, string>)[metric] || metric);
  // one row per exercise, led by its most telling record
  const rows: { exerciseId: string; lead: Pr; others: Pr[] }[] = [];
  for (const p of prs) {
    let row = rows.find((x) => x.exerciseId === p.exerciseId);
    if (!row) { row = { exerciseId: p.exerciseId, lead: p, others: [] }; rows.push(row); continue; }
    if (METRIC_ORDER.indexOf(p.metric) < METRIC_ORDER.indexOf(row.lead.metric)) { row.others.push(row.lead); row.lead = p; } else row.others.push(p);
  }

  const kgShown = kgTo(volume || 0, f.unit);
  const strokes = workoutStrokes(w, recordSets);
  const tallyLine = [f.plural(sets, 'set'), recordSets.size ? f.plural(recordSets.size, 'record') : '', tr('workout #{n}', { n: number })].filter(Boolean).join(' · ');
  const routineText = routineLine(routine, f);

  const viewInHistory = () => {
    close();
    setTimeout(() => router.push({ pathname: '/workout/[id]', params: { id: w.id } }), Platform.OS === 'web' ? 50 : 450);
  };
  return (
    <View style={{ flex: 1, backgroundColor: t.paper }}>
      {bar}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.s8 }}>
        <View style={{ paddingHorizontal: MARGIN }}>
          <Text style={{ ...TYPE.eyebrow, color: t.ink2, textTransform: 'uppercase' }} numberOfLines={1}>{eyebrow}</Text>
          <Text style={{ ...TYPE.largeTitle, color: t.ink, marginTop: 2 }} accessibilityRole="header" testID="summary-title">{w.name}</Text>
          <StatStrip style={{ marginTop: SPACE.s5 }} stats={[
            { label: tr('Time'), value: hm(w.endedAt - w.startedAt), testID: 'summary-time' },
            volume ? { label: tr('Volume'), value: kgShown >= 100000 ? f.compact(kgShown) : f.num(kgShown, 0), unit: f.unit, testID: 'summary-volume' } : { label: tr('Volume'), value: '—' },
            { label: tr('Sets'), value: f.num(sets, 0), testID: 'summary-sets' },
          ]} />
          <View style={{ marginTop: SPACE.s6 }}>
            <WorkoutTally groups={strokes} label={tallyLine} testID="summary-tally" />
          </View>
          <Text style={{ ...TYPE.footnote, color: t.ink2, marginTop: SPACE.s2 }}>{tallyLine}</Text>
        </View>

        {rows.length > 0 && (
          <>
            <SectionHead title={tr('Records')} />
            {rows.map(({ exerciseId, lead, others }, i) => {
              const ex = exercises.get(exerciseId);
              const set = lead.setId ? setById.get(lead.setId) : undefined;
              const line = [
                set ? f.setText(set, ex?.category as Category) : '',
                label(lead.metric),
                ...others.map((o) => `${label(o.metric)} ${value(o.metric, o.value)}`),
              ].filter(Boolean).join(' · ');
              return (
                <Row key={exerciseId} first={i === 0} testID={`pr-${exerciseId}`}
                  title={f.exName(ex) || tr('Unknown exercise')} subtitle={line}
                  trailing={<Mark>{value(lead.metric, lead.value)}</Mark>} />
              );
            })}
          </>
        )}

        {/* the coach's notes (TrueTrain, phase 7) go here too */}
        {!!w.notes && (
          <>
            <SectionHead title={tr('Notes')} />
            <Text style={{ ...TYPE.subhead, color: t.ink, paddingHorizontal: MARGIN }}>{w.notes}</Text>
          </>
        )}

        {!!routineText && (
          <>
            <SectionHead title={tr('Routine')} />
            <Text style={{ ...TYPE.subhead, color: t.ink, paddingHorizontal: MARGIN }} testID="routine-line">{routineText}</Text>
          </>
        )}

        <View style={{ marginTop: SPACE.s6 }}>
          <Row first title={tr('View in history')} chevron onPress={viewInHistory} testID="view-in-history" />
        </View>
      </ScrollView>
      <OverlayHost />
    </View>
  );
}
