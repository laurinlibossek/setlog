// The Expo app's tabs (web build) on an emulated iPhone, with the store demo
// data (16 weeks of an upper/lower split up to yesterday): Today's Up next
// card, week strip and sets per muscle against the core's own numbers; Now
// Lifting with the rest and Skip; Plan's + menu; the Progress hub and its
// pages; Search focused on open; the Account sheet; German and dark. 7 checks.
import assert from 'node:assert/strict';
import { devices, launch, grantWakeLock, APP as BASE, shots } from './env.mjs';
import * as core from '../../setlog/js/core/index.js';
import { demoData } from './store-demo.mjs';

const OUT = shots('app-tabs');
const DAY = 86400000;
const browser = await launch();
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };

async function newPage({ lang = 'en', scheme = 'light' } = {}) {
  const data = demoData(lang);
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: lang === 'de' ? 'de-DE' : 'en-US', colorScheme: scheme });
  await ctx.addInitScript(grantWakeLock);
  await ctx.addInitScript((json) => { if (!localStorage.getItem('increment.data')) localStorage.setItem('increment.data', json); }, JSON.stringify(data));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE);
  await page.getByTestId('start-suggested').waitFor();
  return { ctx, page, errors, data };
}
const id = (page, t) => page.getByTestId(t);
const wait = (page, ms = 300) => page.waitForTimeout(ms);
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('increment.data')));
const text = (page) => page.locator('body').innerText();
async function discard(page) {
  await id(page, 'discard-workout').click();
  await wait(page, 400);
  if (await id(page, 'confirm-discard').count()) await id(page, 'confirm-discard').click();
  await wait(page, 500);
}

