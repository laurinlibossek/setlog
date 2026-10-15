// One set in the running workout: type label, last time's numbers, the
// inputs (grey placeholders = what will be saved if left empty) and the check
// button. Swipe left to delete.
import { memo, useEffect, useMemo, useRef } from 'react';
import {
  Animated, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { fmtDigits } from '@setlog/core';

import type { SetDraft } from '@/data/types';
import { useColors } from '@/lib/theme';
import { Icon } from '@/ui/kit';

export const KEYBOARD_BAR = 'set-keys';

export type Field = 'w' | 'r' | 'd' | 't';
type Props = {
  set: SetDraft;
  label: string;
  fields: Field[];
  ph: Record<string, string>;
  prevText: string;
  badge: 'pr' | string | null;
  shake: number;
  showCheck: boolean;
  labels: { set: string; prev: string; field: Record<Field, string>; check: string; uncheck: string; delete: string };
  onChange: (f: Field, v: string) => void;
  onToggle: () => void;
  onMenu: () => void;
  onPrev: () => void;
  onDelete: () => void;
};

export const COLS = { label: 40, two: [76, 64], one: 96, check: 40, gap: 8 };

export const SetRow = memo(function SetRow({
  set, label, fields, ph, prevText, badge, shake, showCheck, labels, onChange, onToggle, onMenu, onPrev, onDelete,
}: Props) {
  const c = useColors();
  const dx = useRef(new Animated.Value(0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const del = useRef(onDelete);
  del.current = onDelete;
  const native = Platform.OS !== 'web';

  useEffect(() => {
    if (!shake) return;
    Animated.sequence([-5, 5, -4, 4, 0].map((v) => Animated.timing(shakeX, { toValue: v, duration: 60, useNativeDriver: native }))).start();
  }, [shake, shakeX, native]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
    onPanResponderMove: (_, g) => dx.setValue(Math.min(0, g.dx)),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -90) Animated.timing(dx, { toValue: -600, duration: 160, useNativeDriver: native }).start(() => del.current());
      else Animated.spring(dx, { toValue: 0, useNativeDriver: native }).start();
    },
    onPanResponderTerminate: () => Animated.spring(dx, { toValue: 0, useNativeDriver: native }).start(),
  }), [dx, native]);

  const typeColor = set.type === 'warmup' ? [c.warm, c.warmSoft] : set.type === 'drop' ? [c.drop, c.dropSoft] : set.type === 'failure' ? [c.danger, c.dangerSoft] : [c.ink, c.surface2];
  const widths = fields.length === 1 ? [COLS.one] : COLS.two;
  const input = (f: Field, i: number) => {
    const isTime = f === 't';
    const value = isTime ? fmtDigits(set.t) : set[f];
    const placeholder = isTime ? (fmtDigits(ph.t) || '0:00') : (ph[f] || '');
    return (
      <TextInput key={f} value={value} placeholder={placeholder} placeholderTextColor={c.ink3}
        onChangeText={(v) => onChange(f, isTime ? v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6) : v.replace(/[^\d.,]/g, '').slice(0, 7))}
        keyboardType={f === 'r' || isTime ? 'number-pad' : 'decimal-pad'} selectTextOnFocus inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_BAR : undefined}
        accessibilityLabel={labels.field[f]} testID={`in-${f}-${set.id}`} maxLength={isTime ? 8 : 7}
        style={[styles.input, { width: widths[i], color: c.ink, backgroundColor: set.done ? 'transparent' : c.surface2 }]} />
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={[StyleSheet.absoluteFill, styles.delBg, { backgroundColor: c.danger }]}><Text style={styles.delText}>{labels.delete}</Text></View>
      <Animated.View {...pan.panHandlers} testID={`set-${set.id}`}
        style={[styles.row, { backgroundColor: c.surface, transform: [{ translateX: Animated.add(dx, shakeX) }] }]}>
        {/* the done tint can be see-through, so it sits on the row's solid background */}
        {set.done && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.doneSoft }]} />}
        <Pressable onPress={onMenu} accessibilityRole="button" accessibilityLabel={labels.set} testID={`label-${set.id}`}
          style={[styles.label, { backgroundColor: set.done ? 'transparent' : typeColor[1] }]}>
          <Text style={{ color: typeColor[0], fontWeight: '800', fontSize: 15 }}>{label}</Text>
          {!!badge && <Text style={{ color: badge === 'pr' ? c.gold : c.ink3, fontSize: 9.5, fontWeight: '700' }}>{badge === 'pr' ? 'PR' : `@${badge}`}</Text>}
        </Pressable>
        <Pressable onPress={onPrev} accessibilityRole="button" accessibilityLabel={labels.prev} style={styles.prev} testID={`prev-${set.id}`}>
          <Text style={{ color: c.ink3, fontSize: 14, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{prevText}</Text>
        </Pressable>
        {fields.map(input)}
        {showCheck && (
          <Pressable onPress={onToggle} accessibilityRole="checkbox" aria-checked={set.done} accessibilityLabel={set.done ? labels.uncheck : labels.check}
            testID={`check-${set.id}`} hitSlop={4} style={[styles.check, { backgroundColor: set.done ? c.done : c.surface3 }]}>
            <Icon name="check" size={18} color={set.done ? c.doneInk : c.ink3} />
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  delBg: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: 22 },
  delText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', height: 48, paddingLeft: 8, paddingRight: 10, gap: COLS.gap },
  label: { width: COLS.label, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  prev: { flex: 1, minWidth: 0, height: 36, justifyContent: 'center', paddingHorizontal: 4, borderRadius: 8 },
  input: { height: 34, borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'], paddingHorizontal: 4, paddingVertical: 0 },
  check: { width: COLS.check, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
