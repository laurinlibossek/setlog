// Web app, v1.2.0: start screen (card ⋯, archive, folders, sort, share and
// receive template links) and Strong notes import. 17 checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { devices, launch, WEB as BASE, DATA, shots, waitReady } from './env.mjs';

const OUT = shots('web-start-screen');
const browser = await launch();
let passed = 0;
const ok = (name) => { passed++; console.log('PASS', name); };

async function newPage(scheme = 'light') {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE', colorScheme: scheme, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { if (!localStorage.getItem('setlog.lang')) localStorage.setItem('setlog.lang', 'en'); } catch (e) { /* ignore */ } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE);
  await waitReady(page);
  return { ctx, page, errors };
}
const store = (page, fn, arg) => page.evaluate(fn, arg);
async function seedTemplates(page) {
  return store(page, async () => {
    const st = await import('/js/store.js');
    const id = (n) => st.findExerciseByName(n).id;
    const custom = st.addExercise({ name: 'Bayesian Curl (Cable)', category: 'machine', bodyPart: 'arms' });
    const mk = (name, exs, extra = {}) => st.copyTemplate({ name, exercises: exs, ...extra }).id;
    const ids = {
      push: mk('Push', [
        { exerciseId: id('Bench Press (Barbell)'), sets: [{ type: 'warmup', w: 60, r: 6 }, { w: 110, r: 7 }, { w: 110, r: 6 }], notes: 'Last two sets Kelso', restSec: 150 },
        { exerciseId: id('Lateral Raise (Dumbbell)'), sets: [{ w: 10, r: 12 }], supersetId: 's1' },
        { exerciseId: custom.id, sets: [{ w: 18.75, r: 6 }, { w: 26.25, r: 7 }], supersetId: 's1' },
      ], { notes: 'Heavy day' }),
      lower: mk('Lower', [{ exerciseId: id('Squat (Barbell)'), sets: [{ w: 100, r: 5 }] }]),
      upper: mk('Upper', [{ exerciseId: id('Pull Up'), sets: [{ r: 8 }] }]),
    };
    const t = st.getTemplate(ids.upper); t.lastUsedAt = Date.now() - 86400000; st.saveTemplate(t);
    const l = st.getTemplate(ids.lower); l.lastUsedAt = Date.now() - 3 * 86400000; st.saveTemplate(l);
    return ids;
  });
}
async function cardMenu(page, name) {
  await page.locator('.tpl-card-wrap', { has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) }).locator('.tpl-more').click();
  await page.locator('.action-sheet').waitFor();
}
const pick = (page, label) => page.locator('.action-sheet .action', { hasText: label }).first().click();
async function prompt(page, value) {
  const input = page.locator('#prompt-input');
  await input.waitFor();
  await input.fill(value);
  await page.locator('form.dialog button[type="submit"]').click();
}

