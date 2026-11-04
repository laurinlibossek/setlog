// The running workout's own pieces (docs/design/navigation.md, The session):
// logging a set (stroke, Log button or the keypad's Next), the keypad, the
// header with the hero tally, and the exercises before and after the one on
// screen ("Up next": tap to switch, press and hold to drag). The order of the
// session is the core's (sessionState in core/workout.js).
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import {
  Animated, PanResponder, Pressable, StyleSheet, Text, View, type TextInputInstance,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  checkOffSet, placeholders, restFor, isLiveRecord, sessionState, loggedFields, platesFor, parseNum,
  numToInput, digitsToSec, secToDigits, fmtDigits, weightStep, moveUnit, BODY_PART_LABEL,
} from '@setlog/core';

import {
  editActive, getState, patchActive, previousSets, startRest, stats, useAppSelector,
} from '@/data/store';
import type { ActiveWorkout, Category, EntryDraft } from '@/data/types';
import { SPACE, TYPE } from '@/design/tally';
import { setLabels, useFormat } from '@/lib/format';
import { useTally } from '@/lib/theme';
import { toast } from '@/ui/overlay';
import { Keypad, keypadInput, type KeypadKey } from '@/ui/tally/Keypad';
import { Tally, type StrokeState } from '@/ui/tally/Tally';
import type { Field } from './SetRow';
import { lastTimeText } from './text';

// ---------- logging and the keypad ----------
export type KeypadTarget = { entryId: string; setId: string; field: Field };

type Session = {
  /** the field the keypad types into */
  target: KeypadTarget | null;
  open: (t: KeypadTarget) => void;
  close: () => void;
  /** log a set: fills it from the ghost values, starts the rest. False (and a shake) when it can't be logged yet. */
  logSet: (entryId: string, setId: string) => boolean;
  shake: { id: string; n: number } | null;
  register: (key: string, ref: TextInputInstance | null) => void;
};

const SessionContext = createContext<Session | null>(null);
/** The running workout's logging and keypad; null in the editors. */
export const useSession = () => useContext(SessionContext);

const fieldsOf = (cat: Category) => loggedFields(cat) as Field[];

export function SessionProvider({ children, onTarget }: { children: ReactNode; onTarget?: (ref: TextInputInstance | null) => void }) {
  const f = useFormat();
  const { tr } = f;
  const [target, setTarget] = useState<KeypadTarget | null>(null);
  const [shake, setShake] = useState<{ id: string; n: number } | null>(null);
  const refs = useRef(new Map<string, TextInputInstance>());
  const targetRef = useRef(target);
  targetRef.current = target;

  const register = useCallback((key: string, ref: TextInputInstance | null) => {
    if (ref) refs.current.set(key, ref);
    else refs.current.delete(key);
  }, []);
  const open = useCallback((t: KeypadTarget) => {
    const cur = targetRef.current;
    if (cur && cur.setId === t.setId && cur.field === t.field) return;
    setTarget(t);
  }, []);
  const close = useCallback(() => {
    const cur = targetRef.current;
    if (cur) refs.current.get(`${cur.setId}:${cur.field}`)?.blur();
    setTarget(null);
  }, []);
  // focus follows the keypad (Next → reps), so tapping the other field opens it again;
  // and the screen keeps the field in view
  useEffect(() => {
    const ref = target ? refs.current.get(`${target.setId}:${target.field}`) || null : null;
    if (ref && !ref.isFocused()) ref.focus();
    onTarget?.(ref);
  }, [target, onTarget]);

  const logSet = useCallback((entryId: string, setId: string) => {
    const s = getState();
    const a = s.active;
    const entry = a?.exercises.find((e) => e.id === entryId);
    const i = entry ? entry.sets.findIndex((x) => x.id === setId) : -1;
    const ex = entry && s.exercises.get(entry.exerciseId);
    if (!a || !entry || i < 0 || !ex) return false;
    const settings = s.settings;
    const rows = placeholders(entry, previousSets(ex.id, { templateId: a.templateId }), settings) as { ph: Record<string, string> }[];
    const rest = restFor(entry, ex, settings.defaultRest) as number;
    let r: { problem?: string; rest?: number } = {};
    editActive((d, e) => { r = checkOffSet(d, e, i, { category: ex.category, ph: rows[i].ph, rest, settings }); }, entryId);
    if (r.problem) {
      setShake({ id: setId, n: Date.now() });
      toast(tr(r.problem));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return false;
    }
    const after = getState().active!;
    const logged = after.exercises.find((e) => e.id === entryId)!.sets[i];
    const record = isLiveRecord(logged, ex.category, stats().bests.get(ex.id), settings);
    if (record) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (r.rest && r.rest > 0) startRest(r.rest, f.exName(ex), { entryId, setId });
    // the exercise switched to is done: the session goes back to its order
    if (after.current && !sessionState(after, { current: after.current }).next) patchActive({ current: null });
    if (targetRef.current?.setId === setId) close();
    return true;
  }, [f, tr, close]);

  const value = useMemo(() => ({ target, open, close, logSet, shake, register }), [target, open, close, logSet, shake, register]);
  return (
    <SessionContext.Provider value={value}>
      {children}
      <TargetGuard />
    </SessionContext.Provider>
  );
}

