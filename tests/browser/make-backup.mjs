// Builds the backup the app suites restore, with the web app itself: the sample
// Strong export (86 workouts), a "Pull" template in an "Upper / Lower" folder,
// two body weights, Intense Red, German and the name "Laurin".
// Writes tests/browser/data/setlog-backup.json. run.mjs calls it before the app suites.
import fs from 'node:fs';
import { devices, launch, WEB, BACKUP, STRONG, waitReady } from './env.mjs';

const browser = await launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto(WEB);
await waitReady(page);
const csv = fs.readFileSync(STRONG, 'utf8');
const out = await page.evaluate(async (csv) => {
  const st = await import('/js/store.js');
  const io = await import('/js/io.js');
  const r = io.parseStrongCSV(csv, { weightUnit: 'kg', distUnit: 'km' });
  await st.importBatch({ exercises: r.exercises, workouts: r.workouts });
  const id = (n) => st.findExerciseByName(n).id;
  st.copyTemplate({ name: 'Pull', folder: 'Upper / Lower', notes: 'Last set to failure', exercises: [
    { exerciseId: id('Lat Pulldown (Cable)'), restSec: 120, sets: [{ type: 'warmup', w: 40, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 9 }] },
    { exerciseId: id('Seated Row (Cable)'), sets: [{ w: 55, r: 12 }, { w: 55, r: 12 }] },
    { exerciseId: id('Pull Up'), sets: [{ r: 8 }, { r: 8 }] },
  ] });
  st.addMeasurement({ type: 'bodyweight', value: 82.4, at: Date.now() - 2 * 86400000 });
  st.addMeasurement({ type: 'bodyweight', value: 83.6, at: Date.now() - 40 * 86400000 });
  st.setSetting('theme', 'intense-red');
  st.setSetting('language', 'de');
  st.setProfile({ name: 'Laurin' });
  return { text: io.backupJSON(), workouts: st.S.workouts.length };
}, csv);
fs.writeFileSync(BACKUP, out.text);
console.log('backup with', out.workouts, 'workouts,', (out.text.length / 1024).toFixed(0), 'KB');
await browser.close();
