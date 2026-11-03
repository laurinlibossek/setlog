// Web app, v1.4.0: the German UI. Everything visible is translated, and the
// language setting switches and survives reloads, and built-in exercises
// show their German names. 6 checks.
import assert from 'node:assert/strict';
import { devices, launch, WEB as BASE, shots, waitReady } from './env.mjs';

const OUT = shots('web-de');
const browser = await launch();
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };
const ev = (page, fn, arg) => page.evaluate(fn, arg);
// English UI words that must not show up in the German UI (exercise names, stored and shown, are removed first)
const ENGLISH = /\b(Add|Delete|Save|Cancel|Settings|Templates?|History|Records|Previous|Finish|Show|Hide|Edit|the|your|Workouts?|Reps|Weight|Sets|Volume|Duration|Today|Yesterday|ago|Start|Rest|Notes?|Done|Close|Body|Share|Archive|Suggested|Usually|Last|Search|Recent|Other)\b/;

const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE', colorScheme: 'dark', serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE);
await waitReady(page);
const names = await ev(page, async () => { const { exLabel } = await import('/js/i18n.js'); return [...(await import('/js/store.js')).S.exercises.values()].flatMap((e) => [e.name, exLabel(e)]); });
async function screenText(where) {
  let text = await page.locator('body').innerText();
  for (const n of names.sort((a, b) => b.length - a.length)) text = text.split(n).join('');
  for (const t of ['Settings → Export Workouts', 'Push', 'Pull', 'Setlog', 'RPE', 'PR', 'CSV', 'Strong', 'iCloud Drive', 'English', 'Deutsch', 'Epley', 'Brzycki', 'Lombardi', 'Mayhew', 'O’Conner', 'Wathen', 'Lander']) text = text.split(t).join('');
  const m = text.match(ENGLISH);
  assert.ok(!m, `${where}: English word "${m && m[0]}" in: ${text.slice(Math.max(0, text.indexOf(m && m[0]) - 60), text.indexOf(m && m[0]) + 60)}`);
}

// seed a little history + a template so screens have content
await ev(page, async () => {
  const st = await import('/js/store.js');
  const id = (n) => st.findExerciseByName(n).id;
  const t = st.copyTemplate({ name: 'Oberkörper', exercises: [
    { exerciseId: id('Bench Press (Barbell)'), sets: [{ type: 'warmup', w: 40, r: 10 }, { w: 80, r: 8 }, { w: 80, r: 8 }] },
    { exerciseId: id('Lat Pulldown (Cable)'), sets: [{ w: 60, r: 10 }, { w: 60, r: 10 }] },
  ] });
  for (const [d, w] of [[9, 75], [5, 77.5], [2, 80]]) {
    st.saveWorkout({
      id: 'w' + d, name: 'Oberkörper', startedAt: Date.now() - d * 86400000, endedAt: Date.now() - d * 86400000 + 3600000, templateId: t.id,
      exercises: [{ id: 'e' + d, exerciseId: id('Bench Press (Barbell)'), sets: [{ id: 's' + d, type: 'normal', w, r: 8 }] }],
    });
  }
  st.addMeasurement({ type: 'bodyweight', value: 82, at: Date.now() - 86400000 });
});

// tab bar + start screen
assert.deepEqual(await page.locator('.tabbar .tab').allInnerTexts(), ['Profil', 'Verlauf', 'Training', 'Übungen', 'Messen']);
assert.equal(await page.locator('#start-empty').innerText(), 'Leeres Training starten');
assert.equal(await page.locator('#start-suggested').innerText(), 'Oberkörper starten');
await screenText('start screen');
await page.screenshot({ path: `${OUT}/de-start.png` });
ok('start screen and tabs are German');

// every tab and the main sub-screens
for (const [tab, label] of [['history', 'Verlauf'], ['exercises', 'Übungen'], ['measure', 'Messen'], ['profile', 'Profil']]) {
  await ev(page, async (t) => (await import('/js/ui.js')).setTab(t), tab);
  await page.waitForTimeout(200);
  await screenText(label);
}
await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('history'); ui.push('workout-detail', { id: 'w2' }); });
await page.waitForTimeout(200); await screenText('workout detail');
await ev(page, async () => { const ui = await import('/js/ui.js'); const st = await import('/js/store.js'); ui.setTab('exercises'); ui.push('exercise', { id: st.findExerciseByName('Bench Press (Barbell)').id }); });
await page.waitForTimeout(200); await screenText('exercise detail');
for (const seg of ['Verlauf', 'Diagramme', 'Rekorde']) {
  await page.locator('.seg button', { hasText: seg }).first().click();
  await page.waitForTimeout(150);
  await screenText(`exercise ${seg}`);
}
await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('profile'); ui.nav.stacks.profile = []; ui.push('settings'); });
await page.waitForTimeout(200);
await screenText('settings');
await page.screenshot({ path: `${OUT}/de-settings.png` });
ok('history, exercises, measure, profile and settings have no English UI text');

