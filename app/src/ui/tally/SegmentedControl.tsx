// Two to five mutually exclusive options, such as a chart's range
// (docs/design/components.md, SegmentedControl): a paper-3 capsule, the chosen
// option raised on paper. Labels of one word or a short number ("3M", "All").
// Drawn in JS so it needs no native module (Expo Go) and looks the same on
// iPhone, Android and the web.
import { Pressable, Text, View } from 'react-native';

import { RADIUS } from '@/design/tally';
import { useTally } from '@/lib/theme';

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Read out for the whole control, e.g. "Range". */
  label?: string;
  /** Each option gets `${testID}-${value}`. */
  testID?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, label, testID }: SegmentedControlProps<T>) {
  const { colors: t } = useTally();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} testID={testID}
      style={{ flexDirection: 'row', padding: 3, borderRadius: RADIUS.capsule, backgroundColor: t.paper3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => { if (!on) onChange(o.value); }} accessibilityRole="radio" aria-checked={on}
            testID={testID ? `${testID}-${o.value}` : undefined} hitSlop={{ top: 7, bottom: 7 }}
            style={{
              flex: 1, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.capsule,
              backgroundColor: on ? t.paper : 'transparent',
              shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, shadowOpacity: on ? 0.12 : 0,
            }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? t.ink : t.ink2 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
