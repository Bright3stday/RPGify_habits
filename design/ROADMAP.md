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

## Next — OTA-only (no reinstall)

1. **Usage stats view** — behind an explicit button: per selected-app continuous
   sessions/day/week, durations, and vs. previous period. Store small **daily
   aggregates** in state for trends. JS (reads the ledger). Now easy: the paths
   ledger already records duration-based rows for both paths.
2. **Usage quests** — auto avoid/keep-under (e.g. "under 30 min on X today"),
   auto-completing like the step tracker, feeding a stat. JS. Depends on 1.
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
