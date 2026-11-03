// The Expo app (web build) on an emulated iPhone: the web app features that
// came to the app on 2 Nov 2026. The History calendar, merging exercises, the
// warm-up scheme editor, the name row, Delete all data, and opening a template
// link directly (the web build reads it from the page address, the phone
// through +native-intent.tsx), and the German exercise names.
import assert from 'node:assert/strict';
import { devices, launch, grantWakeLock, APP as BASE, BACKUP, shots } from './env.mjs';
import * as core from '../../setlog/js/core/index.js';

const OUT = shots('app-parity');
const SNATCH = 'x-snatch-barbell', HANG = 'c-hang-snatch-barbell', AEROBICS = 'c-aerobics', BENCH = 'x-bench-press-barbell';
const browser = await launch();
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };

async function newPage({ locale = 'en-US', scheme = 'light', path = '' } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale, colorScheme: scheme });
  await ctx.addInitScript(grantWakeLock);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools/.test(m.text())) errors.push(m.text()); });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  await page.goto(BASE + path);
  await page.getByTestId('start-empty').waitFor();
  return { ctx, page, errors, dialogs };
}
const id = (page, t) => page.getByTestId(t);
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const toastText = async (page) => { await id(page, 'toast').waitFor(); return id(page, 'toast').innerText(); };
const visibleText = (page) => page.locator('body').innerText();
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('increment.data')));
async function restore(page, dialogs) {
  await id(page, 'tab-index').click();
  await id(page, 'open-account').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), id(page, 'restore').click()]);
  await chooser.setFiles(BACKUP);
  for (let i = 0; i < 50 && dialogs.length < 2; i++) await wait(page, 100);
  await id(page, 'language-en').click(); // the backup is German
  await page.goBack();
  await wait(page, 300);
}
/** Account (the avatar on Today) has the settings. */
async function openSettings(page) {
  await id(page, 'tab-index').click();
  await id(page, 'open-account').click();
  await id(page, 'set-name').waitFor();
}
async function openWorkouts(page) {
  await id(page, 'tab-progress').click();
  await id(page, 'progress-workouts').click();
}
async function openExercise(page, exId, q) {
  await id(page, 'tab-search').click();
  await id(page, 'exercise-search').fill(q);
  await id(page, `exercise-${exId}`).click();
  await id(page, 'exercise-options').waitFor();
}
const monthsBetween = (a, b) => (new Date(b).getFullYear() - new Date(a).getFullYear()) * 12 + new Date(b).getMonth() - new Date(a).getMonth();
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

