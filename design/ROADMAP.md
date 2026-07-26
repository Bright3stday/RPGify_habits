# Roadmap & backlog

The living plan. Keep this current — it's how work survives across sessions.
Principle: **OTA-first** (ship web/JS freely), **batch native** into occasional
APKs. See `CLAUDE.md` for how things ship.

## Shipped

- Core game: quests → six attributes → level/derived stats → single hero;
  cadence-aware decay; self-authored mastery tree + Growth Points; cosmetic loot.
- Steps auto-quests; local reminders (spaced); export/import.
- Doomscroll: event-driven AccessibilityService detector + raw session ledger →
  **Spirit scoring** (restraint = capped XP; binge = self-healing wear that also
  burns down as quests are completed). Consent-based, transparent, tunable
  (`SPIRIT_TUNING`). Distinct muted "debuff" beat for wear. Scoring respects the
  enable toggle (nothing applies when disabled).
- Delivery: OTA web updates (consent-based) + signed APK — both via GitHub Pages.
  Docs website generated from Markdown. Hidden dev/test panel. Security/verify doc.
- **Recipes** — curated, editable quest/mastery starting points per stat
  (`www/js/recipes.js`); browse/add modal that pre-fills the editor; multi-node
  mastery paths with wired dependencies. Spec: `design/RECIPES.md`.
- **Decay/avatar tweak** — overall/hero condition now averages only *engaged*
  stats (ones with quests); untrained stats no longer mask a focused user's
  lapse (`attributes.js engagedStatIds`/`overallCondition`).

## Next — Onboarding walkthrough + Doomscroll "paths" (spans OTA + native)

The near-term headline. First run currently has **no walkthrough** at all; add
one, and use it to let the user *choose how doomscroll watches them* rather than
us picking a default.

**First-run walkthrough** (OTA — JS/HTML). Short, skippable, re-openable from
Settings. Cards: welcome (habits → attributes → hero) · Growth Points + mastery ·
decay · **the Spirit & doomscroll** · **choose your path** · grant Usage Access ·
pick apps.

- Spirit framing (corrected): Spirit (`spr`) is a normal attribute **trained by
  quests like any other**. Doomscroll only adds a layer on top — **restraint
  grants bonus Spirit XP, binges wear its condition**. Do NOT imply Spirit is
  only about restraint.

**Two paths** (the user picks; switchable in Settings anytime):
- **Path of the Sentinel** (real-time) — background watch + **live nudge** at the
  limit. Cost: a persistent "watching" notification, a little more battery.
- **Path of the Oracle** (reflect-on-return) — nothing runs in the background;
  the reckoning appears when you next open RPGify. Cost: no in-the-moment nudge.
- **The on-return reckoning (Spirit gain + decay-wear animation) is common to
  BOTH paths.** Sentinel = the Oracle baseline **plus** the live nudge — opening
  RPGify always replays what happened, regardless of path.
- **Default = Oracle if the user skips.** Nothing watches until a path is chosen.
- **Adaptive nudge (optional, never forced):** if an Oracle user keeps getting no
  Spirit gain / constant decay wear / maxed wear, prompt "want to try the Sentinel
  path and see if it helps?" — one-tap switch, dismissible.

**Scoring adaptation** (`spirit.js`). `applyLedger` currently grants XP only when
`e.alerted` is set + `leftAfterAlertSec <= graceSec` — that path only fires under
Sentinel (a live nudge happened). Add an **Oracle gain path**: reward a session
whose duration **ended under `bingePastSec`** (self-regulated, no nudge needed),
still bounded by `dailyCapXp`. Keep the alert-based gain for Sentinel.

**Native (batched APK).** Migrate the detector off the **AccessibilityService**
to **Usage Access** (`PACKAGE_USAGE_STATS`) — this removes both the banking-app
conflict and the Play Protect install friction (both accessibility-specific). Two
native capabilities sit behind the paths:
- Oracle: on open/resume, query UsageStats for sessions since last check → ledger.
- Sentinel: the existing UsageStats foreground service (live nudge).
- Detector logs **only selected apps**; then fix `docs/SECURITY.md`. Bump
  `versionCode`.

## Next — OTA-only (no reinstall)

1. **Tracking ⁄ mirror split + transparency** — largely *subsumed by the paths
   work above* (Oracle with tracking off = nothing runs; Oracle = usage awareness;
   Sentinel = full mirror). Keep the honest three-state copy where it still helps.
2. **Usage stats view** — behind an explicit button: per selected-app continuous
   sessions/day/week, durations, and vs. previous period. Store small **daily
   aggregates** in state for trends. JS (reads the ledger).
3. **Usage quests** — auto avoid/keep-under (e.g. "under 30 min on X today"),
   auto-completing like the step tracker, feeding a stat. JS. Depends on 1–2.

## Native backlog — batch into the next APK

Ship an APK only when these are worth a reinstall (or a real bug forces one).
**The next APK is the paths migration above** (accessibility → Usage Access), which
folds in most of this list:

- **Accessibility → Usage Access migration** (see paths section). Drives Oracle's
  on-return query and Sentinel's foreground service; removes the banking-app
  conflict and Play Protect friction.
- Detector goes **dormant when tracking is off** — trivial once migrated (Oracle
  runs nothing in the background by construction).
- Detector logs **only selected apps** (privacy/footprint). Then update
  `docs/SECURITY.md` wording (currently it slightly overclaims — the service logs
  every foreground app, scoring only the watched ones). **Hold the doc fix until
  this ships** (decided).
- Screen-off session-accuracy refinements.
- Bump `versionCode` when cutting the APK.

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
