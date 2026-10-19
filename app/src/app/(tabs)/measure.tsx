import { router } from 'expo-router';
import { View } from 'react-native';
import { MEASUREMENTS, DAY } from '@setlog/core';

import { useAppState } from '@/data/store';
import type { Measurement } from '@/data/types';
import { useFormat } from '@/lib/format';
import {
  fmtMeasure, logMeasurement, measureDef, toDisplay, unitOf, type MeasureDef,
} from '@/lib/measure';
import {
  Button, Cell, Group, Screen, SectionTitle,
} from '@/ui/kit';

export default function MeasureTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const st = s.settings;
  const byType = new Map<string, Measurement[]>();
  for (const m of s.measurements) { if (!byType.has(m.type)) byType.set(m.type, []); byType.get(m.type)!.push(m); }

  const row = (d: MeasureDef, i: number) => {
    const list = byType.get(d.id) || [];
    const last = list[0];
    let sub = tr('No entries yet');
    if (last) {
      sub = f.relDay(last.at);
      const ref = list.find((m) => m.at <= last.at - 28 * DAY);
      if (ref) {
        const diff = toDisplay(d, last.value, st) - toDisplay(d, ref.value, st);
        sub += ` · ${tr('{change} in 4 weeks', { change: `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${f.num(Math.abs(diff), 1)} ${unitOf(d, st)}` })}`;
      }
    }
    return (
      <Cell key={d.id} first={i === 0} title={tr(d.label)} sub={sub} value={last ? fmtMeasure(d, last.value, st, f) : undefined}
        onPress={() => router.push({ pathname: '/measure/[type]', params: { type: d.id } })} testID={`measure-${d.id}`} />
    );
  };
  const defs = MEASUREMENTS as MeasureDef[];
  return (
    <Screen title={tr('Measure')}>
      <View style={{ marginTop: 4 }}>
        <Button large icon="weight" title={tr('Log body weight')} onPress={() => logMeasurement(measureDef('bodyweight'), f)} testID="log-bodyweight" />
      </View>
      <SectionTitle>{tr('Body')}</SectionTitle>
      <Group>{defs.filter((d) => d.group === 'core').map(row)}</Group>
      <SectionTitle>{tr('Circumference')}</SectionTitle>
      <Group>{defs.filter((d) => d.group === 'body').map(row)}</Group>
    </Screen>
  );
}
