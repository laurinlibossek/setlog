# Building Tally into the app, phase by phase

The store app (`app/`) moves to Tally in pull requests into `expo-app`, one phase each. Phase 1 lays the foundation; phases 2 to 5 can then run in parallel sessions, because each owns different screens. Read `README.md` here first, then the parts of `components.md`, `navigation.md` and `motion.md` your phase names. `screens.html` shows the target look; open it in a browser or screenshot it with Playwright.

Every phase follows `CLAUDE.md`: German for every new text, browser suites green (update a suite where a screen changes on purpose, and say so in the PR), before/after screenshots in light and dark, and `docs/dev/backlog.md` updated. Keep existing `testID`s where the element survives; a suite that has to change gets the new flow, not a weaker check. Colours come from `useTally()` in new code; `useColors()` is the bridge for screens not rebuilt yet.

## 1. Foundation (done in `claude/tally-foundation`)

- `docs/design/`: the design language, `tokens.json`, the components, this plan.
- `npm run tally` generates `app/src/design/tally.ts` from `tokens.json`; `npm test` checks they match.
- `src/lib/theme.ts`: `useTally()` gives the Tally palette (light, dark, Strawberry Matcha, Intense Red; "Auto" follows the phone). `useColors()` maps the old colour names onto it, so every screen is already ink on paper, true black in dark mode, with no blue or green; records use the signal colour.
- `src/ui/tally/Tally.tsx`: `Tally`, `Stroke`, `fives()`. The set row's check button is now the set's stroke, at the start of the row (same `check-<id>` testID).
- Kit: capsule buttons and controls, Title 2 section headers in sentence case, radii from the tokens, a Tally switch.
- Core: `weekStreak` counts in one pass (80 ms to 1.4 ms on a 5-year log), same results.

## 2. Tabs and Today (done in `claude/tally-tabs`)

Owns: `src/app/(tabs)/`, `src/app/_layout.tsx`, a new Account sheet.

Built as planned, with these choices: the web build keeps JS tabs (`(tabs)/_layout.web.tsx`), drawn like the native bar, because native tabs on the web are a pill at the top without test ids or an accessory. The bottom accessory exists only on iOS 26 and later, so Android and older iPhones get the same Now Lifting bar floating above the tab bar inside each tab. Lifts lists the exercises you've done; the whole library is under Search. The week strip's planned days come from the weekdays usually trained until there are blocks (phase 5).

- Native tabs (`NativeTabs` from `expo-router/unstable-native-tabs`, SDK 57; works in Expo Go): Today, Plan, Progress, and Search with `role="search"`. SF Symbols as in `README.md` → Iconography. `minimizeBehavior="onScrollDown"`. Check the SDK 57 docs before writing it (`app/AGENTS.md`). If the web build can't give the tests stable tab ids, keep JS tabs for web only and say so.
- Today (`index`): eyebrow date, large title, avatar (opens Account), the Up next card (`suggestTemplate`; Start), at most one coach note slot (empty until phase 7), This week (week strip from the weekly goal and workouts), Sets per muscle for the last 7 days by body part (counts only; no targets without Pro).
- Plan: the templates list and folders that are on the Workout tab today, plus "Empty workout" in its + menu.
- Progress: a hub with Last 30 days (workouts, volume, records), rows to Workouts (History), Lifts (the exercise list), Records and Body (Measure), and the Profile charts. History, Exercises and Measure become pushed screens.
- Search: the exercise search, focused on open.
- Account: a sheet from the avatar with the name and the Settings rows; the Profile tab goes away.
- The minimized workout moves into `NativeTabs.BottomAccessory` (regular and inline layouts, `usePlacement()`).
- Tests: `app-first-start`, `app-editing` and `app-parity` navigate by tab; give them the new routes.

## 3. The session (done in `claude/tally-session`)

Owns: `src/app/active.tsx`, `src/ui/workout/`, a new `src/ui/tally/Keypad.tsx`.

- Set rows as in `components.md` → SetRow: stroke, weight × reps with ghost values from last time, chips for set type and reps left; no PREVIOUS column, no header row, no field boxes except on the set being logged.
- Header: minimize, ⋯, workout name, elapsed time, the hero tally of the whole session, "4 of 22 sets · 1 record".
- Up next: the remaining exercises as rows with their own tally; drag to reorder.
- Action bar: Log (logs the next set with its shown values) → Rest (countdown, −15, +15, Skip, drain bar, "Reps left?" 0 · 1 · 2 · 3+) → "Finish workout" after the last set. Finish leaves the top corner.
- Store reps in reserve on the set (`rir`, core); RPE stays readable and maps to it (10 → 0, 9 → 1, 8 → 2, 7 and below → 3+).
- The keypad sheet for weights, reps and times, with the exercise's real step and plates per side.
- Rest drawn by the system: one Reanimated animation for the drain bar, the text updated once a second (replaces `useNow(250)` and `useNow(200)`).
- `keepAwake` off by default in the store app (the web app keeps it on).
- Tests: `app-logging` changes most; keep its checks (rest ±15, skip, set types, supersets, minimize, reorder, finish rules).

## 4. Summary and exercise page (done in `claude/tally-summary`)

Owns: `src/app/summary/[id].tsx`, `src/app/exercise/[id].tsx`, `src/app/workout/[id].tsx`.

- Summary: Done, date eyebrow, name, Stat strip (Time, Volume, Sets), hero tally, Records with the highlight, Notes slot, and the routine question as a switch row ("Save changes to Push A" with one line of what changes) instead of the dialog. Undo stays.
- Exercise page: one scroll, no inner tabs: name, equipment and muscle, estimated 1RM as the hero number with its change, range control, the line chart with record dots, Stat strip, Rep maxes, History, How to.
- Tests: `app-logging` (template question), `app-editing` (exercise charts).

## 5. Blocks

Owns: a new `blocks` store in the core and storage, Plan's block card.

- A block: name, start date, weeks, deload week, routines. Created from Plan; Today's Up next names the week ("Week III, day 2").
- The block card with Roman-numeral weeks (`components.md` → BlockWeeks).
- Backups carry blocks; older backups restore without them.

## 6. Development build

Needs Laurin's Apple Developer account.

- EAS development build; the app icon and splash on the phone.
- Live Activity and Dynamic Island for the running workout and rest (`expo-widgets`), countdown drawn by the system.
- TestFlight.

## 7. TrueTrain

Private engine, public contract. The plan is in Laurin's Claude doc "Increment: research, architecture and TrueTrain".

- `core/coach.js`: the coach contract, the empty coach and the snapshot builder (last 12 weeks, all-time bests, body weight, profile, block).
- The note surfaces from `coaching.md`.
- Pro through an in-app purchase checked on the phone.
- Muscles per exercise (primary and secondary) for the built-ins, and a training profile.
