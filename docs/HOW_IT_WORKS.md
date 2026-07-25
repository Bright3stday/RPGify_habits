# RPGify Habits — How It Actually Works

A plain-English, example-driven tour of every system, and *exactly* what each
number/threshold reads from — a deeper companion to the Overview.

The one sentence version: **you do real habits → they pour XP into six fixed
attributes → your attributes drive a character level, derived stats, and a hero
sprite → you spend a scarce time-granted currency to unlock self-authored
"mastery" milestones. Neglect makes attributes visibly decay.**

---

## 1. Quests (habits) — the only thing you log

A **quest** is a habit. You tap to complete it (or it auto-completes from steps).
Each quest has:

- a **cadence** (daily / every N days / weekly) — controls when it's "due" and
  how fast its decay bites,
- an **XP per completion**,
- and **which attribute(s) it trains** (one or more of the six).

That last one — "trains attribute X" — is the *only* connection between a quest
and the rest of the game. A quest named "Bench press" that trains **Strength**
is, to the engine, just "+XP to Strength, +1 Strength completion." **The name is
never read by any logic.** Rename it freely.

Completing a quest does four things:
1. adds XP to each attribute it trains,
2. increments that quest's lifetime **completion counter** (uncapped),
3. resets that quest's decay clock, bumps its streak,
4. rolls for cosmetic loot.

---

## 2. Attributes & the character sheet

Six **fixed** attributes (you can't add/remove them): **Strength, Magic,
Vitality, Spirit, Luck, Speed**. Each accumulates XP from the quests that train
it.

- **Score** (the number on the Status screen, e.g. "Strength 13") grows
  *permanently* from XP — you never lose it. Formula: `8 + attribute level`,
  where level comes from the XP curve.
- **Character Level** comes from the **sum of all six attributes' XP** (a
  steeper curve). It drives:
  - **Derived stats**: Attack = STR·2 + Lv, Magic Attack = MAG·2 + Lv,
    Defense = VIT + Lv/2, Magic Defense = SPR + Lv/2, Speed = SPD, Luck = LCK.
  - **HP** (from Vitality), **MP** (from Magic/Spirit).
- **GP** on the sheet = your **Growth Points** balance (see §6).

These derived numbers are a flavourful mirror of growth — there's no combat, so
they exist to make "the numbers go up as you build habits" feel real.

---

## 3. Condition & decay — the loss-aversion half

Separate from permanent score, each attribute has a **condition** (0–100%) =
its *upkeep*. It is **derived live from the health of the quests feeding it**,
never stored as a ticking counter:

- A quest is at 100% health for one full cadence period past its due time
  (grace), then decays to 0 over the next ~3 periods.
- This is **cadence-scaled**: a lapsed *weekly* quest rots far slower (in real
  time) than a lapsed *daily* one.
- An attribute's condition = the average health of its non-retired quests.

Condition shows as a dot per attribute (`STEADY / FADING / CRACKED / BROKEN`)
and drives your hero's look (§4). Because it's recomputed from timestamps, being
away from the app for 3 weeks decays exactly as much as 3 weeks of real neglect.

Unlocking certain mastery nodes can grant **decay resistance**, which softens
(never eliminates) the drop.

---

## 4. Your hero (one sprite)

A single pixel avatar = *you*. It's chosen from two axes:

- **Character level → class:** Adventurer (1–3) → Warrior (4–6) → Knight (7–10)
  → Mage (11+).
- **Overall condition → devolution:** if the *average* condition across all six
  attributes goes cracked → **Imp**, or broken → **Slime**. A worn-but-not-broken
  hero just looks desaturated.

So: do your habits and your class climbs; neglect everything and your leveled-up
hero visibly melts into a slime.

---

## 5. The Mastery Tree (read this carefully — it answers the common questions)

This is the self-authored progression layer. **You** create the nodes.

### What a node is

Each node lives in **one attribute-tree** (you pick Strength / Magic / … when
creating it). A node has:

