import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { EXAMPLE_TEMPLATES } from '@setlog/core';

import { suggestion, useAppState } from '@/data/store';
import type { Template } from '@/data/types';
import { useFormat } from '@/lib/format';
import { beginWorkout } from '@/lib/workout';
import { useColors } from '@/lib/theme';
import {
  Button, Card, Icon, Screen, SectionTitle, Txt,
} from '@/ui/kit';

function lastUsed(t: Template, workouts: { templateId: string | null; startedAt: number }[]) {
  if (t.lastUsedAt) return t.lastUsedAt;
  for (const w of workouts) if (w.templateId === t.id) return w.startedAt;
  return 0;
}

export default function WorkoutTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const sug = useMemo(() => suggestion(s), [s.templates, s.workouts]);

  const { order, folders, archived } = useMemo(() => {
    const byName = (a: Template, b: Template) => a.name.localeCompare(b.name);
    const recent = (s.settings.templateSort || 'name') === 'recent';
    const sort = (list: Template[]) => list.sort(recent ? (a, b) => (lastUsed(b, s.workouts) - lastUsed(a, s.workouts)) || byName(a, b) : byName);
    const map = new Map<string, Template[]>();
    for (const f of (s.meta.folders as string[] | undefined) || []) map.set(f, []);
    for (const t of sort(s.templates.filter((x) => !x.archived))) {
      const key = t.folder || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    const keys = [...map.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
    return { order: keys, folders: map, archived: s.templates.filter((x) => x.archived).length };
  }, [s.templates, s.workouts, s.settings.templateSort, s.meta.folders]);

  const why = (w: NonNullable<typeof sug>['why']) => {
    if (w.kind === 'weekday') {
      const d = new Date(); d.setDate(d.getDate() + (((w.day ?? 0) - d.getDay() + 7) % 7));
      const day = f.date.weekdayLong(d.getTime());
      return tr('Usually on {days}', { days: f.lang === 'de' ? `${day.toLowerCase()}s` : `${day}s` });
    }
    if (w.kind === 'after') return tr('Usually after {name}', { name: w.name ?? '' });
    return tr('Last done {when}', { when: f.relDayLower(w.at ?? 0) });
  };

  const card = (t: Template) => {
    const lines = t.exercises.filter((e) => s.exercises.has(e.exerciseId));
    const at = t.example ? 0 : lastUsed(t, s.workouts);
    return (
      <Card key={t.id} onPress={() => router.push({ pathname: '/template/[id]', params: { id: t.id } })} style={st.tpl} testID={`template-${t.id}`}>
        <Txt style={st.tplName} numberOfLines={1}>{t.name}</Txt>
        {lines.slice(0, 4).map((e, i) => (
          <Txt key={i} tone="ink2" style={st.tplLine} numberOfLines={1}>{`${e.sets.length} × ${s.exercises.get(e.exerciseId)!.name}`}</Txt>
        ))}
        {lines.length > 4 && <Txt tone="ink3" style={st.tplLine}>{tr('+ {n} more', { n: lines.length - 4 })}</Txt>}
        {!lines.length && <Txt tone="ink3" style={st.tplLine}>{tr('No exercises')}</Txt>}
        {!t.example && (
          <View style={st.when}>
            <Icon name="clock" size={12} color={c.ink3} />
            <Txt tone="ink3" style={{ fontSize: 13 }}>{at ? f.relDay(at) : tr('Not done yet')}</Txt>
          </View>
        )}
      </Card>
    );
  };
  const grid = (list: Template[]) => <View style={st.grid}>{list.map(card)}</View>;
  const examples = (EXAMPLE_TEMPLATES as Template[]).map((t) => ({ ...t, name: tr(t.name), folder: tr(t.folder || '') }));

  return (
    <Screen title={tr('Start workout')}>
      <Card style={{ gap: 10 }}>
        {sug && (
          <View style={{ gap: 8 }}>
            <Text style={[st.label, { color: c.label }]}>{tr('Suggested')}</Text>
            <Button large icon="play" title={tr('Start {name}', { name: sug.template.name })} onPress={() => beginWorkout({ template: sug.template }, f)} testID="start-suggested" />
            <Txt tone="ink3" style={{ fontSize: 13, textAlign: 'center' }}>{why(sug.why)}</Txt>
          </View>
        )}
        <Button large icon="plus" kind={sug ? 'tinted' : 'primary'} title={tr('Start an empty workout')} onPress={() => beginWorkout({}, f)} testID="start-empty" />
      </Card>

      <SectionTitle>{tr('Templates')}</SectionTitle>
      {!s.templates.length && <Txt tone="ink3" style={{ fontSize: 14, paddingHorizontal: 4 }}>{tr('Save the workouts you repeat as templates. Start from an example, tap + Template, or finish a workout and tap “Save as template” in History.')}</Txt>}
      {order.map((key) => {
        const list = folders.get(key)!;
        return (
          <View key={'f' + key}>
            {(key || order.length > 1) && <Txt tone="ink2" style={st.folder}>{`${key || tr('My templates')} (${list.length})`}</Txt>}
            {list.length ? grid(list) : <Txt tone="ink3" style={{ fontSize: 14, paddingHorizontal: 4 }}>{tr('Empty. Use ⋯ → Move to folder on a template to put it here.')}</Txt>}
          </View>
        );
      })}
      {archived > 0 && <Txt tone="ink3" style={[st.folder, { fontWeight: '500' }]}>{`${tr('Archived')} (${archived})`}</Txt>}

      {s.settings.showExamples !== false && (
        <>
          <SectionTitle>{tr('Examples')}</SectionTitle>
          {grid(examples)}
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tpl: { width: '48.5%', flexGrow: 1, flexBasis: '45%', minHeight: 118, gap: 2 },
  tplName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  tplLine: { fontSize: 13 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto', paddingTop: 6 },
  folder: { fontSize: 15, fontWeight: '600', marginTop: 8, marginBottom: 8, paddingHorizontal: 4 },
});
