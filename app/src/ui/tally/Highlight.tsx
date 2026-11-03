// The signal fill behind a number that went up (docs/design/components.md,
// Highlight): a record, a beaten target, an upward change. It wraps the value
// only, and fades in once, in 200 ms, when it appears (not with Reduce Motion).
import { useEffect } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { RADIUS, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';

export function Highlight({
  children, chip, style, testID,
}: { children: string; chip?: boolean; style?: StyleProp<TextStyle>; testID?: string }) {
  const { colors: t } = useTally();
  const shown = useSharedValue(0);
  useEffect(() => { shown.value = withTiming(1, { duration: 200 }); }, [shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Animated.View testID={testID} style={[{
      backgroundColor: t.signal, alignSelf: 'flex-start', justifyContent: 'center',
      borderRadius: chip ? RADIUS.capsule : RADIUS.s, paddingHorizontal: chip ? 10 : 5, minHeight: chip ? 26 : undefined,
    }, fade]}>
      <Text style={[chip ? { ...TYPE.caption, fontWeight: '600' } : null, { color: t.onSignal, fontVariant: ['tabular-nums'] }, style]}>{children}</Text>
    </Animated.View>
  );
}
