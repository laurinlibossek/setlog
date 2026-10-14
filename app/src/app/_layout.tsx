import { useEffect } from 'react';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import { load, useAppState } from '@/data/store';
import { useLang } from '@/lib/i18n';
import { useNavigationTheme, usePalette } from '@/lib/theme';
import { Empty, Loading } from '@/ui/kit';

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
        <Stack screenOptions={{ headerTintColor: palette.colors.accentText, headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false, headerStyle: { backgroundColor: palette.colors.bg } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
          <Stack.Screen name="settings" options={{ title: tr('Settings') }} />
          <Stack.Screen name="workout/[id]" options={{ title: '' }} />
          <Stack.Screen name="template/[id]" options={{ title: '' }} />
          <Stack.Screen name="exercise/[id]" options={{ title: '' }} />
        </Stack>
      )}
    </ThemeProvider>
  );
}
