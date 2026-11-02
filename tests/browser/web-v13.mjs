// Web app, v1.3.0: 1RM formulas and volume options, "Start history from",
// "Previous values", separate units, the warm-up scheme, the suggested workout
// and the focus metric. 16 checks.
import assert from 'node:assert/strict';
import { devices, launch, WEB as BASE, shots, waitReady } from './env.mjs';

const OUT = shots('web-v13');
const browser = await launch();
let passed = 0;
const ok = (name) => { passed++; console.log('PASS', name); };
const DAY = 86400000;

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
const ev = (page, fn, arg) => page.evaluate(fn, arg);
async function openSettings(page) {
  await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('profile'); ui.nav.stacks.profile = []; ui.push('settings'); });
  await page.locator('#set-formula').waitFor();
}

// ---------- 1. calculations ----------
{
  const { ctx, page, errors } = await newPage();
  const r = await ev(page, async () => {
    const calc = await import('/js/calc.js');
    const st = await import('/js/store.js');
    const out = {};
    out.f = Object.fromEntries(calc.FORMULAS.map((f) => [f.id, calc.est1RM(100, 5, f.id)]));
    out.one = calc.est1RM(100, 1, 'mayhew');
    const id = (n) => st.findExerciseByName(n).id;
    const w = {
      id: 'w1', name: 'T', startedAt: Date.now() - 2 * 86400000, endedAt: Date.now() - 2 * 86400000 + 3600000, templateId: null,
      exercises: [
        { id: 'e1', exerciseId: id('Bench Press (Dumbbell)'), sets: [{ id: 's1', type: 'normal', w: 30, r: 10 }] },
        { id: 'e2', exerciseId: id('Chest Dip (Weighted)'), sets: [{ id: 's2', type: 'normal', w: 10, r: 8 }] },
        { id: 'e3', exerciseId: id('Chest Dip (Assisted)'), sets: [{ id: 's3', type: 'normal', w: 20, r: 10 }] },
      ],
    };
    st.saveWorkout(w);
    const vol = () => { st.stats(); return calc.workoutVolume(w, st.S.exercises); };
    out.base = vol();
    st.setSetting('dumbbellTwice', true); out.db2 = vol();
    st.addMeasurement({ type: 'bodyweight', value: 80, at: Date.now() - 10 * 86400000 });
    st.setSetting('bwWeighted', true); out.bwW = vol();
    st.setSetting('bwAssisted', true); out.bwA = vol();
    out.assistedChart = calc.chartMetricsFor('assisted_bw').map((m) => m.id);
    return out;
  });
  const f = r.f;
  assert.ok(Math.abs(f.epley - 116.667) < 0.01 && Math.abs(f.brzycki - 112.5) < 0.01, JSON.stringify(f));
  assert.ok(Math.abs(f.lombardi - 117.46) < 0.01 && Math.abs(f.oconner - 112.5) < 0.01, JSON.stringify(f));
  for (const k of ['mayhew', 'wathen', 'lander']) assert.ok(f[k] > 105 && f[k] < 125, `${k} ${f[k]}`);
  const mean = ['epley', 'brzycki', 'lombardi', 'mayhew', 'oconner', 'wathen', 'lander'].reduce((a, k) => a + f[k], 0) / 7;
  assert.ok(Math.abs(f.average - mean) < 1e-9);
  assert.equal(r.one, 100);
  ok('1RM formulas: Epley, Brzycki, Lombardi, Mayhew, O’Conner, Wathen, Lander, average');
  assert.equal(r.base, 300 + 80); // dumbbell 30×10 + weighted dip 10×8; assisted not counted
  assert.equal(r.db2, 600 + 80);
  assert.equal(r.bwW, 600 + 8 * 90);
  assert.equal(r.bwA, 600 + 8 * 90 + 10 * 60);
  assert.ok(r.assistedChart.includes('volume'));
  ok('volume: dumbbells ×2, body weight added to weighted and taken off assisted exercises');

  await openSettings(page);
  await page.locator('#set-formula').selectOption('lombardi');
  assert.equal(await ev(page, async () => (await import('/js/store.js')).S.settings.formula), 'lombardi');
  await page.screenshot({ path: `${OUT}/settings-stats-light.png`, fullPage: false });
  ok('Settings: 1RM formula picker lists the new formulas');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 2. history start + previous source ----------
{
  const { ctx, page, errors } = await newPage();
  const r = await ev(page, async () => {
    const st = await import('/js/store.js');
    const id = st.findExerciseByName('Bench Press (Barbell)').id;
    const tA = st.copyTemplate({ name: 'A', exercises: [{ exerciseId: id, sets: [{ w: 50, r: 5 }] }] });
    const mk = (i, days, w, templateId) => st.saveWorkout({
      id: 'w' + i, name: 'W' + i, startedAt: Date.now() - days * 86400000, endedAt: Date.now() - days * 86400000 + 3600000, templateId,
      exercises: [{ id: 'e' + i, exerciseId: id, sets: [{ id: 's' + i, type: 'normal', w, r: 5 }] }],
    });
    mk(1, 60, 100, null); // old, heavy
    mk(2, 10, 70, tA.id); // from template A
    mk(3, 3, 80, null); // newest, no template
    const out = {};
    out.any = st.previousSets(id, { templateId: tA.id })[0].w;
    st.setSetting('prevSource', 'template');
    out.tpl = st.previousSets(id, { templateId: tA.id })[0].w;
    out.noTpl = st.previousSets(id, { templateId: null })[0].w;
    out.bestAll = st.stats().bests.get(id).weight;
    st.setSetting('historyStart', Date.now() - 30 * 86400000);
    out.bestFrom = st.stats().bests.get(id).weight;
    out.sessions = st.stats().byExercise.get(id).length;
    out.historyCount = st.S.workouts.length;
    return { ...out, tA: tA.id };
  });
  assert.equal(r.any, 80);
  assert.equal(r.tpl, 70);
  assert.equal(r.noTpl, 80);
  ok('"Previous values: Same template" prefers the template’s last session, falls back to any');
  assert.equal(r.bestAll, 100);
  assert.equal(r.bestFrom, 80);
  assert.equal(r.sessions, 2);
  assert.equal(r.historyCount, 3);
  ok('"Start history from" drops older workouts from records and previous values, but keeps them in History');

  // start template A in the UI: previous column shows the template's session
  await page.locator('.tpl-card', { hasText: 'A' }).first().click();
  await page.locator('#start-template').click();
  await page.locator('#finish-workout').waitFor();
  assert.equal((await page.locator('.set-row .prev').first().innerText()).replace(/\s/g, ' '), '70 × 5');
  ok('the workout screen uses it');
  await ev(page, async () => { (await import('/js/store.js')).discardActive(); (await import('/js/ui.js')).closeSheet(); });

  await openSettings(page);
  await page.locator('#set-history-start').click();
  await page.locator('#history-start-all').click();
  assert.equal(await ev(page, async () => (await import('/js/store.js')).S.settings.historyStart), null);
  ok('"Use all workouts" clears the start date');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 3. units + warm-up scheme ----------
{
  const { ctx, page, errors } = await newPage();
  await openSettings(page);
  await page.locator('#set-bodyunit button', { hasText: 'lb' }).click();
  await page.locator('#set-sizeunit button', { hasText: 'in' }).click();
  const u = await ev(page, async () => { const f = await import('/js/format.js'); return [f.wUnit(), f.bwUnit(), f.lenUnit(), f.dUnit()]; });
  assert.deepEqual(u, ['kg', 'lb', 'in', 'km']);
  await ev(page, async () => { const st = await import('/js/store.js'); st.addMeasurement({ type: 'bodyweight', value: 80, at: Date.now() }); });
  await ev(page, async () => (await import('/js/ui.js')).setTab('measure'));
  await page.getByText('176,4 lb').first().waitFor();
  ok('body weight in lb and measurements in inches while lifting stays in kg');

  await openSettings(page);
  await page.locator('#set-warmup').click();
  const dlg = page.locator('form.dialog', { hasText: 'Warm-up sets' });
  await dlg.locator('input[aria-label="Reps with the empty bar"]').fill('8');
  await dlg.locator('button[aria-label="Remove step 3"]').click();
  await dlg.locator('#wu-add').click();
  await dlg.locator('input[aria-label="Step 3 percent"]').fill('75');
  await dlg.locator('input[aria-label="Step 3 reps"]').fill('1');
  await dlg.locator('#wu-save').click();
  const wu = await ev(page, async () => (await import('/js/store.js')).S.settings.warmup);
  assert.deepEqual(wu, { barReps: 8, steps: [[40, 5], [60, 3], [75, 1]] });
  assert.ok((await page.locator('#set-warmup').innerText()).includes('Bar × 8, 40% × 5, 60% × 3, 75% × 1'));
  // use it in a workout
  await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('workout'); });
  await page.locator('#start-empty').click();
  await ev(page, async () => {
    const st = await import('/js/store.js');
    st.addEntries(st.S.active, [st.findExerciseByName('Squat (Barbell)').id]);
    st.S.active.exercises[0].sets[0].w = '100'; st.S.active.exercises[0].sets[0].r = '5';
    st.touchActive();
  });
  await page.locator('button[aria-label="Options for Squat (Barbell)"]').click();
  await page.locator('.action-sheet .action', { hasText: 'Add warm-up sets' }).click();
  const sets = await ev(page, async () => (await import('/js/store.js')).S.active.exercises[0].sets.map((s) => `${s.type}:${s.w}×${s.r}`));
  assert.deepEqual(sets, ['warmup:20×8', 'warmup:40×5', 'warmup:60×3', 'warmup:75×1', 'normal:100×5']);
  ok('custom warm-up scheme is used by "Add warm-up sets"');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 4. suggested workout ----------
{
  const { ctx, page, errors } = await newPage();
  const r = await ev(page, async () => {
    const st = await import('/js/store.js');
    const id = st.findExerciseByName('Bench Press (Barbell)').id;
    const t = {};
    for (const n of ['Push', 'Pull', 'Legs']) t[n] = st.copyTemplate({ name: n, exercises: [{ exerciseId: id, sets: [{ w: 50, r: 5 }] }] }).id;
    let i = 0;
    const mk = (name, daysAgo) => st.saveWorkout({
      id: 'w' + (++i), name, startedAt: Date.now() - daysAgo * 86400000, endedAt: Date.now() - daysAgo * 86400000 + 3600000, templateId: t[name],
      exercises: [{ id: 'e' + i, exerciseId: id, sets: [{ id: 's' + i, type: 'normal', w: 50, r: 5 }] }],
    });
    // rotation on irregular days: Push, Pull, Legs, Push, Pull, Legs, Push, Pull
    [[23, 'Push'], [21, 'Pull'], [18, 'Legs'], [15, 'Push'], [12, 'Pull'], [10, 'Legs'], [6, 'Push'], [3, 'Pull']].forEach(([d, n]) => mk(n, d));
    return st.suggestTemplate();
  });
  assert.equal(r.template.name, 'Legs');
  assert.equal(r.why.kind, 'after');
  await page.locator('#start-suggested').waitFor();
  assert.equal(await page.locator('#start-suggested').innerText(), 'Start Legs');
  assert.equal(await page.locator('.suggest-why').innerText(), 'Usually after Pull');
  await page.screenshot({ path: `${OUT}/suggested-light.png` });
  ok('suggests the next template in a rotation ("Start Legs", usually after Pull)');

  // weekday habit: same template every week on today's weekday
  const w = await ev(page, async () => {
    const st = await import('/js/store.js');
    st.S.workouts.splice(0); // clear
    const id = st.findExerciseByName('Squat (Barbell)').id;
    const ids = Object.fromEntries(st.S.templates.map((x) => [x.name, x.id]));
    let i = 100;
    const mk = (name, daysAgo) => st.saveWorkout({
      id: 'w' + (++i), name, startedAt: Date.now() - daysAgo * 86400000 - 3600000, endedAt: Date.now() - daysAgo * 86400000, templateId: ids[name],
      exercises: [{ id: 'e' + i, exerciseId: id, sets: [{ id: 's' + i, type: 'normal', w: 50, r: 5 }] }],
    });
    // Legs every week on this weekday, Push/Pull on other days, the last workout Pull 2 days ago
    [[28, 'Legs'], [26, 'Push'], [21, 'Legs'], [19, 'Pull'], [14, 'Legs'], [12, 'Push'], [7, 'Legs'], [2, 'Pull']].forEach(([d, n]) => mk(n, d));
    return st.suggestTemplate();
  });
  assert.equal(w.template.name, 'Legs');
  assert.equal(w.why.kind, 'weekday');
  ok('suggests the template usually done on this weekday');

  // starting it works
  await page.locator('#start-suggested').click();
  await page.locator('#finish-workout').waitFor();
  assert.equal(await ev(page, async () => (await import('/js/store.js')).S.active.name), 'Legs');
  ok('the suggested button starts that template');
  assert.deepEqual(errors, []);
  await ctx.close();

  // no history → no suggestion, empty workout stays the main button
  const p2 = await newPage();
  assert.equal(await p2.page.locator('#start-suggested').count(), 0);
  assert.ok((await p2.page.locator('#start-empty').getAttribute('class')).includes('btn-primary'));
  ok('without enough history there is no suggestion');
  await p2.ctx.close();
}

// ---------- 5. focus metric (the Strong example: 1995 kg, +43%, 21 reps, 95 kg) ----------
for (const scheme of ['dark', 'light']) {
  const { ctx, page, errors } = await newPage(scheme);
  const tid = await ev(page, async () => {
    const st = await import('/js/store.js');
    const id = st.findExerciseByName('Reverse Fly (Machine)')?.id || st.findExerciseByName('Lat Pulldown (Cable)').id;
    st.saveWorkout({
      id: 'p1', name: 'Pull', startedAt: Date.now() - 7 * 86400000, endedAt: Date.now() - 7 * 86400000 + 3600000, templateId: null,
      exercises: [{ id: 'e1', exerciseId: id, sets: [{ id: 'a', type: 'warmup', w: 40, r: 10 }, { id: 'b', type: 'normal', w: 93, r: 7 }, { id: 'c', type: 'normal', w: 93, r: 8 }] }],
    });
    const t = st.copyTemplate({ name: 'Pull', exercises: [{ exerciseId: id, sets: [{ type: 'warmup', w: 40, r: 10 }, { w: 93, r: 7 }, { w: 93, r: 8 }, { w: 100, r: 6 }] }] });
    (await import('/js/ui.js')).push('template-edit', { id: t.id });
    return t.id;
  });
  const btn = page.locator('.focus-btn').first();
  await btn.waitFor();
  await btn.click();
  const dlg = page.locator('.focus-dialog');
  await dlg.waitFor();
  const rows = await dlg.locator('.focus-row').allInnerTexts();
  assert.deepEqual(rows.map((x) => x.replace(/\s+/g, ' ').trim()), ['Total volume 1.995 kg', 'Volume increase +43%', 'Total reps 21 reps', 'Weight/rep 95 kg']);
  await dlg.locator('button[aria-label="What is this?"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/focus-${scheme}.png` });
  await dlg.locator('.focus-row', { hasText: 'Volume increase' }).click();
  assert.equal((await btn.innerText()).trim(), '+43%');
  // typing changes it live
  await page.locator('.set-row').nth(3).locator('input[aria-label="Reps"]').fill('8');
  assert.equal((await btn.innerText()).trim(), '+57%');
  await page.locator('#template-save').click();
  const saved = await ev(page, async (id) => (await import('/js/store.js')).getTemplate(id).exercises[0].focus, tid);
  assert.equal(saved, 'volumeChange');
  ok(`focus metric: values match Strong’s example, chip updates live and is saved with the template (${scheme})`);

  if (scheme === 'dark') {
    await page.locator('.tpl-card', { hasText: 'Pull' }).first().click();
    await page.locator('#start-template').click();
    await page.locator('#finish-workout').waitFor();
    assert.equal((await page.locator('.wo-head ~ * .focus-btn, .ex-block .focus-btn').first().innerText()).trim().length > 0, true);
    await page.screenshot({ path: `${OUT}/focus-workout-dark.png` });
    // turn it off again
    await page.locator('.ex-block .focus-btn').first().click();
    await page.locator('.focus-row.on').click();
    assert.equal((await page.locator('.ex-block .focus-btn').first().innerText()).trim(), '');
    ok('the chip carries into the workout and can be turned off');
  }
  assert.deepEqual(errors, []);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} checks passed`);
