# Setlog: notes for Claude

Setlog is a free, open-source workout tracker (MIT), built by Laurin Libossek (GitHub `laurinlibossek`) to replace the paid Strong app. He's the only maintainer and reviews everything. Two apps share one core:

- **Web app** (`setlog/`): an installable PWA. Plain ES modules with Preact + htm vendored, no build step, no dependencies. Live at https://laurinlibossek.github.io/setlog/, deployed by `.github/workflows/pages.yml` on every push to `main`.
- **Store app "Increment"** (`app/`): Expo / React Native (SDK 57, Expo Router, TypeScript), not released yet. Laurin runs it in Expo Go.
- **Shared core** (`setlog/js/core/`): the logic without DOM, storage or UI framework. The app imports it as `@setlog/core`.

Read next, in this order:
1. [`docs/dev/backlog.md`](docs/dev/backlog.md): where things stand and what to do next.
2. [`docs/design/README.md`](docs/design/README.md) before touching any screen of the app: the Tally design language, and `phases.md`, the plan for rebuilding the app in it.
3. [`docs/dev/architecture.md`](docs/dev/architecture.md): decisions, code map, gotchas.
4. [`tests/browser/README.md`](tests/browser/README.md): the browser tests.
5. [`app/AGENTS.md`](app/AGENTS.md) before touching `app/` (Expo changes between SDKs: check the versioned docs, not memory).

## Branches and pull requests

- All current work is on **`expo-app`**: web 1.6.2 plus the app, not merged yet. `main` is the live web app 1.6.0 and has no `app/` or `tests/browser/`. If your session starts on `main`, run `git fetch origin expo-app && git checkout expo-app` before anything else.
- **Never push to `main`**: it deploys straight to people's phones. Branch from `expo-app`, push your branch, and open a pull request into `expo-app`. Laurin merges after reviewing.
- Several sessions may work at the same time on different branches. Keep each PR to one task so they merge cleanly, and expect conflicts in the shared hot spots: `setlog/js/core/i18n-de.js`, `setlog/js/store.js`, `setlog/sw.js`, `docs/dev/backlog.md`. Fetch and rebase on `origin/expo-app` before opening the PR.
- Commits use Laurin's GitHub noreply address (`134843708+laurinlibossek@users.noreply.github.com`), never a personal email.
- In the PR description: what changed for the user, before/after screenshots of every screen you touched (light and dark, German where text changed; see "Screenshots for review" in `tests/browser/README.md`), the test results, and anything Laurin has to decide.

## Rules for every change

- **Versions:** a web app release bumps `VERSION` in `setlog/sw.js` and `APP_VERSION` in `setlog/js/store.js` (same number); installed apps then show an update prompt. On `expo-app` the web app stays at 1.6.2 until it's merged (it was never deployed). A new JS file in the web app goes into `ASSETS` in `sw.js` (`npm test` fails otherwise).
- **Both languages:** every text people see is wrapped in `tr('…')` (web: `js/i18n.js`; app: `useLang()` in `src/lib/i18n.ts`) and has German in `setlog/js/core/i18n-de.js`. The English text is the key; German uses "du". `npm test` fails on a missing translation or a duplicate key, in both apps.
- **Logic both apps need goes into `setlog/js/core/`**, with no browser APIs (checked by `npm test`), and gets a unit test in `tests/core.test.mjs`.
- **Colours:** the web app's are tokens in `setlog/css/app.css` (after changing one, run `npm run themes`, which regenerates `core/themes.js`). The store app's colours, spacing and type are the Tally tokens in `docs/design/tokens.json` (after changing one, run `npm run tally`, which regenerates `app/src/design/tally.ts`); new app code takes colours from `useTally()`. `npm test` checks both. The app's look follows `docs/design/` (Tally).
- **Units:** stored as kg, km and seconds; inputs accept decimal commas. Stored exercise names stay English (they match Strong exports); German is a display name from `core/exercise-names-de.js`, so show exercises with `exLabel(ex)` (web) or `f.exName(ex)` (app), never `ex.name`.
- **UI text:** short, plain, sentence case ("Update template", "Keep original template"), matching the existing strings.
- **Root README** (Laurin's rule): explain the core mechanics and the non-obvious tricks only, no lists of settings or minor features. Keep the install steps, backup advice, limits, "How it's built" and his Background text.

## Commands

```sh
npm test                                   # core unit tests + guards (repo root, Node 20+, nothing to install)
node tests/browser/run.mjs                 # browser suites: web app and app (see tests/browser/README.md)
node tests/browser/run.mjs web             # just the web app suites
cd app && npm ci && npx tsc --noEmit       # app type check
cd app && npm run bundle                   # iOS + Android export (what CI checks)
cd app && npx expo-doctor                  # dependency and config check
```

CI (`.github/workflows/test.yml`) runs `npm test`, the app type check, both bundles and the browser suites on every push and PR. When a browser suite fails, the run has the suites' screenshots attached as an artifact (`browser-test-screenshots`).

## Done means

- `npm test` is green; `tsc --noEmit` and `npm run bundle` too if `app/` changed.
- The browser suites for the parts you touched are green, and new behaviour has new checks (extend a suite, or add one and register it in `tests/browser/run.mjs`).
- Screenshots for review are in the PR.
- `docs/dev/backlog.md` is updated in the same PR, and `docs/dev/architecture.md` if you changed how something works.
