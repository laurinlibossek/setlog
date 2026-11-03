// Logging a workout in the Expo app (web build) on an emulated iPhone:
// empty workout, check-off rules, placeholders, rest timer, set types, undo,
// supersets, minimize and reload, reordering, finishing with unchecked sets,
// a template workout with previous values, records and the template update
// question (German), "already running", and discarding. 17 checks.
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
  assert.equal(await block(page, PULLUP).count(), 1);
  ok('an empty workout starts with the time-of-day name; exercises are added from the picker');

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
  ok('a set needs reps and weight; checking it off starts the 2:00 rest timer');

  // placeholders from the row above, check-off fills them in
  await id(page, `add-set-${BENCH}`).click();
  await wait(page, 200);
  assert.equal(await inputs(page, BENCH, 'w').nth(1).getAttribute('placeholder'), '80');
  assert.equal(await inputs(page, BENCH, 'r').nth(1).getAttribute('placeholder'), '5');
  await checks(page, BENCH).nth(1).click();
  await wait(page, 200);
  assert.equal(await inputs(page, BENCH, 'w').nth(1).inputValue(), '80');
  assert.equal(await checked(checks(page, BENCH).nth(1)), true);
  assert.equal(await block(page, BENCH).getByText('2/2').count(), 1);
  ok('a new set shows the row above as grey placeholders; checking it off saves them');

  // rest panel
  await id(page, 'rest-pill').click();
  await id(page, 'rest-panel').waitFor();
  const before = await id(page, 'rest-big').innerText();
  await id(page, 'rest-plus').click();
  await wait(page, 300);
  const after = await id(page, 'rest-big').innerText();
  const sec = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  assert.ok(sec(after) - sec(before) >= 13, `${before} → ${after}`);
  await page.screenshot({ path: `${OUT}/01-rest-panel.png` });
  await id(page, 'rest-skip').click();
  await wait(page, 300);
  assert.equal(await id(page, 'rest-panel').count(), 0);
  assert.equal(await id(page, 'rest-left').count(), 0);
  ok('the rest panel adds 15 s and skips the rest');

  // set types and RPE, delete with undo
  await id(page, `add-set-${BENCH}`).click();
  await wait(page, 200);
  await labels(page, BENCH).nth(2).click();
  await id(page, 'type-drop').click();
  await wait(page, 200);
  assert.equal((await labels(page, BENCH).nth(2).innerText()).trim(), 'D');
  await labels(page, BENCH).nth(1).click();
  await id(page, 'set-rpe').click();
  await id(page, 'rpe-8.5').click();
  await wait(page, 200);
  assert.match(await labels(page, BENCH).nth(1).innerText(), /@8\.5/);
  await labels(page, BENCH).nth(2).click();
  await id(page, 'set-delete').click();
  await wait(page, 200);
  assert.equal(await checks(page, BENCH).count(), 2);
  assert.equal(await toastText(page), 'Set deleted\nUndo');
  await id(page, 'toast-action').click();
  await wait(page, 200);
  assert.equal(await checks(page, BENCH).count(), 3);
  assert.equal((await labels(page, BENCH).nth(2).innerText()).trim(), 'D');
  ok('set menu: drop set, RPE 8.5, delete and undo');

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
  await page.screenshot({ path: `${OUT}/02-workout.png` });
  ok('Superset with… groups two exercises (Superset A); the rest timer of an exercise changes to 1:30');

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

  // finish with a typed but unchecked set
  await inputs(page, PULLUP, 'r').first().fill('10');
  await id(page, 'finish-workout').click();
  await id(page, 'save-pending').waitFor();
  assert.match(await page.locator('body').innerText(), /1 set with numbers isn’t checked off/);
  await id(page, 'save-pending').click();
  await id(page, 'summary-title').waitFor();
  const sum = await page.locator('body').innerText();
  await page.screenshot({ path: `${OUT}/04-summary.png` });
  assert.match(sum, /Workout saved/);
  assert.match(sum, /workout #1/);
  assert.match(sum, /SETS\s*\n?\s*3/i, 'two bench sets (the empty drop set is dropped) and the pull-up set');
  assert.match(sum, /Pull Up[\s\S]*10 reps/);
  assert.match(sum, /Bench Press \(Barbell\)[\s\S]*80 kg × 5/);
  ok('Finish offers to save the typed set; the summary shows 3 sets, workout #1');

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
  const prev = await block(page, LAT).locator('[data-testid^="prev-"]').allInnerTexts();
  await page.screenshot({ path: `${OUT}/05-template-workout-de.png` });
  ok(`a template starts with its sets as placeholders (Lat Pulldown: ${latW.join(' / ')}; previous: ${prev.join(' / ')})`);

  // an exercise with history: last time's sets, "Previous" copies, a record
  const SQUAT = 'x-squat-barbell';
  await pick(page, [{ q: 'squat bb', id: SQUAT }]);
  const sqPrev = await block(page, SQUAT).locator('[data-testid^="prev-"]').allInnerTexts();
  assert.ok(sqPrev.length >= 1 && sqPrev.every((p) => /× \d+/.test(p)), sqPrev.join(' / '));
  const sqPh = await inputs(page, SQUAT, 'w').first().getAttribute('placeholder');
  assert.ok(sqPrev[0].startsWith(sqPh), `${sqPh} vs ${sqPrev[0]}`);
  await block(page, SQUAT).locator('[data-testid^="prev-"]').first().click();
  await wait(page, 200);
  assert.equal(await inputs(page, SQUAT, 'w').first().inputValue(), sqPh);
  if (sqPrev.length < 2) { await id(page, `add-set-${SQUAT}`).click(); await wait(page, 200); }
  await inputs(page, SQUAT, 'w').nth(1).fill('250');
  await inputs(page, SQUAT, 'r').nth(1).fill('10');
  await checks(page, SQUAT).nth(0).click();
  await checks(page, SQUAT).nth(1).click();
  await inputs(page, LAT, 'w').nth(1).fill('62,5');
  for (let i = 0; i < 3; i++) await checks(page, LAT).nth(i).click();
  await wait(page, 300);
  assert.match(await labels(page, SQUAT).nth(1).innerText(), /PR/);
  assert.doesNotMatch(await labels(page, LAT).nth(1).innerText(), /PR/, 'no record without history');
  await page.screenshot({ path: `${OUT}/05b-record.png` });
  ok(`Squat shows last time (${sqPrev.join(' / ')}); "Previous" copies it; 250 kg × 10 gets a PR badge`);

  // finish: everything typed is checked, so it just asks
  await id(page, 'finish-workout').click();
  await id(page, 'confirm-finish').waitFor();
  assert.match(await page.locator('body').innerText(), /Training beenden\?/);
  await id(page, 'confirm-finish').click();
  await id(page, 'summary-title').waitFor();
  assert.equal(await id(page, 'summary-title').innerText(), 'Neue Rekorde!');
  await id(page, 'tpl-update-values').waitFor({ timeout: 5000 });
  const dlg = await page.locator('body').innerText();
  await page.screenshot({ path: `${OUT}/06-summary-update-de.png` });
  assert.match(dlg, /Vorlage aktualisieren/);
  assert.match(dlg, /Du hast „Pull“ in diesem Training verändert/);
  assert.match(dlg, /Entfernt 2 Übungen\./);
  assert.match(dlg, /Aktualisiert die Werte von 1 Satz\./);
  ok('the summary shows new records, then asks to update the template (German)');

  await id(page, 'tpl-update-values').click();
  assert.match(await toastText(page), /Werte der Vorlage aktualisiert/);
  await id(page, 'toast-action').click();
  assert.match(await toastText(page), /rückgängig/);
  ok('"Update values only" with Undo');

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
  await id(page, 'finish-workout').click();
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
