# Building it

## Where the tokens live

`docs/design/tokens.json` is the source. `npm run tally` writes `app/src/design/tally.ts` from it (colours per theme, spacing, radii, stroke and control sizes, type styles), and `npm test` fails when the two differ. The app reads colours through `src/lib/theme.ts`: `useTally()` gives the Tally names, `useColors()` still gives the old names (mapped onto Tally) until every screen is rebuilt. The web app keeps `setlog/css/app.css` and `core/themes.js` until it adopts Tally; then its CSS gets the same tokens.

## iPhone (Expo, `app/`)

- Tabs: `NativeTabs` from `expo-router/unstable-native-tabs` (it works in Expo Go in SDK 57). `NativeTabs.BottomAccessory` holds Now Lifting; `usePlacement()` switches it between the regular and inline layouts. `role="search"` gives the system Search tab. `minimizeBehavior="onScrollDown"`.
- Symbols: the app already draws SF Symbols and Material Symbols through `expo-symbols` (`Icon` in `src/ui/kit.tsx`); add the names Tally uses there.
- Sheets and menus: native where they exist (form sheets with detents, context menus). The keypad, the effort picker and the coach's Why sheet are drawn by the app.
- Live Activity and Dynamic Island for the session and rest: `expo-widgets` (needs a development build, not Expo Go). The countdown is drawn by the system.
- Haptics: `expo-haptics`, mapped as in Motion.

## Android

- The same `NativeTabs` give the Material bottom bar; keep three tabs plus Search.
- Material Symbols through `expo-symbols`. Roboto through the system.
- Rest: the scheduled notification with a countdown chronometer (no Live Activity).
- Predictive back and edge-to-edge are on; the Action bar respects the gesture inset.

## Web app (`setlog/`)

- The same tokens in `css/app.css`; `bundle.css` here shows the component styles in plain CSS.
- `glass` with `backdrop-filter` stands in for Liquid Glass; fall back to `paper-2` where it isn't supported.
- The web app can't run timers with the phone locked, so it keeps the screen on during a workout and switches to a mostly black rest screen in dark themes to save power.
