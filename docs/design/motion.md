# Motion, haptics and battery

The app runs for an hour at a time on a phone in a gym. It should feel instant and cost almost nothing while the screen is off.

## Motion

- Animate only a change of state, never an idle screen. No pulsing, looping, shimmering or counting-up numbers.
- Logging a set: the stroke grows from hairline to stem in 160 ms, ease-out. A record turns it `signal` at the same time.
- A number that went up gets its `ic-hl` highlight in 200 ms. That is the app's one moment; there is no confetti.
- Sheets, pushes, tabs and the accessory use the system transitions. The accessory expands into the session with the system zoom transition.
- The rest drain bar is one linear animation from start to end, run by the system (Reanimated on the UI thread), not a re-render per frame. The countdown text updates once a second, on the second.
- With Reduce Motion on, strokes and highlights change without animating.

## Haptics

| Moment | Haptic |
| --- | --- |
| Set logged | Light impact |
| Record | Success notification |
| Rest over | Two light impacts, 120 ms apart (plus the notification when the app is in the background) |
| Stepping a number (−2.5 / +2.5, scrubbing a chart) | Selection tick per step |
| Discard or delete | Warning notification |

## Battery

- Don't keep the screen on during a workout by default in the store app. The rest notification and the Live Activity tell the person when rest is over. "Keep screen on" stays as an option, and the web app keeps it on because iOS pauses web apps.
- Hand timers to the system: a scheduled notification for the end of rest, and on iOS a Live Activity whose countdown the system draws. The app does no work while the phone is locked.
- True black dark themes; keep large areas `paper`.
- Charts are drawn once per data change, not per frame. Lists are virtualised.
- No background fetch, no network, no analytics: Increment has nothing to sync.
