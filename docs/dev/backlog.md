# Status and backlog

Last updated 3 Nov 2026 (store config and privacy pages). Keep this file current: when a pull request finishes an item, move it to "Done" in the same PR and note any decision Laurin made.

## Where things are

- **`main`**: the live web app, **1.6.0** (14 Oct 2026).
- **`expo-app`**: everything since, not merged yet:
  - web **1.6.2** (never deployed; no visible change except exercise search: "bb", "db" and similar shortcuts only count as whole words, so "bench bb" no longer lists dumbbell exercises). The running-workout logic, editing helpers and chart maths moved into the core.
  - the store app in `app/` (14–19 Oct 2026): everything the web app does (the last pieces came on 2 Nov 2026), plus rest timer notifications with the phone locked and template links that open the app.
  - browser tests in `tests/browser/` and these docs (2 Nov 2026).
  - the browser suites in CI, and the launch prep in `docs/launch/` (merged 3 Nov 2026).
- **Open pull requests into `expo-app`** (3 Nov 2026), each waiting for Laurin's review: [#4](https://github.com/laurinlibossek/setlog/pull/4) store config and privacy pages, [#5](https://github.com/laurinlibossek/setlog/pull/5) German exercise names (Laurin corrects the list), [#6](https://github.com/laurinlibossek/setlog/pull/6) icon and splash (Laurin picks one of three designs), [#7](https://github.com/laurinlibossek/setlog/pull/7) store screenshot script. Each adds a line here, so whichever is merged later conflicts in this file: keep both lines.
- While `expo-app` is unmerged, web changes on it stay at version 1.6.2 (it was never deployed, so phones never saw it). Bump the version when it's merged or when Laurin asks for a release.

## Next, in order

1. **Laurin tries the app on his phone** in Expo Go (`git pull`, `cd app && npm install && npx expo start`): especially the rest notification with the phone locked (allow notifications on the first rest timer), Back up now → Save to Files, and editing templates; since 2 Nov also the History calendar, Merge into another exercise, Settings → Warm-up sets and Delete all data, and a template link opening the app (in Expo Go: `exp://<computer>:8081/--/?template=<code>`, the code from a shared link). His feedback comes before new features. After #4 and #5 also Settings → Privacy policy and the German exercise names; after #6 the icon and splash need a development build (Expo Go shows its own icon).
2. **Merge `expo-app` into `main`** after Laurin's go. **Blocker first: fill in the contact email** (`CONTACT_EMAIL` in `setlog/js/core/links.js`, the app's own address); the Pages deploy refuses to run while it's the `[EMAIL]` placeholder, because a placeholder must never go live. That deploys web 1.6.2: afterwards check the live site (`sw.js` reports the new version; on the live site modules are under `/setlog/js/…`).
3. **Increment branding:** icon and splash with the final name. Then a development build and TestFlight once Laurin has the Apple Developer account (EAS). With the account, the web app's template links can open the app too (universal links and Android App Links): Laurin decides where the `.well-known` files live (a `laurinlibossek.github.io` repository or a custom domain); the steps are in architecture.md under "Template links into the app". Store texts, the privacy policy and answers to the stores' questions are drafted in `docs/launch/`.

## Open items, any order

