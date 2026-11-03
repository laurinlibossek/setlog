// A section's title in Title 2, with one optional trailing item: a scope
// ("Last 7 days") or one plain action ("Edit", "Hide"). docs/design/components.md
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { CONTROL, SPACE, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';
import { SymbolIcon, type SymbolName } from './ListRow';

type Props = {
  title: string;
  scope?: string;
  /** A plain text action, or a symbol (⋯) with `label` for screen readers. */
  action?: { title?: string; symbol?: SymbolName; onPress: () => void; testID?: string; label?: string };
  /** The first section under a title: no space above. */
  first?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function SectionHeader({ title, scope, action, first, style, testID }: Props) {
  const { colors: t } = useTally();
  return (
    <View testID={testID} style={[{
      flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE.s3,
      paddingHorizontal: SPACE.s5, marginTop: first ? 0 : SPACE.s8, marginBottom: SPACE.s2,
    }, style]}>
      <Text style={[TYPE.title2, { color: t.ink, flexShrink: 1 }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      {!!scope && <Text style={[TYPE.footnote, { color: t.ink2, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{scope}</Text>}
      {!scope && action && (
        <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label} testID={action.testID} hitSlop={10}
          style={({ pressed }) => ({ minHeight: CONTROL.hitMin / 2, minWidth: action.symbol ? CONTROL.hitMin / 2 : undefined, alignItems: 'flex-end', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
          {action.symbol ? <SymbolIcon name={action.symbol} size={20} color={t.ink} /> : <Text style={[TYPE.subhead, { color: t.ink2 }]}>{action.title}</Text>}
        </Pressable>
      )}
    </View>
  );
}
