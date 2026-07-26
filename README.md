# RPGify Habits

An **offline-first habit tracker framed as a Final Fantasy character sheet**.
Real-life habits train six primary attributes (Strength, Magic, Vitality,
Spirit, Luck, Speed); those raise your **character level**, derived stats
(Attack, Defense, HP, MP…). You spend time-granted **Growth Points** on a
self-authored **mastery tree**. You are a single hero who levels up by doing
beneficial things — and
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
| **Status** | The character sheet: your hero sprite, Level + EXP, HP/MP/GP, the six primary attributes (each with an upkeep dot), and derived stats (Attack, Magic Attack, Defense, Magic Defense…). Plus today's steps and due quests. |
| **Quests** (habits) | Add / edit / retire habits. Set cadence (daily / every N days / weekly), XP per completion, and which attribute(s) each trains. |
| **Skills** | Your Growth Points balance + a mastery tree per attribute. Author nodes with your own "cleared" criteria, dependency edges, and optional rewards; when a node is eligible, confirm it and spend a point to unlock. |
| **Bag** | Your hero + cosmetic gear slots, and the loot collected from completions. Tap gear to equip (looks only — no bonuses). |
| **Config** | The (fixed) attribute list, reminders (weekly check-in + water/posture nudges), doomscroll mirror, Growth Point settings, **app updates** (OTA check), and export/import your save. |

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
from VIT, MP from MAG/SPR, etc. (Unlocking mastery is gated by time-granted
Growth Points, not by character level — see below.)

### One hero, who levels and devolves
A single hero sprite (`www/js/sprites.js`) — *you* — driven by character level
and overall condition, not one-per-attribute:

```
character level 1-3  -> Wanderer  (base traveler, every path starts here)
character level 4+   -> your chosen growth path's archetype:
                          The Anchor    -> Druid    (earthy greens/browns)
                          The Architect -> Scholar  (clean blues/whites)
                          The Catalyst  -> Ranger   (practical greys/leathers)
overall condition worn    -> the current archetype, desaturated (early warning)
overall condition cracked -> Imp   (devolved into a lesser monster)
overall condition broken  -> Slime (your hero literally melts into goo)
```

