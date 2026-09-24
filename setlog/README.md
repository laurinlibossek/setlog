# Setlog

A private workout tracker that works like Strong: log sets against last time's numbers, rest timer, templates, records and progress charts. It runs as a web app you add to your iPhone's Home Screen. There's no account and no server, and nothing gets uploaded: your training log is stored only on your phone.

## What it does

- **Logging**: every set shows what you did last time. Tap ✓ and empty fields are filled from those grey numbers. There are warm-up, drop and failure sets, RPE, per-exercise notes and pinned notes (e.g. "seat height 4"), plus supersets, reorder, replace and swipe-left-to-delete with undo.
- **Rest timer**: starts when you check off a set, with a per-exercise default, ±15 s and skip. A signal plays when it ends. In a superset it starts after the last exercise of the round.
- **Templates**: folders, targets, and six example templates (Push/Pull/Legs, 5×5, Full Body). If a workout changed a template's exercises or sets, you're asked whether to update the template.
- **History**: a list and a calendar. You can edit a finished workout (sets, start time, duration), run it again, save it as a template or share it as text.
- **Records and charts** per exercise: estimated 1RM (Epley or Brzycki), heaviest weight, set and session volume, best weight per rep count, and lifetime totals. Cardio gets distance, time and pace. PRs are flagged live while you train and in the summary afterwards.
- **Measure**: body weight, body fat, calories and 13 circumference measurements, each with a chart.
- **Tools**: a plate calculator (bar and plates are configurable) and a 1RM calculator.
- **Your data**: import from Strong (CSV), export CSV in Strong's column format (good for R or Excel), and JSON backup and restore.
- **Other**: kg/lb, km/mi, dark mode and a weekly goal with a streak. It works offline and keeps the screen on during a workout.

## Put it on your iPhone (≈5 minutes, free, no Git needed)

1. Sign in at github.com (or create a free account).
2. Click **New repository** and name it `setlog`. Set it to **Public** (GitHub Pages is free for public repos; only the code is public, never your data). Then click **Create repository**.
3. On the empty repo page, click **uploading an existing file**. Drag in **the contents of this folder** (`index.html`, `sw.js`, `manifest.webmanifest` and the `css`, `js` and `icons` folders), so `index.html` sits at the top level and not inside another folder. Then click **Commit changes**.
4. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, then branch **main** and folder **/ (root)**, and click **Save**. After about a minute the page shows your address: `https://<your-username>.github.io/setlog/`.
5. On the iPhone, open that address in **Safari** and tap **Share → Add to Home Screen**. Open Setlog from the new icon from then on.

> The Home Screen app has its own storage, separate from Safari. Log your workouts in the installed app, not in a Safari tab.

## Bring over your Strong history

1. In Strong: **Settings → Export Workouts**, then save the CSV to Files (or AirDrop/mail it to yourself and save it to Files).
2. In Setlog: **Profile → ⚙︎ → Import from Strong** and pick the file. Choose the units Strong was set to (its export doesn't record them).
3. You'll see a preview (workouts, sets, date range, any new exercises) before anything is saved. Importing the same file twice skips workouts you already have.

Strong names like "Bench Press (Barbell)" match the built-in library automatically. Anything else becomes a custom exercise. If one of those is really a built-in exercise, open it and use **⋯ → Merge into another exercise**.

## Keep your data safe

- The data lives in the app's on-device storage (IndexedDB). A banner reminds you every two weeks to back up. Use **Settings → Back up now**, then **Save to Files → iCloud Drive**. **Restore from backup** brings everything back, e.g. on a new phone.
- Removing the Home Screen icon can delete the app's data, so back up first. The same goes for switching phones.
- **Settings → Storage → Protect** asks the browser to exempt the data from automatic clean-up.

## Known limits of a web app on iOS

- A locked phone pauses web apps, so the rest timer can't buzz in your pocket. It keeps counting correctly and shows the right time when you come back. With **Keep screen on** (the default), the screen stays awake during a workout, so the signal plays.
- The signal only sounds when the ring/silent switch is set to ring.
- There's no Apple Health/Watch integration and no sync between devices. Use backup and restore to move data.

## Updating the app

Change the files, then **bump `VERSION` in `sw.js`** (e.g. `setlog-v1.0.1`) and upload the changed files to GitHub again. Next time you open the app, it offers **"A new version of Setlog is ready → Update"**. A running workout is saved first.

## Run it locally

Any static file server works, for example:

```sh
cd setlog
python3 -m http.server 8000
# open http://localhost:8000
```

There's no build step. The UI uses Preact + htm, vendored in `js/vendor/` so the app has no outside dependencies at runtime.

## Files

| Path | What it is |
|---|---|
| `index.html`, `manifest.webmanifest`, `icons/` | App shell and Home Screen metadata |
| `sw.js` | Offline cache (bump `VERSION` on every update) |
| `css/app.css` | All styles, light and dark |
| `js/app.js` | Entry: tabs, wake lock, theme, updates |
| `js/store.js`, `js/db.js` | State, persistence (IndexedDB with auto-reconnect), all data actions |
| `js/calc.js` | 1RM, volume, PR detection, records, plates, warm-ups |
| `js/drafts.js` | Editable workout drafts ↔ saved records (units, decimal commas) |
| `js/editor.js`, `js/sheet.js` | Workout logging UI, rest timer, finish flow |
| `js/screens/*.js` | Workout, History, Exercises, Measure, Profile/Settings |
| `js/io.js` | Strong CSV import, CSV export, JSON backup/restore |
| `js/seed.js` | Built-in exercises (≈190) and example templates |
