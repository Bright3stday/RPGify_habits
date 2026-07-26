# RPGify Habits — Knowledge Base

Start here. This is the index for everything about the project: what it is, how
each system works, how to build/ship it, and the decisions (and dead ends)
behind the current design. Drop this `docs/` folder into a Claude project and a
fresh session can pick up with full context.

## Documents

| Doc | Read it for |
|-----|-------------|
| [`../README.md`](../README.md) | Product overview, screens, design notes. Public site "Overview" page. |
| [`HOW_IT_WORKS.md`](HOW_IT_WORKS.md) | Plain-English, example-driven tour of every system and exactly what each number/threshold reads from. The best conceptual reference. |
| [`INSTALL_AND_UPDATE.md`](INSTALL_AND_UPDATE.md) | End-user install/update: download the APK from the site, "app not installed" fixes, how OTA updates arrive. (User-facing only.) |
| [`SECURITY.md`](SECURITY.md) | "Is this safe?" — permissions explained, what leaves the device (nothing silently), and how anyone can verify the APK matches the public source. |
| [`../DEVELOPING.md`](../DEVELOPING.md) | **Developer/self-host doc:** project layout, dev/test, signing key + GitHub secrets, GitHub Pages, building the APK, versioning, forking. Not on the public site. |

## What this is (one paragraph)

An offline-first Android habit tracker gamified as a Final Fantasy character
sheet. Real habits pour XP into six fixed attributes (Strength, Magic, Vitality,
Spirit, Luck, Speed) → those drive a character level, derived stats, and a single
hero sprite. You spend a scarce, time-granted currency (**Growth Points**) to
unlock **self-authored** mastery-tree nodes. Neglect makes attributes visibly
**decay** (the hero can devolve to a slime) — deliberate loss aversion. Loot/gear
is cosmetic only. Vanilla HTML/CSS/JS (no framework), wrapped with **Capacitor 6**
for Android. 100% on-device: no backend, accounts, or sync.

## System map (where each thing lives)

```
www/js/
  game.js         state, habit CRUD, completion, XP, migration (SCHEMA_VERSION)
  attributes.js   six fixed attributes, character level, derived stats
  leveling.js     XP → level curves
  cadence.js      cadence periods & due timing
  condition.js    cadence-aware decay (derived from timestamps, never stored)
  skilltree.js    self-authored mastery nodes + Growth Points currency
  sprites.js      single procedural hero (adventurer..mage, imp, slime)
  items.js        loot table + drop rolls   equipment.js  cosmetic gear slots
  pedometer.js    steps (native TYPE_STEP_COUNTER live-poll / manual on web)
  notifications.js local reminders (spacing, test, channel creation)
  doomscroll.js   doomscroll session/threshold/copy logic + native bridge
  ota.js          over-the-air web-update check/apply
  store.js        storage (Capacitor Preferences native / localStorage web)
  views.js        the five screens   app.js  orchestrator (routing, reward beats)
www/ota.json      baked-in OTA baseline { build, channel } (CI-stamped)
scripts/          test.js (logic) · smoke.mjs (headless browser) · make-icons.mjs · ota-stamp.mjs · serve.js
.github/workflows/ android.yml (APK build/sign/release) · web-ota.yml (OTA publish)
android/app/src/main/java/com/rpgifyhabits/app/
  StepCounterPlugin.java · DoomscrollService.java · DoomscrollPlugin.java · DoomscrollUtil.java
```

## Testing

- `npm test` — pure-logic unit tests (leveling, decay, mastery eligibility,
  Growth Points, doomscroll timing, reminder spacing, OTA `shouldApply`).
- `node scripts/smoke.mjs` — headless-Chromium end-to-end of the full game loop.
- **Native code is not compiled in the authoring environment** (no Android SDK,
  `dl.google.com` blocked). Java (pedometer, doomscroll service, OTA plugin glue)
  is written to the Android APIs and verified on a real device/build.

## Key decisions & hard-won learnings

- **Fixed FF7-style attributes, one hero, cosmetic gear.** The user explicitly
  chose growth via real habits over in-game item min-maxing. Don't add stat-
  bearing gear or per-attribute sprites.
- **Mastery is per-attribute, not per-quest.** "Practice count" = the sum of
  lifetime completions of *every* quest training that attribute; node titles are
  never matched against quest names. "Depends on a few things" is expressed
  node-to-node (parent nodes, all/any-N), not node-to-quest. (A per-named-quest
  threshold type is a noted future option, not built.)
- **Decay is derived from timestamps, never a stored ticking counter** — correct
  behaviour whether you return after an hour or three weeks, no background job.
