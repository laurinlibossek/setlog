import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  DAY, PR_LABEL, weeklyCounts, weekStreak, workoutVolume,
} from '@setlog/core';

import { setMeta, stats, useAppState } from '@/data/store';
import { backupNow } from '@/lib/backup';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { BarChart } from '@/ui/Chart';
import {
  Card, Cell, Group, Icon, IconButton, Screen, SectionTitle, Txt,
} from '@/ui/kit';

type Pr = { exerciseId: string; metric: string; value: number; at: number };

export default function ProfileTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const goal = s.settings.weeklyGoal || 3;

  const { weeks, streak, monthVol, recentPrs } = useMemo(() => {
    const weekStart = s.settings.weekStart;
    const since = Date.now() - 30 * DAY;
    const st = stats(s);
    const prs: Pr[] = [];
    for (const w of s.workouts) {
      if (w.startedAt < since) break;
      for (const p of (st.prsByWorkout.get(w.id) || []) as Omit<Pr, 'at'>[]) prs.push({ ...p, at: w.startedAt });
    }
    return {
      weeks: weeklyCounts(s.workouts, { weeks: 12, weekStart }) as { start: number; value: number }[],
      streak: weekStreak(s.workouts, { goal, weekStart }) as number,
      monthVol: s.workouts.filter((w) => w.startedAt >= since).reduce((a, w) => a + workoutVolume(w, s.exercises), 0),
      recentPrs: prs,
    };
  }, [s.workouts, s.exercises, s.settings, goal]);
  const thisWeek = weeks[weeks.length - 1]?.value || 0;
  const needsBackup = s.workouts.length >= 3 && (!s.meta.lastBackupAt || Date.now() - s.meta.lastBackupAt > 14 * DAY)
    && (!s.meta.backupSnoozedAt || Date.now() - (s.meta.backupSnoozedAt as number) > 7 * DAY);
  const prValue = (p: Pr) => {
    if (['e1rm', 'weight', 'volume'].includes(p.metric)) return f.wu(p.value);
    if (p.metric === 'distance') return f.dist(p.value);
    if (p.metric === 'time') return f.clock(p.value);
    return f.num(p.value, 0);
  };

  const tile = (k: string, v: string, d: string, sup?: string) => (
    <View style={[st.tile, { backgroundColor: c.surface }]}>
      <Txt tone="ink3" style={st.k}>{k}</Txt>
      <Txt style={st.v}>{v}{sup ? <Txt tone="ink3" style={{ fontSize: 16 }}>{sup}</Txt> : null}</Txt>
      <Txt tone="ink3" style={{ fontSize: 12 }}>{d}</Txt>
    </View>
  );

  return (
    <Screen title={s.profile.name || tr('Profile')}
      right={<IconButton icon="settings" label={tr('Settings')} onPress={() => router.push('/settings')} testID="open-settings" />}>
      {needsBackup && (
        <Card style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }} testID="backup-banner">
          <Icon name="upload" size={20} color={c.accentText} />
          <View style={{ flex: 1, gap: 6 }}>
            <Txt style={{ fontSize: 15 }}>
              <Txt style={{ fontSize: 15, fontWeight: '700' }}>{tr('Back up your training log.')}</Txt>
              {` ${tr('It lives only on this phone — a backup file in iCloud Drive protects it if the phone is lost or reset.')}`}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 18 }}>
              <Pressable onPress={() => backupNow(tr)} accessibilityRole="button" hitSlop={6}><Txt tone="accent" style={{ fontWeight: '700', fontSize: 15 }}>{tr('Back up now')}</Txt></Pressable>
              <Pressable onPress={() => setMeta({ backupSnoozedAt: Date.now() })} accessibilityRole="button" hitSlop={6}><Txt tone="ink3" style={{ fontWeight: '600', fontSize: 15 }}>{tr('Later')}</Txt></Pressable>
            </View>
          </View>
        </Card>
      )}
      <View style={st.tiles}>
        {tile(tr('Workouts'), f.num(s.workouts.length, 0), tr('all time'))}
        {tile(tr('This week'), String(thisWeek), thisWeek >= goal ? tr('goal reached') : tr('{n} to go', { n: goal - thisWeek }), `/${goal}`)}
        {tile(tr('Streak'), String(streak), streak === 1 ? tr('week on goal') : tr('weeks on goal'))}
      </View>

      <Card style={{ marginTop: 12 }}>
        <Txt style={{ fontSize: 16, fontWeight: '700' }}>{tr('Workouts per week')}</Txt>
        <Txt tone="ink3" style={{ fontSize: 13, marginTop: 2 }}>
          {tr('Last 12 weeks · goal {n} per week', { n: goal }) + (monthVol ? ` · ${tr('{volume} lifted in 30 days', { volume: f.volume(monthVol) })}` : '')}
        </Txt>
        <BarChart bars={weeks.map((w) => ({ label: f.date.dayMonth(w.start), value: w.value, title: tr('Week of {date}', { date: f.date.dayMonth(w.start) }) }))}
          goal={goal} label={tr('Workouts per week')} testID="weekly-chart" />
      </Card>

      {recentPrs.length > 0 && (
        <>
          <SectionTitle>{tr('Records in the last 30 days')}</SectionTitle>
          <Group>
            {recentPrs.slice(0, 8).map((p, i) => (
              <Cell key={i} first={i === 0} title={s.exercises.get(p.exerciseId)?.name || tr('Exercise')}
                sub={`${tr((PR_LABEL as Record<string, string>)[p.metric] || p.metric)} · ${f.relDay(p.at)}`} value={prValue(p)}
                icon="trophy" onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: p.exerciseId } })} />
            ))}
          </Group>
        </>
      )}

      <SectionTitle>{tr('Tools')}</SectionTitle>
      <Group>
        <Cell first icon="plate" title={tr('Plate calculator')} onPress={() => router.push({ pathname: '/tools', params: { tab: 'plates' } })} testID="open-plates" />
        <Cell icon="calculator" title={tr('1RM calculator')} onPress={() => router.push({ pathname: '/tools', params: { tab: 'rm' } })} testID="open-rm" />
        <Cell icon="settings" title={tr('Settings & data')} sub={tr('Units, rest timer, backup, Strong import')} onPress={() => router.push('/settings')} testID="settings-cell" />
      </Group>
    </Screen>
  );
}

const st = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 14, padding: 12, gap: 2 },
  k: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  v: { fontSize: 26, fontWeight: '800' },
});
