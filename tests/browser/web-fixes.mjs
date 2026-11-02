// Web app, v1.6.0: the fixes for the 18 known issues (#n = issue number in the
// owner's issue list), drag-and-drop reordering, and (since the 19 Oct 2026 move
// of the editing helpers into the core) the unit switch round trip. 33 checks.
import assert from 'node:assert/strict';
import { devices, launch, WEB as BASE, shots, waitReady } from './env.mjs';

const OUT = shots('web-fixes');
const browser = await launch();
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };
const ev = (page, fn, arg) => page.evaluate(fn, arg);
async function newPage({ scheme = 'light', lang = 'en', theme = null } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE', colorScheme: scheme, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(([l, t]) => {
    try {
      if (!localStorage.getItem('setlog.lang')) localStorage.setItem('setlog.lang', l);
      if (t && !localStorage.getItem('setlog-theme')) localStorage.setItem('setlog-theme', t);
    } catch (e) { /* ignore */ }
  }, [lang, theme]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE);
  await waitReady(page);
  if (theme) await ev(page, async (t) => (await import('/js/store.js')).setSetting('theme', t), theme);
  return { ctx, page, errors };
}
const pick = (page, label) => page.locator('.action-sheet .action', { hasText: label }).first().click();
const block = (page, ex) => page.locator(`section.ex-block[aria-label="${ex}"]`);

