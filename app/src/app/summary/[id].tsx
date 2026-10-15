// After Finish: what was saved, the new records, and (for a workout from a
// template that changed) the question whether to update the template.
import { useEffect, useRef } from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bestSet, PR_LABEL, workoutVolume } from '@setlog/core';

import { finishResult, stats, useAppSelector, useSettings } from '@/data/store';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { offerTemplateUpdate } from '@/lib/workout';
import {
  Button, Empty, Group, Icon, SectionTitle,
} from '@/ui/kit';
import { OverlayHost } from '@/ui/overlay';

export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workouts = useAppSelector((s) => s.workouts);
  const exercises = useAppSelector((s) => s.exercises);
  const settings = useSettings();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const w = workouts.find((x) => x.id === id);
  const asked = useRef(false);

  useEffect(() => {
    if (!w || asked.current) return undefined;
    asked.current = true;
    // let the summary slide in first
    const t = setTimeout(() => { offerTemplateUpdate(w, f); }, 450);
    return () => clearTimeout(t);
  }, [w]); // asks once, when the workout is there

  // back to where the app was (a template preview the workout started from closes too)
  const close = () => { if (router.canDismiss()) router.dismissAll(); else router.back(); };
  const top = Platform.OS === 'ios' ? 0 : insets.top;
  const bar = (
    <View style={[styles.bar, { paddingTop: top + 10 }]}>
      <Pressable onPress={close} hitSlop={8} accessibilityRole="button" testID="summary-done">
        <Text style={{ color: c.accentText, fontSize: 17, fontWeight: '700' }}>{tr('Done')}</Text>
      </Pressable>
    </View>
  );
  if (!w) return <View style={{ flex: 1, backgroundColor: c.bg }}>{bar}<Empty title={tr('Workout not found')} /></View>;

  const r = finishResult(w.id);
  const prs = r ? r.prs : (stats().prsByWorkout.get(w.id) || []) as { exerciseId: string; metric: string; value: number }[];
  const number = r ? r.number : workouts.filter((x) => x.startedAt <= w.startedAt).length;
  const volume = r ? r.volume : workoutVolume(w, exercises) as number;
  const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const value = (metric: string, v: number) => {
    if (['e1rm', 'weight', 'volume'].includes(metric)) return `${f.w(v, 1)} ${f.unit}`;
    if (metric === 'reps') return f.num(v, 0);
    if (metric === 'distance') return f.dist(v);
    if (metric === 'time') return f.clock(v);
    return f.num(v, 1);
  };
  const viewInHistory = () => {
    close();
    setTimeout(() => router.push({ pathname: '/workout/[id]', params: { id: w.id } }), Platform.OS === 'web' ? 50 : 450);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {bar}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <View style={[styles.medal, { backgroundColor: prs.length ? c.goldSoft : c.doneSoft }]}>
            <Icon name={prs.length ? 'trophy' : 'check'} size={34} color={prs.length ? c.gold : c.done} />
          </View>
          <Text style={{ color: c.ink, fontSize: 26, fontWeight: '800', marginTop: 12 }} testID="summary-title">{prs.length ? tr('New records!') : tr('Workout saved')}</Text>
          <Text style={{ color: c.ink3, fontSize: 15, marginTop: 4 }}>{`${w.name} · ${tr('workout #{n}', { n: number })}`}</Text>
        </View>
        <View style={styles.facts}>
          {[[tr('Duration'), f.dur(w.endedAt - w.startedAt)], [tr('Volume'), volume ? f.volume(volume) : '—'], [tr('Sets'), String(sets)]].map(([k, v]) => (
            <View key={k} style={[styles.fact, { backgroundColor: c.surface }]}>
              <Text style={{ color: c.ink3, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</Text>
              <Text style={{ color: c.ink, fontSize: 18, fontWeight: '700', marginTop: 2 }}>{v}</Text>
            </View>
          ))}
        </View>
        {prs.length > 0 && (
          <>
            <SectionTitle>{tr('Personal records')}</SectionTitle>
            <Group>
              {prs.map((p, i) => (
                <View key={p.exerciseId + p.metric} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]} testID={`pr-${p.exerciseId}-${p.metric}`}>
                  <Icon name="trophy" size={18} color={c.gold} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: c.ink, fontSize: 16 }} numberOfLines={1}>{exercises.get(p.exerciseId)?.name}</Text>
                    <Text style={{ color: c.ink3, fontSize: 13 }}>{tr((PR_LABEL as Record<string, string>)[p.metric] || p.metric)}</Text>
                  </View>
                  <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value(p.metric, p.value)}</Text>
                </View>
              ))}
            </Group>
          </>
        )}
        <SectionTitle>{tr('Exercises')}</SectionTitle>
        <Group>
          {w.exercises.map((e, i) => {
            const ex = exercises.get(e.exerciseId);
            const b = bestSet(e.sets, ex?.category, settings.formula);
            return (
              <View key={e.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: c.ink, fontSize: 16 }} numberOfLines={1}>{ex?.name || tr('Unknown exercise')}</Text>
                  <Text style={{ color: c.ink3, fontSize: 13 }}>{f.plural(e.sets.length, 'set')}</Text>
                </View>
                <Text style={{ color: c.ink2, fontSize: 15, fontVariant: ['tabular-nums'] }}>{b ? f.setText(b, ex?.category) : ''}</Text>
              </View>
            );
          })}
        </Group>
        <View style={{ marginTop: 18 }}><Button kind="tinted" title={tr('View in history')} onPress={viewInHistory} testID="view-in-history" /></View>
      </ScrollView>
      <OverlayHost />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 6 },
  medal: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  facts: { flexDirection: 'row', gap: 8, marginTop: 8 },
  fact: { flex: 1, borderRadius: 12, padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
});
