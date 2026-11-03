# How Setlog is built

Background for working on the code: the decisions behind it, where things live, and the traps found so far. Status and next steps are in [backlog.md](backlog.md).

## Two apps, one core

| | Web app | Store app ("Increment") |
|---|---|---|
| Folder | `setlog/` | `app/` |
| Stack | Preact + htm (vendored in `js/vendor`), plain ES modules, no build step | Expo SDK 57, React Native, Expo Router, TypeScript |
| Storage | IndexedDB (`js/db.js`), running workout mirrored to localStorage | SQLite (`src/data/storage.ts`, one `docs` table keyed by store + id); a localStorage stand-in on web (`storage.web.ts`, key `increment.data`) |
| Ships to | GitHub Pages on every push to `main` | not released yet; Expo Go on Laurin's phone |

- **Shared core** `setlog/js/core/`: everything that doesn't touch the DOM, storage or a UI framework. `npm test` enforces that (no browser APIs, only core imports). `index.js` re-exports it all; the app imports it as `@setlog/core` (tsconfig `paths` plus `watchFolders` in `app/metro.config.js`).
  - `units.js`, `calc.js` (1RM formulas, volume, records, plates, warm-ups), `drafts.js` (typed text vs stored numbers), `templates.js` (`templateChanges`, `applyWorkoutToTemplate`), `sessions.js`, `suggest.js` (`suggestTemplate`), `csv.js` (Strong import/export), `backup.js`, `share.js` (template links), `seed.js` (built-in exercises, example templates, `CATEGORY_HELP`), `i18n.js` + `i18n-de.js`, `themes.js` (generated), `settings.js` (defaults, plates, `changeSetting` for the kg/lb switch), `search.js`, `workout.js` (the running workout: placeholders, check-off, pending sets, finishing, supersets, warm-ups, focus metric), `editing.js` (template editor and Edit workout drafts, copies, folders, new exercises, exercise changes waiting for Save, merging exercises), `chart.js` (axis ticks, ranges, weekly counts, streak, the History calendar's month), `settings.js` also cleans the warm-up scheme typed in its editor (`warmupFromInput`).
  - Labels in core are English and double as translation keys.
- The web modules `calc.js`, `seed.js`, `io.js`, `util.js`, `i18n.js`, `store.js` are thin layers that add translations and app state on top of the core.
- Much of the web `store.js` (saving workouts, templates, folders, the active workout) is still web-only plumbing around the core; the app has its own `app/src/data/store.ts`. A storage adapter could unify them later.

### Why it's built this way

- **PWA first (Sep 2026):** free to install from a link, no Mac or Apple Developer Program needed. The repo holds only code; all training data stays on the phone. No backend, no account, no sync: JSON backup and restore move data between devices.
- **Expo for the store app (Oct 2026):** real iPhone and Android apps from one TypeScript codebase that can import the same core as the web app. Skip (Swift→Kotlin) and Kotlin Multiplatform were rejected because the core would have to be rewritten and the web app couldn't share it. The web app stays alongside the store app.
- **Testing the app without the Apple Developer Program:** Expo Go (local notifications work there), the iOS Simulator, or a free-Apple-ID Xcode build (re-install every 7 days). Android is free. The paid program is only needed for TestFlight and the App Store.
- **Name:** "Setlog" is already used by other workout apps, so the store app is called **Increment** (`app.json`: name Increment, slug and scheme `increment`). The web app stays Setlog everywhere (visible name, URL, repo, storage keys) until the store launch. **Icon and splash:** a white Roman-numeral "I" on black, drawn as vector paths in `app/scripts/icons.mjs` (three designs: classic, slab, thin; their SVGs are in `app/assets/icon/`). `node app/scripts/icons.mjs [design]` renders every PNG `app.json` uses: `icon.png` (iOS, 1024, RGB without an alpha channel, which App Store Connect requires), the Android adaptive foreground and monochrome icon (the letter scaled into the 66 dp safe circle), a black background, `splash-icon.png` and the favicon of the web build. The splash and the Android icon background are black in light and dark mode. The web app keeps its own icon.

## Data

- Stored in **kg, km and seconds**, converted for display. Inputs accept a decimal comma ("62,5").
- Drafts keep the stored number behind untouched text (`orig` in `core/drafts.js`), so opening and saving in lb or mi doesn't drift the kilograms.
- Exercise ids: built-ins are `x-<slug>` (`x-bench-press-barbell`), custom ones `c-<slug>`. Exercise names stay English everywhere because they match Strong exports; German names would need a display-name map for the ~190 built-ins.
- Backups (`setlog-backup-YYYY-MM-DD.json`) are the same format in both apps, in both directions. Restoring one counts as the latest backup (the reminder shows after 3+ workouts and 14 days without one; "Later" snoozes 7 days).
- Template links: `https://laurinlibossek.github.io/setlog/#template=<base64url JSON>` (`core/share.js`). Built-in exercises go by id, custom ones by name, category and body part. On iPhone the Home Screen app has separate storage from Safari, so links are pasted under Templates ⋯ → Add shared template. The store app also opens any link with `?template=` or `#template=` that is sent to it (see "Template links into the app" below).
- "Start history from" (`settings.historyStart`): older workouts stay in History but are ignored for previous values, records and charts. Exercise pages, counts and delete use all workouts (`allSessions()`).

## Web app (`setlog/`)

- `index.html`: app shell; an inline script applies the stored theme and status-bar colour before first paint.
- `sw.js`: offline cache. `VERSION` must change with every release and `ASSETS` must list every module (`npm test` checks); installed apps then show "A new version of Setlog is ready".
- `js/app.js`: entry (tabs, wake lock, theme, updates; `applyTheme()` lists the valid theme ids). `js/ui.js`: navigation (`setTab`, `push`, `nav.stacks`, `openSheet`, `closeAllModals`, `useLeaveGuard`). `js/store.js`: state (`S`) and all data actions. `js/db.js`: IndexedDB with auto-reconnect (Safari drops idle connections). `js/io.js`: files and sharing.
- `js/editor.js` and `js/sheet.js`: the workout logging UI, including the drag-and-drop reorder screen (`Reorder` in `editor.js`) and finishing (`finishFlow()` → summary → `offerTemplateUpdate()` on top after 350 ms). `js/screens/*`: the tabs.
- `css/app.css`: all colours as tokens. Light on `:root`, dark for the system setting and `data-theme="dark"`, then one block per named theme (Strawberry Matcha: light only; Intense Red: dark only). The choice is stamped as `data-theme` on `<html>` and mirrored to localStorage (`setlog-theme`, plus `setlog-theme-color` because iOS paints the status bar from the `theme-color` meta). `core/themes.js` is generated from the CSS with `npm run themes`; the CSS stays the source of truth.
- Language: `localStorage['setlog.lang']` (auto/en/de; auto follows the phone). Settings → Appearance → Language reloads the app.

## Store app (`app/`)

Read `app/AGENTS.md` first (Expo changes a lot between SDKs; check the versioned docs instead of memory). `app/README.md` has the route map.

- Routes in `src/app/` (Expo Router, JS tabs; native tabs were still "unstable" in SDK 57, switch with SDK 58). State in `src/data/store.ts`: immutable, `useSyncExternalStore`. The running workout is `state.active` (written to storage 250 ms after a change and at once when the app goes to the background); an open editor's draft is `state.edit` (not stored). `editDraft(key, fn, entryId)` copies only the changed exercise so the others don't re-render.
- Language and theme come from the app's settings, so a restored backup keeps them; "auto" follows the phone. Texts go through `tr()` from `src/lib/i18n.ts`, with the same dictionary as the web app.
- **Overlays** (`src/ui/overlay.tsx`): action sheets, dialogs, prompts, toasts, a date/time dialog (`pickDateTime`) and number entry (`promptNumber`) are drawn by the app, not native Alerts, so they sit on top of modal screens, look the same on iPhone and Android, and work in the web build for tests. Each modal screen mounts its own `<OverlayHost />`; the newest one shows them.
- **Running workout** (`active.tsx`): a modal screen (iOS page sheet; pull down to minimize to a bar above the tabs). Start/finish flows in `src/lib/workout.ts`; blocks, set rows (swipe to delete), rest pill/panel/watcher, mini bar and `useEditor` in `src/ui/workout/`.
- **Editing** (`template-edit.tsx` with `?id=` or `?from=<workout>`, `workout-edit/[id].tsx`): pushed screens with Cancel/Save in the navigation bar, sharing `ExerciseBlock` / `DraftBlocks` with the running workout (`draftKey` 'active' | 'edit', `mode` 'active' | 'template' | 'edit'). Rest timer and pinned-note changes wait in `draft.exPatches` until Save. `useEditor()` asks "Discard changes?" before leaving (`usePreventRemove`; swipe-back is off on those screens). The reorder screen takes `?draft=edit`.
- **Rest timer alerts** (`src/lib/restAlert.ts`): one local notification (id `rest-timer`, Android channel `rest`) scheduled for the end of the rest and moved or cancelled with the timer; in the foreground the app buzzes instead. Permission is asked when the first rest timer starts. `restAlert.web.ts` is a no-op so expo-notifications stays out of the web build.
- **Files out** (`src/lib/backup.ts`, `files.ts`): Back up now and Export as CSV write to the cache folder (`expo-file-system`) and open the share sheet (`expo-sharing`); on web they download.
- **Charts** (`src/ui/Chart.tsx`): the web app's line and bar charts with `react-native-svg`, axis maths from `core/chart.js`.
- **Template links into the app:** `src/app/+native-intent.tsx` (`redirectSystemPath`) catches every incoming URL with `template=`, hands it to `src/lib/incoming.ts` and returns `/` on a cold start (or `null`: stay where you are), so the link is never routed as a screen. `<IncomingLinks />` in the root layout then offers it with `offerSharedTemplate()`, the same dialog as a pasted link. Links that work today: `increment://add?template=<code>` in a development or store build, `exp://<computer>:8081/--/?template=<code>` in Expo Go. The web build reads its own address instead. For the web app's `https://…/setlog/#template=` link to open the app (a universal link / Android App Link), the domain root needs `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`, which for `laurinlibossek.github.io` means a `laurinlibossek.github.io` repository or a custom domain, plus the Apple team ID, `ios.associatedDomains` and `android.intentFilters` in `app.json`, and a development build.
- **History calendar, merging, warm-up scheme, Delete all data:** like the web app, on the core's `calendarMonth`, `canMergeExercises` / `mergeExercisePatch` / `moveExerciseEntries`, `warmupFromInput`. `mergeExercise()` and `deleteAllData()` are in `store.ts`; both keep a running workout (merging moves its entries too). The warm-up editor is a pushed screen (`warmup.tsx`), not a dialog. The name in Settings is a row that opens the app's prompt, the same on iPhone and Android.
- Haptics on check-off and when a rest ends (`expo-haptics`); the screen stays on during a workout (`expo-keep-awake`, setting `keepAwake`).

## Gotchas

- **App, `useAppSelector`:** a selector that builds a new array or object on every call makes React loop ("Maximum update depth exceeded", minified error #185). Select stored objects and derive with `useMemo`.
- **App, `dist/`:** `npm run bundle` writes the iOS/Android export into the same `dist/` as the web export, so export web again before browser tests (the runner does unless `--no-build`).
- **App, web build and the address:** Expo Router keeps query parameters as the screen's params and writes the address back from them, so `history.replaceState` alone doesn't remove `?template=`; `router.setParams({ template: undefined })` does.
- **App, `npx expo serve`:** since `measure/[type]` exists, reloading `/measure` redirects to `/measure/` and 404s. The test runner serves the static export itself.
- **App, Expo Go:** it only has its bundled native modules; a library with native code needs a development build. On Android, Expo Go logs a warning about remote push when expo-notifications loads (harmless; local notifications work).
- **Web, iOS:** the Home Screen app's storage is separate from Safari's. The rest timer can't alert with the phone locked (iOS suspends web apps); "Keep screen on" works around it, and the beep needs the ring switch on ring.
- **Lint:** there's no linter in the repo. To catch missing imports or duplicate keys, copy `setlog/js` (without `vendor`) somewhere with an ESLint flat config (`no-undef`, `no-dupe-keys`); it caught a missing import and a duplicate German key before.
- **Deliberate:** the example templates Push, Pull and Legs keep their English names in German (the split is known by them). There's no "Hybrid" 1RM formula (Strong's couldn't be verified).

## Not possible in the web app

Rest timer as a Live Activity / Dynamic Island, alternate app icons after install, an Apple Watch app, and lock-screen timer alerts (would need Web Push from a server). The store app is where these can happen.
