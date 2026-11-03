// The minimized session above the tab bar: its tally, the current exercise and
// set, the rest countdown and Skip. Regular layout: tally, two lines, one
// button (Skip during rest). Inline layout (the tab bar minimized): tally and
// the countdown or elapsed time. Tapping anywhere but the button opens the
// session. docs/design/components.md
import { Pressable, Text, View } from 'react-native';

import { CONTROL, RADIUS, SPACE, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';
import { SymbolIcon } from './ListRow';
import { Tally, type StrokeState } from './Tally';

type Props = {
  placement: 'regular' | 'inline';
  tally: StrokeState[][];
  tallyLabel: string;
  /** "Bench Press · set 4 of 4" */
  title: string;
  /** "Rest 1:42", or the workout and its time */
  subtitle: string;
  /** The countdown or elapsed time alone, for the inline layout. */
  short: string;
  onOpen: () => void;
  openLabel: string;
  skip?: { label: string; onPress: () => void };
  /**
   * 'none' inside the system's accessory (it draws the glass); 'raised' where
   * the app draws it itself (the web build, Android, older iPhones).
   */
  surface?: 'none' | 'raised';
  testID?: string;
};

export function NowLifting({ placement, tally, tallyLabel, title, subtitle, short, onOpen, openLabel, skip, surface = 'raised', testID }: Props) {
  const { colors: t, scheme } = useTally();
  const raised = surface === 'raised' && {
    backgroundColor: t.paper2, borderWidth: 0.5, borderColor: t.line,
    shadowColor: '#000', shadowOpacity: scheme === 'dark' ? 0.5 : 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  };
  const inline = placement === 'inline';
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', height: CONTROL.accessoryH, borderRadius: RADIUS.capsule, overflow: surface === 'raised' ? 'visible' : 'hidden',
    }, raised]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={inline ? `${short}, ${openLabel}` : `${title}, ${subtitle}`} accessibilityHint={openLabel} testID={testID}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, height: '100%', flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingLeft: SPACE.s4, paddingRight: skip && !inline ? 0 : SPACE.s4, opacity: pressed ? 0.6 : 1 })}>
        <Tally groups={tally} size="small" label={tallyLabel} />
        {inline ? (
          <Text style={[TYPE.headline, { color: t.ink, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{short}</Text>
        ) : (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[TYPE.headline, { color: t.ink, fontSize: 15, lineHeight: 20 }]} numberOfLines={1}>{title}</Text>
            <Text style={[TYPE.footnote, { color: t.ink2, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{subtitle}</Text>
          </View>
        )}
      </Pressable>
      {skip && !inline && (
        <Pressable onPress={skip.onPress} accessibilityRole="button" accessibilityLabel={skip.label} testID="mini-skip-rest" hitSlop={4}
          style={({ pressed }) => ({ width: CONTROL.hitMin, height: CONTROL.hitMin, marginRight: 2, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.paper3 : 'transparent' })}>
          <SymbolIcon name="forward.end.fill" size={20} color={t.ink} />
        </Pressable>
      )}
    </View>
  );
}
