# RPGify Habits — Developer Guide

Your practical map to the codebase. Use this when you want to add a feature,
fix a bug, or understand where a behaviour comes from. Read `docs/README.md`
first for the big picture; this doc goes deeper on *where to touch things*.

---

## Ship model — always check this first

| Change type | Ships via | What you do |
|-------------|-----------|-------------|
| Pure JS/CSS under `www/` | **OTA** (no reinstall) | Push to dev branch → `web-ota.yml` publishes the bundle; the installed app prompts the user. |
| New native Android capability | **New APK** | Edit Java in `android/`, bump `versionCode` in `build.gradle`, run `android.yml` manually. |
| New web bundle that needs new native | **Both** | Bump `minNative` in `www/ota.json` so older APKs don't receive the bundle until they upgrade. |

Default rule: **try OTA first**. If you can implement it in JS without touching
Java, it ships to existing users without a reinstall.

---

## File map — what each file owns

### Core game logic (`www/js/`)

| File | What it owns | Key exports |
|------|--------------|-------------|
| `game.js` | State shape, CRUD for habits, XP, level-up, migrate. **All state mutations go here.** | `defaultState`, `completeHabit`, `addHabit`, `updateHabit`, `deleteHabit`, `migrate`, `SCHEMA_VERSION` |
| `attributes.js` | Six fixed attributes (str/mag/vit/spr/lck/spd), character sheet computation, overall condition. | `ATTRIBUTES`, `ATTR`, `characterSheet`, `overallCondition`, `engagedStatIds` |
| `leveling.js` | XP → level curves. Pure math, no state. | `levelFromXp`, `xpForLevel` |
| `cadence.js` | Cadence types (daily/weekly/etc.), period durations, due-time logic. | `CADENCE_TYPES`, `isDue`, `dueAt`, `periodMs` |
| `condition.js` | Decay — derived from timestamps, **never stored as a counter**. `refreshConditions` recomputes everything from habits + timestamps. | `habitHealth`, `statCondition`, `refreshConditions`, `overallCondition` |
| `skilltree.js` | Self-authored mastery nodes, Growth Points currency, eligibility, unlock logic. | `addNode`, `updateNode`, `deleteNode`, `unlockNode`, `eligibleNodes`, `growthInfo`, `practiceCount` |
| `spirit.js` | Doomscroll → Spirit scoring. All scoring is here so it's OTA-tunable. **`SPIRIT_TUNING` is the single place to tune numbers.** | `applyLedger`, `sessionOutcome`, `spiritWear`, `SPIRIT_TUNING`, `defaultSpiritTrack` |
| `doomscroll.js` | Native plugin bridge + pure session/copy/ledger logic. Detection is split: native records facts; JS scores them. | `syncUsage`, `startMonitoring`, `readUsageEvents`, `usageStats`, `statsSummaryLine`, `sessionLine`, `watchedSessions`, `sanitizeConfig` |
| `notifications.js` | Local reminders — scheduling, spacing, test fire. | `rescheduleAll`, `ensurePermission`, `fireWaterNudge`, `firePostureNudge` |
| `ota.js` | Over-the-air update check/apply. Pure decision logic (`shouldApply`) is unit-tested. | `checkForUpdate`, `applyUpdate`, `shouldApply`, `describeStatus` |
| `store.js` | Thin wrapper: Capacitor Preferences on Android, localStorage on web. | `loadState`, `saveState` |
| `pedometer.js` | Step counter — native TYPE_STEP_COUNTER or manual fallback. | `stepsToday`, `addManualSteps`, `hasSensor`, `refreshSteps` |
| `items.js` + `equipment.js` | Cosmetic loot table, drop rolls, gear slots. No stat effects — cosmetic only. | `rollLoot`, `RARITY`, `equipItem`, `unequipSlot` |
| `recipes.js` | Curated quest/mastery starting points per stat. Editable, not prescriptive. | `QUEST_RECIPES`, `MASTERY_RECIPES`, `recipeToHabit`, `recipeToNodeSpecs` |
| `sprites.js` | Procedural hero SVG: wanderer → your growth path's archetype (druid/scholar/ranger) → imp → slime, based on level + condition + `state.settings.path`. | `heroSpriteSvg`, `heroTierName` |
| `util.js` | Tiny shared utilities: `uid`, `esc`, `clamp`, `dayKey`, `DAY_MS`, `fmtRelative`. |
| `backup.js` | Export/import state JSON. | `exportState`, `parseImport` |

### Orchestration and rendering (`www/js/`)

| File | What it owns |
|------|--------------|
| `app.js` | **The orchestrator.** Owns `state`, `ctx` (the object every view receives), routing, all reward beats (`flashBeat`, `debuffBeat`, `playBeats`), doomscroll drain loop (`drainDoomscroll`), OTA check, walkthrough trigger, adaptive Sentinel suggestion. |
| `views.js` | **All five screens + shared modals.** Pure render-on-demand: each call sets `container.innerHTML` then wires listeners. No state mutations — calls `ctx.*` instead. |

