# Launch prep for Increment

What's needed to put the app in `app/` into the App Store and on Google Play. Nothing is submitted yet.

| File | What's in it |
|---|---|
| [name-check.md](name-check.md) | Whether the name "Increment" is available in both stores and in the trademark registers, and the three checks still to do by hand |
| [store-listing.md](store-listing.md) | Name, subtitle, descriptions and keywords for both stores, in English and German, and answers to the stores' privacy, health, age and export questions |
| [`setlog/privacy.html`](../../setlog/privacy.html), [`setlog/datenschutz.html`](../../setlog/datenschutz.html) | The privacy policy in English and German, for the app and the web app. They go live with the merge into `main`, at `laurinlibossek.github.io/setlog/privacy.html` and `…/datenschutz.html` |

## Decisions (Laurin, 3 Nov 2026)

- **Store name:** "Increment: Lifting Tracker", in both stores and both languages. The name under the icon stays "Increment".
- **Strong:** not named anywhere in the listing. The descriptions say "Import your history from the CSV export of other workout apps".
- **Age rating:** "Health or Wellness Topics" = Yes (9+).
- **Privacy policy:** GitHub Pages, `setlog/privacy.html` and `setlog/datenschutz.html`, in the web app's style. Settings in both apps links to the page in the app's language.
- **Contact:** an email address of its own for the app, not created yet. It's written in one place, `CONTACT_EMAIL` in `setlog/js/core/links.js`, as the placeholder `[EMAIL]`. Until it's filled in, the privacy pages show the GitHub issues link instead, and the GitHub Pages deploy refuses to run, so the placeholder can't go live. Filling it in is a blocker before `expo-app` is merged into `main`. It's also the contact email in the Play Console.
- **Support URL:** the GitHub issues page, `https://github.com/laurinlibossek/setlog/issues`.
- **Trader status:** non-trader, so no Impressum and no postal address. Revisit if the app is ever monetized.
- **Bundle ID and Android package:** `io.github.laurinlibossek.increment` (in `app.json`).

## Still to do before submitting

- **Fill in the contact email** in `setlog/js/core/links.js`, before `expo-app` is merged into `main`.
- **Name checks:** TMview, creating the app record in App Store Connect (which also reserves the name), and a Play Store search (name-check.md).
- **The final App Store screenshots** from the iOS Simulator: restore the demo data (`node tests/browser/store-demo.mjs en > store-demo-en.json`), take the six screens and frame them with `node tests/browser/store-frame.mjs`. The Google Play set and the feature graphic come from `node tests/browser/run.mjs app-store-shots`. See "Store screenshots" in `tests/browser/README.md`.
- **Accounts:** the Apple Developer Program and a Google Play developer account (with an identity check).
- **Google Play's closed test:** a new personal account needs at least 12 testers opted in for 14 days in a row before the first production release.

Done in the app: the "Privacy policy" row at the bottom of Settings (Apple wants the link in the app as well as in App Store Connect, App Review Guideline 5.1.1), and `"config": { "usesNonExemptEncryption": false }` under `ios` in `app.json`, so App Store Connect doesn't ask about encryption on every upload.