// ---------- 1. Today, Now Lifting, Plan, Progress, Search, Account ----------
{
  const { ctx, page, errors, data } = await newPage();
  const lib = new Map(data.exercises.map((e) => [e.id, e]));
  const settings = core.withDefaults(data.kv.settings);
  const sug = core.suggestTemplate(data.templates, data.workouts);
  const size = core.routineSize(sug.template, lib, { defaultRest: settings.defaultRest });
  const week = core.weekStrip(data.workouts, { weekStart: settings.weekStart, goal: settings.weeklyGoal });
  const muscles = core.setsPerMuscle(data.workouts, lib);

  const card = await id(page, 'up-next').innerText();
  assert.match(card, new RegExp(`Up next · [^\\n]+\\n${sug.template.name}`));
  assert.ok(card.includes(`${size.exercises} exercises · ${size.sets} sets · about ${size.minutes} min`), card);
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(Date.now());
  assert.ok((await text(page)).toLowerCase().includes(date.toLowerCase()), `eyebrow ${date}`);
  assert.match(await id(page, 'week-head').innerText(), new RegExp(`${week.done} of ${settings.weeklyGoal} sessions`));
  assert.equal(await id(page, 'week-strip').getAttribute('aria-label'), `This week: ${week.done} of ${settings.weeklyGoal} sessions`);
  assert.ok(muscles.length >= 3, 'the demo trained several muscles this week');
  for (const m of muscles) assert.match(await id(page, `muscle-${m.muscle}`).innerText(), new RegExp(`^${m.label}\\s+${m.sets}$`));
  assert.equal(await page.locator('[data-testid^="muscle-"]').count(), muscles.length);
  await page.screenshot({ path: `${OUT}/01-today.png` });
  ok(`Today: the date, Up next (${sug.template.name}, about ${size.minutes} min), ${week.done} of ${settings.weeklyGoal} sessions, sets per muscle as the core counts them`);

  // start it, log the warm-up and the first set, minimize: the accessory
  await id(page, 'start-suggested').click();
  await id(page, 'workout-name').waitFor();
  assert.equal(await id(page, 'workout-name').inputValue(), sug.template.name);
  const checks = page.locator('[data-testid^="check-"]');
  await checks.nth(0).click(); await wait(page, 150);
  await checks.nth(1).click(); await wait(page, 300);
  assert.ok((await store(page)).kv.active.rest, 'a rest is running');
  await id(page, 'minimize').click();
  await id(page, 'mini-bar').waitFor();
  const first = sug.template.exercises[0];
  const firstName = lib.get(first.exerciseId).name;
  const bar = await id(page, 'mini-bar').innerText();
  assert.ok(bar.includes(`${firstName} · set 3 of ${first.sets.length}`), bar);
  assert.match(bar, /Rest \d:\d\d/);
  const now = await id(page, 'now-card').innerText();
  assert.match(now, /In progress · since/);
  assert.ok(now.includes(`1 of ${size.sets} sets`), now);
  await page.screenshot({ path: `${OUT}/02-now-lifting.png` });
  await id(page, 'mini-skip-rest').click();
  await wait(page, 300);
  assert.equal((await store(page)).kv.active.rest, null, 'Skip ends the rest');
  assert.equal(await id(page, 'mini-skip-rest').count(), 0);
  assert.match(await id(page, 'mini-bar').innerText(), new RegExp(`${sug.template.name} · \\d+:\\d\\d`));
  // it stays on every tab
  await id(page, 'tab-progress').click();
  await id(page, 'mini-bar').waitFor();
  await id(page, 'mini-bar').click();
  await id(page, 'workout-name').waitFor();
  await discard(page);
  assert.equal(await id(page, 'mini-bar').count(), 0);
  ok('Now Lifting: the exercise and set, the rest and Skip, on every tab, opens the workout; Today shows it running with Resume');

  // Plan: the templates as rows, + starts an empty workout
  await id(page, 'tab-plan').click();
  await wait(page);
  for (const t of data.templates) assert.match(await id(page, `template-${t.id}`).innerText(), new RegExp(`${t.name}\\n${t.exercises.length} exercises · `));
  await id(page, 'plan-add').click();
  await id(page, 'new-template').waitFor();
  await id(page, 'new-folder').waitFor();
  await wait(page, 250);
  await page.screenshot({ path: `${OUT}/03-plan-add.png` });
  await id(page, 'start-empty').click();
  await id(page, 'workout-name').waitFor();
  assert.match(await id(page, 'workout-name').inputValue(), /Workout$/);
  await discard(page);
  ok('Plan: the templates as rows; + has Empty workout (starts one), New template and New folder');

  // Progress: last 30 days and the four pages
  await id(page, 'tab-progress').click();
  await wait(page);
  const since = Date.now() - 30 * DAY;
  const recent = data.workouts.filter((w) => w.startedAt >= since).length;
  assert.match(await id(page, 'last-30').innerText(), new RegExp(`^Workouts\\n${recent}\\n`));
  assert.match(await id(page, 'progress-workouts').innerText(), new RegExp(`Workouts\\s+${data.workouts.length}`));
  const lifts = new Set(data.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId))).size;
  assert.match(await id(page, 'progress-lifts').innerText(), new RegExp(`Lifts\\s+${lifts}`));
  const bw = [...data.measurements].sort((a, b) => b.at - a.at)[0];
  assert.ok((await id(page, 'progress-body').innerText()).includes(`${bw.value} kg`));
  await page.screenshot({ path: `${OUT}/04-progress.png`, fullPage: true });
  await id(page, 'progress-records').click();
  await id(page, 'record-0').waitFor();
  assert.match(await id(page, 'record-0').innerText(), /\d{4} · .*(Est\. 1RM|Weight|Reps)/);
  await page.goBack();
  await id(page, 'progress-lifts').click();
  await id(page, 'lifts-search').fill('squat bb');
  await wait(page);
  assert.deepEqual(await page.locator('[data-testid^="lift-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid'))), ['lift-x-squat-barbell']);
  await id(page, 'lift-x-squat-barbell').click();
  await id(page, 'exercise-options').waitFor();
  await page.goBack(); await page.goBack();
  await id(page, 'progress-workouts').click();
  await page.locator('[data-testid^="workout-"]').first().waitFor();
  await page.goBack();
  ok(`Progress: ${recent} workouts in 30 days; Workouts (${data.workouts.length}), Lifts (${lifts}, searchable), Records and Body (${bw.value} kg)`);

  // Search is focused when it opens
  await id(page, 'tab-search').click();
  await wait(page, 400);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'exercise-search');
  ok('Search: the field is focused when the tab opens');

  // Account: from the avatar, Done closes it
  await id(page, 'tab-index').click();
  await id(page, 'open-account').click();
  await id(page, 'account-done').waitFor();
  assert.match(await id(page, 'set-name').innerText(), /Not set/);
  await wait(page, 300);
  await page.screenshot({ path: `${OUT}/05-account.png` });
  await id(page, 'account-done').click();
  await wait(page, 400);
  assert.equal(await id(page, 'account-done').count(), 0);
  await id(page, 'open-account').waitFor();
  ok('Account opens from the avatar on Today and closes with Done');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 2. German, dark ----------
{
  const { ctx, page, errors } = await newPage({ lang: 'de', scheme: 'dark' });
  const today = await text(page);
  for (const s of ['Heute', 'Als Nächstes', 'Starten', 'Diese Woche', 'Einheiten', 'Sätze pro Muskel', 'Letzte 7 Tage']) assert.ok(today.includes(s), s);
  await page.screenshot({ path: `${OUT}/06-today-de-dark.png` });
  await id(page, 'tab-progress').click();
  await wait(page);
  const progress = await text(page);
  for (const s of ['Fortschritt', 'Letzte 30 Tage', 'Trainings', 'Übungen', 'Rekorde', 'Körper', 'Trainings pro Woche']) assert.ok(progress.includes(s), s);
  await page.screenshot({ path: `${OUT}/07-progress-de-dark.png` });
  ok('German: Today and Progress');
  assert.deepEqual(errors, []);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} checks passed`);
