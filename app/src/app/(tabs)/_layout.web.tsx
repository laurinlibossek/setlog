// The tabs in the web build, which the browser tests and screenshots use.
// NativeTabs on the web is a pill at the top of the page without test ids or
// a bottom accessory, so the web keeps JS tabs, drawn like the web stand-in in
// docs/design/screens.html: Now Lifting above a capsule with Today, Plan and
// Progress, and Search on its own. The bar sits below the content instead of
// over it, so nothing a test taps is ever under it. Phones use _layout.tsx.
import { Pressable, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RADIUS, SPACE } from '@/design/tally';
import { useLang } from '@/lib/i18n';
import { useTally } from '@/lib/theme';
import { SymbolIcon, type SymbolName } from '@/ui/tally/ListRow';
import { MiniBar } from '@/ui/workout/MiniBar';

const ICON: Record<string, [SymbolName, SymbolName]> = {
  index: ['sun.max', 'sun.max.fill'],
  plan: ['list.bullet.rectangle.portrait', 'list.bullet.rectangle.portrait.fill'],
  progress: ['chart.line.uptrend.xyaxis', 'chart.line.uptrend.xyaxis'],
  search: ['magnifyingglass', 'magnifyingglass'],
};
const BAR_H = 62;

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors: t, scheme } = useTally();
  const insets = useSafeAreaInsets();
  const float = {
    backgroundColor: t.paper2, borderWidth: 0.5, borderColor: t.line,
    shadowColor: '#000', shadowOpacity: scheme === 'dark' ? 0.5 : 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  };
  const tab = (route: (typeof state.routes)[number], index: number) => {
    const focused = state.index === index;
    const { options } = descriptors[route.key];
    const label = String(options.title ?? route.name);
    const press = () => {
      const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    const search = route.name === 'search';
    const [icon, selected] = ICON[route.name] ?? ['ellipsis', 'ellipsis'];
    return (
      <Pressable key={route.key} onPress={press} testID={`tab-${route.name}`} accessibilityRole="tab" accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        style={search
          ? [{ width: BAR_H, height: BAR_H, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center' }, float, focused && { backgroundColor: t.paper3 }]
          : { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: RADIUS.capsule, backgroundColor: focused ? t.paper3 : 'transparent' }}>
        <SymbolIcon name={focused ? selected : icon} size={24} color={focused ? t.ink : t.ink2} />
        {!search && <Text style={{ fontSize: 11, lineHeight: 13, fontWeight: focused ? '600' : '500', color: focused ? t.ink : t.ink2 }}>{label}</Text>}
      </Pressable>
    );
  };
  const main = state.routes.filter((r) => r.name !== 'search');
  const searchRoute = state.routes.find((r) => r.name === 'search');
  return (
    <View style={{ backgroundColor: t.paper, paddingHorizontal: SPACE.s4, paddingTop: SPACE.s2, paddingBottom: Math.max(insets.bottom, SPACE.s3), gap: 10 }}>
      <MiniBar />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s3 }} accessibilityRole="tablist">
        <View style={[{ flex: 1, flexDirection: 'row', height: BAR_H, padding: 4, borderRadius: RADIUS.capsule }, float]}>
          {main.map((r) => tab(r, state.routes.indexOf(r)))}
        </View>
        {searchRoute && tab(searchRoute, state.routes.indexOf(searchRoute))}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { tr } = useLang();
  const { colors: t } = useTally();
  return (
    <Tabs initialRouteName="index" tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.paper } }}>
      <Tabs.Screen name="index" options={{ title: tr('Today') }} />
      <Tabs.Screen name="plan" options={{ title: tr('Plan') }} />
      <Tabs.Screen name="progress" options={{ title: tr('Progress') }} />
      <Tabs.Screen name="search" options={{ title: tr('Search') }} />
    </Tabs>
  );
}