### Native Android (`android/app/src/main/java/com/rpgifyhabits/app/`)

| File | What it owns |
|------|--------------|
| `DoomscrollPlugin.java` | Capacitor bridge: `syncUsage`, `startMonitoring`, `stopMonitoring`, `isMonitoring`, `readEvents`, `hasUsageAccess`, `probe`, `fireTestAlert`, `resetCursor` (dev), `injectSession` (dev). |
| `DoomscrollUtil.java` | Shared helpers: config persistence, **`syncSessions`** (session reconstruction from UsageStats with gap-merging), ledger append/read, alert notification post. Used by both paths. |
| `DoomscrollService.java` | Sentinel foreground service: polls UsageStats, calls `syncSessions`, arms one-shot timer for threshold crossing, fires live nudge. |
| `StepCounterPlugin.java` | Capacitor bridge for `TYPE_STEP_COUNTER` sensor. |

---

## The `ctx` object

Every view receives `ctx`. It's your interface to everything — never import
`state` or mutation functions directly in views:

```
ctx.state          — the live state object (read-only in views; mutations via ctx calls)
ctx.save()         — refreshConditions + saveState
ctx.render()       — re-render the current route
ctx.go(route)      — navigate (routes: 'dashboard', 'habits', 'tree', 'bag', 'settings')
ctx.toast(msg)     — brief toast message
ctx.floatXp(txt,x,y) — floating XP label
ctx.reward({levelUps, loot}) — play the level-up / loot beats
ctx.flashBeat({title,line,color,icon,link}, onDone) — JRPG flash overlay
ctx.debuffBeat({title,line,link}, onDone)           — muted setback overlay
ctx.drainDoomscroll()  — syncUsage + applyLedger + Spirit beats
ctx.syncSteps()        — refresh pedometer + auto-complete step habits
ctx.openWalkthrough()  — re-open the first-run walkthrough
ctx.openUsageStats()   — open the session history modal
ctx.reschedule()       — reschedule all local notifications
ctx.replaceState(next) — replace the entire state object (used by import)
```

`link` on beats: `{ text: 'LABEL', action: () => ... }` — renders a small
tap-through button on the overlay that calls `action()` then dismisses.

---

## State shape (abbreviated)

```js
state = {
  version: 4,               // SCHEMA_VERSION — bump when migrate() changes shape
  stats: {                  // keyed by attr id (str/mag/vit/spr/lck/spd)
    str: { id, name, color, xp, condition, healthySince }
  },
  habits: {                 // keyed by uid
    <uid>: { id, name, attribute, cadence, source, xpReward, lastCompleted, ... }
  },
  tree: { nodes: { <uid>: { ... } } },  // mastery nodes
  growth: { points, cap, lastGrantedDay },
  spiritTrack: {            // doomscroll → Spirit state
    xp, wear, wearAt, lastSeq, capXp, capDay
  },
  inventory: [ { id, name, rarity, ... } ],
  equipment: { head, body, ... },
  reminders: {},
  settings: {
    activeHours: { start, end },
    general: {
      water: { enabled, perHour },
      posture: { enabled, perHour },
    },
    doomscroll: {
      enabled, path,        // path: 'oracle' | 'sentinel'
      apps: [ { package, label, thresholdMin } ],
      retrigger: { mode, everyMin },
    },
    onboarded: true,        // set after walkthrough
    devMode: false,
  },
  meta: {
    lastCheckIn,
    dsPrompt: { binges, gains, dismissed, lastTs },  // adaptive Sentinel suggestion
  },
}
```

`migrate()` in `game.js` upgrades older saved states — add a `SCHEMA_VERSION`
bump and a migration step there whenever you add required state fields.

---

## Adding a new feature — entry points by area

### New quest field or behaviour
- **State shape**: add the field to `defaultState()` and `migrate()` in `game.js`.
- **Completion logic**: edit `completeHabit()` in `game.js`.
- **UI**: add to the habit editor form in `views.js` (`habitEditor` function).
- **Tests**: add cases to `scripts/test.js`.

### New attribute effect or derived stat
- `attributes.js` — add to `characterSheet()` or `scoreOf()`.
- If it needs a new stat, add to `ATTRIBUTES` array; that's the single source.

### New decay behaviour / Inn modes
- `condition.js` — `habitHealth()` computes one habit's health; `statCondition()`
  aggregates per stat; `refreshConditions()` is called before every save/render.
- To freeze decay: check an `state.settings.inn` flag inside `habitHealth()`.
- To weight toward Vitality: adjust stat-level decay in `statCondition()`.
- State flag: add to `defaultState().settings` + `migrate()`.

### New mastery node type
- `skilltree.js` — node eligibility is in `eligibleNodes()`; effects in
  `activeEffects()`; unlocking in `unlockNode()`.