The growth path is set by a short diagnostic quiz on first run (or picked up
from whichever stats you've trained most, if you skipped it) — see
`www/js/recipes.js` (`GROWTH_PATHS`, `pathFromQuiz`). Do your habits and your
hero grows into that archetype; neglect them and it devolves toward a slime —
the loss-aversion thesis made literal. Drawn procedurally as inline SVG (no
image assets).

### Steps
A habit can be **auto (steps)** instead of tap-to-log: it carries a daily step
goal and **auto-completes the moment you hit it** (awarding XP, resetting decay),
at most once per day. On Android, steps read straight from the hardware
pedometer (`www/js/pedometer.js` ⇄ `StepCounterPlugin.java`, `TYPE_STEP_COUNTER`)
and the app polls live while open, so goals complete on their own; with no
sensor (web) you log them manually.

### Doomscroll reflection layer
A deliberately **non-judgemental**, **per-continuous-session** awareness layer —
intentionally *distinct* from Android's Digital Wellbeing (which owns daily
limits + hard blocking; RPGify doesn't duplicate that). When a chosen app has been in the
foreground for one continuous sitting past your per-app threshold, it fires a
notification that only *observes* — "28 minutes on Instagram" — never instructs,
scolds, warns, or blocks. No red styling.

- **Event-driven detection** via an **AccessibilityService**
  (`DoomscrollAccessibilityService`). Once enabled under Settings → Accessibility,
  the OS *pushes* foreground-app changes — real-time, no polling loop, no
  persistent notification, low battery. It reads only *which* app is in front
  (`canRetrieveWindowContent="false"`), never screen content, and only for the
  apps you pick. (The zero-poll usage-session *observer* API needs the privileged
  `OBSERVE_APP_USAGE` permission a normal app can't hold; the older UsageStats
  foreground-service poll, `DoomscrollService.java`, stays in the tree as a
  dormant fallback.)
- **Dumb native, smart JS — so mechanics ship over-the-air.** The service only
  *records raw facts* into a session ledger (`DoomscrollUtil.appendEvent`, read
  back through the plugin's `readEvents`); **all scoring lives in JS**
  (`www/js/doomscroll.js`, unit-tested), so it's tunable via OTA without a new
  APK. Each session logs app, start, end, duration, whether the nudge fired, and
  how soon you left after it — rich enough to also power a future optional
  "total usage over time" view.
- **Tied to Spirit, transparently.** Leaving a watched app soon after the nudge
  *feeds Spirit*; bingeing past it *wears* it — the same loss-aversion loop as
  habit decay, shown plainly in Config (a *Recently detected* panel lists what the
  detector logged).
- **Per continuous session**, not cumulative-per-day: switching away (including to
  the launcher) resets it, and the next open counts fresh.
- **Retrigger** is configurable: once per session, or every N further minutes.
- **YouTube caveat**: the foreground signal can't tell Shorts from long-form, so
  give YouTube a much longer threshold (or leave it off).
- **Non-goals:** no blocking or app limits (that's Digital Wellbeing's job — this
  reflects and scores, never restricts) and no evaluative language anywhere.

### Mastery tree — self-authored, honestly confirmed (`www/js/skilltree.js`)
The tree is **yours to write**. Inside each attribute-tree you author nodes,
each with a self-defined *"cleared" criteria* (what mastery means to you, not an
app-prescribed label). A node's lifecycle:

```
locked   -> eligible : your threshold is met (attribute level OR practice count)
                       and its prerequisites are satisfied
eligible -> unlocked : you confirm you genuinely met it AND spend a Growth Point
```

Reaching eligibility is never enough on its own — the point spend (plus an
honest "I genuinely met this" toggle) is the real gate. Dependency **edges** are
optional and per-tree: a domain can be a flat list or a sequential chain, and
prerequisites can be strict AND **or** "any N of parents" (non-linear). Each
node can optionally carry a reward (+X% attribute XP, or +Y% decay resistance)
that applies once unlocked.

### Growth Points — the scarce currency (`skilltree.js`)
You earn a small fixed number of **Growth Points** per period (default **3 /
week**, configurable to monthly in Config). They **roll over** but are **capped
at 2× one period's grant**, so a busy stretch isn't punished and you can't hoard
indefinitely. Spending one point is what converts an eligible node to unlocked.
When several nodes across different trees are eligible at once, limited points
**force a choice** — that trade-off is the intended mechanic. Points accrue on
app open (`grantDue`) and show on the character sheet (GP) and the Skills header.

### Loot & gear (cosmetic)
Completing a quest can **drop treasure** (`www/js/items.js`) — FF-flavored
weapons, armour, treasure and consumables across five rarities; longer streaks
and a higher **Luck** attribute improve the odds. Drops fire a `TREASURE!` beat
and collect in the **Bag**, where you can equip weapon/armour into five slots
(`www/js/equipment.js`). Equipping is **cosmetic only** — it changes nothing
about your stats. The focus is real growth, not item min-maxing.

---

## Get it

Install straight from the project site — no app store, no account:
**https://bright3stday.github.io/RPGify_habits/** → **Download APK**. Updates then
arrive over-the-air (the app shows what's new and asks before installing). Full
steps and troubleshooting: [`docs/INSTALL_AND_UPDATE.md`](docs/INSTALL_AND_UPDATE.md).

---

## For developers

Running, building, signing, and self-hosting are in
[`DEVELOPING.md`](DEVELOPING.md). In short: a vanilla HTML/CSS/JS web app
(`www/`, unit-tested with `npm test`) wrapped by Capacitor into an Android APK.
Web changes ship over-the-air via GitHub Pages; native changes as a new APK from
the same site. No git tags, no app store.

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
