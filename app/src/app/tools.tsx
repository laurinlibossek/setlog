// Gym tools: the plate calculator (opened from a barbell exercise with its
// weight, ?w= in the lifting unit) and the 1RM calculator.
import { useState } from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  platesFor, est1RM, formulaLabel, parseNum, toKg, kgTo, roundW,
} from '@setlog/core';

import { useSettings } from '@/data/store';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { Card, Segments, Txt } from '@/ui/kit';
import { KeyboardDoneBar } from '@/ui/workout/DraftBlocks';
import { KEYBOARD_BAR } from '@/ui/workout/SetRow';

// competition plate colours by weight (kg); lb plates use the nearest match
const PLATE_STYLE: Record<number, [string, number]> = {
  25: ['#d93a2b', 1], 20: ['#2a6fd6', 0.94], 15: ['#e0b100', 0.86], 10: ['#2a9a4a', 0.78],
  5: ['#e9edf2', 0.6], 2.5: ['#1d2229', 0.5], 1.25: ['#a7afba', 0.42], 0.5: ['#a7afba', 0.36],
  45: ['#2a6fd6', 1], 35: ['#e0b100', 0.9], 2: ['#1d2229', 0.48], 1: ['#a7afba', 0.4],
};
const plateLook = (p: number) => {
  const [color, scale] = PLATE_STYLE[p] || ['#8b95a3', 0.5];
  return { color, h: Math.round(104 * scale), w: p >= 10 ? 15 : p >= 2.5 ? 11 : 8 };
};

export default function Tools() {
  const { w, tab: initialTab } = useLocalSearchParams<{ w?: string; tab?: string }>();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'plates' | 'rm'>(initialTab === 'rm' ? 'rm' : 'plates');
  const top = Platform.OS === 'ios' ? 0 : insets.top;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: top + 10 }]}>
        <View style={{ flex: 1 }} />
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>{tr('Tools')}</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" testID="tools-done">
            <Text style={{ color: c.accentText, fontSize: 17, fontWeight: '700' }}>{tr('Done')}</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Segments value={tab} onChange={setTab} testID="tools-tabs" options={[{ value: 'plates', label: tr('Plate calculator') }, { value: 'rm', label: tr('1RM calculator') }]} />
        {tab === 'plates' ? <Plates initial={w} /> : <OneRM />}
      </ScrollView>
      <KeyboardDoneBar />
    </View>
  );
}

function BigInput({ value, onChange, placeholder, label, testID, integer }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; testID: string; integer?: boolean }) {
  const c = useColors();
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Txt tone="ink2" style={{ fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>{label}</Txt>
      <TextInput value={value} onChangeText={(v) => onChange(v.replace(/[^\d.,]/g, '').slice(0, 7))} placeholder={placeholder} placeholderTextColor={c.ink3}
        keyboardType={integer ? 'number-pad' : 'decimal-pad'} selectTextOnFocus accessibilityLabel={label} testID={testID}
        inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_BAR : undefined}
        style={[styles.big, { color: c.ink, backgroundColor: c.surface }]} />
    </View>
  );
}

