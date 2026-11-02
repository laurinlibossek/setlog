// Web app, v1.1.0: the Strong-style "Update template" question after a workout
// that differs from its template (logic, values only, structure, undo, setting off,
// example templates, the "Leave them out" path). 14 checks.
import assert from 'node:assert/strict';
import { devices, launch, WEB as BASE, shots, waitReady } from './env.mjs';

const OUT = shots('web-template-update');
const browser = await launch();
const results = [];
const ok = (name) => { results.push(['PASS', name]); console.log('PASS', name); };

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

// Creates "Push Test" and returns its id.
async function makeTemplate(page) {
  return page.evaluate(async () => {
    const st = await import('/js/store.js');
    const id = (n) => st.findExerciseByName(n).id;
    const t = st.copyTemplate({
      name: 'Push Test',
      exercises: [
        { exerciseId: id('Bench Press (Barbell)'), sets: [{ type: 'warmup', w: 20, r: 10 }, { w: 60, r: 8 }, { w: 60, r: 8 }, { w: 60, r: 8 }] },
        { exerciseId: id('Overhead Press (Barbell)'), sets: [{ w: 40, r: 8 }, { w: 40, r: 8 }, { w: 40, r: 8 }] },
        { exerciseId: id('Lateral Raise (Dumbbell)'), sets: [{ w: 10, r: 12 }, { w: 10, r: 12 }] },
        { exerciseId: id('Triceps Pushdown (Cable)'), sets: [{ w: 25, r: 12 }, { w: 25, r: 12 }], notes: 'Rope attachment' },
      ],
    });
    return t.id;
  });
}
const getTpl = (page, id) => page.evaluate(async (tid) => JSON.parse(JSON.stringify((await import('/js/store.js')).getTemplate(tid))), id);

async function startTemplate(page, name) {
  await page.locator('.tpl-card', { hasText: name }).first().click();
  await page.locator('#start-template').click();
  await page.locator('#finish-workout').waitFor();
}
const block = (page, ex) => page.locator(`section.ex-block[aria-label="${ex}"]`);
async function checkSet(page, ex, i) { await block(page, ex).locator('.set-row').nth(i).locator('button.check').click(); }
async function typeSet(page, ex, i, field, value) {
  await block(page, ex).locator('.set-row').nth(i).locator(`input[aria-label="${field}"]`).fill(value);
}
async function finish(page) {
  await page.locator('#finish-workout').click();
  const dlg = page.locator('.dialog', { hasText: 'Finish workout?' });
  await dlg.waitFor();
  await dlg.locator('.btn-primary').click();
  await page.locator('#summary-done').waitFor();
}

