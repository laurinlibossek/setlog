// Logging a workout in the Expo app (web build) on an emulated iPhone, in the
// Tally session: empty workout, check-off rules, ghost values, the captions in
// the field boxes, the rest bar with "Reps left?" (0 · 1 · 2+, 0 is failure),
// set types and the set's ⋯, undo, the keypad, supersets, minimize and
// reload, reordering, Up next (switch and drag), finishing early with unlogged
// sets, a template workout with last time's values, the Log button, records
// and the summary’s template switch (German), "already running", and
// discarding. 19 checks.
import assert from 'node:assert/strict';
import { devices, launch, grantWakeLock, APP as BASE, BACKUP, shots } from './env.mjs';

const OUT = shots('app-logging');
const BENCH = 'x-bench-press-barbell', PULLUP = 'x-pull-up', LAT = 'x-lat-pulldown-cable';
const browser = await launch();
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };

async function newPage({ locale = 'en-US' } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale });
  await ctx.addInitScript(grantWakeLock);
  // count screen wake locks: the app keeps the screen on only when asked to (Settings → Keep screen on)
  await ctx.addInitScript(() => {
    const wl = navigator.wakeLock;
    window.__wakeLocks = 0;
    try { Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: (...x) => { window.__wakeLocks++; return wl.request(...x); } } }); } catch { /* ignore */ }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools/.test(m.text())) errors.push(m.text()); });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  await page.goto(BASE);
  await page.getByTestId('start-empty').waitFor();
  return { ctx, page, errors, dialogs };
}
const id = (page, t) => page.getByTestId(t);
const block = (page, ex) => id(page, `block-${ex}`);
const inputs = (page, ex, f) => block(page, ex).locator(`[data-testid^="in-${f}-"]`);
const checks = (page, ex) => block(page, ex).locator('[data-testid^="check-"]');
const labels = (page, ex) => block(page, ex).locator('[data-testid^="label-"]');
const toastText = async (page) => { await id(page, 'toast').waitFor(); return id(page, 'toast').innerText(); };
const checked = async (loc) => (await loc.getAttribute('aria-checked')) === 'true';
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const sec = (t) => t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
/** Finishing before every set is logged: ⋯ → Finish early ("Finish workout" is in the Action bar after the last set). */
async function finishEarly(page) {
  await id(page, 'workout-menu').click();
  await id(page, 'menu-finish').click();
}
/** Press and hold an Up next row, then drag it by `dy` pixels. */
async function dragRow(page, testID, dy) {
  const b = await id(page, testID).boundingBox();
  const x = b.x + b.width / 3, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await wait(page, 600);
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + (dy * i) / 10);
  await page.mouse.up();
  await wait(page, 400);
}
async function pick(page, names) {
  await id(page, 'add-exercises').click();
  await id(page, 'pick-search').waitFor();
  for (const n of names) {
    await id(page, 'pick-search').fill(n.q);
    await wait(page, 200);
    await id(page, `pick-${n.id}`).click();
  }
  await id(page, 'pick-add').click();
  await wait(page, 600);
}

