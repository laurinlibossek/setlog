// Workouts (Progress → Workouts): finished workouts by month, or a month
// calendar (the button in the navigation bar switches). The calendar's maths
// is core's calendarMonth().
import { useMemo, useState } from 'react';
import {
  FlatList, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import {
  startOfMonth, startOfDay, addMonths, calendarMonth, workoutVolume, bestSet,
} from '@setlog/core';

import { stats, useAppState, type State } from '@/data/store';
import type { Workout } from '@/data/types';
import { useFormat, type Format } from '@/lib/format';
import { useColors } from '@/lib/theme';
import {
  Button, Card, Empty, Icon, IconButton, Txt,
} from '@/ui/kit';

type Row = { kind: 'month'; m: number; count: number } | { kind: 'workout'; w: Workout };

export default function HistoryTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const [limit, setLimit] = useState(40);
  const [view, setView] = useState<'list' | 'cal'>('list');

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
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Empty title={tr('No workouts yet')} text={tr('Bring your workouts over from the Setlog web app: make a backup there, then restore it here in Account.')}>
          <Button kind="tinted" icon="download" title={tr('Restore from backup')} onPress={() => router.push('/account')} testID="history-restore" />
        </Empty>
      </View>
    );
  }
  const toggle = (
    <IconButton icon={view === 'list' ? 'calendar' : 'list'} label={view === 'list' ? tr('Show calendar') : tr('Show list')}
      onPress={() => setView(view === 'list' ? 'cal' : 'list')} testID="history-view" />
  );
  const bar = <Stack.Screen options={{ headerRight: () => toggle }} />;
  if (view === 'cal') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }} contentInsetAdjustmentBehavior="automatic">
        {bar}
        <Calendar s={s} f={f} />
      </ScrollView>
    );
  }
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(r) => (r.kind === 'month' ? 'm' + r.m : r.w.id)}
      ListHeaderComponent={bar}
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
        : undefined}
      initialNumToRender={12}
      windowSize={7}
    />
  );
}

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/** A month of days with workouts highlighted; tap one to see its workouts below. */
function Calendar({ s, f }: { s: State; f: Format & { tr: (t: string, v?: Record<string, string | number>) => string } }) {
  const c = useColors();
  const { tr } = f;
  const [month, setMonth] = useState(() => startOfMonth(Date.now()));
  const [sel, setSel] = useState<number | null>(null);
  const cal = useMemo(() => calendarMonth(s.workouts, month, { weekStart: s.settings.weekStart }) as {
    start: number; next: number; days: number[]; byDay: Map<number, Workout[]>; workouts: number; daysTrained: number; time: number;
  }, [s.workouts, month, s.settings.weekStart]);
  const today = startOfDay(Date.now());
  const go = (n: number) => { setMonth(addMonths(month, n)); setSel(null); };
  const selected = sel !== null ? cal.byDay.get(sel) || [] : [];
  const weeks: number[][] = [];
  for (let i = 0; i < cal.days.length; i += 7) weeks.push(cal.days.slice(i, i + 7));
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={[st.cal, { backgroundColor: c.surface }]}>
        <View style={st.calHead}>
          <MonthButton icon="chevronLeft" label={tr('Previous month')} onPress={() => go(-1)} testID="cal-prev" />
          <Txt style={{ fontSize: 17, fontWeight: '700' }} testID="cal-month">{f.date.monthYear(month)}</Txt>
          <MonthButton icon="chevron" label={tr('Next month')} onPress={() => go(1)} testID="cal-next" />
        </View>
        <View style={st.week}>
          {cal.days.slice(0, 7).map((d) => (
            <Text key={'w' + d} style={[st.wd, { color: c.ink3 }]}>{f.date.weekdayNarrow(d)}</Text>
          ))}
        </View>
        {weeks.map((wk) => (
          <View key={wk[0]} style={st.week}>
            {wk.map((d) => {
              const n = cal.byDay.get(d)?.length || 0;
              const out = d < cal.start || d >= cal.next;
              const on = sel === d;
              return (
                <View key={d} style={st.dayWrap}>
                  <Pressable onPress={() => setSel(n ? d : null)} testID={`cal-${dayKey(d)}`}
                    accessibilityRole="button" accessibilityState={{ selected: on }}
                    accessibilityLabel={n ? `${f.date.full(d)}, ${f.plural(n, 'workout')}` : f.date.full(d)}
                    style={[st.day, {
                      backgroundColor: n ? c.primary : 'transparent', opacity: out ? 0.3 : 1,
                      borderColor: on ? c.ink : 'transparent',
                    }]}>
                    <Text style={{
                      fontSize: 15, fontVariant: ['tabular-nums'],
                      color: n ? c.primaryInk : d === today ? c.accentText : c.ink2,
                      fontWeight: n || d === today ? '700' : '400',
                    }}>{new Date(d).getDate()}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
        <View style={[st.stats, { borderTopColor: c.line }]} testID="cal-stats">
          <Stat value={f.num(cal.workouts, 0)} label={tr('Workouts')} />
          <Stat value={f.num(cal.daysTrained, 0)} label={tr('Days trained')} />
          <Stat value={f.dur(cal.time)} label={tr('Time')} />
        </View>
      </View>
      {sel !== null && (
        <>
          <View style={[st.month, { paddingHorizontal: 4 }]}>
            <Txt style={{ fontSize: 20, fontWeight: '700' }}>{f.date.full(sel)}</Txt>
          </View>
          {selected.map((w) => <View key={w.id} style={{ marginBottom: 10 }}><WorkoutCard w={w} s={s} f={f} /></View>)}
        </>
      )}
      {sel === null && cal.workouts > 0 && (
        <Txt tone="ink3" style={{ fontSize: 13, textAlign: 'center', marginTop: 14 }}>{tr('Tap a highlighted day to see that workout.')}</Txt>
      )}
    </View>
  );
}

function MonthButton({ icon, label, onPress, testID }: { icon: 'chevron' | 'chevronLeft'; label: string; onPress: () => void; testID: string }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} testID={testID}
      style={({ pressed }) => [st.monthBtn, { backgroundColor: pressed ? c.surface3 : 'transparent' }]}>
      <Icon name={icon} size={17} color={c.accentText} />
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Txt style={{ fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Txt>
      <Txt tone="ink3" style={{ fontSize: 12 }}>{label}</Txt>
    </View>
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
            <Txt tone="ink2" style={{ fontSize: 14, flex: 1 }} numberOfLines={1}>{`${e.sets.length} × ${f.exName(ex) || tr('Unknown exercise')}`}</Txt>
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
  cal: { borderRadius: 14, padding: 12 },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  monthBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', paddingVertical: 4 },
  dayWrap: { flex: 1, padding: 2 },
  day: { aspectRatio: 1, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
