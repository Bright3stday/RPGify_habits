# RPGify Habits

An **offline-first habit & skill-building system framed as an RPG**. Habits feed
XP into stats; stats level up and unlock a branching skill tree. Neglected
habits visibly **decay** — so lapsing has a felt cost, not just a silent absence
of reward.

It is designed around one behavioural problem: people start habits with
discipline but go complacent once the original pain fades. Two mechanisms fight
that:

1. **Growth framing** — visible XP, level-ups, and skill-tree progress reward
   continued effort (the big `LEVEL UP!` / `SKILL UNLOCKED!` beats).
2. **Decay framing (loss aversion)** — a stat's *condition* drops when the
   habits feeding it are neglected, shown as fading/desaturated pixel panels.

Built as a plain HTML/CSS/JS web app (no framework) and wrapped with
**Capacitor** into an installable Android app. Runs **fully offline** — no
backend, no accounts, no sync. All data lives on-device; all reminders are
scheduled locally.

<!-- screens: Status · Quests · Skill tree · Config -->

---

## Screens

| Screen | What it does |
|--------|--------------|
| **Status** (dashboard) | Every stat at a glance — level, segmented XP bar, condition badge (`STEADY` / `FADING` / `CRACKED` / `BROKEN`), plus today's due quests. |
| **Quests** (habits) | Add / edit / retire habits. Set cadence (daily / every N days / weekly), XP per completion, and which stat(s) each feeds. |
| **Skills** | The branching skill tree, one diamond per stat. Tap a glowing node to unlock. |
| **Config** | Define your own stats, configure reminders (weekly check-in + water/posture nudges), and export/import your save. |

---

## Design notes

### Decay is derived, never stored
A stat's condition is **recomputed from timestamps** every time the app opens
(`www/js/condition.js`), never persisted as a ticking counter. That matters for
an offline app: whether you return after an hour or three weeks, decay reflects
exactly the real neglect — no background job, no drift.

Health is measured **in units of each habit's own cadence**, so a lapsed *weekly*
habit does not rot as fast (in real time) as a lapsed *daily* one. Each habit
gets one full grace period, then its stat's condition falls to zero over the
next three periods.

### Leveling
A slightly super-linear curve (`www/js/leveling.js`): cumulative XP to reach
level *L* is `50·L·(L−1)` — early levels come fast (early wins are the hook),
later ones ask for more.

### Skill tree — branching, with real choices
Stats are user-defined, so the tree can't be hand-authored. Instead each stat
grows the same **diamond** shape (`www/js/skilltree.js`):

```
        Novice
       /      \
   Power     Steadfast     <- MUTUALLY EXCLUSIVE: pick one, the other locks
       \      /
        Master
```

The two middle nodes are an exclusive choice, so progression is a decision, not
a checklist. The Steadfast branch and the Master capstone are gated on
**sustained** engagement (days a stat has stayed above 70% condition), not just
accumulated XP — the tree rewards *consistency*, not just total effort.

---

## Project layout

```
www/                     the web app (this is what Capacitor wraps)
  index.html
  styles/main.css        8-bit / JRPG theme
  assets/fonts/          Press Start 2P, bundled for true offline use
  js/
    store.js             storage: Capacitor Preferences native / localStorage web
    game.js              engine: state, habit CRUD, completion, XP + level-ups
    condition.js         cadence-aware decay / stat condition
    leveling.js          XP -> level curve
    cadence.js           cadence periods & due timing
    skilltree.js         branching tree generation + unlock logic
    notifications.js     local notifications (native) / no-op (web)
    backup.js            JSON export/import
    views.js             the four screens + editor modals
    app.js               orchestrator: routing, persistence, reward beats
android/                 generated Capacitor Android project (build in Studio)
scripts/                 dev server + tests (not shipped in the app)
capacitor.config.json
```

---

## Develop & test (web)

```bash
npm install
npm run serve          # http://localhost:5173
npm test               # 11 dependency-free logic tests
node scripts/smoke.mjs # headless-browser end-to-end smoke test
```

> On plain web, storage falls back to `localStorage` and reminders are a no-op
> (browsers can't reliably fire scheduled local notifications without a service
> worker). Everything else — the full game loop — runs in the browser.

---

## Build the Android app

The `android/` Capacitor project is committed and ready. You need:

- **JDK 17+**
- **Android Studio** (or the Android command-line SDK) with an SDK platform +
  build-tools installed

Then either open `android/` in Android Studio and press **Run**, or from the CLI:

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug          # -> android/app/build/outputs/apk/debug/app-debug.apk
```

After changing anything in `www/`, re-run `npx cap sync android` to copy the web
assets into the native project.

> **Note:** the APK was *not* compiled in the authoring environment — it has no
> Android SDK provisioned and `dl.google.com` is blocked there, so the SDK can't
> be fetched. The Capacitor project is complete and builds normally in Android
> Studio / any machine with the SDK.

### Notifications on device
The Local Notifications plugin merges the needed permissions
(`POST_NOTIFICATIONS`, boot receiver, etc.) at build time. On Android 13+ the
app requests notification permission the first time you tap **APPLY REMINDERS**
in Config.

---

## Data & privacy

- 100% on-device. No network calls, no analytics, no accounts.
- **Export** writes a JSON backup (native share sheet, or a browser download on
  web). **Import** replaces your save from such a file. This is the only way
  data leaves or enters the app — there is no automatic sync.

---

## Non-goals

No backend, no accounts, no cross-device sync · no cap on active habits · no
forced daily cadence (it's per-habit) · no server push — all reminders are
local, on-device.
