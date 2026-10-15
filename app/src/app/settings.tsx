import { useEffect, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import Constants from 'expo-constants';

import {
  readBackup, readStrong, restoreBackup, saveStrongImport, setProfile, setSetting, useAppState,
} from '@/data/store';
import type { LanguageSetting, ThemeSetting } from '@/data/types';
import { useFormat } from '@/lib/format';
import { useColors } from '@/lib/theme';
import { confirm, notice } from '@/lib/notice';
import {
  Cell, Group, Page, Segments, SectionTitle, Txt,
} from '@/ui/kit';

/** Let the user pick a file and read it as text (null if they cancel). */
async function pickText(types: string[]): Promise<{ name: string; text: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (Platform.OS === 'web' && a.file) return { name: a.name, text: await a.file.text() };
  return { name: a.name, text: await new File(a.uri).text() };
}

export default function SettingsScreen() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const [strongUnits, setStrongUnits] = useState<{ weightUnit: 'kg' | 'lb'; distUnit: 'km' | 'mi' }>({ weightUnit: s.settings.unit, distUnit: s.settings.distUnit });
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(s.profile.name);
  useEffect(() => { setName(s.profile.name); }, [s.profile.name]); // e.g. after a restore
  const c = useColors();

  const doRestore = async () => {
    const file = await pickText(['application/json', 'text/plain', '*/*']);
    if (!file) return;
    let preview;
    try { preview = readBackup(file.text); } catch (e) { notice(tr('Restore from backup'), tr((e as Error).message, (e as Error & { vars?: Record<string, string> }).vars)); return; }
    const { counts, exportedAt } = preview;
    const ok = await confirm(tr('Replace all data?'), tr('The backup{from} has {workouts}, {templates} and {measurements}. Everything currently in the app is replaced.', {
      from: exportedAt ? ` ${tr('from {date}', { date: f.date.short(exportedAt) })}` : '',
      workouts: f.plural(counts.workouts, 'workout'), templates: f.plural(counts.templates, 'template'), measurements: f.plural(counts.measurements, 'measurement'),
    }), tr('Replace'), tr('Cancel'), true);
    if (!ok) return;
    setBusy(true);
    try { await restoreBackup(preview); notice(tr('Backup restored'), tr('{n} stored', { n: f.plural(counts.workouts, 'workout') })); } finally { setBusy(false); }
  };

  const doStrong = async () => {
    const file = await pickText(['text/csv', 'text/comma-separated-values', 'text/plain', '*/*']);
    if (!file) return;
    let r;
    try { r = readStrong(file.text, strongUnits, tr('Workout')); } catch (e) { notice(tr('Import from Strong'), tr((e as Error).message)); return; }
    const st = r.stats;
    if (!st.workouts && !st.notesAdded) {
      notice(tr('Import from Strong'), st.duplicates ? tr('All {n} are already imported', { n: f.plural(st.duplicates, 'workout') }) : tr('No workouts found in this file'));
      return;
    }
    const ok = await confirm(
      st.workouts ? tr('Import {n}?', { n: f.plural(st.workouts, 'workout') }) : tr('Add notes to {n}?', { n: f.plural(st.notesAdded, 'workout') }),
      [
        st.workouts && st.first && st.last ? tr('{sets} from {first} to {last}.', { sets: f.plural(st.sets, 'set'), first: f.date.short(st.first), last: f.date.short(st.last) }) : '',
        st.duplicates ? tr('{n} already in Setlog will be skipped.', { n: f.plural(st.duplicates, 'workout') }) : '',
        st.newExercises.length ? `${f.plural(st.newExercises.length, 'new exercise')} ${tr('will be created:')} ${st.newExercises.slice(0, 8).join(', ')}` : '',
      ].filter(Boolean).join('\n\n'),
      st.workouts ? tr('Import') : tr('Add notes'), tr('Cancel'),
    );
    if (!ok) return;
    setBusy(true);
    try {
      await saveStrongImport(r);
      notice(tr('Import from Strong'), st.workouts ? tr('Imported {n}', { n: f.plural(st.workouts, 'workout') }) : tr('Notes added to {n}', { n: f.plural(st.notesAdded, 'workout') }));
    } finally { setBusy(false); }
  };

  const themes: { value: ThemeSetting; label: string }[] = [
    { value: 'system', label: tr('Auto') }, { value: 'light', label: tr('Light') }, { value: 'dark', label: tr('Dark') },
    { value: 'strawberry-matcha', label: tr('Strawberry Matcha') }, { value: 'intense-red', label: tr('Intense Red') },
  ];
  const langs: { value: LanguageSetting; label: string }[] = [
    { value: 'auto', label: tr('Phone language') }, { value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' },
  ];

  return (
    <Page>
      <Group>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 50, gap: 12 }}>
          <Txt style={{ fontSize: 16, flexShrink: 0 }}>{tr('Your name')}</Txt>
          <TextInput value={name} onChangeText={setName} onEndEditing={() => setProfile({ name: name.trim() })} onBlur={() => setProfile({ name: name.trim() })}
            placeholder={tr('Not set')} placeholderTextColor={c.ink3} returnKeyType="done" testID="set-name"
            style={{ flex: 1, minWidth: 0, textAlign: 'right', color: c.ink, fontSize: 16, paddingVertical: 10 }} />
        </View>
      </Group>

      <SectionTitle>{tr('Your data')}</SectionTitle>
      <Group>
        <Cell first icon="download" title={tr('Restore from backup')} sub={tr('A backup file from the Setlog web app or this app')} onPress={busy ? undefined : doRestore} testID="restore" />
        <Cell icon="swap" title={tr('Import from Strong')} sub={tr('In Strong: Settings → Export Workouts, then pick that CSV here')} onPress={busy ? undefined : doStrong} testID="strong-import" />
      </Group>
      <Txt tone="ink3" style={{ fontSize: 13, marginTop: 8, paddingHorizontal: 4 }}>{tr('Which units did Strong use?')}</Txt>
      <View style={{ gap: 6, marginTop: 6 }}>
        <Segments value={strongUnits.weightUnit} onChange={(v) => setStrongUnits({ ...strongUnits, weightUnit: v })} options={[{ value: 'kg', label: tr('Kilograms') }, { value: 'lb', label: tr('Pounds') }]} />
        <Segments value={strongUnits.distUnit} onChange={(v) => setStrongUnits({ ...strongUnits, distUnit: v })} options={[{ value: 'km', label: tr('Kilometres') }, { value: 'mi', label: tr('Miles') }]} />
      </View>

      <SectionTitle>{tr('Units')}</SectionTitle>
      <View style={{ gap: 6 }}>
        <Txt tone="ink2" style={{ fontSize: 14, paddingHorizontal: 4 }}>{tr('Lifting weight')}</Txt>
        <Segments testID="set-unit" value={s.settings.unit} onChange={(v) => setSetting('unit', v)} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
        <Txt tone="ink2" style={{ fontSize: 14, paddingHorizontal: 4, marginTop: 6 }}>{tr('Distance')}</Txt>
        <Segments value={s.settings.distUnit} onChange={(v) => setSetting('distUnit', v)} options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }]} />
      </View>

      <SectionTitle>{tr('Theme')}</SectionTitle>
      <Group>
        {themes.map((t, i) => (
          <Cell key={t.value} first={i === 0} title={t.label} onPress={() => setSetting('theme', t.value)} testID={`theme-${t.value}`}
            checked={s.settings.theme === t.value} />
        ))}
      </Group>

      <SectionTitle>{tr('Language')}</SectionTitle>
      <Group>
        {langs.map((l, i) => (
          <Cell key={l.value} first={i === 0} title={l.label} onPress={() => setSetting('language', l.value)} testID={`language-${l.value}`}
            checked={(s.settings.language || 'auto') === l.value} />
        ))}
      </Group>

      <Txt tone="ink3" style={{ fontSize: 13, textAlign: 'center', marginTop: 28 }}>
        {`Increment ${Constants.expoConfig?.version || ''} · ${tr('{n} stored', { n: f.plural(s.workouts.length, 'workout') })}`}
      </Txt>
    </Page>
  );
}
