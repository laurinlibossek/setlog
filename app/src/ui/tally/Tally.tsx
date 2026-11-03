// The tally: one stroke per set (docs/design/components.md, Tally). A pending
// set is a hairline, a logged set a solid stem, a record a signal stem. Every
// stroke keeps the same slot, so logging a set never moves anything.
import { View } from 'react-native';

import { STROKE } from '@/design/tally';
import { useTally } from '@/lib/theme';

export type StrokeState = 'pending' | 'done' | 'warmup' | 'warmupPending' | 'live' | 'record' | 'skipped';
export type TallySize = 'small' | 'regular' | 'hero';
const HEIGHT: Record<TallySize, number> = { small: 14, regular: STROKE.h, hero: STROKE.hHero };

export function Stroke({ state, size = 'regular' }: { state: StrokeState; size?: TallySize }) {
  const { colors: t } = useTally();
  const h = HEIGHT[size] * (state === 'warmup' || state === 'warmupPending' ? 0.55 : 1);
  let mark;
  if (state === 'done' || state === 'warmup') mark = <View style={{ width: STROKE.slot, height: h, backgroundColor: t.strokeDone }} />;
  else if (state === 'record') {
    mark = <View style={{ width: STROKE.slot, height: h, backgroundColor: t.signal, borderWidth: t.signalEdge === t.signal ? 0 : 1, borderColor: t.signalEdge }} />;
  } else if (state === 'live') mark = <View style={{ width: STROKE.slot, height: h, borderWidth: 1.5, borderColor: t.ink }} />;
  else mark = <View style={{ width: STROKE.hair, height: h, backgroundColor: t.ink3, opacity: state === 'skipped' ? 0.45 : 1 }} />;
  return <View style={{ width: STROKE.slot, height: h, alignItems: 'center' }}>{mark}</View>;
}

/** Strokes in groups: one group per exercise, or fives when counting. */
export function Tally({ groups, size = 'regular', label }: { groups: StrokeState[][]; size?: TallySize; label: string }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: STROKE.group, height: HEIGHT[size] }}>
      {groups.map((g, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: STROKE.gap }}>
          {g.map((s, j) => <Stroke key={j} state={s} size={size} />)}
        </View>
      ))}
    </View>
  );
}

/** Groups of five for counting `done` logged and `pending` still to go. */
export function fives(done: number, pending = 0): StrokeState[][] {
  const all: StrokeState[] = [...Array(done).fill('done'), ...Array(pending).fill('pending')];
  const out: StrokeState[][] = [];
  for (let i = 0; i < all.length; i += 5) out.push(all.slice(i, i + 5));
  return out;
}
