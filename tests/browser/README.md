# Browser tests

End-to-end suites that drive the web app and the Expo app's web build in an emulated iPhone 13 (Playwright, Chromium). The unit tests for the shared core are separate: `npm test` in the repo root.

```sh
node tests/browser/run.mjs                    # everything (about 4 minutes from a fresh clone)
node tests/browser/run.mjs web                # the web app suites
node tests/browser/run.mjs app                # the app suites (runs `expo export` first)
node tests/browser/run.mjs web-fixes app-logging   # single suites
node tests/browser/run.mjs app --no-build     # reuse app/dist
```

The runner serves `setlog/` on :8765 and `app/dist` on :8790 itself, runs `npm ci` in `app/` if needed, downloads the sample Strong export into `data/` and builds a fresh backup from it before the app suites. Screenshots land in `.out/<suite>/`. `data/` and `.out/` are git-ignored.

## Setup

- Node 20 or newer.
- Playwright: `env.mjs` uses a local install (`npm install` in this folder installs the version pinned in `package.json`, the one CI uses) or a global one (cloud containers often have one at `/opt/npm-tools`).
- Chromium: Playwright's own if it matches, otherwise any `chromium-*` under `$PLAYWRIGHT_BROWSERS_PATH`, `/opt/pw-browsers` or `~/.cache/ms-playwright`, or the path in `$CHROMIUM`. With none installed: `npx playwright install chromium` (needs access to Playwright's download host).
- Network for the app suites: the npm registry (`npm ci`) and `raw.githubusercontent.com` (the sample export, 86 workouts from a public Strong export, not committed because its licence is unknown).

## In CI

The `browser` job in `.github/workflows/test.yml` runs every suite on every push and pull request: `npm ci` in `app/`, `npm install` here, `npx playwright install --with-deps chromium` (the browser and the Linux libraries it needs), then `node tests/browser/run.mjs`. When a suite fails, `.out/` is attached to the run as the artifact `browser-test-screenshots` (kept 14 days): open the run on GitHub, then Artifacts at the bottom of its summary. The job takes about 4 minutes (3 of them the suites).

When you update Playwright, change the version in `package.json` here; the suites have to pass with it locally first.

## Suites

| Suite | Checks | What it covers |
|---|---|---|
| `web-template-update` | 14 | "Update template" after a changed workout: diff logic, values only, structure, undo, setting off, examples |
| `web-start-screen` | 17 | template cards and ⋯, archive, folders, sort, share links in and out, Strong notes import |
| `web-v13` | 16 | 1RM formulas, volume options, "Start history from", previous values, units, warm-up scheme, suggestion, focus metric |
| `web-de` | 5 | no English left in the German UI; the language setting |
| `web-themes` | 7 | Strawberry Matcha, Intense Red, Auto/Light/Dark, status-bar colour before first paint |
| `web-suggest` | 7 | the suggested workout follows a changed routine after about two rounds |
| `web-fixes` | 33 | the 18 fixes of 1.6.0, drag-and-drop reorder (mouse, touch, keys), unit switch round trip |
| `web-smoke` | 4 | Profile chart, new template from the editor and from a workout, exercise chart |
| `app-first-start` | 15 | first start, restore a web-app backup, every screen with data, live theme/language/unit switches, Strong import |
| `app-logging` | 17 | logging a workout end to end, rest timer, set types, supersets, minimize and reload, reorder, finish, template update (German) |
| `app-editing` | 22 | template editor and menus, folders, shared links, Edit workout, focus metric, plates and 1RM, start time, new exercises, charts, Measure, backups, settings |
| `app-parity` | 11 | History calendar (light, dark, German), Merge into another exercise, Warm-up sets and ⋯ → Add warm-up sets, the name row, Delete all data, template links that open the app |

`make-backup.mjs` is a helper, not a suite: it imports the sample export into the web app, adds a "Pull" template in an "Upper / Lower" folder, two body weights, Intense Red, German and the name "Laurin", and saves `data/setlog-backup.json` through the app's own backup code. The app suites restore it (`restore(page, dialogs, { english: true })` in `app-editing.mjs` switches to English afterwards).

## Writing tests

