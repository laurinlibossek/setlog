// Unit tests for setlog/js/core, run in plain Node (no browser): `npm test`.
// They also guard the boundary the Expo app relies on: core/ must not use the
// DOM, browser storage or anything outside core/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../setlog/js/core/index.js';
import { themesFromCss, render } from '../scripts/themes-from-css.mjs';
import { tallyFromTokens, render as renderTally } from '../scripts/tally-tokens.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'setlog');
const CORE = path.join(APP, 'js/core');
const DAY = 86400000;
const read = (p) => fs.readFileSync(p, 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// ---------- the boundary ----------
test('core uses no browser APIs and imports only core files', () => {
  for (const f of fs.readdirSync(CORE).filter((x) => x.endsWith('.js'))) {
    const src = stripComments(read(path.join(CORE, f)));
    const hit = src.match(/\b(window|document|localStorage|sessionStorage|navigator|location|indexedDB|fetch|XMLHttpRequest)\b/);
    assert.equal(hit, null, `${f} uses ${hit && hit[0]}`);
    for (const m of src.matchAll(/\bfrom\s+'([^']+)'/g)) assert.match(m[1], /^\.\/[\w-]+\.js$/, `${f} imports ${m[1]}`);
  }
});

// ---------- units ----------
test('numbers: decimal commas, input strings, plates, typed times', () => {
  assert.equal(core.parseNum('62,5'), 62.5);
  assert.equal(core.parseNum('1.234,5'), 1234.5);
  assert.equal(core.parseNum('abc'), null);
  assert.equal(core.numToInput(62.5, 2, ','), '62,5');
  assert.equal(core.numToInput(62.5, 2, '.'), '62.5');
  assert.deepEqual(core.parsePlates('25,20,15'), [25, 20, 15]);
  assert.deepEqual(core.parsePlates('25  20  2,5  1,25'), [25, 20, 2.5, 1.25]);
  assert.deepEqual(core.parsePlates('45, 35, 2.5'), [45, 35, 2.5]);
  assert.deepEqual(core.parsePlates('2,5'), [2.5]);
  assert.equal(core.digitsToSec('130'), 90);
  assert.equal(core.secToDigits(90), '130');
  assert.equal(core.fmtClock(3723), '1:02:03');
});

// ---------- calc ----------
test('1RM formulas and records', () => {
  assert.ok(Math.abs(core.est1RM(100, 5, 'epley') - 116.667) < 0.001);
  assert.ok(Math.abs(core.est1RM(100, 5, 'brzycki') - 112.5) < 0.001);
  assert.equal(core.est1RM(100, 1, 'mayhew'), 100);
  const bests = { e1rm: 116.67, weight: 100, volume: 500 };
  assert.deepEqual(core.newRecords({ type: 'normal', w: 70, r: 10 }, 'barbell', bests, 'epley', Date.now()), ['volume']);
  assert.deepEqual(core.newRecords({ type: 'warmup', w: 200, r: 10 }, 'barbell', bests, 'epley', Date.now()), []);
  assert.deepEqual(core.newRecords({ type: 'normal', w: 20, r: 10 }, 'assisted_bw', { reps: 8 }, 'epley', Date.now()), ['reps']);
  assert.deepEqual(core.loggedFields('cardio'), ['d', 't']);
});

test('warm-ups: loadable barbell weights, 5 lb dumbbell steps', () => {
  assert.deepEqual(core.warmupSets(100, 20, [25, 20, 15, 10, 5, 2.5, 1.25], true).map((s) => [s.w, s.r]), [[20, 10], [40, 5], [60, 3], [80, 2]]);
  assert.deepEqual(core.warmupSets(70, 45, [], false, core.DEFAULT_WARMUP, 5).map((s) => s.w), [30, 40, 55]);
});

// ---------- drafts ----------
test('drafts keep stored numbers when the text is untouched (no lb/mi drift)', () => {
  const st = { unit: 'lb', distUnit: 'mi' };
  const stored = { id: 's', type: 'normal', w: 61.2349, r: 5, d: 5.0123, t: 1500 };
  let s = stored;
  for (let i = 0; i < 5; i++) s = core.draftToSet(core.setToDraft(s, st), st);
  assert.equal(s.w, stored.w);
  assert.equal(s.d, stored.d);
  const d = core.setToDraft(stored, st);
  d.w = '140';
  assert.ok(Math.abs(core.draftToSet(d, st).w - 140 * core.KG_PER_LB) < 1e-9);
});

// ---------- effort: reps in reserve ----------
test('reps in reserve: stored on the set, RPE reads as it, survives drafts and the CSV', () => {
  // RPE 10 → 0, 9 → 1, 8 → 2, 7 and below → 3+; half points count towards failure
  assert.deepEqual([10, 9.5, 9, 8.5, 8, 7.5, 7, 6, 1].map(core.rirFromRpe), [0, 0, 1, 1, 2, 2, 3, 3, 3]);
  assert.equal(core.rirFromRpe('8,5'), 1, 'a draft keeps RPE as text');
  assert.equal(core.rirFromRpe(''), null);
  assert.equal(core.rirFromRpe(undefined), null);
  assert.deepEqual([0, 1, 2, 3, 5, '2', -1, null, '', 'x'].map(core.normRir), [0, 1, 2, 3, 3, 2, null, null, null, null]);
  assert.deepEqual([0, 1, 2, 3].map(core.rpeFromRir), [10, 9, 8, 7]);
  assert.equal(core.rpeFromRir(null), null);
  // a set's own rating wins over its RPE
  assert.equal(core.setRir({ rir: 1, rpe: 8 }), 1);
  assert.equal(core.setRir({ rpe: 8 }), 2);
  assert.equal(core.setRir({ type: 'normal', w: 60, r: 8 }), null);
  assert.equal(core.setRir(null), null);
  // drafts carry it both ways; rating clears the RPE
  const st = { unit: 'kg', distUnit: 'km' };
  const d = core.setToDraft({ id: 's', type: 'normal', w: 80, r: 8, rir: 2 }, st);
  assert.equal(d.rir, 2);
  assert.equal(core.draftToSet(d, st).rir, 2);
  assert.equal('rir' in core.draftToSet(core.setToDraft({ id: 's', type: 'normal', w: 80, r: 8 }, st), st), false);
  const draft = core.newSetDraft('normal', { w: '80', r: '8', rpe: '8.5' });
  core.rateSet(draft, 3);
  assert.equal(draft.rir, 3);
  assert.equal(draft.rpe, '');
  assert.deepEqual(core.draftToSet(draft, st), { id: draft.id, type: 'normal', w: 80, r: 8, rir: 3 });
  core.rateSet(draft, null);
  assert.equal('rir' in draft, false);
  // templates don't take a set's rating as a target
  const tpl = core.applyWorkoutToTemplate([E('a', [S('normal', 60, 8)])], { exercises: [E('a', [S('normal', 62.5, 8, { rir: 1 })])] }, { valuesOnly: true });
  assert.equal('rir' in tpl[0].sets[0], false);
  // Strong's CSV only knows RPE
  const exercises = new Map([['x', { id: 'x', name: 'Bench Press (Barbell)', category: 'barbell' }]]);
  const csv = core.exportCSV({ workouts: [{ id: 'w', name: 'Push', startedAt: Date.UTC(2026, 10, 3, 9), endedAt: Date.UTC(2026, 10, 3, 10), exercises: [E('x', [S('normal', 80, 8, { rir: 1 }), S('normal', 80, 8, { rpe: 8.5 }), S('normal', 80, 8)])] }], exercises });
  assert.deepEqual(csv.trim().split('\n').slice(1).map((l) => l.split(',').pop()), ['9', '8.5', '']);
});

// ---------- the session ----------
test('session: units keep supersets together, rounds alternate, the next set follows the person', () => {
  const set = (id, done = false) => ({ id, type: 'normal', w: '', r: '', d: '', t: '', rpe: '', done });
  const entry = (id, sets, supersetId = null) => ({ id, exerciseId: `x-${id}`, supersetId, sets });
  const draft = {
    exercises: [
      entry('a', [set('a1', true), set('a2', true)]),
      entry('b', [set('b1', true), set('b2'), set('b3')], 'S'),
      entry('c', [set('c1', true), set('c2')], 'S'),
      entry('d', [set('d1')]),
    ],
  };
  const units = core.sessionUnits(draft.exercises);
  assert.deepEqual(units.map((u) => u.entries.map((e) => e.id)), [['a'], ['b', 'c'], ['d']]);
  assert.deepEqual(core.unitSets(units[1]).map((x) => x.set.id), ['b1', 'c1', 'b2', 'c2', 'b3']);
  // the first unit with sets left, one superset round after another
  let st = core.sessionState(draft);
  assert.equal(st.unit.id, 'b');
  assert.equal(st.next.set.id, 'b2');
  // while resting after the last set of a, a stays on screen with nothing to log
  st = core.sessionState(draft, { restEntryId: 'a' });
  assert.equal(st.unit.id, 'a');
  assert.equal(st.next, null);
  // the exercise the person switched to wins, also over the rest
  st = core.sessionState(draft, { current: 'd', restEntryId: 'a' });
  assert.equal(st.next.set.id, 'd1');
  assert.equal(core.sessionState(draft, { current: 'c' }).unit.id, 'b', 'any exercise of a superset picks the superset');
  assert.equal(core.sessionState(draft, { current: 'gone' }).unit.id, 'b');
  // all done: the last unit, nothing next
  const done = { exercises: [entry('a', [set('a1', true)]), entry('d', [set('d1', true)])] };
  assert.equal(core.hasPendingSets(done), false);
  assert.equal(core.hasPendingSets(draft), true);
  st = core.sessionState(done);
  assert.equal(st.unit.id, 'd');
  assert.equal(st.next, null);
  assert.equal(core.sessionState({ exercises: [] }).unit, null);
  // moving a superset moves both of its exercises
  const list = draft.exercises.slice();
  assert.equal(core.moveUnit(list, 'd', 'b'), true);
  assert.deepEqual(list.map((e) => e.id), ['a', 'd', 'b', 'c']);
  assert.equal(core.moveUnit(list, 'b', 'a'), true);
  assert.deepEqual(list.map((e) => e.id), ['b', 'c', 'a', 'd']);
  assert.equal(core.moveUnit(list, 'b', 'b'), false);
  assert.equal(core.moveUnit(list, 'zz', 'b'), false);
  // the keypad's −/+ step: a pair of the smallest plates, the dumbbell rack's step
  assert.equal(core.weightStep('barbell', { unit: 'kg', plates: core.KG_PLATES }), 2.5);
  assert.equal(core.weightStep('barbell', { unit: 'kg', plates: [20, 10, 0.5] }), 1);
  assert.equal(core.weightStep('barbell', { unit: 'lb', plates: core.LB_PLATES }), 5);
  assert.equal(core.weightStep('dumbbell', { unit: 'kg' }), 2);
  assert.equal(core.weightStep('dumbbell', { unit: 'lb' }), 5);
  assert.equal(core.weightStep('machine', { unit: 'kg' }), 2.5);
});

// ---------- templates ----------
const E = (exerciseId, sets, extra = {}) => ({ exerciseId, sets, ...extra });
const S = (type, w, r, extra = {}) => ({ type, w, r, ...extra });
test('templateChanges pairs warm-ups and working sets separately', () => {
  const tpl = { exercises: [E('a', [S('warmup', 20, 10), S('normal', 60, 8), S('normal', 60, 8)]), E('b', [S('normal', 40, 8)])] };
  const skipWarmup = core.templateChanges(tpl, { exercises: [E('a', [S('normal', 60, 8), S('normal', 60, 8)]), tpl.exercises[1]] });
  assert.equal(skipWarmup.removedSets, 1);
  assert.equal(skipWarmup.valueSets, 0);
  assert.equal(skipWarmup.typesChanged, false);
  const reordered = core.templateChanges(tpl, { exercises: [tpl.exercises[1], tpl.exercises[0]] });
  assert.equal(reordered.reordered, true);
  assert.equal(core.templateChanges(tpl, JSON.parse(JSON.stringify(tpl))).structure, false);
});

test('applyWorkoutToTemplate: values only vs. the new structure; RPE is kept', () => {
  const tpl = [E('a', [S('warmup', 20, 10), S('normal', 60, 8)], { notes: 'Pause reps' }), E('b', [{ type: 'normal', r: 8 }])];
  const workout = { exercises: [E('a', [S('normal', 62.5, 8, { rpe: 8 }), S('failure', 62.5, 6)]), E('c', [{ type: 'normal', r: 12 }])] };
  const values = core.applyWorkoutToTemplate(tpl, workout, { valuesOnly: true });
  assert.deepEqual(values[0].sets, [S('warmup', 20, 10), S('normal', 62.5, 8, { rpe: 8 })]);
  assert.equal(values.length, 2);
  const all = core.applyWorkoutToTemplate(tpl, workout);
  assert.deepEqual(all.map((e) => e.exerciseId), ['a', 'c']);
  assert.equal(all[0].notes, 'Pause reps');
  const clean = core.cleanTemplateExercises([E('a', [S('normal', 60, 8, { rpe: 7, id: 'x', done: true })], { supersetId: 'g' }), E('gone', [])], (id) => id !== 'gone');
  assert.deepEqual(clean[0].sets, [S('normal', 60, 8, { rpe: 7 })]);
  assert.equal(clean.length, 1);
});

// ---------- suggestion ----------
test('suggested workout: rotation, weekday habit, a routine change after about two rounds', () => {
  const now = new Date(2026, 9, 14, 18, 0).getTime(); // a Wednesday
  const templates = ['Push', 'Pull', 'Legs', 'Upper'].map((name) => ({ id: name, name }));
  const run = (plan) => {
    const workouts = plan.map(([d, n], i) => ({ id: 'w' + i, name: n, templateId: n, startedAt: now - d * DAY - 8 * 3600000, exercises: [] }));
    const r = core.suggestTemplate(templates, workouts, now);
    return r && [r.template.name, r.why.kind];
  };
  const routine = (weeks, fresh) => {
    const plan = [];
    for (let w = weeks; w >= 1; w--) plan.push([7 * w + 2, 'Legs'], [7 * w, w <= fresh ? 'Upper' : 'Push'], [7 * w - 2, 'Pull']);
    plan.push([2, 'Legs']);
    return plan;
  };
  assert.equal(run(routine(10, 0))[0], 'Push');
  assert.equal(run(routine(10, 1))[0], 'Push');
  assert.equal(run(routine(10, 2))[0], 'Upper');
  assert.deepEqual(run([[23, 'Push'], [21, 'Pull'], [18, 'Legs'], [15, 'Push'], [12, 'Pull'], [10, 'Legs'], [6, 'Push'], [3, 'Pull']]), ['Legs', 'after']);
  assert.deepEqual(run([[28, 'Legs'], [26, 'Push'], [21, 'Legs'], [19, 'Pull'], [14, 'Legs'], [12, 'Push'], [7, 'Legs'], [2, 'Pull']]), ['Legs', 'weekday']);
  assert.equal(run([[3, 'Push']]), null);
});

// ---------- sessions ----------
test('previous sets prefer the same template; body weight on a day', () => {
  const sessions = core.sessionsByExercise([
    { id: 'old', startedAt: 1000, templateId: 'A', exercises: [E('x', [S('normal', 70, 5)])] },
    { id: 'new', startedAt: 2000, templateId: null, exercises: [E('x', [S('normal', 80, 5)])] },
  ]).get('x');
  assert.equal(core.previousSetsFrom(sessions)[0].w, 80);
  assert.equal(core.previousSetsFrom(sessions, { templateId: 'A' })[0].w, 70);
  assert.equal(core.previousSetsFrom(sessions, { before: 1500 })[0].w, 70);
  const ms = [{ type: 'bodyweight', value: 82, at: 300 }, { type: 'bodyweight', value: 80, at: 100 }];
  assert.equal(core.bodyweightFrom(ms, 200), 80);
  assert.equal(core.bodyweightFrom(ms, 50), 80);
  assert.equal(core.bodyweightFrom(ms, 400), 82);
});

// ---------- the running workout ----------
const ST = { ...core.DEFAULT_SETTINGS, unit: 'kg', distUnit: 'km' };
const BENCH = core.SEED_EXERCISES.find((e) => e.name === 'Bench Press (Barbell)');
const PULLUP = core.SEED_EXERCISES.find((e) => e.name === 'Pull Up');
test('starting from a template: targets as placeholders, last time beats the template', () => {
  const tpl = { id: 't1', name: 'Push', notes: 'Heavy day', exercises: [E(BENCH.id, [S('warmup', 40, 8), S('normal', 80, 8), S('normal', 80, 8)], { supersetId: 'g' }), E('gone', [S('normal', 10, 10)])] };
  const a = core.newActiveWorkout({ template: tpl, hasExercise: (id) => id !== 'gone', settings: ST, now: 1000 });
  assert.equal(a.name, 'Push');
  assert.equal(a.templateId, 't1');
  assert.equal(a.templateNotes, 'Heavy day');
  assert.equal(a.exercises.length, 1);
  assert.notEqual(a.exercises[0].supersetId, 'g');
  assert.equal(core.newActiveWorkout({ template: { ...tpl, example: true }, settings: ST }).templateId, null);
  const entry = a.exercises[0];
  // no history: the template's targets
  assert.deepEqual(core.placeholders(entry, null, ST).map((r) => [r.ph.w, r.ph.r]), [['40', '8'], ['80', '8'], ['80', '8']]);
  // history: last time's sets, warm-ups paired with warm-ups
  const rows = core.placeholders(entry, [S('normal', 85, 6)], ST);
  assert.deepEqual(rows.map((r) => r.ph.w), ['40', '85', '80']);
  assert.equal(rows[1].prev.w, 85);
  assert.equal(core.workoutNameKey(new Date(2026, 0, 1, 7).getTime()), 'Morning Workout');
});

test('checking off: fills from placeholders, says what is missing, rest after the superset round', () => {
  const a = core.newActiveWorkout({ settings: ST, name: 'Evening Workout' });
  a.exercises.push(...core.newEntries([BENCH.id, PULLUP.id], { previousSets: () => null }));
  const [bench, pull] = a.exercises;
  // nothing typed and nothing to fall back on
  let r = core.checkOffSet(a, bench, 0, { category: BENCH.category, ph: { w: '', r: '' }, rest: 120, settings: ST });
  assert.equal(r.problem, core.WORKOUT_MESSAGES.repsFirst);
  bench.sets[0].r = '8';
  r = core.checkOffSet(a, bench, 0, { category: BENCH.category, ph: { w: '', r: '' }, rest: 120, settings: ST });
  assert.equal(r.problem, core.WORKOUT_MESSAGES.weightFirst);
  r = core.checkOffSet(a, bench, 0, { category: BENCH.category, ph: { w: '80', r: '5', orig: { w: ['80', 80] } }, rest: 120, settings: ST });
  assert.deepEqual(r, { rest: 120 });
  assert.equal(bench.sets[0].done, true);
  assert.deepEqual([bench.sets[0].w, bench.sets[0].r], ['80', '8']);
  // body weight exercises need no weight
  r = core.checkOffSet(a, pull, 0, { category: PULLUP.category, ph: { r: '10' }, rest: 90, settings: ST });
  assert.equal(r.rest, 90);
  // supersets: rest only after the last exercise of the round
  core.joinSuperset(a.exercises, bench, pull);
  assert.deepEqual(a.exercises, [pull, bench], 'bench moves behind the exercise it joined');
  core.addSet(pull);
  r = core.checkOffSet(a, pull, 1, { category: PULLUP.category, ph: { r: '10' }, rest: 90, settings: ST });
  assert.equal(r.rest, 0, 'no rest between the exercises of a superset');
  core.addSet(bench); bench.sets[1].type = 'warmup';
  r = core.checkOffSet(a, bench, 1, { category: BENCH.category, ph: { w: '40', r: '5' }, rest: 120, settings: ST });
  assert.equal(r.rest, 60, 'after the round; warm-ups rest at most a minute');
  core.leaveSuperset(a.exercises, bench);
  assert.equal(pull.supersetId, null);
});

test('finishing: unchecked sets with numbers, progress, the saved workout', () => {
  const a = core.newActiveWorkout({ settings: ST, now: 10000, name: 'Morning Workout' });
  a.exercises.push(...core.newEntries([BENCH.id], { previousSets: () => [S('normal', 80, 5), S('normal', 80, 5)] }));
  const bench = a.exercises[0];
  assert.equal(bench.sets.length, 2);
  bench.sets[0].w = '82,5'; bench.sets[0].r = '5'; bench.sets[0].done = true;
  bench.sets[1].r = '4';
  assert.deepEqual(core.progressOf(a), { done: 1, typed: 1 });
  const prev = () => [S('normal', 80, 5), S('normal', 80, 5)];
  const pending = core.pendingSets(a, { exercises: new Map([[BENCH.id, BENCH]]), previousSets: prev, settings: ST });
  assert.equal(pending.length, 1);
  assert.deepEqual([pending[0].filled.w, pending[0].filled.r], ['80', '4'], 'the missing weight comes from last time');
  const noHistory = core.pendingSets(a, { exercises: new Map([[BENCH.id, BENCH]]), previousSets: () => null, settings: ST });
  assert.equal(noHistory[0].filled.w, '82,5', 'without history, from the row above');
  const w = core.finishWorkout(a, { settings: ST, exercises: new Map([[BENCH.id, BENCH]]), now: 20000, defaultName: 'X' });
  assert.equal(w.name, 'Morning Workout');
  assert.equal(w.endedAt, 10000 + 60000, 'at least a minute');
  assert.deepEqual(w.exercises[0].sets.map((s) => [s.w, s.r]), [[82.5, 5]]);
  a.name = '  ';
  assert.equal(core.finishWorkout(a, { settings: ST, exercises: new Map([[BENCH.id, BENCH]]), defaultName: 'X' }).name, 'X');
});

test('warm-ups, replacing an exercise, moving entries', () => {
  const entry = core.newEntryDraft(BENCH.id, 1);
  const rows = core.placeholders(entry, [S('normal', 100, 5)], ST);
  assert.deepEqual(core.addWarmups(entry, rows, 'barbell', ST), { added: 4 });
  assert.deepEqual(entry.sets.map((s) => [s.type, s.w]), [['warmup', '20'], ['warmup', '40'], ['warmup', '60'], ['warmup', '80'], ['normal', '']]);
  assert.deepEqual(core.addWarmups(core.newEntryDraft(BENCH.id, 1), [{ ph: {} }], 'barbell', ST), { problem: core.WORKOUT_MESSAGES.warmupNeedsWeight });
  entry.restSec = 180; entry.focus = 'volume'; entry.sets[4].w = '100'; entry.sets[4].r = '5';
  core.replaceExercise(entry, BENCH, PULLUP);
  assert.deepEqual([entry.exerciseId, entry.restSec, entry.focus, entry.sets[4].w], [PULLUP.id, null, null, '']);
  const list = ['a', 'b', 'c'];
  assert.equal(core.moveItem(list, 0, 2), true);
  assert.deepEqual(list, ['b', 'c', 'a']);
  assert.equal(core.restFor({ restSec: null }, { restSec: 90 }, 120), 90);
  assert.equal(core.restFor({}, {}, 120), 120);
});

// ---------- editing templates and finished workouts ----------
test('template editor: from a template or a workout, saving, problems', () => {
  const ex = new Map([[BENCH.id, BENCH], [PULLUP.id, PULLUP]]);
  const tpl = {
    id: 't1', name: 'Upper', folder: 'A', notes: 'n', createdAt: 5, lastUsedAt: 9,
    exercises: [
      { exerciseId: BENCH.id, notes: 'grip', supersetId: 'g', restSec: 90, sets: [{ type: 'normal', w: 80, r: 5 }, { type: 'normal', r: 8 }] },
      { exerciseId: PULLUP.id, supersetId: 'g', sets: [{ type: 'normal', r: 10 }] },
      { exerciseId: 'gone', sets: [{ type: 'normal', r: 1 }] },
    ],
  };
  const d = core.templateDraft({ template: tpl, settings: ST, hasExercise: (id) => ex.has(id) });
  assert.deepEqual([d.kind, d.id, d.name, d.folder, d.notes, d.exercises.length], ['template', 't1', 'Upper', 'A', 'n', 2]);
  assert.notEqual(d.exercises[0].supersetId, 'g', 'fresh superset ids');
  assert.equal(d.exercises[0].supersetId, d.exercises[1].supersetId);
  assert.deepEqual([d.exercises[0].sets[0].w, d.exercises[0].sets[1].w, d.exercises[0].notes], ['80', '', 'grip']);
  d.exercises[0].sets[1].w = '85';
  const r = core.templateFromDraft(d, { settings: ST, exercises: ex, existing: tpl, now: 100 });
  assert.equal(r.problem, undefined);
  assert.deepEqual([r.template.createdAt, r.template.lastUsedAt, r.template.name], [5, 9, 'Upper'], 'other fields are kept');
  assert.deepEqual(r.template.exercises[0].sets, [{ type: 'normal', w: 80, r: 5 }, { type: 'normal', w: 85, r: 8 }]);
  assert.equal(r.template.exercises[0].restSec, 90);
  assert.equal('id' in r.template.exercises[0].sets[0], false, 'template sets have no ids');
  d.name = '  ';
  assert.equal(core.templateFromDraft(d, { settings: ST, exercises: ex }).problem, core.EDIT_MESSAGES.templateName);
  const fromWorkout = core.templateDraft({ workout: { name: 'Leg day', notes: 'tired', exercises: [{ exerciseId: BENCH.id, notes: 'x', sets: [S('normal', 100, 3)] }] }, settings: ST });
  assert.deepEqual([fromWorkout.name, fromWorkout.notes, fromWorkout.exercises[0].notes, fromWorkout.folder], ['Leg day', '', '', '']);
  assert.notEqual(fromWorkout.id, undefined);
  const empty = core.templateDraft({ settings: ST });
  empty.name = 'New';
  assert.equal(core.templateFromDraft(empty, { settings: ST, exercises: ex }).problem, core.EDIT_MESSAGES.templateEmpty);
  empty.exercises.push(core.newEntryDraft(BENCH.id, 3));
  const made = core.templateFromDraft(empty, { settings: ST, exercises: ex, now: 7 }).template;
  assert.deepEqual([made.createdAt, made.exercises[0].sets.length], [7, 3], 'empty sets are kept in templates');
});

test('edit workout: kept ids, duration in minutes, incomplete sets dropped', () => {
  const ex = new Map([[BENCH.id, BENCH]]);
  const w = {
    id: 'w1', name: 'Push', startedAt: 1000, endedAt: 1000 + 61 * 60000, templateId: 't', source: 'strong',
    exercises: [{ id: 'e1', exerciseId: BENCH.id, sets: [S('normal', 80, 5), S('normal', 80, 4)] }],
  };
  const d = core.workoutEditDraft(w, ST, (id) => ex.has(id));
  assert.deepEqual([d.kind, d.id, d.durationMin, d.exercises[0].id, d.templateId], ['edit', 'w1', '61', 'e1', 't']);
  d.exercises[0].sets[1].r = '';
  d.durationMin = '45,4';
  const r = core.workoutFromEditDraft(d, { settings: ST, exercises: ex, defaultName: 'Workout' });
  assert.deepEqual([r.workout.endedAt, r.workout.exercises[0].sets.length, r.workout.source, r.workout.name], [1000 + 45 * 60000, 1, 'strong', 'Push']);
  assert.equal(r.workout.exercises[0].sets[0].w, 80, 'untouched weights keep the stored number');
  d.exercises[0].sets[0].r = '';
  assert.equal(core.workoutFromEditDraft(d, { settings: ST, exercises: ex }).problem, core.EDIT_MESSAGES.workoutEmpty);
});

test('copies, folders, new exercises, exercise changes waiting in a draft', () => {
  const c = core.copyTemplateRecord({ name: 'A', folder: 'F', exercises: [{ exerciseId: 'x', sets: [{ w: 1, r: 2, id: 'z' }] }, { exerciseId: 'gone', sets: [] }] }, { patch: { name: 'A (copy)' }, hasExercise: (id) => id === 'x', now: 3 });
  assert.deepEqual([c.name, c.folder, c.createdAt, c.exercises.length, c.exercises[0].sets[0]], ['A (copy)', 'F', 3, 1, { type: 'normal', w: 1, r: 2 }]);
  assert.deepEqual(core.folderNames([{ folder: 'B' }, { folder: '' }, { folder: 'A' }, { folder: 'B' }], ['C', 'A']), ['A', 'B', 'C']);
  const lib = new Map([[BENCH.id, BENCH]]);
  assert.equal(core.findExerciseByName(lib, `  ${BENCH.name.toUpperCase()} `), BENCH);
  assert.equal(core.findExerciseByName([BENCH], 'nope'), null);
  const e = core.newExerciseRecord({ name: ' Incline Row (Dumbbell) ', category: 'dumbbell', bodyPart: 'back' }, { now: 1 });
  assert.deepEqual([e.id, e.name, e.createdAt], ['c-incline-row-dumbbell', 'Incline Row (Dumbbell)', 1]);
  assert.notEqual(core.newExerciseRecord({ name: 'Incline Row (Dumbbell)' }, { hasId: () => true }).id, 'c-incline-row-dumbbell');
  const draft = { exercises: [] };
  core.patchDraftExercise(draft, BENCH.id, { restSec: 60 });
  core.patchDraftExercise(draft, BENCH.id, { pinnedNote: 'p' });
  assert.deepEqual([core.exerciseInDraft(lib, draft, BENCH.id).restSec, core.exerciseInDraft(lib, draft, BENCH.id).pinnedNote], [60, 'p']);
  assert.equal(core.exerciseInDraft(lib, null, BENCH.id), BENCH);
});

test('chart ticks, weekly counts and the streak', () => {
  assert.deepEqual(core.niceTicks(81, 99), [80, 85, 90, 95, 100]);
  assert.deepEqual(core.niceTicks(0, 3, 3, { zero: true }), [0, 1, 2, 3]);
  assert.deepEqual(core.niceTicks(50, 50), [45, 47.5, 50, 52.5, 55]);
  assert.equal(core.niceTicks(100, 400, 4, { time: true })[1] - core.niceTicks(100, 400, 4, { time: true })[0], 120);
  assert.equal(core.tickDecimals([1, 1.5, 2]), 1);
  const now = new Date(2026, 9, 21, 12).getTime(); // a Wednesday
  const day = (d) => new Date(2026, 9, d, 18).getTime();
  const ws = [day(20), day(19), day(14), day(13), day(12), day(6)].map((t) => ({ startedAt: t }));
  const weeks = core.weeklyCounts(ws, { weeks: 3, weekStart: 1, now });
  assert.deepEqual(weeks.map((x) => x.value), [1, 3, 2]);
  assert.equal(weeks[2].start, new Date(2026, 9, 19).getTime());
  assert.equal(core.weekStreak(ws, { goal: 2, weekStart: 1, now }), 2);
  assert.equal(core.weekStreak(ws, { goal: 3, weekStart: 1, now }), 1, 'this week doesn’t count until it reaches the goal');
});

test('History calendar: the grid from the week start, workouts per day, the month’s totals', () => {
  const at = (m, d, h = 18, min = 0) => new Date(2026, m, d, h, min).getTime();
  const w = (start, minutes) => ({ id: String(start), startedAt: start, endedAt: start + minutes * 60000 });
  const ws = [w(at(11, 1), 30), w(at(10, 30, 19), 60), w(at(10, 30, 7), 45), w(at(10, 3), 50), w(at(9, 31), 40)];
  // November 2026 starts on a Sunday and ends on a Monday
  const mon = core.calendarMonth(ws, at(10, 17), { weekStart: 1 });
  assert.equal(mon.start, new Date(2026, 10, 1).getTime());
  assert.equal(mon.days.length, 42, 'Monday weeks: Nov 30 needs a sixth row');
  assert.equal(mon.days[0], new Date(2026, 9, 26).getTime());
  assert.equal(new Date(mon.days[0]).getDay(), 1);
  const sun = core.calendarMonth(ws, at(10, 17), { weekStart: 0 });
  assert.equal(sun.days.length, 35, 'Sunday weeks fit in five rows');
  assert.equal(sun.days[0], mon.start);
  assert.equal(mon.workouts, 3, 'Oct 31 and Dec 1 are outside the month');
  assert.equal(mon.daysTrained, 2, 'two workouts on the 30th count as one day');
  assert.equal(mon.time, (60 + 45 + 50) * 60000);
  assert.equal(mon.byDay.get(new Date(2026, 10, 30).getTime()).length, 2);
  assert.ok(mon.byDay.has(new Date(2026, 9, 31).getTime()), 'days of the month before in the grid show their workouts');
  assert.ok(!sun.byDay.has(new Date(2026, 9, 31).getTime()), 'but not outside the grid');
  const empty = core.calendarMonth([], at(1, 10));
  assert.equal(empty.workouts + empty.daysTrained + empty.time, 0);
  assert.equal(empty.days.length % 7, 0);
});

test('Today: the week strip plans usual days up to the goal, from today on', () => {
  const at = (m, d, h = 18) => new Date(2026, m, d, h).getTime();
  // Tuesday 3 November 2026; usually Monday, Thursday and Saturday
  const now = at(10, 3, 9);
  const usual = [];
  for (let wk = 1; wk <= 8; wk++) for (const d of [2, 5, 7]) usual.push({ startedAt: at(10, d - 7 * wk) });
  const ws = [{ startedAt: at(10, 2) }, ...usual, { startedAt: at(9, 1) }];
  const strip = core.weekStrip(ws, { weekStart: 1, goal: 4, now });
  assert.equal(strip.days.length, 7);
  assert.equal(strip.days[0].start, new Date(2026, 10, 2).getTime(), 'the week starts on Monday');
  assert.equal(strip.today, 1);
  assert.deepEqual(strip.days.map((d) => d.done), [1, 0, 0, 0, 0, 0, 0]);
  assert.equal(strip.done, 1);
  assert.deepEqual(strip.days.map((d) => d.planned), [false, false, false, true, false, true, false], 'Thursday and Saturday; Monday is past');
  const two = core.weekStrip(ws, { weekStart: 1, goal: 2, now });
  assert.deepEqual(two.days.map((d) => d.planned), [false, false, false, true, false, false, false], 'only as many as the goal needs');
  const sun = core.weekStrip(ws, { weekStart: 0, goal: 4, now });
  assert.equal(sun.today, 2);
  assert.equal(sun.days[0].start, new Date(2026, 10, 1).getTime());
  const fresh = core.weekStrip([], { weekStart: 1, goal: 3, now });
  assert.ok(fresh.days.every((d) => !d.done && !d.planned), 'no history, nothing planned');
  const met = core.weekStrip([...ws, { startedAt: at(10, 3, 7) }, { startedAt: at(10, 3, 8) }, { startedAt: at(10, 3, 8) }], { weekStart: 1, goal: 4, now });
  assert.ok(met.days.every((d) => !d.planned), 'the goal is reached');
});

test('Today: working sets per muscle in the last 7 days, and a routine’s size', () => {
  const now = new Date(2026, 10, 3, 12).getTime();
  const lib = new Map([
    ['bench', { id: 'bench', bodyPart: 'chest', category: 'barbell' }],
    ['row', { id: 'row', bodyPart: 'back', category: 'barbell', restSec: 90 }],
    ['run', { id: 'run', bodyPart: 'cardio', category: 'cardio' }],
  ]);
  const sets = (n, warm = 0) => [...Array(warm).fill({ type: 'warmup' }), ...Array(n).fill({ type: 'normal' })];
  const w = (day, exercises) => ({ startedAt: new Date(2026, 10, day, 8).getTime(), exercises });
  const ws = [
    w(3, [{ exerciseId: 'row', sets: sets(3) }, { exerciseId: 'bench', sets: sets(4, 2) }]),
    w(1, [{ exerciseId: 'run', sets: sets(1) }, { exerciseId: 'gone', sets: sets(5) }, { exerciseId: 'bench', sets: [{ type: 'drop' }] }]),
    w(-4, [{ exerciseId: 'bench', sets: sets(9) }]), // 27 October: outside the 7 days
  ];
  assert.deepEqual(core.setsPerMuscle(ws, lib, { now }), [
    { muscle: 'chest', label: 'Chest', sets: 5 },
    { muscle: 'back', label: 'Back', sets: 3 },
  ], 'chest first; warm-ups, cardio and unknown exercises don’t count');
  assert.deepEqual(core.setsPerMuscle(ws, Object.fromEntries(lib), { now, days: 14 }).map((m) => m.sets), [14, 3]);
  assert.deepEqual(core.setsPerMuscle([], lib, { now }), []);

  const t = { exercises: [
    { exerciseId: 'bench', sets: sets(3, 2) },
    { exerciseId: 'row', sets: sets(3) },
    { exerciseId: 'gone', sets: sets(3) },
  ] };
  // bench: 2 × (30 + 60) + 3 × (45 + 120); row: 3 × (45 + 90) minus the last rest
  assert.deepEqual(core.routineSize(t, lib, { defaultRest: 120 }), { exercises: 2, sets: 6, minutes: 15 });
  assert.equal(core.routineSize({ exercises: [] }, lib).minutes, 0);
  assert.equal(core.routineSize({ exercises: [{ exerciseId: 'bench', sets: sets(1) }] }, lib).minutes, 5, 'at least 5 minutes');
});

test('merging exercises: same logged fields only; the target keeps its own rest timer and notes', () => {
  const bench = { id: 'x-bench', category: 'barbell', restSec: null, notes: '', pinnedNote: 'Arch' };
  const db = { id: 'x-db', category: 'dumbbell', restSec: 90, notes: 'Slow', pinnedNote: 'Elbows in' };
  const plank = { id: 'x-plank', category: 'duration' };
  const run = { id: 'x-run', category: 'cardio' };
  assert.equal(core.canMergeExercises(db, bench), true, 'weight and reps both');
  assert.equal(core.canMergeExercises(db, plank), false);
  assert.equal(core.canMergeExercises(plank, run), false, 'time vs. distance and time');
  assert.equal(core.canMergeExercises(bench, bench), false, 'not into itself');
  assert.equal(core.canMergeExercises(bench, undefined), false);
  assert.deepEqual(core.mergeExercisePatch(db, bench), { restSec: 90, notes: 'Slow' }, 'the pinned note stays the target’s');
  assert.deepEqual(core.mergeExercisePatch(bench, db), {}, 'a target with everything keeps it');
  assert.deepEqual(core.mergeExercisePatch({ restSec: 0 }, { restSec: undefined }), { restSec: 0 }, 'a timer set to off counts');
  const ws = [
    { id: 'a', exercises: [{ id: 'e1', exerciseId: 'x-db', sets: [] }, { id: 'e2', exerciseId: 'x-row', sets: [] }] },
    { id: 'b', exercises: [{ id: 'e3', exerciseId: 'x-row', sets: [] }] },
  ];
  const before = JSON.stringify(ws);
  const changed = core.moveExerciseEntries(ws, 'x-db', 'x-bench');
  assert.deepEqual(changed.map((x) => x.id), ['a']);
  assert.deepEqual(changed[0].exercises.map((e) => e.exerciseId), ['x-bench', 'x-row']);
  assert.equal(changed[0].exercises[1], ws[0].exercises[1], 'untouched entries keep their identity');
  assert.equal(JSON.stringify(ws), before, 'the records passed in stay as they were');
});

test('warm-up scheme from the editor: decimal commas, empty and odd rows dropped, sorted', () => {
  assert.deepEqual(core.warmupFromInput('8', [['60', '3'], ['42,5', '5'], ['', '4'], ['100', '1'], ['70', '0'], ['85', '1,4']]),
    { barReps: 8, steps: [[42.5, 5], [60, 3], [85, 1]] });
  assert.deepEqual(core.warmupFromInput('', []), { barReps: 0, steps: [] });
  assert.deepEqual(core.warmupFromInput('-3', [['50', '5']]), { barReps: 0, steps: [[50, 5]] });
  const s = core.warmupFromInput('10', [['40', '5'], ['80', '2']]);
  assert.equal(core.warmupSets(100, 20, core.KG_PLATES, true, s).length, 3, 'the result works as a scheme');
});

// ---------- Strong CSV ----------
const STRONG = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-09-01 18:00:00,"Upper",1h 5m,"T Bar Row",W,60,6,0,0,"","Felt strong",
2026-09-01 18:00:00,"Upper",1h 5m,"T Bar Row",1,110,7,0,0,"","Felt strong",8
2026-09-01 18:00:00,"Upper",1h 5m,"T Bar Row",Rest Timer,0,0,0,150,"Last two sets Kelso","Felt strong",
2026-09-01 18:00:00,"Upper",1h 5m,"Mystery Machine",1,40,12,0,0,"","Felt strong",
2026-09-03 18:00:00,"Run",30m,"Running",1,0,0,5,1800,"","",
`;
const builtins = new Map(core.SEED_EXERCISES.map((e) => [e.name.toLowerCase(), e]));
const findExercise = (n) => builtins.get(n.toLowerCase()) || null;

test('Strong import: set types, rest timer rows, notes, units, new exercises', () => {
  const r = core.parseStrongCSV(STRONG, { weightUnit: 'lb', distUnit: 'mi', findExercise });
  assert.equal(r.workouts.length, 2);
  const upper = r.workouts[0];
  assert.equal(upper.notes, 'Felt strong');
  assert.equal(upper.endedAt - upper.startedAt, 65 * 60000);
  const row = upper.exercises[0];
  assert.deepEqual(row.sets.map((s) => s.type), ['warmup', 'normal']);
  assert.ok(Math.abs(row.sets[1].w - 110 * core.KG_PER_LB) < 1e-3);
  assert.equal(row.sets[1].rpe, 8);
  assert.equal(row.restSec, 150);
  assert.equal(row.notes, 'Last two sets Kelso');
  assert.deepEqual(r.exercises.map((e) => [e.name, e.category]), [['Mystery Machine', 'machine']]);
  assert.ok(Math.abs(r.workouts[1].exercises[0].sets[0].d - 5 * core.KM_PER_MI) < 1e-6);
  assert.throws(() => core.parseStrongCSV('a,b\n1,2', {}), /doesn’t look like a Strong export/);
});

test('own CSV export re-imports as duplicates (seconds vs. milliseconds) with Strong-style durations', () => {
  const ex = core.SEED_EXERCISES.find((e) => e.name === 'Bench Press (Barbell)');
  const workouts = [{ id: 'a', name: 'Push', startedAt: Date.UTC(2026, 9, 1, 16, 0, 0, 123), endedAt: Date.UTC(2026, 9, 1, 17, 5, 0), exercises: [E(ex.id, [S('normal', 80, 8)])] }];
  const csv = core.exportCSV({ workouts, exercises: new Map([[ex.id, ex]]) });
  assert.match(csv, /,1h 5m,/);
  const again = core.parseStrongCSV(csv, { weightUnit: 'kg', findExercise, workouts });
  assert.equal(again.workouts.length, 0);
  assert.equal(again.stats.duplicates, 1);
  assert.deepEqual([core.strongDuration(45 * 60000), core.strongDuration(2 * 3600000)], ['45m', '2h']);
});

// ---------- backup ----------
test('backups round-trip, count as the latest backup and restore the built-in library', () => {
  const data = { exercises: [], workouts: [{ id: 'w' }], templates: [], measurements: [], kv: { meta: { lastBackupAt: 5 } } };
  const now = new Date('2026-10-13T20:00:00Z');
  const back = core.parseBackup(core.makeBackup(data, '1.6.0', now), core.SEED_EXERCISES);
  assert.equal(back.data.workouts.length, 1);
  assert.equal(back.data.kv.meta.lastBackupAt, now.getTime());
  assert.equal(back.data.exercises.length, core.SEED_EXERCISES.length);
  assert.throws(() => core.parseBackup('{', []), /isn’t valid JSON/);
  try { core.parseBackup(JSON.stringify({ app: 'setlog', data: { workouts: 3 } }), []); assert.fail(); } catch (e) {
    assert.equal(e.message, 'The backup is damaged ({part}).');
    assert.deepEqual(e.vars, { part: 'workouts' });
  }
});

// ---------- share links ----------
test('template links round-trip and reject junk', () => {
  const bench = core.SEED_EXERCISES.find((e) => e.name === 'Bench Press (Barbell)');
  const custom = { id: 'c-curl', name: 'Bayesian Curl (Cable)', category: 'machine', bodyPart: 'arms' };
  const t = { name: 'Push', notes: 'Heavy', exercises: [E(bench.id, [S('warmup', 60, 6), S('normal', 110, 7)], { restSec: 150, supersetId: 'g' }), E(custom.id, [{ type: 'normal', r: 12 }], { supersetId: 'g' })] };
  const code = core.encodeTemplate(t, new Map([[bench.id, bench], [custom.id, custom]]));
  const back = core.decodeTemplate(`try this #template=${code} !`, { categories: core.CATEGORIES.map((c) => c.id), bodyParts: core.BODY_PARTS.map((b) => b.id) });
  assert.equal(back.name, 'Push');
  assert.equal(back.exercises[0].id, bench.id);
  assert.deepEqual(back.exercises[0].sets, [S('warmup', 60, 6), S('normal', 110, 7)]);
  assert.equal(back.exercises[1].name, 'Bayesian Curl (Cable)');
  assert.equal(back.exercises[0].group, back.exercises[1].group);
  assert.equal(core.decodeTemplate('#template=!!!notbase64'), null);
});

