# Launch prep for Increment

Drafts for putting the app in `app/` into the App Store and on Google Play. Nothing here is submitted or published yet.

| File | What's in it |
|---|---|
| [name-check.md](name-check.md) | Whether the name "Increment" is available in both stores and in the trademark registers, and the three checks still to do by hand |
| [store-listing.md](store-listing.md) | Name, subtitle, descriptions and keywords for both stores, in English and German, and answers to the stores' privacy, health, age and export questions |
| [privacy-policy.md](privacy-policy.md), [datenschutz.md](datenschutz.md) | The privacy policy in English and German, for the app and the web app |

## For Laurin to decide

1. **Store name.** The drafts use "Increment: Workout Log" (German store: "Increment: Trainingstagebuch"); the name under the icon stays "Increment". Searching "increment" mostly finds counter apps, so the name alone wouldn't be found. See name-check.md.
2. **Where the privacy policy lives.** Both stores need a public URL that opens without a login. Options:
   - `laurinlibossek.github.io/setlog/privacy.html` (and `datenschutz.html`): an HTML page in `setlog/`, live once `expo-app` is merged into `main`. The cleanest URL, and the web app can link to it too.
   - The Markdown on GitHub (`github.com/laurinlibossek/setlog/blob/main/docs/launch/privacy-policy.md`): no extra page, but it looks like a code repository, and the path moves if the docs do.
   - A custom domain, if you get one for the universal links anyway (backlog step 3).
3. **Contact details.** The policy needs a contact, and Google Play shows a contact email publicly on the store page. The drafts have the placeholders `[EMAIL]` and `[ADDRESS]`. Your personal email isn't in this public repo on purpose; a separate address for the app works too. Whether a postal address is needed depends on decisions 4 and 5.
4. **Trader status (EU Digital Services Act).** Both stores ask every developer whether they distribute apps as a trader. A trader's address, phone and email are shown on the EU store pages; for a non-trader they aren't. Which one applies depends on whether the app will ever be monetized; Apple says to ask a legal advisor if unsure.
5. **Impressum.** German law (§ 5 DDG) asks for an Impressum on digital services offered "geschäftsmäßig", which can include apps. Whether that applies depends on whether the app will ever be monetized, and it's a legal question; if it does, it can go on the same page as the privacy policy.
6. **Bundle ID and Android package name.** Not in `app.json` yet, and they can't be changed after the first upload. A reverse domain you control fits, for example `io.github.laurinlibossek.increment`. A custom domain (decision 2) would give a different one.
7. **"Strong" in the description.** The drafts mention it once ("Coming from Strong? Import your history from its CSV export"), which is accurate and what people coming from Strong look for. Apple sometimes objects to other apps' names in metadata; if review complains, drop the name and say "CSV export from other workout apps".
8. **Age rating, "Health or Wellness Topics".** I'd answer Yes (the example templates are exercise suggestions), which gives 9+ instead of 4+. See store-listing.md.
9. **English exercise names in the German store.** The German description says the exercise names are in English, so nobody is surprised. Drop that sentence if German names come first (backlog: "German exercise names").

## Still to do before submitting

- **A "Privacy policy" link in the app:** Apple requires one in the app as well as in App Store Connect (App Review Guideline 5.1.1). A row at the bottom of Settings that opens the page, with a German label. Needs the URL from decision 2.
- **Publish the policy** where decision 2 says, with the contact details filled in and the date set.
- **Icon and splash** (backlog step 3), then the **store screenshots:** iPhone 6.9″ (1320 × 2868) for the App Store; at least two phone screenshots and a 1024 × 500 feature graphic for Google Play. The browser test helpers could take them in both languages.
- **`app.json`:** the bundle ID and package name (decision 6), and `"config": { "usesNonExemptEncryption": false }` under `ios`, so App Store Connect stops asking about encryption on every upload.
- **Accounts:** the Apple Developer Program and a Google Play developer account (with an identity check). Then reserve the name by creating the app record in App Store Connect (name-check.md).
- **Google Play's closed test:** a new personal account needs at least 12 testers opted in for 14 days in a row before the first production release.
