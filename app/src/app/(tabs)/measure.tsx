import { MEASUREMENTS, kgTo, roundW, DAY } from '@setlog/core';

import { useAppState } from '@/data/store';
import type { Measurement } from '@/data/types';
import { useFormat } from '@/lib/format';
import {
  Cell, Group, Screen, SectionTitle,
} from '@/ui/kit';

type Def = { id: string; label: string; kind: 'weight' | 'percent' | 'kcal' | 'length'; group: 'core' | 'body' };

export default function MeasureTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const bw = (s.settings.bodyUnit || s.settings.unit) as 'kg' | 'lb';
  const len = s.settings.sizeUnit || (s.settings.distUnit === 'mi' ? 'in' : 'cm');
  const unitOf = (d: Def) => (d.kind === 'weight' ? bw : d.kind === 'percent' ? '%' : d.kind === 'kcal' ? 'kcal' : len);
  const show = (d: Def, v: number) => {
    if (d.kind === 'weight') return roundW(kgTo(v, bw), bw);
    if (d.kind === 'length') return len === 'in' ? Math.round((v / 2.54) * 10) / 10 : Math.round(v * 10) / 10;
    return v;
  };
  const byType = new Map<string, Measurement[]>();
  for (const m of s.measurements) { if (!byType.has(m.type)) byType.set(m.type, []); byType.get(m.type)!.push(m); }

  const row = (d: Def, i: number) => {
    const list = byType.get(d.id) || [];
    const last = list[0];
    let sub = tr('No entries yet');
    if (last) {
      sub = f.relDay(last.at);
      const ref = list.find((m) => m.at <= last.at - 28 * DAY);
      if (ref) {
        const diff = show(d, last.value) - show(d, ref.value);
        sub += ` · ${tr('{change} in 4 weeks', { change: `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${f.num(Math.abs(diff), 1)} ${unitOf(d)}` })}`;
      }
    }
    return <Cell key={d.id} first={i === 0} title={tr(d.label)} sub={sub} value={last ? `${f.num(show(d, last.value), d.kind === 'kcal' ? 0 : 1)} ${unitOf(d)}` : undefined} />;
  };
  const defs = MEASUREMENTS as Def[];
  return (
    <Screen title={tr('Measure')}>
      <SectionTitle>{tr('Body')}</SectionTitle>
      <Group>{defs.filter((d) => d.group === 'core').map(row)}</Group>
      <SectionTitle>{tr('Circumference')}</SectionTitle>
      <Group>{defs.filter((d) => d.group === 'body').map(row)}</Group>
    </Screen>
  );
}
