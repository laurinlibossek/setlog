// Progress: how it went. The last 30 days at a glance, then Workouts
// (History), Lifts (exercises you've done), Records and Body (Measure), the
// workouts-per-week chart from Profile, the backup reminder and the tools.
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  DAY, kgTo, weeklyCounts, weekStreak, workoutVolume,
} from '@setlog/core';

import { allSessions, setMeta, stats, useAppState } from '@/data/store';
import { SPACE, TYPE } from '@/design/tally';
import { backupNow } from '@/lib/backup';
import { useFormat } from '@/lib/format';
import { fmtMeasure, measureDef } from '@/lib/measure';
import { useTally } from '@/lib/theme';
import { BarChart } from '@/ui/Chart';
import { ListRow } from '@/ui/tally/ListRow';
import { SectionHeader } from '@/ui/tally/SectionHeader';
import { StatStrip } from '@/ui/tally/StatStrip';
import { TabRoot } from '@/ui/tally/TabRoot';

export default function ProgressTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const { colors: t } = useTally();
  const goal = s.settings.weeklyGoal || 3;

  const m = useMemo(() => {
    const weekStart = s.settings.weekStart;
    const since = Date.now() - 30 * DAY;
    const st = stats(s);
    let records = 0, recent = 0, workouts = 0, volume = 0;
    for (const w of s.workouts) {
      // one record per exercise and workout, however many of its numbers went up
      const n = new Set((st.prsByWorkout.get(w.id) || []).map((p: { exerciseId: string }) => p.exerciseId)).size;
      records += n;
      if (w.startedAt >= since) { workouts++; recent += n; volume += workoutVolume(w, s.exercises); }
    }
    return {
      workouts, volume, recent, records,
      lifts: [...allSessions(s).keys()].filter((id) => s.exercises.has(id)).length,
      weeks: weeklyCounts(s.workouts, { weeks: 12, weekStart }) as { start: number; value: number }[],
      streak: weekStreak(s.workouts, { goal, weekStart }) as number,
    };
  }, [s.workouts, s.exercises, s.settings, goal]); // eslint-disable-line react-hooks/exhaustive-deps

  // volume in tonnes (or thousands of pounds) once it's big
  const v = kgTo(m.volume, f.unit);
  const vol = v >= 10000
    ? { value: f.num(v / 1000, v >= 100000 ? 0 : 1), unit: f.unit === 'kg' ? 't' : `k ${f.unit}` }
    : { value: f.num(v, 0), unit: f.unit };
  const bw = s.measurements.find((x) => x.type === 'bodyweight');
  const needsBackup = s.workouts.length >= 3 && (!s.meta.lastBackupAt || Date.now() - s.meta.lastBackupAt > 14 * DAY)
    && (!s.meta.backupSnoozedAt || Date.now() - (s.meta.backupSnoozedAt as number) > 7 * DAY);

  return (
    <TabRoot title={tr('Progress')}>
      {needsBackup && (
        <View testID="backup-banner" style={{ paddingHorizontal: SPACE.s5, marginBottom: SPACE.s6, gap: SPACE.s2 }}>
          <Text style={[TYPE.subhead, { color: t.ink }]}>
            <Text style={{ fontWeight: '600' }}>{tr('Back up your training log.')}</Text>
            {` ${tr('It lives only on this phone — a backup file in iCloud Drive protects it if the phone is lost or reset.')}`}
          </Text>
          <View style={{ flexDirection: 'row', gap: SPACE.s5 }}>
            <Pressable onPress={() => backupNow(tr)} accessibilityRole="button" hitSlop={8}><Text style={[TYPE.headline, { color: t.ink }]}>{tr('Back up now')}</Text></Pressable>
            <Pressable onPress={() => setMeta({ backupSnoozedAt: Date.now() })} accessibilityRole="button" hitSlop={8}><Text style={[TYPE.body, { color: t.ink2 }]}>{tr('Later')}</Text></Pressable>
          </View>
        </View>
      )}

      <View style={{ paddingHorizontal: SPACE.s5, gap: SPACE.s1 }}>
        <StatStrip testID="last-30" stats={[
          { label: tr('Workouts'), value: f.num(m.workouts, 0) },
          { label: tr('Volume'), value: vol.value, unit: vol.unit },
          { label: tr('Records'), value: f.num(m.recent, 0) },
        ]} />
        <Text style={[TYPE.footnote, { color: t.ink2 }]}>{tr('Last 30 days')}</Text>
      </View>

      <View style={{ marginTop: SPACE.s6 }}>
        <ListRow first symbol="calendar" title={tr('Workouts')} trailing={f.num(s.workouts.length, 0)} chevron onPress={() => router.push('/history')} testID="progress-workouts" />
        <ListRow symbol="dumbbell" title={tr('Lifts')} trailing={f.num(m.lifts, 0)} chevron onPress={() => router.push('/exercises')} testID="progress-lifts" />
        <ListRow symbol="rosette" title={tr('Records')} trailing={f.num(m.records, 0)} chevron onPress={() => router.push('/records')} testID="progress-records" />
        <ListRow symbol="figure.stand" title={tr('Body')} trailing={bw ? fmtMeasure(measureDef('bodyweight'), bw.value, s.settings, f) : undefined} chevron
          onPress={() => router.push('/measure')} testID="progress-body" />
      </View>

      <SectionHeader title={tr('Workouts per week')} scope={tr('Last 12 weeks')} />
      <View style={{ paddingHorizontal: SPACE.s5 }}>
        <BarChart bars={m.weeks.map((w) => ({ label: f.date.dayMonth(w.start), value: w.value, title: tr('Week of {date}', { date: f.date.dayMonth(w.start) }) }))}
          goal={goal} label={tr('Workouts per week')} testID="weekly-chart" />
        <Text style={[TYPE.footnote, { color: t.ink2 }]}>
          {`${tr('Goal: {n} per week', { n: goal })} · ${m.streak === 1 ? `1 ${tr('week on goal')}` : `${f.num(m.streak, 0)} ${tr('weeks on goal')}`}`}
        </Text>
      </View>

      <SectionHeader title={tr('Tools')} />
      <ListRow first symbol="circle.circle" title={tr('Plate calculator')} chevron onPress={() => router.push({ pathname: '/tools', params: { tab: 'plates' } })} testID="open-plates" />
      <ListRow symbol="function" title={tr('1RM calculator')} chevron onPress={() => router.push({ pathname: '/tools', params: { tab: 'rm' } })} testID="open-rm" />
    </TabRoot>
  );
}
