// Settings → Warm-up sets: the scheme ⋯ → Add warm-up sets follows (the empty
// bar first, then percentages of the first working set). Cancel / Save in the
// navigation bar; core's warmupFromInput() cleans what was typed.
import { useState } from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_WARMUP, numToInput, warmupFromInput } from '@setlog/core';

import { setSetting, useSettings } from '@/data/store';
import type { Settings } from '@/data/types';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import {
  Button, Group, HeaderButton, Icon, Txt,
} from '@/ui/kit';
import { KeyboardDoneBar } from '@/ui/workout/DraftBlocks';
import { KEYBOARD_BAR } from '@/ui/workout/SetRow';

type Scheme = { barReps: number; steps: [number, number][] };
type Row = [string, string];
const rowsOf = (s: Scheme): Row[] => s.steps.map(([p, r]) => [numToInput(p), String(r)]);

export default function WarmupScreen() {
  const settings = useSettings();
  const { tr } = useFormat();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const cur = (settings.warmup || DEFAULT_WARMUP) as Scheme;
  const [bar, setBar] = useState(String(cur.barReps || 0));
  const [steps, setSteps] = useState<Row[]>(() => rowsOf(cur));
  const edit = (i: number, k: 0 | 1, v: string) => setSteps(steps.map((row, j) => (j === i ? (k === 0 ? [v, row[1]] : [row[0], v]) : row)));
  const save = () => {
    setSetting('warmup', warmupFromInput(bar, steps) as Settings['warmup']);
    router.back();
  };
  const reset = () => { setBar(String(DEFAULT_WARMUP.barReps)); setSteps(rowsOf(DEFAULT_WARMUP as Scheme)); };
  const input = (value: string, onChange: (v: string) => void, label: string, testID: string, decimal = false) => (
    <TextInput value={value} onChangeText={onChange} accessibilityLabel={label} testID={testID} selectTextOnFocus
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'} inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_BAR : undefined}
      style={[st.input, { color: c.ink, backgroundColor: c.surface2 }]} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{
        title: tr('Warm-up sets'),
        headerBackVisible: false,
        headerLeft: () => <HeaderButton title={tr('Cancel')} onPress={() => router.back()} testID="wu-cancel" />,
        headerRight: () => <HeaderButton title={tr('Save')} strong onPress={save} testID="wu-save" />,
      }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 48 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets>
        <Txt tone="ink2" style={{ fontSize: 14, marginBottom: 12, paddingHorizontal: 4 }}>{tr('Used by ⋯ → Add warm-up sets, based on your first working set.')}</Txt>
        <Group>
          <View style={st.row}>
            <Txt style={{ flex: 1 }}>{tr('Empty bar first')}</Txt>
            {input(bar, setBar, tr('Reps with the empty bar'), 'wu-bar')}
            <Txt tone="ink3" style={st.unit}>{tr('reps')}</Txt>
          </View>
          {steps.map(([p, r], i) => (
            <View key={i} style={st.row}>
              <View style={[st.hairline, { backgroundColor: c.line }]} />
              {input(p, (v) => edit(i, 0, v), tr('Step {n} percent', { n: i + 1 }), `wu-pct-${i}`, true)}
              <Txt tone="ink3" style={st.unit}>%  ×</Txt>
              {input(r, (v) => edit(i, 1, v), tr('Step {n} reps', { n: i + 1 }), `wu-reps-${i}`)}
              <Txt tone="ink3" style={[st.unit, { flex: 1 }]}>{tr('reps')}</Txt>
              <Pressable onPress={() => setSteps(steps.filter((_, j) => j !== i))} hitSlop={8} accessibilityRole="button"
                accessibilityLabel={tr('Remove step {n}', { n: i + 1 })} testID={`wu-remove-${i}`}
                style={({ pressed }) => [st.remove, { backgroundColor: pressed ? c.surface3 : 'transparent' }]}>
                <Icon name="close" size={16} color={c.ink3} />
              </Pressable>
            </View>
          ))}
        </Group>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}><Button kind="tinted" icon="plus" title={tr('Add step')} onPress={() => setSteps([...steps, ['', '']])} testID="wu-add" /></View>
          <View style={{ flex: 1 }}><Button kind="plain" title={tr('Reset')} onPress={reset} testID="wu-reset" /></View>
        </View>
      </ScrollView>
      <KeyboardDoneBar />
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 54, paddingHorizontal: 16, paddingVertical: 8 },
  hairline: { position: 'absolute', top: 0, left: 16, right: 0, height: StyleSheet.hairlineWidth },
  input: { width: 64, height: 38, borderRadius: 9, textAlign: 'center', fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 15 },
  remove: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
