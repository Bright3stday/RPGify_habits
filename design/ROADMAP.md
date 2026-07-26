# Roadmap & backlog

The living plan. Keep this current — it's how work survives across sessions.
Principle: **OTA-first** (ship web/JS freely), **batch native** into occasional
APKs. See `CLAUDE.md` for how things ship.

## Shipped

- Core game: quests → six attributes → level/derived stats → single hero;
  cadence-aware decay; self-authored mastery tree + Growth Points; cosmetic loot.
- Steps auto-quests; local reminders (spaced); export/import.
- Doomscroll → **Spirit scoring** (restraint = capped XP; binge = self-healing
  wear that also burns down as quests are completed). Consent-based, transparent,
  tunable (`SPIRIT_TUNING`). Distinct muted "debuff" beat for wear. Scoring
  respects the enable toggle (nothing applies when disabled).
- **Onboarding walkthrough + doomscroll "paths" + Usage-Access migration**
  (versionCode 4, minNative 4). First-run walkthrough (`views.js showWalkthrough`)
  introduces the game and lets the user pick a path — **Oracle** (default,
  reflect-on-return, no background service) or **Sentinel** (opt-in, real-time
  foreground service + live nudge); skippable → Oracle; replayable from Config.
  Detection moved off the **AccessibilityService** to **Usage Access** (removes the
  banking-app conflict + Play Protect friction; accessibility service deleted).
  One shared native reconstruction (`DoomscrollUtil.syncSessions`) feeds both paths
  via a single cursor. Scoring unified to **duration-based** (`spirit.js
  sessionOutcome`): cross the threshold without bingeing → capped XP; binge → wear;
  under threshold → neutral (both paths, legacy alert-rows still handled).
  Never-forced adaptive prompt to try Sentinel when Oracle keeps losing
  (`app.js maybeSuggestSentinel`). Logs only selected apps; `docs/SECURITY.md`
  updated.
- Delivery: OTA web updates (consent-based) + signed APK — both via GitHub Pages.
  Docs website generated from Markdown. Hidden dev/test panel. Security/verify doc.
- **Recipes** — curated, editable quest/mastery starting points per stat
  (`www/js/recipes.js`); browse/add modal that pre-fills the editor; multi-node
  mastery paths with wired dependencies. Spec: `design/RECIPES.md`.
- **Decay/avatar tweak** — overall/hero condition now averages only *engaged*
  stats (ones with quests); untrained stats no longer mask a focused user's
  lapse (`attributes.js engagedStatIds`/`overallCondition`).
- **Usage stats view** — `showUsageStats(ctx)` modal (today/week toggle, per-app
  breakdown); `scrollRecapWidget` on dashboard shows today's summary when there
  are sessions; Spirit beats carry a "SESSION HISTORY ▸" tap-through; entry
  point also in Config → Doomscroll Mirror. `doomscroll.js usageStats()` /
  `statsSummaryLine()` are the pure logic functions (OTA-tunable).
- **Cozy-fantasy archetypes + onboarding quiz** — replaced the JRPG job-class
  hero (Adventurer/Warrior/Knight/Mage) with a base **Wanderer** that evolves
  into **Druid** / **Scholar** / **Ranger** depending on a 3-question
  first-run diagnostic quiz sorting into growth paths **The Anchor** /
  **The Architect** / **The Catalyst** (`recipes.js GROWTH_PATHS`,
  `pathFromQuiz`, `starterLoadout`; `sprites.js`; walkthrough quiz cards in
  `views.js showWalkthrough`). Result screen offers a primary "Accept
  Recommended Loadout" (3 quests + 1 mastery node) or a secondary manual
  path with a burnout warning.
