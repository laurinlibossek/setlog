// The days of the current week with one stroke per session: a stem for a
// session done, a hairline for one planned (outlined if it's today), nothing
// for a rest day. Today's letter is reversed out of ink. docs/design/components.md
import { Text, View } from 'react-native';

import { RADIUS, SPACE, STROKE } from '@/design/tally';
import { useTally } from '@/lib/theme';
import { Tally, type StrokeState } from './Tally';

type Day = { done: number; planned: boolean; letter: string };

export function WeekStrip({ days, today, label, testID }: { days: Day[]; today: number; label: string; testID?: string }) {
  const { colors: t } = useTally();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} testID={testID}
      style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: SPACE.s5 }}>
      {days.map((d, i) => {
        const strokes: StrokeState[] = d.done ? Array(Math.min(d.done, 3)).fill('done') : d.planned ? [i === today ? 'live' : 'pending'] : [];
        const isToday = i === today;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: SPACE.s2 }}>
            <View style={{ width: 26, height: 26, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? t.ink : 'transparent' }}>
              <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: '600', color: isToday ? t.paper : t.ink2 }}>{d.letter}</Text>
            </View>
            {strokes.length ? <Tally groups={[strokes]} label="" /> : <View style={{ height: STROKE.h }} />}
          </View>
        );
      })}
    </View>
  );
}