function Plates({ initial }: { initial?: string }) {
  const st = useSettings();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const u = st.unit;
  const [val, setVal] = useState(initial ? f.num(Number(initial), 2).replace(/[^\d.,]/g, '') : '');
  const [bar, setBar] = useState(st.bar);
  const target = parseNum(val);
  const res = target !== null ? platesFor(target, bar, st.plates) as { plates: number[]; remainder: number } : null;
  const loaded = res ? bar + res.plates.reduce((a, p) => a + p * 2, 0) : null;
  const barOptions = u === 'lb' ? [45, 35, 33, 25, 15, 0] : [20, 15, 10, 7.5, 0];
  return (
    <View style={{ gap: 14 }}>
      <BigInput label={tr('Target weight ({unit})', { unit: u })} value={val} onChange={setVal} placeholder={u === 'lb' ? '225' : '100'} testID="plate-target" />
      <View style={{ gap: 6 }}>
        <Txt tone="ink2" style={{ fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>{tr('Bar')}</Txt>
        <Segments value={String(bar)} onChange={(v) => setBar(Number(v))} testID="plate-bar"
          options={barOptions.map((b) => ({ value: String(b), label: b ? f.num(b, 1) : tr('None') }))} />
      </View>
      {res && target !== null && (
        <Card>
          {target < bar ? <Txt tone="ink3" style={{ textAlign: 'center', marginVertical: 8 }}>{tr('That’s lighter than the bar.')}</Txt> : (
            <View style={{ gap: 10 }}>
              <Txt style={{ fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{tr('Each side')}</Txt>
              <View style={styles.barRow} accessible={false}>
                <View style={[styles.shaft, { backgroundColor: c.ink3 }]} />
                <View style={[styles.collar, { backgroundColor: c.ink2 }]} />
                {res.plates.map((p, i) => {
                  const v = plateLook(p);
                  return <View key={i} style={{ height: v.h, width: v.w, backgroundColor: v.color, borderRadius: 3, marginLeft: 2, borderWidth: p === 5 ? StyleSheet.hairlineWidth : 0, borderColor: '#999' }} />;
                })}
                <View style={[styles.sleeve, { backgroundColor: c.ink3 }]} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }} testID="plate-list">
                {res.plates.length ? res.plates.map((p, i) => (
                  <View key={i} style={[styles.chip, { backgroundColor: c.surface2 }]}><Text style={{ color: c.ink, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{f.num(p, 2)}</Text></View>
                )) : <Txt tone="ink3">{tr('Just the bar')}</Txt>}
              </View>
              <Txt tone="ink3" style={{ fontSize: 14, textAlign: 'center' }} >
                {`${tr('Loaded:')} `}<Txt style={{ fontSize: 14, fontWeight: '700' }}>{`${f.num(loaded, 2)} ${u}`}</Txt>
                {res.remainder > 0 ? ` · ${tr('{w} can’t be loaded with your plates', { w: `${f.num(res.remainder, 2)} ${u}` })}` : ''}
              </Txt>
            </View>
          )}
        </Card>
      )}
      <Txt tone="ink3" style={{ fontSize: 13, paddingHorizontal: 4 }}>{tr('Plates and bar weights can be changed in Settings → Plates.')}</Txt>
    </View>
  );
}

function OneRM() {
  const st = useSettings();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const u = st.unit;
  const [wv, setW] = useState('');
  const [rv, setR] = useState('');
  const wN = parseNum(wv), rN = parseNum(rv);
  const kg = wN !== null ? toKg(wN, u) : null;
  const oneRm = kg && rN ? est1RM(kg, Math.round(rN), st.formula) : 0;
  const pct = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];
  const repsAt: Record<number, number> = { 100: 1, 95: 2, 90: 4, 85: 6, 80: 8, 75: 10, 70: 12, 65: 15, 60: 18, 50: 25 };
  const show = (v: number) => `${f.num(roundW(kgTo(v, u), u), 1)} ${u}`;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <BigInput label={tr('Weight ({unit})', { unit: u })} value={wv} onChange={setW} testID="rm-w" />
        <BigInput label={tr('Reps')} value={rv} onChange={setR} integer testID="rm-r" />
      </View>
      {oneRm > 0 && (
        <>
          <Card style={{ alignItems: 'center' }}>
            <Txt tone="ink3" style={{ fontSize: 13 }}>{tr('Estimated 1RM')}</Txt>
            <Txt style={{ fontSize: 40, fontWeight: '800', letterSpacing: -0.5 }} >{show(oneRm)}</Txt>
            <Txt tone="ink3" style={{ fontSize: 13 }}>{st.formula === 'average' ? tr(formulaLabel('average')) : tr('{name} formula', { name: formulaLabel(st.formula) })}</Txt>
          </Card>
          <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: c.surface }}>
            <View style={[styles.rmRow, { backgroundColor: c.surface2 }]}>
              {[tr('% of 1RM'), tr('≈ reps'), tr('Weight')].map((h) => <Text key={h} style={[styles.rmCell, { color: c.label, fontSize: 12, fontWeight: '700' }]}>{h}</Text>)}
            </View>
            {pct.map((p) => (
              <View key={p} style={[styles.rmRow, { borderTopColor: c.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.rmCell, { color: c.ink }]}>{`${p}%`}</Text>
                <Text style={[styles.rmCell, { color: c.ink3 }]}>{repsAt[p]}</Text>
                <Text style={[styles.rmCell, { color: c.ink, fontWeight: '700' }]}>{show((oneRm * p) / 100)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  big: { height: 60, borderRadius: 12, textAlign: 'center', fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  barRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 112 },
  shaft: { width: 40, height: 10, borderRadius: 2 },
  collar: { width: 8, height: 26, borderRadius: 2 },
  sleeve: { width: 30, height: 14, borderRadius: 2, marginLeft: 2 },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  rmRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  rmCell: { flex: 1, fontSize: 15, fontVariant: ['tabular-nums'] },
});
