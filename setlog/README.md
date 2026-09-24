# Setlog user guide

This is the detailed guide. For an overview of the project, see the [main README](../README.md).

Live app: https://laurinlibossek.github.io/setlog/

## Install it on your iPhone

1. Open https://laurinlibossek.github.io/setlog/ in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open Setlog from the new icon from then on.

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

## Host your own copy and ship updates

1. Fork the repository and go to **Settings → Pages**. Set the source to **GitHub Actions**.
2. The workflow in `.github/workflows/pages.yml` publishes this `setlog/` folder to `https://<your-username>.github.io/setlog/` on every push to `main`.
3. To ship an update, change the files, **bump `VERSION` in `sw.js`** (e.g. `setlog-v1.0.1`) and push. Next time the app opens, it offers **"A new version of Setlog is ready → Update"**. A running workout is saved first.

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