// ---------- search ----------
test('exercise search: shortcuts as whole words, accents ignored', () => {
  const find = (q) => core.SEED_EXERCISES.filter((e) => core.matchExercise(e, q)).map((e) => e.name);
  const benchBB = find('bench bb');
  assert.ok(benchBB.includes('Bench Press (Barbell)'));
  assert.ok(!benchBB.some((n) => /Dumbbell/.test(n)), benchBB.join(', '));
  assert.ok(find('bench db').every((n) => /Dumbbell/.test(n)));
  assert.ok(find('ohp').some((n) => n.startsWith('Overhead Press')));
  assert.ok(find('pullup').includes('Pull Up'));
  assert.ok(!find('bi').some((n) => /Bike|Cycling/.test(n)));
  assert.equal(core.matchExercise({ name: 'Rückenstrecker' }, 'ruck'), true);
  assert.equal(core.matchExercise({ name: 'Rückenstrecker' }, 'rück'), true);
  assert.equal(core.matchExercise({ name: 'Leg Press' }, ''), true);
});

// ---------- i18n ----------
const DE = core.DICTIONARIES.de;
test('translator fills placeholders and falls back to English', () => {
  const de = core.translator('de');
  assert.equal(de('Set {label}', { label: 3 }), 'Satz 3');
  assert.equal(de('No such text'), 'No such text');
  assert.equal(core.translator('en')('Set {label}', { label: 3 }), 'Set 3');
  assert.equal(core.pickLanguage(['de-AT', 'en']), 'de');
});