/** Closes the keypad when its set goes away (deleted, the workout finished). */
function TargetGuard() {
  const s = useSession();
  const a = useAppSelector((x) => x.active);
  const gone = !!s?.target && !a?.exercises.some((e) => e.id === s.target!.entryId && e.sets.some((x) => x.id === s.target!.setId));
  useEffect(() => { if (gone) s?.close(); }, [gone, s]);
  return null;
}

/** The exercise's real step for the −/+ keys, in the person's unit. */
function stepFor(field: Field, cat: Category, settings: ReturnType<typeof getState>['settings']) {
  if (field === 'w') return weightStep(cat, settings) as number;
  if (field === 'r') return 1;
  if (field === 'd') return 0.1;
  return 15;
}

/** The keypad for the field being typed into, in place of the Action bar. */
export function KeypadHost() {
  const s = useSession();
  const a = useAppSelector((x) => x.active);
  const exercises = useAppSelector((x) => x.exercises);
  const settings = useAppSelector((x) => x.settings);
  const f = useFormat();
  const { tr } = f;
  const fresh = useRef(true);
  const target = s?.target || null;
  const key = target ? `${target.setId}:${target.field}` : '';
  useEffect(() => { fresh.current = true; }, [key]);
  const entry = target ? a?.exercises.find((e) => e.id === target.entryId) : undefined;
  const ex = entry ? exercises.get(entry.exerciseId) : undefined;
  const prev = useMemo(() => (entry && a ? previousSets(entry.exerciseId, { templateId: a.templateId }) : null), [entry?.exerciseId, a?.templateId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s || !target || !a || !entry || !ex) return null;
  const i = entry.sets.findIndex((x) => x.id === target.setId);
  if (i < 0) return null;
  const set = entry.sets[i];
  const cat = ex.category;
  const field = target.field;
  const rows = placeholders(entry, prev, settings) as { ph: Record<string, string> }[];
  const ghost = rows[i]?.ph[field] || '';
  const value = set[field];
  const decimal = f.num(1.5).replace(/\d/g, '') || '.';
  const step = stepFor(field, cat, settings);
  const fields = fieldsOf(cat);
  const write = (text: string) => editActive((_d, e) => { e.sets[i][field] = text; }, entry.id);

  const onKey = (k: KeypadKey) => {
    if (k === 'next') {
      const at = fields.indexOf(field);
      if (at >= 0 && at < fields.length - 1) {
        const next = { ...target, field: fields[at + 1] };
        s.open(next);
        return;
      }
      if (!set.done) s.logSet(entry.id, set.id);
      else s.close();
      return;
    }
    if (k === 'minus' || k === 'plus') {
      const sign = k === 'plus' ? 1 : -1;
      if (field === 't') {
        const base = digitsToSec(value || ghost) || 0;
        write(secToDigits(Math.max(0, base + sign * step)));
      } else {
        const base = parseNum(value || ghost) ?? 0;
        const n = Math.max(0, Math.round((base + sign * step) * 1000) / 1000);
        write(field === 'r' ? String(Math.round(n)) : numToInput(n, field === 'd' ? 3 : 2));
      }
      fresh.current = false;
      Haptics.selectionAsync().catch(() => {});
      return;
    }
    const maxLength = field === 'r' ? 3 : field === 't' ? 6 : 7;
    write(keypadInput(value, k, { fresh: fresh.current, decimal: field === 'w' || field === 'd' ? decimal : null, maxLength }));
    fresh.current = false;
  };

  const labels = setLabels(entry.sets);
  const setName = set.type === 'warmup' ? tr('warm-up set') : set.type === 'drop' ? tr('drop set') : tr('set {n}', { n: labels[i] });
  const fieldName = { w: tr('Weight'), r: tr('Reps'), d: tr('Distance'), t: tr('Time') }[field];
  // plates per side for a barbell, for the weight as it stands
  let aside: { label: string; value: string } | null = null;
  if (field === 'w' && cat === 'barbell') {
    const total = parseNum(value || ghost);
    if (total !== null && total > 0) {
      const bar = Number(settings.bar) || 0;
      const p = platesFor(total, bar, settings.plates) as { plates: number[]; remainder: number };
      aside = {
        label: tr('Plates per side'),
        value: total <= bar ? tr('Empty bar') : `${p.remainder > 0 ? '≈ ' : ''}${p.plates.map((x) => f.num(x)).join(' · ')}`,
      };
    }
  }
  const stepText = field === 't' ? [tr('−15 s'), tr('+15 s')] : [`−${f.num(step)}`, `+${f.num(step)}`];
  return (
    <Keypad
      title={`${fieldName} · ${setName}`}
      value={field === 't' ? fmtDigits(value) : value}
      ghost={field === 't' ? fmtDigits(ghost) : ghost}
      unit={field === 'w' ? f.unit : field === 'd' ? f.dUnit : undefined}
      aside={aside}
      decimal={field === 'w' || field === 'd' ? decimal : null}
      steps={stepText as [string, string]}
      labels={{
        next: tr('Next'), close: tr('Close keypad'), delete: tr('Delete'),
        minus: field === 't' ? tr('−15 s') : tr('Minus {n}', { n: f.num(step) }), plus: field === 't' ? tr('+15 s') : tr('Plus {n}', { n: f.num(step) }),
      }}
      onKey={onKey}
      onClose={s.close} />
  );
}

// ---------- the header ----------
/** Whole seconds since `since`, updated on the second. */
export function useElapsed(since: number) {
  const calc = () => Math.max(0, Math.floor((Date.now() - since) / 1000));
  const [secs, setSecs] = useState(calc);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const ms = Date.now() - since;
      setSecs(Math.max(0, Math.floor(ms / 1000)));
      timer = setTimeout(tick, 1000 - (((ms % 1000) + 1000) % 1000) + 4);
    };
    tick();
    return () => clearTimeout(timer);
  }, [since]);
  return secs;
}

