# Recipes — design spec (v1)

Design doc for the "suggested quest & mastery recipes" feature. Not published to
the docs site; a build reference. Ships **over-the-air** (pure JS + data; no
native, no schema/migration). Scoped to land complete in a single OTA update.

## Goal

Lower the blank-page barrier. A self-authored quest/mastery system is great for
accountability but hard to start from scratch — most people can't invent a good
"Strength mastery path" cold. Recipes are **curated, editable starting points**
per stat that a user can browse and add, then make their own.

## Principles (keep the ethos)

- Recipes are *suggestions, not prescriptions*. Anything added becomes a normal,
  fully-editable quest/node the user owns (edit, retire, delete like any other).
- **Curated and small** — quality over quantity (~4–6 quest recipes + 2–3 mastery
  recipes per stat). Don't overwhelm.
- **Practical first**, light RPG flavour. Real-world activities that plausibly
  train the stat.
- **No new state schema.** Adding a recipe uses the existing `addHabit` /
  `addNode`. No migration.
- **Route through the editor**, don't inject silently — Add pre-fills the normal
  editor so the user reviews/tweaks before saving. It stays "authored."

## Data model — `www/js/recipes.js` (new)

Exports a catalog plus two pure mapping helpers (unit-tested).

### Quest recipe
```js
{
  id: 'str-strength-training',
  statIds: ['str'],               // one or more of str|mag|vit|spr|lck|spd
  title: 'Strength training',
  description: 'Gym session or a bodyweight workout.',
  cadence: { type: 'daily' },     // | { type:'everyN', n:2 } | { type:'weekly' }
  xpPerCompletion: 30,
  source: 'manual',               // or 'steps' (then include stepGoal)
  stepGoal: 8000,                 // only for source:'steps'
  why: 'Progressive resistance builds Strength.'   // one-line rationale in preview
}
```

### Mastery recipe (single node OR a small path)
```js
{
  id: 'str-foundations',
  statId: 'str',
  title: 'Strength Foundations',
  nodes: [
    { key: 'consistency', title: 'Consistency',
      criteria: '20 logged strength sessions',
      threshold: { type: 'practice', value: 20 } },
    { key: 'heavy', title: 'Heavy lifts',
      criteria: 'Hit a meaningful PR',
      threshold: { type: 'level', value: 6 } },
    { key: 'base', title: 'Strength Base',
      criteria: 'Consistent and stronger',
      threshold: { type: 'level', value: 1 },
      dependsOn: { mode: 'all', keys: ['consistency','heavy'] },   // or {mode:'any', keys:[...], count:2}
      reward: { type: 'xp', pct: 5 } }               // optional; or {type:'decayResist', pct:10}
  ]
}
```
- A single-node recipe is just `nodes: [ one ]`.
- Paths reference sibling `key`s in `dependsOn`; the add flow maps keys →
  generated node ids and wires parents (`requireMode` + `anyCount`).

### Mapping helpers (pure, tested)
- `recipeToHabit(recipe)` → the object shape `addHabit` expects (validate/clamp).
- `recipeToNodeSpecs(recipe)` → an ordered array of node specs with resolved
  dependency ids (create parents first, then children referencing their new ids).

## UX

**Entry points**
- **Quests screen:** a secondary button `✨ SUGGESTIONS` beside "Add quest".
- **Skills screen:** per stat-tree, a "Suggested paths" affordance.
- **Empty-state nudge:** if the user has ≤ 1 quest, show "New here? Start from a
  suggestion."

**Browse modal** (reuse `modal()` in `views.js`)
- Stat filter chips (the six, using ATTRIBUTES colour/glyph) + optional search.
- Recipe cards: title, stat glyph/colour, the one-line `why`, and a compact
  preview of key params (cadence + XP for quests; threshold(s)/deps for mastery).
- Card action **Add** → opens the existing habit/node editor **pre-filled** with
  the recipe values. User reviews, tweaks, saves. (A quick "Add as-is" is
  optional.)
- **Duplicate awareness:** if a quest/node with the same title exists, show a
  subtle "already added" hint but still allow it.

After add: a normal quest/node. Nothing marks it as "from a recipe."

## Integration points (existing code)

- `www/js/attributes.js` — `ATTRIBUTES` (ids, colours, glyphs).
- `www/js/game.js` — `addHabit(state, {...})`; the habit editor lives in `views.js`.
- `www/js/skilltree.js` — `addNode(state, {...})`, node fields incl. dependencies
  (`requireMode` all/any, `anyCount`, parent ids); node editor in `views.js`.
- `www/js/views.js` — `modal()` helper and the existing editor modals to reuse.

## Testing

- **Unit** (`scripts/test.js`): `recipeToHabit` and `recipeToNodeSpecs` — field
  validation/clamping, cadence mapping, and dependency-key → id resolution
  (including an `any N` path). Catalog integrity: every recipe has a valid
  `statId`/`statIds`, non-empty title, and mastery `dependsOn.keys` reference
  real sibling keys.
- **Smoke** (`scripts/smoke.mjs`): open Suggestions → add a quest recipe → it
  appears in Quests; add a mastery path recipe → its nodes + the dependency show
  in the tree.
- Keep existing logic + smoke suites green.

## Non-goals (v1)

- No community / import-export recipe packs (possible future — the catalog format
  is already serialisable).
- No AI-generated recipes.
- No in-app editing of the catalog.

## Ships as

One OTA web bundle. No native code, no schema change, no migration. Designed to be
complete-enough on first ship (a curated catalog for all six stats + the
browse/add flow) so it lands in a single update rather than several increments.
