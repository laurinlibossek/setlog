# Setlog

A private, offline-first workout tracker for iPhone, built as a Progressive Web App. No account, no server and no subscription: your training log never leaves your phone.

**Live app:** https://laurinlibossek.github.io/setlog/

## Why I built it

I was paying about €6 a month for Strong, a popular workout tracker, and my whole training history lived inside someone else's app. Setlog covers everything I actually used in Strong, imports my complete Strong history and stores the data on my own device in open formats (CSV and JSON). It costs nothing to run and works without a signal in a basement gym.

## What it does

- **Logging** against last session's numbers, with warm-up, drop and failure sets, RPE, supersets and per-exercise notes
- **Rest timer** with sound and screen wake lock
- **Templates** with folders, plus prompts to update a template when a workout changes
- **History** as a list and a calendar, with editable past workouts
- **Records and charts** per exercise: estimated 1RM (Epley or Brzycki), volume, rep maxes and live PR detection
- **Body measurements** with charts
- **Tools:** plate calculator and 1RM calculator
- **Your data:** Strong CSV import, Strong-compatible CSV export (ready for Excel or R) and JSON backup and restore
- Fully offline, dark mode, kg/lb and km/mi

## Use it

### On your iPhone

1. Open the [live app](https://laurinlibossek.github.io/setlog/) in Safari.
2. Tap **Share → Add to Home Screen**.
3. Open Setlog from the new icon. The installed app keeps its own storage, separate from Safari tabs.

### Switching from Strong

1. In Strong: **Settings → Export Workouts** and save the CSV to Files.
2. In Setlog: **Profile → ⚙︎ → Import from Strong** and pick the file.
3. Check the preview and confirm. Importing the same file twice skips workouts you already have.

### Host your own copy

Fork this repository, then go to **Settings → Pages** and set the source to **GitHub Actions**. The included workflow publishes the app to `https://<your-username>.github.io/setlog/` on every push to `main`.

### Run it locally

```sh
cd setlog
python3 -m http.server 8000
# open http://localhost:8000
```

There is no build step.

## Your data

Everything is stored on your device in IndexedDB. Nothing is uploaded. Back up regularly via **Settings → Back up now → Save to Files**, especially before deleting the Home Screen icon or switching phones.

## How it's built

- Preact and htm, vendored in `setlog/js/vendor/`, so there is no build step and no external dependency at runtime
- IndexedDB persistence that reconnects automatically when Safari drops idle connections
- Service worker for offline use, with an in-app update prompt
- Built-in library of about 190 exercises
- Tested end to end in an emulated iPhone browser, including a real 86-workout Strong import
- Developed with the assistance of Claude (Anthropic)

## Known limits

- iOS pauses web apps while the phone is locked, so the rest timer only plays its sound with the screen on (the app keeps the screen awake during a workout by default).
- No Apple Health or Apple Watch integration and no sync between devices. Use backup and restore to move data.