test('every label in core and every tr() text in the web app has German', () => {
  const keep = new Set(['Push', 'Pull', 'Legs', 'Push / Pull / Legs', 'Epley', 'Brzycki', 'Lombardi', 'Mayhew', 'O’Conner', 'Wathen', 'Lander']);
  const labels = [
    ...core.CATEGORIES, ...core.BODY_PARTS, ...core.MEASUREMENTS, ...core.FORMULAS,
    ...['barbell', 'reps', 'cardio', 'duration', 'assisted_bw'].flatMap((c) => core.chartMetricsFor(c)),
  ].map((x) => x.label).concat(Object.values(core.PR_LABEL), Object.values(core.FOCUS_LABEL), Object.values(core.WORKOUT_MESSAGES),
    Object.values(core.EDIT_MESSAGES), Object.values(core.CATEGORY_HELP), [...core.EXERCISE_RANGES, ...core.MEASURE_RANGES].map((r) => r.label),
    ['Night Workout', 'Morning Workout', 'Afternoon Workout', 'Evening Workout'], core.EXAMPLE_TEMPLATES.flatMap((t) => [t.name, t.folder]));
  const missing = new Set(labels.filter((l) => !keep.has(l) && DE[l] === undefined));
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== 'vendor' && f !== 'core') walk(p); } else if (p.endsWith('.js')) files.push(p); } };
  walk(path.join(APP, 'js'));
  for (const f of files) {
    for (const m of read(f).matchAll(/\btr\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      const key = m[2].replace(/\\'/g, "'");
      if (!key.includes('${') && DE[key] === undefined) missing.add(key);
    }
  }
  assert.deepEqual([...missing], []);
});

