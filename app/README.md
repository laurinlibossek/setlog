# Increment (iPhone and Android app)

The store version of Setlog, built with [Expo](https://expo.dev) (React Native). One codebase becomes a real iPhone app and a real Android app. The training logic isn't rewritten: the app imports the same core as the web app (`../setlog/js/core`, as `@setlog/core`), so records, the suggested workout, the Strong import, backups, translations and colour themes work exactly as they do on the web.

**Status:** you can log workouts. Start one empty, from a template or again from History. Last time's numbers show as grey placeholders, and checking a set off saves them. It also has the rest timer, set types and RPE, supersets, warm-up sets, drag-and-drop reordering, and Finish with records and the "update the template?" question. Pull the workout down and it waits in a bar above the tabs; it survives closing the app.

Your data comes over from the web app with a backup file. You can browse templates, history, exercise records and measurements, and change units, theme and language.

Still to come:
- rest timer alerts while the phone is locked
- editing templates and finished workouts
- charts
- logging measurements
- making backups

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
  pick-exercises.tsx  adding or replacing exercises
  reorder.tsx         drag-and-drop order of the running workout
  summary/[id].tsx    after Finish: records, and the template question
  settings.tsx        units, theme, language, restore a backup, Strong import
  workout/[id].tsx    a finished workout ("Do this workout again")
  exercise/[id].tsx   an exercise's history and records
  template/[id].tsx   a template preview
src/data/             state (store.ts) and storage: SQLite on the phone, localStorage on web
src/lib/              language, colours, formatting, starting and finishing a workout
src/ui/kit.tsx        shared building blocks (large titles, grouped rows, buttons)
src/ui/overlay.tsx    action sheets, dialogs and toasts (each modal screen has its own host)
src/ui/workout/       exercise blocks, set rows, rest timer, the bar above the tabs
```

## Rules

- Logic goes in `../setlog/js/core`, not here, so the web app gets it too. `npm test` in the repo root tests it.
- Texts are English and go through `tr()`. Add the German to `../setlog/js/core/i18n-de.js`; the tests fail when a text has none.
- Colours come from `../setlog/js/core/themes.js` (generated from the web app's CSS). Use `useColors()`, never hard-coded colours.
- Before pushing: `npx tsc --noEmit` and `npm run bundle` (CI runs both).
- Expo changes with every SDK. Check the docs for the SDK in `package.json` (`https://docs.expo.dev/versions/v57.0.0/`) rather than memory; see `AGENTS.md`.
