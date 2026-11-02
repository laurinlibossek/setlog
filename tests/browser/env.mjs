// Shared setup for the browser suites: where things are, which URLs to test,
// and a Chromium that works in a cloud container or on a laptop.
//
// Every suite imports from here. Run them through run.mjs, which starts the
// servers and prepares the test data; see README.md in this folder.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
/** The web app (setlog/ served at the root, so modules import as /js/store.js). */
export const WEB = process.env.WEB || 'http://localhost:8765/';
/** The Expo app's web build (npx expo serve). */
export const APP = process.env.APP || 'http://localhost:8790';
/** Downloaded and generated test data (git-ignored). */
export const DATA = path.join(HERE, 'data');
export const BACKUP = path.join(DATA, 'setlog-backup.json');
export const STRONG = path.join(DATA, 'strong.csv');
fs.mkdirSync(DATA, { recursive: true });

/** A folder for a suite's screenshots: tests/browser/.out/<name> (git-ignored). */
export function shots(name) {
  const dir = path.join(process.env.SHOTS || path.join(HERE, '.out'), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Playwright: the local install (npm install in this folder) or a global one
// (cloud containers often ship one outside any node_modules ESM can see).
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch { /* not installed here */ }
  const candidates = [process.env.PLAYWRIGHT_DIR, '/opt/npm-tools/node_modules/playwright'];
  try { candidates.push(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'playwright')); } catch { /* no npm */ }
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'package.json'))) return createRequire(import.meta.url)(dir);
  }
  throw new Error('Playwright not found. Run `npm install` in tests/browser (then `npx playwright install chromium` if no browser is installed).');
}
const pw = await loadPlaywright();
export const { chromium, devices } = pw;

function chromiumCandidates() {
  const out = [];
  if (process.env.CHROMIUM) out.push(process.env.CHROMIUM);
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(process.env.HOME || '', '.cache/ms-playwright')];
  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(root, d, sub);
        if (fs.existsSync(p)) out.push(p);
      }
    }
  }
  return out;
}

/** Launches Chromium: $CHROMIUM, else Playwright's own, else any installed Playwright Chromium. */
export async function launch(options = {}) {
  if (process.env.CHROMIUM) return chromium.launch({ ...options, executablePath: process.env.CHROMIUM });
  try {
    return await chromium.launch(options);
  } catch (err) {
    for (const executablePath of chromiumCandidates()) {
      try { return await chromium.launch({ ...options, executablePath }); } catch { /* try the next */ }
    }
    throw err;
  }
}

/**
 * Init script for app contexts: headless Chromium denies the Screen Wake Lock
 * (NotAllowedError), and expo-keep-awake then logs "The wake lock with tag workout
 * has not activated yet" when a workout ends. A phone grants the lock, so the
 * suites do too: `await ctx.addInitScript(grantWakeLock)`.
 */
export function grantWakeLock() {
  const lock = () => {
    const l = new EventTarget();
    l.type = 'screen';
    l.released = false;
    l.release = async () => { l.released = true; l.dispatchEvent(new Event('release')); };
    return l;
  };
  try { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => lock() } }); } catch { /* ignore */ }
}

/** Waits until the web app's store has loaded (polls; waitForFunction with an async predicate can resolve early). */
export async function waitReady(page, prefix = '') {
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate(async (p) => (await import(`${p}/js/store.js`)).S.ready === true, prefix)) return;
    await page.waitForTimeout(50);
  }
  throw new Error('app did not get ready');
}