// a workout from the template, finished with changes → German template dialog
await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('workout'); });
await page.locator('#start-suggested').click();
await page.locator('#finish-workout').waitFor();
await screenText('running workout');
assert.deepEqual((await page.locator('.set-hdr').first().allInnerTexts())[0].split(/\s+/).filter(Boolean), ['SATZ', 'VORHER', 'KG', 'WDH.']);
await page.screenshot({ path: `${OUT}/de-workout.png` });
await page.locator('button[aria-label="Satz als erledigt markieren"]').nth(1).click();
await page.locator('#finish-workout').click();
const fin = page.locator('.dialog', { hasText: 'Training beenden?' });
await fin.waitFor();
await fin.locator('.btn-primary').click();
const upd = page.locator('.dialog.tpl-update');
await upd.waitFor();
assert.equal(await upd.locator('h3').innerText(), 'Vorlage aktualisieren');
assert.equal(await upd.locator('#tpl-update-all .s').innerText(), 'Entfernt 1 Übung. Entfernt 2 Sätze.');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/de-update.png` });
await upd.locator('#tpl-update-keep').click();
await screenText('summary');
ok('running workout, finish dialog and template update dialog are German');

// switch to English in Settings → reload → English; back to phone language → German
await ev(page, async () => { const ui = await import('/js/ui.js'); ui.closeAllModals(); ui.setTab('profile'); ui.nav.stacks.profile = []; ui.push('settings'); });
await page.locator('#set-language').selectOption('en');
await page.waitForLoadState('load');
await page.waitForTimeout(800);
await waitReady(page);
assert.deepEqual(await page.locator('.tabbar .tab').allInnerTexts(), ['Profile', 'History', 'Workout', 'Exercises', 'Measure']);
assert.equal(await ev(page, async () => (await import('/js/store.js')).S.settings.language), 'en');
await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('profile'); ui.nav.stacks.profile = []; ui.push('settings'); });
await page.locator('#set-language').selectOption('auto');
await page.waitForTimeout(1000);
await waitReady(page);
assert.deepEqual(await page.locator('.tabbar .tab').allInnerTexts(), ['Profil', 'Verlauf', 'Training', 'Übungen', 'Messen']);
ok('language setting switches to English and back to the phone language');

// German exercise names: shown for built-ins, stored in English; search takes both
{
  await ev(page, async () => {
    const st = await import('/js/store.js');
    st.addExercise({ name: 'Zercher Squat', category: 'barbell', bodyPart: 'legs' });
    (await import('/js/ui.js')).setTab('exercises');
  });
  const search = page.locator('#exercise-search');
  const titles = async (q) => {
    await search.fill(q);
    await page.waitForTimeout(150);
    return page.locator('.tab-panel:not([hidden]) .cell-title').allInnerTexts();
  };
  const bench = await titles('bankdrücken lh');
  assert.ok(bench.includes('Bankdrücken (Langhantel)'), bench.join(' | '));
  assert.ok(!bench.some((t) => /Bench Press/.test(t)), 'no English name on screen');
  assert.deepEqual(await titles('lat pulldown'), await titles('latzug'), 'English and German search find the same exercises');
  assert.ok((await titles('latzug')).includes('Latzug (Kabelzug)'));
  assert.deepEqual(await titles('zercher'), ['Zercher Squat'], 'a custom exercise keeps its name');
  const stored = await ev(page, async () => (await import('/js/store.js')).findExerciseByName('Bench Press (Barbell)')?.name);
  assert.equal(stored, 'Bench Press (Barbell)', 'stored names stay English');
  await search.fill('kreuzheben');
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/de-exercise-names.png` });
  await search.fill('');
  ok('built-in exercises show German names, search takes German or English, custom names stay');
}

// dates and numbers
const bits = await ev(page, async () => { const u = await import('/js/util.js'); return [u.relDay(Date.now() - 3 * 86400000), u.fmtDur(65 * 60000), u.plural(3, 'set'), u.plural(1, 'workout')]; });
assert.deepEqual(bits, ['vor 3 Tagen', '1 h 5 min', '3 Sätze', '1 Training']);
ok('relative dates, durations and plurals are German');

assert.deepEqual(errors, []);
await browser.close();
console.log(`\n${passed} checks passed`);