// ---------- 1. History calendar ----------
for (const scheme of ['light', 'dark']) {
  const { ctx, page, errors, dialogs } = await newPage({ scheme });
  await restore(page, dialogs);
  await openWorkouts(page);
  await id(page, 'history-view').click();
  await id(page, 'cal-month').waitFor();
  const now = new Date();
  assert.equal(await id(page, 'cal-month').innerText(), now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), 'opens on this month');
  // back to the month of the newest workout in the sample (September 2021)
  const data = await store(page);
  const newest = Math.max(...data.workouts.map((w) => w.startedAt));
  const steps = monthsBetween(newest, Date.now());
  for (let i = 0; i < steps; i++) await id(page, 'cal-prev').click();
  await wait(page, 200);
  const cal = core.calendarMonth(data.workouts, newest, { weekStart: data.kv.settings?.weekStart ?? 1 });
  assert.equal(await id(page, 'cal-month').innerText(), new Date(newest).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  const statsText = await id(page, 'cal-stats').innerText();
  assert.ok(statsText.includes(String(cal.workouts)) && statsText.includes(String(cal.daysTrained)), `month totals ${cal.workouts} / ${cal.daysTrained} in “${statsText}”`);
  assert.equal(await page.locator('[data-testid^="cal-"][aria-label*="workout"]').count(), cal.byDay.size, 'every day with a workout is highlighted');
  await page.screenshot({ path: `${OUT}/01-calendar-${scheme}.png` });
  // a highlighted day lists its workout; tapping it opens the workout
  const day = startOfDayOf(newest);
  await id(page, `cal-${dayKey(day)}`).click();
  await wait(page, 200);
  const w = cal.byDay.get(day)[0];
  await id(page, `workout-${w.id}`).waitFor();
  await page.screenshot({ path: `${OUT}/02-calendar-day-${scheme}.png` });
  if (scheme === 'light') {
    // a day without a workout clears the selection; the next month button works
    await id(page, `cal-${dayKey(cal.days.find((d) => !cal.byDay.has(d)))}`).click();
    assert.equal(await id(page, `workout-${w.id}`).count(), 0, 'an empty day shows no workouts');
    await id(page, `cal-${dayKey(day)}`).click();
    await id(page, `workout-${w.id}`).click();
    await id(page, 'workout-options').waitFor();
    assert.ok(page.url().includes(`/workout/${encodeURIComponent(w.id)}`) || page.url().includes(`/workout/${w.id}`));
    await page.goBack();
    await wait(page, 300);
    await id(page, 'cal-next').click();
    await wait(page, 100);
    assert.equal(await id(page, 'cal-month').innerText(), new Date(core.addMonths(newest, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
    await id(page, 'history-view').click();
    await page.locator('[data-testid^="workout-"]').first().waitFor();
    ok(`History calendar: ${cal.workouts} workouts on ${cal.daysTrained} days in ${new Date(newest).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}, a day lists its workout and opens it, back to the list`);
  } else {
    ok('the calendar in dark mode');
  }
  assert.deepEqual(errors, []);
  await ctx.close();
}
function startOfDayOf(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

// ---------- 2. merging exercises ----------
{
  const { ctx, page, errors, dialogs } = await newPage();
  await restore(page, dialogs);
  let data = await store(page);
  const count = (d, ex) => d.workouts.filter((w) => w.exercises.some((e) => e.exerciseId === ex)).length;
  const entries = (d, ex) => d.workouts.reduce((n, w) => n + w.exercises.filter((e) => e.exerciseId === ex).length, 0);
  const hang = entries(data, HANG);
  const either = data.workouts.filter((w) => w.exercises.some((e) => e.exerciseId === HANG || e.exerciseId === SNATCH)).length;
  const snatchEntries = entries(data, SNATCH);
  assert.ok(hang > 0 && snatchEntries > 0);
  // different fields: refused
  await openExercise(page, AEROBICS, 'aerobics');
  await id(page, 'exercise-options').click();
  await id(page, 'ex-merge').click();
  await id(page, 'pick-search').fill('snatch');
  await wait(page, 200);
  await id(page, `pick-${SNATCH}`).click();
  assert.match(await toastText(page), /log different things, so they can’t be merged/);
  assert.ok((await store(page)).exercises.some((e) => e.id === AEROBICS), 'nothing merged');
  ok('merging a timed exercise into a barbell one is refused');
  await page.goBack();
  await wait(page, 300);

  // same fields: asks, merges, opens the target
  await openExercise(page, HANG, 'hang snatch');
  await id(page, 'exercise-options').click();
  await page.screenshot({ path: `${OUT}/03-exercise-menu.png` });
  await id(page, 'ex-merge').click();
  await id(page, 'pick-search').fill('snatch');
  await wait(page, 200);
  await id(page, `pick-${SNATCH}`).click();
  await id(page, 'confirm-merge').waitFor();
  await wait(page, 250);
  assert.match(await visibleText(page), new RegExp(`All ${hang} sessions of “Hang Snatch \\(Barbell\\)” move to “Snatch \\(Barbell\\)”`));
  await page.screenshot({ path: `${OUT}/04-merge-confirm.png` });
  await id(page, 'confirm-merge').click();
  assert.equal(await toastText(page), 'Exercises merged');
  await wait(page, 300);
  assert.ok(page.url().includes(`/exercise/${SNATCH}`), 'the target’s page is open');
  data = await store(page);
  assert.equal(data.exercises.some((e) => e.id === HANG), false, 'the source is deleted');
  assert.equal(count(data, HANG), 0);
  assert.equal(count(data, SNATCH), either, 'its workouts moved to the target');
  assert.equal(entries(data, SNATCH), snatchEntries + hang);
  ok(`Merge into another exercise: ${hang} sessions of Hang Snatch move to Snatch, Hang Snatch is deleted, Snatch opens`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 3. warm-up scheme, name ----------
{
  const { ctx, page, errors } = await newPage();
  await openSettings(page);
  assert.equal(await id(page, 'set-warmup').innerText().then((t) => t.includes('Bar × 10, 40% × 5, 60% × 3, 80% × 2')), true, 'the default scheme');
  await id(page, 'set-warmup').click();
  await id(page, 'wu-bar').waitFor();
  await page.screenshot({ path: `${OUT}/05-warmup-default.png` });
  await id(page, 'wu-bar').fill('5');
  await id(page, 'wu-pct-0').fill('50');
  await id(page, 'wu-remove-2').click();
  await id(page, 'wu-add').click();
  await id(page, 'wu-pct-2').fill('92,5');
  await id(page, 'wu-reps-2').fill('1');
  await id(page, 'wu-add').click();
  await id(page, 'wu-pct-3').fill('120');
  await id(page, 'wu-reps-3').fill('1');
  await page.screenshot({ path: `${OUT}/06-warmup-edited.png` });
  await id(page, 'wu-save').click();
  await id(page, 'set-warmup').waitFor();
  await wait(page, 300);
  assert.match(await id(page, 'set-warmup').innerText(), /Bar × 5, 50% × 5, 60% × 3, 93% × 1/);
  const scheme = (await store(page)).kv.settings.warmup;
  assert.deepEqual(scheme, { barReps: 5, steps: [[50, 5], [60, 3], [92.5, 1]] }, 'a step over 100 % is dropped; a decimal comma is read');
  // Reset, then Cancel keeps what was saved
  await id(page, 'set-warmup').click();
  await id(page, 'wu-reset').click();
  assert.equal(await id(page, 'wu-pct-2').inputValue(), '80');
  await id(page, 'wu-cancel').click();
  await wait(page, 300);
  assert.deepEqual((await store(page)).kv.settings.warmup, scheme, 'Cancel keeps the saved scheme');
  ok('Warm-up sets: bar reps, steps edited, removed and added (92,5 %), a 120 % step dropped; Reset and Cancel');

  // ⋯ → Add warm-up sets follows the new scheme
  await page.goBack();
  await wait(page, 300);
  await id(page, 'tab-index').click();
  await id(page, 'start-empty').click();
  await id(page, 'add-exercises').click();
  await id(page, 'pick-search').fill('bench bb');
  await wait(page, 200);
  await id(page, `pick-${BENCH}`).click();
  await id(page, 'pick-add').click();
  await wait(page, 600);
  const block = id(page, `block-${BENCH}`);
  await block.locator('[data-testid^="in-w-"]').first().fill('100');
  await block.locator('[data-testid^="in-r-"]').first().fill('5');
  await id(page, `ex-menu-${BENCH}`).click();
  await id(page, 'menu-warmup').click();
  await wait(page, 600);
  const active = (await store(page)).kv.active;
  const warm = active.exercises[0].sets.filter((s) => s.type === 'warmup').map((s) => `${s.w} × ${s.r}`);
  const want = core.warmupSets(100, 20, core.KG_PLATES, true, scheme).map((s) => `${s.w} × ${s.r}`);
  assert.deepEqual(warm, want);
  ok(`⋯ → Add warm-up sets follows it: ${warm.join(', ')}`);
  await id(page, 'discard-workout').click();
  await id(page, 'confirm-discard').click();
  await wait(page, 400);

  // the name is a row that opens a prompt (the same on Android)
  await openSettings(page);
  assert.match(await id(page, 'set-name').innerText(), /Not set/);
  await id(page, 'set-name').click();
  await id(page, 'prompt-input').fill('  Laurin L.  ');
  await wait(page, 200);
  await page.screenshot({ path: `${OUT}/07-name-prompt.png` });
  await id(page, 'prompt-ok').click();
  await wait(page, 200);
  assert.match(await id(page, 'set-name').innerText(), /Laurin L\./);
  assert.equal((await store(page)).kv.profile.name, 'Laurin L.');
  await page.goBack();
  await wait(page, 300);
  assert.equal(await id(page, 'open-account').getAttribute('aria-label'), 'Account, Laurin L.', 'Today’s avatar has it');
  assert.equal((await id(page, 'open-account').innerText()).trim(), 'L');
  ok('Your name: the top of Account opens a prompt, trimmed, shown on Today’s avatar');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 4. Delete all data (on a German phone, the app set to English) ----------
{
  const { ctx, page, errors, dialogs } = await newPage({ locale: 'de-DE' });
  await restore(page, dialogs);
  await openSettings(page);
  const before = await store(page);
  assert.ok(before.workouts.length > 50);
  await id(page, 'delete-all').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/08-settings-bottom.png` });
  await id(page, 'delete-all').click();
  await id(page, 'confirm-delete-all').waitFor();
  await wait(page, 250);
  assert.match(await visibleText(page), /Your settings, name, folders and changes to built-in exercises are reset too/);
  await page.screenshot({ path: `${OUT}/09-delete-all-warning.png` });
  // typing something else deletes nothing
  await id(page, 'confirm-delete-all').click();
  await id(page, 'prompt-input').fill('delete it');
  await id(page, 'prompt-ok').click();
  assert.equal(await toastText(page), 'Nothing was deleted');
  assert.equal((await store(page)).workouts.length, before.workouts.length);
  // DELETE (any case) deletes everything
  await wait(page, 200);
  await id(page, 'delete-all').click();
  await id(page, 'confirm-delete-all').click();
  await id(page, 'prompt-input').fill('delete');
  await wait(page, 200);
  await page.screenshot({ path: `${OUT}/10-delete-all-type.png` });
  await id(page, 'prompt-ok').click();
  assert.equal(await toastText(page), 'All data deleted');
  await wait(page, 300);
  const after = await store(page);
  assert.deepEqual([after.workouts.length, after.templates.length, after.measurements.length], [0, 0, 0]);
  assert.equal(after.exercises.length, core.SEED_EXERCISES.length, 'only the built-in exercises are left');
  assert.ok(after.exercises.every((e) => e.builtin));
  assert.equal(after.kv.profile, undefined, 'the name is gone');
  assert.equal(after.kv.settings, undefined, 'settings are back to the defaults');
  assert.equal(after.kv.meta.folders, undefined, 'folders are gone');
  await wait(page, 300);
  assert.match(await id(page, 'set-name').innerText(), /Nicht festgelegt/, 'no name, and the language follows the phone (German) again');
  ok('Delete all data: the warning names settings, name and folders; a wrong word deletes nothing; DELETE leaves only the built-in exercises');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 5. opening a template link ----------
{
  const exercises = new Map(core.SEED_EXERCISES.map((e) => [e.id, e]));
  exercises.set('c-landmine-press', { id: 'c-landmine-press', name: 'Landmine Press', category: 'barbell', bodyPart: 'shoulders' });
  const t = {
    name: 'Shared Push', notes: 'From a friend', exercises: [
      { exerciseId: BENCH, sets: [{ type: 'warmup', w: 40, r: 10 }, { type: 'normal', w: 80, r: 8 }], restSec: 150 },
      { exerciseId: 'c-landmine-press', sets: [{ type: 'normal', w: 30, r: 10 }] },
    ],
  };
  const code = core.encodeTemplate(t, exercises);
  const { ctx, page, errors } = await newPage({ path: `/?template=${code}` });
  await id(page, 'confirm-add-shared').waitFor();
  await wait(page, 250);
  const text = await visibleText(page);
  assert.match(text, /Add “Shared Push”\?/);
  assert.match(text, /These exercises are new to you and will be created: Landmine Press/);
  await page.screenshot({ path: `${OUT}/11-template-link.png` });
  await id(page, 'confirm-add-shared').click();
  assert.equal(await toastText(page), '“Shared Push” added to your templates');
  await wait(page, 300);
  let data = await store(page);
  const added = data.templates.find((x) => x.name === 'Shared Push');
  assert.ok(added, 'the template is saved');
  assert.deepEqual(added.exercises.map((e) => data.exercises.find((x) => x.id === e.exerciseId)?.name), ['Bench Press (Barbell)', 'Landmine Press']);
  assert.equal(added.exercises[0].restSec, 150);
  assert.ok(!page.url().includes('template='), 'the link leaves the address: ' + page.url());
  ok('a link with ?template= opens the app and offers the template; the new exercise is created');

  // the web app's link form (#template=), and a broken link
  await page.goto('about:blank');
  await page.goto(`${BASE}/#template=${code}`);
  await id(page, 'confirm-add-shared').waitFor();
  await id(page, 'dialog-cancel').click();
  await wait(page, 300);
  data = await store(page);
  assert.equal(data.templates.filter((x) => x.name === 'Shared Push').length, 1, 'Cancel adds nothing');
  await page.goto('about:blank');
  await page.goto(`${BASE}/?template=AAAAAAAAAAAAAAAA`);
  assert.equal(await toastText(page), 'That doesn’t look like a Setlog template link');
  ok('the #template= form works too; Cancel adds nothing; a broken link says so');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 6. German ----------
{
  const { ctx, page, errors, dialogs } = await newPage({ locale: 'de-DE' });
  await restore(page, dialogs);
  await openSettings(page);
  await id(page, 'language-de').click();
  await wait(page, 300);
  await page.screenshot({ path: `${OUT}/12-settings-de.png` });
  await id(page, 'set-warmup').click();
  await id(page, 'wu-bar').waitFor();
  await wait(page, 300);
  const wu = await visibleText(page);
  assert.match(wu, /Zuerst leere Stange/);
  assert.match(wu, /Stufe hinzufügen/);
  await page.screenshot({ path: `${OUT}/13-warmup-de.png` });
  await id(page, 'wu-cancel').click();
  await wait(page, 300);
  await page.goBack();
  await wait(page, 300);
  await openWorkouts(page);
  await id(page, 'history-view').click();
  await id(page, 'cal-stats').waitFor();
  assert.match(await id(page, 'cal-stats').innerText(), /Trainingstage/);
  await page.screenshot({ path: `${OUT}/14-calendar-de.png` });
  ok('German: Settings, Warm-up sets and the calendar');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 7. Privacy policy ----------
{
  const { ctx, page, errors } = await newPage();
  // expo-web-browser calls window.open on web: note the address instead of opening a window
  await page.evaluate(() => { window.opened = []; window.open = (u) => { window.opened.push(String(u)); return null; }; });
  const opened = async () => {
    await id(page, 'privacy').scrollIntoViewIfNeeded();
    await id(page, 'privacy').click();
    await page.waitForFunction(() => window.opened.length > 0);
    return page.evaluate(() => window.opened.pop());
  };
  await openSettings(page);
  assert.equal(await opened(), `${core.WEB_APP_URL}privacy.html`);
  await id(page, 'language-de').click();
  await wait(page, 300);
  // the row's text ends with the chevron icon's glyph, so compare the first line
  assert.equal((await id(page, 'privacy').innerText()).split('\n')[0], 'Datenschutzerklärung');
  assert.equal(await opened(), `${core.WEB_APP_URL}datenschutz.html`);
  ok('Settings → Privacy policy opens the page in the app’s language');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 8. German exercise names ----------
{
  const { ctx, page, errors, dialogs } = await newPage({ locale: 'de-DE' });
  await restore(page, dialogs);
  await openSettings(page);
  await id(page, 'language-de').click();
  await wait(page, 300);
  await page.goBack();
  await wait(page, 300);
  await id(page, 'tab-search').click();
  const rowName = async (exId) => (await id(page, `exercise-${exId}`).innerText()).split('\n')[0];
  const search = async (q) => { await id(page, 'exercise-search').fill(q); await wait(page, 250); };
  await search('latzug');
  assert.equal(await rowName('x-lat-pulldown-cable'), 'Latzug (Kabelzug)');
  await search('lat pulldown');
  assert.equal(await rowName('x-lat-pulldown-cable'), 'Latzug (Kabelzug)', 'the English name finds it too');
  await search('bankdrücken lh');
  assert.equal(await rowName('x-bench-press-barbell'), 'Bankdrücken (Langhantel)');
  await search('hang snatch');
  assert.equal(await rowName('c-hang-snatch-barbell'), 'Hang Snatch (Barbell)', 'a custom exercise keeps its name');
  await page.screenshot({ path: `${OUT}/15-exercises-de.png` });
  await search('bankdrücken lh');
  await id(page, 'exercise-x-bench-press-barbell').click();
  await wait(page, 400);
  assert.match(await visibleText(page), /Bankdrücken \(Langhantel\)/);
  const data = await store(page);
  assert.equal(data.exercises.find((e) => e.id === 'x-bench-press-barbell').name, 'Bench Press (Barbell)', 'stored in English');
  ok('German: built-ins show German names (list, search by either name, exercise page); custom names and stored names stay');
  assert.deepEqual(errors, []);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} checks passed`);
