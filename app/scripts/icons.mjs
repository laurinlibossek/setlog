// The app icon and splash: a white Roman-numeral "I" (a capital I with serif
// bars) on black, drawn as vector paths. Three designs; one is wired in.
//
//   node app/scripts/icons.mjs            # renders the wired design (thin)
//   node app/scripts/icons.mjs classic    # or another one
//
// Writes the SVG of every design to app/assets/icon/ and, for the chosen one,
// the PNGs app.json points to: icon.png (iOS, 1024, no transparency),
// android-icon-foreground/-background/-monochrome.png (adaptive icon, the I
// inside the safe zone), splash-icon.png and favicon.png. Renders with the
// Playwright Chromium the browser tests use (tests/browser/env.mjs).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { launch } from '../../tests/browser/env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, '..', 'assets');
const SIZE = 1024;

/** The letter, centred on 0,0 (y down). Every design is 600–640 units tall. */
export const DESIGNS = {
  // chiselled: bracketed serifs that curve into the stem, slightly cupped ends
  classic: 'M -170 -300 Q 0 -292 170 -300 V -266 C 112 -262 75 -240 75 -180 V 180 C 75 240 112 262 170 266 V 300 Q 0 292 -170 300 V 266 C -112 262 -75 240 -75 180 V -180 C -75 -240 -112 -262 -170 -266 Z',
  // slab: square bars, no brackets
  slab: 'M -185 -300 H 185 V -216 H 88 V 216 H 185 V 300 H -185 V 216 H -88 V -216 H -185 Z',
  // thin: a light stem with hairline bars
  thin: 'M -160 -320 H 160 V -294 H 34 V 294 H 160 V 320 H -160 V 294 H -34 V -294 H -160 Z',
};
export const DEFAULT_DESIGN = 'thin';

/** Half the diagonal of the letter's box, to fit it inside a circle. */
function halfDiagonal(d) {
  // absolute commands only: M, L, C, Q take x y pairs, H an x, V a y
  let w = 0, h = 0, cmd = '', i = 0;
  for (const tok of d.match(/[A-Z]|-?\d+(?:\.\d+)?/g)) {
    if (/[A-Z]/.test(tok)) { cmd = tok; i = 0; continue; }
    const v = Math.abs(Number(tok));
    if (cmd === 'H' || (cmd !== 'V' && i % 2 === 0)) w = Math.max(w, v);
    else h = Math.max(h, v);
    i++;
  }
  return Math.hypot(w, h);
}

/** An SVG of the letter: `scale` 1 is 600 units on a 1024 canvas; `bg` null leaves it transparent. */
export function svg(design, { scale = 1, bg = '#000000', fg = '#ffffff', size = SIZE } = {}) {
  const d = DESIGNS[design];
  const k = (size / SIZE) * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + (bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '')
    + `<path transform="translate(${size / 2} ${size / 2}) scale(${k})" fill="${fg}" d="${d}"/></svg>`;
}

// ---------- PNG encoding (RGB or RGBA, so the iOS icon has no alpha channel) ----------
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(rgba, w, h, alpha) {
  const ch = alpha ? 4 : 3;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) raw[y * (w * ch + 1) + 1 + x * ch + c] = rgba[(y * w + x) * 4 + c];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Rasterise an SVG string to RGBA pixels in Chromium. */
export async function rasterise(page, svgText, size) {
  const b64 = await page.evaluate(async ({ s, n }) => {
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${btoa(s)}`;
    await img.decode();
    const cv = Object.assign(document.createElement('canvas'), { width: n, height: n });
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, n, n);
    const px = g.getImageData(0, 0, n, n).data;
    let bin = '';
    for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { s: svgText, n: size });
  return Buffer.from(b64, 'base64');
}

async function main() {
  const design = process.argv[2] || DEFAULT_DESIGN;
  if (!DESIGNS[design]) throw new Error(`unknown design "${design}" (${Object.keys(DESIGNS).join(', ')})`);
  fs.mkdirSync(path.join(ASSETS, 'icon'), { recursive: true });
  for (const name of Object.keys(DESIGNS)) fs.writeFileSync(path.join(ASSETS, 'icon', `${name}.svg`), svg(name) + '\n');

  // Android masks the adaptive icon to a circle (or squircle) inside the 66 of 108 dp safe zone:
  // a radius of 0.305 × the canvas. Keep the letter's corners a little inside it.
  const safe = (0.305 * SIZE - 24) / halfDiagonal(DESIGNS[design]);
  const outputs = [
    ['images/icon.png', svg(design), SIZE, false],
    ['images/android-icon-foreground.png', svg(design, { bg: null, scale: safe }), SIZE, true],
    ['images/android-icon-background.png', `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="#000000"/></svg>`, SIZE, false],
    ['images/android-icon-monochrome.png', svg(design, { bg: null, scale: safe }), SIZE, true],
    ['images/splash-icon.png', svg(design, { bg: null }), SIZE, true],
    ['images/favicon.png', svg(design, { size: 48 }), 48, false],
  ];
  const browser = await launch();
  const page = await browser.newPage();
  for (const [file, s, n, alpha] of outputs) {
    const png = encodePng(await rasterise(page, s, n), n, n, alpha);
    fs.writeFileSync(path.join(ASSETS, file), png);
    console.log(`${file}  ${n}×${n} ${alpha ? 'RGBA' : 'RGB'}  ${Math.round(png.length / 1024)} KB`);
  }
  await browser.close();
  console.log(`design: ${design} (Android letter scale ${safe.toFixed(3)})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
