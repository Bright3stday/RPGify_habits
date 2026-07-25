# RPGify Habits — Knowledge Base

Start here. This is the index for everything about the project: what it is, how
each system works, how to build/ship it, and the decisions (and dead ends)
behind the current design. Drop this `docs/` folder into a Claude project and a
fresh session can pick up with full context.

## Documents

| Doc | Read it for |
|-----|-------------|
| [`../README.md`](../README.md) | Project overview, screens, design notes, project layout, dev/build commands. |
| [`HOW_IT_WORKS.md`](HOW_IT_WORKS.md) | Plain-English, example-driven tour of every system and exactly what each number/threshold reads from. The best conceptual reference. |
| [`INSTALL_AND_UPDATE.md`](INSTALL_AND_UPDATE.md) | Getting the app on a phone and keeping it updated: signing key + secrets, GitHub Pages, OTA vs APK, "app not installed" troubleshooting, sharing with a friend. |

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
- **Doomscroll uses a foreground-service poll, not an OS observer.** The zero-
  poll `UsageStatsManager.registerUsageSessionObserver` API needs the privileged
  `OBSERVE_APP_USAGE` permission that only system apps can hold — it is **not
  usable by a normal app** and isn't in the public SDK. An observer-based version
  was built and **reverted**; don't reattempt it. Firing is still precise: the
  service computes the exact crossing time from the real session start and arms a
  one-shot timer; the poll interval only bounds how soon a new session is noticed.
- **Copy is observation-only.** Doomscroll alerts state facts ("28 minutes on
  Instagram") and never instruct, scold, warn, or use red styling. This is tested.
- **APK signing must be stable.** Debug builds get a fresh key per CI run, so
  updates fail with "app not installed" (signature mismatch). The one-time
  keystore + four secrets fix it; `android/app/build.gradle` reads them from env
  and is inert when unset.
- **This repo has *immutable releases* enabled.** A reused release tag can't be
  re-uploaded to, which broke an earlier rolling "latest-build" prerelease. The
  APK workflow now publishes to Releases **only on unique version tags**.
- **Updates: OTA for web, APK for native.** `@capgo/capacitor-updater` +
  self-hosted GitHub Pages. Build number = commit count, stamped into both the
  APK baseline and the OTA manifest so they compare cleanly; each web bundle
  records the min native `versionCode` it needs so OTA never half-updates a stale
  APK. **Consent-based:** `checkForUpdate` only detects; it prompts the user
  (version + "what's new") and downloads/applies only via `applyUpdate` after
  they tap UPDATE NOW (LATER snoozes that build). Never auto-applies. See
  `INSTALL_AND_UPDATE.md`.
- **Doomscroll is poll-primary, fire-precise.** There is no real-time OS push
  for a normal app (the observer API needs a privileged permission — reverted).
  Polling (`DoomscrollService`, default 1 min) is the *only* detector, but each
  poll reads the session's true `MOVE_TO_FOREGROUND` timestamp from `queryEvents`
  and arms an exact one-shot at `start + threshold`, so the alert still fires to
  the second for any threshold ≫ poll interval. The poll interval only bounds how
  fast a brand-new session is first noticed; it does not degrade firing accuracy.

## One-time setup checklist (per person/fork)

1. Signing key → four `RPGIFY_*` GitHub secrets (for signed APKs).
2. Enable **GitHub Pages** from the `gh-pages` branch (for OTA).
3. Install one signed APK that contains the OTA updater; web changes then arrive
   over-the-air. Push version tags (`v2`, `v3`, …) only when native code changes.

## Open / possible future work

- Per-named-quest mastery threshold ("Meditate specifically ≥ 30"), distinct from
  per-attribute practice.
- Doomscroll: no content-inspection to tell YouTube Shorts from long-form (give
  YouTube a long threshold or leave it off) — a deliberate non-goal for now.
