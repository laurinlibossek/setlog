// Writes app/src/design/tally.ts from docs/design/tokens.json, the Tally design
// tokens (colours per theme, spacing, radii, stroke and control sizes, type).
// tokens.json is the source: run `npm run tally` after changing it (the tests
// fail until you do).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOKENS_FILE = path.join(root, 'docs/design/tokens.json');
export const OUT_FILE = path.join(root, 'app/src/design/tally.ts');

const camel = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const px = (v) => (typeof v === 'number' ? v : Number(String(v).replace(/px$/, '')));

function luminance(hex) {
  const n = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** The tokens as plain data: { themes, space, radius, stroke, control, type }. */
export function tallyFromTokens(tokens) {
  const ids = tokens.color.themes.map((t) => t.id);
  const raw = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value]));
  const value = (name, theme) => {
    const v = raw[name];
    const s = typeof v === 'string' ? v : (v[theme] ?? v[ids[0]]);
    return s.startsWith('{') ? value(s.slice(1, -1), theme) : s;
  };
  const themes = {};
  for (const id of ids) {
    const colors = {};
    for (const name of Object.keys(raw)) colors[camel(name)] = value(name, id);
    themes[id] = { scheme: luminance(colors.paper) < 0.5 ? 'dark' : 'light', colors };
  }
  // space-5 -> s5, radius-capsule -> capsule, stroke-h-hero -> hHero, hit-min -> hitMin
  const short = (name) => camel(name.replace(/^space-/, 's').replace(/^(radius|stroke)-/, ''));
  const family = (key) => Object.fromEntries(tokens[key].tokens.map((t) => [short(t.name), px(t.value)]));
  const type = {};
  for (const g of tokens.type.groups) {
    for (const s of g.styles) {
      const size = px(s.fontSize);
      const style = { fontSize: size, lineHeight: px(s.lineHeight), fontWeight: String(s.fontWeight) };
      if (s.letterSpacing) style.letterSpacing = Math.round(parseFloat(s.letterSpacing) * size * 100) / 100;
      type[camel(s.name.replace(/^t-/, ''))] = style;
    }
  }
  return { themes, space: family('spacing'), radius: family('radius'), stroke: family('stroke'), control: family('control'), type };
}

const json = (v) => JSON.stringify(v, null, 2).replace(/"([A-Za-z_][\w]*)":/g, '$1:').replace(/"/g, "'");

/** The TypeScript module for the app. */
export function render(t) {
  const ids = Object.keys(t.themes);
  const colorKeys = Object.keys(t.themes[ids[0]].colors);
  return `// The Tally design tokens for the app, generated from docs/design/tokens.json
// by scripts/tally-tokens.mjs. Don't edit by hand: change tokens.json, then run
// \`npm run tally\`. Names are the token names in camelCase (paper-2 -> paper2).

export const TALLY_THEME_IDS = ${json(ids)} as const;
export type TallyThemeId = (typeof TALLY_THEME_IDS)[number];
export type TallyColors = { ${colorKeys.map((k) => `${k}: string`).join('; ')} };
export type TallyTheme = { scheme: 'light' | 'dark'; colors: TallyColors };

export const TALLY_THEMES: Record<TallyThemeId, TallyTheme> = ${json(t.themes)};

export const SPACE = ${json(t.space)} as const;
export const RADIUS = ${json(t.radius)} as const;
export const STROKE = ${json(t.stroke)} as const;
export const CONTROL = ${json(t.control)} as const;

type Weight = '400' | '500' | '600' | '700';
export const TYPE: Record<string, { fontSize: number; lineHeight: number; fontWeight: Weight; letterSpacing?: number }> = ${json(t.type)};
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = render(tallyFromTokens(JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'))));
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, out);
  console.log(`wrote ${path.relative(root, OUT_FILE)}`);
}