// ---------- 1. start screen basics, card menu, archive ----------
{
  const { ctx, page, errors } = await newPage();
  await seedTemplates(page);
  await page.locator('#start-empty').waitFor();
  assert.equal(await page.locator('.start-card .hint').count(), 0);
  assert.ok(!/^0$/m.test(await page.locator('.page').first().innerText()), 'no stray 0');
  assert.ok(!(await page.locator('.start-card').innerText()).includes('pick a template'));
  ok('hint under "Start an empty workout" is gone');
  assert.deepEqual(await page.locator('.tpl-grid').first().locator('.name').allInnerTexts(), ['Lower', 'Push', 'Upper']);
  assert.equal(await page.locator('.tpl-grid').last().locator('.tpl-more').count(), 0, 'examples have no ⋯');
  await page.screenshot({ path: `${OUT}/start-light.png` });

  await cardMenu(page, 'Push');
  const labels = await page.locator('.action-sheet .action').allInnerTexts();
  assert.deepEqual(labels.map((l) => l.trim()), ['Edit template', 'Rename', 'Duplicate', 'Move to folder', 'Archive', 'Share', 'Delete template', 'Cancel']);
  await page.screenshot({ path: `${OUT}/card-menu-light.png` });
  ok('card ⋯ opens the template menu (Edit, Rename, Duplicate, Move, Archive, Share, Delete)');

  await pick(page, 'Archive');
  await page.locator('#archived-head').waitFor();
  assert.deepEqual(await page.locator('.tpl-grid').first().locator('.name').allInnerTexts(), ['Lower', 'Upper']);
  assert.ok((await page.locator('#archived-head').innerText()).includes('(1)'));
  await page.locator('#archived-head').click();
  await cardMenu(page, 'Push');
  await pick(page, 'Unarchive');
  await page.locator('#archived-head').waitFor({ state: 'detached' });
  assert.deepEqual(await page.locator('.tpl-grid').first().locator('.name').allInnerTexts(), ['Lower', 'Push', 'Upper']);
  ok('archive hides a template in a collapsed "Archived" section; unarchive brings it back');

  // edit from the card menu opens the editor
  await cardMenu(page, 'Lower');
  await pick(page, 'Edit template');
  await page.locator('#template-save').waitFor();
  assert.equal(await page.locator('#tpl-name').inputValue(), 'Lower');
  await page.locator('.nav-btn', { hasText: 'Cancel' }).click();
  // preview ⋯ still works and delete closes the preview
  await page.locator('.tpl-card', { hasText: 'Upper' }).click();
  await page.locator('#start-template').waitFor();
  await page.locator('button[aria-label="Template options"]').last().click();
  await pick(page, 'Delete template');
  await page.locator('.dialog .btn-danger').click();
  await page.locator('#start-template').waitFor({ state: 'detached' });
  assert.deepEqual(await page.locator('.tpl-grid').first().locator('.name').allInnerTexts(), ['Lower', 'Push']);
  ok('Edit from card menu opens the editor; Delete from the preview closes it');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 2. folders + sort ----------
{
  const { ctx, page, errors } = await newPage('dark');
  await seedTemplates(page);
  await page.locator('#new-folder').click();
  await prompt(page, 'Upper / Lower');
  await page.locator('.folder-head', { hasText: 'Upper / Lower' }).waitFor();
  assert.ok(await page.getByText('Empty. Use ⋯ → Move to folder').isVisible());
  ok('New folder button creates an empty folder');

  await cardMenu(page, 'Lower');
  await pick(page, 'Move to folder');
  await page.locator('.action-sheet .action', { hasText: 'Upper / Lower' }).click();
  await cardMenu(page, 'Upper');
  await pick(page, 'Move to folder');
  await page.locator('.action-sheet .action', { hasText: 'Upper / Lower' }).click();
  const folderGrid = page.locator('.folder-head', { hasText: 'Upper / Lower' }).locator('xpath=following-sibling::div[1]');
  assert.deepEqual(await folderGrid.locator('.name').allInnerTexts(), ['Lower', 'Upper']);
  ok('Move to folder puts templates into the new folder');

  await page.locator('#templates-menu').click();
  await pick(page, 'Sort by last used');
  assert.deepEqual(await folderGrid.locator('.name').allInnerTexts(), ['Upper', 'Lower']);
  assert.equal(await store(page, async () => (await import('/js/store.js')).S.settings.templateSort), 'recent');
  ok('Sort by last used orders templates by their last workout');
  await page.screenshot({ path: `${OUT}/folders-dark.png` });

  await page.locator('button[aria-label="Options for folder Upper / Lower"]').click();
  await pick(page, 'Rename folder');
  await prompt(page, 'Legs & Back');
  await page.locator('.folder-head', { hasText: 'Legs & Back' }).waitFor();
  const folders = await store(page, async () => (await import('/js/store.js')).S.templates.map((t) => [t.name, t.folder]).sort());
  assert.deepEqual(folders, [['Lower', 'Legs & Back'], ['Push', ''], ['Upper', 'Legs & Back']]);
  ok('Rename folder renames it on every template');

  await page.locator('button[aria-label="Options for folder Legs & Back"]').click();
  await pick(page, 'Remove folder');
  await page.locator('.dialog .btn-primary', { hasText: 'Remove folder' }).click();
  await page.locator('.folder-head', { hasText: 'Legs & Back' }).waitFor({ state: 'detached' });
  assert.equal(await page.locator('.tpl-card').count() - 6, 3);
  ok('Remove folder keeps its templates (they move to My templates)');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 3. share + receive ----------
let link;
{
  const { ctx, page, errors } = await newPage();
  await seedTemplates(page);
  await page.evaluate(() => { window.__shared = null; navigator.share = async (d) => { window.__shared = d; }; });
  await cardMenu(page, 'Push');
  await pick(page, 'Share');
  await page.waitForFunction(() => window.__shared);
  const shared = await page.evaluate(() => window.__shared);
  assert.ok(shared.text.startsWith('Push (Setlog template)'));
  assert.ok(shared.text.includes('• Bench Press (Barbell): 3 sets (W 60 kg × 6, 110 kg × 7, 110 kg × 6)'), shared.text);
  link = shared.text.match(/https?:\/\/\S+#template=\S+/)[0];
  assert.ok(link.length < 1200, `link length ${link.length}`);
  console.log('   share text:\n' + shared.text.split('\n').map((l) => '   | ' + l).join('\n'));
  ok('Share sends a readable summary plus a link');
  assert.deepEqual(errors, []);
  await ctx.close();
}
{
  // a friend opens the link in a fresh app
  const { ctx, page, errors } = await newPage();
  await page.goto(link);
  await waitReady(page);
  const dlg = page.locator('.dialog', { hasText: 'Add “Push”?' });
  await dlg.waitFor();
  assert.ok((await dlg.innerText()).includes('Bayesian Curl (Cable)'), 'mentions the new custom exercise');
  await page.screenshot({ path: `${OUT}/shared-add-light.png` });
  await dlg.locator('.btn-primary').click();
  const t = await store(page, async () => {
    const st = await import('/js/store.js');
    const t = st.S.templates.find((x) => x.name === 'Push');
    return { hash: location.hash, notes: t.notes, ex: t.exercises.map((e) => ({ name: st.exName(e.exerciseId), sets: e.sets, notes: e.notes, rest: e.restSec, ss: !!e.supersetId, ssId: e.supersetId })), custom: st.findExerciseByName('Bayesian Curl (Cable)') };
  });
  assert.equal(t.hash, '');
  assert.equal(t.notes, 'Heavy day');
  assert.deepEqual(t.ex.map((e) => e.name), ['Bench Press (Barbell)', 'Lateral Raise (Dumbbell)', 'Bayesian Curl (Cable)']);
  assert.deepEqual(t.ex[0].sets, [{ type: 'warmup', w: 60, r: 6 }, { type: 'normal', w: 110, r: 7 }, { type: 'normal', w: 110, r: 6 }]);
  assert.equal(t.ex[0].notes, 'Last two sets Kelso');
  assert.equal(t.ex[0].rest, 150);
  assert.ok(t.ex[1].ss && t.ex[1].ssId === t.ex[2].ssId && t.ex[1].ssId !== 'g1');
  assert.equal(t.custom.category, 'machine');
  ok('opening a shared link adds the template, with sets, notes, rest, superset and the custom exercise');

  // paste route (Templates ⋯ → Add shared template); existing custom exercise is reused
  await page.locator('#templates-menu').click();
  await pick(page, 'Add shared template');
  await prompt(page, `hey, try this: ${link} 💪`);
  await page.locator('.dialog', { hasText: 'Add “Push”?' }).locator('.btn-primary').click();
  const counts = await store(page, async () => {
    const st = await import('/js/store.js');
    return [st.S.templates.filter((x) => x.name === 'Push').length, [...st.S.exercises.values()].filter((e) => e.name === 'Bayesian Curl (Cable)').length];
  });
  assert.deepEqual(counts, [2, 1]);
  ok('pasting a link (inside other text) works and reuses existing exercises');

  await page.locator('#templates-menu').click();
  await pick(page, 'Add shared template');
  await prompt(page, 'https://example.com/#template=!!!notbase64');
  await page.locator('.toast', { hasText: 'doesn’t look like a Setlog template link' }).waitFor();
  const bad = await store(page, async () => (await import('/js/io.js')).parseSharedTemplate('#template=' + btoa('{"v":1,"n":"<img src=x onerror=alert(1)>","e":[{"n":"X","c":"nope","s":[["z",-5,"a"]]}]}').replace(/=+$/, '')));
  assert.equal(bad.exercises[0].category, 'barbell');
  assert.deepEqual(bad.exercises[0].sets, [{ type: 'normal' }]);
  ok('bad links are rejected and odd values are cleaned');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 4. Strong import keeps notes ----------
const CSV_NO_NOTES = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-09-01 18:00:00,"Upper",1h 5m,"T Bar Row",W,60,6,0,0,"","",
2026-09-01 18:00:00,"Upper",1h 5m,"T Bar Row",1,110,7,0,0,"","",
2026-09-01 18:00:00,"Upper",1h 5m,"T Bar Row",Rest Timer,0,0,0,150,"","",
2026-09-01 18:00:00,"Upper",1h 5m,"Lat Pulldown (Cable)",1,145,8,0,0,"","",
2026-09-03 18:00:00,"Lower",50m,"Squat (Barbell)",1,100,5,0,0,"","",
`;
const CSV_NOTES = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-09-01 18:00:00,"Upper",1h 5m,"T Bar Row",W,60,6,0,0,"","Felt strong",
2026-09-01 18:00:00,"Upper",1h 5m,"T Bar Row",1,110,7,0,0,"","Felt strong",
2026-09-01 18:00:00,"Upper",1h 5m,"T Bar Row",Rest Timer,0,0,0,150,"Last two sets Kelso","Felt strong",
2026-09-01 18:00:00,"Upper",1h 5m,"Lat Pulldown (Cable)",1,145,8,0,0,"Seat 4","Felt strong",
2026-09-03 18:00:00,"Lower",50m,"Squat (Barbell)",1,100,5,0,0,"","",
2026-09-05 18:00:00,"Push",1h,"Bench Press (Barbell)",1,90,5,0,0,"Pause reps","",
`;
{
  const { ctx, page, errors } = await newPage();
  const noNotes = path.join(DATA, 'no-notes.csv');
  const withNotes = path.join(DATA, 'notes.csv');
  fs.writeFileSync(noNotes, CSV_NO_NOTES);
  fs.writeFileSync(withNotes, CSV_NOTES);
  async function importFile(file, units = true) {
    await page.evaluate(async () => (await import('/js/ui.js')).setTab('profile'));
    if (!(await page.locator('#strong-import').isVisible())) await page.locator('#open-settings').click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#strong-import').click()]);
    await chooser.setFiles(file);
    if (!units) return;
    const unit = page.locator('.dialog', { hasText: 'Which units did Strong use?' });
    await unit.waitFor();
    await unit.locator('.btn-primary').click();
  }
  // an old-style import without notes
  await importFile(noNotes);
  await page.locator('#import-ok').click();
  await page.locator('.toast', { hasText: 'Imported 2 workouts' }).waitFor();
  // the file with notes: 2 known workouts get notes, 1 new workout is imported with its note
  await importFile(withNotes);
  const prev = page.locator('.dialog', { hasText: 'Import 1 workout?' });
  await prev.waitFor();
  assert.ok((await prev.innerText()).includes('but one gets its missing notes'), await prev.innerText());
  await page.locator('#import-ok').click();
  await page.locator('.toast', { hasText: 'Imported 1 workout' }).waitFor();
  let w = await store(page, async () => (await import('/js/store.js')).S.workouts.map((x) => ({ name: x.name, notes: x.notes, ex: x.exercises.map((e) => e.notes || '') })));
  const byName = Object.fromEntries(w.map((x) => [x.name, x]));
  assert.equal(byName.Upper.notes, 'Felt strong');
  assert.deepEqual(byName.Upper.ex, ['Last two sets Kelso', 'Seat 4']);
  assert.deepEqual(byName.Push.ex, ['Pause reps']);
  ok('Strong import reads exercise notes from any row, incl. rest-timer rows, and fills them into already imported workouts');

  // importing the same file again: nothing left to add
  await importFile(withNotes, false);
  await page.locator('.toast', { hasText: 'All 3 workouts are already imported' }).waitFor();
  ok('re-import with nothing new says so');

  // notes-only path (all workouts known)
  await store(page, async () => { const st = await import('/js/store.js'); const x = st.S.workouts.find((y) => y.name === 'Push'); delete x.exercises[0].notes; });
  await importFile(withNotes, false);
  const d = page.locator('.dialog', { hasText: 'Add notes to 1 workout?' });
  await d.waitFor();
  await d.locator('.btn-primary').click();
  await page.locator('.toast', { hasText: 'Notes added to 1 workout' }).waitFor();
  w = await store(page, async () => (await import('/js/store.js')).S.workouts.find((y) => y.name === 'Push').exercises[0].notes);
  assert.equal(w, 'Pause reps');
  ok('when every workout exists, it offers to add just the missing notes');

  // notes show in History detail
  await page.evaluate(async () => { const ui = await import('/js/ui.js'); ui.setTab('history'); });
  await page.locator('.wcard', { hasText: 'Upper' }).first().click();
  await page.getByText('Last two sets Kelso').waitFor();
  await page.getByText('Felt strong').waitFor();
  ok('imported notes show in the workout in History');
  assert.deepEqual(errors, []);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} checks passed`);
