// Web app, v1.5.x colour themes: Strawberry Matcha and Intense Red override the
// system light/dark setting, survive reloads, apply before first paint (also the
// status-bar colour), and leave Auto/Light/Dark working as before. 7 checks.
import assert from 'node:assert/strict';
import { devices, launch, WEB as BASE, shots, waitReady } from './env.mjs';

const OUT = shots('web-themes');
const browser = await launch();
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const cssVar = (page, name) => ev(page, (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(), name);
const stamp = (page) => ev(page, () => document.documentElement.getAttribute('data-theme'));
async function openSettings(page) {
  await ev(page, async () => { const ui = await import('/js/ui.js'); ui.closeAllModals?.(); ui.setTab('profile'); ui.nav.stacks.profile = []; ui.push('settings'); });
  await page.locator('#set-theme').waitFor();
}

const errors = [];
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-US', colorScheme: 'dark', serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE);
await waitReady(page);

// history and a template with every set type, so the screens have content
await ev(page, async () => {
  const st = await import('/js/store.js');
  const id = (n) => st.findExerciseByName(n).id;
  const t = st.copyTemplate({ name: 'Push day', exercises: [
    { exerciseId: id('Bench Press (Barbell)'), sets: [{ type: 'warmup', w: 40, r: 10 }, { w: 80, r: 8 }, { w: 80, r: 8 }, { w: 80, r: 7 }, { type: 'drop', w: 60, r: 10 }, { type: 'failure', w: 50, r: 9 }] },
    { exerciseId: id('Lat Pulldown (Cable)'), sets: [{ w: 60, r: 10 }, { w: 60, r: 10 }] },
  ] });
  for (const [d, w] of [[16, 72.5], [12, 75], [9, 75], [5, 77.5], [2, 80]]) {
    st.saveWorkout({
      id: 'w' + d, name: 'Push day', startedAt: Date.now() - d * 86400000, endedAt: Date.now() - d * 86400000 + 3600000, templateId: t.id,
      exercises: [{ id: 'e' + d, exerciseId: id('Bench Press (Barbell)'), sets: [{ id: 's' + d, type: 'normal', w, r: 8 }] }],
    });
  }
  st.addMeasurement({ type: 'bodyweight', value: 82, at: Date.now() - 86400000 });
});

// Settings shows one list with all five choices
await openSettings(page);
assert.deepEqual(await page.locator('#set-theme option').evaluateAll((o) => o.map((x) => x.value)),
  ['system', 'light', 'dark', 'strawberry-matcha', 'intense-red']);
assert.deepEqual(await page.locator('#set-theme option').allInnerTexts(), ['Auto', 'Light', 'Dark', 'Strawberry Matcha', 'Intense Red']);
ok('theme setting lists Auto, Light, Dark, Strawberry Matcha and Intense Red');

const THEMES = [
  { id: 'strawberry-matcha', bg: '#f2ebde', accent: '#55803a', done: '#55803a', scheme: 'light', up: 'rgb(85, 128, 58)' },
  { id: 'intense-red', bg: '#0a0a0a', accent: '#e5202e', done: '#e5202e', scheme: 'dark', up: 'rgb(245, 245, 245)' },
];
for (const th of THEMES) {
  await openSettings(page);
  await page.locator('#set-theme').selectOption(th.id);
  await page.waitForTimeout(200);
  assert.equal(await stamp(page), th.id);
  assert.equal(await cssVar(page, '--bg'), th.bg, `${th.id} --bg (system is dark)`);
  assert.equal(await cssVar(page, '--accent'), th.accent);
  assert.equal(await cssVar(page, '--done'), th.done);
  assert.equal(await ev(page, () => getComputedStyle(document.documentElement).colorScheme), th.scheme);
  assert.deepEqual(await page.locator('meta[name="theme-color"]').evaluateAll((m) => m.map((x) => [x.content.toLowerCase(), x.getAttribute('media')])), [[th.bg, null]], 'one status-bar colour, no media query');
  assert.equal(await ev(page, () => localStorage.getItem('setlog-theme-color')), th.bg);
  assert.equal(await ev(page, () => localStorage.getItem('setlog-theme')), th.id);
  await page.screenshot({ path: `${OUT}/${th.id}-settings.png` });

  // start screen
  await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('workout'); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${th.id}-start.png` });

  // running workout: tick warm-up and two working sets
  await page.locator('#start-suggested').click();
  await page.locator('#finish-workout').waitFor();
  const checks = page.locator('button[aria-label="Mark set as done"]');
  for (const i of [0, 1, 2]) await checks.nth(i).click();
  await page.waitForTimeout(400);
  const doneBg = await page.locator('.set-row.done').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(doneBg, 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: `${OUT}/${th.id}-workout.png` });
  await ev(page, async () => (await import('/js/store.js')).discardActive());
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#finish-workout').count(), 0);

  // history, exercise chart, profile
  await ev(page, async () => { const ui = await import('/js/ui.js'); ui.closeAllModals?.(); ui.setTab('history'); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${th.id}-history.png` });
  await ev(page, async () => { const ui = await import('/js/ui.js'); const st = await import('/js/store.js'); ui.setTab('exercises'); ui.nav.stacks.exercises = []; ui.push('exercise', { id: st.findExerciseByName('Bench Press (Barbell)').id }); });
  await page.waitForTimeout(200);
  await page.locator('.seg button', { hasText: 'Charts' }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${th.id}-chart.png` });
  assert.equal(await page.locator('.card-sub span').first().evaluate((el) => getComputedStyle(el).color), th.up, 'a gain on the chart');
  await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('profile'); ui.nav.stacks.profile = []; });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${th.id}-profile.png` });
  ok(`${th.id}: palette applied over system dark, status bar colour set, screens render`);
}