test('every tr() text in the iPhone and Android app has German', () => {
  const keep = new Set(['English', 'Deutsch']);
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(p)) files.push(p); } };
  walk(path.join(ROOT, 'app/src'));
  const missing = new Set();
  for (const f of files) {
    for (const m of read(f).matchAll(/\btr\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      const key = m[2].replace(/\\'/g, "'");
      if (!key.includes('${') && !keep.has(key) && DE[key] === undefined) missing.add(`${path.relative(ROOT, f)}: ${key}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('the German dictionary has no duplicate keys', () => {
  const keys = [...read(path.join(CORE, 'i18n-de.js')).matchAll(/^\s*('(?:\\.|[^'])*'|[A-Za-z_]\w*):\s/gm)].map((m) => m[1].replace(/^'|'$/g, ''));
  const seen = new Set(), dupes = [];
  for (const k of keys) { if (seen.has(k)) dupes.push(k); seen.add(k); }
  assert.deepEqual(dupes, []);
});

// ---------- themes ----------
test('core/themes.js matches the colours in app.css (run `npm run themes` after changing them)', () => {
  assert.equal(read(path.join(CORE, 'themes.js')), render(themesFromCss(read(path.join(APP, 'css/app.css')))));
  assert.equal(core.paletteFor('system', true), core.THEMES.dark);
  assert.equal(core.THEMES['intense-red'].colors.accent, '#e5202e');
});

test('weekStreak counts each week in one pass, the same as filtering per week', () => {
  const now = Date.UTC(2026, 10, 3, 12);
  const slow = (ws, { goal, weekStart }) => {
    const count = (st) => ws.filter((w) => w.startedAt >= st && w.startedAt < core.addDays(st, 7)).length;
    let week = core.startOfWeek(now, weekStart), streak = 0;
    if (count(week) >= goal) streak++;
    week = core.addDays(week, -7);
    while (count(week) >= goal && streak < 520) { streak++; week = core.addDays(week, -7); }
    return streak;
  };
  let seed = 7; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ws = [];
  for (let t = now - 400 * DAY; t < now; t += (0.6 + rand() * 2.4) * DAY) ws.push({ id: 'w' + ws.length, startedAt: Math.round(t) });
  for (const goal of [1, 2, 3, 4]) for (const weekStart of [0, 1]) {
    assert.equal(core.weekStreak(ws, { goal, weekStart, now }), slow(ws, { goal, weekStart }), `goal ${goal}, week starts ${weekStart}`);
  }
});

// ---------- Tally design tokens ----------
test('app/src/design/tally.ts matches docs/design/tokens.json (run `npm run tally` after changing it)', () => {
  const tally = tallyFromTokens(JSON.parse(read(path.join(ROOT, 'docs/design/tokens.json'))));
  assert.equal(read(path.join(ROOT, 'app/src/design/tally.ts')), renderTally(tally));
  assert.deepEqual(Object.keys(tally.themes), ['light', 'dark', 'strawberry-matcha', 'intense-red']);
  assert.equal(tally.themes.dark.colors.paper, '#000000', 'dark themes are true black');
  assert.equal(tally.themes.light.colors.strokeDone, tally.themes.light.colors.ink, 'aliases resolve');
  assert.equal(tally.themes['intense-red'].scheme, 'dark');
});

// ---------- German exercise names ----------
test('German exercise names: every built-in has one, shown only in German and only while not renamed', () => {
  const de = core.EXERCISE_NAMES_DE;
  assert.deepEqual(core.SEED_EXERCISES.filter((e) => !de[e.name]).map((e) => e.name), []);
  assert.deepEqual(Object.keys(de).filter((n) => !core.SEED_EXERCISES.some((e) => e.name === n)), []);
  const names = Object.values(de);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), [], 'German names are unique');
  // every equipment variant of one exercise uses the same German base term (Reverse Fly → Reverse Flys, …)
  const base = (n) => n.replace(/\s*\(.*\)$/, '');
  const groups = new Map();
  for (const e of core.SEED_EXERCISES) groups.set(base(e.name), [...(groups.get(base(e.name)) || []), base(de[e.name])]);
  const mixed = [...groups].filter(([, g]) => new Set(g).size > 1).map(([en, g]) => `${en}: ${[...new Set(g)].join(' / ')}`);
  assert.deepEqual(mixed, []);
  const bench = core.SEED_EXERCISES.find((e) => e.id === 'x-bench-press-barbell');
  assert.equal(core.exerciseDisplayName(bench, 'de'), 'Bankdrücken (Langhantel)');
  assert.equal(core.exerciseDisplayName(bench, 'en'), 'Bench Press (Barbell)');
  assert.equal(core.exerciseDisplayName({ ...bench, name: 'Flat Bench' }, 'de'), 'Flat Bench', 'a renamed built-in keeps its name');
  assert.equal(core.exerciseDisplayName({ id: 'c-bench-press-barbell', name: 'Bench Press (Barbell)' }, 'de'), 'Bench Press (Barbell)', 'custom ones keep theirs');
  assert.equal(core.exerciseDisplayName(undefined, 'de'), '');
  // search finds built-ins by either name, in either language
  const find = (q) => core.SEED_EXERCISES.filter((e) => core.matchExercise(e, q)).map((e) => e.id);
  assert.deepEqual(find('latzug'), find('lat pulldown'));
  assert.ok(find('bankdrücken kh').includes('x-bench-press-dumbbell'));
  assert.ok(find('kreuzheben').includes('x-deadlift-barbell'));
  assert.ok(find('rumanisch').includes('x-romanian-deadlift-barbell'), 'accents are ignored');
  assert.deepEqual(find('bench bb'), find('bankdrücken lh'));
  assert.equal(core.matchExercise({ id: 'c-x', name: 'Bankdrücken eng' }, 'bankdrücken'), true);
});

// ---------- links and the privacy pages ----------
test('privacy pages: one per language, and the contact email written in one place only', () => {
  assert.equal(core.privacyPage('de'), 'datenschutz.html');
  assert.equal(core.privacyPage('en'), 'privacy.html');
  assert.equal(core.privacyPage(undefined), 'privacy.html');
  assert.ok(core.WEB_APP_URL.endsWith('/'));
  for (const page of ['privacy.html', 'datenschutz.html']) {
    const html = read(path.join(APP, page));
    assert.match(html, /from '\.\/js\/core\/links\.js'/, `${page} reads the address from core/links.js`);
    assert.match(html, /data-contact/);
  }
  // the deploy refuses "[EMAIL]" anywhere in setlog/, so it may only be the constant itself
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(js|html)$/.test(e.name) && read(f).includes('[EMAIL]')) hits.push(path.relative(APP, f));
    }
  };
  walk(APP);
  assert.deepEqual(hits.filter((f) => f !== path.join('js', 'core', 'links.js')), []);
});

// ---------- offline ----------
test('the service worker caches every module the app loads', () => {
  const assets = new Set([...read(path.join(APP, 'sw.js')).matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = read(path.join(APP, rel));
    for (const m of src.matchAll(/\bfrom\s+'(\.{1,2}\/[^']+)'/g)) visit(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  };
  visit('js/app.js');
  const missing = [...seen].filter((f) => !assets.has(f));
  assert.deepEqual(missing, []);
});
