// Colours come from the shared palettes in setlog/js/core/themes.js, which
// are generated from the web app's CSS: Light, Dark, Strawberry Matcha and
// Intense Red look the same in both apps. "Auto" follows the phone.
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme } from 'expo-router';
import { paletteFor } from '@setlog/core';

import { useSettings } from '@/data/store';

export type Palette = ReturnType<typeof paletteFor>;
export type Colors = Palette['colors'];

export function usePalette(): Palette {
  const scheme = useColorScheme();
  const settings = useSettings();
  return paletteFor(settings.theme, scheme === 'dark');
}

export const useColors = (): Colors => usePalette().colors;

/** The same colours for the navigation bars and tab bar. */
export function useNavigationTheme(): typeof DefaultTheme {
  const p = usePalette();
  return useMemo(() => {
    const base = p.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: p.scheme === 'dark',
      colors: {
        ...base.colors,
        primary: p.colors.accent,
        background: p.colors.bg,
        card: p.colors.surface,
        text: p.colors.ink,
        border: p.colors.line,
        notification: p.colors.danger,
      },
    };
  }, [p]);
}
