# Tally, the Increment design language

Increment is a workout log for people who lift. It records sets, shows what you did last time and says plainly when a number went up. Its design language is called **Tally**: every set is a stroke, the screen is ink on paper, and the one colour is earned.

Build every screen of the iPhone and Android app (Expo, `app/`) from this system, and later the web app (`setlog/`). Where it disagrees with the existing screens, this system wins; the old look was a copy of Strong and is being replaced phase by phase (`phases.md`).

Files here: `tokens.json` (the source of every value; `npm run tally` turns it into `app/src/design/tally.ts`), `components.md` (every component, its props and rules), `navigation.md`, `coaching.md`, `motion.md`, `platforms.md`, `phases.md` (the build plan) and `screens.html` (eight screens drawn with the system; open it in a browser). The same system is browsable as a Claude design system for Laurin: https://claude.ai/artifact/RYFLoWSo8sDSVFmgGRxP2W

## Principles

1. **One job per screen, one action in reach.** Every screen has one primary action: a `primary` Button, placed in the Action bar or at the bottom of a card, inside the bottom third where the thumb is. Everything else goes in the ⋯ menu or a sheet.
2. **Numbers are the interface.** Weights, reps and times are the largest text wherever they appear (`t-number-xl`, `t-number-l`, `t-number-m`, always with `ic-tnum`). Labels shrink to `t-footnote` to make room. A number you can change is a field you tap, in place.
3. **Colour is earned.** Draw everything in `ink` on `paper`. `signal` appears only when something went up: a record, a beaten target, an upward change. A screen where nothing went up has no colour at all.
4. **Structure from type and space, not boxes.** Hierarchy comes from the type scale and the `space-*` steps. Lists run full width with `line` hairlines. A `paper-2` card marks an object you can pick up and start (a routine, the current block); never put a card inside a card.
5. **Native and frugal.** Use the platform's own tab bar, sheets, menus, symbols, glass and haptics. Nothing moves unless the person moved it or a value changed. Dark themes are true black. Timers run in the system (notifications, Live Activities) instead of being redrawn by the app.

## The tally

The tally is the one shape only Increment has. It replaces Strong's checkmark column and green rows.

- One stroke per set. A pending set is a hairline (`stroke-hair` wide, `ink-3`). A logged set is a stem (`stroke-slot` wide, `stroke-done`). Every stroke sits in a slot of `stroke-slot` with `stroke-gap` between slots, so logging a set never moves anything.
- Logging a set means tapping its stroke, or the primary button that logs the current set. There is no separate checkmark.
- Warm-up sets are short strokes (55 % of the height). The set being logged is an outlined stem. A skipped set is dashed. A set that set a record is a `signal` stem outlined with `signal-edge`.
- Group strokes in fives with `stroke-group` between groups, and put `stroke-group` between exercises. Read a tally like a tally sheet: count the fives.
- Heights: `stroke-h` in rows, cards and lists; `stroke-h-hero` in the session header, the summary and the Live Activity.
- A tally only ever counts sets (or sessions, on the week strip). Weight, time and other continuous values are numbers or a line chart, never strokes.

## Content

Voice: plain, short, numbers first. The person is mid-set with sweaty hands; every word must earn its place.

- Sentence case everywhere: "Save changes to Push A", "Reps left?", "Build a split". No title case, no small-caps grey section labels.
- Lead with the number: "Up 2.5 kg from last time.", not "Great job, you lifted more!" No exclamation marks, no emoji, no motivational lines.
- Second person. German uses "du", like the rest of the app. Every visible string goes through `tr()` with a German translation.
- Weight × reps with a real multiplication sign and the unit once: "82.5 kg × 8", in rows just "82.5 × 8" under a unit the screen already states. Decimal comma in German: "82,5".
- Rests and timers as m:ss ("1:42"). Workout length as h:mm ("1:04") with the label "Time".
- Exercise names are display names ("Bench Press"); equipment and muscle go on the line below ("Barbell · Chest").
- Dates: "Tuesday, 3 November" on Today; within a week say "today", "yesterday", "Saturday".
- Coach notes are one sentence of finding and at most one of action: "Legs are at 5 of 10 sets for the week. Thursday's Legs A brings them to 15."

## Colour