- **Doomscroll detection uses Usage Access, not Accessibility, and not an OS
  observer.** Two paths (below) both read `UsageStatsManager`. The zero-poll
  `registerUsageSessionObserver` API needs the privileged `OBSERVE_APP_USAGE`
  permission only system apps can hold — **not usable by a normal app**; an
  observer version was built and **reverted**, don't reattempt it. The old
  Accessibility detector was also **dropped** (banking-app conflict + Play Protect
  friction). Sentinel firing is still precise: the service computes the exact
  crossing time from the real session start and arms a one-shot timer; the poll
  interval only bounds how soon a new session is noticed.
- **Copy is observation-only.** Doomscroll alerts state facts ("28 minutes on
  Instagram") and never instruct, scold, warn, or use red styling. This is tested.
- **APK signing must be stable.** Debug builds get a fresh key per CI run, so
  updates fail with "app not installed" (signature mismatch). The one-time
  keystore + four secrets fix it; `android/app/build.gradle` reads them from env
  and is inert when unset.
- **No git tags, no GitHub Releases.** Tag creation is blocked here (repo
  ruleset + the session git proxy 403s tag refs), so distribution does **not**
  use Releases. The APK is published to **GitHub Pages** (`apk/rpgify-latest.apk`,
  built by a manual `android.yml` run); the docs site and OTA channel live on the
  same Pages site. `android.yml` no longer has a Releases step or tag trigger.
- **Updates: OTA for web, APK for native.** `@capgo/capacitor-updater` +
  self-hosted GitHub Pages. Build number = commit count, stamped into both the
  APK baseline and the OTA manifest so they compare cleanly; each web bundle
  records the min native `versionCode` it needs so OTA never half-updates a stale
  APK. **Consent-based:** `checkForUpdate` only detects; it prompts the user
  (version + "what's new") and downloads/applies only via `applyUpdate` after
  they tap UPDATE NOW (LATER snoozes that build). Never auto-applies. See
  `DEVELOPING.md` (setup) and `INSTALL_AND_UPDATE.md` (end-user).
- **Doomscroll: two user-chosen "paths", JS scoring, distinct from Digital
  Wellbeing.** Digital Wellbeing already owns daily limits + hard blocking; we do
  NOT duplicate that. RPGify's role is *per-continuous-session awareness* tied to
  the RPG. The first-run **walkthrough** explains the feature and lets the user
  pick how it watches (never a forced default):
  - **Oracle** (default, reflect-on-return): no background service. On open,
    `DoomscrollPlugin.syncUsage` → `DoomscrollUtil.syncSessions` reconstructs
    completed sessions from Usage Access into the ledger.
  - **Sentinel** (opt-in, real-time): `DoomscrollService` (foreground service)
    records the same sessions *and* fires the live nudge; persistent notification.
  - Both paths write **identical, duration-based ledger rows** (`durationSec` +
    `thresholdMin`) through one shared cursor, so they never double-count and
    switching loses nothing. The on-return reckoning is common to both. If Oracle
    keeps losing, `app.js` *offers* Sentinel (dismissible, cooldown-gated).
  **Native/APK-locked:** session reconstruction + the raw ledger
  (`DoomscrollUtil`, read via the plugin's `readEvents`).
  **OTA-tunable (JS):** all scoring in `www/js/spirit.js` (`SPIRIT_TUNING`,
  `sessionOutcome`) — crossing an app's threshold without bingeing grants Spirit
  XP (daily cap, anti-farm); bingeing (>~5 min past) adds capped, self-healing
  wear that also burns down as you complete quests; ending before the threshold is
  neutral. Drained on open/resume (`app.js drainDoomscroll`), folded into Spirit XP
  (`attributes.js attrXp`) and condition (`condition.js`). Spirit is also trained
  by quests directly. Schema still v4 (`state.spiritTrack`; `settings.onboarded`
  and `doomscroll.path` added, defaulted in `migrate`).
- **`minNative` is set intentionally, not auto-derived.** Each OTA manifest's
  `minNative` comes from the committed `www/ota.json` field, bumped by hand only
  when a web change truly needs a newer native capability. (Auto-reading it from
  `versionCode` would wrongly block JS-only updates from older-but-adequate APKs.)
  `versionCode` is **4** and `minNative` is **4** as of the Usage-Access paths APK
  (the paths bundle genuinely needs the new native, so it's gated to that APK).

## One-time setup checklist (per person/fork)

See `DEVELOPING.md` for the full walkthrough. In short:
1. Signing key → four `RPGIFY_*` GitHub secrets (for signed APKs).
2. Enable **GitHub Pages** from the `gh-pages` branch (serves docs, APK, OTA).
3. Install one signed APK that contains the OTA updater; web changes then arrive
   over-the-air. Re-run **Actions → Build Android APK** for a new APK only when
   native code changes.

## Open / possible future work

- Per-named-quest mastery threshold ("Meditate specifically ≥ 30"), distinct from
  per-attribute practice.
- Doomscroll: no content-inspection to tell YouTube Shorts from long-form (give
  YouTube a long threshold or leave it off) — a deliberate non-goal for now.
