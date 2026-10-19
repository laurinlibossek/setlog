# Increment (iPhone and Android app)

The store version of Setlog, built with [Expo](https://expo.dev) (React Native). One codebase becomes a real iPhone app and a real Android app. The training logic isn't rewritten: the app imports the same core as the web app (`../setlog/js/core`, as `@setlog/core`), so records, the suggested workout, the Strong import, backups, translations and colour themes work exactly as they do on the web.

**Status:** nearly everything the web app does, plus a rest timer that alerts you with the phone locked.

- **Logging:** start a workout empty, from a template or again from History. Last time's numbers show as grey placeholders, and checking a set off saves them. Rest timer, set types and RPE, supersets, warm-up sets, focus metric, plate calculator, drag-and-drop reordering, a start time you can move, and Finish with records and the "update the template?" question. Pull the workout down and it waits in a bar above the tabs; it survives closing the app.
- **Rest timer alerts:** when rest is over and the app isn't open (phone locked, another app), a notification arrives. The first rest timer asks for permission. Settings → Rest timer alerts turns it off.
- **Templates:** create and edit them (or make one from a finished workout), with ⋯ to rename, duplicate, move to a folder, archive, share as a link and delete (with undo). Templates ⋯ sorts, makes folders and adds a template someone shared with you.
- **History:** edit a finished workout (sets, name, start, duration), save it as a template, share it as text, delete it with undo.
- **Exercises:** create your own (also right from the picker), edit, pin a note, hide or delete; charts and records per exercise.
- **Measure:** log body weight and measurements, with a chart per measurement.
- **Profile:** workouts per week, streak, recent records, a reminder to back up, plate and 1RM calculators.
- **Your data:** Back up now (Save to Files, iCloud Drive, AirDrop…), restore, Strong import, CSV export. Backups are the same file as the web app's, in both directions.

Not in the app yet: the History calendar, merging exercises, editing the warm-up scheme, Delete all data, and opening a shared template link directly (paste it under Templates ⋯ instead). After that: the Increment name and icon, and the store release.

## Try it on your iPhone (free, no Apple Developer account)

1. Install **Expo Go** from the App Store.
2. On your Mac, in your copy of the repo (needs [Node.js](https://nodejs.org) 20 or newer):
   ```sh
   cd app
   npm install
   npx expo start
   ```
3. Scan the QR code with the iPhone camera. The app opens in Expo Go and reloads whenever the code changes.
4. To bring your data: in the web app, Settings → Back up now, save the file to iCloud Drive. In the app, Profile → ⚙ → Restore from backup.

Your phone and Mac need to be on the same Wi-Fi. If that doesn't work (eduroam, for example), install the tunnel once with `npm i -g @expo/ngrok`, then use `npx expo start --tunnel`.

Android works the same with Expo Go from the Play Store. `npx expo start --web` opens it in a browser.

## How it's organised

```
src/app/              screens (Expo Router: every file is a route)
  (tabs)/             Profile, History, Workout, Exercises, Measure
  active.tsx          the running workout (slides up; pull down to minimize)
  pick-exercises.tsx  adding or replacing exercises (and creating one)
  reorder.tsx         drag-and-drop order of a workout or template (?draft=edit)
  summary/[id].tsx    after Finish: records, and the template question
  template-edit.tsx   the template editor (?id= to edit, ?from= a finished workout)
  workout-edit/[id]   editing a finished workout
  tools.tsx           plate calculator and 1RM calculator
  exercise-form.tsx   creating or editing an exercise
  settings.tsx        units, workouts, stats, plates, theme, language, your data
  workout/[id].tsx    a finished workout and its ⋯ menu
  exercise/[id].tsx   an exercise: about, history, charts, records
  measure/[type].tsx  a measurement: chart, entries
  template/[id].tsx   a template preview and its ⋯ menu
src/data/             state (store.ts) and storage: SQLite on the phone, localStorage on web
src/lib/              language, colours, formatting, starting and finishing a workout, templates,
                      measurements, backups and files, rest timer notifications
src/ui/kit.tsx        shared building blocks (large titles, grouped rows, switches, fields, buttons)
src/ui/overlay.tsx    action sheets, dialogs, date/time and number entry, toasts
src/ui/Chart.tsx      line and column charts (react-native-svg)
src/ui/workout/       exercise blocks (running workout, template editor, Edit workout), set rows,
                      rest timer, the bar above the tabs
```

## Rules

- Logic goes in `../setlog/js/core`, not here, so the web app gets it too. `npm test` in the repo root tests it.
- Editors work on a draft in the store: `active` is the running workout, `edit` the template or finished workout being edited (`editDraft(key, fn, entryId)`). Exercise changes made while editing wait in the draft until Save.
- Texts are English and go through `tr()`. Add the German to `../setlog/js/core/i18n-de.js`; the tests fail when a text has none.
- Colours come from `../setlog/js/core/themes.js` (generated from the web app's CSS). Use `useColors()`, never hard-coded colours.
- Before pushing: `npx tsc --noEmit` and `npm run bundle` (CI runs both).
- Expo changes with every SDK. Check the docs for the SDK in `package.json` (`https://docs.expo.dev/versions/v57.0.0/`) rather than memory; see `AGENTS.md`.