| Field | What it does |
|-------|--------------|
| **Title** | A label. **Purely cosmetic — never matched against anything.** |
| **Criteria** | Free text: what "cleared" means *to you*. The app never checks it; it's your honesty prompt. |
| **Eligibility threshold** | Either **Attribute level ≥ N**, or **Practice count ≥ N**. |
| **Depends on** (optional) | Other **nodes** in the same tree that must be unlocked first — "all of them" or "any N of them". |
| **Reward** (optional) | +X% XP to that attribute, or +Y% decay resistance, applied once unlocked. |

### What "practice count" actually counts

> **Practice = the sum of lifetime completions of *every* quest that trains this
> node's attribute.** It has **nothing to do with names.**

Example: your **Strength** tree. You have three Strength quests — "Gym"
(done 8×), "Run" (done 5×), "Push-ups" (done 2×). The Strength practice count is
**8 + 5 + 2 = 15**. A Strength node with "Practice ≥ 15" is now eligible. It did
not need to be named "Gym" or match any quest — it just watches the whole
Strength attribute.

(Completions are counted for retired quests too, so retiring a quest doesn't
erase the practice you already banked.)

### The lifecycle: locked → eligible → unlocked

1. **locked** — threshold not met, or its parent nodes aren't unlocked yet.
2. **eligible** — threshold met **and** parents satisfied. Now it *offers* an
   unlock, but nothing happens automatically.
3. **unlocked** — you tick **"I genuinely met this"** *and* spend **1 Growth
   Point**. Eligibility alone is never enough — the point + your honest
   confirmation are the real gate.

### An overarching node that depends on a few milestones

The engine has **no "require these 3 specific quests" gate**. A node's own
trigger is only *attribute level* or *attribute-wide practice*. Specific
prerequisites are expressed **node-to-node**, not node-to-quest. There are two
ways to build this:

**Pattern A — parent nodes (recommended for "depends on a few things").**
Make a small node for each milestone, then a general node that requires them:

```
Strength tree:
  ● "Consistency"   practice ≥ 20     (aggregate Strength reps)
  ● "Heavy lifts"   Strength level ≥ 6
  ◆ "Strength Base" depends on: ALL of [Consistency, Heavy lifts]
                    (its own threshold can be trivial, e.g. level ≥ 1)
```

"Strength Base" only becomes eligible once *both* parents are unlocked. Use
**"any N of them"** instead of "all" for non-linear gates — e.g. a capstone that
needs "any 2 of 3" sub-paths.

**Pattern B — a single aggregate threshold.**
If "a few quests being done" really just means "you've put in the reps across
this domain," skip parents and set one **Practice ≥ N** threshold. It already
sums all quests in that attribute.

**What isn't supported (yet):** gating a node on one *named* quest hitting a
count (e.g. "Meditate specifically, 30 times"), independent of other Spirit
quests. Practice is per-attribute, not per-quest. A per-quest ("specific quest
≥ N") threshold type is a possible future addition.

### Cross-tree trade-off

When several nodes across *different* trees are eligible at once, you usually
can't afford them all (points are scarce). Choosing where the point goes is the
intended mechanic, not a limitation.

---

## 6. Growth Points (the unlock currency)

- You're granted a small fixed number **per period** — default **3 / week**
  (switchable to monthly, and the amount is editable in Config).
- They **roll over** but are **capped at 2× one period's grant** (default cap 6):
  a busy week isn't punished, but you can't hoard forever.
- Points accrue automatically when you open the app (it back-fills any periods
  you missed, up to the cap).
- Spending **1 point** is what converts an *eligible* node to *unlocked*.

That's the whole loop: **real habits → attribute growth makes nodes eligible →
scarce weekly points force you to choose which mastery to actually claim.**

---

## 7. Loot & gear — cosmetic only

Every quest completion has a chance to **drop loot** (weapons/armour/treasure/
potions, five rarities). Longer streaks and a higher **Luck** attribute improve
your odds. Loot collects in the **Bag**, and you can **equip** it into five slots
to change how your hero looks.

**Gear grants zero stat bonuses.** It's collection + customization. All real
power comes from habits → levels → mastery nodes, by design — the focus is real
growth, not item min-maxing.

---

## 8. Steps (auto-quests)

A quest can be **"auto (steps)"** instead of tap-to-log: it has a daily step
goal and **auto-completes the moment you hit it** (awards XP, resets decay),
once per day.

- On **Android**, steps come from the phone's hardware pedometer
  (`TYPE_STEP_COUNTER`), read live while the app is open; a per-day baseline
  converts "steps since boot" into "steps today," handling reboots.
- On the **web preview** (no sensor), you log steps manually with the +/SET
  buttons.

The seeded "Daily Steps" quest trains **Strength**; you can retarget it.

---

## 9. Reminders (local, on-device)

Three kinds, all fired by Android's local-notifications (no server):

- **Weekly check-in** — prompts you to review/keep/adjust/retire quests.
- **Water / posture nudges** — fire at a **random minute inside each active
  hour**, but now **evenly spread** so 2/hour won't land a minute apart (buckets
  the hour and jitters within each, ≥ several minutes apart).
