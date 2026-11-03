// A number with its unit and label, sized by importance (docs/design/components.md,
// NumberDisplay): `xl` for the one hero number on a screen, `l` for the set or
// timer in focus, `m` in rows and stats. Tabular figures always; the unit is
// half the size in ink-2. Labels sit below a hero number and above the others.
// A change that went up is shown in the signal highlight; any other change is
// plain ink-2 text (colour is earned).
import { Pressable, Text, View } from 'react-native';

import { RADIUS, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';
import { Icon } from '@/ui/kit';

export interface NumberDisplayProps {
  /** Already rounded and formatted for the person's units and language. */
  value: string;
  unit?: string;
  label?: string;
  size: 'xl' | 'l' | 'm';
  /** Shown next to the number, e.g. "+13.3 kg". */
  change?: string;
  /** The change went up: shown highlighted. Otherwise it is plain text. */
  changeUp?: boolean;
  /** Makes the label a button with a ⌄ (e.g. to pick what the number shows). */
  onLabelPress?: () => void;
  labelTestID?: string;
  testID?: string;
}

const NUMBER = { xl: TYPE.numberXl, l: TYPE.numberL, m: TYPE.numberM } as const;
const UNIT = { xl: 20, l: 17, m: 11 } as const;

export function NumberDisplay({
  value, unit, label, size, change, changeUp, onLabelPress, labelTestID, testID,
}: NumberDisplayProps) {
  const { colors: t } = useTally();
  const n = NUMBER[size];
  const number = (
    <Text style={{ ...n, color: t.ink, fontVariant: ['tabular-nums'], flexShrink: 1 }} numberOfLines={1} testID={testID}>
      {value}
      {!!unit && <Text style={{ fontSize: UNIT[size], fontWeight: '600', letterSpacing: 0, color: t.ink2 }}>{` ${unit}`}</Text>}
    </Text>
  );
  const changeMark = !change ? null : changeUp ? (
    <View style={{ backgroundColor: t.signal, borderRadius: RADIUS.s, paddingHorizontal: 4 }}>
      <Text style={{ ...TYPE.headline, color: t.onSignal, fontVariant: ['tabular-nums'] }}>{change}</Text>
    </View>
  ) : <Text style={{ ...TYPE.headline, color: t.ink2, fontVariant: ['tabular-nums'] }}>{change}</Text>;
  const labelText = !label ? null : onLabelPress ? (
    <Pressable onPress={onLabelPress} accessibilityRole="button" hitSlop={10} testID={labelTestID}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ ...TYPE.footnote, color: t.ink2 }}>{label}</Text>
      <Icon name="chevronDown" size={11} color={t.ink2} />
    </Pressable>
  ) : <Text style={{ ...TYPE.footnote, color: t.ink2 }} testID={labelTestID}>{label}</Text>;

  if (size === 'xl') {
    return (
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          {number}
          {changeMark && <View style={{ marginBottom: 10 }}>{changeMark}</View>}
        </View>
        {labelText}
      </View>
    );
  }
  return (
    <View style={{ gap: 2, minWidth: 0 }}>
      {labelText}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {number}
        {changeMark}
      </View>
    </View>
  );
}
