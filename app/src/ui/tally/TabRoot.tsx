// The frame of a tab's first screen (docs/design/navigation.md → Tab root):
// an eyebrow (Today only), the large title with one trailing control, then
// the content, scrolling under the tab bar.
//
// Insets: on iPhone the scroll view adjusts itself (the native tab bar and the
// accessory are part of the safe area), so no padding is added by hand. On
// Android the native tabs keep the content above their bar but not below the
// status bar. The web build has JS tabs (see src/app/(tabs)/_layout.web.tsx).
import type { ReactNode } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppSelector } from '@/data/store';
import { SPACE, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';
import { DOCK_SPACE, NowLiftingDock, SYSTEM_ACCESSORY } from '@/ui/workout/MiniBar';

/** Padding for a tab root's scroll view, by platform (see above). */
export function useTabPadding() {
  const insets = useSafeAreaInsets();
  const running = useAppSelector((s) => !!s.active);
  const dock = running && !SYSTEM_ACCESSORY && Platform.OS !== 'web';
  return {
    paddingTop: Platform.OS === 'ios' ? 0 : insets.top,
    paddingBottom: SPACE.s8 + (dock ? DOCK_SPACE : 0),
  };
}

export function TabTitle({ title, eyebrow, right }: { title: string; eyebrow?: string; right?: ReactNode }) {
  const { colors: t } = useTally();
  return (
    <View style={{ paddingHorizontal: SPACE.s5, paddingTop: SPACE.s4, marginBottom: SPACE.s4 }}>
      {!!eyebrow && <Text style={[TYPE.eyebrow, { color: t.ink2, textTransform: 'uppercase' }]} numberOfLines={1}>{eyebrow}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.s3, minHeight: 44 }}>
        <Text style={[TYPE.largeTitle, { color: t.ink, flexShrink: 1 }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {right}
      </View>
    </View>
  );
}

export function TabRoot({ title, eyebrow, right, children, testID }: { title: string; eyebrow?: string; right?: ReactNode; children: ReactNode; testID?: string }) {
  const { colors: t } = useTally();
  const pad = useTabPadding();
  return (
    <View style={{ flex: 1, backgroundColor: t.paper }} testID={testID}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={pad} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        <TabTitle title={title} eyebrow={eyebrow} right={right} />
        {children}
      </ScrollView>
      <NowLiftingDock />
    </View>
  );
}
