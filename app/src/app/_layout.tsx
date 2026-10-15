import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { load, useAppState } from '@/data/store';
import { useLang } from '@/lib/i18n';
import { useNavigationTheme, usePalette } from '@/lib/theme';
import { Empty, Loading } from '@/ui/kit';
import { OverlayHost } from '@/ui/overlay';
import { RestWatcher } from '@/ui/workout/Rest';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { ready, error } = useAppState();
  const theme = useNavigationTheme();
  const palette = usePalette();
  const { tr } = useLang();

  useEffect(() => { load(); }, []);
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);

  if (!ready) return <Loading />;
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={palette.scheme === 'dark' ? 'light' : 'dark'} />
      {error ? <Empty title={tr('Couldn’t load your data: {error}', { error })} /> : (
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerTintColor: palette.colors.accentText, headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false, headerStyle: { backgroundColor: palette.colors.bg } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
            <Stack.Screen name="settings" options={{ title: tr('Settings') }} />
            <Stack.Screen name="workout/[id]" options={{ title: '' }} />
            <Stack.Screen name="template/[id]" options={{ title: '' }} />
            <Stack.Screen name="exercise/[id]" options={{ title: '' }} />
            {/* the running workout and what opens from it slide up over the app */}
            <Stack.Screen name="active" options={{ presentation: 'modal', headerShown: false, title: tr('Current workout') }} />
            <Stack.Screen name="pick-exercises" options={{ presentation: 'modal', headerShown: false, title: tr('Add exercises') }} />
            <Stack.Screen name="reorder" options={{ presentation: 'modal', headerShown: false, title: tr('Reorder') }} />
            <Stack.Screen name="summary/[id]" options={{ presentation: 'modal', headerShown: false, title: tr('Workout saved') }} />
          </Stack>
          <RestWatcher />
          <OverlayHost />
        </View>
      )}
    </ThemeProvider>
  );
}
