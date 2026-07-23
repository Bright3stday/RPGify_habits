# RPGify Habits

An **offline-first habit tracker framed as a Final Fantasy character sheet**.
Real-life habits train six primary attributes (Strength, Magic, Vitality,
Spirit, Luck, Speed); those raise your **character level**, derived stats
(Attack, Defense, HP, MP…), and **skill points** you spend on a branching skill
tree. You are a single hero who levels up by doing beneficial things — and
visibly **decays** (down to a slime) when you neglect them.

Power comes from **growing real habits → leveling → skills**, not from
min-maxing items: loot and gear are collected and worn purely for looks.

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
| **Status** | The character sheet: your hero sprite, Level + EXP, HP/MP/SP, the six primary attributes (each with an upkeep dot), and derived stats (Attack, Magic Attack, Defense, Magic Defense…). Plus today's steps and due quests. |
| **Quests** (habits) | Add / edit / retire habits. Set cadence (daily / every N days / weekly), XP per completion, and which attribute(s) each trains. |
| **Skills** | Skill points + a branching diamond per attribute. Power nodes boost XP; Steadfast/Master nodes grant decay resistance. Tap a glowing node to spend an SP. |
| **Bag** | Your hero + cosmetic gear slots, and the loot collected from completions. Tap gear to equip (looks only — no bonuses). |
| **Config** | The (fixed) attribute list, reminders (weekly check-in + water/posture nudges), and export/import your save. |

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

### Attributes, character level & derived stats
Six fixed primary attributes (`www/js/attributes.js`): **Strength, Magic,
Vitality, Spirit, Luck, Speed**. Each habit trains one or more of them. An
attribute's *score* grows permanently from XP (you never lose progress), while
its *condition* (upkeep) decays with neglect.

The sum of all attribute XP drives your **character level** (a steeper curve,
`www/js/leveling.js`), and everything on the status screen is derived from the
primaries + level, JRPG-style: Attack = STR·2 + Lv, Defense = VIT + Lv/2, HP
from VIT, MP from MAG/SPR, etc. Each character level grants **1 skill point**.

### One hero, who levels and devolves
A single hero sprite (`www/js/sprites.js`) — *you* — driven by character level
and overall condition, not one-per-attribute:

```
character level 1-3  -> Adventurer
character level 4-6  -> Warrior   (leather + sword)
character level 7-10 -> Knight    (plate, shield, plumed helm)
character level 11+  -> Mage      (robe, staff, arcane aura)
overall condition worn    -> the current class, desaturated (early warning)
overall condition cracked -> Imp   (devolved into a lesser monster)
overall condition broken  -> Slime (your hero literally melts into goo)
```

Do your habits and your hero climbs the class ladder; neglect them and it
devolves toward a slime — the loss-aversion thesis made literal. Drawn
procedurally as inline SVG (no image assets).

### Steps
A habit can be **auto (steps)** instead of tap-to-log: it carries a daily step
goal and **auto-completes the moment you hit it** (awarding XP, resetting decay),
at most once per day. On Android, steps read straight from the hardware
pedometer (`www/js/pedometer.js` ⇄ `StepCounterPlugin.java`, `TYPE_STEP_COUNTER`)
and the app polls live while open, so goals complete on their own; with no
sensor (web) you log them manually.

### Skill tree — where the bonuses live
One **diamond** per attribute (`www/js/skilltree.js`):

```
        Adept
       /      \
   Power     Steadfast     <- MUTUALLY EXCLUSIVE: pick one, the other locks
       \      /
        Master
```

Unlocking a node **spends a skill point** and requires attribute level +
*sustained* consistency (days above 70% condition). Power nodes grant **+XP%**
for that attribute; Steadfast/Master nodes grant **decay resistance** (applied
in `statCondition`, capped, never full immunity). This is the *only* source of
bonuses — they come from growing habits and leveling, never from items.

### Loot & gear (cosmetic)
Completing a quest can **drop treasure** (`www/js/items.js`) — FF-flavored
weapons, armour, treasure and consumables across five rarities; longer streaks
and a higher **Luck** attribute improve the odds. Drops fire a `TREASURE!` beat
and collect in the **Bag**, where you can equip weapon/armour into five slots
(`www/js/equipment.js`). Equipping is **cosmetic only** — it changes nothing
about your stats. The focus is real growth, not item min-maxing.

---

## Project layout

```
www/                     the web app (this is what Capacitor wraps)
  index.html
  styles/main.css        8-bit / JRPG theme
  assets/fonts/          Press Start 2P, bundled for true offline use
  js/
    store.js             storage: Capacitor Preferences native / localStorage web
    game.js              engine: state, habit CRUD, completion, XP, migration
    attributes.js        the six primaries, character level, derived stats
    condition.js         cadence-aware decay / attribute condition
    leveling.js          attribute + character XP -> level curves
    cadence.js           cadence periods & due timing
    skilltree.js         branching tree, skill points, XP/decay-resist bonuses
    sprites.js           the single procedural hero (adventurer..mage, imp, slime)
    items.js             loot table, drop rolls, pixel item icons
    equipment.js         cosmetic equip slots (no bonuses)
    pedometer.js         steps source: native sensor (live poll) / manual fallback
    notifications.js     local notifications (native) / no-op (web)
    backup.js            JSON export/import
    views.js             the five screens + editor modals
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

### App icon & splash
The launcher icon (a glowing 8-bit sword in the app palette), round/adaptive
variants, and the splash screen are committed under `android/app/src/main/res/`.
They're generated from a hand-drawn pixel emblem by `scripts/make-icons.mjs`
(rasterized with headless Chromium) — re-run `node scripts/make-icons.mjs` if
you tweak the emblem. `cap sync` does not touch these.

### Steps on device
The step sensor is bridged by a small committed Capacitor plugin
(`StepCounterPlugin.java`, registered in `MainActivity`) reading
`TYPE_STEP_COUNTER` — no Google Fit / Health Connect / network. It requests the
`ACTIVITY_RECOGNITION` runtime permission the first time steps are read. This
native path can only be exercised on a real device/build; the JS logic,
auto-complete, and avatar behaviour are covered by the tests above using the
manual step source.

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