- **Browser PWA (no APK, no Android-only)** — `www/manifest.json` + `sw.js`
  (registered from `js/pwa.js`, native no-op) make the app installable on iOS
  Safari, Android Chrome, and desktop, for users who aren't on Android or
  don't want to sideload an APK. `web-ota.yml` publishes `www/` verbatim to
  `gh-pages/app/` on every push. The Doomscroll Mirror and local reminders are
  native-only and **hidden entirely** in that build (`doomNative()` /
  `notificationsSupported()` checks in `views.js`) — everything else (quests,
  attributes, decay, mastery tree, loot) is identical. Linked from the docs
  site and `docs/INSTALL_AND_UPDATE.md`.

## Next — OTA-only (no reinstall)

1. **Usage quests** — auto avoid/keep-under (e.g. "under 30 min on X today"),
   auto-completing like the step tracker, feeding a stat. JS.
   Works great with Oracle (no live watcher needed).

## Native backlog — batch into the next APK

Ship an APK only when these are worth a reinstall (or a real bug forces one). The
paths migration (accessibility → Usage Access) **shipped** in versionCode 4 and
cleared most of this list — remaining:

- Screen-off session-accuracy refinements (Sentinel poll-based session ends are
  bounded by `pollMinutes`; Oracle reconstruction from UsageStats is exact).
- Bump `versionCode` when cutting the next APK.

Verify on a CI build (no SDK here): the Usage-Access migration compiles, the
Sentinel foreground service starts/stops via the plugin, and Oracle `syncUsage`
records sessions on open.

## Decisions log

- **The PWA hides native-only features, never shows them disabled.** A
  browser user isn't a degraded Android user — Doomscroll Mirror and
  Reminders sections don't render at all rather than appearing greyed out
  with an explanation. Keeps the browser build feeling complete on its own.
- **OTA-first cadence.** Minimize APK reinstalls for testers; batch native.
- **Doomscroll = user-chosen "paths", no forced default.** Onboarding explains the
  feature and lets the user pick Sentinel (real-time) vs Oracle (reflect-on-return);
  skip → Oracle. On-return reckoning is common to both. Adaptive prompt to try
  Sentinel is optional, never forced.
- **Drop Accessibility → Usage Access** for detection (removes banking-app conflict
  + Play Protect install friction; both are accessibility-specific).
- **Spirit is a normal quest-trained attribute**; doomscroll only adds bonus XP
  (restraint) and condition wear (binges) on top.
- **Selected-only usage logging** is the default (privacy). Retroactive
  history/discovery across all apps = a future *explicit opt-in*, not default.
- **No git tags / GitHub Releases** — blocked here; distribution is Pages.
- **Recipes are editable starting points**, never prescriptive — preserve the
  self-authored ethos.
- Spirit numbers live in `SPIRIT_TUNING` (OTA-tunable): gainXp 6, dailyCap 18,
  bingePastSec 300, wearPerBinge 0.2, wearMax 0.6, ~2-day heal, recoverPerQuest 0.06.

## Inn / Rest modes — pause quests, soften decay (spec in progress)

An **Inn** the user can check into for unforeseen life events (illness, injury,
travel) that block quests — so decay doesn't punish them for things outside their
control. Pausing is manual and consensual. Two rest modes:

- **Recovery mode** (illness/injury): freeze or reduce decay; **re-weight toward
  Vitality** and gentle recovery quests (extra hydration, rest, don't strain the
  body until recovered). Strenuous quests suppressed.
- **Holiday mode**: **tone down strenuous quests**; let low-effort auto-quests
  (step tracker) take center stage; reduced (not fully frozen) decay.

Open questions (user will refine): freeze vs. reduce decay per mode; time-boxing /
auto-resume; whether recovery quests grant normal XP; an abuse guard so you can't
just live in the Inn. → promote to `design/INN.md` once specced.

## Ideas / not scheduled

- Community/import-export recipe packs.
- Per-named-quest mastery threshold ("Meditate specifically ≥ 30").
- Build-provenance attestation for the APK (stronger "is it safe" story).
- Docs-site polish (pixel-font header, screenshots).