/** Stroke states of every set, one group per exercise; and the records among the logged sets. */
export function useSessionStrokes(a: ActiveWorkout, live: string | null) {
  const exercises = useAppSelector((x) => x.exercises);
  const workouts = useAppSelector((x) => x.workouts);
  const settings = useAppSelector((x) => x.settings);
  return useMemo(() => {
    const st = stats();
    const now = Date.now();
    let done = 0, total = 0, records = 0;
    const byEntry = new Map<string, StrokeState[]>();
    for (const e of a.exercises) {
      const ex = exercises.get(e.exerciseId);
      const bests = st.bests.get(e.exerciseId);
      byEntry.set(e.id, e.sets.map((x) => {
        total++;
        const warm = x.type === 'warmup';
        if (x.done) {
          done++;
          if (ex && isLiveRecord(x, ex.category, bests, settings, now)) { records++; return 'record'; }
          return warm ? 'warmup' : 'done';
        }
        if (x.id === live) return 'live';
        return warm ? 'warmupPending' : 'pending';
      }));
    }
    return { byEntry, done, total, records };
  }, [a.exercises, live, exercises, workouts, settings]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------- exercises off screen ----------
type UnitLike = { id: string; entries: EntryDraft[] };
const ROW_H = 60;

/** The exercises before or after the one on screen, as rows with their own tally. "Up next" rows drag to reorder. */
export function UnitRows({
  units, strokes, onJump, draggable, onDragging,
}: {
  units: UnitLike[];
  strokes: Map<string, StrokeState[]>;
  onJump: (entryId: string) => void;
  draggable?: boolean;
  onDragging?: (on: boolean) => void;
}) {
  const f = useFormat();
  const { tr } = f;
  const exercises = useAppSelector((x) => x.exercises);
  const templateId = useAppSelector((x) => x.active?.templateId ?? null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const dragRef = useRef(drag);
  const dy = useRef(new Animated.Value(0)).current;
  const unitsRef = useRef(units);
  unitsRef.current = units;
  const set = (d: typeof drag) => { dragRef.current = d; setDrag(d); };
  const move = (from: number, to: number) => {
    const list = unitsRef.current;
    if (from === to || !list[from] || !list[to]) return;
    editActive((d) => { moveUnit(d.exercises, list[from].id, list[to].id); });
  };
  const api = useRef({
    begin: (i: number) => {
      if (dragRef.current) return;
      dy.setValue(0);
      set({ from: i, over: i });
      onDragging?.(true);
      Haptics.selectionAsync().catch(() => {});
    },
    move: (y: number) => {
      const d = dragRef.current;
      if (!d) return;
      dy.setValue(y);
      const over = Math.max(0, Math.min(unitsRef.current.length - 1, Math.round(d.from + y / ROW_H)));
      if (over !== d.over) { set({ ...d, over }); Haptics.selectionAsync().catch(() => {}); }
    },
    end: () => {
      const d = dragRef.current;
      captured.current = false;
      if (!d) return;
      move(d.from, d.over);
      dy.setValue(0);
      set(null);
      onDragging?.(false);
    },
    dragging: (i: number) => dragRef.current?.from === i,
    /** the row's pan handler has the finger (from then on it ends the drag) */
    grab: () => { captured.current = true; },
    /** the press ended: a long press without moving ends the drag here */
    release: (i: number) => setTimeout(() => { if (!captured.current && dragRef.current?.from === i) api.current.end(); }, 0),
  });
  const captured = useRef(false);
  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -ROW_H;
    if (drag.over < drag.from && i >= drag.over && i < drag.from) return ROW_H;
    return 0;
  };
  return (
    <View>
      {units.map((u, i) => {
        const names = u.entries.map((e) => f.exName(exercises.get(e.exerciseId)) || tr('Exercise'));
        const ex = exercises.get(u.entries[0].exerciseId);
        let sub = '';
        if (u.entries.length > 1) sub = tr('Superset');
        else if (ex) {
          const part = BODY_PART_LABEL[ex.bodyPart as keyof typeof BODY_PART_LABEL];
          const last = lastTimeText(previousSets(ex.id, { templateId }), ex.category, f, tr);
          sub = [part ? tr(part) : '', last ? tr('last {sets}', { sets: last }) : ''].filter(Boolean).join(' · ');
        }
        const groups = u.entries.map((e) => strokes.get(e.id) || []);
        const done = groups.flat().filter((x) => x === 'done' || x === 'warmup' || x === 'record').length;
        const count = groups.flat().length;
        return (
          <UnitRow key={u.id} index={i} title={names.join(' + ')} sub={sub} groups={groups} first={i === 0}
            label={`${names.join(', ')}, ${tr('{done} of {total} sets', { done, total: count })}`}
            testID={`jump-${u.entries[0].exerciseId}`} onPress={() => onJump(u.entries[0].id)}
            draggable={!!draggable} lifted={drag?.from === i} shift={shift(i)} dy={dy} api={api}
            onStep={(by) => move(i, i + by)} moveLabels={[tr('Move up'), tr('Move down')]} />
        );
      })}
    </View>
  );
}

type DragApi = {
  begin: (i: number) => void; move: (y: number) => void; end: () => void; dragging: (i: number) => boolean;
  grab: () => void; release: (i: number) => void;
};

function UnitRow({
  index, title, sub, groups, first, label, testID, onPress, draggable, lifted, shift, dy, api, onStep, moveLabels,
}: {
  index: number; title: string; sub: string; groups: StrokeState[][]; first: boolean; label: string; testID: string; onPress: () => void;
  draggable: boolean; lifted: boolean; shift: number; dy: Animated.Value; api: { current: DragApi }; onStep: (by: number) => void; moveLabels: [string, string];
}) {
  const { colors: t } = useTally();
  const idx = useRef(index);
  idx.current = index;
  // after a long press the row follows the finger
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => api.current.dragging(idx.current),
    onPanResponderGrant: () => api.current.grab(),
    onPanResponderMove: (_, g) => api.current.move(g.dy),
    onPanResponderRelease: () => api.current.end(),
    onPanResponderTerminate: () => api.current.end(),
    onPanResponderTerminationRequest: () => false,
  })).current;
  return (
    <Animated.View {...(draggable ? pan.panHandlers : {})}
      style={{ height: ROW_H, backgroundColor: t.paper, zIndex: lifted ? 2 : 0, transform: [{ translateY: lifted ? dy : shift }], ...(lifted ? styles.lifted : null) }}>
      {!first && !lifted && <View style={[styles.hairline, { backgroundColor: t.line }]} />}
      <Pressable onPress={onPress} testID={testID} accessibilityRole="button" accessibilityLabel={label}
        onLongPress={draggable ? () => api.current.begin(idx.current) : undefined} delayLongPress={320}
        onPressOut={() => api.current.release(idx.current)}
        accessibilityActions={draggable ? [{ name: 'moveUp', label: moveLabels[0] }, { name: 'moveDown', label: moveLabels[1] }] : undefined}
        onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === 'moveUp' ? -1 : 1)}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed && !lifted ? t.paper2 : t.paper }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text style={{ ...TYPE.body, color: t.ink }} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={{ ...TYPE.footnote, color: t.ink2, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{sub}</Text>}
        </View>
        <Tally groups={groups} size="small" label="" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingHorizontal: SPACE.s5 },
  hairline: { position: 'absolute', top: 0, left: SPACE.s5, right: 0, height: StyleSheet.hairlineWidth, zIndex: 1 },
  lifted: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
});
