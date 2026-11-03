// The Expo app (web build) on an emulated iPhone, everything added on
// 19 Oct 2026 (in the tabs of 3 Nov 2026: Plan, Progress, Search, Account):
// the template editor and template menus, folders, shared
// templates, Edit workout, focus metric, plate calculator, start time, new
// exercises, Measure logging, charts, backups and the new settings. 22 checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { devices, launch, grantWakeLock, APP as BASE, BACKUP, shots } from './env.mjs';
import * as core from '../../setlog/js/core/index.js';

const OUT = shots('app-editing');
const BENCH = 'x-bench-press-barbell', SQUAT = 'x-squat-barbell', PULLUP = 'x-pull-up', LAT = 'x-lat-pulldown-cable';
const browser = await launch();
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };

async function newPage({ locale = 'en-US', scheme = 'light' } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale, colorScheme: scheme, acceptDownloads: true });
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
const toastText = async (page) => { await id(page, 'toast').waitFor(); return id(page, 'toast').innerText(); };
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const visibleText = (page) => page.locator('body').innerText();
async function pickExercises(page, names, testid = 'add-exercises') {
  await id(page, testid).click();
  await id(page, 'pick-search').waitFor();
  for (const n of names) {
    await id(page, 'pick-search').fill(n.q);
    await wait(page, 200);
    await id(page, `pick-${n.id}`).click();
  }
  await id(page, 'pick-add').click();
  await wait(page, 600);
}
/** Account: the avatar on Today. */
async function openAccount(page) {
  await id(page, 'tab-index').click();
  await id(page, 'open-account').click();
}
async function restore(page, dialogs, { english = false } = {}) {
  await openAccount(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), id(page, 'restore').click()]);
  await chooser.setFiles(BACKUP);
  for (let i = 0; i < 50 && dialogs.length < 2; i++) await wait(page, 100);
  if (english) await id(page, 'language-en').click(); // the backup is German
  await page.goBack();
  await wait(page, 300);
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('increment.data')));

