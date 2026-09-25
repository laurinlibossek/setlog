<p align="center">
  <img src="setlog/icons/icon-192.png" width="88" height="88" alt="">
</p>

<h1 align="center">Setlog</h1>

<p align="center">
  A free, open-source workout tracker for the gym.<br>
  Log your sets, see what you lifted last time, and watch your numbers go up.
</p>

<p align="center">
  <a href="https://laurinlibossek.github.io/setlog/"><strong>Open the app</strong></a> ·
  <a href="#install-it-on-your-phone">Install</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#how-its-built">How it's built</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots-dark.png">
    <img src="docs/screenshots-light.png" alt="Setlog on a phone: logging a workout, the workout history, an estimated 1RM chart and the profile dashboard" width="100%">
  </picture>
</p>

## Why Setlog

Most workout trackers put their best features behind a subscription or want an account before you log a single set. Setlog doesn't:

- **Free.** No subscription, no ads, no premium tier.
- **Private.** No account and no server. Your training log stays on your phone.
- **Offline.** It keeps working in a basement gym with no signal.
- **Open source.** MIT-licensed and compact.
- **English and German.** It follows your phone's language.

## How it works

Start a workout from a template or from scratch; once you have a routine, the start screen suggests the template that's probably next. Every set shows what you did last time, and the rest timer starts when you check a set off. New personal records are flagged as you set them. When you finish a workout that differs from its template, Setlog asks whether to save the changes to the template.

Over time, every exercise gets its own charts, records and history.

**Good to know**
- Tap ✓ on an empty set to log last time's numbers.
- Tap a set's number to make it a warm-up, drop or failure set. Swipe a set left to delete it.
- Tap an exercise's name for notes, supersets, warm-up sets, its rest timer and the plate calculator. A pinned note shows up every time you do that exercise.
- The chart button next to an exercise sets a focus metric (volume, volume increase, reps or weight per rep) that updates as you log.
- To share a template, use its ⋯ → **Share**. On iPhone the other person pastes the link under Templates ⋯ → **Add shared template**, because the home screen app keeps its data separate from Safari.

## Install it on your phone

Open **[laurinlibossek.github.io/setlog](https://laurinlibossek.github.io/setlog/)** on your phone, then:

| Phone | Browser | Steps |
|---|---|---|
| iPhone | Safari | Share → **Add to Home Screen** |
| Android | Chrome | ⋮ menu → **Install app** (or *Add to Home screen*) |
| Samsung | Samsung Internet | ≡ menu → **Add page to** → **Home screen** |

From then on, open Setlog from the new icon. The installed app keeps its own storage, separate from the browser tab, so log your workouts there.

## Coming from Strong?

1. In Strong, go to **Settings → Export Workouts** and save the CSV file.
2. In Setlog, go to **Profile → ⚙︎ → Import from Strong**, pick the file and confirm.

Notes, set types and your custom exercises come along. Importing the same file again only adds what's missing.

## Back up your data

Your workouts exist only on your phone. Nothing is uploaded, so nobody else has a copy either. Use **Settings → Back up now** every so often (the app reminds you every two weeks), and always before deleting the app or switching phones. **Restore from backup** brings everything back.

## Known limits

- A locked phone pauses web apps, so the rest timer can't alert you with the phone in your pocket. With the screen on (the default during a workout) it beeps when your rest is over. On iPhone, the ring/silent switch has to be set to ring.
- There's no sync between devices. Use backup and restore to move your data.
- There's no Apple Health, Google Fit or smartwatch integration yet.

## Host your own copy

Setlog is a folder of static files, so any static host can serve it. With GitHub Pages:

1. Fork this repository.
2. In your fork, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The included workflow publishes the `setlog/` folder to `https://<your-username>.github.io/setlog/` on every push to `main`.

When you change the app, bump `VERSION` in `setlog/sw.js`. Installed copies then show "A new version of Setlog is ready" and update with one tap.

## How it's built

Setlog is a Progressive Web App written as plain JavaScript modules. There's no build step and nothing to install.

- **UI:** Preact and htm, vendored in `setlog/js/vendor/` (about 17 KB).
- **Storage:** IndexedDB with automatic reconnect, because iOS Safari drops idle database connections. The workout in progress is also mirrored to localStorage, so it survives the app being closed mid-set.
- **Offline:** a service worker caches the whole app on install and offers new versions through an in-app prompt.
- **Units and input:** data is stored in kg, km and seconds and converted for display. Number inputs accept decimal commas ("62,5").
- **Records:** a single chronological pass over the history works out the personal records for every set (estimated 1RM, weight, set volume, reps, distance and time).
- **Import:** a CSV parser for both of Strong's export layouts that skips workouts it already has.
- **Testing:** end-to-end tests in an emulated iPhone browser (Playwright). They cover a real 86-workout import, backup round-trips and starting offline.
- Developed with the assistance of Claude (Anthropic).

```
setlog/                        the app (this folder is what gets deployed)
├── index.html                 app shell
├── manifest.webmanifest       home screen install (with icons/)
├── sw.js                      offline cache and updates
├── css/app.css                styles, light and dark
└── js/
    ├── app.js                 entry: tabs, wake lock, theme, updates
    ├── store.js, db.js        state, persistence and all data actions
    ├── calc.js                1RM, volume, records, plates, warm-ups
    ├── editor.js, sheet.js    workout logging and rest timer
    ├── io.js                  import, export, backup
    ├── seed.js                built-in exercises and example templates
    └── screens/               Workout, History, Exercises, Measure, Profile
.github/workflows/pages.yml    deploys setlog/ to GitHub Pages
docs/                          screenshots for this README
```

### Run it locally

```sh
git clone https://github.com/laurinlibossek/setlog.git
cd setlog/setlog
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Background

Setlog started as a personal replacement for a paid tracker. I wanted every feature I actually used, my full history in open formats and no monthly fee. It turned out useful enough to share, so now it's free and open source for anyone who wants. 

## Contributing

Found a bug or missing a feature? Open an issue. Pull requests are welcome too. Please keep the app dependency-free with no build step, and try your change on a real phone.

## License

[MIT](LICENSE) © 2026 Laurin Libossek. The bundled libraries are Preact (MIT) and htm (Apache 2.0), and their licenses are in `setlog/js/vendor/`.

Setlog is an independent project and isn't affiliated with Strong or any other workout app.
