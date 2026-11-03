// The Tally design tokens for the app, generated from docs/design/tokens.json
// by scripts/tally-tokens.mjs. Don't edit by hand: change tokens.json, then run
// `npm run tally`. Names are the token names in camelCase (paper-2 -> paper2).

export const TALLY_THEME_IDS = [
  'light',
  'dark',
  'strawberry-matcha',
  'intense-red'
] as const;
export type TallyThemeId = (typeof TALLY_THEME_IDS)[number];
export type TallyColors = { paper: string; paper2: string; paper3: string; line: string; ink: string; ink2: string; ink3: string; strokeDone: string; signal: string; onSignal: string; signalEdge: string; danger: string; glass: string; focus: string };
export type TallyTheme = { scheme: 'light' | 'dark'; colors: TallyColors };

export const TALLY_THEMES: Record<TallyThemeId, TallyTheme> = {
  light: {
    scheme: 'light',
    colors: {
      paper: '#ffffff',
      paper2: '#f4f4f1',
      paper3: '#e9e9e5',
      line: '#e2e2dd',
      ink: '#0d0d0c',
      ink2: '#5d5d58',
      ink3: '#8a8a84',
      strokeDone: '#0d0d0c',
      signal: '#ffd60a',
      onSignal: '#0d0d0c',
      signalEdge: '#0d0d0c',
      danger: '#c9271c',
      glass: 'rgba(250,250,247,0.78)',
      focus: '#0d0d0c'
    }
  },
  dark: {
    scheme: 'dark',
    colors: {
      paper: '#000000',
      paper2: '#141413',
      paper3: '#232321',
      line: '#2b2b28',
      ink: '#f4f4f0',
      ink2: '#a6a6a0',
      ink3: '#72726c',
      strokeDone: '#f4f4f0',
      signal: '#ffd60a',
      onSignal: '#0d0d0c',
      signalEdge: '#ffd60a',
      danger: '#ff6257',
      glass: 'rgba(28,28,26,0.72)',
      focus: '#f4f4f0'
    }
  },
  'strawberry-matcha': {
    scheme: 'light',
    colors: {
      paper: '#fbf8f2',
      paper2: '#f2ebde',
      paper3: '#e6dccb',
      line: '#e2d8c6',
      ink: '#2b261f',
      ink2: '#5c5346',
      ink3: '#857a69',
      strokeDone: '#55803a',
      signal: '#c94159',
      onSignal: '#ffffff',
      signalEdge: '#9e2f43',
      danger: '#b3261e',
      glass: 'rgba(251,248,242,0.8)',
      focus: '#2b261f'
    }
  },
  'intense-red': {
    scheme: 'dark',
    colors: {
      paper: '#000000',
      paper2: '#141414',
      paper3: '#242424',
      line: '#2a2a2a',
      ink: '#f5f5f5',
      ink2: '#bdbdbd',
      ink3: '#8c8c8c',
      strokeDone: '#e5202e',
      signal: '#f2b233',
      onSignal: '#0d0d0c',
      signalEdge: '#f2b233',
      danger: '#ff6b6b',
      glass: 'rgba(28,28,28,0.72)',
      focus: '#f5f5f5'
    }
  }
};

export const SPACE = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s12: 48
} as const;
export const RADIUS = {
  s: 6,
  m: 14,
  l: 24,
  capsule: 999
} as const;
export const STROKE = {
  h: 20,
  hHero: 32,
  slot: 5,
  hair: 1.5,
  gap: 4,
  group: 10
} as const;
export const CONTROL = {
  hitMin: 44,
  rowH: 52,
  buttonH: 52,
  accessoryH: 48
} as const;

type Weight = '400' | '500' | '600' | '700';
export const TYPE: Record<string, { fontSize: number; lineHeight: number; fontWeight: Weight; letterSpacing?: number }> = {
  numberXl: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '600',
    letterSpacing: -1.12
  },
  numberL: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '600',
    letterSpacing: -0.51
  },
  numberM: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.22
  },
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
    letterSpacing: -0.34
  },
  title1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.28
  },
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700'
  },
  title3: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600'
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600'
  },
  body: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400'
  },
  subhead: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400'
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400'
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500'
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.72
  }
};
