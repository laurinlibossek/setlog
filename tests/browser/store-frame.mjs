// Frames a store screenshot: black background, the caption from store-captions.mjs
// above, the screen below with rounded corners. app-store-shots.mjs uses it for the
// web build's screens, and it works the same on screenshots from the iOS Simulator
// or a phone:
//
//   node tests/browser/store-frame.mjs <folder>                 # App Store, 1320 × 2868
//   node tests/browser/store-frame.mjs <folder> --store play    # Google Play, 1080 × 1920
//
// The folder holds PNGs named <lang>-<n>….png (en-1.png, de-3-chart.png …), where n is
// the screen number 1–6 that picks the caption. Framed copies go to <folder>/framed/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './env.mjs';
import { CAPTIONS } from './store-captions.mjs';

export const CANVAS = {
  appstore: { width: 1320, height: 2868, caption: 440, font: 86, radius: 64, bottom: 40 },
  play: { width: 1080, height: 1920, caption: 300, font: 62, radius: 44, bottom: 36 },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Frame one screenshot (a PNG buffer) with a caption, for 'appstore' or 'play'; writes `out`. */
export async function frame(browser, { png, caption, store, out }) {
  const c = CANVAS[store];
  const page = await browser.newPage({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; width: ${c.width}px; height: ${c.height}px; background: #000; overflow: hidden; }
    body { display: flex; flex-direction: column; align-items: center;
      font-family: -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .cap { height: ${c.caption}px; width: 84%; display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: ${c.font}px; font-weight: 700; line-height: 1.12; letter-spacing: -0.01em; text-align: center; text-wrap: balance; }
    .shot { flex: 1; min-height: 0; width: 100%; display: flex; align-items: flex-start; justify-content: center; padding-bottom: ${c.bottom}px; box-sizing: border-box; }
    img { max-width: 86%; max-height: 100%; border-radius: ${c.radius}px; box-shadow: 0 0 0 3px #2a2a2a; }
  </style></head><body><div class="cap">${esc(caption)}</div>
  <div class="shot"><img src="data:image/png;base64,${png.toString('base64')}"></div></body></html>`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: out });
  await page.close();
}

async function cli() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  const store = args.includes('--store') ? args[args.indexOf('--store') + 1] : 'appstore';
  if (!dir || !CANVAS[store]) {
    console.error('usage: node tests/browser/store-frame.mjs <folder> [--store appstore|play]');
    process.exit(2);
  }
  const outDir = path.join(dir, 'framed');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launch();
  let n = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.png')).sort()) {
    const m = f.match(/^(en|de)-(\d)/);
    const caption = m && CAPTIONS[m[1]][Number(m[2]) - 1];
    if (!caption) { console.log(`skipped ${f} (name it <lang>-<n>….png, n = 1–6)`); continue; }
    const out = path.join(outDir, `${store}-${m[1]}-${m[2]}.png`);
    await frame(browser, { png: fs.readFileSync(path.join(dir, f)), caption, store, out });
    console.log(`${f} → ${path.relative(process.cwd(), out)}`);
    n++;
  }
  await browser.close();
  console.log(`\n${n} framed`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await cli();
