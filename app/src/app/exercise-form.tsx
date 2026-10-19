// Create a custom exercise (from the picker or the Exercises tab) or edit
// one: name, what it logs, body part and notes. Opened through
// editExercise() in lib/exerciseForm.ts.
import { useEffect, useState } from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BODY_PARTS, CATEGORIES, CATEGORY_HELP, loggedFields,
} from '@setlog/core';

import {
  addExercise, allSessions, findExercise, getState, updateExercise,
} from '@/data/store';
import type { Category } from '@/data/types';
import { currentForm, finishForm } from '@/lib/exerciseForm';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import {
  Cell, Field, Group, SectionTitle, Txt,
} from '@/ui/kit';
import { OverlayHost, ask, toast } from '@/ui/overlay';

export default function ExerciseForm() {
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [form] = useState(() => currentForm());
  const ex = form?.id ? getState().exercises.get(form.id) || null : null;
  const [name, setName] = useState(ex?.name || form?.name || '');
  const [category, setCategory] = useState<Category>(ex?.category || 'machine');
  const [bodyPart, setBodyPart] = useState(ex?.bodyPart || 'chest');
  const [notes, setNotes] = useState(ex?.notes || '');
  // closing the screen any other way counts as Cancel
  useEffect(() => () => { if (currentForm() === form) finishForm(null); }, [form]);

  const close = (saved: Parameters<typeof finishForm>[0]) => { finishForm(saved); router.back(); };
  const save = async () => {
    const n = name.trim();
    if (!n) { toast(tr('Give the exercise a name')); return; }
    const dupe = findExercise(n);
    if (dupe && dupe.id !== ex?.id) { toast(tr('“{name}” already exists', { name: dupe.name })); return; }
    const used = ex ? allSessions().get(ex.id)?.length || 0 : 0;
    if (ex && used && category !== ex.category) {
      const same = loggedFields(category).join() === loggedFields(ex.category).join();
      const ok = await ask({
        title: tr('Change what you log?'),
        message: same
          ? tr('“{name}” is in {n}. Their sets stay as they are, but records and volume are worked out the new way.', { name: ex.name, n: f.plural(used, 'workout') })
          : tr('“{name}” is in {n}, logged with other fields. Those sets may show up empty or incomplete afterwards.', { name: ex.name, n: f.plural(used, 'workout') }),
        ok: tr('Change'), cancel: tr('Cancel'), destructive: !same,
      });
      if (!ok) return;
    }
    if (ex) {
      await updateExercise(ex.id, { name: n, category, bodyPart, notes });
      close(getState().exercises.get(ex.id) || null);
    } else {
      close(await addExercise({ name: n, category, bodyPart, notes }));
    }
  };
  const top = Platform.OS === 'ios' ? 0 : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.bar, { paddingTop: top + 10 }]}>
        <Pressable onPress={() => close(null)} hitSlop={8} accessibilityRole="button" testID="exercise-cancel" style={{ flex: 1 }}>
          <Text style={{ color: c.accentText, fontSize: 17 }}>{tr('Cancel')}</Text>
        </Pressable>
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>{ex ? tr('Edit exercise') : tr('New exercise')}</Text>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Pressable onPress={save} hitSlop={8} accessibilityRole="button" testID="exercise-save">
            <Text style={{ color: c.accentText, fontSize: 17, fontWeight: '700' }}>{tr('Save')}</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Field label={tr('Name')} value={name} onChange={setName} placeholder={tr('e.g. Incline Row (Dumbbell)')} testID="exercise-name" />
        <SectionTitle>{tr('What you log')}</SectionTitle>
        <Group>
          {(CATEGORIES as { id: Category; label: string }[]).map((x, i) => (
            <Cell key={x.id} first={i === 0} title={tr(x.label)} checked={category === x.id} onPress={() => setCategory(x.id)} testID={`cat-${x.id}`} />
          ))}
        </Group>
        <Txt tone="ink3" style={{ fontSize: 13, marginTop: 8, paddingHorizontal: 4 }}>{tr((CATEGORY_HELP as Record<string, string>)[category])}</Txt>
        <SectionTitle>{tr('Body part')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(BODY_PARTS as { id: string; label: string }[]).map((b) => {
            const on = bodyPart === b.id;
            return (
              <Pressable key={b.id} onPress={() => setBodyPart(b.id)} accessibilityRole="radio" accessibilityState={{ checked: on }} testID={`part-${b.id}`}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? c.chipOn : c.surface }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: on ? c.chipOnInk : c.ink2 }}>{tr(b.label)}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ marginTop: 22 }}>
          <Field label={tr('Notes')} value={notes} onChange={setNotes} placeholder={tr('Setup, cues, seat height…')} multiline testID="exercise-notes" />
        </View>
      </ScrollView>
      <OverlayHost />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
});
