// The Expo app (web build) on an emulated iPhone: first start, restoring a
// backup from the Setlog web app, every screen with real data, theme and
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
const text = async (page) => (await page.locator('body').innerText());
const has = async (page, re) => (typeof re === 'string' ? new RegExp(re.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : re).test(await text(page));

// ---------- 1. first start, restore a backup ----------
{
  const { ctx, page, errors, dialogs } = await newPage();
  await page.getByTestId('start-empty').waitFor();
  assert.ok((await text(page)).includes('Start workout'));
  assert.ok(await has(page, 'Examples'), 'examples on a fresh start');
  await page.screenshot({ path: `${OUT}/01-first-start.png` });
  ok('first start: Workout tab with the examples, built-in library loaded');

  await tab(page, 'history');
  await page.getByTestId('history-restore').waitFor();
  assert.ok((await text(page)).includes('No workouts yet'));
  ok('History is empty and offers to restore a backup');

  await tab(page, 'profile');
  await page.getByTestId('open-settings').click();
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
  assert.equal(await bg(page), 'rgb(10, 10, 10)', 'Intense Red background');
  assert.match(await page.getByTestId('set-name').innerText(), /Laurin/, 'the name row shows the restored name');
  await page.screenshot({ path: `${OUT}/02-settings-after-restore.png` });
  ok('the backup’s language (German) and theme (Intense Red) apply right away');
  assert.deepEqual(errors, []);

  // ---------- 2. every screen with real data ----------
  await page.goBack();
  await page.waitForTimeout(300);
  const prof = await text(page);
  assert.ok(prof.includes('Laurin'), 'name from the backup');
  assert.ok(prof.includes('86'), 'workout count');
  await page.screenshot({ path: `${OUT}/03-profile.png` });
  ok('Profile shows the name and 86 workouts');

  await tab(page, 'history');
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
  assert.ok(detail.includes(name) && /Dauer/i.test(detail) && /× \d/.test(detail), 'workout detail with sets');
  await page.screenshot({ path: `${OUT}/05-workout-detail.png` });
  ok('History lists the workouts by month (German), a workout opens with its sets');

  // exercise page from the workout
  await page.locator('[data-testid^="ex-link-"]').nth(3).click();
  await page.waitForTimeout(400);
  const exPage = await text(page);
  assert.ok(/Verlauf/i.test(exPage) && /Rekorde/i.test(exPage));
  await page.getByRole('tablist').getByText('Rekorde').click();
  await page.waitForTimeout(200);
  assert.ok(/Geschätztes 1RM|Meiste Wdh\.|Längste|Sätze/i.test(await text(page)), (await text(page)).slice(-600));
  await page.screenshot({ path: `${OUT}/06-exercise-records.png` });
  ok('an exercise page shows its history and records');

  await page.goBack(); await page.goBack();
  await tab(page, 'exercises');
  await page.getByTestId('exercise-search').fill('bench bb');
  await page.waitForTimeout(300);
  const rows = await page.locator('[data-testid^="exercise-"]:not([data-testid="exercise-search"])').allInnerTexts();
  assert.ok(rows.length >= 1 && rows.every((r) => /bench/i.test(r) && /barbell/i.test(r)), rows.join(' | '));
  assert.match(rows.find((r) => r.startsWith('Bench Press (Barbell)')) || '', /Brust · \d+ ?Mal/);
  await page.screenshot({ path: `${OUT}/07-exercises.png` });
  ok('Exercises search finds "bench bb" and shows how often it was done');

  await tab(page, 'index');
  await page.waitForTimeout(300);
  const wo = await text(page);
  assert.ok(wo.includes('Upper / Lower') && wo.includes('Pull'), 'template in its folder');
  await page.screenshot({ path: `${OUT}/08-workout-tab.png` });
  await page.locator('[data-testid^="template-"]', { hasText: 'Pull' }).first().click();
  await page.waitForTimeout(400);
  const tpl = await text(page);
  assert.ok(tpl.includes('Lat Pulldown (Cable)') && tpl.includes('Last set to failure') && tpl.includes('8 Wdh.'), tpl);
  await page.screenshot({ path: `${OUT}/09-template.png` });
  await page.getByTestId('start-template').click();
  await page.getByTestId('workout-name').waitFor();
  assert.equal(await page.getByTestId('workout-name').inputValue(), 'Pull');
  await page.getByTestId('discard-workout').click();
  await page.getByTestId('confirm-discard').click();
  await page.waitForTimeout(600);
  ok('the Workout tab shows the template in its folder; the preview lists targets; Start opens the workout');

  await page.goBack();
  await tab(page, 'measure');
  await page.waitForTimeout(300);
  const ms = await text(page);
  assert.match(ms, /Körpergewicht[\s\S]*82,4 kg/);
  await page.screenshot({ path: `${OUT}/10-measure.png` });
  ok('Measure shows the latest body weight (82,4 kg)');

  // ---------- 3. survives a reload ----------
  await page.reload();
  await page.getByTestId('tab-history').waitFor();
  await tab(page, 'history');
  await page.locator('[data-testid^="workout-"]').first().waitFor();
  assert.equal(await bg(page), 'rgb(10, 10, 10)');
  ok('data, theme and language survive a reload');

  // ---------- 4. settings change live ----------
  await tab(page, 'profile');
  await page.getByTestId('open-settings').click();
  await page.getByTestId('theme-strawberry-matcha').click();
  await page.waitForTimeout(200);
  assert.equal(await bg(page), 'rgb(242, 235, 222)', 'Strawberry Matcha beige');
  await page.getByTestId('language-en').click();
  await page.waitForTimeout(200);
  assert.ok(await has(page, 'Your data'));
  await page.getByTestId('set-unit').getByText('lb').click();
  await page.screenshot({ path: `${OUT}/11-settings-matcha.png` });
  await page.goBack();
  await tab(page, 'measure');
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
  assert.equal(await bg(page), 'rgb(11, 13, 17)', 'Auto follows a dark phone');
  assert.ok((await text(page)).includes('Training starten'), 'German phone → German app');
  ok('a German phone in dark mode gets the German app in Dark');
  await tab(page, 'profile');
  await page.getByTestId('open-settings').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('strong-import').click()]);
  await chooser.setFiles(STRONG);
  for (let i = 0; i < 50 && dialogs.length < 2; i++) await page.waitForTimeout(100);
  assert.match(dialogs[0], /86 Trainings importieren\?/);
  assert.match(dialogs[1], /86 Trainings importiert/);
  await page.goBack();
  await tab(page, 'history');
  await page.locator('[data-testid^="workout-"]').first().waitFor();
  await page.screenshot({ path: `${OUT}/12-history-dark-de.png` });
  // the same file again: nothing new
  await tab(page, 'profile');
  await page.getByTestId('open-settings').click();
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
  await tab(page, 'profile');
  await page.getByTestId('open-settings').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('restore').click()]);
  await chooser.setFiles(broken);
  for (let i = 0; i < 30 && !dialogs.length; i++) await page.waitForTimeout(100);
  assert.match(dialogs[0], /This isn’t a Setlog backup file/);
  ok('a file that isn’t a backup is refused with a clear message');
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} checks passed`);
