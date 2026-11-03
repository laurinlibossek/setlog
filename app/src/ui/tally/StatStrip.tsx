// Three or four facts in a row, label above value, hairlines between them.
// No icons, no boxes; a value is highlighted only if it went up. docs/design/components.md
import { Text, View } from 'react-native';

import { RADIUS, SPACE, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';

export type Stat = { label: string; value: string; unit?: string; highlight?: boolean; testID?: string };

export function StatStrip({ stats, testID }: { stats: Stat[]; testID?: string }) {
  const { colors: t } = useTally();
  return (
    <View style={{ flexDirection: 'row' }} testID={testID}>
      {stats.map((s, i) => (
        <View key={s.label} testID={s.testID} accessible accessibilityLabel={`${s.label}: ${s.value}${s.unit ? ` ${s.unit}` : ''}`}
          style={{ flex: 1, minWidth: 0, gap: 2, paddingLeft: i ? SPACE.s3 : 0, paddingRight: SPACE.s3, borderLeftWidth: i ? 0.5 : 0, borderLeftColor: t.line }}>
          <Text style={[TYPE.footnote, { color: t.ink2 }]} numberOfLines={1}>{s.label}</Text>
          <Text numberOfLines={1} style={[TYPE.numberM, { color: s.highlight ? t.onSignal : t.ink, fontVariant: ['tabular-nums'], alignSelf: 'flex-start' },
            s.highlight && { backgroundColor: t.signal, borderRadius: RADIUS.s, paddingHorizontal: 4, overflow: 'hidden' }]}>
            {s.value}
            {!!s.unit && <Text style={{ fontSize: TYPE.numberM.fontSize / 2, fontWeight: '600', letterSpacing: 0, color: s.highlight ? t.onSignal : t.ink2 }}>{` ${s.unit}`}</Text>}
          </Text>
        </View>
      ))}
    </View>
  );
}
