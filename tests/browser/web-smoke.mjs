// Web app smoke check of the paths moved into the core on 19 Oct 2026: Profile
// chart (weekly counts, streak), a new template from the editor and from a
// finished workout, exercise charts. 4 checks.
import assert from 'node:assert/strict';
import { devices, launch, WEB as BASE, waitReady } from './env.mjs';

const browser = await launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-US', serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
let passed = 0;
const ok = (...msg) => { passed++; console.log('PASS', ...msg); };
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('setlog.lang', 'en'));
await page.goto(BASE);
await waitReady(page);
const ev = (fn, a) => page.evaluate(fn, a);
await ev(async () => {
  const st = await import('/js/store.js');
  const id = st.findExerciseByName('Squat (Barbell)').id;
  for (const d of [0, 1, 7, 8, 9, 14]) st.saveWorkout({ id: 'w' + d, name: 'Legs', startedAt: Date.now() - d * 86400000, endedAt: Date.now() - d * 86400000 + 3600000, templateId: null, exercises: [{ id: 'e' + d, exerciseId: id, sets: [{ id: 's' + d, type: 'normal', w: 100 + d, r: 5 }] }] });
});
await ev(async () => (await import('/js/ui.js')).setTab('profile'));
await page.locator('.chart svg').first().waitFor();
const bars = await page.locator('.chart svg path.bar').count();
assert.ok(bars >= 2, `bars ${bars}`);
ok('profile chart bars', bars, '| tiles', (await page.locator('.tiles').innerText()).replace(/\s+/g, ' '));
// new template through the editor
await ev(async () => { const ui = await import('/js/ui.js'); ui.setTab('workout'); ui.push('template-edit', {}); });
await page.locator('#template-save').click();
await page.locator('.toast', { hasText: 'Give the template a name' }).waitFor();
await page.locator('#tpl-name').fill('Smoke');
await page.locator('#template-save').click();
await page.locator('.toast', { hasText: 'Add at least one exercise' }).waitFor();
await page.locator('#add-exercises').click();
await page.locator('#picker-search').fill('squat bb');
await page.locator('.picker-row', { hasText: 'Squat (Barbell)' }).first().click();
await page.locator('#picker-add').click();
await page.locator('#template-save').click();
await page.locator('.toast', { hasText: '“Smoke” created' }).waitFor();
const t = await ev(async () => (await import('/js/store.js')).S.templates.find((x) => x.name === 'Smoke'));
assert.equal(t.exercises.length, 1);
assert.ok(t.createdAt > 0);
ok('new template from the editor', JSON.stringify(t.exercises[0].sets));
// from a workout
await ev(async () => { const ui = await import('/js/ui.js'); ui.setTab('history'); ui.push('template-edit', { fromWorkoutId: 'w0' }); });
assert.equal(await page.locator('#tpl-name').inputValue(), 'Legs');
await page.locator('#template-save').click();
await page.locator('.toast', { hasText: '“Legs” created' }).waitFor();
ok('template from a workout');
// exercise charts
await ev(async () => { const st = await import('/js/store.js'); const ui = await import('/js/ui.js'); ui.setTab('exercises'); ui.push('exercise', { id: st.findExerciseByName('Squat (Barbell)').id }); });
await page.locator('.seg button', { hasText: 'Charts' }).click();
await page.locator('.chart svg path.line').waitFor();
ok('exercise chart');
assert.deepEqual(errors, []);
await browser.close();
console.log(`\n${passed} checks passed`);