// ---------- 1. logic ----------
{
  const { ctx, page, errors } = await newPage();
  const r = await page.evaluate(async () => {
    const st = await import('/js/store.js');
    const E = (exerciseId, sets, extra = {}) => ({ exerciseId, sets, ...extra });
    const S = (type, w, r) => ({ type, w, r });
    const tpl = { exercises: [
      E('a', [S('warmup', 20, 10), S('normal', 60, 8), S('normal', 60, 8)]),
      E('b', [S('normal', 40, 8), S('normal', 40, 8)]),
      E('c', [S('normal', 10, 12)]),
    ] };
    const out = {};
    // identical
    out.same = st.templateChanges(tpl, JSON.parse(JSON.stringify(tpl)));
    // only numbers differ
    const w1 = JSON.parse(JSON.stringify(tpl)); w1.exercises[0].sets[1].w = 62.5; w1.exercises[1].sets[0].r = 9;
    out.values = st.templateChanges(tpl, w1);
    // warm-up skipped: working sets must still pair with working sets
    const w2 = { exercises: [E('a', [S('normal', 60, 8), S('normal', 60, 8)]), tpl.exercises[1], tpl.exercises[2]] };
    out.skipWarmup = st.templateChanges(tpl, w2);
    // reorder + add exercise + set type change
    const w3 = { exercises: [tpl.exercises[1], E('a', [S('warmup', 20, 10), S('normal', 60, 8), S('failure', 60, 6)]), tpl.exercises[2], E('d', [S('normal', 5, 5)])] };
    out.mixed = st.templateChanges(tpl, w3);
    // superset created between b and c
    const w4 = JSON.parse(JSON.stringify(tpl)); w4.exercises[1].supersetId = 'x'; w4.exercises[2].supersetId = 'x';
    out.superset = st.templateChanges(tpl, w4);
    // same exercise twice: 2nd occurrence pairs with 2nd
    const tpl2 = { exercises: [E('a', [S('normal', 60, 5)]), E('b', [S('normal', 40, 8)]), E('a', [S('normal', 50, 10)])] };
    const w5 = { exercises: [E('a', [S('normal', 60, 5)]), E('b', [S('normal', 40, 8)]), E('a', [S('normal', 52.5, 10)])] };
    out.dupes = st.templateChanges(tpl2, w5);
    // warm-up moved behind a working set (same counts, different order)
    const w6 = JSON.parse(JSON.stringify(tpl)); w6.exercises[0].sets = [S('normal', 60, 8), S('warmup', 20, 10), S('normal', 60, 8)];
    out.moved = st.templateChanges(tpl, w6);
    // a missing value counts as a change (bodyweight set without added weight)
    const w7 = JSON.parse(JSON.stringify(tpl)); delete w7.exercises[2].sets[0].w;
    out.missing = st.templateChanges(tpl, w7);
    return out;
  });
  assert.equal(r.same.structure, false); assert.equal(r.same.valueSets, 0);
  assert.equal(r.values.structure, false); assert.equal(r.values.valueSets, 2);
  assert.equal(r.skipWarmup.removedSets, 1); assert.equal(r.skipWarmup.typesChanged, false); assert.equal(r.skipWarmup.valueSets, 0);
  assert.equal(r.mixed.reordered, true); assert.equal(r.mixed.addedExercises, 1); assert.equal(r.mixed.typesChanged, true);
  assert.equal(r.mixed.valueSets, 1); assert.equal(r.mixed.removedExercises, 0);
  assert.equal(r.superset.supersetsChanged, true); assert.equal(r.superset.structure, true);
  assert.equal(r.dupes.structure, false); assert.equal(r.dupes.valueSets, 1);
  assert.equal(r.moved.typesChanged, true);
  assert.equal(r.missing.valueSets, 1);
  ok('templateChanges logic (values, skipped warm-up, reorder, types, supersets, duplicates)');

  // updateTemplateFromWorkout valuesOnly vs full
  const u = await page.evaluate(async () => {
    const st = await import('/js/store.js');
    const id = (n) => st.findExerciseByName(n).id;
    const t = st.copyTemplate({ name: 'Logic', exercises: [
      { exerciseId: id('Bench Press (Barbell)'), notes: 'Pause reps', sets: [{ type: 'warmup', w: 20, r: 10 }, { w: 60, r: 8 }, { w: 60, r: 8 }] },
      { exerciseId: id('Pull Up'), sets: [{ r: 8 }, { r: 8 }] },
    ] });
    const workout = { exercises: [
      { exerciseId: id('Bench Press (Barbell)'), sets: [{ type: 'normal', w: 62.5, r: 8 }, { type: 'failure', w: 62.5, r: 6 }] },
      { exerciseId: id('Chest Dip'), sets: [{ type: 'normal', r: 12 }] },
    ] };
    const before = st.updateTemplateFromWorkout(t.id, workout, { valuesOnly: true });
    const afterValues = JSON.parse(JSON.stringify(st.getTemplate(t.id).exercises));
    st.restoreTemplateExercises(t.id, before);
    const restored = JSON.parse(JSON.stringify(st.getTemplate(t.id).exercises));
    st.updateTemplateFromWorkout(t.id, workout);
    const afterAll = JSON.parse(JSON.stringify(st.getTemplate(t.id).exercises));
    return { before, afterValues, restored, afterAll };
  });
  // values only: structure kept (warm-up untouched, types kept, pull ups kept, no dips)
  assert.equal(u.afterValues.length, 2);
  assert.deepEqual(u.afterValues[0].sets, [{ type: 'warmup', w: 20, r: 10 }, { type: 'normal', w: 62.5, r: 8 }, { type: 'normal', w: 62.5, r: 6 }]);
  assert.equal(u.afterValues[0].notes, 'Pause reps');
  assert.deepEqual(u.afterValues[1].sets, [{ type: 'normal', r: 8 }, { type: 'normal', r: 8 }]);
  assert.deepEqual(u.restored, u.before);
  // full: workout structure, template note kept for the matching exercise
  assert.equal(u.afterAll.length, 2);
  assert.deepEqual(u.afterAll[0].sets, [{ type: 'normal', w: 62.5, r: 8 }, { type: 'failure', w: 62.5, r: 6 }]);
  assert.equal(u.afterAll[0].notes, 'Pause reps');
  assert.equal(u.afterAll[1].notes, undefined);
  ok('updateTemplateFromWorkout: valuesOnly keeps structure, full replaces it, undo restores');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 2. values-only prompt, update + undo ----------
{
  const { ctx, page, errors } = await newPage();
  const tid = await makeTemplate(page);
  await startTemplate(page, 'Push Test');
  // change two sets' numbers (decimal comma), check everything else from the targets
  await typeSet(page, 'Bench Press (Barbell)', 1, 'Weight', '62,5');
  await typeSet(page, 'Overhead Press (Barbell)', 2, 'Reps', '6');
  for (const [ex, n] of [['Bench Press (Barbell)', 4], ['Overhead Press (Barbell)', 3], ['Lateral Raise (Dumbbell)', 2], ['Triceps Pushdown (Cable)', 2]]) {
    for (let i = 0; i < n; i++) await checkSet(page, ex, i);
  }
  await finish(page);
  const dlg = page.locator('.dialog.tpl-update');
  await dlg.waitFor();
  assert.equal(await dlg.locator('#tpl-update-values .t').innerText(), 'Update values');
  assert.equal(await dlg.locator('#tpl-update-values .s').innerText(), 'Updates values for 2 sets.');
  assert.equal(await dlg.locator('#tpl-update-all').count(), 0);
  assert.equal(await dlg.locator('#tpl-update-keep').innerText(), 'Keep original template');
  assert.ok(await page.locator('.summary-hero').isVisible(), 'summary stays behind the dialog');
  await page.screenshot({ path: `${OUT}/values-only-light.png` });
  await dlg.locator('#tpl-update-values').click();
  await page.locator('.toast', { hasText: 'Template values updated' }).waitFor();
  let t = await getTpl(page, tid);
  assert.equal(t.exercises[0].sets[1].w, 62.5);
  assert.equal(t.exercises[1].sets[2].r, 6);
  assert.equal(t.exercises[0].sets[0].type, 'warmup');
  ok('values-only change: "Update values" with count, template numbers updated');
  await page.locator('.toast button', { hasText: 'Undo' }).click();
  t = await getTpl(page, tid);
  assert.equal(t.exercises[0].sets[1].w, 60);
  assert.equal(t.exercises[1].sets[2].r, 8);
  ok('undo restores the previous template');
  await page.locator('#summary-done').click();
  await page.locator('.summary-hero').waitFor({ state: 'detached' });

  // a second identical run (numbers = template targets) → no prompt at all
  await startTemplate(page, 'Push Test');
  for (const [ex, n] of [['Bench Press (Barbell)', 4], ['Overhead Press (Barbell)', 3], ['Lateral Raise (Dumbbell)', 2], ['Triceps Pushdown (Cable)', 2]]) {
    for (let i = 0; i < n; i++) await typeSet(page, ex, i, 'Weight', String((await getTpl(page, tid)).exercises[['Bench Press (Barbell)', 'Overhead Press (Barbell)', 'Lateral Raise (Dumbbell)', 'Triceps Pushdown (Cable)'].indexOf(ex)].sets[i].w));
  }
  for (const [ex, n] of [['Bench Press (Barbell)', 4], ['Overhead Press (Barbell)', 3], ['Lateral Raise (Dumbbell)', 2], ['Triceps Pushdown (Cable)', 2]]) {
    for (let i = 0; i < n; i++) {
      const tr = (await getTpl(page, tid)).exercises[['Bench Press (Barbell)', 'Overhead Press (Barbell)', 'Lateral Raise (Dumbbell)', 'Triceps Pushdown (Cable)'].indexOf(ex)].sets[i].r;
      await typeSet(page, ex, i, 'Reps', String(tr));
      await checkSet(page, ex, i);
    }
  }
  await finish(page);
  await page.waitForTimeout(900);
  assert.equal(await page.locator('.dialog.tpl-update').count(), 0);
  ok('no prompt when the workout matches the template');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 3. structure change (like the Strong screenshot) ----------
for (const scheme of ['light', 'dark']) {
  const { ctx, page, errors } = await newPage(scheme);
  const tid = await makeTemplate(page);
  await startTemplate(page, 'Push Test');
  // bench: skip the warm-up and the last set, heavier 2nd set; OHP: last set to failure; skip laterals + triceps
  await typeSet(page, 'Bench Press (Barbell)', 1, 'Weight', '62,5');
  await checkSet(page, 'Bench Press (Barbell)', 1);
  await checkSet(page, 'Bench Press (Barbell)', 2);
  await block(page, 'Overhead Press (Barbell)').locator('.set-row').nth(2).locator('.set-label').click();
  await page.locator('.action-sheet .action', { hasText: 'Failure' }).click();
  await typeSet(page, 'Overhead Press (Barbell)', 2, 'Reps', '5');
  for (let i = 0; i < 3; i++) await checkSet(page, 'Overhead Press (Barbell)', i);
  await finish(page);
  const dlg = page.locator('.dialog.tpl-update');
  await dlg.waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/structure-${scheme}.png` });
  assert.equal(await dlg.locator('h3').innerText(), 'Update template');
  assert.equal(await dlg.locator('#tpl-update-values .t').innerText(), 'Update values only');
  assert.equal(await dlg.locator('#tpl-update-values .s').innerText(), 'Updates values for 2 sets.');
  assert.equal(await dlg.locator('#tpl-update-all .t').innerText(), 'Update template and values');
  assert.equal(await dlg.locator('#tpl-update-all .s').innerText(), 'Removes 2 exercises. Removes 2 sets. Changes set types.');
  ok(`structure change shows three choices with the right summary (${scheme})`);

  if (scheme === 'light') {
    await dlg.locator('#tpl-update-values').click();
    const t = await getTpl(page, tid);
    assert.equal(t.exercises.length, 4);
    assert.deepEqual(t.exercises[0].sets.map((s) => s.type), ['warmup', 'normal', 'normal', 'normal']);
    assert.equal(t.exercises[0].sets[1].w, 62.5);
    assert.deepEqual(t.exercises[1].sets.map((s) => s.type), ['normal', 'normal', 'normal']);
    assert.equal(t.exercises[1].sets[2].r, 5);
    assert.equal(t.exercises[3].notes, 'Rope attachment');
    ok('"Update values only" keeps exercises, sets and types');
  } else {
    await dlg.locator('#tpl-update-all').click();
    const t = await getTpl(page, tid);
    assert.equal(t.exercises.length, 2);
    assert.deepEqual(t.exercises[0].sets.map((s) => s.type), ['normal', 'normal']);
    assert.deepEqual(t.exercises[1].sets.map((s) => s.type), ['normal', 'normal', 'failure']);
    ok('"Update template and values" saves the new structure');
    await page.locator('.toast button', { hasText: 'Undo' }).click();
    assert.equal((await getTpl(page, tid)).exercises.length, 4);
    ok('undo after a structure update brings the removed exercises back');
  }
  await page.locator('#summary-done').click();
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 4. keep original + setting off ----------
{
  const { ctx, page, errors } = await newPage();
  const tid = await makeTemplate(page);
  const before = await getTpl(page, tid);
  await startTemplate(page, 'Push Test');
  await checkSet(page, 'Bench Press (Barbell)', 1);
  await finish(page);
  await page.locator('#tpl-update-keep').click();
  const after = await getTpl(page, tid);
  assert.deepEqual(after.exercises, before.exercises);
  ok('"Keep original template" leaves the template alone');
  await page.locator('#summary-done').click();

  // turn the question off in Settings
  await page.evaluate(async () => (await import('/js/ui.js')).setTab('profile'));
  await page.locator('button[aria-label="Settings"], #open-settings').first().click();
  const sw = page.locator('#set-ask-template');
  await sw.waitFor({ state: 'attached' });
  assert.equal(await sw.isChecked(), true);
  await page.locator('label.switch', { has: sw }).click();
  assert.equal(await page.evaluate(async () => (await import('/js/store.js')).S.settings.askTemplateUpdate), false);
  await page.screenshot({ path: `${OUT}/settings.png`, fullPage: false });
  await page.evaluate(async () => { const ui = await import('/js/ui.js'); ui.setTab('workout'); ui.nav.stacks.profile = []; });
  await startTemplate(page, 'Push Test');
  await checkSet(page, 'Bench Press (Barbell)', 1);
  await finish(page);
  await page.waitForTimeout(900);
  assert.equal(await page.locator('.dialog.tpl-update').count(), 0);
  ok('setting "Ask to update templates" off → no prompt');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 5. example templates never prompt ----------
{
  const { ctx, page, errors } = await newPage();
  await page.locator('.tpl-card').first().click();
  await page.locator('#start-template').click();
  await page.locator('#finish-workout').waitFor();
  const row = page.locator('.set-row').first();
  if (await row.locator('input[aria-label="Weight"]').count()) await row.locator('input[aria-label="Weight"]').fill('50');
  if (await row.locator('input[aria-label="Reps"]').count()) await row.locator('input[aria-label="Reps"]').fill('5');
  await row.locator('button.check').click();
  await finish(page);
  await page.waitForTimeout(900);
  assert.equal(await page.locator('.dialog.tpl-update').count(), 0);
  ok('example templates never prompt');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 6. unchecked sets with numbers → "Leave them out" still leads to the prompt ----------
{
  const { ctx, page, errors } = await newPage();
  await makeTemplate(page);
  await startTemplate(page, 'Push Test');
  await checkSet(page, 'Bench Press (Barbell)', 1);
  await typeSet(page, 'Bench Press (Barbell)', 2, 'Weight', '70');
  await typeSet(page, 'Bench Press (Barbell)', 2, 'Reps', '3');
  await page.locator('#finish-workout').click();
  await page.locator('.action-sheet .action', { hasText: 'Leave them out' }).click();
  await page.locator('#summary-done').waitFor();
  const dlg = page.locator('.dialog.tpl-update');
  await dlg.waitFor();
  assert.equal(await dlg.locator('#tpl-update-all .s').innerText(), 'Removes 3 exercises. Removes 3 sets.');
  await dlg.locator('#tpl-update-keep').click();
  await page.locator('#summary-done').click();
  await page.locator('.summary-hero').waitFor({ state: 'detached' });
  ok('"Leave them out" path shows the prompt over the summary');
  assert.deepEqual(errors, []);
  await ctx.close();
}

await browser.close();
console.log(`\n${results.length} checks passed`);
