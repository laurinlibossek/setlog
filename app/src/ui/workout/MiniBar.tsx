// The running workout, minimized: a bar above the tabs. Tap to open it again.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppSelector } from '@/data/store';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { useNow } from '@/lib/useNow';
import { openWorkout } from '@/lib/workout';
import { Icon } from '@/ui/kit';

export function MiniBar() {
  const a = useAppSelector((s) => s.active);
  const now = useNow(1000, !!a);
  const c = useColors();
  const { tr, clock } = useFormat();
  if (!a) return null;
  const r = a.rest;
  return (
    <Pressable onPress={openWorkout} accessibilityRole="button" accessibilityLabel={tr('Open current workout')} testID="mini-bar"
      style={({ pressed }) => [styles.bar, { backgroundColor: pressed ? c.surface2 : c.surface, borderTopColor: c.line }]}>
      <View style={[styles.dot, { backgroundColor: c.done }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{a.name}</Text>
        <Text style={{ color: c.ink3, fontSize: 13, fontVariant: ['tabular-nums'] }}>{clock(Math.max(0, Math.floor((now - a.startedAt) / 1000)))}</Text>
      </View>
      {r && (
        <View style={[styles.rest, { backgroundColor: c.primarySoft }]}>
          <Icon name="timer" size={13} color={c.primaryText} />
          <Text style={{ color: c.primaryText, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{clock(Math.max(0, Math.ceil((r.end - now) / 1000)))}</Text>
        </View>
      )}
      <Icon name="chevron" size={14} color={c.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rest: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
});
