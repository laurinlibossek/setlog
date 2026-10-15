import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { EXAMPLE_TEMPLATES, usesWeight } from '@setlog/core';

import { useAppState } from '@/data/store';
import type { Template } from '@/data/types';
import { useFormat } from '@/lib/format';
import { beginWorkout } from '@/lib/workout';
import {
  Button, Card, Cell, Empty, Group, Page, Txt,
} from '@/ui/kit';

export default function TemplatePreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const own = s.templates.find((t) => t.id === id);
  const ex = !own && (EXAMPLE_TEMPLATES as Template[]).find((t) => t.id === id);
  const t: Template | undefined = own || (ex ? { ...ex, name: tr(ex.name), folder: tr(ex.folder || '') } : undefined);
  if (!t) return <Page><Empty title={tr('Template not found')} /></Page>;

  let at = 0;
  if (!t.example) {
    at = t.lastUsedAt || 0;
    if (!at) for (const w of s.workouts) if (w.templateId === t.id) { at = w.startedAt; break; }
  }
  const info = t.example
    ? `${tr('Example')} · ${t.folder}`
    : [t.archived ? tr('Archived') : '', t.folder, at ? tr('Last done {when}', { when: f.relDayLower(at) }) : tr('Not done yet')].filter(Boolean).join(' · ');
  const rows = t.exercises.filter((e) => s.exercises.has(e.exerciseId));

  return (
    <Page>
      <Stack.Screen options={{ title: t.name }} />
      <Txt tone="ink3" style={{ fontSize: 14, marginBottom: 12 }}>{info}</Txt>
      {!!t.notes && <Card style={{ marginBottom: 12 }}><Txt tone="ink2" style={{ fontSize: 15 }}>{t.notes}</Txt></Card>}
      <Group>
        {rows.map((e, i) => {
          const exr = s.exercises.get(e.exerciseId)!;
          const targets = e.sets.map((x) => {
            if (usesWeight(exr.category) && (x.w === undefined || x.w === null) && x.r) return f.plural(x.r, 'rep');
            return x.w || x.r || x.t || x.d ? f.setText(x, exr.category, true) : null;
          }).filter(Boolean);
          const sub = f.plural(e.sets.length, 'set')
            + (targets.length ? ' · ' + [...new Set(targets)].join(', ') : '')
            + (e.restSec ? ` · ${tr('rest {time}', { time: f.clock(e.restSec) })}` : '');
          return <Cell key={i} first={i === 0} title={exr.name} sub={sub} />;
        })}
      </Group>
      <View style={{ marginTop: 18 }}>
        <Button large icon="play" title={tr('Start workout')} onPress={() => beginWorkout({ template: t }, f)} testID="start-template" />
      </View>
    </Page>
  );
}