### New native capability (needs APK)
1. Write a Java `@PluginMethod` in `DoomscrollPlugin.java` (or a new plugin file).
2. Register in `MainActivity.java` if a new plugin file.
3. Write a JS bridge function in the appropriate `www/js/` module.
4. Bump `versionCode` in `android/app/build.gradle`.
5. If the new web JS requires this capability, bump `minNative` in `www/ota.json`.

### New screen / tab
- Add a render function `renderX(container, ctx)` to `views.js` and export it.
- Add to `ROUTES` in `app.js` and add a tab button in `index.html`.

### New Spirit/doomscroll tuning
- Change numbers in `SPIRIT_TUNING` in `spirit.js` only — ships OTA.
- Never hardcode thresholds in other files.

### New growth path / archetype (onboarding quiz)
- `recipes.js` — add an entry to `GROWTH_PATHS` (id, name, archetype, statIds,
  tagline), a case in `PATH_STARTERS` (3 quest recipe ids + 1 mastery recipe
  id whose first ordered node has no parents), and a bucket in `pathFromQuiz`'s
  `OPTION_PATH` map if you're adding a 4th quiz answer column.
- `sprites.js` — add the matching builder function + `PATH_TO_TIER` entry so
  the hero actually renders as the new archetype.
- `views.js` — the quiz UI (`showWalkthrough`) reads `GROWTH_PATHS`/
  `pathFromQuiz`/`starterLoadout` directly; no changes needed there for a new
  path beyond wiring the two files above.

### Inn / rest modes (your next feature)
Key files to touch:
1. **`game.js`**: add `state.settings.inn = { active: false, mode: null, since: null }` to `defaultState()` and `migrate()`. Add `checkInInn(state, mode)` / `checkOutInn(state)` mutation functions.
2. **`condition.js`**: in `habitHealth()`, check `state.settings.inn.active` — freeze or reduce decay rate. The exact hook is the `grace` / `DECAY_PERIODS` constants at the top of the function.
3. **`views.js`**: add an Inn UI section to the settings screen (`renderSettings`) or as a modal. Wire it to call `ctx.save()` + `ctx.render()`.
4. **`notifications.js`** (optional): suppress strenuous-quest reminders in Holiday mode.
5. No native changes needed — pure JS, ships OTA.

---

## Testing

```bash
npm test                  # pure logic unit tests (game, decay, mastery, spirit, OTA)
node scripts/smoke.mjs    # headless-Chromium end-to-end (full game loop + walkthrough)
```

New logic should have `npm test` coverage in `scripts/test.js`. Add a section
with the module name as a comment header. The pattern is `assert(condition, msg)`.

Native Java is not compiled in this environment — verify via the CI build
(`android.yml`, manually triggered from Actions).

---

## The dev panel

Tap the version/status line in Config 5× to unlock. Useful tools:

| Button | What it does |
|--------|--------------|
| SIM RESTRAINT / SIM BINGE | Inject Spirit XP / wear directly (bypass daily cap) |
| INJECT GAIN / BINGE SESSION | Write a fake ledger session + drain scoring (Spirit beat fires) |
| FORCE SYNC | Replay real Usage Stats now (same as closing + reopening app) |
| RESET CURSOR | Clear native KEY_LAST_SYNC — next sync replays 24 h from scratch |
| REFRESH DIAGNOSTICS | Shows build, Spirit state, and last 5 ledger sessions with durations |

The last two buttons (`resetCursor`, `injectSession`) require the new APK
(versionCode 4); the others work via OTA.

---

## Common gotchas

- **Never store decay as a counter.** Condition is always recomputed from
  `habit.lastCompleted` + current time. A stored counter would drift if the user
  skips the app for weeks.
- **Don't touch `SCHEMA_VERSION` unless you add a `migrate()` step.** The number
  alone does nothing; only the migration function changes saved data.
- **`minNative` is set by hand**, not auto-derived. Only bump it when a web
  change truly needs a new native capability. Default: leave it alone.
- **`ctx.save()` calls `refreshConditions(state)` for you** — don't call it
  separately before saving.
- **OTA bundle channel** is `dev` on the dev branch, `stable` on main. The
  installed APK's `ota.json` records which channel it watches; don't change the
  channel without understanding `web-ota.yml`.
- **`sessionOutcome()` in `spirit.js`** classifies a single ledger event as
  `'gain'` / `'binge'` / `null` (neutral). All Spirit scoring goes through this
  one function. The numbers it reads from are in `SPIRIT_TUNING`.
- **Gap-merging in `syncSessions`** (`DoomscrollUtil.java`): brief foreground
  breaks (keyboard, system UI, permission dialogs) are folded into the continuous
  session if the gap is under `SESSION_GAP_MIN` (1 min). This prevents keyboard
  appearances from fragmenting a 30-minute session into many 1-minute rows.
