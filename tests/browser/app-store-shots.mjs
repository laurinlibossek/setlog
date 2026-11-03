// Store screenshots of the app, from its web build and the test backup. Not a test
// suite (CI doesn't run it): `node tests/browser/run.mjs app-store-shots` builds and
// serves the app, makes the backup and runs this. Writes to tests/browser/.out/store/:
//
//   appstore-<lang>-<n>-<screen>.png   1320 × 2868, App Store 6.9" iPhone
//   play-<lang>-<n>-<screen>.png       1080 × 1920, Google Play phone (9:16)
//   play-feature-graphic.png           1024 × 500, with app/assets/images/icon.png
//
// The web build is not the native app: see "Store screenshots" in README.md for what
// differs, and take the final App Store screenshots from the iOS Simulator.
import fs from 'node:fs';
import path from 'node:path';
import { launch, grantWakeLock, APP as BASE, BACKUP, HERE, ROOT } from './env.mjs';
import * as core from '../../setlog/js/core/index.js';

const OUT = path.join(HERE, '.out', 'store');
fs.mkdirSync(OUT, { recursive: true });
const DAY = 86400000;
const SIZES = {
  appstore: { width: 440, height: 956, scale: 3, mobile: true }, // 1320 × 2868
  play: { width: 360, height: 640, scale: 3, mobile: true }, // 1080 × 1920
};

// the sample history, moved so the newest workout was yesterday evening (whole weeks, so weekdays stay)
const parsed = core.parseBackup(fs.readFileSync(BACKUP, 'utf8'), core.SEED_EXERCISES);
const newest = Math.max(...parsed.data.workouts.map((w) => w.startedAt));
const yesterday = new Date(Date.now() - DAY);
yesterday.setHours(18, 0, 0, 0);
const shift = Math.round((yesterday.getTime() - newest) / (7 * DAY)) * 7 * DAY;
function dataFor(lang) {
  const d = JSON.parse(JSON.stringify(parsed.data));
  for (const w of d.workouts) { w.startedAt += shift; if (w.endedAt) w.endedAt += shift; }
  for (const m of d.measurements) m.at += shift;
  d.kv.settings = { ...(d.kv.settings || {}), theme: 'system', language: lang };
  d.kv.profile = { name: 'Laurin' };
  d.kv.meta = { ...(d.kv.meta || {}), lastBackupAt: Date.now() - DAY, seedVersion: 0 };
  return d;
}

// the most-logged exercises in the sample history, so the "previous" column has numbers
const WORKOUT = [['squat bb', 'x-squat-barbell'], ['overhead press bb', 'x-overhead-press-barbell'], ['good morning', 'x-good-morning-barbell']];

const browser = await launch();
const written = [];

async function screens(store, lang) {
  const { width, height, scale } = SIZES[store];
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale, isMobile: true, hasTouch: true,
    locale: lang === 'de' ? 'de-DE' : 'en-US', colorScheme: 'light',
  });
  await ctx.addInitScript(grantWakeLock);
  await ctx.addInitScript((json) => { try { if (!localStorage.getItem('increment.data')) localStorage.setItem('increment.data', json); } catch { /* a frame without storage */ } }, JSON.stringify(dataFor(lang)));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const id = (t) => page.getByTestId(t);
  const wait = (ms = 500) => page.waitForTimeout(ms);
  const shot = async (n, name) => {
    await wait();
    const file = path.join(OUT, `${store}-${lang}-${n}-${name}.png`);
    await page.screenshot({ path: file });
    written.push(path.relative(ROOT, file));
  };
  const tr = core.translator(lang);

  await page.goto(BASE);
  await id('start-empty').waitFor();

  // 5. templates and the suggested workout (taken first, before a workout is running)
  await wait(500);
  await shot(5, 'templates');

  // 6. Profile: workouts per week and recent records
  await id('tab-profile').click();
  await id('open-settings').waitFor({ state: 'visible' });
  await wait(600);
  await shot(6, 'profile');

  // 3. an exercise's chart (estimated 1RM over time)
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

  // 1. a running workout with exercises that have history: the "previous" column, two sets checked off
  await id('start-empty').click();
  await id('workout-name').waitFor();
  await id('add-exercises').click();
  await id('pick-search').waitFor();
  for (const [q, ex] of WORKOUT) {
    await id('pick-search').fill(q);
    await wait(250);
    await id(`pick-${ex}`).click();
  }
  await id('pick-add').click();
  await wait(800);
  const firstChecks = id(`block-${WORKOUT[0][1]}`).locator('[data-testid^="check-"]');
  await firstChecks.nth(0).click();
  await wait(300);
  await firstChecks.nth(1).click();
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

for (const store of Object.keys(SIZES)) for (const lang of ['en', 'de']) await screens(store, lang);
await featureGraphic();
await browser.close();
console.log(written.join('\n'));
console.log(`\n${written.length} screenshots in ${path.relative(ROOT, OUT)}`);
