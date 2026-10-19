// One exercise of a draft: the running workout ('active'), a template in the
// editor ('template') or a finished workout being edited ('edit'). Name and
// menu, focus metric, superset and rest tags, pinned note, its note, the set
// table and "Add set". Only this exercise re-renders when one of its sets
// changes (see editDraft in the store). Check-off, rest timer and live
// records belong to the running workout only.
import { memo, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  placeholders, restFor, checkOffSet, copyPrevious, addSet, joinSuperset, leaveSuperset, replaceExercise, addWarmups,
  isLiveRecord, loggedFields, usesWeight, numToInput, parseNum, focusOptions, focusValues, REST_CHOICES, RPE_CHOICES, SET_TYPES,
  FOCUS_LABEL,
} from '@setlog/core';

import {
  changeExercise, editDraft, getDraft, getState, startRest,
} from '@/data/store';
import type {
  DraftKey, EntryDraft, Exercise, Settings, SetType, WorkSet,
} from '@/data/types';
import { setLabels, useFormat } from '@/lib/format';
import { pickExercises } from '@/lib/picker';
import { useColors } from '@/lib/theme';
import { Icon } from '@/ui/kit';
import { actionSheet, prompt, toast } from '@/ui/overlay';
import { COLS, SetRow, type Field } from './SetRow';

export const SS_COLORS = ['accent', '#eb6834', '#1baf7a', '#d55181', '#8a6fe0'];

export type EditorMode = 'active' | 'edit' | 'template';

type Props = {
  draftKey: DraftKey;
  mode: EditorMode;
  entry: EntryDraft;
  ex: Exercise | undefined;
  prevSets: WorkSet[] | null;
  bests: Record<string, number> | undefined;
  settings: Settings;
  superset?: { index: number; letter: string };
};

const SET_TYPE_NAME: Record<SetType, string> = { normal: 'Normal', warmup: 'Warm-up', drop: 'Drop set', failure: 'Failure' };

type FocusKey = keyof typeof FOCUS_LABEL;

