// Store screenshots of the app, from its web build and the demo data in
// store-demo.mjs (16 weeks of an upper/lower split; not the test backup, and no
// personal name). Not a test suite (CI doesn't run it):
//
//   node tests/browser/run.mjs app-store-shots
//
// builds and serves the app and runs this. Writes to tests/browser/.out/store/:
//
//   raw/<store>-<lang>-<n>-<screen>.png   the bare screens, phone-sized
//   appstore-<lang>-<n>-<screen>.png      1320 × 2868 with the caption, App Store 6.9″
//   play-<lang>-<n>-<screen>.png          1080 × 1920 with the caption, Google Play phone
//   play-feature-graphic.png              1024 × 500, with app/assets/images/icon.png
//
// Captions are in store-captions.mjs; store-frame.mjs adds them, and frames your own
// screenshots (iOS Simulator, phone) the same way. The web build is not the native
// app: see "Store screenshots" in README.md for what differs.
import fs from 'node:fs';
import path from 'node:path';
import { launch, grantWakeLock, APP as BASE, HERE, ROOT } from './env.mjs';
import * as core from '../../setlog/js/core/index.js';
import { demoData } from './store-demo.mjs';
import { CAPTIONS } from './store-captions.mjs';
import { frame } from './store-frame.mjs';

const OUT = path.join(HERE, '.out', 'store');
const RAW = path.join(OUT, 'raw');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });
// the phone each store's screens are taken on (CSS pixels × scale)
const PHONES = {
  appstore: { width: 440, height: 956, scale: 3 }, // iPhone 6.9″: 1320 × 2868
  play: { width: 412, height: 915, scale: 2.625 }, // a 1080 × 2400 Android phone
};

const browser = await launch();
const written = [];

async function screens(store, lang) {
  const { width, height, scale } = PHONES[store];
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale, isMobile: true, hasTouch: true,
    locale: lang === 'de' ? 'de-DE' : 'en-US', colorScheme: 'light',
  });
  await ctx.addInitScript(grantWakeLock);
  await ctx.addInitScript((json) => {
    try { if (!localStorage.getItem('increment.data')) localStorage.setItem('increment.data', json); } catch { /* a frame without storage */ }
  }, JSON.stringify(demoData(lang)));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const id = (t) => page.getByTestId(t);
  const wait = (ms = 500) => page.waitForTimeout(ms);
  const tr = core.translator(lang);
  const shot = async (n, name) => {
    await wait();
    const raw = path.join(RAW, `${store}-${lang}-${n}-${name}.png`);
    await page.screenshot({ path: raw });
    const out = path.join(OUT, `${store}-${lang}-${n}-${name}.png`);
    await frame(browser, { png: fs.readFileSync(raw), caption: CAPTIONS[lang][n - 1], store, out });
    written.push(path.relative(ROOT, out));
  };

  await page.goto(BASE);
  await id('start-suggested').waitFor();

  // 5. templates and the suggested next workout (before a workout is running)
  await shot(5, 'templates');

  // 6. Profile: workouts per week, streak, recent records
  await id('tab-profile').click();
  await id('open-settings').waitFor({ state: 'visible' });
  await wait(600);
  await shot(6, 'profile');

  // 3. an exercise's chart: estimated 1RM over the 16 weeks
  await id('tab-exercises').click();
  await id('exercise-search').fill('squat bb');
  await id('exercise-x-squat-barbell').click();
  await id('exercise-tabs').getByText(tr('Charts'), { exact: true }).click();
  await id('exercise-chart').waitFor();
  await shot(3, 'exercise-chart');
  await page.goBack();
  await wait(300);
  await id('exercise-search').fill('');

  // 4. the History calendar, last month
  await id('tab-history').click();
  await id('history-view').click();
  await id('cal-prev').click();
  await id('cal-stats').waitFor();
  await shot(4, 'calendar');
  await id('history-view').click();
  await id('tab-index').click();
  await wait(300);

  // 1. the suggested workout running: last time's numbers, the warm-up and first set checked off
  await id('start-suggested').click();
  await id('workout-name').waitFor();
  await wait(600);
  const checks = page.locator('[data-testid^="block-"]').first().locator('[data-testid^="check-"]');
  await checks.nth(0).click();
  await wait(300);
  await checks.nth(1).click();
  await wait(300);
  await shot(1, 'workout');

  // 2. the rest timer, opened from the pill
  await id('rest-pill').click();
  await id('rest-panel').waitFor();
  await shot(2, 'rest-timer');

  if (errors.length) throw new Error(errors.join('\n'));
  await ctx.close();
}

async function featureGraphic() {
  const icon = fs.readFileSync(path.join(ROOT, 'app/assets/images/icon.png')).toString('base64');
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:1024px;height:500px;background:#000;display:flex;align-items:center;justify-content:center;gap:56px;font-family:-apple-system,'SF Pro Display','Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#fff">
    <img src="data:image/png;base64,${icon}" style="width:220px;height:220px;border-radius:50px;box-shadow:0 0 0 2px #2a2a2a">
    <div><div style="font-size:92px;font-weight:800;letter-spacing:-2px;line-height:1">Increment</div>
    <div style="font-size:34px;color:#b8bcc4;margin-top:14px">Lifting Tracker</div></div></body></html>`);
  const file = path.join(OUT, 'play-feature-graphic.png');
  await page.screenshot({ path: file });
  written.push(path.relative(ROOT, file));
  await page.close();
}

for (const store of Object.keys(PHONES)) for (const lang of ['en', 'de']) await screens(store, lang);
await featureGraphic();
await browser.close();
console.log(written.join('\n'));
console.log(`\n${written.length} screenshots in ${path.relative(ROOT, OUT)}`);