// survives a reload and is stamped before the app script runs
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
const early = await stamp(page);
const earlyColor = await page.locator('meta[name="theme-color"]').evaluateAll((m) => m.map((x) => [x.content.toLowerCase(), x.getAttribute('media')]));
await waitReady(page);
assert.equal(early, 'intense-red');
assert.ok(earlyColor.every(([c, m]) => c === '#0a0a0a' && m === null), 'status-bar colour is Intense Red from the start');
// with the app script blocked, index.html alone must already set the colour
const bare = await ctx.newPage();
await bare.route('**/js/app.js', (r) => r.abort());
await bare.goto(BASE, { waitUntil: 'domcontentloaded' });
assert.deepEqual(await bare.locator('meta[name="theme-color"]').evaluateAll((m) => m.map((x) => [x.content.toLowerCase(), x.getAttribute('media')])),
  [['#0a0a0a', null], ['#0a0a0a', null]], 'index.html sets the status-bar colour before the app loads');
await bare.close();
assert.equal(await stamp(page), 'intense-red');
assert.equal(await ev(page, async () => (await import('/js/store.js')).S.settings.theme), 'intense-red');
ok('theme survives a reload and is applied before first paint');

// Auto / Light / Dark still behave
await openSettings(page);
await page.locator('#set-theme').selectOption('system');
await page.waitForTimeout(200);
assert.equal(await stamp(page), null);
assert.equal(await cssVar(page, '--bg'), '#0b0d11', 'Auto follows the dark system setting');
await page.locator('#set-theme').selectOption('light');
await page.waitForTimeout(200);
assert.equal(await cssVar(page, '--bg'), '#f1f3f6', 'Light overrides the dark system setting');
await page.locator('#set-theme').selectOption('dark');
await page.waitForTimeout(200);
assert.equal(await cssVar(page, '--bg'), '#0b0d11');
await page.locator('#set-theme').selectOption('system');
await page.waitForTimeout(200);
assert.equal(await ev(page, () => localStorage.getItem('setlog-theme')), 'system');
assert.equal(await ev(page, () => localStorage.getItem('setlog-theme-color')), null);
assert.deepEqual(await page.locator('meta[name="theme-color"]').evaluateAll((m) => m.map((x) => [x.content.toLowerCase(), x.getAttribute('media')])), [['#f1f3f6', '(prefers-color-scheme: light)'], ['#0b0d11', '(prefers-color-scheme: dark)']], 'Auto restores the light/dark pair');
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
assert.equal(await stamp(page), null);
await waitReady(page);
ok('Auto, Light and Dark work as before, and Auto leaves no stamp after reload');

// a light phone on Auto stays on the default light palette
const ctxL = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-US', colorScheme: 'light', serviceWorkers: 'block' });
const pl = await ctxL.newPage();
pl.on('pageerror', (e) => errors.push(String(e)));
await pl.goto(BASE);
await waitReady(pl);
assert.equal(await cssVar(pl, '--bg'), '#f1f3f6');
ok('Auto on a light phone keeps the default light palette');

// German labels
const ctxD = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE', colorScheme: 'light', serviceWorkers: 'block' });
const pd = await ctxD.newPage();
pd.on('pageerror', (e) => errors.push(String(e)));
await pd.goto(BASE);
await waitReady(pd);
await openSettings(pd);
assert.deepEqual(await pd.locator('#set-theme option').allInnerTexts(), ['Auto', 'Hell', 'Dunkel', 'Erdbeer-Matcha', 'Intensives Rot']);
ok('theme names are translated in German');

assert.deepEqual(errors, []);
await browser.close();
console.log(`\n${passed} checks passed`);
