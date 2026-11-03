// One set (docs/design/components.md, SetRow): its stroke, weight × reps (or
// the exercise's own fields), and small chips for the set type, the reps left
// and a record. The stroke logs and un-logs the set; there is no checkmark
// and no "Previous" column. Swipe left to delete; press and hold, or tap the
// chips, for the set's menu.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated as RNAnimated, PanResponder, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { CONTROL, RADIUS, SPACE, STROKE, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';
import type { StrokeState } from './Tally';
import { Highlight } from './Highlight';

/**
 * A set's stroke in a row: a hairline while pending, a stem once logged (it
 * grows in 160 ms, ease-out; at once with Reduce Motion), outlined while it is
 * the set being logged, signal for a record.
 */
export function RowStroke({ state }: { state: StrokeState }) {
  const { colors: t } = useTally();
  const warm = state === 'warmup' || state === 'warmupPending';
  const filled = state === 'done' || state === 'warmup' || state === 'record';
  const h = STROKE.h * (warm ? 0.55 : 1);
  const w = useSharedValue(filled ? STROKE.slot : STROKE.hair);
  useEffect(() => {
    w.value = withTiming(filled ? STROKE.slot : STROKE.hair, { duration: filled ? 160 : 0, easing: Easing.out(Easing.quad) });
  }, [filled, w]);
  const grow = useAnimatedStyle(() => ({ width: w.value }));
  const fill = state === 'record' ? t.signal : filled ? t.strokeDone : state === 'live' ? 'transparent' : t.ink3;
  return (
    <View style={{ width: STROKE.slot, height: h, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Animated.View style={[{ height: h, backgroundColor: fill }, grow,
        state === 'record' && t.signalEdge !== t.signal ? { borderWidth: 1, borderColor: t.signalEdge } : null]} />
      {state === 'live' && <View style={[StyleSheet.absoluteFill, { borderWidth: 1.5, borderColor: t.ink }]} />}
    </View>
  );
}

export type Chip = { text: string; record?: boolean };

type Props = {
  testID: string;
  first?: boolean;
  /** the running workout: the stroke that logs the set */
  stroke?: { state: StrokeState; checked: boolean; label: string; testID: string; onPress: () => void };
  /** editors: the set's label (W, 1, 2, D, F), which opens its menu */
  lead?: { text: string; label: string; onPress: () => void };
  /** the values: fields, joined by × */
  children: ReactNode;
  chips: Chip[];
  meta: { label: string; testID: string; onPress: () => void };
  deleteLabel: string;
  onDelete: () => void;
  /** changes to shake the row (a set that can't be logged yet) */
  shake?: number;
};

export function SetRow({
  testID, first, stroke, lead, children, chips, meta, deleteLabel, onDelete, shake = 0,
}: Props) {
  const { colors: t } = useTally();
  const native = Platform.OS !== 'web';
  const dx = useRef(new RNAnimated.Value(0)).current;
  const shakeX = useRef(new RNAnimated.Value(0)).current;
  const del = useRef(onDelete);
  del.current = onDelete;

  useEffect(() => {
    if (!shake) return;
    RNAnimated.sequence([-5, 5, -4, 4, 0].map((v) => RNAnimated.timing(shakeX, { toValue: v, duration: 60, useNativeDriver: native }))).start();
  }, [shake, shakeX, native]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
    onPanResponderMove: (_, g) => dx.setValue(Math.min(0, g.dx)),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -90) RNAnimated.timing(dx, { toValue: -600, duration: 160, useNativeDriver: native }).start(() => del.current());
      else RNAnimated.spring(dx, { toValue: 0, useNativeDriver: native }).start();
    },
    onPanResponderTerminate: () => RNAnimated.spring(dx, { toValue: 0, useNativeDriver: native }).start(),
  }), [dx, native]);

  return (
    <View style={styles.wrap}>
      <View style={[StyleSheet.absoluteFill, styles.delBg, { backgroundColor: t.danger }]}><Text style={[styles.delText, { color: t.paper }]}>{deleteLabel}</Text></View>
      <RNAnimated.View {...pan.panHandlers} testID={testID}
        style={[styles.row, { backgroundColor: t.paper, transform: [{ translateX: RNAnimated.add(dx, shakeX) }] }]}>
        {!first && <View style={[styles.hairline, { backgroundColor: t.line }]} />}
        {stroke && (
          <Pressable onPress={stroke.onPress} accessibilityRole="checkbox" aria-checked={stroke.checked} accessibilityState={{ checked: stroke.checked }}
            accessibilityLabel={stroke.label} testID={stroke.testID} style={styles.mark}>
            <RowStroke state={stroke.state} />
          </Pressable>
        )}
        {lead && (
          <Pressable onPress={lead.onPress} accessibilityRole="button" accessibilityLabel={lead.label} style={styles.mark}>
            <Text style={{ ...TYPE.headline, color: t.ink2, fontVariant: ['tabular-nums'] }}>{lead.text}</Text>
          </Pressable>
        )}
        <Pressable onLongPress={meta.onPress} delayLongPress={400} style={styles.values} accessible={false}>{children}</Pressable>
        <Pressable onPress={meta.onPress} accessibilityRole="button" accessibilityLabel={meta.label} testID={meta.testID} style={styles.meta}>
          {chips.map((c) => (c.record
            ? <Highlight key={c.text} chip>{c.text}</Highlight>
            : (
              <View key={c.text} style={[styles.chip, { backgroundColor: t.paper3 }]}>
                <Text style={{ ...TYPE.caption, fontWeight: '600', color: t.ink2, fontVariant: ['tabular-nums'] }}>{c.text}</Text>
              </View>
            )))}
        </Pressable>
      </RNAnimated.View>
    </View>
  );
}

/** Two values joined by a light ×, like "82.5 × 8". */
export function Times({ children }: { children: [ReactNode, ReactNode] | ReactNode }) {
  const { colors: t } = useTally();
  if (!Array.isArray(children)) return <>{children}</>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {children[0]}
      <Text style={{ ...TYPE.numberM, fontWeight: '400', color: t.ink3, marginHorizontal: 2 }} importantForAccessibility="no">×</Text>
      {children[1]}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  delBg: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: 22 },
  delText: { fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: CONTROL.rowH, paddingLeft: SPACE.s5 - 14, paddingRight: SPACE.s5, paddingVertical: 4 },
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  mark: { width: CONTROL.hitMin, height: CONTROL.hitMin, alignItems: 'center', justifyContent: 'center', marginRight: SPACE.s2 },
  values: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  meta: { flex: 1, minHeight: CONTROL.hitMin, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', alignContent: 'center', justifyContent: 'flex-end', gap: 6, paddingLeft: SPACE.s2 },
  chip: { minHeight: 26, paddingHorizontal: 10, borderRadius: RADIUS.capsule, justifyContent: 'center' },
});
