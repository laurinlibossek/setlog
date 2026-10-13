// Writes setlog/js/core/themes.js from the colour tokens in setlog/css/app.css,
// so the Expo app can use the same palettes. The CSS stays the source of truth:
// run `npm run themes` after changing a colour (the tests fail until you do).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CSS_FILE = path.join(root, 'setlog/css/app.css');
export const OUT_FILE = path.join(root, 'setlog/js/core/themes.js');

/** The custom properties declared in the first `selector {` block of the CSS. */
function block(css, selector) {
  const at = css.indexOf(selector + ' {');
  if (at < 0) throw new Error(`no block for ${selector}`);
  let depth = 0, i = css.indexOf('{', at);
  const start = i + 1;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) break;
  }
  const body = css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '');
  const props = {};
  for (const m of body.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)) props[m[1]] = m[2].trim();
  return props;
}

const camel = (name) => name.replace(/^--/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
const isColor = (v) => /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i.test(v);

function resolve(props) {
  const get = (name, seen = new Set()) => {
    const v = props[name];
    if (v === undefined || seen.has(name)) return undefined;
    seen.add(name);
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    return m ? get(m[1], seen) : v;
  };
  const colors = {};
  for (const name of Object.keys(props)) {
    if (!name.startsWith('--')) continue;
    const v = get(name);
    if (v && isColor(v)) colors[camel(name)] = v.toLowerCase();
  }
  return colors;
}

export function themesFromCss(css) {
  const base = block(css, ':root');
  const named = {
    light: {},
    dark: block(css, ':root[data-theme="dark"]'),
    'strawberry-matcha': block(css, ':root[data-theme="strawberry-matcha"]'),
    'intense-red': block(css, ':root[data-theme="intense-red"]'),
  };
  const out = {};
  for (const [id, own] of Object.entries(named)) {
    const props = { ...base, ...own };
    out[id] = { scheme: props['color-scheme'] || 'light', colors: resolve(props) };
  }
  return out;
}

export function render(themes) {
  return `// Colour palettes for every theme, generated from css/app.css by
// scripts/themes-from-css.mjs. Don't edit by hand: change the CSS, then run
// \`npm run themes\`. Token names are the CSS names in camelCase (--surface-2 -> surface2).
// "Auto" uses light or dark to match the phone.

export const THEME_IDS = ${JSON.stringify(Object.keys(themes)).replace(/"/g, "'").replace(/,/g, ', ')};

export const THEMES = ${JSON.stringify(themes, null, 2).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")};

/** The palette for a theme setting; 'system' follows \`systemDark\`. */
export function paletteFor(theme, systemDark = false) {
  if (THEMES[theme]) return THEMES[theme];
  return systemDark ? THEMES.dark : THEMES.light;
}
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const text = render(themesFromCss(fs.readFileSync(CSS_FILE, 'utf8')));
  fs.writeFileSync(OUT_FILE, text);
  console.log(`wrote ${path.relative(root, OUT_FILE)}`);
}
