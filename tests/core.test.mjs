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
  ].map((x) => x.label).concat(Object.values(core.PR_LABEL), core.EXAMPLE_TEMPLATES.flatMap((t) => [t.name, t.folder]));
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
