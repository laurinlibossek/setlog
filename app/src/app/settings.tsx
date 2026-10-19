import { useEffect, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  FORMULAS, REST_CHOICES, exportCSV, parsePlates, startOfDay,
} from '@setlog/core';

import {
  readBackup, readStrong, restoreBackup, saveStrongImport, setProfile, setSetting, useAppState,
} from '@/data/store';
import type { LanguageSetting, Settings, ThemeSetting } from '@/data/types';
import { appVersion, backupNow } from '@/lib/backup';
import { dateStamp, saveTextFile } from '@/lib/files';
import { useFormat } from '@/lib/format';
import { bodyUnit, lengthUnit } from '@/lib/measure';
import { useColors } from '@/lib/theme';
import { confirm, notice } from '@/lib/notice';
import {
  Cell, Group, Page, Segments, SectionTitle, SwitchCell, Txt,
} from '@/ui/kit';
import {
  actionSheet, pickDateTime, prompt, toast,
} from '@/ui/overlay';

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
  const st = s.settings;
  const [strongUnits, setStrongUnits] = useState<{ weightUnit: 'kg' | 'lb'; distUnit: 'km' | 'mi' }>({ weightUnit: st.unit, distUnit: st.distUnit });
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(s.profile.name);
  useEffect(() => { setName(s.profile.name); }, [s.profile.name]); // e.g. after a restore
  const c = useColors();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setSetting(k, v); };

  const doBackup = () => backupNow(tr);
  const doCSV = async () => {
    const text = exportCSV({ workouts: s.workouts, exercises: s.exercises, unit: st.unit, distUnit: st.distUnit, unknownName: tr('Unknown exercise') });
    const r = await saveTextFile(`setlog-workouts-${dateStamp()}.csv`, text, 'text/csv', 'public.comma-separated-values-text', tr('Export as CSV'));
    toast(r === 'failed' ? tr('Sharing isn’t available here') : tr('CSV exported'));
  };

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
    const x = r.stats;
    if (!x.workouts && !x.notesAdded) {
      notice(tr('Import from Strong'), x.duplicates ? tr('All {n} are already imported', { n: f.plural(x.duplicates, 'workout') }) : tr('No workouts found in this file'));
      return;
    }
    const ok = await confirm(
      x.workouts ? tr('Import {n}?', { n: f.plural(x.workouts, 'workout') }) : tr('Add notes to {n}?', { n: f.plural(x.notesAdded, 'workout') }),
      [
        x.workouts && x.first && x.last ? tr('{sets} from {first} to {last}.', { sets: f.plural(x.sets, 'set'), first: f.date.short(x.first), last: f.date.short(x.last) }) : '',
        x.duplicates ? tr('{n} already in Setlog will be skipped.', { n: f.plural(x.duplicates, 'workout') }) : '',
        x.newExercises.length ? `${f.plural(x.newExercises.length, 'new exercise')} ${tr('will be created:')} ${x.newExercises.slice(0, 8).join(', ')}` : '',
      ].filter(Boolean).join('\n\n'),
      x.workouts ? tr('Import') : tr('Add notes'), tr('Cancel'),
    );
    if (!ok) return;
    setBusy(true);
    try {
      await saveStrongImport(r);
      notice(tr('Import from Strong'), x.workouts ? tr('Imported {n}', { n: f.plural(x.workouts, 'workout') }) : tr('Notes added to {n}', { n: f.plural(x.notesAdded, 'workout') }));
    } finally { setBusy(false); }
  };

  const pick = async <T extends string | number>(title: string, options: { value: T; label: string }[], current: T, apply: (v: T) => void) => {
    const v = await actionSheet<string>({ title, actions: options.map((o) => ({ label: o.label, value: String(o.value), checked: o.value === current, testID: `opt-${o.value}` })) });
    if (v === undefined) return;
    const o = options.find((x) => String(x.value) === v);
    if (o) apply(o.value);
  };
  const editPlates = async () => {
    const v = await prompt({
      title: tr('Plates you have ({unit})', { unit: st.unit }), message: tr('Per side, separated by commas or spaces.'),
      value: st.plates.map((p) => f.num(p, 2)).join('  '), ok: tr('Save'),
    });
    if (v === null) return;
    const plates = parsePlates(v) as number[];
    if (!plates.length) { toast(tr('Enter at least one plate')); return; }
    set('plates', plates);
  };
  const historyStart = async () => {
    const c2 = await actionSheet<string>({
      title: tr('Start history from'), message: tr('Older workouts stay in History but don’t count for previous values, records or charts.'),
      actions: [{ label: tr('Pick a date'), value: 'pick', testID: 'history-pick' }, { label: tr('Use all workouts'), value: 'all', checked: !st.historyStart }],
    });
    if (c2 === 'all') set('historyStart', null);
    if (c2 === 'pick') {
      const t = await pickDateTime({ title: tr('Start history from'), value: st.historyStart || Date.now(), max: Date.now() + 86400000 });
      if (t !== null) set('historyStart', startOfDay(t));
    }
  };
  const setBw = (k: 'bwWeighted' | 'bwAssisted', v: boolean) => {
    set(k, v);
    if (v && !s.measurements.some((m) => m.type === 'bodyweight')) toast(tr('Log your body weight in Measure — until then it counts as 0'));
  };

  const themes: { value: ThemeSetting; label: string }[] = [
    { value: 'system', label: tr('Auto') }, { value: 'light', label: tr('Light') }, { value: 'dark', label: tr('Dark') },
    { value: 'strawberry-matcha', label: tr('Strawberry Matcha') }, { value: 'intense-red', label: tr('Intense Red') },
  ];
  const langs: { value: LanguageSetting; label: string }[] = [
    { value: 'auto', label: tr('Phone language') }, { value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' },
  ];
  const restLabel = (sec: number) => (sec ? f.clock(sec) : tr('Off'));
  const formula = (FORMULAS as { id: string; label: string }[]).find((x) => x.id === st.formula) || FORMULAS[0];
  const weekdays: { value: number; label: string }[] = [{ value: 1, label: tr('Monday') }, { value: 0, label: tr('Sunday') }, { value: 6, label: tr('Saturday') }];
  const barOptions = st.unit === 'lb' ? [45, 35, 33, 25, 15, 0] : [20, 15, 10, 7.5, 0];

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

      <SectionTitle>{tr('Units')}</SectionTitle>
      <View style={{ gap: 6 }}>
        <Txt tone="ink2" style={{ fontSize: 14, paddingHorizontal: 4 }}>{tr('Lifting weight')}</Txt>
        <Segments testID="set-unit" value={st.unit} onChange={(v) => set('unit', v)} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
        <Txt tone="ink2" style={{ fontSize: 14, paddingHorizontal: 4, marginTop: 6 }}>{tr('Distance')}</Txt>
        <Segments value={st.distUnit} onChange={(v) => set('distUnit', v)} options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }]} />
        <Txt tone="ink2" style={{ fontSize: 14, paddingHorizontal: 4, marginTop: 6 }}>{tr('Body weight')}</Txt>
        <Segments value={bodyUnit(st)} onChange={(v) => set('bodyUnit', v)} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
        <Txt tone="ink2" style={{ fontSize: 14, paddingHorizontal: 4, marginTop: 6 }}>{tr('Body measurements')}</Txt>
        <Segments value={lengthUnit(st)} onChange={(v) => set('sizeUnit', v)} options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }]} />
      </View>

      <SectionTitle>{tr('Workouts')}</SectionTitle>
      <Group>
        <Cell first title={tr('Default rest timer')} sub={tr('Per-exercise timers override this')} value={restLabel(st.defaultRest)} testID="set-rest"
          onPress={() => pick(tr('Default rest timer'), (REST_CHOICES as number[]).map((x) => ({ value: x, label: restLabel(x) })), st.defaultRest, (v) => set('defaultRest', v))} />
        <SwitchCell title={tr('Rest timer alerts')} sub={tr('A notification when rest is over, also with the phone locked')} value={st.restAlert !== false}
          onChange={(v) => set('restAlert', v)} testID="set-rest-alert" />
        <SwitchCell title={tr('Keep screen on')} sub={tr('While a workout is running')} value={st.keepAwake !== false} onChange={(v) => set('keepAwake', v)} testID="set-keep-awake" />
        <Cell title={tr('Previous values')} value={st.prevSource === 'template' ? tr('Same template') : tr('Any workout')}
          onPress={() => pick(tr('Previous values'), [{ value: 'any', label: tr('Any workout') }, { value: 'template', label: tr('Same template') }], st.prevSource, (v) => set('prevSource', v as Settings['prevSource']))} />
        <SwitchCell title={tr('Ask to update templates')} sub={tr('When a finished workout differs from its template')} value={st.askTemplateUpdate !== false}
          onChange={(v) => set('askTemplateUpdate', v)} testID="set-ask-template" />
        <SwitchCell title={tr('Example templates')} value={st.showExamples !== false} onChange={(v) => set('showExamples', v)} testID="set-examples" />
        <Cell title={tr('Weekly goal')} value={tr('{n} per week', { n: st.weeklyGoal || 3 })}
          onPress={() => pick(tr('Weekly goal'), [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: tr('{n} per week', { n }) })), st.weeklyGoal, (v) => set('weeklyGoal', v))} />
        <Cell title={tr('Week starts on')} value={weekdays.find((x) => x.value === st.weekStart)?.label || tr('Monday')}
          onPress={() => pick(tr('Week starts on'), weekdays, st.weekStart, (v) => set('weekStart', v))} />
      </Group>

      <SectionTitle>{tr('Stats')}</SectionTitle>
      <Group>
        <Cell first title={tr('1RM formula')} value={tr(formula.label)}
          onPress={() => pick(tr('1RM formula'), (FORMULAS as { id: string; label: string }[]).map((x) => ({ value: x.id, label: tr(x.label) })), st.formula, (v) => set('formula', v))} />
        <SwitchCell title={tr('Count dumbbells twice')} sub={tr('For volume')} value={!!st.dumbbellTwice} onChange={(v) => set('dumbbellTwice', v)} />
        <SwitchCell title={tr('Body weight in volume')} sub={tr('Weighted bodyweight exercises')} value={!!st.bwWeighted} onChange={(v) => setBw('bwWeighted', v)} />
        <SwitchCell title={tr('Body weight in volume')} sub={tr('Assisted bodyweight exercises')} value={!!st.bwAssisted} onChange={(v) => setBw('bwAssisted', v)} />
        <Cell title={tr('Start history from')} value={st.historyStart ? f.date.short(st.historyStart) : tr('All workouts')} onPress={historyStart} testID="set-history-start" />
      </Group>

      <SectionTitle>{tr('Plates')}</SectionTitle>
      <Group>
        <Cell first title={tr('Bar weight')} value={`${f.num(st.bar, 1)} ${st.unit}`}
          onPress={() => pick(tr('Bar weight'), barOptions.map((b) => ({ value: b, label: b ? `${f.num(b, 1)} ${st.unit}` : tr('None') })), st.bar, (v) => set('bar', v))} />
        <Cell title={tr('Available plates')} value={st.plates.map((p) => f.num(p, 2)).join(', ')} onPress={editPlates} testID="set-plates" />
      </Group>

      <SectionTitle>{tr('Theme')}</SectionTitle>
      <Group>
        {themes.map((t, i) => (
          <Cell key={t.value} first={i === 0} title={t.label} onPress={() => set('theme', t.value)} testID={`theme-${t.value}`}
            checked={st.theme === t.value} />
        ))}
      </Group>

      <SectionTitle>{tr('Language')}</SectionTitle>
      <Group>
        {langs.map((l, i) => (
          <Cell key={l.value} first={i === 0} title={l.label} onPress={() => set('language', l.value)} testID={`language-${l.value}`}
            checked={(st.language || 'auto') === l.value} />
        ))}
      </Group>

      <SectionTitle>{tr('Your data')}</SectionTitle>
      <Group>
        <Cell first icon="upload" title={tr('Back up now')} sub={s.meta.lastBackupAt ? tr('Last backup {when}', { when: f.relDayLower(s.meta.lastBackupAt) }) : tr('No backup yet')}
          onPress={busy ? undefined : doBackup} testID="backup-now" />
        <Cell icon="download" title={tr('Restore from backup')} sub={tr('A backup file from the Setlog web app or this app')} onPress={busy ? undefined : doRestore} testID="restore" />
        <Cell icon="swap" title={tr('Import from Strong')} sub={tr('In Strong: Settings → Export Workouts, then pick that CSV here')} onPress={busy ? undefined : doStrong} testID="strong-import" />
        <Cell icon="share" title={tr('Export as CSV')} sub={tr('Spreadsheet-friendly, Strong column format')} onPress={doCSV} testID="export-csv" />
      </Group>
      <Txt tone="ink3" style={{ fontSize: 13, marginTop: 8, paddingHorizontal: 4 }}>{tr('Which units did Strong use?')}</Txt>
      <View style={{ gap: 6, marginTop: 6 }}>
        <Segments value={strongUnits.weightUnit} onChange={(v) => setStrongUnits({ ...strongUnits, weightUnit: v })} options={[{ value: 'kg', label: tr('Kilograms') }, { value: 'lb', label: tr('Pounds') }]} />
        <Segments value={strongUnits.distUnit} onChange={(v) => setStrongUnits({ ...strongUnits, distUnit: v })} options={[{ value: 'km', label: tr('Kilometres') }, { value: 'mi', label: tr('Miles') }]} />
      </View>
      <Txt tone="ink3" style={{ fontSize: 13, marginTop: 12, paddingHorizontal: 4 }}>
        {tr('Everything stays on this phone. Nothing is uploaded anywhere — back up regularly and keep the file in iCloud Drive or another safe place.')}
      </Txt>

      <Txt tone="ink3" style={{ fontSize: 13, textAlign: 'center', marginTop: 28 }}>
        {`Increment ${appVersion()} · ${tr('{n} stored', { n: f.plural(s.workouts.length, 'workout') })}`}
      </Txt>
    </Page>
  );
}