export const ExerciseBlock = memo(function ExerciseBlock({
  draftKey, mode, entry, ex, prevSets, bests, settings, superset,
}: Props) {
  const f = useFormat();
  const { tr } = f;
  const c = useColors();
  const [shake, setShake] = useState<{ id: string; n: number } | null>(null);
  const rows = useMemo(() => placeholders(entry, prevSets, settings) as { prev: WorkSet | null; ph: Record<string, string> }[], [entry, prevSets, settings]);
  if (!ex) return null;
  const cat = ex.category;
  const fields = loggedFields(cat) as Field[];
  const rest = restFor(entry, ex, settings.defaultRest) as number;
  const labels = setLabels(entry.sets);
  const ssColor = superset ? (superset.index % SS_COLORS.length === 0 ? c.accent : SS_COLORS[superset.index % SS_COLORS.length]) : null;
  const done = entry.sets.filter((s) => s.done).length;
  const active = mode === 'active';
  const edit = (fn: (e: EntryDraft) => void) => editDraft(draftKey, (_a, e) => fn(e), entry.id);
  const now = Date.now();

  // ---------- sets ----------
  const toggle = (i: number) => {
    if (entry.sets[i].done) { edit((e) => { e.sets[i].done = false; }); return; }
    let r: { problem?: string; rest?: number } = {};
    editDraft(draftKey, (a, e) => { r = checkOffSet(a, e, i, { category: cat, ph: rows[i].ph, rest, settings }); }, entry.id);
    if (r.problem) {
      setShake({ id: entry.sets[i].id, n: Date.now() });
      toast(tr(r.problem));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (r.rest && r.rest > 0) startRest(r.rest, ex.name);
  };
  const removeSet = (i: number) => {
    const set = entry.sets[i];
    edit((e) => { e.sets.splice(i, 1); });
    toast(tr('Set deleted'), { label: tr('Undo'), fn: () => edit((e) => { e.sets.splice(Math.min(i, e.sets.length), 0, set); }) });
  };
  const setMenu = async (i: number) => {
    const set = entry.sets[i];
    const choice = await actionSheet<string>({
      title: tr('Set {label}', { label: labels[i] }),
      actions: [
        ...(SET_TYPES as SetType[]).map((t) => ({ label: tr(SET_TYPE_NAME[t]), value: t, checked: set.type === t, testID: `type-${t}` })),
        usesWeight(cat) || cat === 'reps' ? { label: set.rpe ? `RPE (${set.rpe})` : tr('Add RPE'), value: 'rpe', testID: 'set-rpe' } : null,
        { label: tr('Delete set'), value: 'delete', destructive: true, testID: 'set-delete' },
      ],
    });
    if (!choice) return;
    if (choice === 'delete') { removeSet(i); return; }
    if (choice === 'rpe') {
      const v = await actionSheet<string>({
        title: tr('Rate of perceived exertion'), message: tr('10 = nothing left, 8 = two reps left'),
        actions: [
          ...(RPE_CHOICES as number[]).map((n) => ({ label: f.num(n, 1), value: String(n), checked: parseNum(set.rpe) === n, testID: `rpe-${n}` })),
          set.rpe ? { label: tr('Clear RPE'), value: 'clear', destructive: true } : null,
        ],
      });
      if (!v) return;
      edit((e) => { e.sets[i].rpe = v === 'clear' ? '' : numToInput(Number(v), 1); });
      return;
    }
    edit((e) => { e.sets[i].type = choice as SetType; });
  };

  // ---------- the exercise ----------
  const menu = async () => {
    const a = getDraft(draftKey);
    if (!a) return;
    const others = a.exercises.filter((e) => e.id !== entry.id);
    const choice = await actionSheet<string>({
      title: ex.name,
      actions: [
        { label: entry.showNotes ? tr('Remove note') : tr('Add note'), value: 'note', icon: 'note' },
        { label: ex.pinnedNote ? tr('Edit pinned note') : tr('Pin a note to this exercise'), value: 'pin', icon: 'pin' },
        { label: tr('Replace exercise'), value: 'replace', icon: 'swap' },
        others.length ? { label: entry.supersetId ? tr('Change superset') : tr('Superset with…'), value: 'superset', icon: 'link', testID: 'menu-superset' } : null,
        entry.supersetId ? { label: tr('Remove from superset'), value: 'unsuperset', icon: 'unlink' } : null,
        { label: tr('Rest timer: {time}', { time: rest ? f.clock(rest) : tr('off') }), value: 'rest', icon: 'timer', testID: 'menu-rest' },
        usesWeight(cat) && cat !== 'assisted_bw' ? { label: tr('Add warm-up sets'), value: 'warmup', icon: 'flame', testID: 'menu-warmup' } : null,
        cat === 'barbell' ? { label: tr('Plate calculator'), value: 'plates', icon: 'plate', testID: 'menu-plates' } : null,
        a.exercises.length > 1 ? { label: tr('Reorder exercises'), value: 'reorder', icon: 'reorder', testID: 'menu-reorder' } : null,
        { label: tr('History & records'), value: 'info', icon: 'history' },
        { label: tr('Remove exercise'), value: 'remove', destructive: true, icon: 'trash', testID: 'menu-remove' },
      ],
    });
    if (!choice) return;
    if (choice === 'note') edit((e) => { e.showNotes = !e.showNotes; if (!e.showNotes) e.notes = ''; });
    if (choice === 'pin') {
      const v = await prompt({
        title: tr('Pinned note'), message: tr('Shown every time you do this exercise.'), value: ex.pinnedNote || '', placeholder: tr('Seat height 4, grip on the rings…'), multiline: true,
      });
      if (v !== null) changeExercise(draftKey, ex.id, { pinnedNote: v.trim() });
    }
    if (choice === 'replace') {
      const ids = await pickExercises({ multi: false, title: tr('Replace exercise') });
      const nex = ids && getState().exercises.get(ids[0]);
      if (nex) edit((e) => replaceExercise(e, ex, nex));
    }
    if (choice === 'superset') {
      const target = await actionSheet<string>({
        title: tr('Superset with'),
        actions: others.map((o) => ({ label: getState().exercises.get(o.exerciseId)?.name || tr('Exercise'), value: o.id, testID: `ss-${o.exerciseId}` })),
      });
      if (!target) return;
      // only this exercise moves: it joins the other one's group (or they start a new one)
      editDraft(draftKey, (d) => joinSuperset(d.exercises, d.exercises.find((e) => e.id === entry.id), d.exercises.find((e) => e.id === target)));
    }
    if (choice === 'unsuperset') editDraft(draftKey, (d) => leaveSuperset(d.exercises, d.exercises.find((e) => e.id === entry.id)));
    if (choice === 'rest') {
      const v = await actionSheet<string>({
        title: `${tr('Rest timer')} · ${ex.name}`, message: tr('Starts when you check off a set. Saved for this exercise.'),
        actions: (REST_CHOICES as number[]).map((sec) => ({ label: sec ? f.clock(sec) : tr('Off'), value: String(sec), checked: rest === sec, testID: `rest-${sec}` })),
      });
      if (v === undefined) return;
      edit((e) => { e.restSec = Number(v); });
      changeExercise(draftKey, ex.id, { restSec: Number(v) });
    }
    if (choice === 'warmup') {
      let r: { added?: number; problem?: string } = {};
      edit((e) => { r = addWarmups(e, rows, cat, settings); });
      toast(r.problem ? tr(r.problem) : tr('{n} warm-up sets added', { n: r.added ?? 0 }));
    }
    if (choice === 'plates') {
      const k = entry.sets.findIndex((x) => x.type !== 'warmup');
      const w = k >= 0 ? (parseNum(entry.sets[k].w) ?? parseNum(rows[k]?.ph.w)) : null;
      router.push({ pathname: '/tools', params: w ? { w: String(w) } : {} });
    }
    if (choice === 'reorder') router.push({ pathname: '/reorder', params: { draft: draftKey } });
    if (choice === 'info') {
      if (active) {
        // the exercise page opens behind the workout, which minimizes first
        router.back();
        setTimeout(() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } }), Platform.OS === 'web' ? 50 : 450);
      } else {
        router.push({ pathname: '/exercise/[id]', params: { id: ex.id } });
      }
    }
    if (choice === 'remove') {
      const i = a.exercises.findIndex((e) => e.id === entry.id);
      const removed = a.exercises[i];
      editDraft(draftKey, (d) => { d.exercises.splice(i, 1); });
      toast(tr('{name} removed', { name: ex.name }), { label: tr('Undo'), fn: () => editDraft(draftKey, (d) => { d.exercises.splice(Math.min(i, d.exercises.length), 0, removed); }) });
    }
  };

  // ---------- focus metric ----------
  // The number to push for this exercise (Strong's "focus metric"), from the
  // sets as they stand (typed, else the grey placeholders), against last time.
  const focusOpts = focusOptions(cat) as FocusKey[];
  const focus = focusOpts.includes(entry.focus as FocusKey) ? (entry.focus as FocusKey) : null;
  const focusVals = focusOpts.length ? focusValues(entry, rows, cat, prevSets, settings) as Record<FocusKey, number | null> : null;
  const fmtFocus = (k: FocusKey) => {
    const x = focusVals?.[k];
    if (x === null || x === undefined) return '—';
    if (k === 'volume') return f.volume(x);
    if (k === 'reps') return f.plural(x, 'rep');
    if (k === 'weightPerRep') return `${f.w(x, 1)} ${f.unit}`;
    const pct = Math.round(x * 100);
    return `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)}%`;
  };
  const pickFocus = async () => {
    const v = await actionSheet<FocusKey>({
      title: tr('Set a focus metric'),
      message: tr('The number you want to push for this exercise. It shows next to the name and updates as you log; increases compare with last time. Tap it again to turn it off.'),
      actions: focusOpts.map((k) => ({ label: `${tr(FOCUS_LABEL[k])} · ${fmtFocus(k)}`, value: k, checked: focus === k, testID: `focus-${k}` })),
    });
    if (!v) return;
    edit((e) => { e.focus = v === focus ? null : v; });
  };

  const wLabel = (cat === 'assisted_bw' ? '−' : cat === 'weighted_bw' ? '+' : '') + f.unit.toUpperCase();
  const headers = usesWeight(cat) ? [wLabel, tr('Reps')] : cat === 'reps' ? [tr('Reps')] : cat === 'cardio' ? [f.dUnit.toUpperCase(), tr('Time')] : [tr('Time')];
  const widths = fields.length === 1 ? [COLS.one] : COLS.two;
  const fieldNames: Record<Field, string> = { w: tr('Weight'), r: tr('Reps'), d: tr('Distance'), t: tr('Time') };

  return (
    <View style={[styles.block, { backgroundColor: c.surface }, ssColor ? { borderLeftWidth: 4, borderLeftColor: ssColor } : null]} accessibilityLabel={ex.name} testID={`block-${ex.id}`}>
      <View style={styles.head}>
        <Pressable onPress={menu} style={{ flex: 1, minWidth: 0 }} accessibilityRole="button" testID={`ex-title-${ex.id}`}>
          <Text style={{ color: c.accentText, fontSize: 17, fontWeight: '700' }} numberOfLines={2}>{ex.name}</Text>
        </Pressable>
        {active && entry.sets.length > 0 && <Text style={{ color: c.ink3, fontSize: 13, fontVariant: ['tabular-nums'] }}>{`${done}/${entry.sets.length}`}</Text>}
        {focusOpts.length > 0 && (
          <Pressable onPress={pickFocus} hitSlop={6} accessibilityRole="button" testID={`focus-${ex.id}`}
            accessibilityLabel={focus ? `${tr(FOCUS_LABEL[focus])}: ${fmtFocus(focus)}` : tr('Focus metric for {name}', { name: ex.name })}
            style={({ pressed }) => [styles.focus, { backgroundColor: focus ? c.accentSoft : pressed ? c.surface3 : c.surface2 }]}>
            <Icon name="trend" size={15} color={focus ? c.accentText : c.ink3} />
            {focus && <Text style={{ color: c.accentText, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }} numberOfLines={1}>{fmtFocus(focus)}</Text>}
          </Pressable>
        )}
        <Pressable onPress={menu} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr('Options for {name}', { name: ex.name })} testID={`ex-menu-${ex.id}`}
          style={({ pressed }) => [styles.more, { backgroundColor: pressed ? c.surface3 : c.accentSoft }]}>
          <Icon name="more" size={18} color={c.accentText} />
        </Pressable>
      </View>
      {(superset || (active && rest > 0)) && (
        <View style={styles.tags}>
          {superset && ssColor && (
            <View style={[styles.tag, { backgroundColor: c.accentSoft }]}>
              <Icon name="link" size={12} color={ssColor} />
              <Text style={{ color: ssColor, fontSize: 12, fontWeight: '700' }}>{tr('Superset {letter}', { letter: superset.letter })}</Text>
            </View>
          )}
          {active && rest > 0 && (
            <View style={[styles.tag, { backgroundColor: c.surface2 }]} testID={`rest-tag-${ex.id}`}>
              <Icon name="timer" size={12} color={c.ink2} />
              <Text style={{ color: c.ink2, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{f.clock(rest)}</Text>
            </View>
          )}
        </View>
      )}
      {!!ex.pinnedNote && (
        <View style={[styles.pinned, { backgroundColor: c.note }]}>
          <Icon name="pin" size={14} color={c.noteInk} />
          <Text style={{ color: c.noteInk, fontSize: 14, flex: 1 }}>{ex.pinnedNote}</Text>
        </View>
      )}
      {entry.showNotes && (
        <TextInput value={entry.notes} onChangeText={(v) => edit((e) => { e.notes = v; })} multiline placeholder={tr('Note for this exercise')} placeholderTextColor={c.ink3}
          style={[styles.note, { color: c.ink, backgroundColor: c.surface2 }]} testID={`ex-note-${ex.id}`} />
      )}
      <View style={[styles.hdr]}>
        <Text style={[styles.hdrText, { width: COLS.label, color: c.label }]}>{tr('Set')}</Text>
        <Text style={[styles.hdrText, { flex: 1, textAlign: 'left', paddingLeft: 4, color: c.label }]}>{tr('Previous')}</Text>
        {headers.map((h, i) => <Text key={h} style={[styles.hdrText, { width: widths[i], color: c.label }]}>{h}</Text>)}
        {active && <View style={{ width: COLS.check }} />}
      </View>
      {entry.sets.map((set, i) => {
        const prev = rows[i]?.prev;
        const pr = active && isLiveRecord(set, cat, bests, settings, now);
        return (
          <SetRow key={set.id} set={set} label={labels[i]} fields={fields} ph={rows[i]?.ph || {}}
            prevText={prev ? f.setText(prev, cat, true) : '—'} badge={pr ? 'pr' : set.rpe || null}
            shake={shake && shake.id === set.id ? shake.n : 0} showCheck={active}
            labels={{
              set: tr('Set {label}, change type', { label: labels[i] }), prev: tr('Previous: {value}', { value: prev ? f.setText(prev, cat, true) : '—' }),
              field: fieldNames, check: tr('Mark set as done'), uncheck: tr('Mark set as not done'), delete: tr('Delete'),
            }}
            onChange={(k, v) => edit((e) => { e.sets[i][k] = v; })}
            onToggle={() => toggle(i)} onMenu={() => setMenu(i)}
            onPrev={() => edit((e) => { copyPrevious(e.sets[i], prev, cat, settings); })}
            onDelete={() => removeSet(i)} />
        );
      })}
      <Pressable onPress={() => edit((e) => addSet(e))} accessibilityRole="button" testID={`add-set-${ex.id}`}
        style={({ pressed }) => [styles.addSet, { backgroundColor: pressed ? c.surface3 : c.surface2 }]}>
        <Icon name="plus" size={15} color={c.ink2} />
        <Text style={{ color: c.ink2, fontSize: 15, fontWeight: '600' }}>{tr('Add set')}</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  block: { borderRadius: 14, overflow: 'hidden', marginTop: 12, paddingBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 10, paddingTop: 12 },
  more: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  focus: { height: 28, minWidth: 32, maxWidth: 130, borderRadius: 14, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  tags: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, marginTop: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  pinned: { flexDirection: 'row', gap: 8, marginHorizontal: 14, marginTop: 8, borderRadius: 10, padding: 9, alignItems: 'flex-start' },
  note: { marginHorizontal: 14, marginTop: 8, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, minHeight: 40 },
  hdr: { flexDirection: 'row', alignItems: 'center', height: 26, marginTop: 8, paddingLeft: 8, paddingRight: 10, gap: COLS.gap },
  hdrText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', textAlign: 'center' },
  addSet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 12, marginTop: 6, height: 36, borderRadius: 10 },
});