- **Before the store release** (list in [`docs/launch/README.md`](../launch/README.md); Laurin's decisions of 3 Nov 2026 are recorded there): the TMview, App Store Connect and Play name checks, the Apple and Google developer accounts, the icon and splash, the store screenshots, and Google Play's closed test (12 testers, 14 days).
- **A storage adapter** so the web `store.js` data actions and `app/src/data/store.ts` share one implementation. Touches almost everything, so do it on its own, not alongside feature work.
- Search on the start screen (low value with few templates).
- Unknowns that need Laurin's input: where Strong puts exercise notes in a real export (sticky notes are probably not exported at all), and what Strong's exercise ⋯ → Preferences contains. The lock column in Strong's template editor is cosmetic (Laurin).

## How finishing a workout that differs from its template works (since 1.1.0)

Reference for anyone touching the summary or templates.

- `finishFlow()` (web `sheet.js`; app `src/lib/workout.ts`) shows the summary, then the "Update template" dialog on top of it, like Strong's congratulations screen.
- `templateChanges(template, workout)` (`core/templates.js`) returns `{ addedExercises, removedExercises, reordered, addedSets, removedSets, typesChanged, supersetsChanged, valueSets, structure }`. Exercises pair by exercise id and occurrence (the 2nd Bench Press with the 2nd); sets pair warm-up to warm-up and working set to working set, each in order, so a skipped warm-up doesn't shift weights. `valueSets` counts template sets whose numbers would change.
- Structure changed → **Update values only** ("Updates values for N sets.", hidden if 0), **Update template and values** (red; "Removes 2 exercises. Removes 2 sets. Changes set types."), **Keep original template**. Only numbers changed → **Update values** or **Keep original template**. Nothing changed → no dialog.
- Updating returns the previous exercises, and the toast offers **Undo**. A full update keeps the template's own exercise notes and RPE.
- No question for example templates, "Do this workout again" or empty workouts (`templateId` is null), or when Settings → Ask to update templates is off. Sets that are unchecked or empty at finish are dropped, so they count as removed.

## Done

- **1.0.0** (22 Sep 2026): logging with the "previous" column, set types, RPE, supersets, rest timer, templates with folders, history with calendar and editing, exercise charts and records, Measure, Strong CSV import and export, JSON backup, offline service worker, dark mode, kg/lb and km/mi.
- **1.1.0:** the Strong-style "Update template" question and the setting to turn it off.
- **1.2.0:** ⋯ on every template card (edit, rename, duplicate, move, archive, share, delete), archive, folders and sorting, template links, exercise notes from Strong imports.
- **1.3.0:** suggested workout on the start screen, focus metric per exercise, seven 1RM formulas and their average, volume options (dumbbells twice, body weight on weighted and assisted exercises), "Start history from", "Previous values" from any workout or the same template, warm-up scheme, separate units for body weight and measurements.
- **1.4.0:** German, following the phone or set in Settings.
- **1.5.x:** colour themes Strawberry Matcha and Intense Red; status-bar colour; the suggestion weighs recent workouts more (`SUGGEST_DECAY` 0.6: a new routine takes over after about two rounds, one swapped day doesn't flip it).
- **1.6.0** (14 Oct 2026): 18 fixes from Laurin's issue list, drag-and-drop reordering (≡ handle or press and hold), the shared core with `npm test`.
- **App** (branch `expo-app`, 14–19 Oct 2026): storage, backup restore, Strong import, all screens; logging with rest timer, set types, supersets, minimize, reorder, finish and the template question; template editor and menus, Edit workout, focus metric, plate and 1RM calculators, start time, new exercises, exercise pages with charts, Measure, Profile charts and backup reminder, all settings, rest timer notifications.
- **Browser tests in the repo** (2 Nov 2026): `tests/browser/`, one runner for 11 suites (157 checks).
- **The rest of the web app in the app** (2 Nov 2026): the History calendar (the button next to the title), exercise ⋯ → Merge into another exercise (refuses exercises that log different fields; the target keeps its own rest timer and notes and takes the source's where it has none), Settings → Warm-up sets (its own screen), Delete all data (typing DELETE; settings, name and folders reset too; a running workout keeps going, like restoring a backup), template links that open the app (`increment://…?template=` and Expo Go's `exp://` link; the https link waits for universal links, see step 3), and the name in Settings as a row with a prompt on iPhone and Android alike (the backlog's "Android: plain text field (no prompt)" item, read as: use the app's own prompt like the web app does). The calendar, merge and warm-up logic moved into the core and the web app uses it too (no visible change). Suite `app-parity`, 11 checks.
- **Browser tests in CI** (2 Nov 2026): the `browser` job in `.github/workflows/test.yml` runs every suite on each push and pull request with Playwright 1.63.0 (pinned in `tests/browser/package.json`); on failure the screenshots are attached as the artifact `browser-test-screenshots`.
- **Launch prep drafts** (2 Nov 2026, `docs/launch/`): the name check (no app and no EU or German mark called exactly "Increment" turned up in web searches; the registers and App Store Connect couldn't be reached from the cloud session, so those checks are left to Laurin), the store listing for both stores in English and German (store name "Increment: Workout Log" / "Increment: Trainingstagebuch"), and the privacy policy in English and German, covering the web app too.
- **Store config and privacy pages** (3 Nov 2026), with Laurin's launch decisions: store name "Increment: Lifting Tracker" in both stores and languages; Strong not named in the listing; age rating 9+ ("Health or Wellness Topics" = Yes); the privacy policy as `setlog/privacy.html` and `datenschutz.html` (live with the merge into `main`), linked from the bottom of Settings in both apps in the app's language; support URL = GitHub issues; non-trader, so no Impressum or postal address (revisit if the app is ever monetized); bundle ID and Android package `io.github.laurinlibossek.increment` and `usesNonExemptEncryption: false` in `app.json`. The contact email is the `[EMAIL]` placeholder in `core/links.js` until Laurin creates the address. The service worker now lets pages other than the app itself through to the network (before, it answered every page with the app). New suite `web-privacy`.
- **German exercise names** (3 Nov 2026): the 190 built-ins have German display names (`core/exercise-names-de.js`, made consistent after Laurin's review: German where it's the standard term, English where gyms commonly say it, one base term for all equipment variants, checked by a unit test), shown in German in both apps; stored names stay English, renamed and custom exercises keep theirs; search finds both names; lists sort by the shown name. The German store description no longer says the names are English.