- `paper` is the screen. `paper-2` raises a card, a sheet or the keypad. `paper-3` fills anything you type into or press (fields, secondary buttons, chips, keys).
- `ink` for text, icons, logged strokes and the primary button (with `paper` as its label). `ink-2` for everything secondary. `ink-3` only for pending strokes, ghost values and disabled text, never for text someone has to read.
- `signal` is never a button, link, tab, icon or chrome colour. In light themes use it as a fill behind `on-signal` text (the `ic-hl` highlight, the Record chip) or as a mark outlined in `signal-edge`. In dark themes it may also colour text and strokes directly ("+6%").
- `danger` only for destructive actions, as text ("Discard workout", "Delete").
- `line` is a hairline between rows and stat cells. Never draw a border around a card.
- Dark themes are true black (`paper` #000), so OLED pixels switch off. Raise with `paper-2` only where a surface has to read as separate.
- Named themes swap `paper`, `ink`, `signal` and `stroke-done` and nothing else: Strawberry Matcha has matcha strokes and strawberry records, Intense Red has red strokes and gold records. A theme never adds a second accent.
- Keyboard focus is the `focus` ring: 2 px solid, 2 px offset, on every surface.

## Type

- System faces only: SF Pro on iPhone, Roboto on Android, the system stack on the web (`--font-sans`, `--font-display`, `--font-mono`). Nothing to download, and Dynamic Type keeps working.
- Map each style to the platform text style it is sized from, so it scales with the person's text size: `t-large-title` Large Title, `t-title-1` Title 1, `t-title-2` Title 2, `t-title-3` Title 3, `t-headline` Headline, `t-body` Body, `t-subhead` Subheadline, `t-footnote` Footnote, `t-caption` Caption 1. The number styles scale with Large Title.
- Every number that changes or is compared uses tabular figures (`ic-tnum`). Units follow in `ic-unit`.
- At most one `t-number-xl` and one `t-eyebrow` per screen.
- Section headers are `t-title-2`. Tab roots open with `t-large-title`; detail screens with `t-title-1`.

## Space and layout

- Four-point grid, steps `space-1` to `space-12`. The screen margin is `space-5` (20 px) and every left edge lines up on it: titles, list text, set values, the action bar.
- Rows are `row-h` tall. Nothing tappable is smaller than `hit-min` in either direction.
- On tab roots, sections are `space-8` apart and the first content starts `space-4` under the large title.
- The tab bar floats over content; content scrolls under it and fades out at the bottom. In the session the Action bar sits on the content's bottom edge.

## Shape and depth

- Radii are concentric and there are four: `radius-l` for cards and sheets the app draws, `radius-m` for fields and keys inside them, `radius-capsule` for buttons, chips, the accessory and the tab bar, `radius-s` for grade marks and highlights.
- No shadows on content. Depth is `paper-2` on `paper`. Only the floating navigation layer (tab bar, Now Lifting accessory) has a shadow, and in the native app the system glass draws it.
- Liquid Glass (iOS 26 and later) is for the navigation layer only: tab bar, accessory, toolbars, menus. Never on cards or rows. With Reduce Transparency on, use solid `paper-2`. On the web, `glass` with a backdrop blur stands in.

## Iconography

- SF Symbols on iOS and Material Symbols on Android, through `expo-symbols`, in the regular weight at the size of the text beside them. The previews here use SVG stand-ins drawn to match; they are not the shipped icons.
- Outline symbols by default; the selected tab may use the fill variant.
- Names: Today `sun.max`, Plan `list.bullet.rectangle.portrait`, Progress `chart.line.uptrend.xyaxis`, Search `magnifyingglass`, Workouts `calendar`, Lifts `dumbbell`, Records `rosette`, Body `figure.stand`, More `ellipsis`, Minimize `chevron.down`, Skip rest `forward.end`, Add `plus`, Build a split `square.grid.2x2`.
- No emoji, illustrations, mascots or body maps. The only custom glyphs are the tally stroke and the block's Roman numerals.
- The logo is the app icon, a white Roman-numeral I on black (`assets/Logos`). Use it as it is on the splash screen and in About, nowhere else in the app.

## Don't

- No spreadsheet set table with SET · PREVIOUS · KG · REPS · ✓ columns, no green completed rows, no checkmark column. Last time's numbers are ghost values in the fields and one line under the exercise name.
- No blue links. Tappable text is `ink` with weight, or carries a chevron.
- No five-tab bar with Workout in the middle and no Profile tab. The account is the avatar on Today.
- No muscle heat maps, radar charts, streak flames, confetti or badges.
- No gradients, glows, glass on content, card shadows, cards in cards, emoji, or sparkles to mark coaching.
- No paywall over charts, history or records. Pro adds coaching; it never hides the person's own numbers.

