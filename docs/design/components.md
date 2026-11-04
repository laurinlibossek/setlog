# Components

Every Tally component: what it is for, what you provide and its rules. Props are in TypeScript at the end. The look of each is in `screens.html`, whose CSS is the reference for the web; build them in React Native from `app/src/design/tally.ts`.

## ActionBar

The bottom of the session: one primary action in thumb reach that changes with the moment, logging, resting or finishing.

**You provide** the state and its data: the set to log ("Log 82.5 × 8"), or the rest's end time and length, or that every set is logged ("Finish workout").

**Rules**
- Logging: one block `primary` button. Resting: the countdown (`t-number-l`), −15, +15, Skip, the drain bar and the EffortPicker for the set just logged. Done: "Finish workout".
- The drain bar empties from right to left in one linear animation; the countdown text updates once a second.
- Sits on `paper` with a `line` hairline on top, above the home indicator.
- Finishing never lives in the top corner.

## BlockWeeks

The weeks of the current block (mesocycle) as Roman numerals with a bar each: done weeks filled, the current week filled as far as its sessions are done, the deload week dashed.

**You provide** the block's length, its deload week, the current week and the share of this week's sessions done.

**Rules**
- Roman numerals here and in "Week III of VI" only. They echo the app icon; don't use them anywhere else.
- One line of text under it: where the person is and when the deload starts.

## Button

Capsule buttons in ink: `primary` (ink fill, paper label) for the one action the screen is for, `secondary` (`paper-3`) for supporting actions, `plain` for toolbar-style text, `danger` for destructive text.

**You provide** a verb-first label in sentence case ("Start", "Log 82.5 × 8", "Finish workout"), the variant and optionally `block` (full width) or `small` (36 high, for rest controls).

**Rules**
- One `primary` per screen, in the bottom third. Never coloured, never blue, never `signal`.
- `button-h` tall, `radius-capsule`. Small buttons still get a `hit-min` touch area.
- Destructive actions are `danger` text and always ask first, with Undo afterwards where possible.

**Native**: on iOS 26 prefer the system glass button style for toolbar buttons and `.borderedProminent` tinted `ink` for the primary.

## CoachNote

One finding from the coach (TrueTrain), with its evidence grade and a Why link to the source. See the Coaching notes section for where notes may appear.

**You provide** the tip from the engine: text and variables (translated like any string), the rule ID, the grade A–D and the placement.

**Rules**
- Grade mark first: A filled `ink`, B outlined `ink`, C outlined `ink-2`. Findings graded D stay in the knowledge base and never become notes.
- Text `t-subhead` in `ink`; "Why" in `ink-2` opens the source sheet (finding, grade, rule ID, reference).
- Block variant in lists, inline variant under an exercise name.
- No cards, colours, icons or "AI" labels. Never modal.

## EffortPicker

Three options to rate the set just done by reps left in reserve: 0 · 1 · 2+. 1 sits in the middle: it's the target. 0 is a set to failure, 2+ a lighter set. Nothing above 2 on purpose: no one should have more than 2 left in the tank (Laurin, 4 Nov 2026).

**Use it** in the resting Action bar, for the set just logged. It is optional: skipping it logs nothing.

**You provide** the current value (or none) and a change handler. It stores reps in reserve on the set (0, 1, or 2 for "2 or more"); RPE from older logs and Strong imports maps to it (RPE 10 = 0 left, 9 and 9.5 = 1, 8.5 and below = 2+), and older sets rated 3 read as 2+.

**Rules**
- One tap, no confirmation, changeable until the next set is logged.
- 0 is failure: rating a working set 0 makes it a failure set, and choosing Failure as the set type sets 0 left, so the two never disagree. Rating a failure set 1 or 2+ makes it a working set again. The set menu offers the same three.
- The chosen option is `ink` with a `paper` label; the others `paper-3`.
- The coach uses it (effort rules E1–E4); without it the coach falls back to weight and reps.

## Highlight

The `signal` fill behind a number that went up, like a marker in a training diary.

**Use it** for a new record, a beaten target and an upward change ("+13.3 kg"), and for the Record chip in a set row. Never for anything that didn't go up.

**You provide** the text. It wraps the value only, never a whole sentence or a label.

**Rules**
- `signal` fill, `on-signal` text, `radius-s`. In dark themes a change may instead be `signal` text without the fill ("+6%" in a list).
- At most a handful per screen. If everything is highlighted, nothing is.
- Pair it with words for people who can't see the colour: "Record", "+13.3 kg", "estimated 1RM".

