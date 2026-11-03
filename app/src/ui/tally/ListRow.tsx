// A full-width row: optional leading symbol, a title with an optional second
// line, and a trailing value, tally or chevron. Hairlines between rows are
// inset to the text; no cards around lists. docs/design/components.md
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { CONTROL, SPACE, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';
import { Tally, type StrokeState } from './Tally';

/** SF Symbols used by Tally rows and tabs, with their Material Symbol (Android and web). */
export const SYMBOLS = {
  'sun.max': 'light_mode',
  'sun.max.fill': 'light_mode',
  'list.bullet.rectangle.portrait': 'list_alt',
  'list.bullet.rectangle.portrait.fill': 'list_alt',
  'chart.line.uptrend.xyaxis': 'trending_up',
  magnifyingglass: 'search',
  calendar: 'calendar_today',
  dumbbell: 'fitness_center',
  rosette: 'workspace_premium',
  'figure.stand': 'accessibility_new',
  'circle.circle': 'adjust',
  function: 'calculate',
  plus: 'add',
  ellipsis: 'more_horiz',
  'forward.end': 'skip_next',
  'forward.end.fill': 'skip_next',
  'chevron.right': 'chevron_right',
  'chevron.down': 'expand_more',
  'square.and.arrow.up': 'upload',
  'person.crop.circle': 'person',
  folder: 'folder',
} as const;
export type SymbolName = keyof typeof SYMBOLS;

/** An SF Symbol on iOS, its Material Symbol on Android and the web. */
export function SymbolIcon({ name, size = 22, color }: { name: SymbolName; size?: number; color: string }) {
  const md = SYMBOLS[name];
  return <SymbolView name={{ ios: name, android: md, web: md } as SymbolViewProps['name']} size={size} tintColor={color} />;
}

type Props = {
  title: string;
  subtitle?: string;
  symbol?: SymbolName;
  /** A value ("214", "81.4 kg") or a tally. */
  trailing?: string | { tally: StrokeState[][]; label: string };
  /** Anything else at the end, before the chevron (a ⋯ button). */
  right?: ReactNode;
  /** Only when the row opens a page. */
  chevron?: boolean;
  onPress?: () => void;
  /** The first row of a list has no hairline above it. */
  first?: boolean;
  testID?: string;
  accessibilityLabel?: string;
};

export function ListRow({ title, subtitle, symbol, trailing, right, chevron, onPress, first, testID, accessibilityLabel }: Props) {
  const { colors: t } = useTally();
  const inset = symbol ? SPACE.s5 + 30 + SPACE.s3 : SPACE.s5;
  const body = (pressed: boolean) => (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, minHeight: CONTROL.rowH,
      paddingVertical: 6, paddingHorizontal: SPACE.s5, backgroundColor: pressed ? t.paper2 : 'transparent',
    }}>
      {!first && <View style={{ position: 'absolute', top: 0, right: 0, left: inset, height: 0.5, backgroundColor: t.line }} />}
      {symbol && <View style={{ width: 30, alignItems: 'center' }}><SymbolIcon name={symbol} size={22} color={t.ink2} /></View>}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={[TYPE.body, { color: t.ink }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={[TYPE.footnote, { color: t.ink2, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {typeof trailing === 'string' && (
        <Text style={[TYPE.subhead, { color: t.ink2, fontVariant: ['tabular-nums'], flexShrink: 0, maxWidth: '45%' }]} numberOfLines={1}>{trailing}</Text>
      )}
      {trailing && typeof trailing === 'object' && <Tally groups={trailing.tally} size="small" label={trailing.label} />}
      {right}
      {chevron && <SymbolIcon name="chevron.right" size={13} color={t.ink3} />}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body(false)}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}
