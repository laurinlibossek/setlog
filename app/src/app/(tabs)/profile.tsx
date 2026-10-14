import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { startOfWeek, addDays, DAY, workoutVolume } from '@setlog/core';

import { useAppState } from '@/data/store';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import {
  Cell, Group, IconButton, Screen, SectionTitle, Txt,
} from '@/ui/kit';

export default function ProfileTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const goal = s.settings.weeklyGoal || 3;

  const { thisWeek, streak, monthVol } = useMemo(() => {
    const ws = s.settings.weekStart;
    const count = (start: number) => s.workouts.filter((w) => w.startedAt >= start && w.startedAt < addDays(start, 7)).length;
    let week = startOfWeek(Date.now(), ws);
    const now = count(week);
    let n = 0;
    if (now >= goal) n++;
    week = addDays(week, -7);
    while (count(week) >= goal && n < 520) { n++; week = addDays(week, -7); }
    const since = Date.now() - 30 * DAY;
    const vol = s.workouts.filter((w) => w.startedAt >= since).reduce((a, w) => a + workoutVolume(w, s.exercises), 0);
    return { thisWeek: now, streak: n, monthVol: vol };
  }, [s.workouts, s.exercises, s.settings.weekStart, goal]);

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
      <View style={st.tiles}>
        {tile(tr('Workouts'), f.num(s.workouts.length, 0), tr('all time'))}
        {tile(tr('This week'), String(thisWeek), thisWeek >= goal ? tr('goal reached') : tr('{n} to go', { n: goal - thisWeek }), `/${goal}`)}
        {tile(tr('Streak'), String(streak), streak === 1 ? tr('week on goal') : tr('weeks on goal'))}
      </View>
      {monthVol > 0 && <Txt tone="ink3" style={{ fontSize: 14, marginTop: 10, paddingHorizontal: 4 }}>{tr('{volume} lifted in 30 days', { volume: f.volume(monthVol) })}</Txt>}
      <SectionTitle>{tr('Tools')}</SectionTitle>
      <Group>
        <Cell first icon="settings" title={tr('Settings & data')} sub={tr('Units, theme, language, backup, Strong import')} onPress={() => router.push('/settings')} testID="settings-cell" />
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