- A **🔔 TEST (5s)** button in Config fires one immediately so you can confirm
  permission + the notification channel work (a missing channel was silently
  eating notifications before — now created explicitly).

Reminders schedule for the next few days each time you press APPLY.

---

## 10. Doomscroll reflection alert

Opt-in, and deliberately *distinct from* Android's Digital Wellbeing (which does
daily limits + hard blocking). This is a **per-continuous-session awareness**
layer: you pick apps (e.g. Instagram) and a threshold (e.g. 20 min); when you've
been in that app that long *in one sitting*, a notification only **observes** —
"28 minutes on Instagram" — never instructs, scolds, or blocks. No red styling.

- **Detection is event-driven** via an **AccessibilityService**
  (`DoomscrollAccessibilityService`): once you enable it under Settings →
  Accessibility, the OS *pushes* foreground-app changes — real-time, no polling
  loop, no persistent notification, low battery. It reads only *which* app is in
  front (`canRetrieveWindowContent=false`), never screen content, and only for
  the apps you chose. (The zero-poll *usage-session observer* API needs a
  privileged permission a normal app can't hold; the old UsageStats
  foreground-service poll remains in the tree as a dormant fallback.)
- **Dumb native, smart JS.** The service only *records raw facts* to a session
  ledger; **all scoring lives in JS**, so the mechanic is tunable over-the-air
  without a new APK. The ledger captures each session (app, start, end, duration,
  whether the nudge fired, and how soon you left after it) — rich enough to also
  power a future "total usage over time" view.
- **Tied to Spirit (transparent, tunable).** Scoring is pure JS
  (`www/js/spirit.js`), drained from the ledger on app open/resume:
  - **Restraint → Spirit XP.** Leaving a watched app within ~90s of the nudge
    grants Spirit XP, **capped per day** (default 18) so it can't be farmed by
    open/close spam.
  - **Bingeing → Spirit wear.** Staying well past the nudge (default 5 min) adds
    capped wear (≤ 0.6) to Spirit's *condition* — never a hard break. Wear
    **self-heals** (half-life ~2 days) **and each completed quest burns some
    down**, so doing real habits is what clears doomscroll fatigue.
  - **Feedback:** when you return to the app it plays an animated **reward beat**
    ("SPIRIT +6" / "SPIRIT WEARS"); the Status screen shows an explicit **fatigue
    chip** (😵‍💫 N%) on the Spirit row while worn (a single binge's dip can hide
    inside the condition bucket); and Config shows the running SPIRIT IMPACT line.
    All magnitudes live in `SPIRIT_TUNING` and ship over-the-air.
- **Per session:** switching away (including to the launcher) resets it.
- **Retrigger** is configurable: once per session, or every N further minutes.
- **YouTube caveat:** the foreground signal can't tell Shorts from long-form, so
  give YouTube a long threshold or leave it off.
