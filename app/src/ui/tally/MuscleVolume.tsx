// Working sets per muscle over the last 7 days, as tallies in fives. With Pro
// (later), hairlines show the sets still missing to the weekly floor; without
// it there are no targets. docs/design/components.md
import { useState } from 'react';
import { Text, View } from 'react-native';

import { SPACE, STROKE, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';
import { fives, Tally } from './Tally';

export type MuscleRow = { muscle: string; label: string; sets: number; floor?: number; ceiling?: number };

const FIVE = 5 * STROKE.slot + 4 * STROKE.gap; // one full group of strokes

export function MuscleVolume({ rows, accessibilityLabel, testID }: { rows: MuscleRow[]; accessibilityLabel: (r: MuscleRow) => string; testID?: string }) {
  const { colors: t } = useTally();
  // as many strokes as fit; the count on the right is always the whole number
  const [width, setWidth] = useState(0);
  const room = width ? Math.max(1, Math.floor((width + STROKE.group) / (FIVE + STROKE.group))) * 5 : 0;
  return (
    <View style={{ paddingHorizontal: SPACE.s5, gap: SPACE.s3 }} testID={testID}>
      {rows.map((r, i) => {
        const missing = r.floor ? Math.max(0, r.floor - r.sets) : 0;
        const done = Math.min(r.sets, room);
        const over = r.ceiling !== undefined && r.sets > r.ceiling;
        return (
          <View key={r.muscle} accessible accessibilityLabel={accessibilityLabel(r)} testID={`muscle-${r.muscle}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s3 }}>
            <Text style={[TYPE.subhead, { color: t.ink, width: 84 }]} numberOfLines={1}>{r.label}</Text>
            <View style={{ flex: 1, overflow: 'hidden' }} onLayout={i === 0 ? (e) => setWidth(e.nativeEvent.layout.width) : undefined}>
              {room > 0 && <Tally groups={fives(done, Math.min(missing, room - done))} label="" />}
            </View>
            <Text style={[TYPE.headline, { color: over ? t.ink2 : t.ink, minWidth: 28, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>{r.sets}</Text>
          </View>
        );
      })}
    </View>
  );
}
