# RPGify Habits — orientation for Claude Code

Read this first. It's auto-loaded each session so you can be productive without
re-deriving context. For depth, read `docs/README.md` (the map) and `design/`
(feature specs + roadmap).

## What it is

An offline-first Android habit tracker gamified as a Final Fantasy character
sheet. Real habits ("quests") train six fixed attributes (str/mag/vit/spr/lck/spd)
→ character level, derived stats, a single hero sprite. Users spend scarce,
time-granted **Growth Points** on a **self-authored mastery tree**. Neglect makes
attributes visibly **decay** (loss aversion). A **doomscroll** feature detects
long continuous sessions in chosen apps (via **Usage Access**, no Accessibility)
and feeds/wears the **Spirit** attribute — layered on top of the quests that also
train Spirit. A first-run **walkthrough** lets the user pick how it watches: the
**Oracle** path (default; reflects on return, nothing in the background) or the
**Sentinel** path (opt-in; real-time nudge via a foreground service). Vanilla
HTML/CSS/JS (no framework) wrapped with Capacitor for Android.

## How work ships — OTA-first, minimize APKs

- **Web/JS changes (www/**) ship over-the-air.** Pushing to the dev branch runs
  `web-ota.yml`, which publishes a bundle to GitHub Pages; the installed app
  prompts the user to update. **Prefer this for almost everything.**
- **Native/Android changes need a new APK** (built by `android.yml`, published to
  Pages). APKs mean testers reinstall, so **batch native changes** — ship an APK
  only for substantial native features or a real bug. Keep a running list in
  `design/ROADMAP.md` under "native backlog".
- **Write JS to degrade gracefully** when a native capability is absent, so a web
  change never *forces* an APK. `minNative` (in `www/ota.json`) stays at its
  current value unless a web bundle truly cannot run on the shipped APK.
- **No git tags, no GitHub Releases** (tag creation is blocked here). Distribution
  is the Pages URL. See `DEVELOPING.md`.

## Conventions

- Vanilla ES modules under `www/js/`. Pure logic in its own module (unit-tested);
  DOM/rendering in `views.js`; orchestration in `app.js`.
- The app runtime has **no dependencies**; `marked` is a devDependency for the
  docs-site build only.
- Keep the suites green: `npm test` (pure logic) and `node scripts/smoke.mjs`
  (headless-browser). Add tests with new logic.
- Native Android code can't be compiled here (no SDK) — verify it via a CI build.
- Tunable game numbers live in one place (e.g. `SPIRIT_TUNING` in `spirit.js`) so
  they can be retuned over the air.

## Working across sessions

- **Git is the shared memory**, not the chat. Everything important lives in the
  repo (code, specs, roadmap, decisions).
- One focused feature per session; build from its `design/*.md` spec.
- Avoid two sessions editing the same branch at once — use a feature branch per
  stream and merge to the dev branch when complete (that merge is what publishes
  the OTA update, so you control cadence and avoid half-built ships).

## Where things are

```
www/js/            app (game.js, attributes.js, condition.js, skilltree.js,
                   spirit.js, doomscroll.js, ota.js, views.js, app.js, …)
android/           Capacitor Android project (native: detector, step counter)
scripts/           test.js, smoke.mjs, ota-stamp.mjs, build-docs-site.mjs
.github/workflows/ android.yml (APK→Pages) · web-ota.yml (OTA) · docs-site.yml
docs/              README.md (knowledge-base map), HOW_IT_WORKS, INSTALL, SECURITY
design/            ROADMAP.md (the plan) + per-feature specs (e.g. RECIPES.md)
DEVELOPING.md      build/sign/self-host (developer-facing)
```
