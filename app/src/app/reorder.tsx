// Reordering the exercises of a draft (the running workout, or the template
// or workout being edited: ?draft=edit): drag the ≡ handle, or press and
// hold a row and drag it. The others slide out of the way.
import { useRef, useState } from 'react';
import {
  Animated, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { moveItem } from '@setlog/core';

import { editDraft, getDraft, useAppSelector } from '@/data/store';
import type { DraftKey, EntryDraft } from '@/data/types';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { Icon } from '@/ui/kit';

const ROW = 64;
type Drag = { from: number; over: number };

export default function Reorder() {
  const { draft } = useLocalSearchParams<{ draft?: string }>();
  const key: DraftKey = draft === 'edit' ? 'edit' : 'active';
  const a = useAppSelector((s) => getDraft(key, s));
  const exercises = useAppSelector((s) => s.exercises);
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const list = a?.exercises || [];
  const count = list.length;
  const countRef = useRef(count);
  countRef.current = count;

  const set = (d: Drag | null) => { dragRef.current = d; setDrag(d); };
  const api = {
    begin: (i: number) => {
      if (dragRef.current) return;
      dy.setValue(0);
      set({ from: i, over: i });
      Haptics.selectionAsync().catch(() => {});
    },
    move: (y: number) => {
      const d = dragRef.current;
      if (!d) return;
      dy.setValue(y);
      const over = Math.max(0, Math.min(countRef.current - 1, Math.round(d.from + y / ROW)));
      if (over !== d.over) set({ ...d, over });
    },
    end: () => {
      const d = dragRef.current;
      if (!d) return;
      if (d.over !== d.from) editDraft(key, (x) => { moveItem(x.exercises, d.from, d.over); });
      dy.setValue(0);
      set(null);
    },
    step: (i: number, by: number) => {
      const j = i + by;
      if (j < 0 || j >= countRef.current) return;
      editDraft(key, (x) => { moveItem(x.exercises, i, j); });
    },
    dragging: (i: number) => dragRef.current?.from === i,
  };
  const apiRef = useRef(api);
  apiRef.current = api;

  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -ROW;
    if (drag.over < drag.from && i >= drag.over && i < drag.from) return ROW;
    return 0;
  };
  const top = Platform.OS === 'ios' ? 0 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: top + 10 }]}>
        <View style={{ flex: 1 }} />
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>{tr('Reorder')}</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" testID="reorder-done">
            <Text style={{ color: c.accentText, fontSize: 17, fontWeight: '700' }}>{tr('Done')}</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView scrollEnabled={!drag} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <View style={[styles.group, { backgroundColor: c.surface }]}>
          {list.map((e, i) => (
            <Row key={e.id} entry={e} index={i} name={exercises.get(e.exerciseId)?.name || ''} sub={f.plural(e.sets.length, 'set') + (e.supersetId ? ` · ${tr('superset')}` : '')}
              lifted={drag?.from === i} shift={shift(i)} dy={dy} api={apiRef} first={i === 0} moveLabel={tr('Move {name}', { name: exercises.get(e.exerciseId)?.name || '' })} />
          ))}
        </View>
        <Text style={{ color: c.ink3, fontSize: 13, marginTop: 10, paddingHorizontal: 4 }}>{tr('Drag ≡ to move an exercise, or press and hold it.')}</Text>
      </ScrollView>
    </View>
  );
}

type Api = { begin: (i: number) => void; move: (y: number) => void; end: () => void; step: (i: number, by: number) => void; dragging: (i: number) => boolean };

function Row({
  entry, index, name, sub, lifted, shift, dy, api, first, moveLabel,
}: { entry: EntryDraft; index: number; name: string; sub: string; lifted: boolean; shift: number; dy: Animated.Value; api: { current: Api }; first: boolean; moveLabel: string }) {
  const c = useColors();
  const idx = useRef(index);
  idx.current = index;
  // the handle drags right away
  const handle = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => api.current.begin(idx.current),
    onPanResponderMove: (_, g) => api.current.move(g.dy),
    onPanResponderRelease: () => api.current.end(),
    onPanResponderTerminate: () => api.current.end(),
    onPanResponderTerminationRequest: () => false,
  })).current;
  // the rest of the row after a long press
  const body = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => api.current.dragging(idx.current),
    onPanResponderMove: (_, g) => api.current.move(g.dy),
    onPanResponderRelease: () => api.current.end(),
    onPanResponderTerminate: () => api.current.end(),
    onPanResponderTerminationRequest: () => false,
  })).current;
  return (
    <Animated.View {...body.panHandlers} testID={`reorder-${entry.exerciseId}`}
      style={[styles.row, {
        backgroundColor: c.surface, zIndex: lifted ? 2 : 0,
        transform: [{ translateY: lifted ? dy : shift }, { scale: lifted ? 1.02 : 1 }],
      }, lifted && styles.lifted]}>
      {!first && !lifted && <View style={[styles.hairline, { backgroundColor: c.line }]} />}
      <Pressable onLongPress={() => api.current.begin(idx.current)} delayLongPress={320} onPressOut={() => { if (api.current.dragging(idx.current)) api.current.end(); }}
        style={{ flex: 1, minWidth: 0, justifyContent: 'center', height: '100%' }}>
        <Text style={{ color: c.ink, fontSize: 16 }} numberOfLines={1}>{name}</Text>
        <Text style={{ color: c.ink3, fontSize: 13, marginTop: 2 }} numberOfLines={1}>{sub}</Text>
      </Pressable>
      <View {...handle.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={moveLabel} testID={`grip-${entry.exerciseId}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(ev) => api.current.step(idx.current, ev.nativeEvent.actionName === 'decrement' ? 1 : -1)}
        style={styles.grip}>
        <Icon name="grip" size={20} color={c.ink3} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  group: { borderRadius: 14 },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, borderRadius: 14 },
  lifted: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  hairline: { position: 'absolute', top: 0, left: 16, right: 0, height: StyleSheet.hairlineWidth },
  grip: { width: 52, height: '100%', alignItems: 'center', justifyContent: 'center' },
});
