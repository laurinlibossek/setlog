# Screens and navigation

Strong organises the app by object (Profile, History, Workout, Exercises, Measure). Increment organises it by time: what to do now, what you plan, how it went.

## Tabs

| Tab | SF Symbol | What it holds | Replaces |
| --- | --- | --- | --- |
| Today | `sun.max` | Up next (the routine to start), one or two coach notes, this week's sessions, sets per muscle for the last 7 days, recent records. The avatar at the top right opens Account and settings. | Workout tab, Profile dashboard |
| Plan | `list.bullet.rectangle.portrait` | The current block (mesocycle) with its weeks, routines and folders, Build a split (Pro), examples. | Templates on the Workout tab |
| Progress | `chart.line.uptrend.xyaxis` | Last 30 days at a glance, then Workouts (history and calendar), Lifts (every exercise with its chart and records), Records, Body (measurements), Moving up. | History, Exercises, Measure tabs |
| Search | `magnifyingglass` | The system search tab (iOS 26 puts it apart at the trailing end). Exercises, routines and past workouts in one list. | Exercise search |

- Three tabs plus Search, in this order, with Today first and selected on launch.
- On iOS use native tabs (`NativeTabs` from `expo-router/native-tabs`): the system glass bar, `role="search"` for Search, minimize on scroll down. On Android the same API gives the Material bottom bar.
- Account (name, units, appearance, rest timer, backups, import, Pro, privacy policy) is a sheet from the avatar, not a tab.

## The session

The running workout is a full-height sheet, like Now Playing in a music app.

- **Minimized**, it becomes the Now Lifting accessory above the tab bar (`NativeTabs.BottomAccessory`): the session's tally, the exercise and set, the rest countdown, and Skip. It shrinks to the inline layout when the tab bar minimizes. Tapping it opens the sheet again.
- **Header**: Minimize (`chevron.down`), ⋯ (rename, change start time, notes, discard), the workout name in `t-title-1`, elapsed time in `t-number-m` `ink-2`, and the hero tally of every set in the session with "4 of 22 sets · 1 record" under it.
- **Current exercise**: name in `t-title-3`, "Barbell · last time 80 × 8, 8, 7" in `t-footnote`, at most one inline coach note, then the set rows. The next pending set's fields are filled with last time's numbers (or the coach's target) as ghost values.
- **Up next**: the remaining exercises as list rows, each with its own small tally. Drag to reorder; tap to jump.
- **Action bar**, bottom, three states:
  1. *Logging*: one primary button, "Log 82.5 × 8". Tapping it logs the set, turns its stroke into a stem with a light haptic, and starts the rest.
  2. *Resting*: the countdown in `t-number-l`, −15, +15 and Skip, the drain bar, and "Reps left?" with 0 · 1 · 2 · 3+ to rate the set just done. Rating is optional and one tap.
  3. *Done*: after the last set the button becomes "Finish workout". Finishing is never a button in the top corner.

## Screen templates

- **Tab root**: `t-eyebrow` (Today only) → `t-large-title` with one trailing control → content sections `space-8` apart, each with a `t-title-2` header. Floating tab bar.
- **Detail** (exercise, workout, routine): back and ⋯ in the bar → `t-title-1` with a `t-footnote` line → the hero number if there is one → chart → Stat strip → lists. One scrolling page; no inner tabs.
- **Summary**: Done at the top right → date eyebrow → workout name → Stat strip (Time, Volume, Sets) → hero tally → Records (highlighted) → Notes → Routine (a switch: "Save changes to Push A" with one line of what changes). The routine question is a row, not a dialog.
- **Sheets**: system sheets with detents for choices and short forms. The keypad is a sheet drawn by the app at `paper-2`.

## Mapping from the current app

| Today in Setlog | In Increment |
| --- | --- |
| Workout tab: Start an empty workout, template grid | Today: Up next card; Plan: routines; "Empty workout" in the + menu on Plan |
| Logging table with ✓ column | Set rows with strokes; Action bar logs the current set |
| Green Finish button, top right | "Finish workout" in the Action bar after the last set; ⋯ → Finish early |
| "Update template?" dialog after finishing | Routine section on the summary with a switch |
| History tab + calendar | Progress → Workouts |
| Exercises tab, exercise pages with About / History / Charts / Records tabs | Progress → Lifts and Search; one scrolling exercise page |
| Measure tab | Progress → Body |
| Profile tab + settings gear | Today avatar → Account sheet; the dashboard's charts move to Progress |
