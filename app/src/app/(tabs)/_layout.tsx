import { Tabs } from 'expo-router';

import { useLang } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { Icon, type IconName } from '@/ui/kit';

// Same tabs, in the same order, as the web app. Workout is in the middle and
// opens first.
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'profile', title: 'Profile', icon: 'profile' },
  { name: 'history', title: 'History', icon: 'history' },
  { name: 'index', title: 'Workout', icon: 'workout' },
  { name: 'exercises', title: 'Exercises', icon: 'exercises' },
  { name: 'measure', title: 'Measure', icon: 'measure' },
];

export default function TabLayout() {
  const { tr } = useLang();
  const c = useColors();
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.ink3,
        tabBarStyle: { backgroundColor: c.barBg, borderTopColor: c.line },
        sceneStyle: { backgroundColor: c.bg },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{
          title: tr(t.title),
          tabBarButtonTestID: `tab-${t.name}`,
          tabBarIcon: ({ color }) => <Icon name={t.icon} size={24} color={String(color)} />,
        }} />
      ))}
    </Tabs>
  );
}