// ---------- 1. stray "0", rest timer and pinned note wait for Save, tab re-tap guard ----------
{
  const { ctx, page, errors } = await newPage({ scheme: 'dark', theme: 'intense-red' });
  const tid = await ev(page, async () => {
    const st = await import('/js/store.js');
    const id = (n) => st.findExerciseByName(n).id;
    st.setSetting('defaultRest', 0);
    return st.copyTemplate({ name: 'Pull', exercises: [
      { exerciseId: id('Reverse Fly (Machine)'), sets: [{ type: 'warmup', w: 60, r: 12 }, { w: 93, r: 7 }, { w: 93, r: 8 }, { w: 93, r: 6 }] },
      { exerciseId: id('T Bar Row'), sets: [{ type: 'warmup', w: 60, r: 6 }, { w: 110, r: 7 }] },
    ] }).id;
  });
  await ev(page, async (id) => (await import('/js/ui.js')).push('template-edit', { id }), tid);
  await page.locator('#template-save').waitFor();
  for (const ex of ['Reverse Fly (Machine)', 'T Bar Row']) {
    const text = await block(page, ex).innerText();
    assert.ok(!/^\s*0\s*$/m.test(text), `no stray 0 in ${ex}: ${JSON.stringify(text.slice(0, 80))}`);
    assert.equal(await block(page, ex).locator('.ex-tags').count(), 0);
  }
  await page.screenshot({ path: `${OUT}/fix-no-zero-intense-red.png` });
  ok('no stray "0" under an exercise when its rest timer is off (#6)');

  // rest timer and pinned note are only saved with the template
  const exId = await ev(page, async () => (await import('/js/store.js')).findExerciseByName('Reverse Fly (Machine)').id);
  const restOf = () => ev(page, async (id) => { const e = (await import('/js/store.js')).S.exercises.get(id); return [e.restSec ?? null, e.pinnedNote || '']; }, exId);
  await page.locator('button[aria-label="Options for Reverse Fly (Machine)"]').click();
  await pick(page, 'Rest timer');
  await pick(page, '1:30');
  await page.locator('button[aria-label="Options for Reverse Fly (Machine)"]').click();
  await pick(page, 'Pin a note');
  await page.locator('#prompt-input').fill('Seat 4');
  await page.locator('form.dialog button[type="submit"]').click();
  assert.equal(await block(page, 'Reverse Fly (Machine)').locator('.pinned').innerText(), 'Seat 4', 'shows the pending note');
  assert.deepEqual(await restOf(), [null, '']);
  // re-tapping the Workout tab asks first; "Keep editing" stays
  await page.locator('#tab-workout').click();
  const dlg = page.locator('.dialog', { hasText: 'Discard changes?' });
  await dlg.waitFor();
  await dlg.locator('.btn', { hasText: 'Keep editing' }).click();
  assert.equal(await page.locator('#template-save').isVisible(), true);
  ok('tapping the current tab asks before throwing away unsaved edits (#2)');
  await page.locator('.nav-btn', { hasText: 'Cancel' }).click();
  await page.locator('.dialog .btn-danger', { hasText: 'Discard' }).click();
  assert.deepEqual(await restOf(), [null, '']);
  // again, then Save
  await ev(page, async (id) => (await import('/js/ui.js')).push('template-edit', { id }), tid);
  await page.locator('button[aria-label="Options for Reverse Fly (Machine)"]').click();
  await pick(page, 'Rest timer');
  await pick(page, '1:30');
  await page.locator('#template-save').click();
  assert.deepEqual(await restOf(), [90, '']);
  ok('rest timer and pinned-note changes in the template editor wait for Save and are dropped on Cancel (#5)');

  // an untouched editor goes straight back on re-tap
  await ev(page, async (id) => (await import('/js/ui.js')).push('template-edit', { id }), tid);
  await page.locator('#template-save').waitFor();
  await page.locator('#tab-workout').click();
  await page.locator('#template-save').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.dialog').count(), 0);
  ok('without changes the tab goes back to its first screen right away');

  // the running workout: no 0 either
  await ev(page, async () => { const st = await import('/js/store.js'); st.updateExercise(st.findExerciseByName('Reverse Fly (Machine)').id, { restSec: 0 }); });
  await page.locator('.tpl-card', { hasText: 'Pull' }).first().click();
  await page.locator('#start-template').click();
  await page.locator('#finish-workout').waitFor();
  assert.ok(!/^\s*0\s*$/m.test(await block(page, 'Reverse Fly (Machine)').innerText()));
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 2. data: re-import own CSV, durations, lb drift, backup time, plates ----------
{
  const { ctx, page, errors } = await newPage({ lang: 'de' });
  const r = await ev(page, async () => {
    const st = await import('/js/store.js');
    const io = await import('/js/io.js');
    const id = (n) => st.findExerciseByName(n).id;
    const t0 = Date.now() - 2 * 86400000 + 123; // milliseconds, like a workout logged in the app
    st.saveWorkout({ id: 'a', name: 'Oberkörper', startedAt: t0, endedAt: t0 + 65 * 60000, templateId: null,
      exercises: [{ id: 'e', exerciseId: id('Bench Press (Barbell)'), sets: [{ id: 's', type: 'normal', w: 80, r: 8 }] }] });
    const csv = io.exportCSV();
    const res = io.parseStrongCSV(csv, { weightUnit: 'kg', distUnit: 'km' });
    return { csv, dupes: res.stats.duplicates, fresh: res.stats.workouts, durs: [io.strongDuration(65 * 60000), io.strongDuration(45 * 60000), io.strongDuration(120 * 60000)] };
  });
  assert.equal(r.fresh, 0);
  assert.equal(r.dupes, 1);
  assert.ok(r.csv.includes(',1h 5m,'), r.csv);
  assert.deepEqual(r.durs, ['1h 5m', '45m', '2h']);
  ok('re-importing Setlog’s own CSV finds the workouts it already has; durations are written Strong-style in German too (#3)');

  // lb: saving an untouched finished workout keeps the stored kilograms exactly
  const w0 = 61.2349;
  await ev(page, async (w) => {
    const st = await import('/js/store.js');
    st.setSetting('unit', 'lb');
    st.setSetting('distUnit', 'mi');
    const id = (n) => st.findExerciseByName(n).id;
    st.saveWorkout({ id: 'lb', name: 'Lb', startedAt: Date.now() - 86400000, endedAt: Date.now() - 86400000 + 3600000, templateId: null,
      exercises: [
        { id: 'e1', exerciseId: id('Bench Press (Barbell)'), sets: [{ id: 's1', type: 'normal', w, r: 5 }] },
        { id: 'e2', exerciseId: id('Running'), sets: [{ id: 's2', type: 'normal', d: 5.0123, t: 1500 }] },
      ] });
  }, w0);
  for (let i = 0; i < 3; i++) {
    await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('history'); ui.nav.stacks.history = []; ui.push('workout-edit', { id: 'lb' }); });
    await page.locator('#edit-save').click();
    await page.locator('#edit-save').waitFor({ state: 'detached' });
  }
  const after = await ev(page, async () => { const w = (await import('/js/store.js')).getWorkout('lb'); return [w.exercises[0].sets[0].w, w.exercises[1].sets[0].d]; });
  assert.deepEqual(after, [w0, 5.0123]);
  // an edited value is still converted
  await ev(page, async () => { const ui = await import('/js/ui.js'); ui.push('workout-edit', { id: 'lb' }); });
  await page.locator('input[aria-label="Gewicht"]').first().fill('140');
  await page.locator('#edit-save').click();
  const edited = await ev(page, async () => (await import('/js/store.js')).getWorkout('lb').exercises[0].sets[0].w);
  assert.ok(Math.abs(edited - 140 * 0.45359237) < 1e-9, String(edited));
  ok('editing a finished workout in lb/mi no longer shifts the stored numbers (#4)');

  // backup restore counts as a backup
  const meta = await ev(page, async () => {
    const io = await import('/js/io.js');
    const st = await import('/js/store.js');
    st.setMeta({ lastBackupAt: Date.now() - 30 * 86400000 });
    const text = io.backupJSON();
    const exportedAt = JSON.parse(text).exportedAt;
    return { at: io.parseBackup(text).data.kv.meta.lastBackupAt, exportedAt: Date.parse(exportedAt) };
  });
  assert.equal(meta.at, meta.exportedAt);
  ok('restoring a backup records it as the latest backup, so the reminder doesn’t come back early (#10)');

  const plates = await ev(page, async () => {
    const u = await import('/js/util.js');
    return ['25,20,15', '25, 20, 15, 10, 5, 2.5, 1.25', '25  20  2,5  1,25', '25; 20; 2,5', '2,5', '45,35,25,10,5,2.5', 'abc', '20,20,10'].map((x) => u.parsePlates(x));
  });
  assert.deepEqual(plates, [[25, 20, 15], [25, 20, 15, 10, 5, 2.5, 1.25], [25, 20, 2.5, 1.25], [25, 20, 2.5], [2.5], [45, 35, 25, 10, 5, 2.5], [], [20, 10]]);
  // and in Settings
  await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('profile'); ui.nav.stacks.profile = []; ui.push('settings'); });
  await page.locator('.cell', { hasText: 'Verfügbare Scheiben' }).click();
  await page.locator('#prompt-input').fill('45,35,25');
  await page.locator('form.dialog button[type="submit"]').click();
  assert.deepEqual(await ev(page, async () => (await import('/js/store.js')).S.settings.plates), [45, 35, 25]);
  ok('plates typed without spaces ("45,35,25") are accepted (#8)');

  // name can be changed, delete-all warns about settings
  await page.locator('#set-name').click();
  await page.locator('#prompt-input').fill('Laurin');
  await page.locator('form.dialog button[type="submit"]').click();
  await page.locator('#set-name').click();
  await page.locator('#prompt-input').fill('Laurin L.');
  await page.locator('form.dialog button[type="submit"]').click();
  assert.equal(await ev(page, async () => (await import('/js/store.js')).S.profile.name), 'Laurin L.');
  assert.ok((await page.locator('#set-name').innerText()).includes('Laurin L.'));
  ok('the name can be changed in Settings (#9)');
  await page.locator('.cell.danger').click();
  assert.ok((await page.locator('.dialog').innerText()).includes('Einstellungen'), 'mentions settings');
  await page.locator('.dialog .btn', { hasText: 'Abbrechen' }).click();
  ok('Delete all data says that settings, name and folders are reset too (#11)');

  // Start history from has a Cancel
  await page.locator('#set-history-start').click();
  await page.locator('#history-start-cancel').click();
  assert.equal(await page.locator('form.dialog').count(), 0);
  assert.equal(await ev(page, async () => (await import('/js/store.js')).S.settings.historyStart), null);
  ok('"Start history from" can be cancelled (#18)');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 3. exercises: history start, merge, category change, search ----------
{
  const { ctx, page, errors } = await newPage();
  const ids = await ev(page, async () => {
    const st = await import('/js/store.js');
    const old = st.addExercise({ name: 'Rückenstrecker', category: 'machine', bodyPart: 'back' });
    const run = st.findExerciseByName('Running').id;
    st.saveWorkout({ id: 'old', name: 'Old', startedAt: Date.now() - 200 * 86400000, endedAt: Date.now() - 200 * 86400000 + 3600000, templateId: null,
      exercises: [{ id: 'e', exerciseId: old.id, sets: [{ id: 's', type: 'normal', w: 40, r: 12 }] }] });
    st.setSetting('historyStart', Date.now() - 30 * 86400000);
    return { old: old.id, run };
  });
  await ev(page, async (id) => { const ui = await import('/js/ui.js'); ui.setTab('exercises'); ui.push('exercise', { id }); }, ids.old);
  await page.locator('.seg button', { hasText: 'History' }).click();
  await page.locator('.detail-ex', { hasText: 'Old' }).waitFor();
  await page.locator('button[aria-label="Exercise options"]').click();
  await pick(page, 'Delete exercise');
  await page.locator('.dialog', { hasText: 'This exercise has history' }).waitFor();
  await page.locator('.dialog .btn', { hasText: 'Cancel' }).click();
  assert.equal(await ev(page, async (id) => (await import('/js/store.js')).S.exercises.has(id), ids.old), true);
  ok('an exercise used only before "Start history from" can’t be deleted, and its History tab shows those sessions (#1)');

  // merge: different fields are refused, matching ones carry the rest timer and notes
  await page.locator('button[aria-label="Exercise options"]').click();
  await pick(page, 'Merge into another exercise');
  await page.locator('#picker-search').fill('running');
  await page.locator('.picker-row', { hasText: 'Running' }).first().click();
  await page.locator('.toast', { hasText: 'log different things' }).waitFor();
  assert.equal(await ev(page, async (id) => (await import('/js/store.js')).S.exercises.has(id), ids.old), true);
  const merged = await ev(page, async (id) => {
    const st = await import('/js/store.js');
    st.updateExercise(id, { restSec: 75, notes: 'Hips on the pad', pinnedNote: 'Pad 3' });
    const into = st.findExerciseByName('Back Extension') || st.addExercise({ name: 'Back Extension', category: 'machine', bodyPart: 'back' });
    st.updateExercise(into.id, { category: 'machine', restSec: undefined, notes: '' });
    st.mergeExercise(id, into.id);
    const e = st.S.exercises.get(into.id);
    return [e.restSec, e.notes, e.pinnedNote, st.getWorkout('old').exercises[0].exerciseId === into.id];
  }, ids.old);
  assert.deepEqual(merged, [75, 'Hips on the pad', 'Pad 3', true]);
  ok('merge refuses exercises that log different fields and keeps the source’s rest timer and notes (#17)');

  // changing the category of a used exercise asks first
  const benchId = await ev(page, async () => {
    const st = await import('/js/store.js');
    const b = st.addExercise({ name: 'Landmine Press', category: 'barbell', bodyPart: 'shoulders' });
    st.saveWorkout({ id: 'lm', name: 'LM', startedAt: Date.now() - 86400000, endedAt: Date.now() - 86400000 + 3600000, templateId: null,
      exercises: [{ id: 'e', exerciseId: b.id, sets: [{ id: 's', type: 'normal', w: 30, r: 10 }] }] });
    const ui = await import('/js/ui.js'); ui.nav.stacks.exercises = []; ui.push('exercise', { id: b.id });
    return b.id;
  });
  await page.locator('button[aria-label="Exercise options"]').click();
  await pick(page, 'Edit exercise');
  await page.locator('#ex-cat').selectOption('cardio');
  await page.locator('#exercise-save').click();
  await page.locator('.dialog', { hasText: 'Change what you log?' }).waitFor();
  await page.locator('.dialog .btn', { hasText: 'Cancel' }).click();
  assert.equal(await ev(page, async (id) => (await import('/js/store.js')).S.exercises.get(id).category, benchId), 'barbell');
  await page.locator('.nav-btn', { hasText: 'Cancel' }).first().click();
  ok('changing what a used exercise logs needs a confirmation (#17)');

  // search with umlauts
  const found = await ev(page, async () => {
    const p = await import('/js/pickers.js');
    const ex = { name: 'Rückenstrecker' };
    return [p.matchExercise(ex, 'rück'), p.matchExercise(ex, 'ruck'), p.matchExercise(ex, 'Rückenstr'), p.matchExercise({ name: 'Bench Press (Barbell)' }, 'bench bb')];
  });
  assert.deepEqual(found, [true, true, true, true]);
  ok('exercise search understands ü and other letters beyond a–z (#18)');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 4. templates: archived folders, RPE, previews, notes ----------
{
  const { ctx, page, errors } = await newPage();
  await ev(page, async () => {
    const st = await import('/js/store.js');
    const id = (n) => st.findExerciseByName(n).id;
    const a = st.copyTemplate({ name: 'Old Upper', folder: 'Archive me', exercises: [{ exerciseId: id('Pull Up'), sets: [{ r: 8 }] }] });
    st.setTemplateArchived(a.id, true);
    st.copyTemplate({ name: 'RPE day', notes: 'Keep two in the tank', exercises: [
      { exerciseId: id('Squat (Barbell)'), sets: [{ w: 100, r: 5, rpe: 8 }] },
      { exerciseId: id('Pull Up'), sets: [{ r: 8 }, { r: 8 }] },
    ] });
  });
  await page.locator('.folder-head', { hasText: 'Archive me' }).waitFor();
  assert.ok(await page.getByText('Its template is archived').isVisible());
  await page.locator('button[aria-label="Options for folder Archive me"]').click();
  await pick(page, 'Remove folder');
  await page.locator('.dialog', { hasText: 'Its template moves to My templates' }).waitFor();
  await page.locator('.dialog .btn', { hasText: 'Cancel' }).click();
  ok('a folder holding only archived templates says so, and Remove folder counts them (#7)');

  // preview: "8 reps" instead of "— × 8"; RPE survives Duplicate and reaches the workout
  await page.locator('.tpl-card', { hasText: 'RPE day' }).click();
  const sub = await page.locator('.fs .cell', { hasText: 'Pull Up' }).locator('.cell-sub').innerText();
  assert.ok(sub.includes('8 reps') && !sub.includes('—'), sub);
  ok('template previews show "8 reps" for targets without weight (#13)');
  await page.locator('button[aria-label="Template options"]').last().click();
  await pick(page, 'Duplicate');
  const dupRpe = await ev(page, async () => (await import('/js/store.js')).S.templates.find((t) => t.name === 'RPE day (copy)').exercises[0].sets[0].rpe);
  assert.equal(dupRpe, 8);
  await page.locator('#start-template').click();
  await page.locator('#finish-workout').waitFor();
  assert.equal(await ev(page, async () => (await import('/js/store.js')).S.active.exercises[0].sets[0].rpe), '8');
  assert.ok((await block(page, 'Squat (Barbell)').locator('.set-label').first().innerText()).includes('@8'));
  ok('template RPE is kept by Duplicate and carried into the workout (#13)');
  assert.equal(await page.locator('.tpl-notes').innerText(), 'Keep two in the tank');
  await page.screenshot({ path: `${OUT}/fix-template-notes.png` });
  ok('template notes show at the top of the running workout (#18)');

  // workout number follows the start time
  await ev(page, async () => {
    const st = await import('/js/store.js');
    const id = st.findExerciseByName('Squat (Barbell)').id;
    for (const d of [3, 5]) st.saveWorkout({ id: 'h' + d, name: 'H', startedAt: Date.now() - d * 86400000, endedAt: Date.now() - d * 86400000 + 3600000, templateId: null, exercises: [{ id: 'e', exerciseId: id, sets: [{ id: 's', type: 'normal', w: 90, r: 5 }] }] });
    st.S.active.startedAt = Date.now() - 4 * 86400000;
    st.S.active.exercises[0].sets[0].done = true;
    st.S.active.exercises[0].sets[0].w = '100'; st.S.active.exercises[0].sets[0].r = '5';
    st.touchActive();
  });
  const n = await ev(page, async () => (await import('/js/store.js')).finishActive('done').number);
  assert.equal(n, 2);
  ok('"workout #n" counts by start time after the start was moved earlier (#18)');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 5. logging: supersets, replace, warm-ups in lb, discard, PR badge ----------
{
  const { ctx, page, errors } = await newPage();
  const r = await ev(page, async () => {
    const st = await import('/js/store.js');
    const id = (n) => st.findExerciseByName(n).id;
    st.startWorkout();
    st.addEntries(st.S.active, ['Bench Press (Barbell)', 'Lat Pulldown (Cable)', 'Lateral Raise (Dumbbell)', 'Triceps Pushdown (Cable)'].map(id));
    const [a, b, c, d] = st.S.active.exercises;
    a.supersetId = 'g1'; b.supersetId = 'g1'; c.supersetId = 'g2'; d.supersetId = 'g2';
    st.touchActive();
    (await import('/js/ui.js')).openSheet();
    return true;
  });
  assert.ok(r);
  await page.locator('#finish-workout').waitFor();
  await page.locator('button[aria-label="Options for Lat Pulldown (Cable)"]').click();
  await pick(page, 'Change superset');
  await pick(page, 'Lateral Raise (Dumbbell)');
  const groups = await ev(page, async () => (await import('/js/store.js')).S.active.exercises.map((e) => [e.exerciseId.replace(/^x-/, ''), e.supersetId === null ? null : e.supersetId]));
  const names = groups.map((g) => g[0]);
  assert.deepEqual(names, ['bench-press-barbell', 'lateral-raise-dumbbell', 'triceps-pushdown-cable', 'lat-pulldown-cable']);
  assert.equal(groups[0][1], null, 'bench is left on its own');
  assert.ok(groups[1][1] && groups[1][1] === groups[2][1] && groups[2][1] === groups[3][1], JSON.stringify(groups));
  ok('"Change superset" moves just that exercise into the other group (#12)');

  // replace resets rest timer and focus
  await ev(page, async () => { const st = await import('/js/store.js'); const e = st.S.active.exercises[1]; e.restSec = 45; e.focus = 'volume'; st.touchActive(); });
  await page.locator('button[aria-label="Options for Lateral Raise (Dumbbell)"]').click();
  await pick(page, 'Replace exercise');
  await page.locator('#picker-search').fill('plank');
  await page.locator('.picker-row', { hasText: 'Plank' }).first().click();
  const rep = await ev(page, async () => { const e = (await import('/js/store.js')).S.active.exercises[1]; return [e.restSec, e.focus]; });
  assert.deepEqual(rep, [null, null]);
  ok('Replace drops the old exercise’s rest timer and focus metric (#18)');

  // warm-ups in lb for dumbbells land on 5 lb steps
  await ev(page, async () => {
    const st = await import('/js/store.js');
    st.setSetting('unit', 'lb');
    st.S.active.exercises = [];
    st.addEntries(st.S.active, [st.findExerciseByName('Bench Press (Dumbbell)').id, st.findExerciseByName('Bench Press (Barbell)').id]);
    st.S.active.exercises[0].sets[0].w = '70'; st.S.active.exercises[0].sets[0].r = '8';
    st.S.active.exercises[1].sets[0].w = '225'; st.S.active.exercises[1].sets[0].r = '5';
    st.touchActive();
  });
  for (const ex of ['Bench Press (Dumbbell)', 'Bench Press (Barbell)']) {
    await page.locator(`button[aria-label="Options for ${ex}"]`).click();
    await pick(page, 'Add warm-up sets');
  }
  const ws = await ev(page, async () => (await import('/js/store.js')).S.active.exercises.map((e) => e.sets.filter((s) => s.type === 'warmup').map((s) => +s.w)));
  assert.ok(ws[0].length && ws[0].every((w) => w % 5 === 0), JSON.stringify(ws));
  assert.deepEqual(ws[0], [30, 40, 55]);
  assert.deepEqual(ws[1], [45, 90, 135, 180]);
  ok('warm-ups in lb land on 5 lb dumbbell steps and loadable barbell weights (#14)');

  // discard with typed numbers: honest message, and "Discard it and start new" confirms too
  await ev(page, async () => { const st = await import('/js/store.js'); st.setSetting('unit', 'kg'); for (const e of st.S.active.exercises) e.sets = e.sets.filter((s) => s.type !== 'warmup'); st.touchActive(); });
  await page.locator('#workout-name').fill('Typed only');
  await page.locator('.btn-danger', { hasText: 'Discard workout' }).click();
  const msg = await page.locator('.dialog').innerText();
  assert.ok(msg.includes('The numbers you typed in it will be lost.'), msg);
  await page.locator('.dialog .btn', { hasText: 'Keep going' }).click();
  await page.locator('button[aria-label="Minimize workout"]').click();
  await ev(page, async () => { const ui = await import('/js/ui.js'); ui.setTab('workout'); });
  await page.locator('.tpl-card').first().click();
  await page.locator('#start-template').click();
  await pick(page, 'Discard it and start new');
  await page.locator('.dialog', { hasText: 'Discard “Typed only”?' }).waitFor();
  await page.locator('.dialog .btn', { hasText: 'Keep going' }).click();
  assert.equal(await ev(page, async () => (await import('/js/store.js')).S.active.name), 'Typed only');
  ok('discarding a workout with typed numbers always asks, and says what gets lost (#15)');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 6. PR badge matches the summary (set volume, assisted) ----------
{
  const { ctx, page, errors } = await newPage();
  await ev(page, async () => {
    const st = await import('/js/store.js');
    const id = (n) => st.findExerciseByName(n).id;
    st.saveWorkout({ id: 'p', name: 'Before', startedAt: Date.now() - 3 * 86400000, endedAt: Date.now() - 3 * 86400000 + 3600000, templateId: null, exercises: [
      { id: 'a', exerciseId: id('Bench Press (Barbell)'), sets: [{ id: 'a1', type: 'normal', w: 100, r: 5 }] },
      { id: 'b', exerciseId: id('Pull Up (Assisted)'), sets: [{ id: 'b1', type: 'normal', w: 20, r: 8 }] },
    ] });
    st.startWorkout();
    st.addEntries(st.S.active, [id('Bench Press (Barbell)'), id('Pull Up (Assisted)')]);
    const [a, b] = st.S.active.exercises;
    a.sets[0].w = '70'; a.sets[0].r = '10'; // lower 1RM and weight, but more set volume
    b.sets[0].w = '20'; b.sets[0].r = '10'; // more reps with the same assistance
    st.touchActive();
    (await import('/js/ui.js')).openSheet();
  });
  await page.locator('#finish-workout').waitFor();
  for (const ex of ['Bench Press (Barbell)', 'Pull Up (Assisted)']) await block(page, ex).locator('button.check').first().click();
  for (const ex of ['Bench Press (Barbell)', 'Pull Up (Assisted)']) assert.ok((await block(page, ex).locator('.set-label').first().innerText()).includes('PR'), `${ex} badge`);
  await page.screenshot({ path: `${OUT}/fix-pr-badges.png` });
  await page.locator('#finish-workout').click();
  await page.locator('.dialog .btn-primary').click();
  await page.locator('.summary-hero').waitFor();
  const prs = await page.locator('.pr-list .cell').allInnerTexts();
  assert.ok(prs.some((x) => x.includes('Bench Press (Barbell)') && x.includes('Set volume')), prs.join(' | '));
  assert.ok(prs.some((x) => x.includes('Pull Up (Assisted)') && x.includes('Reps')), prs.join(' | '));
  ok('the live PR badge and the summary agree, including set volume and assisted exercises (#16)');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 7. drag and drop reordering ----------
for (const scheme of ['light', 'dark']) {
  const { ctx, page, errors } = await newPage({ scheme });
  await ev(page, async () => {
    const st = await import('/js/store.js');
    const id = (n) => st.findExerciseByName(n).id;
    st.startWorkout();
    st.addEntries(st.S.active, ['Squat (Barbell)', 'Romanian Deadlift (Barbell)', 'Leg Extension (Machine)', 'Lying Leg Curl (Machine)', 'Calf Press on Leg Press (Machine)'].map(id));
    st.touchActive();
    (await import('/js/ui.js')).openSheet();
  });
  await page.locator('#finish-workout').waitFor();
  const order = () => ev(page, async () => { const st = await import('/js/store.js'); return st.S.active.exercises.map((e) => st.exName(e.exerciseId)); });
  const start = await order();
  await page.locator(`button[aria-label="Options for ${start[0]}"]`).click();
  await pick(page, 'Reorder exercises');
  await page.locator('#reorder-done').waitFor();
  await page.waitForTimeout(500); // let the screen finish sliding in
  assert.equal(await page.locator('button[aria-label^="Move up"], button[aria-label^="Move down"]').count(), 0, 'no arrows');
  const rows = page.locator('.reorder-row');
  const handle = (i) => rows.nth(i).locator('.drag-handle');

  // drag the first row's handle down past the third row
  const h0 = await handle(0).boundingBox();
  const r2 = await rows.nth(2).boundingBox();
  await page.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2 + ((r2.y + r2.height * 0.75 - h0.y) * k) / 8);
  assert.equal(await page.locator('.reorder-row.lifted').count(), 1, 'the row lifts while dragging');
  const shifted = await rows.nth(1).evaluate((el) => getComputedStyle(el).transform);
  assert.notEqual(shifted, 'none', 'the rows in between slide up');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/reorder-drag-${scheme}.png` });
  await page.mouse.up();
  await page.waitForTimeout(100);
  let now = await order();
  assert.deepEqual(now, [start[1], start[2], start[0], start[3], start[4]]);
  assert.deepEqual(await rows.locator('.cell-title').allInnerTexts(), now, 'the list shows the new order');
  ok(`dragging the ≡ handle moves an exercise and the others slide out of the way (${scheme})`);

  if (scheme === 'light') {
    // press and hold a row with a finger, then drag it up to the top
    const r4 = await rows.nth(4).boundingBox();
    const top = await rows.nth(0).boundingBox();
    const x = r4.x + 60, y0 = r4.y + r4.height / 2;
    const touch = (type, y) => page.evaluate(([type, x, y]) => {
      const el = document.elementFromPoint(x, y) || document.querySelector('.reorder-list');
      const target = type === 'touchstart' ? el : window.__dragTarget;
      if (type === 'touchstart') window.__dragTarget = el;
      const t = new Touch({ identifier: 1, target, clientX: x, clientY: y });
      target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
    }, [type, x, y]);
    await touch('touchstart', y0);
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.reorder-row.lifted').count(), 1, 'a long press lifts the row');
    const target = top.y + 4;
    for (let k = 1; k <= 8; k++) await touch('touchmove', y0 + ((target - y0) * k) / 8);
    await touch('touchend', target);
    await page.waitForTimeout(100);
    const prev = now;
    now = await order();
    assert.deepEqual(now, [prev[4], prev[0], prev[1], prev[2], prev[3]]);
    ok('press and hold a row, then drag it (touch)');

    // a quick swipe scrolls instead of picking up the row
    await touch('touchstart', y0);
    await touch('touchmove', y0 - 40);
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.reorder-row.lifted').count(), 0);
    await touch('touchend', y0 - 40);
    assert.deepEqual(await order(), now);
    ok('a quick swipe doesn’t pick a row up');

    // keyboard
    await handle(0).focus();
    await page.keyboard.press('ArrowDown');
    const prev2 = now;
    now = await order();
    assert.deepEqual(now, [prev2[1], prev2[0], ...prev2.slice(2)]);
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), `Move ${prev2[0]}`);
    ok('the handle also moves an exercise with the arrow keys');
  }
  await page.locator('#reorder-done').click();
  const blocks = await page.locator('section.ex-block').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(blocks, now);
  ok(`the workout shows the new order after Done (${scheme})`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 8. unit switch round trip (changeSetting in core/settings.js) ----------
{
  const { ctx, page, errors } = await newPage();
  await ev(page, async () => {
    const st = await import('/js/store.js');
    st.startWorkout();
    (await import('/js/ui.js')).openSheet();
  });
  await page.locator('#finish-workout').waitFor();
  await ev(page, async () => {
    const st = await import('/js/store.js');
    st.setSetting('unit', 'lb');
    st.S.active.exercises = [];
    st.addEntries(st.S.active, [st.findExerciseByName('Bench Press (Dumbbell)').id, st.findExerciseByName('Bench Press (Barbell)').id]);
    st.S.active.exercises[0].sets[0].w = '70'; st.S.active.exercises[0].sets[0].r = '8';
    st.S.active.exercises[1].sets[0].w = '225'; st.S.active.exercises[1].sets[0].r = '5';
    st.touchActive();
  });
  for (const ex of ['Bench Press (Dumbbell)', 'Bench Press (Barbell)']) {
    await page.locator(`button[aria-label="Options for ${ex}"]`).click();
    await pick(page, 'Add warm-up sets');
  }
  const ws = await ev(page, async () => (await import('/js/store.js')).S.active.exercises.map((e) => e.sets.filter((s) => s.type === 'warmup').map((s) => +s.w)));
  assert.deepEqual(ws[0], [30, 40, 55]);
  assert.deepEqual(ws[1], [45, 90, 135, 180]);
  const lb = await ev(page, async () => { const s = (await import('/js/store.js')).S.settings; return [s.bar, s.plates[0]]; });
  assert.deepEqual(lb, [45, 45], 'switching to lb swaps the default plates and bar');
  // and back: typed numbers convert
  await ev(page, async () => { const st = await import('/js/store.js'); st.setSetting('unit', 'kg'); });
  const back = await ev(page, async () => { const st = await import('/js/store.js'); return [st.S.settings.bar, st.S.active.exercises[1].sets.find((s) => s.type !== 'warmup').w]; });
  assert.equal(back[0], 20);
  assert.ok(Math.abs(parseFloat(String(back[1]).replace(',', '.')) - 102.06) < 0.1, String(back[1]));
  ok('switching units swaps plates and bar and converts typed numbers (lb → kg: 225 lb = 102 kg)');
  assert.deepEqual(errors, []);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} checks passed`);