- **Transparency + diagnostics** (Config → Doomscroll): a *Recently detected*
  panel lists the sessions the detector logged (so you can verify it on-device);
  *Test alert* posts a sample notice.
- **Not** a limiter/blocker — that's what Digital Wellbeing is for. This never
  restricts, only reflects and scores.

---

## 11. Data, privacy, offline

100% on-device. No accounts, no server, no analytics. Your save lives in local
storage (Capacitor Preferences on device, localStorage on web). **Export**
writes a JSON backup you can save/share; **Import** replaces your save from one.
That's the only way data leaves or enters the app.

---

## 12. Updates — OTA (web) & APK (native)

There are two kinds of change, and they reach your phone differently:

- **Web changes** (screens, game logic, text — anything in `www/`) ship
  **over-the-air**. On every launch the app checks a small manifest on GitHub
  Pages; if a newer web bundle is published and your installed APK is new enough
  to run it, the app **prompts you** — showing the version and a short "what's
  new" — and downloads/installs it **only if you tap UPDATE NOW** (a brief
  restart). Choosing **LATER** snoozes that build until a newer one appears. You
  can also pull anytime via **CHECK FOR UPDATES** in **Config → APP UPDATES**.
  Nothing is ever downloaded or applied without your consent. No APK download.
- **Native changes** (step counter, doomscroll detector, a new plugin, icon,
  permissions) need a **new APK** — downloaded from the project site (the same
  place the app first came from), which installs over the old one and keeps your
  data.

**How it stays consistent:** every build has a number = `git rev-list --count
HEAD` (commit count), stamped into both the APK's baked-in `www/ota.json` and
each published `updates/latest.json`. The app runs whichever is newer — the APK's
baked-in build or the last OTA bundle it applied. Each web bundle also records
the minimum native `versionCode` it needs; if your APK is older, the app declines
the web update and tells you to grab a new APK, so it can never half-update into
a broken state. Full setup and mechanics: `docs/INSTALL_AND_UPDATE.md`.

The pure decision (`shouldApply`) is unit-tested in `scripts/test.js`; the
consent prompt (`showUpdatePrompt`) and download/apply glue (`applyUpdate`) run
only inside the installed Android app (no-op on web). `checkForUpdate` only
detects — it never downloads.

---

## 13. Where things live (quick map)

```
www/
  ota.json        baked-in OTA baseline { build, channel } (CI-stamped)
  js/
    game.js         completion, XP, migration, default state
    attributes.js   the six attributes, character level, derived stats
    condition.js    cadence-aware decay / attribute condition
    skilltree.js    mastery nodes + Growth Points  ← §5, §6
    sprites.js      the single hero sprite
    items.js        loot table + drop rolls
    equipment.js    cosmetic gear slots
    pedometer.js    steps source
    notifications.js reminders (spacing, test, channel)
    doomscroll.js   doomscroll session/threshold/copy logic + native bridge
    ota.js          OTA update check/apply + native updater bridge  ← §12
    views.js        all screens
scripts/
  ota-stamp.mjs   CI helper: stamps build number + channel into ota.json/manifest
.github/workflows/
  android.yml     builds/signs the APK, publishes it to GitHub Pages
  web-ota.yml     publishes web bundles to GitHub Pages for OTA
android/app/src/main/java/com/rpgifyhabits/app/
  StepCounterPlugin.java   pedometer bridge
  DoomscrollService.java   usage-stats polling + precise-fire scheduling
  DoomscrollPlugin.java    doomscroll bridge (probe / test / start / stop)
  DoomscrollUtil.java      shared: session read + alert notification
```

Pure logic (levels, decay, mastery eligibility, growth points, doomscroll
timing, reminder spacing) is unit-tested in `scripts/test.js`; the UI loop is
covered by `scripts/smoke.mjs`. Native code (pedometer, doomscroll service)
can't be compiled in the authoring environment — it's written to the Android
APIs and verified on-device.