// ---------- 1. an empty workout ----------
{
  const { ctx, page, errors } = await newPage();
  await id(page, 'start-empty').click();
  await id(page, 'workout-name').waitFor();
  assert.match(await id(page, 'workout-name').inputValue(), /^(Morning|Afternoon|Evening|Night) Workout$/);
  await pick(page, [{ q: 'bench bb', id: BENCH }, { q: 'pull up', id: PULLUP }]);
  assert.equal(await block(page, BENCH).count(), 1);
  // one exercise at a time: the next one waits under Up next
  assert.equal(await block(page, PULLUP).count(), 0);
  assert.equal(await id(page, `jump-${PULLUP}`).count(), 1);
  ok('an empty workout starts with the time-of-day name; exercises are added from the picker, the second under Up next');

  // check-off rules
  await checks(page, BENCH).first().click();
  assert.equal(await toastText(page), 'Enter reps first');
  assert.equal(await checked(checks(page, BENCH).first()), false);
  await inputs(page, BENCH, 'r').first().fill('5');
  await checks(page, BENCH).first().click();
  await wait(page, 200);
  assert.equal(await toastText(page), 'Enter the weight first');
  await inputs(page, BENCH, 'w').first().fill('80');
  await checks(page, BENCH).first().click();
  await wait(page, 200);
  assert.equal(await checked(checks(page, BENCH).first()), true);
  assert.match(await id(page, 'rest-left').innerText(), /^(2:00|1:59|1:58)$/);
  assert.equal(await page.evaluate(() => window.__wakeLocks), 0, 'the screen may turn off: the rest notification says when rest is over');
  ok('a set needs reps and weight; checking it off starts the 2:00 rest timer; the screen isn’t kept on');

  // placeholders from the row above, check-off fills them in
  await id(page, `add-set-${BENCH}`).click();
  await wait(page, 200);
  assert.equal(await inputs(page, BENCH, 'w').nth(1).getAttribute('placeholder'), '80');
  assert.equal(await inputs(page, BENCH, 'r').nth(1).getAttribute('placeholder'), '5');
  // the set being logged says what its boxes hold; last time's value stays the placeholder under the caption
  const live = (await checks(page, BENCH).nth(1).getAttribute('data-testid')).replace(/^check-/, '');
  assert.deepEqual([await id(page, `cap-w-${live}`).innerText(), await id(page, `cap-r-${live}`).innerText()], ['Weight', 'Reps']);
  const logged = (await checks(page, BENCH).nth(0).getAttribute('data-testid')).replace(/^check-/, '');
  assert.equal(await id(page, `cap-w-${logged}`).count(), 0, 'a logged set has no boxes');
  await checks(page, BENCH).nth(1).click();
  await wait(page, 200);
  assert.equal(await inputs(page, BENCH, 'w').nth(1).inputValue(), '80');
  assert.equal(await checked(checks(page, BENCH).nth(1)), true);
  assert.match(await id(page, 'session-count').innerText(), /^2 of 3 sets/);
  ok('a new set shows the row above as ghost values under “Weight” and “Reps”; logging it saves them (2 of 3 sets under the hero tally)');

  // the rest bar: ±15 s, "Reps left?" for the set just logged, Skip
  const before = await id(page, 'rest-left').innerText();
  await id(page, 'rest-plus').click();
  await wait(page, 300);
  const after = await id(page, 'rest-left').innerText();
  assert.ok(sec(after) - sec(before) >= 13, `${before} → ${after}`);
  await id(page, 'rest-minus').click();
  await wait(page, 300);
  assert.ok(sec(after) - sec(await id(page, 'rest-left').innerText()) >= 13, 'minus 15 s');
  // three choices, 1 in the middle: 0 · 1 · 2+
  assert.deepEqual(await page.locator('[data-testid^="effort-"]').evaluateAll((els) => els.filter((e) => /^effort-\d$/.test(e.dataset.testid)).map((e) => e.innerText.trim())), ['0', '1', '2+']);
  await id(page, 'effort-2').click();
  await wait(page, 300);
  assert.equal(await id(page, 'effort-2').getAttribute('aria-pressed'), 'true');
  assert.equal((await labels(page, BENCH).nth(1).innerText()).trim(), '2+ left');
  // 0 left is a failure set; another rating makes it a working set again
  await id(page, 'effort-0').click();
  await wait(page, 300);
  assert.equal((await labels(page, BENCH).nth(1).innerText()).trim(), 'Failure');
  const activeSet = async (n) => (await page.evaluate(() => JSON.parse(localStorage.getItem('increment.data')).kv.active)).exercises[0].sets[n];
  await wait(page, 300);
  assert.deepEqual([(await activeSet(1)).type, (await activeSet(1)).rir], ['failure', 0]);
  await id(page, 'effort-2').click();
  await wait(page, 300);
  assert.equal((await labels(page, BENCH).nth(1).innerText()).trim(), '2+ left');
  await page.screenshot({ path: `${OUT}/01-rest-bar.png` });
  await id(page, 'rest-skip').click();
  await wait(page, 300);
  assert.equal(await id(page, 'rest-left').count(), 0);
  // Bench is done: Pull Up is next, and the Action bar logs its set
  assert.equal(await block(page, PULLUP).count(), 1);
  assert.equal(await id(page, 'log-set').innerText(), 'Log set');
  ok('the rest bar adds and takes 15 s, rates the set just logged (0 · 1 · 2+; 0 makes it a failure set) and skips; Pull Up comes up next');

  // back to Bench: set types and reps left from the set menu, delete with undo
  await id(page, `jump-${BENCH}`).click();
  await wait(page, 300);
  await id(page, `add-set-${BENCH}`).click();
  await wait(page, 200);
  assert.equal(await id(page, 'log-set').innerText(), 'Log 80 × 5');
  // a plain working set has a ⋯ at the end of its row that opens its menu
  const third = (await checks(page, BENCH).nth(2).getAttribute('data-testid')).replace(/^check-/, '');
  assert.equal((await labels(page, BENCH).nth(2).innerText()).trim(), '', 'no chip on a plain working set');
  await id(page, `set-menu-${third}`).click();
  await id(page, 'type-drop').click();
  await wait(page, 200);
  assert.equal((await labels(page, BENCH).nth(2).innerText()).trim(), 'Drop');
  // choosing Failure sets 0 reps left; 1 left makes it a working set again
  await labels(page, BENCH).nth(1).click();
  await id(page, 'type-failure').click();
  await wait(page, 300);
  assert.equal((await labels(page, BENCH).nth(1).innerText()).trim(), 'Failure');
  await labels(page, BENCH).nth(1).click();
  assert.match(await id(page, 'set-rir').innerText(), /Reps left · 0 left/);
  await id(page, 'set-rir').click();
  assert.deepEqual(await page.locator('[data-testid^="rir-"]').evaluateAll((els) => els.map((e) => e.dataset.testid)), ['rir-0', 'rir-1', 'rir-2', 'rir-clear']);
  await id(page, 'rir-1').click();
  await wait(page, 300);
  assert.equal((await labels(page, BENCH).nth(1).innerText()).trim(), '1 left');
  assert.deepEqual([(await activeSet(1)).type, (await activeSet(1)).rir], ['normal', 1]);
  await labels(page, BENCH).nth(2).click();
  await id(page, 'set-delete').click();
  await wait(page, 200);
  assert.equal(await checks(page, BENCH).count(), 2);
  assert.equal(await toastText(page), 'Set deleted\nUndo');
  await id(page, 'toast-action').click();
  await wait(page, 200);
  assert.equal(await checks(page, BENCH).count(), 3);
  assert.equal((await labels(page, BENCH).nth(2).innerText()).trim(), 'Drop');
  ok('switching back to Bench from its row; the set menu from ⋯ and the chips: drop set, Failure = 0 left and back to 1 left, delete and undo');

  // the keypad: typing replaces the ghost value, −2.5 with plates per side, Next → reps → logged
  const drop = await checks(page, BENCH).nth(2).getAttribute('data-testid');
  const dropId = drop.replace(/^check-/, '');
  await id(page, `in-w-${dropId}`).click();
  await id(page, 'keypad').waitFor();
  assert.equal(await id(page, 'action-bar').count(), 0, 'the keypad takes the Action bar\'s place');
  assert.match(await id(page, 'keypad').innerText(), /Weight · drop set/);
  assert.match(await id(page, 'keypad-aside').innerText(), /Plates per side\s*25 · 5/);
  await id(page, 'key-7').click();
  await id(page, 'key-0').click();
  await id(page, 'key-minus').click();
  assert.match(await id(page, 'keypad-value').innerText(), /^67\.5/);
  assert.match(await id(page, 'keypad-aside').innerText(), /20 · 2\.5 · 1\.25/);
  await page.screenshot({ path: `${OUT}/01b-keypad.png` });
  await id(page, 'key-next').click();
  await wait(page, 200);
  assert.match(await id(page, 'keypad').innerText(), /Reps · drop set/);
  await id(page, 'key-8').click();
  await id(page, 'key-next').click();
  await wait(page, 300);
  assert.equal(await id(page, 'keypad').count(), 0);
  assert.equal(await inputs(page, BENCH, 'w').nth(2).inputValue(), '67.5');
  assert.equal(await inputs(page, BENCH, 'r').nth(2).inputValue(), '8');
  assert.equal(await checked(checks(page, BENCH).nth(2)), true);
  assert.match(await id(page, 'rest-left').innerText(), /^(2:00|1:59|1:58)$/);
  await id(page, 'rest-skip').click();
  await wait(page, 300);
  ok('the keypad types 70, steps to 67.5 with plates per side, and Next goes to reps, then logs the set');

  // superset and the rest timer of an exercise
  await id(page, `ex-menu-${PULLUP}`).click();
  await id(page, 'menu-superset').click();
  await id(page, `ss-${BENCH}`).click();
  await wait(page, 300);
  assert.equal(await block(page, BENCH).getByText('Superset A').count(), 1);
  assert.equal(await block(page, PULLUP).getByText('Superset A').count(), 1);
  await id(page, `ex-menu-${PULLUP}`).click();
  await id(page, 'menu-rest').click();
  await id(page, 'rest-90').click();
  await wait(page, 200);
  assert.match(await id(page, `rest-tag-${PULLUP}`).innerText(), /(^|\s)1:30$/);
  // a superset is done together: both exercises are on screen
  assert.equal(await block(page, BENCH).count(), 1);
  await id(page, `add-set-${BENCH}`).click();
  await wait(page, 200);
  await page.screenshot({ path: `${OUT}/02-workout.png` });
  ok('Superset with… groups two exercises (Superset A), shown together; the rest timer of an exercise changes to 1:30');

  // minimize, the mini bar, a reload keeps everything
  await id(page, 'minimize').click();
  await id(page, 'mini-bar').waitFor();
  assert.match(await id(page, 'mini-bar').innerText(), /Workout/);
  await page.reload();
  await id(page, 'mini-bar').waitFor();
  await page.screenshot({ path: `${OUT}/03-mini-bar.png` });
  await id(page, 'mini-bar').click();
  await id(page, 'workout-name').waitFor();
  await wait(page, 300);
  assert.equal(await inputs(page, BENCH, 'w').first().inputValue(), '80');
  assert.equal(await checked(checks(page, BENCH).nth(1)), true);
  assert.equal(await block(page, PULLUP).getByText('Superset A').count(), 1);
  assert.match(await id(page, `rest-tag-${PULLUP}`).innerText(), /(^|\s)1:30$/);
  ok('minimized, the workout waits in a bar above the tabs and survives a reload');

  // reorder by dragging the handle
  await id(page, `ex-menu-${BENCH}`).click();
  await id(page, 'menu-reorder').click();
  await id(page, `grip-${PULLUP}`).waitFor();
  await wait(page, 500);
  const g = await id(page, `grip-${PULLUP}`).boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 - i * 10);
  await page.mouse.up();
  await wait(page, 300);
  const order = await page.locator('[data-testid^="reorder-x-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  await id(page, 'reorder-done').click();
  await wait(page, 500);
  const blocks = await page.locator('[data-testid^="block-x-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  assert.deepEqual(blocks, [`block-${PULLUP}`, `block-${BENCH}`], `reorder rows ${order}`);
  ok('dragging ≡ moves Pull Up above Bench Press');

  // finish early with a typed but unlogged set
  await inputs(page, PULLUP, 'r').first().fill('10');
  await finishEarly(page);
  await id(page, 'save-pending').waitFor();
  assert.match(await page.locator('body').innerText(), /1 set with numbers isn’t checked off/);
  await id(page, 'save-pending').click();
  await id(page, 'summary-title').waitFor();
  const sum = await page.locator('body').innerText();
  await page.screenshot({ path: `${OUT}/04-summary.png` });
  assert.match(await id(page, 'summary-title').innerText(), /^(Morning|Afternoon|Evening|Night) Workout$/, 'titled with the workout name');
  assert.match(sum, /workout #1/);
  assert.match(sum, /SETS\s*\n?\s*4/i, 'three bench sets (the untouched fourth is left out) and the pull-up set');
  // the hero tally: one stroke per saved set, one group per exercise, no record on a first workout
  const groups = await id(page, 'summary-tally').evaluate((el) => [...el.children].map((t) => t.firstElementChild.children.length));
  assert.deepEqual(groups, [1, 3], 'Pull Up 1 set, Bench Press 3');
  assert.equal(await id(page, 'summary-tally').getAttribute('aria-label'), '4 sets · workout #1');
  assert.equal(await page.locator('[data-testid^="pr-"]').count(), 0);
  assert.equal(await id(page, 'tpl-save').count(), 0, 'no template question for an empty workout');
  const saved = (await page.evaluate(() => JSON.parse(localStorage.getItem('increment.data')))).workouts[0];
  assert.deepEqual(saved.exercises.find((e) => e.exerciseId === PULLUP).sets.map((x) => x.r), [10]);
  assert.equal(saved.exercises.find((e) => e.exerciseId === BENCH).sets.length, 3);
  assert.ok(saved.exercises.find((e) => e.exerciseId === BENCH).sets.some((x) => x.w === 80 && x.r === 5));
  ok('Finish early offers to save the typed set; the summary shows its name, 4 sets in two groups of strokes, workout #1');

  await id(page, 'summary-done').click();
  await wait(page, 500);
  assert.equal(await id(page, 'mini-bar').count(), 0, 'no mini bar once finished');
  await id(page, 'tab-progress').click();
  await id(page, 'progress-workouts').click();
  await page.locator('[data-testid^="workout-"]').first().waitFor();
  const first = await page.locator('[data-testid^="workout-"]').first().innerText();
  assert.match(first, /Workout/);
  await page.reload();
  await page.locator('[data-testid^="workout-"]').first().waitFor();
  assert.equal(await page.locator('[data-testid^="workout-"]').count(), 1);
  ok('the workout is in History, also after a reload');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 2. a template workout in German with the history ----------
{
  const { ctx, page, errors, dialogs } = await newPage({ locale: 'de-DE' });
  await id(page, 'open-account').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), id(page, 'restore').click()]);
  await chooser.setFiles(BACKUP);
  for (let i = 0; i < 50 && dialogs.length < 2; i++) await wait(page, 100);
  await page.goBack();
  await id(page, 'tab-plan').click();
  await wait(page, 400);
  await page.locator('[data-testid^="template-"]', { hasText: 'Pull' }).first().click();
  await id(page, 'start-template').click();
  await id(page, 'workout-name').waitFor();
  await wait(page, 400);
  assert.equal(await id(page, 'workout-name').inputValue(), 'Pull');
  const body = await page.locator('body').innerText();
  assert.match(body, /Last set to failure/, 'template notes on top');
  // the warm-up has its own placeholder; working sets show last time (or the template)
  const latW = await inputs(page, LAT, 'w').evaluateAll((els) => els.map((e) => e.placeholder));
  assert.equal(latW.length, 3);
  assert.equal(latW[0], '40');
  assert.equal(await page.locator('[data-testid^="jump-"]').count(), 2, 'the other two exercises are under Up next');
  // the set being logged says what its boxes hold, in German
  const latLive = (await checks(page, LAT).nth(0).getAttribute('data-testid')).replace(/^check-/, '');
  assert.deepEqual([await id(page, `cap-w-${latLive}`).innerText(), await id(page, `cap-r-${latLive}`).innerText()], ['Gewicht', 'Wdh.']);
  await page.screenshot({ path: `${OUT}/05-template-workout-de.png` });
  // the web app's backup has its own "Keep screen on" (on); the app's stays off
  assert.equal(await page.evaluate(() => window.__wakeLocks), 0);
  ok(`a template starts with its sets as ghost values (Lat Pulldown: ${latW.join(' / ')}) under “Gewicht” and “Wdh.”; a web backup doesn’t keep the screen on`);

  // Up next: press and hold a row and drag it to the top
  const SQUAT = 'x-squat-barbell';
  await pick(page, [{ q: 'squat bb', id: SQUAT }]);
  const rows = () => page.locator('[data-testid^="jump-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  assert.equal((await rows()).at(-1), `jump-${SQUAT}`);
  await dragRow(page, `jump-${SQUAT}`, -130);
  assert.equal((await rows())[0], `jump-${SQUAT}`, (await rows()).join(', '));
  const order = (await page.evaluate(() => JSON.parse(localStorage.getItem('increment.data')).kv.active.exercises.map((e) => e.exerciseId)));
  assert.deepEqual(order.slice(0, 2), [LAT, SQUAT]);
  ok('Up next: Squat, added last, is dragged to the top of the list');

  // an exercise with history: last time's sets, the Log button logs them, a record
  await id(page, `jump-${SQUAT}`).click();
  await wait(page, 300);
  const sqLast = await id(page, `last-${SQUAT}`).innerText();
  assert.match(sqLast, /letztes Mal [\d,]+ × \d+/);
  const sqPh = await inputs(page, SQUAT, 'w').first().getAttribute('placeholder');
  assert.ok(sqLast.includes(`letztes Mal ${sqPh} ×`), `${sqPh} vs ${sqLast}`);
  assert.match(await id(page, 'log-set').innerText(), new RegExp(`^${sqPh} × \\d+ eintragen$`));
  await id(page, 'log-set').click();
  await wait(page, 300);
  assert.equal(await checked(checks(page, SQUAT).nth(0)), true);
  assert.equal(await inputs(page, SQUAT, 'w').first().inputValue(), sqPh);
  if ((await checks(page, SQUAT).count()) < 2) { await id(page, `add-set-${SQUAT}`).click(); await wait(page, 200); }
  await inputs(page, SQUAT, 'w').nth(1).fill('250');
  await inputs(page, SQUAT, 'r').nth(1).fill('10');
  await checks(page, SQUAT).nth(1).click();
  await wait(page, 300);
  assert.match(await labels(page, SQUAT).nth(1).innerText(), /Rekord/);
  assert.match(await id(page, 'session-count').innerText(), /1 Rekord/);
  await page.screenshot({ path: `${OUT}/05b-record.png` });
  await id(page, `jump-${LAT}`).click();
  await wait(page, 300);
  await inputs(page, LAT, 'w').nth(1).fill('62,5');
  for (let i = 0; i < 3; i++) await checks(page, LAT).nth(i).click();
  await wait(page, 300);
  assert.doesNotMatch(await labels(page, LAT).nth(1).innerText(), /Rekord/, 'no record without history');
  ok(`Squat shows last time (${sqLast}); "Log" logs it; 250 kg × 10 gets the Record chip`);

  // finish: everything typed is logged, so it just asks
  await finishEarly(page);
  await id(page, 'confirm-finish').waitFor();
  assert.match(await page.locator('body').innerText(), /Training beenden\?/);
  await id(page, 'confirm-finish').click();
  await id(page, 'summary-title').waitFor();
  assert.equal(await id(page, 'summary-title').innerText(), 'Pull');
  // the squat record: its row with the highlighted value, and a signal stroke in the hero tally
  await id(page, `pr-${SQUAT}`).waitFor();
  assert.match(await id(page, `pr-${SQUAT}`).innerText(), /Kniebeuge[\s\S]*250 kg × 10[\s\S]*Gesch\. 1RM/);
  assert.match(await id(page, 'summary-tally').getAttribute('aria-label'), /Rekord/);
  // the template question is a switch row, not a dialog, and nothing changes until it's switched on
  await wait(page, 600);
  assert.equal(await id(page, 'dialog-ok').count() + await page.locator('[data-testid^="tpl-update-"]').count(), 0, 'no dialog');
  const sum = await page.locator('body').innerText();
  await page.screenshot({ path: `${OUT}/06-summary-template-de.png` });
  assert.match(sum, /Änderungen in Pull übernehmen/);
  assert.match(await id(page, 'tpl-changes').innerText(), /^Fügt 1 Übung hinzu\. Entfernt 2 Übungen\. .*Aktualisiert die Werte für 1 Satz\.$/);
  const tplBefore = (await page.evaluate(() => JSON.parse(localStorage.getItem('increment.data')))).templates.find((x) => x.name === 'Pull');
  assert.equal(await id(page, 'tpl-save').locator('input').isChecked(), false);
  ok('the summary shows the workout name, the record and the template question as a switch row (German)');

  // on: the workout's exercises and numbers go into the template, with Undo
  const tplNow = async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('increment.data')))).templates.find((x) => x.id === tplBefore.id);
  await id(page, 'tpl-save').click();
  assert.match(await toastText(page), /Vorlage aktualisiert/);
  assert.equal(await id(page, 'tpl-save').locator('input').isChecked(), true);
  let tpl = await tplNow();
  assert.ok(tpl.exercises.some((e) => e.exerciseId === SQUAT), 'Squat added to the template');
  assert.notDeepEqual(tpl.exercises, tplBefore.exercises);
  await id(page, 'toast-action').click();
  assert.match(await toastText(page), /rückgängig/);
  await wait(page, 200);
  assert.equal(await id(page, 'tpl-save').locator('input').isChecked(), false, 'Undo switches it off');
  assert.deepEqual((await tplNow()).exercises, tplBefore.exercises);
  // on again, then off: the template is back as it was
  await id(page, 'tpl-save').click();
  await wait(page, 300);
  assert.ok((await tplNow()).exercises.some((e) => e.exerciseId === SQUAT));
  await id(page, 'tpl-save').click();
  assert.match(await toastText(page), /rückgängig/);
  assert.deepEqual((await tplNow()).exercises, tplBefore.exercises);
  ok('"Änderungen in Pull übernehmen" saves into the template, Undo and switching off restore it');

  await id(page, 'summary-done').click();
  await wait(page, 500);

  // a running workout is in the way of a new one
  await id(page, 'tab-index').click();
  await id(page, 'start-empty').click();
  await id(page, 'workout-name').waitFor();
  await id(page, 'minimize').click();
  await wait(page, 400);
  // the start card now says "Resume workout"; a template still asks
  assert.equal(await id(page, 'start-empty').count(), 0);
  assert.equal(await id(page, 'resume-workout').count(), 1);
  await id(page, 'tab-plan').click();
  await page.locator('[data-testid^="template-"]', { hasText: 'Pull' }).first().click();
  await id(page, 'start-template').click();
  await id(page, 'resume-running').waitFor();
  assert.match(await page.locator('body').innerText(), /Es läuft schon ein Training/);
  await id(page, 'resume-running').click();
  await id(page, 'workout-name').waitFor();
  ok('starting while a workout runs offers to resume it');

  // nothing logged: Finish offers to discard
  await finishEarly(page);
  await id(page, 'dialog-ok').waitFor();
  assert.match(await page.locator('body').innerText(), /Noch nichts eingetragen/);
  await id(page, 'dialog-ok').click();
  await wait(page, 600);
  assert.equal(await id(page, 'mini-bar').count(), 0);
  ok('Finish with nothing logged discards the workout');

  // do it again from History, then discard with a confirmation
  if (!(await id(page, 'tab-progress').isVisible())) { await page.goBack(); await wait(page, 400); } // back from the template preview
  await id(page, 'tab-progress').click();
  await id(page, 'progress-workouts').click();
  await page.locator('[data-testid^="workout-"]').first().click();
  await id(page, 'do-again').click();
  await id(page, 'workout-name').waitFor();
  assert.equal(await id(page, 'workout-name').inputValue(), 'Pull');
  await inputs(page, LAT, 'r').first().fill('7');
  await id(page, 'discard-workout').click();
  await id(page, 'confirm-discard').waitFor();
  assert.match(await page.locator('body').innerText(), /Die Zahlen, die du eingetippt hast, gehen verloren/);
  await id(page, 'confirm-discard').click();
  await wait(page, 700);
  assert.equal(await id(page, 'mini-bar').count(), 0);
  ok('"Do this workout again" from History; discarding asks first');
  assert.deepEqual(errors, []);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} checks passed`);
