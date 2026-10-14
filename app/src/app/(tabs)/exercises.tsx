import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BODY_PARTS, matchExercise } from '@setlog/core';

import { allSessions, useAppState } from '@/data/store';
import { useFormat } from '@/lib/format';

import { useColors } from '@/lib/theme';
import {
  Cell, Empty, LargeTitle, SearchField, Txt,
} from '@/ui/kit';

export default function ExercisesTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [part, setPart] = useState('all');
  const sessions = allSessions(s);

  const list = useMemo(() => [...s.exercises.values()]
    .filter((e) => !e.hidden && (part === 'all' || e.bodyPart === part) && matchExercise(e, q))
    .sort((a, b) => a.name.localeCompare(b.name)), [s.exercises, q, part]);
  const total = useMemo(() => [...s.exercises.values()].filter((e) => !e.hidden).length, [s.exercises]);
  const parts = [{ id: 'all', label: tr('All') }, ...(BODY_PARTS as { id: string; label: string }[]).map((b) => ({ id: b.id, label: tr(b.label) }))];
  const partLabel = (id: string) => tr((BODY_PARTS as { id: string; label: string }[]).find((b) => b.id === id)?.label || 'Other');

  const header = (
    <View>
      <LargeTitle title={tr('Exercises')} />
      <View style={{ paddingHorizontal: 16, gap: 10, marginBottom: 12 }}>
        <SearchField value={q} onChange={setQ} placeholder={tr('Search {n} exercises', { n: total })} testID="exercise-search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {parts.map((p) => {
            const on = p.id === part;
            return (
              <Pressable key={p.id} onPress={() => setPart(p.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? c.chipOn : c.surface }}>
                <Txt style={{ fontSize: 14, fontWeight: '600', color: on ? c.chipOnInk : c.ink2 }}>{p.label}</Txt>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 32 }}
      data={list}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item, index }) => {
        const n = sessions.get(item.id)?.length || 0;
        const last = sessions.get(item.id)?.[0]?.startedAt;
        return (
          <View style={{ marginHorizontal: 16, backgroundColor: c.surface, borderTopLeftRadius: index === 0 ? 14 : 0, borderTopRightRadius: index === 0 ? 14 : 0, borderBottomLeftRadius: index === list.length - 1 ? 14 : 0, borderBottomRightRadius: index === list.length - 1 ? 14 : 0, overflow: 'hidden' }}>
            <Cell first={index === 0} title={item.name} testID={`exercise-${item.id}`}
              sub={partLabel(item.bodyPart) + (n ? ` · ${f.plural(n, 'time')} · ${f.relDayLower(last!)}` : '')}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })} />
          </View>
        );
      }}
      ListEmptyComponent={<Empty title={tr('Nothing found')} text={tr('Try another word, or create your own exercise.')} />}
      initialNumToRender={20}
    />
  );
}
