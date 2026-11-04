// The Expo app (web build) on an emulated iPhone: first start, restoring a
// backup from the Setlog web app (in Account, from the avatar on Today), every
// screen with real data (Progress → Workouts, Body; Plan; Search), theme and
// language from the backup, Strong import, and data surviving a reload. 15 checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { devices, launch, grantWakeLock, APP as BASE, BACKUP, STRONG, DATA, shots } from './env.mjs';

const OUT = shots('app-first-start');
const browser = await launch();
let passed = 0;
const ok = (n) => { passed++; console.log('PASS', n); };

async function newPage({ scheme = 'light', locale = 'en-US' } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale, colorScheme: scheme });
  await ctx.addInitScript(grantWakeLock);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Download the React DevTools/.test(m.text())) errors.push(m.text()); });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  await page.goto(BASE);
  return { ctx, page, errors, dialogs };
}
const bg = (page) => page.evaluate(() => {
  // the screen's own background (the first full-size element with a colour)
  for (const el of document.querySelectorAll('div')) {
    const c = getComputedStyle(el).backgroundColor;
    if (el.offsetWidth >= window.innerWidth - 1 && el.offsetHeight > 400 && c && c !== 'rgba(0, 0, 0, 0)') return c;
  }
  return null;
});
const tab = (page, name) => page.getByTestId(`tab-${name}`).click();
// the avatar on Today opens Account (the name and every setting)
const openAccount = async (page) => { await tab(page, 'index'); await page.getByTestId('open-account').click(); };
const text = async (page) => (await page.locator('body').innerText());
const has = async (page, re) => (typeof re === 'string' ? new RegExp(re.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : re).test(await text(page));

// ---------- 1. first start, restore a backup ----------
{
  const { ctx, page, errors, dialogs } = await newPage();
  await page.getByTestId('start-empty').waitFor();
  assert.match(await page.getByTestId('up-next').innerText(), /Up next[\s\S]*Empty workout[\s\S]*Start an empty workout/);
  await page.screenshot({ path: `${OUT}/01-first-start.png` });
  await tab(page, 'plan');
  await page.getByTestId('hide-examples').waitFor();
  assert.ok(await has(page, 'Examples'), 'examples on a fresh start');
  ok('first start: Today offers an empty workout, Plan has the examples, built-in library loaded');

  await tab(page, 'progress');
  await page.getByTestId('progress-workouts').click();
  await page.getByTestId('history-restore').waitFor();
  assert.ok((await text(page)).includes('No workouts yet'));
  ok('Progress → Workouts is empty and offers to restore a backup');

  await page.goBack();
  await openAccount(page);
  await page.getByTestId('restore').waitFor();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('restore').click()]);
  await chooser.setFiles(BACKUP);
  for (let i = 0; i < 50 && dialogs.length < 2; i++) await page.waitForTimeout(100);
  assert.match(dialogs[0], /Replace all data\?[\s\S]*86 workouts, 1 template and 2 measurements/);
  assert.match(dialogs[1], /Backup restored/);
  ok('restore asks first (86 workouts, 1 template, 2 measurements), then restores');

  // the backup brought German and Intense Red along
  await page.waitForTimeout(400);
  assert.ok(await has(page, 'Deine Daten'), 'German after restore');
  assert.equal(await bg(page), 'rgb(0, 0, 0)', 'Intense Red background (true black)');
  assert.match(await page.getByTestId('set-name').innerText(), /Laurin/, 'the name row shows the restored name');
  await page.screenshot({ path: `${OUT}/02-settings-after-restore.png` });
  ok('the backup’s language (German) and theme (Intense Red) apply right away');
  assert.deepEqual(errors, []);

  // ---------- 2. every screen with real data ----------
  await page.goBack();
  await page.waitForTimeout(300);
  assert.match(await page.getByTestId('open-account').getAttribute('aria-label'), /Laurin/, 'name from the backup');
  assert.equal((await page.getByTestId('open-account').innerText()).trim(), 'L');
  await tab(page, 'progress');
  assert.match(await page.getByTestId('progress-workouts').innerText(), /86/, 'workout count');
  await page.screenshot({ path: `${OUT}/03-progress.png` });
  ok('Today’s avatar has the name; Progress counts 86 workouts');

  await page.getByTestId('progress-workouts').click();
  await page.locator('[data-testid^="workout-"]').first().waitFor();
  const hist = await text(page);
  assert.ok(/(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) 20\d\d/.test(hist), 'German month headings');
  assert.ok(/Trainings?\b/.test(hist));
  await page.screenshot({ path: `${OUT}/04-history.png` });
  const first = page.locator('[data-testid^="workout-"]').first();
  const name = (await first.innerText()).split('\n')[0];
  await first.click();
  await page.waitForTimeout(400);
  const detail = await text(page);
  assert.ok(detail.includes(name) && /Zeit/.test(detail) && /Volumen/.test(detail) && /× \d/.test(detail), 'workout detail with Zeit · Volumen · Sätze and its sets');
  // its tally: one stroke per set, read out as one element ("18 Sätze · 2 Rekorde")
  const tally = await page.getByTestId('workout-tally').evaluate((el) => ({ label: el.getAttribute('aria-label'), strokes: [...el.children].reduce((n, t) => n + t.firstElementChild.children.length, 0) }));
  assert.equal(tally.strokes, Number(tally.label.match(/^(\d+) Sätze?/)[1]), JSON.stringify(tally));
  await page.screenshot({ path: `${OUT}/05-workout-detail.png` });
  ok('History lists the workouts by month (German), a workout opens with its sets');

  // exercise page from the workout
  await page.locator('[data-testid^="ex-link-"]').nth(3).click();
  await page.waitForTimeout(400);
  // one page, no tabs: the chart, Best set (or Most reps, Longest) · Sessions · Last, History
  const exPage = await text(page);
  assert.equal(await page.getByRole('tablist').count(), 0, 'no inner tabs');
  assert.ok(/Einheiten/.test(exPage) && /Zuletzt/.test(exPage) && /Bester Satz|Meiste Wdh\.|Längste/.test(exPage), exPage.slice(0, 600));
  assert.ok(/Verlauf/.test(exPage) && await page.locator('[data-testid^="ex-session-"]').count() >= 1);
  await page.screenshot({ path: `${OUT}/06-exercise.png` });
  ok('an exercise page shows its numbers and its history on one page');

  await page.goBack(); await page.goBack(); await page.goBack();
  await tab(page, 'search');
  await page.getByTestId('exercise-search').fill('bench bb');
  await page.waitForTimeout(300);
  const rows = await page.locator('[data-testid^="exercise-"]:not([data-testid="exercise-search"])').allInnerTexts();
  // the app is German here, so built-ins show their German names (search still takes the English ones)
  assert.ok(rows.length >= 1 && rows.every((r) => /bankdrücken/i.test(r) && /langhantel/i.test(r)), rows.join(' | '));
  assert.match(rows.find((r) => r.startsWith('Bankdrücken (Langhantel)')) || '', /Brust · \d+ ?Mal/);
  await page.screenshot({ path: `${OUT}/07-exercises.png` });
  ok('Exercises search finds "bench bb" and shows how often it was done');

  await tab(page, 'plan');
  await page.waitForTimeout(300);
  const wo = await text(page);
  assert.ok(wo.includes('Upper / Lower') && wo.includes('Pull'), 'template in its folder');
  await page.screenshot({ path: `${OUT}/08-plan.png` });
  await page.locator('[data-testid^="template-"]', { hasText: 'Pull' }).first().click();
  await page.waitForTimeout(400);
  const tpl = await text(page);
  assert.ok(tpl.includes('Latzug (Kabelzug)') && tpl.includes('Last set to failure') && tpl.includes('8 Wdh.'), tpl);
  await page.screenshot({ path: `${OUT}/09-template.png` });
  await page.getByTestId('start-template').click();
  await page.getByTestId('workout-name').waitFor();
  assert.equal(await page.getByTestId('workout-name').inputValue(), 'Pull');
  await page.getByTestId('discard-workout').click();
  await page.getByTestId('confirm-discard').click();
  await page.waitForTimeout(600);
  ok('Plan shows the template in its folder; the preview lists targets; Start opens the workout');

  await page.goBack();
  await tab(page, 'progress');
  assert.match(await page.getByTestId('progress-body').innerText(), /82,4 kg/);
  await page.getByTestId('progress-body').click();
  await page.waitForTimeout(300);
  const ms = await text(page);
  assert.match(ms, /Körpergewicht[\s\S]*82,4 kg/);
  await page.screenshot({ path: `${OUT}/10-body.png` });
  ok('Progress → Body shows the latest body weight (82,4 kg)');

  // ---------- 3. survives a reload ----------
  await page.goBack();
  await page.reload();
  await page.getByTestId('tab-progress').waitFor();
  await tab(page, 'progress');
  await page.getByTestId('progress-workouts').click();
  await page.locator('[data-testid^="workout-"]').first().waitFor();
  assert.equal(await bg(page), 'rgb(0, 0, 0)');
  ok('data, theme and language survive a reload');

  // ---------- 4. settings change live ----------
  await page.goBack();
  await openAccount(page);
  await page.getByTestId('theme-strawberry-matcha').click();
  await page.waitForTimeout(200);
  assert.equal(await bg(page), 'rgb(251, 248, 242)', 'Strawberry Matcha cream');
  await page.getByTestId('language-en').click();
  await page.waitForTimeout(200);
  assert.ok(await has(page, 'Your data'));
  await page.getByTestId('set-unit').getByText('lb').click();
  await page.screenshot({ path: `${OUT}/11-settings-matcha.png` });
  await page.goBack();
  await tab(page, 'progress');
  await page.getByTestId('progress-body').click();
  await page.waitForTimeout(200);
  assert.match(await text(page), /Body weight[\s\S]*181,7 lb|Body weight[\s\S]*181\.7 lb/);
  ok('theme, language and units switch live (Strawberry Matcha, English, lb)');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 5. Strong import on a fresh start ----------
{
  const { ctx, page, errors, dialogs } = await newPage({ scheme: 'dark', locale: 'de-DE' });
  await page.getByTestId('start-empty').waitFor();
  assert.equal(await bg(page), 'rgb(0, 0, 0)', 'Auto follows a dark phone (true black)');
  assert.ok((await text(page)).includes('Training starten'), 'German phone → German app');
  ok('a German phone in dark mode gets the German app in Dark');
  await openAccount(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('strong-import').click()]);
  await chooser.setFiles(STRONG);
  for (let i = 0; i < 50 && dialogs.length < 2; i++) await page.waitForTimeout(100);
  assert.match(dialogs[0], /86 Trainings importieren\?/);
  assert.match(dialogs[1], /86 Trainings importiert/);
  await page.goBack();
  await tab(page, 'progress');
  await page.getByTestId('progress-workouts').click();
  await page.locator('[data-testid^="workout-"]').first().waitFor();
  await page.screenshot({ path: `${OUT}/12-history-dark-de.png` });
  // the same file again: nothing new
  await page.goBack();
  await openAccount(page);
  const [again] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('strong-import').click()]);
  await again.setFiles(STRONG);
  for (let i = 0; i < 30 && dialogs.length < 3; i++) await page.waitForTimeout(100);
  assert.match(dialogs[2], /Alle 86 Trainings sind schon importiert/);
  ok('Strong import: 86 workouts in, a second import finds nothing new');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// ---------- 6. a broken file ----------
{
  const { ctx, page, dialogs } = await newPage();
  await page.getByTestId('start-empty').waitFor();
  const broken = path.join(DATA, 'broken.json');
  fs.writeFileSync(broken, '{"app":"other"}');
  await openAccount(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('restore').click()]);
  await chooser.setFiles(broken);
  for (let i = 0; i < 30 && !dialogs.length; i++) await page.waitForTimeout(100);
  assert.match(dialogs[0], /This isn’t a Setlog backup file/);
  ok('a file that isn’t a backup is refused with a clear message');
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} checks passed`);
