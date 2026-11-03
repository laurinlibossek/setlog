// Colours come from the Tally design tokens (docs/design/tokens.json, generated
// into src/design/tally.ts). useTally() gives Tally's own names; useColors()
// still gives the names the screens were first built with, mapped onto Tally,
// until each screen is rebuilt (docs/design/phases.md). "Auto" follows the phone.
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme } from 'expo-router';

import { TALLY_THEMES, type TallyTheme } from '@/design/tally';
import { useSettings } from '@/data/store';

/** The Tally theme for a theme setting; 'system' (or anything unknown) follows the phone. */
export function tallyFor(setting: string, systemDark: boolean): TallyTheme {
  return (TALLY_THEMES as Record<string, TallyTheme>)[setting] ?? (systemDark ? TALLY_THEMES.dark : TALLY_THEMES.light);
}

export function useTally(): TallyTheme {
  const scheme = useColorScheme();
  const settings = useSettings();
  return tallyFor(settings.theme, scheme === 'dark');
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex: string, a: number) => `rgba(${rgb(hex).join(', ')}, ${a})`;
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * The colour names the screens were built with, drawn from a Tally theme: ink
 * on paper, no blue or green, records in the signal colour (as text only where
 * it stays readable; in light themes a record is ink on a signal fill).
 */
export function legacyColors({ scheme, colors: t }: TallyTheme) {
  const dark = scheme === 'dark';
  const mark = dark || contrast(t.signal, t.paper) >= 4.5 ? t.signal : t.ink;
  return {
    bg: t.paper, surface: t.paper2, surface2: t.paper3, surface3: t.paper3,
    ink: t.ink, ink2: t.ink2, ink3: t.ink3, line: t.line, lineStrong: t.ink3,
    accent: t.ink, accentInk: t.paper, accentSoft: t.paper3, accentText: t.ink,
    done: t.strokeDone, doneSoft: 'transparent', doneInk: t.paper, up: mark,
    primary: t.ink, primaryInk: t.paper, chart: t.ink, primarySoft: t.paper3, primaryText: t.ink,
    label: t.ink2, labelStrong: t.ink, chipOn: t.ink, chipOnInk: t.paper, navBg: t.glass, barBg: t.glass,
    warm: t.ink2, warmSoft: t.paper3, drop: t.ink2, dropSoft: t.paper3,
    danger: t.danger, dangerSoft: rgba(t.danger, 0.12),
    gold: mark, goldSoft: dark ? rgba(t.signal, 0.16) : t.signal,
    note: t.paper3, noteInk: t.ink,
    scrim: dark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.4)',
  };
}

export type Colors = ReturnType<typeof legacyColors>;
export type Palette = { scheme: 'light' | 'dark'; colors: Colors };

export function usePalette(): Palette {
  const tally = useTally();
  return useMemo(() => ({ scheme: tally.scheme, colors: legacyColors(tally) }), [tally]);
}

export const useColors = (): Colors => usePalette().colors;

/** The same colours for the navigation bars and tab bar. */
export function useNavigationTheme(): typeof DefaultTheme {
  const { scheme, colors: t } = useTally();
  return useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: scheme === 'dark',
      colors: { ...base.colors, primary: t.ink, background: t.paper, card: t.paper, text: t.ink, border: t.line, notification: t.danger },
    };
  }, [scheme, t]);
}
