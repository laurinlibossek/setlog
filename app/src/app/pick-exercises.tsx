// Picking exercises for the running workout (several at once) or a single one
// (Replace exercise). Opened through pickExercises() in lib/picker.ts.
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BODY_PARTS, matchExercise } from '@setlog/core';

import { allSessions, useAppSelector } from '@/data/store';
import { useFormat } from '@/lib/format';
import { currentPick, finishPick } from '@/lib/picker';
import { useColors } from '@/lib/theme';
import { Empty, Icon, SearchField } from '@/ui/kit';

export default function PickExercises() {
  const exercises = useAppSelector((s) => s.exercises);
  const workouts = useAppSelector((s) => s.workouts);
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [pick] = useState(() => currentPick());
  const multi = !!pick?.multi;
  const [q, setQ] = useState('');
  const [part, setPart] = useState('all');
  const [chosen, setChosen] = useState<string[]>([]);
  const sessions = useMemo(() => allSessions(), [workouts]);
  // closing the screen any other way counts as Cancel
  useEffect(() => () => { if (currentPick() === pick) finishPick(null); }, [pick]);

  const list = useMemo(() => [...exercises.values()]
    .filter((e) => !e.hidden && (part === 'all' || e.bodyPart === part) && matchExercise(e, q))
    .sort((a, b) => a.name.localeCompare(b.name)), [exercises, q, part]);
  const parts = [{ id: 'all', label: tr('All') }, ...(BODY_PARTS as { id: string; label: string }[]).map((b) => ({ id: b.id, label: tr(b.label) }))];
  const partLabel = (id: string) => tr((BODY_PARTS as { id: string; label: string }[]).find((b) => b.id === id)?.label || 'Other');

  const done = (ids: string[] | null) => { finishPick(ids); router.back(); };
  const tap = (id: string) => {
    if (!multi) { done([id]); return; }
    setChosen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };
  const top = Platform.OS === 'ios' ? 0 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: top + 10 }]}>
        <Pressable onPress={() => done(null)} hitSlop={8} accessibilityRole="button" testID="pick-cancel" style={styles.side}>
          <Text style={{ color: c.accentText, fontSize: 17 }}>{tr('Cancel')}</Text>
        </Pressable>
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }} numberOfLines={1}>{pick?.title || tr('Add exercises')}</Text>
        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          {multi && (
            <Pressable onPress={() => done(chosen)} disabled={!chosen.length} hitSlop={8} accessibilityRole="button" testID="pick-add">
              <Text style={{ color: chosen.length ? c.accentText : c.ink3, fontSize: 17, fontWeight: '700' }}>{chosen.length ? tr('Add {n}', { n: chosen.length }) : tr('Add')}</Text>
            </Pressable>
          )}
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 10 }}>
        <SearchField value={q} onChange={setQ} placeholder={tr('Search')} testID="pick-search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
          {parts.map((p) => {
            const on = p.id === part;
            return (
              <Pressable key={p.id} onPress={() => setPart(p.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? c.chipOn : c.surface }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: on ? c.chipOnInk : c.ink2 }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        initialNumToRender={20}
        ListEmptyComponent={<Empty title={tr('Nothing found')} text={tr('Try another word, or create your own exercise.')} />}
        renderItem={({ item, index }) => {
          const n = sessions.get(item.id)?.length || 0;
          const on = chosen.includes(item.id);
          return (
            <Pressable onPress={() => tap(item.id)} accessibilityRole={multi ? 'checkbox' : 'button'} aria-checked={multi ? on : undefined} testID={`pick-${item.id}`}
              style={({ pressed }) => [styles.row, {
                backgroundColor: on ? c.accentSoft : pressed ? c.surface2 : c.surface,
                borderTopLeftRadius: index === 0 ? 14 : 0, borderTopRightRadius: index === 0 ? 14 : 0,
                borderBottomLeftRadius: index === list.length - 1 ? 14 : 0, borderBottomRightRadius: index === list.length - 1 ? 14 : 0,
              }]}>
              {index > 0 && <View style={[styles.hairline, { backgroundColor: c.line }]} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: c.ink, fontSize: 16 }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ color: c.ink3, fontSize: 13, marginTop: 2 }} numberOfLines={1}>{partLabel(item.bodyPart) + (n ? ` · ${f.plural(n, 'time')}` : '')}</Text>
              </View>
              {on && <Icon name="check" size={18} color={c.accentText} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  side: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 9 },
  hairline: { position: 'absolute', top: 0, left: 16, right: 0, height: StyleSheet.hairlineWidth },
});
