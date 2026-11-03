// Search: every exercise in the library, the field focused when the tab
// opens, body part chips, and + to create one. (Routines and past workouts
// join this list later; docs/design/navigation.md.)
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BODY_PARTS, matchExercise } from '@setlog/core';

import { allSessions, useAppState } from '@/data/store';
import { CONTROL, RADIUS, SPACE, TYPE } from '@/design/tally';
import { editExercise } from '@/lib/exerciseForm';
import { useFormat } from '@/lib/format';
import { useTally } from '@/lib/theme';
import { Button, Empty } from '@/ui/kit';
import { ListRow, SymbolIcon } from '@/ui/tally/ListRow';
import { TabTitle, useTabPadding } from '@/ui/tally/TabRoot';
import { NowLiftingDock } from '@/ui/workout/MiniBar';

export default function SearchTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const { colors: t } = useTally();
  const pad = useTabPadding();
  const [q, setQ] = useState('');
  const [part, setPart] = useState('all');
  const input = useRef<TextInput>(null);
  const sessions = allSessions(s);
  // focused on open, like the system's search tab
  useFocusEffect(useCallback(() => {
    const timer = setTimeout(() => input.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []));

  const list = useMemo(() => [...s.exercises.values()]
    .filter((e) => !e.hidden && (part === 'all' || e.bodyPart === part) && matchExercise(e, q))
    .sort((a, b) => f.exName(a).localeCompare(f.exName(b))), [s.exercises, q, part, f]);
  const total = useMemo(() => [...s.exercises.values()].filter((e) => !e.hidden).length, [s.exercises]);
  const parts = [{ id: 'all', label: tr('All') }, ...(BODY_PARTS as { id: string; label: string }[]).map((b) => ({ id: b.id, label: tr(b.label) }))];
  const partLabel = (id: string) => tr((BODY_PARTS as { id: string; label: string }[]).find((b) => b.id === id)?.label || 'Other');
  const create = async () => {
    const ex = await editExercise({ name: q.trim() });
    if (ex) router.push({ pathname: '/exercise/[id]', params: { id: ex.id } });
  };
  const plus = (
    <Pressable onPress={create} accessibilityRole="button" accessibilityLabel={tr('New exercise')} testID="new-exercise" hitSlop={4}
      style={({ pressed }) => ({ width: CONTROL.hitMin, height: CONTROL.hitMin, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.paper2 : t.paper3 })}>
      <SymbolIcon name="plus" size={22} color={t.ink} />
    </Pressable>
  );

  const header = (
    <View>
      <TabTitle title={tr('Search')} right={plus} />
      <View style={{ paddingHorizontal: SPACE.s5, gap: SPACE.s3, marginBottom: SPACE.s3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, borderRadius: RADIUS.capsule, paddingHorizontal: 14, backgroundColor: t.paper3 }}>
          <SymbolIcon name="magnifyingglass" size={16} color={t.ink2} />
          <TextInput ref={input} value={q} onChangeText={setQ} placeholder={tr('Search {n} exercises', { n: total })} placeholderTextColor={t.ink3}
            testID="exercise-search" accessibilityLabel={tr('Search')} autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" returnKeyType="search"
            style={[TYPE.body, { flex: 1, minWidth: 0, color: t.ink, paddingVertical: 10, outlineWidth: 0 }]} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
          {parts.map((p) => {
            const on = p.id === part;
            return (
              <Pressable key={p.id} onPress={() => setPart(p.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ paddingHorizontal: 12, minHeight: 32, justifyContent: 'center', borderRadius: RADIUS.capsule, backgroundColor: on ? t.ink : t.paper3 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: on ? t.paper : t.ink2 }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.paper }}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={pad}
        contentInsetAdjustmentBehavior="automatic"
        data={list}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item, index }) => {
          const n = sessions.get(item.id)?.length || 0;
          const last = sessions.get(item.id)?.[0]?.startedAt;
          return (
            <ListRow first={index === 0} title={f.exName(item)} testID={`exercise-${item.id}`} chevron
              subtitle={partLabel(item.bodyPart) + (n ? ` · ${f.plural(n, 'time')} · ${f.relDayLower(last!)}` : '')}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })} />
          );
        }}
        ListEmptyComponent={(
          <Empty title={tr('Nothing found')} text={tr('Try another word, or create your own exercise.')}>
            <Button kind="tinted" icon="plus" title={tr('Create “{name}”', { name: q.trim() || tr('new exercise') })} onPress={create} />
          </Empty>
        )}
        initialNumToRender={20}
      />
      <NowLiftingDock />
    </View>
  );
}
