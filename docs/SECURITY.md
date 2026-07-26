# Is this app safe? — how to verify it yourself

RPGify Habits is a personal, non-commercial project distributed directly rather
than through an app store. That means Android shows "unknown source / unverified"
warnings when you install it — those are Android's **default caution for any
sideloaded app**, not a verdict that this app is unsafe. This page explains
exactly what the app does, what it can and can't touch, and how you can **verify
that for yourself** instead of taking anyone's word for it.

The short version: **the entire app is open source and built in public**, so you
don't have to trust the author — you can read every line and check that the APK
you installed was built from that public code.

---

## What leaves your device

**Effectively nothing, and never silently.** The app is offline-first:

- **No accounts, no analytics, no tracking, no ad SDKs.** There is no server that
  belongs to this app.
- The only network use is **downloading updates** — the app fetches a small JSON
  file and (if you accept) a web-code bundle from the project's public GitHub
  Pages site. That's a **download only**; nothing about you is uploaded.
- Your data (habits, stats, etc.) lives in **on-device storage**. It leaves only
  if **you** tap **Config → Export** (a file you choose to share).

You can prove this: put the phone in **airplane mode** — everything works except
checking for updates. Or run it behind a network monitor (e.g. PCAPdroid) and
you'll see it only ever talks to `github.io` / `githubusercontent.com` for
updates, nothing else.

---

## The permissions, and exactly what each can do

| Permission | Why | What it can NOT do |
|-----------|-----|--------------------|
| **Usage access** (optional, off by default) | The doomscroll detector reads *which app* is in the foreground and for how long, so it can notice long continuous sessions. It powers both paths: the Oracle path reads it only when you open RPGify; the Sentinel path reads it in a foreground service. | Read-only usage stats — the package name and timings of the front app, **only for the apps you pick**. It **cannot read the text/content on your screen**. Turn it off and the feature simply stops. |
| **Notifications** | The reflection nudge + reminders. | Only posts local notifications. |
| **Foreground service** (Sentinel path only) | Runs the opt-in real-time watcher, with a persistent "watching" notification. | Only what Usage access already allows; nothing runs in the background on the default Oracle path. |
| **Activity recognition / step counter** (optional) | Auto-completing step-goal habits from the hardware pedometer. | Reads the on-device step sensor only; no location, no fitness account, no network. |
| **Internet** | Checking for and downloading updates from GitHub Pages. | No uploads; used only for the update fetch. |

There is **no** Accessibility service, and **no** location, camera, microphone,
contacts, SMS, call-log, or "query all packages" permission. (App list for the
picker uses a narrow launcher query, not the sensitive all-packages permission.)

> Earlier builds used an Accessibility service for detection. That was dropped in
> favour of **Usage access** — it avoids the conflict where some banking/secure
> apps refuse to run alongside any accessibility service, and it draws less
> install-time scrutiny. No Accessibility permission is requested any more.

Usage access is the only special-access permission here, and the code using it is
**public and small**: session reconstruction is in
`android/app/src/main/java/com/rpgifyhabits/app/DoomscrollUtil.java`
(`syncSessions`), used by the Oracle sync in `DoomscrollPlugin.java` and the
Sentinel `DoomscrollService.java`. It only records which watched app is in front
and for how long. Read it.

---

## How to verify the APK is what the source says it is

1. **Read the source.** The whole app is in this public repo. The logic is plain
   JavaScript under `www/js/`; the native Android code is a handful of small Java
   files under `android/app/src/main/java/`. There's no obfuscation and no
   minification.

2. **The APK is built in public, not on someone's laptop.** Every build is
   produced by **GitHub Actions** from a specific public commit — the build logs
   are public (Actions tab), so you can see exactly what went in. Nothing is
   hand-assembled off-repo.

3. **Verify your download wasn't tampered with.** Each published APK has a
   SHA-256 checksum next to it (`apk/rpgify-latest.apk.sha256` on the Pages
   site). Compute the hash of your downloaded file and compare:
   ```bash
   sha256sum rpgify-latest.apk        # Linux
   shasum -a 256 rpgify-latest.apk    # macOS
   ```

4. **Verify the signature is consistent.** Every update is signed with the same
   key, so an imposter build can't install over a genuine one. Check the signing
   certificate fingerprint:
   ```bash
   apksigner verify --print-certs rpgify-latest.apk
   ```
   The fingerprint should match across versions (and match what the author
   publishes).

5. **Scan it.** Upload the APK to **VirusTotal** for a ~70-engine scan, and note
   that **Google Play Protect** already scans sideloaded apps on-device (that's
   the "scan / install anyway" prompt you saw). Heuristic engines sometimes flag
   *any* unsigned-by-Play app; a couple of generic/heuristic hits with no named
   malware family is normal for a hobby APK.

6. **Build it yourself and compare.** With the Android SDK you can build the APK
   from source (`npx cap sync android && cd android && ./gradlew assembleRelease`)
   and diff it against the published one to confirm they match.

---

## Why it isn't on the Play Store

It's a personal, non-commercial project, so it's distributed directly rather than
through an app store — which is why you install it by sideloading and see
Android's "unknown source" prompts. That's normal for this kind of app. A store
listing mainly adds Google's review and distribution; it doesn't make the *code*
any safer than reading the public source and verifying the build, which you can
do with the steps above.

---

## Further hardening (possible additions)

Beyond the checks above, two measures can strengthen assurance further:

- **Build provenance attestation** — each APK can carry a cryptographic,
  GitHub-signed statement of *which repository, commit, and workflow* produced
  it, verifiable with `gh attestation verify`. This is the gold standard for
  proving a binary came from a specific public source.
- **A published signing-certificate fingerprint** — a known-good value to compare
  the signature check (step 4) against.