## Keypad

The number pad for weights, reps and times, drawn by the app in a sheet at `paper-2`.

**You provide** the field being edited (weight, reps, time, distance), its value, the smallest step for this exercise (2.5 kg, 5 lb, the dumbbell rack's step) and, for barbells, the plates per side.

**Rules**
- Keys are `radius-m` on `paper`; function keys `paper-3`; Next is `ink`. 52 high.
- −/+ step by the exercise's real increment and tick a selection haptic per step.
- Next moves weight → reps → logs the set. The decimal key shows the person's separator ("," in German).
- Plates per side update live for barbell exercises.

## LineChart

One series over time, drawn in `ink`, with each new record marked by a `signal` dot.

**You provide** the points (date, value), the metric's unit, the range and which points were records. Axis maths comes from `core/chart.js` (`niceTicks`).

**Rules**
- One line, 2 px, no fill, no smoothing. Dotted grid lines at the ticks, values on the trailing side, a hairline baseline, three or four date labels.
- Record points: `signal` with a `signal-edge` outline. Other points aren't drawn.
- Touch and drag to read a value: a hairline cursor, the value above it, a selection haptic per point.
- Drawn once per data change; no entry animation.

## ListRow

A full-width row: optional leading symbol, a title with an optional second line, and a trailing value, tally, sparkline or chevron.

**You provide** title, optional subtitle, optional leading SF Symbol / Material Symbol name, trailing content, and the action.

**Rules**
- `row-h` minimum, text on the `space-5` margin (or after the leading symbol), hairline separators inset to the text.
- Subtitles in `t-footnote` `ink-2`: facts separated by " · ".
- A chevron only when the row opens a page.
- No cards around lists.

## MuscleVolume

Working sets per muscle over the last 7 days, as tallies, with hairlines up to the weekly floor when the coach is on.

**You provide** sets per muscle (counted from the log; an exercise's secondary muscles count half) and, with Pro, the person's floor and ceiling for each muscle.

**Rules**
- Stems are sets done; hairlines are the sets still missing to reach the floor. Without Pro there are no hairlines and no targets.
- The count on the right in `t-headline`. Above the ceiling, the count turns `ink-2` and the coach explains in a note; it never turns red.
- Muscles in a fixed order (chest, back, shoulders, arms, legs, then the finer split once the exercise library has it).

## NowLifting

The minimized session, shown above the tab bar on every tab while a workout runs: its tally, the current exercise and set, the rest countdown, and Skip.

**You provide** the running workout (tally, current exercise and set) and the rest state.

**Rules**
- Regular layout: tally, two lines of text, one trailing button (Skip during rest, otherwise none). Inline layout (tab bar minimized): tally and the countdown or elapsed time.
- Tapping anywhere but the button opens the session.
- Lives in the navigation layer: system glass natively, `glass` on the web, `radius-capsule`, `accessory-h` high.

**Native**: `NativeTabs.BottomAccessory`; switch layouts with `usePlacement()` (`regular` / `inline`).

## NumberDisplay

A number with its unit and label, sized by importance: `t-number-xl` for the one hero number on a screen, `t-number-l` for the set or timer in focus, `t-number-m` in rows and stats.

**You provide** the value (already rounded and formatted for the person's units and language), the unit, a label and optionally a change to highlight.

**Rules**
- Tabular figures (`ic-tnum`) always. The unit is `ic-unit`, half the size, `ink-2`, after the number.
- One `t-number-xl` per screen.
- Labels sit above for stats and timers ("Rest"), below for hero numbers ("Estimated 1RM…").
- Weight × reps uses `×` in `ink-3` between the two numbers.

## RoutineCard

A routine as something to start: where it sits in the block, its name, its exercises, a tally of its sets, and Start.

**You provide** the routine, its place in the block if there is one, and the estimated time (from the sets and rest times).

**Rules**
- `paper-2`, `radius-l`, `space-5` padding. The only card style in the app; the current block on Plan uses it too.
- At most one Start button per screen: on Today the Up next card has it; on Plan rows open the routine and Start is inside.
- Never nest a card in a card.

## SectionHeader

A section's title in `t-title-2`, with one optional trailing item: a scope ("Last 7 days") in `t-footnote` `ink-2`, or one plain action ("Edit", "See all").

**Rules**
- Sentence case. Never uppercase grey labels.
- `space-8` above it on tab roots, `space-2` between it and its content.

## SegmentedControl

Two to five mutually exclusive options, such as a chart's range.

**Rules**
- Labels of one word or a short number ("3M", "6M", "1Y", "All").
- Don't use it to switch between whole pages; a detail screen is one scrolling page.

**Native**: the system segmented control.

## SetRow

One set: its stroke, weight × reps (or the exercise's own fields: reps only, time, distance and time), and small chips for the set type and effort.

**You provide** the set (stored kg, reps, seconds, km; type; reps left), the exercise's category, last time's or the coach's target values for the ghost text, and whether it is the set being logged.

**Rules**
- The leading stroke logs and un-logs the set. There is no checkmark column and no "Previous" column.
- Pending sets show the target as ghost text (`ink-3`). The set being logged shows `paper-3` fields filled with those values; tapping a field opens the Keypad; logging with untouched fields logs the ghost values.
- Every field box says what it holds in a small caption (`t-caption`, `ink-2`) inside the box, above the number: "Weight", "Reps", or the exercise's own fields ("Time", "Distance"). The ghost value stays the placeholder under it. Boxes are on the set being logged, the Keypad's field and every set in the editors; a row is as tall with boxes as without, so nothing moves.
- Chips: "Warm-up", "Drop", "Failure" for set types; "1 left" or "2+ left" for reps in reserve (a failure set's chip already says 0); the `signal` "Record" chip when the set beat a record.
- A small ⋯ in `ink-3` at the trailing end of every row opens the set's menu (type, reps left, delete), so a plain working set has something to tap. The chips open it too, and so does pressing and holding the row.
- Swipe left to delete, with Undo.
- `row-h` tall, hairline between rows, values aligned on the screen margin.

## StatStrip

Three or four facts in a row, label above value, separated by hairlines, like the facts line of an app's store page.

**You provide** label and value pairs, formatted.

**Rules**
- Three is the default; four only when every value is short.
- Labels `t-footnote` `ink-2`, values `t-number-m` with units in `ic-unit`.
- No icons, no boxes, no colour; highlight a value only if it went up.

## TabBar

Three tabs and a separate Search button, floating over the content.

**Rules**
- Exactly Today, Plan, Progress, then Search at the trailing end. Today opens first.
- Selected: `ink` label and fill symbol; others `ink-2`. No badges.
- Content scrolls under it; it minimizes on scroll down and the Now Lifting accessory moves inline.
- This preview is a web stand-in. In the app it is the system bar.

**Native**: `NativeTabs` (`expo-router/native-tabs`) with `sf` / `md` icons, `role="search"` on the Search trigger and `minimizeBehavior="onScrollDown"`.

## Tally

A row of strokes, one per set: hairline while pending, a solid stem once logged.

**Use it** wherever sets are counted: the session header, each set row's leading mark, exercise rows in Up next, routine cards, the summary, the week strip (one stroke per session) and Sets per muscle.

**You provide** the list of sets, each with a state (`pending`, `done`, `warmup`, `warmupPending`, `live`, `record`, `skipped`), how to group them (by exercise, or in fives) and a size (`small` 14, `regular` `stroke-h`, `hero` `stroke-h-hero`).

**Rules**
- Strokes keep their slot (`stroke-slot`) whatever their state, so nothing shifts when a set is logged.
- Groups are separated by `stroke-group`: per exercise in a session, per five when counting.
- `record` is the only coloured state. `live` marks the one set being logged; there is never more than one.
- Never use strokes for weight, time or other continuous numbers.
- In a set row the stroke is the button that logs the set: give it a `hit-min` touch area and the label "Set 3, 82.5 kg × 8, not logged".

**Native**: a row of `View`s with fixed widths; animate the logged stem's width with Reanimated (160 ms). Describe the whole tally to screen readers as one element ("4 of 22 sets logged, 1 record").

## WeekStrip

The days of the current week with one stroke per session: a stem for a session done, a hairline for one planned, nothing for a rest day. Today's letter is reversed out of `ink`.

**You provide** the week start (the person's setting), sessions done per day and planned days (from the block or the weekly goal).

**Rules**
- The count goes on the section header's trailing side: "1 of 4 sessions".
- No flames, no streak badges. A streak, if shown, is a number in Progress.

## Props

```ts
// Increment (Tally) components — props as documentation for the React Native and web implementations.
// Values are stored units (kg, km, seconds); format for display with the person's units and language.

export type StrokeState = 'pending' | 'done' | 'warmup' | 'warmupPending' | 'live' | 'record' | 'skipped';

/** A row of strokes, one per set. */
export interface TallyProps {
  /** Strokes in order; inner arrays are groups (one per exercise, or fives when counting). */
  groups: StrokeState[][];
  size?: 'small' | 'regular' | 'hero';
  /** Read out as one element, e.g. "4 of 22 sets logged, 1 record". */
  accessibilityLabel: string;
}

/** The signal fill behind a value that went up. */
export interface HighlightProps { children: string }

export interface NumberDisplayProps {
  value: string;
  unit?: string;
  label?: string;
  size: 'xl' | 'l' | 'm';
  /** Shown highlighted, e.g. "+13.3 kg". Only for increases. */
  change?: string;
}

export interface ButtonProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'plain' | 'danger';
  block?: boolean;
  small?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export interface SetRowProps {
  /** The stored set: w (kg), r, d (km), t (s), type, rir (reps left). */
  set: { id: string; type?: 'normal' | 'warmup' | 'drop' | 'failure'; w?: number; r?: number; d?: number; t?: number; rir?: number; done?: boolean };
  category: 'barbell' | 'dumbbell' | 'machine' | 'weighted_bw' | 'assisted_bw' | 'reps' | 'cardio' | 'duration';
  /** Last time's numbers or the coach's target, shown as ghost values. */
  target?: { w?: number; r?: number; d?: number; t?: number };
  /** The set being logged: fields instead of text. */
  live?: boolean;
  record?: boolean;
  onToggle: () => void;
  onEditField: (field: 'w' | 'r' | 'd' | 't') => void;
  onDelete: () => void;
}

export type ActionBarState =
  | { kind: 'log'; label: string; onLog: () => void }
  | { kind: 'rest'; endsAt: number; total: number; rir?: number; onAdjust: (seconds: number) => void; onSkip: () => void; onRate: (rir: number) => void }
  | { kind: 'finish'; onFinish: () => void };
export interface ActionBarProps { state: ActionBarState }

/** Reps left in reserve: 0 (failure), 1 (the target) or 2 (shown "2+"). */
export interface EffortPickerProps { value?: 0 | 1 | 2; onChange: (rir: 0 | 1 | 2) => void }

export interface KeypadProps {
  field: 'w' | 'r' | 'd' | 't';
  value: string;
  /** The exercise's real increment, in the person's unit (2.5, 5, the rack's step). */
  step?: number;
  /** Barbell exercises: plates per side for the current weight. */
  plates?: number[];
  decimalSeparator: '.' | ',';
  onChange: (value: string) => void;
  onNext: () => void;
}

export interface NowLiftingProps {
  placement: 'regular' | 'inline';
  tally: StrokeState[][];
  exercise: string;
  setLabel: string;
  rest?: { endsAt: number };
  onOpen: () => void;
  onSkipRest?: () => void;
}

export interface TabBarProps { selected: 'today' | 'plan' | 'progress' | 'search' }

export interface SectionHeaderProps { title: string; scope?: string; action?: { title: string; onPress: () => void } }

export interface SegmentedControlProps<T extends string> { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** SF Symbol name on iOS; the Material Symbol is mapped from it. */
  symbol?: string;
  trailing?: string | { tally: StrokeState[][] } | { spark: number[]; change?: string };
  chevron?: boolean;
  onPress?: () => void;
}

export interface StatStripProps { stats: { label: string; value: string; unit?: string; highlight?: boolean }[] }

export interface RoutineCardProps {
  name: string;
  context?: string;
  exercises: string[];
  sets: number;
  minutes: number;
  onStart?: () => void;
}

/** A tip from TrueTrain: { text, vars, rule, grade, shown }. */
export interface CoachNoteProps {
  text: string;
  grade: 'A' | 'B' | 'C';
  rule: string;
  variant?: 'block' | 'inline';
  onWhy: () => void;
}

export interface WeekStripProps { weekStart: 0 | 1; days: { done: number; planned: boolean }[]; today: number; goal: number }

export interface MuscleVolumeProps { rows: { muscle: string; sets: number; floor?: number; ceiling?: number }[]; scope: string }

export interface LineChartProps {
  points: { at: number; value: number; record?: boolean }[];
  unit: string;
  range: '3M' | '6M' | '1Y' | 'All';
}

export interface BlockWeeksProps { weeks: number; deloadWeek: number; current: number; currentDone: number }
```
