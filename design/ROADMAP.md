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

## Next — OTA-only (no reinstall)

1. **Tracking ⁄ mirror split + transparency** — separate "usage tracking" from the
   "doomscroll mirror" (alerts + Spirit). Three honest states: tracking off /
   tracking on + mirror off (usage awareness, no penalty) / both on. UI + copy are
   JS; the "service physically stops logging" part is native (see backlog).
2. **Usage stats view** — behind an explicit button: per selected-app continuous
   sessions/day/week, durations, and vs. previous period. Store small **daily
   aggregates** in state for trends. JS (reads the ledger).
3. **Usage quests** — auto avoid/keep-under (e.g. "under 30 min on X today"),
   auto-completing like the step tracker, feeding a stat. JS. Depends on 1–2.

## Native backlog — batch into the next APK

Ship an APK only when these are worth a reinstall (or a real bug forces one):

- Detector goes **dormant when tracking is off** (currently JS ignores the data;
  interim "off" = revoke the Accessibility permission).
- Detector logs **only selected apps** (privacy/footprint). Then update
  `docs/SECURITY.md` wording (currently it slightly overclaims — the service logs
  every foreground app, scoring only the watched ones). **Hold the doc fix until
  this ships** (decided).
- Screen-off session-accuracy refinements.
- Bump `versionCode` when cutting the APK.

## Decisions log

- **OTA-first cadence.** Minimize APK reinstalls for testers; batch native.
- **Selected-only usage logging** is the default (privacy). Retroactive
  history/discovery across all apps = a future *explicit opt-in*, not default.
- **No git tags / GitHub Releases** — blocked here; distribution is Pages.
- **Recipes are editable starting points**, never prescriptive — preserve the
  self-authored ethos.
- Spirit numbers live in `SPIRIT_TUNING` (OTA-tunable): gainXp 6, dailyCap 18,
  bingePastSec 300, wearPerBinge 0.2, wearMax 0.6, ~2-day heal, recoverPerQuest 0.06.

## Ideas / not scheduled

- Community/import-export recipe packs.
- Per-named-quest mastery threshold ("Meditate specifically ≥ 30").
- Build-provenance attestation for the APK (stronger "is it safe" story).
- Docs-site polish (pixel-font header, screenshots).
