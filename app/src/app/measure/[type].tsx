// One measurement: the latest value, a chart over a chosen range, adding an
// entry and the history (tap an entry to delete it, with undo).
import { useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { DAY, MEASURE_RANGES } from '@setlog/core';

import { addMeasurement, deleteMeasurement, useAppState } from '@/data/store';
import type { Measurement } from '@/data/types';
import { useFormat } from '@/lib/format';
import {
  fmtMeasure, logMeasurement, measureDef, toDisplay, unitOf,
} from '@/lib/measure';
import {
  Button, Card, Cell, Empty, Group, IconButton, Page, Segments, SectionTitle, Txt,
} from '@/ui/kit';
import { LineChart } from '@/ui/Chart';
import { actionSheet, toast } from '@/ui/overlay';

export default function MeasureDetail() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const st = s.settings;
  const d = measureDef(type);
  const [range, setRange] = useState('90');
  const [limit, setLimit] = useState(30);
  if (!d) return <Page><Stack.Screen options={{ title: '' }} /><Empty title={tr('Nothing found')} /></Page>;
  const list = s.measurements.filter((m) => m.type === type);
  const from = Number(range) ? Date.now() - Number(range) * DAY : 0;
  const pts = list.filter((m) => m.at >= from).slice().reverse().map((m) => ({ x: m.at, y: toDisplay(d, m.value, st) }));
  const fv = (v: number) => `${f.num(v, d.kind === 'kcal' ? 0 : 1)} ${unitOf(d, st)}`;
  const rowMenu = async (m: Measurement) => {
    const c = await actionSheet<string>({
      title: `${fmtMeasure(d, m.value, st, f)} · ${f.date.short(m.at)}`,
      actions: [{ label: tr('Delete entry'), value: 'del', destructive: true, testID: 'measure-delete' }],
    });
    if (c !== 'del') return;
    const gone = await deleteMeasurement(m.id);
    if (gone) toast(tr('Entry deleted'), { label: tr('Undo'), fn: () => { addMeasurement(gone); } });
  };
  const add = () => logMeasurement(d, f);
  // "Oct 19 · 9:48 PM"; older years keep theirs
  const when = (t: number) => (new Date(t).getFullYear() === new Date().getFullYear() ? f.date.dayMonth(t) : f.date.short(t));
  return (
    <Page>
      <Stack.Screen options={{ title: tr(d.label), headerRight: () => <IconButton icon="plus" label={tr('Add entry')} onPress={add} testID="measure-add-top" /> }} />
      <Card>
        <Txt style={{ fontSize: 22, fontWeight: '800' }} >{list[0] ? fmtMeasure(d, list[0].value, st, f) : '—'}</Txt>
        <Txt tone="ink3" style={{ fontSize: 13, marginTop: 2 }}>
          {list[0] ? `${tr('Latest')} · ${f.date.short(list[0].at)}` : tr('Log your first entry to start the chart')}
        </Txt>
        <LineChart points={pts} fmtVal={fv} fmtAxis={(v, dec) => f.num(v, dec)} label={tr(d.label)} testID="measure-chart"
          emptyText={list.length ? tr('No entries in this range') : tr('No entries yet')} />
        <View style={{ marginTop: 10 }}>
          <Segments value={range} onChange={setRange} options={(MEASURE_RANGES as { value: number; label: string }[]).map((r) => ({ value: String(r.value), label: tr(r.label) }))} />
        </View>
      </Card>
      <View style={{ marginTop: 12 }}>
        <Button kind="tinted" icon="plus" title={tr('Add entry')} onPress={add} testID="measure-add" />
      </View>
      {list.length > 0 && (
        <>
          <SectionTitle>{tr('History')}</SectionTitle>
          <Group>
            {list.slice(0, limit).map((m, i) => (
              <Cell key={m.id} first={i === 0} title={fmtMeasure(d, m.value, st, f)} value={`${when(m.at)} · ${f.date.time(m.at)}`}
                onPress={() => rowMenu(m)} chevron={false} testID={`entry-${i}`} />
            ))}
          </Group>
          {list.length > limit && <View style={{ marginTop: 10 }}><Button kind="tinted" title={tr('Show more')} onPress={() => setLimit(limit + 60)} /></View>}
        </>
      )}
    </Page>
  );
}
