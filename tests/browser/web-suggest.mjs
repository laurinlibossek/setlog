// Web app, v1.5.7: the suggested workout follows a changed routine after about two
// rounds, ignores a single swapped day, and still handles rotations and weekday
// habits. 7 checks.
import assert from 'node:assert/strict';
import { devices, launch, WEB as BASE, waitReady } from './env.mjs';

const browser = await launch();
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-US', serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE);
await waitReady(page);

// run one scenario: plan = [[daysBeforeNow, templateName], ...]; now is a Wednesday 18:00
const suggest = (plan) => page.evaluate(async (plan) => {
  const st = await import('/js/store.js');
  st.S.workouts.splice(0);
  const id = st.findExerciseByName('Bench Press (Barbell)').id;
  const ids = {};
  for (const n of ['Push', 'Pull', 'Legs', 'Upper']) ids[n] = (st.S.templates.find((t) => t.name === n) || st.copyTemplate({ name: n, exercises: [{ exerciseId: id, sets: [{ w: 50, r: 5 }] }] })).id;
  const now = new Date(2026, 9, 14, 18, 0).getTime(); // Wed 14 Oct 2026
  let i = 0;
  for (const [d, n] of plan) {
    const at = now - d * 86400000 - 8 * 3600000;
    st.saveWorkout({ id: 'w' + (++i), name: n, startedAt: at, endedAt: at + 3600000, templateId: ids[n],
      exercises: [{ id: 'e' + i, exerciseId: id, sets: [{ id: 's' + i, type: 'normal', w: 50, r: 5 }] }] });
  }
  const r = st.suggestTemplate(now);
  return r && { name: r.template.name, why: r.why.kind, after: r.why.name };
}, plan);

// weekly Mon Legs / Wed X / Fri Pull for `weeks` past weeks; the most recent `fresh` weeks use Upper on Wednesday;
// this week's Monday Legs is done, today is Wednesday
function routine(weeks, fresh) {
  const plan = [];
  for (let w = weeks; w >= 1; w--) {
    plan.push([7 * w + 2, 'Legs'], [7 * w, w <= fresh ? 'Upper' : 'Push'], [7 * w - 2, 'Pull']);
  }
  plan.push([2, 'Legs']);
  return plan;
}

let r = await suggest(routine(10, 0));
assert.equal(r.name, 'Push');
ok('steady routine: suggests the usual next template (Push after Legs)');

r = await suggest(routine(10, 1));
assert.equal(r.name, 'Push', 'one swapped Wednesday must not flip the suggestion');
ok('one swapped day does not flip the suggestion');

r = await suggest(routine(10, 2));
assert.equal(r.name, 'Upper');
ok('after two rounds of the new routine it suggests Upper');

r = await suggest(routine(10, 5));
assert.equal(r.name, 'Upper');
assert.ok(r.why === 'weekday' || (r.why === 'after' && r.after === 'Legs'), JSON.stringify(r));
ok('the new routine keeps winning once established');

// rotation on irregular days (from the v1.3.0 suite)
r = await suggest([[23, 'Push'], [21, 'Pull'], [18, 'Legs'], [15, 'Push'], [12, 'Pull'], [10, 'Legs'], [6, 'Push'], [3, 'Pull']]);
assert.equal(r.name, 'Legs');
assert.equal(r.why, 'after');
assert.equal(r.after, 'Pull');
ok('rotation on irregular days: Legs, usually after Pull');

// weekday habit (from the v1.3.0 suite): Legs every Wednesday, last workout Pull
r = await suggest([[28, 'Legs'], [26, 'Push'], [21, 'Legs'], [19, 'Pull'], [14, 'Legs'], [12, 'Push'], [7, 'Legs'], [2, 'Pull']]);
assert.equal(r.name, 'Legs');
assert.equal(r.why, 'weekday');
ok('weekday habit: Legs, usually on Wednesdays');

// too little history → no suggestion
r = await suggest([[3, 'Push']]);
assert.equal(r, null);
ok('one workout is not enough for a suggestion');

assert.deepEqual(errors, []);
await browser.close();
console.log(`\n${passed} checks passed`);
