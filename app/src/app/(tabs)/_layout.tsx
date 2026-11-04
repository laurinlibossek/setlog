// The tabs on iPhone and Android: the system's own tab bar (NativeTabs, stable since SDK 58;
// works in Expo Go). Today, Plan, Progress, then Search, which iOS 26 sets
// apart at the trailing end. The bar minimizes when the content scrolls down.
// While a workout runs, iOS 26 shows it in the bottom accessory above the bar
// (regular, or inline when the bar is minimized); Android and older iPhones
// get NowLiftingDock in each tab instead (src/ui/workout/MiniBar.tsx).
// The web build uses _layout.web.tsx.
import { Platform } from 'react-native';
import { NativeTabs } from 'expo-router/native-tabs';

import { useAppSelector } from '@/data/store';
import { useLang } from '@/lib/i18n';
import { useTally } from '@/lib/theme';
import { MiniBar, SYSTEM_ACCESSORY } from '@/ui/workout/MiniBar';

function Accessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  return <MiniBar placement={placement} surface="none" />;
}

export default function TabLayout() {
  const { tr } = useLang();
  const { colors: t } = useTally();
  const running = useAppSelector((s) => !!s.active);
  const android = Platform.OS === 'android';
  return (
    <NativeTabs
      minimizeBehavior="onScrollDown"
      tintColor={t.ink}
      iconColor={{ default: t.ink2, selected: t.ink }}
      labelStyle={{ default: { color: t.ink2 }, selected: { color: t.ink } }}
      backgroundColor={android ? t.paper : undefined}
      indicatorColor={android ? t.paper3 : undefined}
      rippleColor={android ? t.paper3 : undefined}
      labelVisibilityMode={android ? 'labeled' : undefined}>
      <NativeTabs.Trigger name="index" testID="tab-index" contentStyle={{ backgroundColor: t.paper }}>
        <NativeTabs.Trigger.Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} md="light_mode" />
        <NativeTabs.Trigger.Label>{tr('Today')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plan" testID="tab-plan" contentStyle={{ backgroundColor: t.paper }}>
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet.rectangle.portrait', selected: 'list.bullet.rectangle.portrait.fill' }} md="list_alt" />
        <NativeTabs.Trigger.Label>{tr('Plan')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="progress" testID="tab-progress" contentStyle={{ backgroundColor: t.paper }}>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="trending_up" />
        <NativeTabs.Trigger.Label>{tr('Progress')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search" role="search" testID="tab-search" contentStyle={{ backgroundColor: t.paper }}>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>{tr('Search')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      {SYSTEM_ACCESSORY && running && (
        <NativeTabs.BottomAccessory>
          <Accessory />
        </NativeTabs.BottomAccessory>
      )}
    </NativeTabs>
  );
}