- Every suite imports from `env.mjs` (`launch`, `devices`, `WEB`, `APP`, `shots`, `waitReady`, `grantWakeLock`, data paths), counts its checks with `ok(...)` and ends with `console.log(\`\n${passed} checks passed\`)`, which the runner reads. Add a new suite to `WEB_SUITES` or `APP_SUITES` in `run.mjs`.
- Each scenario collects `pageerror` and console errors and ends with `assert.deepEqual(errors, [])`.
- **Web app:** new contexts use `devices['iPhone 13']`, `serviceWorkers: 'block'` and usually `locale: 'de-DE'` (decimal commas). English suites pin the language with `localStorage['setlog.lang'] = 'en'` in an init script. Drive the store directly where clicking adds nothing: `page.evaluate(async () => (await import('/js/store.js')) …)`; screens via `(await import('/js/ui.js')).setTab(...)` / `.push(...)`. Wait for `waitReady(page)` after every `goto`.
- **App:** contexts call `await ctx.addInitScript(grantWakeLock)` (headless Chromium denies the Screen Wake Lock, and expo-keep-awake then logs an error a phone never shows). testIDs become `data-testid`, so use `page.getByTestId(...)`. Hidden tabs stay mounted on web: check rows by testID, not the whole page text. Section titles are uppercase in the page text. Pushed screens hide the tab bar, so `page.goBack()` before switching tabs. App data is in `localStorage['increment.data']`.
- Timing: web screens slide in, so wait about 500 ms before measuring positions; app overlays fade in for 180 ms, so wait before screenshots.
- Touch drags: dispatch `new Touch()` / `new TouchEvent()` from `page.evaluate` (see the reorder section of `web-fixes.mjs`).

## Screenshots for review

Laurin reviews changes by looking at them, so a pull request that changes the UI comes with before/after screenshots of the screens it touches: light and dark, and German where text changed. Serve both versions side by side and screenshot the same screen in each with a short script that imports `launch` and `devices` from `env.mjs`:

```sh
git worktree add ../before origin/expo-app            # the version before your change
(cd ../before && WEB=http://localhost:8766/ APP=http://localhost:8791 node tests/browser/run.mjs --serve app) &
node tests/browser/run.mjs --serve app &               # yours on :8765 and :8790
```

Drop `app` to serve only the web apps. The worktree needs its own `npm ci` in `app/` (the runner does it).

## Store screenshots

```sh
node tests/browser/run.mjs app-store-shots     # builds and serves the app, then writes tests/browser/.out/store/
node tests/browser/store-frame.mjs <folder>    # frames your own screenshots the same way (add --store play for Google Play)
```

`app-store-shots.mjs` isn't a test suite (CI doesn't run it). It loads the demo data from `store-demo.mjs`, not the test backup:
- 16 weeks of a 4-day upper/lower split up to yesterday, with steady progression and one deload week (half the sets at the same weights, so the charts don't dip);
- no personal name.

It takes six screens in English and German: a running workout with the "previous" column, the rest timer, an exercise's 1RM chart, the History calendar, the templates with the suggested workout, and Profile.

What it writes, into `tests/browser/.out/store/` (git-ignored):
- the bare screens in `raw/`;
- the framed ones for the App Store (6.9″, 1320 × 2868) and Google Play (phone, 1080 × 1920): black background, a headline above the screen;
- the 1024 × 500 Play feature graphic, from `app/assets/images/icon.png`.

The headlines are in `store-captions.mjs`, one per screen and language. `store-frame.mjs` adds them, so screenshots from the iOS Simulator or a phone get the same look: name them `<lang>-<n>….png` (`en-1.png`, `de-3-chart.png`; n is the screen 1–6 and picks the caption), put them in a folder, and run it on that folder. The framed copies land in `<folder>/framed/`.

Store screenshots have to show the real app, and the web build differs from it:

- **Icons:** the app uses SF Symbols on iPhone and Material Symbols on Android and the web. The web screenshots show the Android icons.
- **Font:** the browser's sans-serif (Inter in the cloud container, whatever is installed elsewhere), not SF Pro (iPhone) or Roboto (Android).
- **No status bar or home indicator.** Both stores accept that, but a phone screenshot has them.
- **The running workout** is a full screen in the web build; on iPhone it's a page sheet with the screen behind it showing at the top.

So the Play screenshots from the web build are close to the Android app (icons match; only the font differs), and the App Store screenshots are drafts for layout and text. For the final App Store set:

1. Make the demo data a backup file with `node tests/browser/store-demo.mjs en > store-demo-en.json` (or `de`). Drag it onto an iPhone with a 6.9″ screen in the iOS Simulator to save it to Files, and restore it under Settings → Restore from backup.
2. Open the same six screens and run `xcrun simctl io booted screenshot en-1.png` for each.
3. Frame them with `store-frame.mjs`.
