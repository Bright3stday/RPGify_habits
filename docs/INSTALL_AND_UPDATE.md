# Installing & Updating on Your Phone

Goal: get the app on your phone, and then **update it without building or
downloading APKs for everyday changes**.

There are two update paths, by design:

| Change type | How it reaches the phone | Needs a new APK? |
|-------------|--------------------------|------------------|
| **Web** (screens, game logic, text, styling — anything in `www/`) | **Over-the-air (OTA)** — the app downloads the new web bundle itself | No |
| **Native** (step counter, doomscroll service, a newly added Capacitor plugin, app icon, permissions) | A new **APK** you install | Yes |

Most changes are web changes, so once you're set up you'll rarely touch APKs.

Three one-time setups make this painless:

1. **A stable signing key** — so APK updates install *over* the old app instead
   of failing with "app not installed". (Android refuses to replace an app if the
   new APK is signed with a different key.)
2. **Cloud APK build** — GitHub builds signed APKs for you (no PC toolchain).
3. **GitHub Pages** — free static hosting for OTA web bundles.

---

## One-time setup

### 1. Create a signing key (~5 min)

On any computer with Java (`keytool` ships with the JDK):

```bash
keytool -genkey -v -keystore rpgify-release.keystore \
  -alias rpgify -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a **keystore password**, a **key password** (same is fine), and some
name/org fields (anything). **Keep `rpgify-release.keystore` safe** — lose it and
you can't ship APK updates that install over the old app (you'd have to
uninstall + reinstall, losing data unless you Export first).

### 2. Add the four signing secrets

Base64-encode the keystore:

```bash
base64 -w0 rpgify-release.keystore    # Linux
base64 rpgify-release.keystore        # macOS (no -w0)
```

Repo → **Settings → Secrets and variables → Actions → New repository secret**,
add these four:

| Secret name | Value |
|-------------|-------|
| `RPGIFY_KEYSTORE_BASE64` | the base64 text |
| `RPGIFY_KEYSTORE_PASSWORD` | the keystore password |
| `RPGIFY_KEY_ALIAS` | `rpgify` |
| `RPGIFY_KEY_PASSWORD` | the key password |

`.github/workflows/android.yml` picks these up automatically and signs release
builds. (Without them it still builds, but a **debug** APK — fine for a first
try, but debug builds don't share a signature between runs, so updates fail.)

### 3. Enable GitHub Pages for OTA (~2 min)

Repo → **Settings → Pages → Build and deployment → Deploy from a branch** →
branch **`gh-pages`**, folder **/ (root)** → Save.

The `gh-pages` branch doesn't exist yet — it's created automatically the first
time the OTA workflow runs (next section). After that, Pages serves the update
manifest at `https://<your-username>.github.io/rpgify_habits/updates/latest.json`.

---

## How updates work now

### Web changes → automatic OTA

When you push web changes (anything under `www/`) to the main development branch,
`.github/workflows/web-ota.yml` runs, packages the web bundle, and publishes it
to GitHub Pages. Your installed app checks that channel **on every launch** and,
if there's a newer bundle it can use, downloads and applies it (the app briefly
restarts into the new version). There's also a **CHECK FOR UPDATES** button in
**Config → APP UPDATES** to pull immediately.

No tags, no APK, no download prompts. You just push and, next time you open the
app, it's updated.

> The very first time, the phone needs an APK that already contains the OTA
> updater (built after this feature was added). Install that APK once (below);
> from then on web changes arrive over-the-air.

### Native changes → new APK

When native code changes, bump `versionCode` in `android/app/build.gradle`, then
push a version tag:

```bash
git tag v2 && git push origin v2      # next time v3, v4, …
```

`android.yml` builds a signed APK and attaches it to a **GitHub Release**. On the
phone, open the repo's **Releases** page → tap the `.apk` → install (it updates
in place, keeping your data, because it's signed with your key).

The OTA system is aware of this: each web bundle records the minimum
`versionCode` it needs (read from `build.gradle` at publish time). If a web
bundle relies on native code your installed APK doesn't have yet, the app won't
apply it and will tell you a new APK is needed — so OTA can never leave the app
in a broken half-updated state.

---

## Installing the APK on the phone

1. Download the `.apk` from the **Releases** page (tap the asset directly — not
   the artifact `.zip` from the Actions run page; a zip won't install).
2. Tap it. First time, Android asks to allow "install unknown apps" for your
   browser/Files app — allow it.
3. If Play Protect shows **"app not installed"**, tap **More details → Install
   anyway** (sideloaded apps trip Play Protect; this is expected).

### "App not installed" troubleshooting

Almost always one of these, in order:

1. **An older copy with a different signature is already installed** (e.g. a
   build you ran from Android Studio/VS Code during development, which uses the
   debug key). Uninstall it first (Export your data via **Config → Export**
   beforehand if you have any), then install.
2. You tapped the **artifact `.zip`** instead of the `.apk`. Use the Release
   asset.
3. **Play Protect** blocked it → *More details → Install anyway*.
4. Partial/corrupt download → re-download.

Once a signed APK is on cleanly, later signed APKs update in place with no
uninstall.

---

## Building an APK manually (optional)

Repo → **Actions** tab → **Build Android APK** → **Run workflow** → pick your
branch → Run. Open the finished run → **Artifacts** → download the APK zip. (Only
**tag** pushes publish a phone-tappable APK to Releases; manual/branch runs just
produce the artifact zip.)

---

## Sharing with a friend

A friend forks the repo and does their **own** one-time setup (their own keystore
+ four secrets, their own Pages). The workflows derive the OTA channel from the
repo owner, so their fork automatically points at *their* Pages, not yours —
their builds and updates are fully independent of yours. Downloading your APK
doesn't use their secrets, and vice-versa.

---

## How the versioning fits together (reference)

- **Build number** = `git rev-list --count HEAD` (commit count). Monotonic along
  the branch and identical no matter which workflow computes it, so an APK built
  at commit N and a web bundle published at commit M compare cleanly (M > N ⇒
  the app updates). Stamped by `scripts/ota-stamp.mjs`.
- The APK bakes in `www/ota.json` (`{ build, channel }`); each OTA publish writes
  `updates/latest.json` (`{ build, url, minNative, … }`) to Pages.
- The app runs whichever is newer: the APK's baked-in build or the last OTA
  bundle it applied (tracked in Preferences). A freshly installed newer APK
  always wins over an older OTA bundle (`resetWhenUpdate` in
  `capacitor.config.json`), so updates never go backwards.