// ---------- 1. templates: editor, menus, folders, shared links ----------
{
  const { ctx, page, errors } = await newPage();
  await id(page, 'tab-plan').click();
  await id(page, 'plan-add').click();
  await id(page, 'new-template').click();
  await id(page, 'tpl-name').waitFor();
  await id(page, 'template-save').click();
  assert.equal(await toastText(page), 'Give the template a name');
  await id(page, 'tpl-name').fill('Upper A');
  await id(page, 'tpl-folder').fill('Upper / Lower');
  await id(page, 'template-save').click();
  await wait(page, 200);
  assert.match(await toastText(page), /Add at least one exercise/);
  await pickExercises(page, [{ q: 'bench bb', id: BENCH }, { q: 'pull up', id: PULLUP }]);
  assert.equal(await inputs(page, BENCH, 'w').count(), 3, 'templates start with at least 3 sets');
  assert.equal(await checks(page, BENCH).count(), 0, 'no check-off in the template editor');
  await inputs(page, BENCH, 'w').first().fill('80');
  await inputs(page, BENCH, 'r').first().fill('8');
  // the rest timer of an exercise waits for Save
  await id(page, `ex-menu-${BENCH}`).click();
  await id(page, 'menu-rest').click();
  await id(page, 'rest-90').click();
  await wait(page, 200);
  assert.equal((await store(page)).exercises.find((e) => e.id === BENCH).restSec, undefined, 'not saved yet');
  await page.screenshot({ path: `${OUT}/01-template-editor.png` });
  await id(page, 'template-save').click();
  await wait(page, 600);
  assert.match(await toastText(page), /“Upper A” created/);
  let data = await store(page);
  const t = data.templates.find((x) => x.name === 'Upper A');
  assert.equal(t.folder, 'Upper / Lower');
  assert.deepEqual(t.exercises[0].sets[0], { type: 'normal', w: 80, r: 8 });
  assert.equal(t.exercises[0].sets.length, 3);
  assert.equal(data.exercises.find((e) => e.id === BENCH).restSec, 90, 'saved with the template');
  assert.equal(await id(page, `template-${t.id}`).count(), 1);
  ok('+ Template: name and folder, exercises with targets; Save checks the name and exercises; the rest timer is saved with it');

  // edit it: Cancel with changes asks first
  await id(page, `template-menu-${t.id}`).click();
  await id(page, 'tpl-menu-edit').click();
  await id(page, 'tpl-name').waitFor();
  assert.equal(await id(page, 'tpl-name').inputValue(), 'Upper A');
  assert.equal(await inputs(page, BENCH, 'w').first().inputValue(), '80');
  await inputs(page, BENCH, 'w').nth(1).fill('85');
  await id(page, 'tpl-cancel').click();
  await id(page, 'confirm-discard-changes').waitFor();
  assert.match(await visibleText(page), /Discard changes\?/);
  await id(page, 'dialog-cancel').click();
  await wait(page, 200);
  assert.equal(await id(page, 'tpl-name').isVisible(), true, 'Keep editing stays');
  await id(page, 'template-save').click();
  await wait(page, 600);
  assert.match(await toastText(page), /Template saved/);
  data = await store(page);
  assert.equal(data.templates.find((x) => x.id === t.id).exercises[0].sets[1].w, 85);
  ok('Edit template opens it with its values; Cancel with changes asks; Save keeps the new target');

  // rename, duplicate, archive with undo, move to a new folder, delete with undo
  await id(page, `template-menu-${t.id}`).click();
  await id(page, 'tpl-menu-rename').click();
  await id(page, 'prompt-input').fill('Upper A1');
  await id(page, 'prompt-ok').click();
  await wait(page, 300);
  await id(page, `template-menu-${t.id}`).click();
  await id(page, 'tpl-menu-dup').click();
  await wait(page, 300);
  assert.match(await toastText(page), /Template duplicated/);
  data = await store(page);
  assert.ok(data.templates.some((x) => x.name === 'Upper A1 (copy)'));
  await id(page, `template-menu-${t.id}`).click();
  await id(page, 'tpl-menu-archive').click();
  await wait(page, 300);
  assert.match(await toastText(page), /archived/);
  assert.match(await id(page, 'archived-head').innerText(), /Archived/);
  await id(page, 'toast-action').click();
  await wait(page, 300);
  assert.equal(await id(page, 'archived-head').count(), 0);
  await id(page, `template-menu-${t.id}`).click();
  await id(page, 'tpl-menu-folder').click();
  await id(page, 'folder-new').click();
  await id(page, 'prompt-input').fill('Push / Pull');
  await id(page, 'prompt-ok').click();
  await wait(page, 300);
  assert.equal((await store(page)).templates.find((x) => x.id === t.id).folder, 'Push / Pull');
  assert.equal(await id(page, 'folder-menu-Push / Pull').count(), 1);
  await id(page, `template-menu-${t.id}`).click();
  await id(page, 'tpl-menu-delete').click();
  await id(page, 'confirm-delete').click();
  await wait(page, 300);
  assert.match(await toastText(page), /Template deleted/);
  assert.equal(await id(page, `template-${t.id}`).count(), 0);
  await id(page, 'toast-action').click();
  await wait(page, 300);
  assert.equal(await id(page, `template-${t.id}`).count(), 1);
  await page.screenshot({ path: `${OUT}/02-templates.png`, fullPage: true });
  ok('template ⋯: rename, duplicate, archive with undo, move to a new folder, delete with undo');

  // folder menu: remove the folder (the template moves out)
  await id(page, 'folder-menu-Push / Pull').click();
  await id(page, 'folder-remove').click();
  await id(page, 'dialog-ok').click();
  await wait(page, 300);
  assert.equal((await store(page)).templates.find((x) => x.id === t.id).folder, '');
  ok('Remove folder moves its template to My templates');

  // a shared template link (made the way the web app makes them)
  const shared = { name: 'Arms', notes: 'Superset everything', exercises: [
    { exerciseId: 'x-bicep-curl-dumbbell', supersetId: 'a', restSec: 60, sets: [{ type: 'normal', w: 14, r: 12 }] },
    { exerciseId: 'x-triceps-pushdown-cable', supersetId: 'a', sets: [{ type: 'normal', w: 30, r: 12 }] },
    { exerciseId: 'c-zottman-curl', sets: [{ type: 'normal', w: 10, r: 10 }] },
  ] };
  const lib = new Map(core.SEED_EXERCISES.map((e) => [e.id, e]));
  lib.set('c-zottman-curl', { id: 'c-zottman-curl', name: 'Zottman Curl', category: 'dumbbell', bodyPart: 'arms' });
  const link = `https://laurinlibossek.github.io/setlog/#template=${core.encodeTemplate(shared, lib)}`;
  await id(page, 'templates-menu').click();
  await id(page, 'add-shared').click();
  await id(page, 'prompt-input').fill('not a link');
  await id(page, 'prompt-ok').click();
  assert.match(await toastText(page), /doesn’t look like a Setlog template link/);
  await id(page, 'templates-menu').click();
  await id(page, 'add-shared').click();
  await id(page, 'prompt-input').fill(link);
  await id(page, 'prompt-ok').click();
  await id(page, 'confirm-add-shared').waitFor();
  assert.match(await visibleText(page), /These exercises are new to you and will be created: Zottman Curl/);
  await id(page, 'confirm-add-shared').click();
  await wait(page, 400);
  data = await store(page);
  const arms = data.templates.find((x) => x.name === 'Arms');
  assert.ok(arms && arms.exercises.length === 3 && arms.exercises[0].supersetId && arms.exercises[0].supersetId === arms.exercises[1].supersetId);
  assert.ok(data.exercises.some((e) => e.name === 'Zottman Curl'));
  ok('Templates ⋯ → Add shared template reads a web app link, creates missing exercises and keeps the superset');

  // examples: add one to my templates, hide them with undo
  const ex = core.EXAMPLE_TEMPLATES[0];
  await id(page, `template-${ex.id}`).click();
  await id(page, 'add-example').click();
  await wait(page, 600);
  assert.match(await toastText(page), /added to your templates/);
  assert.equal(await id(page, 'template-options').count(), 1, 'now the preview of my copy');
  await page.goBack();
  await wait(page, 300);
  await id(page, 'hide-examples').click();
  assert.match(await toastText(page), /Examples hidden/);
  assert.equal(await id(page, `template-${ex.id}`).count(), 0);
  ok('an example becomes my template; examples hide with undo');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 2. a workout: focus metric, plates, start time, new exercise ----------
{
  const { ctx, page, errors, dialogs } = await newPage();
  await restore(page, dialogs, { english: true });
  await id(page, 'tab-index').click();
  await id(page, 'start-empty').click();
  await id(page, 'workout-name').waitFor();
  await pickExercises(page, [{ q: 'squat bb', id: SQUAT }]);

  // focus metric: total volume from the placeholders, then as typed
  await id(page, `focus-${SQUAT}`).click();
  await id(page, 'focus-volume').waitFor();
  assert.match(await visibleText(page), /Set a focus metric/);
  await id(page, 'focus-volume').click();
  await wait(page, 200);
  const v1 = await id(page, `focus-${SQUAT}`).innerText();
  assert.match(v1, /kg/);
  await inputs(page, SQUAT, 'w').nth(1).fill('200');
  await wait(page, 200);
  const v2 = await id(page, `focus-${SQUAT}`).innerText();
  assert.notEqual(v1, v2, `${v1} → ${v2}`);
  await page.screenshot({ path: `${OUT}/03-focus.png` });
  await id(page, `focus-${SQUAT}`).click();
  await id(page, 'focus-volume').click();
  await wait(page, 200);
  assert.doesNotMatch(await id(page, `focus-${SQUAT}`).innerText(), /kg/);
  ok(`focus metric: total volume follows the sets (${v1.trim()} → ${v2.trim()}); tapping it again turns it off`);

  // plate calculator from the exercise menu, with the first working set's weight
  await inputs(page, SQUAT, 'w').nth(0).fill('102,5');
  await id(page, `ex-menu-${SQUAT}`).click();
  await id(page, 'menu-plates').click();
  await id(page, 'plate-target').waitFor();
  assert.equal(await id(page, 'plate-target').inputValue(), '102.5');
  assert.equal(await id(page, 'plate-list').innerText().then((s) => s.replace(/\s+/g, ' ').trim()), '25 15 1.25');
  assert.match(await visibleText(page), /Loaded: 102.5 kg/);
  await page.screenshot({ path: `${OUT}/04-plates.png` });
  await id(page, 'tools-tabs').getByText('1RM calculator').click();
  await id(page, 'rm-w').fill('100');
  await id(page, 'rm-r').fill('5');
  await wait(page, 200);
  assert.match(await visibleText(page), /116.7 kg/);
  await id(page, 'tools-done').click();
  await wait(page, 500);
  ok('Plate calculator opens with the set’s weight (102.5 kg = 25 + 15 + 1.25 a side); 1RM of 100 × 5 is 116.7 kg (Epley)');

  // start time: earlier works, the future is refused
  const before = await id(page, 'started-at').innerText();
  await id(page, 'start-time').click();
  await id(page, 'datetime-dialog').waitFor();
  const h = Number(await id(page, 'time-h').inputValue());
  await id(page, 'time-h').fill(String((h + 23) % 24).padStart(2, '0'));
  if (h === 0) await id(page, 'day-prev').click();
  await page.screenshot({ path: `${OUT}/05-start-time.png` });
  await id(page, 'datetime-ok').click();
  await wait(page, 300);
  const after = await id(page, 'started-at').innerText();
  assert.notEqual(before, after);
  await id(page, 'workout-menu').click();
  await id(page, 'menu-start-time').click();
  await id(page, 'datetime-dialog').waitFor();
  await id(page, 'time-h').fill('23');
  await id(page, 'time-m').fill('59');
  await id(page, 'day-next').click();
  await id(page, 'datetime-ok').click();
  await id(page, 'datetime-error').waitFor();
  assert.match(await id(page, 'datetime-error').innerText(), /has to be in the past/);
  await id(page, 'dialog-cancel').click();
  ok(`Change start time moves the start an hour earlier (${before} → ${after}) and refuses a time in the future`);

  // a new exercise from the picker
  await id(page, 'add-exercises').click();
  await id(page, 'pick-search').fill('Zercher Squat');
  await wait(page, 200);
  await id(page, 'pick-create').click();
  await id(page, 'exercise-name').waitFor();
  assert.equal(await id(page, 'exercise-name').inputValue(), 'Zercher Squat');
  await id(page, 'cat-barbell').click();
  await id(page, 'part-legs').click();
  await page.screenshot({ path: `${OUT}/06-new-exercise.png` });
  await id(page, 'exercise-save').click();
  await wait(page, 500);
  assert.match(await id(page, 'pick-add').innerText(), /Add 1/);
  await id(page, 'pick-add').click();
  await wait(page, 500);
  // it waits under Up next; tapping its row brings it up
  await id(page, 'jump-c-zercher-squat').click();
  await wait(page, 300);
  assert.equal(await block(page, 'c-zercher-squat').count(), 1);
  ok('the picker creates “Zercher Squat” (barbell, legs) and adds it to the workout');

  // finish (Squat and Zercher get a set each), then the exercise page
  await inputs(page, 'c-zercher-squat', 'w').first().fill('60');
  await inputs(page, 'c-zercher-squat', 'r').first().fill('8');
  await checks(page, 'c-zercher-squat').first().click();
  await id(page, 'workout-menu').click();
  await id(page, 'menu-finish').click();
  await id(page, 'drop-pending').click();
  await id(page, 'summary-done').click();
  await wait(page, 500);
  await id(page, 'tab-search').click();
  await id(page, 'exercise-search').fill('zercher');
  await id(page, 'exercise-c-zercher-squat').click();
  await id(page, 'exercise-options').waitFor();
  await id(page, 'exercise-options').click();
  await id(page, 'ex-delete').click();
  await wait(page, 200);
  assert.match(await visibleText(page), /This exercise has history/);
  await id(page, 'dialog-cancel').click();
  ok('an exercise with history can’t be deleted (only hidden)');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 3. Edit workout, Save as template, delete with undo ----------
{
  const { ctx, page, errors, dialogs } = await newPage({ locale: 'de-DE' });
  await restore(page, dialogs);
  await id(page, 'tab-progress').click();
  await id(page, 'progress-workouts').click();
  await page.locator('[data-testid^="workout-"]').first().click();
  await id(page, 'workout-options').waitFor();
  const wid = decodeURIComponent(page.url().split('/workout/')[1]);
  let w = (await store(page)).workouts.find((x) => x.id === wid);
  const firstEx = w.exercises[0];
  const firstWeighted = w.exercises.find((e) => e.sets.some((s) => s.w > 0));
  await id(page, 'workout-options').click();
  await id(page, 'wo-menu-edit').click();
  await id(page, 'edit-save').waitFor();
  assert.equal(await id(page, 'edit-name').inputValue(), w.name);
  assert.equal(await page.locator('[data-testid^="check-"]').count(), 0, 'no check-off when editing');
  await id(page, 'edit-name').fill('Montag schwer');
  await id(page, 'edit-duration').fill('75');
  await inputs(page, firstWeighted.exerciseId, 'w').first().fill('77,5');
  await page.screenshot({ path: `${OUT}/07-edit-workout-de.png` });
  // the start time
  await id(page, 'edit-start').click();
  await id(page, 'datetime-dialog').waitFor();
  await id(page, 'time-h').fill('07');
  await id(page, 'time-m').fill('15');
  await id(page, 'datetime-ok').click();
  await wait(page, 200);
  await id(page, 'edit-save').click();
  await wait(page, 600);
  assert.match(await toastText(page), /Training gespeichert/);
  w = (await store(page)).workouts.find((x) => x.id === wid);
  assert.equal(w.name, 'Montag schwer');
  assert.equal(new Date(w.startedAt).getHours(), 7);
  assert.equal(new Date(w.startedAt).getMinutes(), 15);
  assert.equal(w.endedAt - w.startedAt, 75 * 60000);
  assert.equal(w.exercises.find((e) => e.id === firstWeighted.id).sets[0].w, 77.5);
  assert.match(await visibleText(page), /Montag schwer/);
  ok('Edit workout (German): name, start 07:15, 75 minutes and a weight are saved');

  // leaving with unsaved changes asks
  await id(page, 'workout-options').click();
  await id(page, 'wo-menu-edit').click();
  await id(page, 'edit-name').fill('Nope');
  await id(page, 'edit-cancel').click();
  await id(page, 'confirm-discard-changes').waitFor();
  await id(page, 'confirm-discard-changes').click();
  await wait(page, 500);
  assert.equal((await store(page)).workouts.find((x) => x.id === wid).name, 'Montag schwer');
  ok('Cancel with changes asks “Änderungen verwerfen?” and keeps the saved workout');

  // save as template: the editor opens with its exercises, without its notes
  await id(page, 'workout-options').click();
  await id(page, 'wo-menu-template').click();
  await id(page, 'tpl-name').waitFor();
  assert.equal(await id(page, 'tpl-name').inputValue(), 'Montag schwer');
  assert.equal(await block(page, firstEx.exerciseId).count(), 1);
  await id(page, 'template-save').click();
  await wait(page, 600);
  assert.ok((await store(page)).templates.some((x) => x.name === 'Montag schwer'));
  ok('Als Vorlage speichern opens the editor filled from the workout and saves it');

  // delete with undo
  await id(page, 'workout-options').click();
  await id(page, 'wo-menu-delete').click();
  await id(page, 'confirm-delete').click();
  await wait(page, 600);
  assert.match(await toastText(page), /Training gelöscht/);
  assert.equal((await store(page)).workouts.some((x) => x.id === wid), false);
  await id(page, 'toast-action').click();
  await wait(page, 300);
  assert.equal((await store(page)).workouts.some((x) => x.id === wid), true);
  ok('Training löschen goes back to History, with undo');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 4. charts, Measure, Profile, backups, settings ----------
for (const scheme of ['light', 'dark']) {
  const { ctx, page, errors, dialogs } = await newPage({ scheme });
  await restore(page, dialogs, { english: true });
  if (scheme === 'light') {
    // the backup brings Intense Red; the light run uses the plain light theme
    await openAccount(page);
    await id(page, 'theme-system').click();
    await page.goBack();
  }
  // exercise charts
  await id(page, 'tab-search').click();
  await id(page, 'exercise-search').fill('squat bb');
  await id(page, `exercise-${SQUAT}`).click();
  await id(page, 'exercise-chart').waitFor();
  await wait(page, 400);
  // the hero number (estimated 1RM of the last session), one line, a signal dot per record
  assert.match(await id(page, 'exercise-hero').innerText(), /^[\d.,]+\s*kg$/);
  assert.match(await id(page, 'exercise-metric').innerText(), /Estimated 1RM, best of last session/);
  const paths = await id(page, 'exercise-chart').locator('svg path').count();
  const dots = await id(page, 'exercise-chart').locator('svg circle').count();
  assert.ok(paths === 1 && dots >= 1, `paths ${paths}, record dots ${dots}`);
  const box = await id(page, 'exercise-chart').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await id(page, 'chart-tip').waitFor();
  assert.match(await id(page, 'chart-tip').innerText(), /kg/);
  await page.screenshot({ path: `${OUT}/08-exercise-chart-${scheme}.png` });
  // the range control; All shows every session since "Start history from"
  const data = await store(page);
  const squats = data.workouts.filter((w) => w.exercises.some((e) => e.exerciseId === SQUAT)).sort((a, b) => b.startedAt - a.startedAt);
  await id(page, 'exercise-range-0').click();
  await wait(page, 200);
  assert.equal(await id(page, 'exercise-range-0').getAttribute('aria-checked'), 'true');
  const entries = squats.reduce((n, w) => n + w.exercises.filter((e) => e.exerciseId === SQUAT).length, 0);
  assert.equal(await id(page, 'exercise-sessions').innerText(), `Sessions\n${entries}`);
  // rep maxes: fewer reps never show a lighter weight than more reps
  const maxes = await page.locator('[data-testid^="repmax-"]').evaluateAll((els) => els.map((e) => [Number(e.dataset.testid.slice(7)), e.innerText]));
  assert.ok(maxes.length >= 1);
  const kgOf = (t) => Number(t.match(/([\d.]+)\s*kg/)[1]);
  for (let i = 1; i < maxes.length; i++) assert.ok(maxes[i][0] > maxes[i - 1][0] && kgOf(maxes[i][1]) <= kgOf(maxes[i - 1][1]), JSON.stringify(maxes));
  // History: the latest sessions, each opens its workout
  assert.equal(await page.locator('[data-testid^="ex-session-"]').count(), Math.min(10, entries));
  assert.equal(await page.locator('[data-testid^="ex-session-"]').first().getAttribute('data-testid'), `ex-session-${squats[0].id}`);
  // the hero's label picks another metric
  await id(page, 'exercise-metric').click();
  await id(page, 'metric-totalReps').click();
  await wait(page, 300);
  assert.match(await id(page, 'exercise-metric').innerText(), /Total reps, last session/);
  assert.match(await id(page, 'exercise-hero').innerText(), /^\d+\s*reps$/);
  ok(`exercise page: est. 1RM with its chart, record dots and a tooltip, range, rep maxes, history, other metrics (${scheme})`);

  // Measure: log body weight, chart, delete with undo
  await page.goBack();
  await wait(page, 300);
  await id(page, 'tab-progress').click();
  await id(page, 'progress-body').click();
  await id(page, 'log-bodyweight').click();
  await id(page, 'number-dialog').waitFor();
  assert.equal(await id(page, 'number-input').getAttribute('placeholder'), '82.4');
  await id(page, 'number-input').fill('81.9');
  await page.screenshot({ path: `${OUT}/09-log-bodyweight-${scheme}.png` });
  await id(page, 'number-ok').click();
  await wait(page, 300);
  assert.match(await toastText(page), /Body weight logged/);
  assert.match(await id(page, 'measure-bodyweight').innerText(), /81.9 kg/);
  await id(page, 'measure-bodyweight').click();
  await id(page, 'measure-chart').waitFor();
  await id(page, 'measure-chart').locator('svg path').first().waitFor();
  await page.screenshot({ path: `${OUT}/10-measure-${scheme}.png` });
  await id(page, 'entry-0').click();
  await id(page, 'measure-delete').click();
  await wait(page, 300);
  assert.match(await toastText(page), /Entry deleted/);
  await id(page, 'toast-action').click();
  await wait(page, 300);
  assert.equal((await store(page)).measurements.filter((m) => m.type === 'bodyweight').length, 3);
  ok(`Body: log body weight (placeholder = last value), chart, delete with undo (${scheme})`);
  await page.goBack();
  await wait(page, 300);
  await page.goBack();
  await wait(page, 300);

  // Progress: weekly chart, backup reminder → download
  await id(page, 'tab-progress').click();
  await id(page, 'weekly-chart').locator('svg').waitFor();
  assert.equal(await id(page, 'backup-banner').count(), 0, 'a restored backup counts as a backup');
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('increment.data'));
    d.kv.meta.lastBackupAt = Date.now() - 20 * 86400000;
    localStorage.setItem('increment.data', JSON.stringify(d));
  });
  await page.reload();
  await id(page, 'tab-progress').click();
  await id(page, 'backup-banner').waitFor();
  await page.screenshot({ path: `${OUT}/11-progress-${scheme}.png`, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), id(page, 'backup-banner').getByText('Back up now').click()]);
  assert.match(dl.suggestedFilename(), /^setlog-backup-\d{4}-\d\d-\d\d\.json$/);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  const parsed = core.parseBackup(text);
  assert.equal(parsed.data.workouts.length, 86);
  await wait(page, 300);
  assert.equal(await id(page, 'backup-banner').count(), 0);
  ok(`Progress: workouts-per-week chart; the backup reminder downloads a backup the web app can read (86 workouts) (${scheme})`);

  if (scheme === 'light') {
    // settings: CSV export, rest alerts, unit switch converts a running workout
    await openAccount(page);
    const [csv] = await Promise.all([page.waitForEvent('download'), id(page, 'export-csv').click()]);
    assert.match(csv.suggestedFilename(), /^setlog-workouts-.*\.csv$/);
    assert.match(fs.readFileSync(await csv.path(), 'utf8').split('\n')[0], /^Date,Workout Name,Duration,Exercise Name/);
    await id(page, 'set-rest-alert').click();
    await wait(page, 200);
    assert.equal((await store(page)).kv.settings.restAlert, false);
    await id(page, 'set-rest-alert').click();
    await page.screenshot({ path: `${OUT}/12-settings.png`, fullPage: true });
    await page.goBack();
    await id(page, 'tab-index').click();
    await id(page, 'start-empty').click();
    await id(page, 'workout-name').waitFor();
    await pickExercises(page, [{ q: 'bench bb', id: BENCH }]);
    await inputs(page, BENCH, 'w').first().fill('100');
    await id(page, 'minimize').click();
    await openAccount(page);
    await id(page, 'set-unit').getByText('lb').click();
    await wait(page, 300);
    const s2 = await store(page);
    assert.deepEqual([s2.kv.settings.unit, s2.kv.settings.bar, s2.kv.settings.plates[0]], ['lb', 45, 45], 'lb plates and bar');
    await page.goBack();
    await id(page, 'mini-bar').click();
    await id(page, 'workout-name').waitFor();
    assert.equal(await inputs(page, BENCH, 'w').first().inputValue(), '220.5');
    ok('Settings: CSV export, rest timer alerts switch; switching to lb converts the typed 100 kg to 220.5 lb and swaps plates and bar');
  }
  assert.deepEqual(errors, []);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} checks passed`);
