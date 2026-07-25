# Developing & self-hosting RPGify Habits

Everything a developer needs to run, build, sign, and ship the app. End users
don't need any of this — they just install from the site (see
`docs/INSTALL_AND_UPDATE.md`).

## Project layout

```
www/                     the web app (this is what Capacitor wraps)
  index.html
  styles/main.css        8-bit / JRPG theme
  ota.json               baked-in OTA baseline { build, channel, minNative } (CI-stamped)
  js/
    store.js             storage: Capacitor Preferences native / localStorage web
    game.js              engine: state, habit CRUD, completion, XP, migration
    attributes.js        the six primaries, character level, derived stats
    condition.js         cadence-aware decay / attribute condition
    leveling.js          attribute + character XP -> level curves
    cadence.js           cadence periods & due timing
    skilltree.js         user-authored mastery nodes + Growth Points
    sprites.js           the single procedural hero
    items.js / equipment.js   cosmetic loot + gear slots
    pedometer.js         steps source: native sensor / manual fallback
    doomscroll.js        doomscroll session/threshold/copy + ledger reading
    spirit.js            doomscroll -> Spirit scoring (pure, OTA-tunable)
    ota.js               over-the-air update check/apply
    notifications.js     local notifications (native) / no-op (web)
    backup.js            JSON export/import
    views.js             the screens + editor modals + dev panel
    app.js               orchestrator: routing, persistence, reward beats
android/                 generated Capacitor Android project
scripts/                 dev server, tests, icon + OTA-stamp + docs-site builders
.github/workflows/       android.yml (APK -> Pages) · web-ota.yml (OTA) · docs-site.yml (docs)
```

## Develop & test (web)

```bash
npm install
npm run serve          # http://localhost:5173
npm test               # dependency-free logic tests
node scripts/smoke.mjs # headless-browser end-to-end smoke test
```

On plain web, storage falls back to `localStorage` and reminders/detection are
no-ops (they need the native build). The full game loop runs in the browser.

## How the app is distributed (no app store, no GitHub Releases)

- **Web changes** (anything in `www/`) ship **over-the-air**. Pushing to the main
  branch runs `web-ota.yml`, which publishes a web bundle + `updates/latest.json`
  to **GitHub Pages**. The installed app checks that channel on launch and
  **prompts for consent** before applying.
- **Native changes** (step counter, doomscroll detector, a new plugin, icon,
  permissions) need a **new APK**. `android.yml` (run manually from the Actions
  tab) builds a **signed** APK and publishes it to Pages at a stable URL:
  `https://<owner>.github.io/<repo>/apk/rpgify-latest.apk`.
- **Versioning:** build numbers are the git commit count (`git rev-list --count
  HEAD`), stamped by `scripts/ota-stamp.mjs` into both the APK baseline and the
  OTA manifest so they compare cleanly. Each web bundle records the minimum
  native `versionCode` it needs (`minNative` in `www/ota.json`) so OTA never
  half-updates a stale APK. There are **no git tags and no GitHub Releases** —
  distribution is the Pages URL.

## One-time setup (to build & ship your own copy)

### 1. Create a signing key

A stable key means APK updates install *over* the old app instead of failing
with "app not installed". On any machine with the JDK (`keytool`):

```bash
keytool -genkey -v -keystore rpgify-release.keystore \
  -alias rpgify -keyalg RSA -keysize 2048 -validity 10000
```

Keep `rpgify-release.keystore` safe — lose it and you can't ship updates that
install over the old app.

### 2. Add four GitHub secrets

Base64-encode the keystore (`base64 -w0 rpgify-release.keystore` on Linux;
`base64 rpgify-release.keystore` on macOS), then in the repo → **Settings →
Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `RPGIFY_KEYSTORE_BASE64` | the base64 text |
| `RPGIFY_KEYSTORE_PASSWORD` | the keystore password |
| `RPGIFY_KEY_ALIAS` | `rpgify` |
| `RPGIFY_KEY_PASSWORD` | the key password |

Without them the workflow still builds, but a **debug** APK (debug builds don't
share a signature between runs, so updates fail).

### 3. Enable GitHub Pages

Repo → **Settings → Pages → Deploy from a branch → `gh-pages` / `(root)`**. The
first workflow run creates the `gh-pages` branch; Pages then serves the docs
site, the APK (`apk/…`), and the OTA channel (`updates/…`).

## Building the Android app

**Cloud (recommended):** Actions → **Build Android APK** → **Run workflow**. It
builds a signed APK and publishes it to Pages (and a SHA-256 alongside it).

**Locally** (needs JDK 17+ and the Android SDK / Android Studio):

```bash
npm install
npx cap sync android      # re-run after any change in www/
cd android
./gradlew assembleRelease # or open android/ in Android Studio and Run
```

> The APK is not compiled in the authoring environment (no Android SDK there);
> the Capacitor project builds normally on any machine with the SDK.

### App icon & splash
Generated from a hand-drawn pixel emblem by `scripts/make-icons.mjs` (rasterised
with headless Chromium) and committed under `android/app/src/main/res/`. Re-run
it if you tweak the emblem; `cap sync` does not touch these.

### Steps & notifications on device
The step sensor (`StepCounterPlugin.java`, `TYPE_STEP_COUNTER`) and local
notifications only work on a real device/build; the JS logic is covered by the
tests using the manual/no-op fallbacks.

## Sharing / forking

A friend forks the repo and does their **own** one-time setup (their own keystore
+ four secrets, their own Pages). The workflows derive the OTA channel and APK
URL from the repo owner, so a fork automatically targets *its own* Pages — fully
independent of the upstream repo.

## Verifying builds (optional hardening)

- Each published APK gets a **SHA-256** next to it (`apk/rpgify-latest.apk.sha256`).
- **Build provenance attestation** (`actions/attest-build-provenance`) can be
  added so each APK carries a GitHub-signed record of which repo/commit/workflow
  produced it, verifiable with `gh attestation verify`. See `docs/SECURITY.md`.
