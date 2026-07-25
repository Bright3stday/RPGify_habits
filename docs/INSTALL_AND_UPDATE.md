# Installing & Updating on Your Phone (the easy way)

Goal: **update the app on your phone without ever opening Android Studio again**,
and have each update install *over* the old one so your data (habits, mastery
tree, loot) is kept.

There are two pieces:
1. **Cloud build** — GitHub builds the APK for you (no PC toolchain needed).
2. **A stable signing key** — so updates install over each other instead of
   forcing an uninstall. Android refuses to update an app if the new APK is
   signed with a different key, so this part matters.

---

## One-time setup (~10 minutes)

### 1. Create a signing key

On any computer with Java installed (`keytool` comes with the JDK), run:

```bash
keytool -genkey -v -keystore rpgify-release.keystore \
  -alias rpgify -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a **keystore password**, a **key password** (you can use the same
for both), and some name/org fields (put anything). Keep the
`rpgify-release.keystore` file somewhere safe — **if you lose it you can't ship
updates that install over the old app** (you'd have to uninstall + reinstall,
losing data unless you Export first).

### 2. Turn the keystore into text and add repo secrets

Base64-encode the keystore so it can live in a GitHub secret:

```bash
base64 -w0 rpgify-release.keystore    # Linux
base64 rpgify-release.keystore        # macOS (no -w0)
```

Copy the output. Then in your repo on GitHub → **Settings → Secrets and
variables → Actions → New repository secret**, add these four:

| Secret name | Value |
|-------------|-------|
| `RPGIFY_KEYSTORE_BASE64` | the base64 text from above |
| `RPGIFY_KEYSTORE_PASSWORD` | the keystore password you chose |
| `RPGIFY_KEY_ALIAS` | `rpgify` |
| `RPGIFY_KEY_PASSWORD` | the key password you chose |

That's it — the build workflow (`.github/workflows/android.yml`) picks these up
automatically and signs release builds with your key.

---

## Building a new APK whenever you want

**Option A — manual (simplest):**
GitHub → **Actions** tab → **Build Android APK** → **Run workflow** → pick your
branch → Run. Wait ~3–5 min. Open the finished run → **Artifacts** →
`rpgify-habits-apk` → download. (On desktop it's a `.zip` with the APK inside; on
the phone you may prefer Option B.)

**Option B — tagged release (best for phone installs):**
Push a version tag and the workflow also publishes a **GitHub Release** with the
APK attached directly (no zip):

```bash
git tag v1 && git push origin v1     # next time: v2, v3, ...
```

Then on your phone open the repo's **Releases** page → tap the `.apk` asset →
install.

---

## Installing / updating on the phone

1. Download the APK (from the Release asset, or the artifact zip).
2. Tap it. The first time, Android asks to allow "install unknown apps" for your
   browser/Files app — allow it.
3. It installs. **Next** time you do this with a newer APK, it installs *as an
   update* — your data stays, because it's signed with the same key.

To move between phones or before a risky change, use **Config → Export** to save
a JSON backup, and **Import** to restore.

---

## Without the signing key (if you skip step 1–2)

The workflow still runs and produces a **debug** APK you can install. Downside:
debug APKs from different builds don't share a signature, so an update may fail
with "app not installed" and you'd have to uninstall first (losing data unless
you Export). For painless updates, do the one-time signing setup above.

---

## Even easier later: over-the-air web updates (optional, not set up)

Most of this app is web code (`www/`). A Capacitor OTA plugin (e.g. Capgo) can
push HTML/CSS/JS updates straight to the installed app **without** building or
reinstalling an APK — you'd only need a new APK when *native* code changes
(the step counter or doomscroll service). It adds a small service/dependency, so
it's left out for now; ask if you want it wired up.
