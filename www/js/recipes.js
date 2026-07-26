// Recipes — a curated, editable catalog of starting-point quests and mastery
// paths, one small set per attribute. Purely a *suggestion* layer: nothing here
// touches state directly. The two pure helpers below map a recipe onto the exact
// shapes `addHabit` / `addNode` already expect, so an added recipe becomes a
// normal, fully-editable, user-owned quest or node — no new schema, no migration.
//
// Keep this module DOM-free and side-effect-free (it's unit-tested); the browse
// UI that consumes it lives in views.js.

import { clamp, uid } from './util.js';
import { ATTRIBUTE_IDS } from './attributes.js';

// ---- Catalog --------------------------------------------------------------
//
// Quest recipe: { id, statIds[], title, description, cadence, xpPerCompletion,
//                 source, stepGoal?, why }
//   cadence: { type:'daily' } | { type:'everyN', n } | { type:'weekly' }
//   source:  'manual' (tap to log) | 'steps' (auto at a daily step goal)
//
// Practical-first, light RPG flavour. ~5 per stat.

export const QUEST_RECIPES = [
  // ---- Strength — physical training & exertion ----
  { id: 'str-resistance', statIds: ['str'], title: 'Strength session',
    description: 'Gym session or a full bodyweight workout.',
    cadence: { type: 'everyN', n: 2 }, xpPerCompletion: 30, source: 'manual',
    why: 'Progressive resistance is the most direct way to build Strength.' },
  { id: 'str-steps', statIds: ['str'], title: 'Hit your step goal',
    description: 'Auto-completes when you reach your daily step count.',
    cadence: { type: 'daily' }, xpPerCompletion: 40, source: 'steps', stepGoal: 8000,
    why: 'Daily movement keeps the body trained without a gym.' },
  { id: 'str-pushups', statIds: ['str'], title: 'Push-up set',
    description: 'One honest set to near-failure.',
    cadence: { type: 'daily' }, xpPerCompletion: 15, source: 'manual',
    why: 'A tiny daily rep is the seed of a real strength habit.' },
  { id: 'str-core', statIds: ['str'], title: 'Core workout',
    description: 'Planks, hollow holds, or a short core circuit.',
    cadence: { type: 'everyN', n: 2 }, xpPerCompletion: 20, source: 'manual',
    why: 'A strong core underpins every other lift and movement.' },
  { id: 'str-mobility', statIds: ['str', 'vit'], title: 'Mobility & stretch',
    description: 'Ten minutes of stretching or mobility drills.',
    cadence: { type: 'daily' }, xpPerCompletion: 12, source: 'manual',
    why: 'Mobility keeps you training injury-free for the long haul.' },
  { id: 'str-hike', statIds: ['str'], title: 'Go for a hike',
    description: 'A long walk or hike with some elevation.',
    cadence: { type: 'weekly' }, xpPerCompletion: 60, source: 'manual',
    why: 'Sustained load over distance builds real-world strength.' },

  // ---- Magic — learning & mental skill ----
  { id: 'mag-read', statIds: ['mag'], title: 'Read 20 pages',
    description: 'Read a book or long-form article.',
    cadence: { type: 'daily' }, xpPerCompletion: 20, source: 'manual',
    why: 'Consistent reading compounds knowledge faster than cramming.' },
  { id: 'mag-course', statIds: ['mag'], title: 'Study a course module',
    description: 'Work through one lesson of a course you’re taking.',
    cadence: { type: 'everyN', n: 2 }, xpPerCompletion: 30, source: 'manual',
    why: 'Structured study turns interest into durable skill.' },
  { id: 'mag-practice-skill', statIds: ['mag'], title: 'Practise a skill',
    description: 'An instrument, a language, code — deliberate practice.',
    cadence: { type: 'daily' }, xpPerCompletion: 20, source: 'manual',
    why: 'Daily reps are how any craft actually gets learned.' },
  { id: 'mag-deep-work', statIds: ['mag', 'spd'], title: 'One deep-work block',
    description: '45–90 minutes of focused, single-tasked work.',
    cadence: { type: 'daily' }, xpPerCompletion: 35, source: 'manual',
    why: 'Uninterrupted focus is where hard problems get solved.' },
  { id: 'mag-write', statIds: ['mag'], title: 'Write or take notes',
    description: 'Journal, summarise what you learned, or draft ideas.',
    cadence: { type: 'daily' }, xpPerCompletion: 15, source: 'manual',
    why: 'Writing forces you to actually understand what you read.' },

  // ---- Vitality — health & body upkeep ----
  { id: 'vit-water', statIds: ['vit'], title: 'Hit your water goal',
    description: 'Drink your target amount of water today.',
    cadence: { type: 'daily' }, xpPerCompletion: 10, source: 'manual',
    why: 'Hydration is the cheapest upgrade to how you feel all day.' },
  { id: 'vit-sleep', statIds: ['vit'], title: 'Sleep 7+ hours',
    description: 'In bed on time; a full night’s rest.',
    cadence: { type: 'daily' }, xpPerCompletion: 25, source: 'manual',
    why: 'Sleep is the foundation every other stat is built on.' },
  { id: 'vit-veg', statIds: ['vit'], title: 'Eat a real meal',
    description: 'Vegetables and whole food, not just convenience.',
    cadence: { type: 'daily' }, xpPerCompletion: 15, source: 'manual',
    why: 'What you eat quietly decides your energy and health.' },
  { id: 'vit-no-junk', statIds: ['vit'], title: 'No junk today',
    description: 'Skip the sugar / ultra-processed snack you usually grab.',
    cadence: { type: 'daily' }, xpPerCompletion: 20, source: 'manual',
    why: 'A single skipped habit-snack, repeated, changes your health.' },
  { id: 'vit-meal-prep', statIds: ['vit'], title: 'Meal prep',
    description: 'Cook ahead so the healthy choice is the easy one.',
    cadence: { type: 'weekly' }, xpPerCompletion: 50, source: 'manual',
    why: 'Prep removes the willpower tax from eating well all week.' },
  { id: 'vit-sunlight', statIds: ['vit', 'spr'], title: 'Morning Sunlight',
    description: 'Ten minutes of natural daylight within an hour of waking.',
    cadence: { type: 'daily' }, xpPerCompletion: 15, source: 'manual',
    why: 'Morning light anchors your body clock and steadies mood all day.' },

  // ---- Spirit — mindfulness & emotion ----
  { id: 'spr-meditate', statIds: ['spr'], title: 'Meditate 10 minutes',
    description: 'A short seated meditation or mindfulness sit.',
    cadence: { type: 'daily' }, xpPerCompletion: 20, source: 'manual',
    why: 'A daily sit trains the attention everything else relies on.' },
  { id: 'spr-gratitude', statIds: ['spr'], title: 'Gratitude note',
    description: 'Write down three things you’re grateful for.',
    cadence: { type: 'daily' }, xpPerCompletion: 15, source: 'manual',
    why: 'Naming the good rewires how the whole day feels.' },
  { id: 'spr-breathe', statIds: ['spr'], title: 'Breathing practice',
    description: 'A few minutes of slow, deliberate breathwork.',
    cadence: { type: 'daily' }, xpPerCompletion: 12, source: 'manual',
    why: 'Slow breathing is the fastest handle on a racing mind.' },
  { id: 'spr-offline', statIds: ['spr'], title: 'Screen-free hour',
    description: 'One hour with no feeds, no scroll.',
    cadence: { type: 'daily' }, xpPerCompletion: 20, source: 'manual',
    why: 'Stepping off the scroll gives your mind room to settle.' },
  { id: 'spr-nature', statIds: ['spr', 'vit'], title: 'Time in nature',
    description: 'A walk in a park, by water, or among trees.',
    cadence: { type: 'weekly' }, xpPerCompletion: 40, source: 'manual',
    why: 'Time outdoors reliably lowers stress and lifts mood.' },

  // ---- Luck — chance, social & creativity ----
  { id: 'lck-reach-out', statIds: ['lck'], title: 'Reach out to someone',
    description: 'Message or call a friend you’ve been meaning to.',
    cadence: { type: 'everyN', n: 2 }, xpPerCompletion: 25, source: 'manual',
    why: 'Good luck is mostly a wide, warm network of people.' },
  { id: 'lck-create', statIds: ['lck', 'mag'], title: 'Make something',
    description: 'Draw, write, build, or play — create for its own sake.',
    cadence: { type: 'daily' }, xpPerCompletion: 25, source: 'manual',
    why: 'Volume of creative reps is what surfaces the lucky hit.' },
  { id: 'lck-new-thing', statIds: ['lck'], title: 'Try something new',
    description: 'A new place, food, route, or activity.',
    cadence: { type: 'weekly' }, xpPerCompletion: 45, source: 'manual',
    why: 'Novelty is where serendipity and opportunity live.' },
  { id: 'lck-kindness', statIds: ['lck'], title: 'Give a genuine compliment',
    description: 'Thank or encourage someone, and mean it.',
    cadence: { type: 'daily' }, xpPerCompletion: 12, source: 'manual',
    why: 'Small kindnesses build the goodwill luck runs on.' },
  { id: 'lck-brainstorm', statIds: ['lck', 'mag'], title: 'Brainstorm 10 ideas',
    description: 'Ten ideas on any prompt — quantity over quality.',
    cadence: { type: 'daily' }, xpPerCompletion: 20, source: 'manual',
    why: 'An idea muscle, trained daily, makes your own luck.' },

  // ---- Speed — consistency & productivity ----
  { id: 'spd-plan-day', statIds: ['spd'], title: 'Plan tomorrow',
    description: 'Pick tomorrow’s top 1–3 tasks before you stop.',
    cadence: { type: 'daily' }, xpPerCompletion: 15, source: 'manual',
    why: 'A plan made the night before removes morning friction.' },
  { id: 'spd-mit', statIds: ['spd'], title: 'Do your #1 task first',
    description: 'Tackle the most important thing before anything else.',
    cadence: { type: 'daily' }, xpPerCompletion: 30, source: 'manual',
    why: 'Winning the first move sets the tempo for the whole day.' },
  { id: 'spd-inbox', statIds: ['spd'], title: 'Clear the queue',
    description: 'Process inbox / messages / task list to zero.',
    cadence: { type: 'everyN', n: 2 }, xpPerCompletion: 20, source: 'manual',
    why: 'A clear queue is a clear head and a faster next day.' },
  { id: 'spd-tidy', statIds: ['spd'], title: 'Five-minute tidy',
    description: 'Reset your desk or one small space.',
    cadence: { type: 'daily' }, xpPerCompletion: 10, source: 'manual',
    why: 'A tidy space lowers the activation energy for everything.' },
  { id: 'spd-sprints', statIds: ['spd'], title: 'Three focus sprints',
    description: 'Three timed work sprints with short breaks.',
    cadence: { type: 'daily' }, xpPerCompletion: 30, source: 'manual',
    why: 'Timeboxing turns a vague day into finished work.' },
];

// Mastery recipe: { id, statId, title, nodes[] }
//   node: { key, title, criteria, threshold:{ type:'practice'|'level', value },
//           dependsOn?:{ mode:'all'|'any', keys[], count? }, reward? }
//   reward: { type:'xp', pct } | { type:'decayResist', pct }
// A single-node recipe is just `nodes: [ one ]`. Paths reference sibling `key`s.

export const MASTERY_RECIPES = [
  // ---- Strength ----
  { id: 'str-foundations', statId: 'str', title: 'Strength Foundations',
    nodes: [
      { key: 'consistency', title: 'Consistency', criteria: 'Log 20 real strength sessions.',
        threshold: { type: 'practice', value: 20 } },
      { key: 'heavy', title: 'Heavy Lifts', criteria: 'Hit a meaningful personal record.',
        threshold: { type: 'level', value: 6 } },
      { key: 'base', title: 'Strength Base', criteria: 'Consistent, and measurably stronger.',
        threshold: { type: 'level', value: 1 },
        dependsOn: { mode: 'all', keys: ['consistency', 'heavy'] },
        reward: { type: 'xp', pct: 5 } },
    ] },
  { id: 'str-endurance', statId: 'str', title: 'Iron Endurance',
    nodes: [
      { key: 'endure', title: 'Iron Endurance', criteria: 'Sustain training across 40 sessions.',
        threshold: { type: 'practice', value: 40 }, reward: { type: 'decayResist', pct: 10 } },
    ] },

  // ---- Magic ----
  { id: 'mag-scholar', statId: 'mag', title: 'Scholar’s Mind',
    nodes: [
      { key: 'curiosity', title: 'Curiosity', criteria: 'Finish a book or a course module.',
        threshold: { type: 'practice', value: 15 } },
      { key: 'depth', title: 'Depth', criteria: 'Reach a level of real fluency in the subject.',
        threshold: { type: 'level', value: 5 } },
      { key: 'scholar', title: 'Scholar’s Mind', criteria: 'Curious, and deep in at least one thing.',
        threshold: { type: 'level', value: 1 },
        dependsOn: { mode: 'all', keys: ['curiosity', 'depth'] },
        reward: { type: 'xp', pct: 5 } },
    ] },
  { id: 'mag-polymath', statId: 'mag', title: 'Polymath',
    nodes: [
      { key: 'breadth-read', title: 'Well-read', criteria: 'Sustain a reading habit.',
        threshold: { type: 'practice', value: 15 } },
      { key: 'breadth-make', title: 'Hands-on', criteria: 'Practise a hands-on skill in depth.',
        threshold: { type: 'level', value: 4 } },
      { key: 'breadth-teach', title: 'Explainer', criteria: 'Write up or teach what you’ve learned.',
        threshold: { type: 'practice', value: 25 } },
      { key: 'polymath', title: 'Polymath', criteria: 'Strong across several different domains.',
        threshold: { type: 'level', value: 1 },
        dependsOn: { mode: 'any', keys: ['breadth-read', 'breadth-make', 'breadth-teach'], count: 2 },
        reward: { type: 'xp', pct: 5 } },
    ] },

  // ---- Vitality ----
  { id: 'vit-base', statId: 'vit', title: 'Vital Base',
    nodes: [
      { key: 'upkeep', title: 'Upkeep', criteria: 'Hold hydration + sleep across 30 days.',
        threshold: { type: 'practice', value: 30 } },
      { key: 'steady', title: 'Steady Health', criteria: 'Reach a stable, healthy baseline.',
        threshold: { type: 'level', value: 5 } },
      { key: 'vital', title: 'Vital Base', criteria: 'Rested, fuelled, and consistent.',
        threshold: { type: 'level', value: 1 },
        dependsOn: { mode: 'all', keys: ['upkeep', 'steady'] },
        reward: { type: 'decayResist', pct: 10 } },
    ] },
  { id: 'vit-resilience', statId: 'vit', title: 'Resilience',
    nodes: [
      { key: 'resilient', title: 'Resilience', criteria: 'Keep the basics through a hard stretch.',
        threshold: { type: 'practice', value: 45 }, reward: { type: 'decayResist', pct: 15 } },
    ] },

  // ---- Spirit ----
  { id: 'spr-inner-calm', statId: 'spr', title: 'Inner Calm',
    nodes: [
      { key: 'stillness', title: 'Stillness', criteria: 'Sit with a practice 20 times.',
        threshold: { type: 'practice', value: 20 } },
      { key: 'equanimity', title: 'Equanimity', criteria: 'Meet a hard day without being ruled by it.',
        threshold: { type: 'level', value: 5 } },
      { key: 'calm', title: 'Inner Calm', criteria: 'Practised, and steadier under pressure.',
        threshold: { type: 'level', value: 1 },
        dependsOn: { mode: 'all', keys: ['stillness', 'equanimity'] },
        reward: { type: 'decayResist', pct: 10 } },
    ] },
  { id: 'spr-presence', statId: 'spr', title: 'Presence',
    nodes: [
      { key: 'present', title: 'Presence', criteria: 'Show up mindfully, day after day.',
        threshold: { type: 'practice', value: 25 }, reward: { type: 'xp', pct: 5 } },
    ] },

  // ---- Luck ----
  { id: 'lck-serendipity', statId: 'lck', title: 'Serendipity Engine',
    nodes: [
      { key: 'reach', title: 'Put Yourself Out There', criteria: 'Consistently connect with people.',
        threshold: { type: 'practice', value: 15 } },
      { key: 'reps', title: 'Creative Reps', criteria: 'Ship a steady stream of small creations.',
        threshold: { type: 'practice', value: 30 } },
      { key: 'engine', title: 'Serendipity Engine', criteria: 'Social and creative surface area, wide open.',
        threshold: { type: 'level', value: 1 },
        dependsOn: { mode: 'all', keys: ['reach', 'reps'] },
        reward: { type: 'xp', pct: 5 } },
    ] },
  { id: 'lck-social', statId: 'lck', title: 'Warm Network',
    nodes: [
      { key: 'network', title: 'Warm Network', criteria: 'Tend relationships until they’re real.',
        threshold: { type: 'level', value: 4 }, reward: { type: 'xp', pct: 5 } },
    ] },

  // ---- Speed ----
  { id: 'spd-momentum', statId: 'spd', title: 'Momentum',
    nodes: [
      { key: 'cadence', title: 'Daily Cadence', criteria: 'Keep a productivity habit 25 days.',
        threshold: { type: 'practice', value: 25 } },
      { key: 'levelup', title: 'Leveled Up', criteria: 'Reach a level where output feels effortless.',
        threshold: { type: 'level', value: 5 } },
      { key: 'momentum', title: 'Momentum', criteria: 'Consistent, and genuinely faster.',
        threshold: { type: 'level', value: 1 },
        dependsOn: { mode: 'all', keys: ['cadence', 'levelup'] },
        reward: { type: 'xp', pct: 5 } },
    ] },
  { id: 'spd-flow', statId: 'spd', title: 'Flow State',
    nodes: [
      { key: 'flow', title: 'Flow State', criteria: 'Reliably drop into deep, fast focus.',
        threshold: { type: 'practice', value: 30 }, reward: { type: 'xp', pct: 5 } },
    ] },
];

export const ALL_RECIPES = [...QUEST_RECIPES, ...MASTERY_RECIPES];

// ---- Growth paths (onboarding quiz) ----------------------------------------
//
// The first-run quiz (views.js showWalkthrough) sorts a new player into one of
// three broad growth paths from a short diagnostic, rather than handing them a
// blank editor. Each path names a hero archetype (sprites.js) and a small
// starter loadout — 3 quests + 1 mastery node — pulled from the catalog above,
// so "Accept Recommended Loadout" has something concrete to add.

export const GROWTH_PATHS = {
  anchor: {
    id: 'anchor', name: 'The Anchor', archetype: 'Druid', statIds: ['vit', 'spr'],
    tagline: 'Steady, grounded, resilient — health and calm as the foundation.',
  },
  architect: {
    id: 'architect', name: 'The Architect', archetype: 'Scholar', statIds: ['mag', 'spr'],
    tagline: 'Deep focus and calm clarity — mastery through the mind.',
  },
  catalyst: {
    id: 'catalyst', name: 'The Catalyst', archetype: 'Ranger', statIds: ['spd', 'str'],
    tagline: 'Momentum and execution — turning intent into action, fast.',
  },
};

// Each quiz question offers the same three options in the same order, so a
// single a/b/c -> path mapping scores all three: (a) exhausted/physical ->
// Anchor, (b) mentally scattered/reflective -> Architect, (c) reactive/fast ->
// Catalyst. Ties are broken by the third question ("who do you want to
// become") since it's the most direct identity signal of the three.
const OPTION_PATH = { a: 'anchor', b: 'architect', c: 'catalyst' };

export function pathFromQuiz(answers = {}) {
  const tally = { anchor: 0, architect: 0, catalyst: 0 };
  for (const key of ['q1', 'q2', 'q3']) {
    const p = OPTION_PATH[answers[key]];
    if (p) tally[p] += 1;
  }
  const top = Math.max(...Object.values(tally));
  const winners = Object.keys(tally).filter((p) => tally[p] === top);
  if (winners.length === 1) return winners[0];
  return OPTION_PATH[answers.q3] || 'architect';
}

const PATH_STARTERS = {
  anchor: { questIds: ['vit-sunlight', 'vit-water', 'spr-meditate'], masteryId: 'vit-base' },
  architect: { questIds: ['mag-read', 'mag-practice-skill', 'spr-breathe'], masteryId: 'mag-scholar' },
  catalyst: { questIds: ['spd-mit', 'spd-plan-day', 'str-pushups'], masteryId: 'spd-momentum' },
};

// The recommended starter loadout for a growth path: the 3 quest recipes plus
// the foundational (parent-free) node of one mastery path — ready to pass
// straight to addHabit/addNode. Each of the three referenced mastery recipes
// is built as two independent base nodes feeding one capstone, so their first
// ordered node never depends on a sibling that hasn't been created yet.
export function starterLoadout(pathId) {
  const cfg = PATH_STARTERS[pathId] || PATH_STARTERS.architect;
  const quests = cfg.questIds
    .map((id) => QUEST_RECIPES.find((r) => r.id === id))
    .filter(Boolean);
  const masteryRecipe = MASTERY_RECIPES.find((r) => r.id === cfg.masteryId);
  const node = masteryRecipe ? recipeToNodeSpecs(masteryRecipe)[0] : null;
  return { quests, node };
}

// Recipes for one attribute (both kinds), preserving catalog order.
export function recipesForStat(statId) {
  return {
    quests: QUEST_RECIPES.filter((r) => r.statIds.includes(statId)),
    mastery: MASTERY_RECIPES.filter((r) => r.statId === statId),
  };
}

// ---- Pure mapping helpers (unit-tested) -----------------------------------

// Map a cadence descriptor onto the { cadenceType, cadenceN } addHabit expects.
function cadenceFields(cadence) {
  const c = cadence || { type: 'daily' };
  if (c.type === 'weekly') return { cadenceType: 'weekly', cadenceN: 2 };
  if (c.type === 'everyN') return { cadenceType: 'everyN', cadenceN: clamp(Number(c.n) || 2, 1, 365) };
  return { cadenceType: 'daily', cadenceN: 2 };
}

// recipeToHabit(recipe) -> the exact object shape addHabit(state, data) accepts.
// Values are validated/clamped here so the pure mapping is self-contained (and
// so a card preview built from this matches what actually gets saved).
export function recipeToHabit(recipe) {
  const source = recipe.source === 'steps' ? 'steps' : 'manual';
  const statIds = (Array.isArray(recipe.statIds) ? recipe.statIds : [])
    .filter((id) => ATTRIBUTE_IDS.includes(id));
  const { cadenceType, cadenceN } = cadenceFields(recipe.cadence);
  return {
    name: (recipe.title || '').trim() || 'New Quest',
    description: recipe.description || '',
    statIds,
    source,
    stepGoal: clamp(Number(recipe.stepGoal) || 8000, 100, 100000),
    // Step habits are always daily; mirror addHabit's own rule so previews agree.
    cadenceType: source === 'steps' ? 'daily' : cadenceType,
    cadenceN,
    xpPerCompletion: clamp(Number(recipe.xpPerCompletion) || 20, 1, 1000),
  };
}

// Convert a recipe reward ({type:'xp',pct} | {type:'decayResist',pct}) into the
// node's internal reward shape ({type:'xp',value:mult} | {type:'resist',value}).
function rewardToNode(reward) {
  if (!reward || !reward.type) return null;
  const pct = clamp(Number(reward.pct) || 0, 1, 100);
  if (reward.type === 'xp') return { type: 'xp', value: 1 + pct / 100 };
  if (reward.type === 'decayResist' || reward.type === 'resist') return { type: 'resist', value: pct / 100 };
  return null;
}

// Order a recipe's nodes so every node appears after all of its dependencies
// (parents created before children). Sibling `key`s only; small, so a simple
// repeated-pass topological sort is plenty and keeps input order among peers.
function orderNodes(nodes) {
  const remaining = [...nodes];
  const placed = new Set();
  const out = [];
  let guard = remaining.length + 1;
  while (remaining.length && guard > 0) {
    guard -= 1;
    for (let i = 0; i < remaining.length;) {
      const n = remaining[i];
      const deps = (n.dependsOn && n.dependsOn.keys) || [];
      if (deps.every((k) => placed.has(k))) {
        out.push(n); placed.add(n.key); remaining.splice(i, 1);
      } else {
        i += 1;
      }
    }
  }
  // Any nodes left have unresolvable/cyclic deps — append them as-is rather
  // than drop them (they'll simply carry whatever parents did resolve).
  return out.concat(remaining);
}

// recipeToNodeSpecs(recipe, makeId?) -> ordered array of addNode-ready specs.
// Each node is assigned an id up front, so sibling `dependsOn` keys resolve to
// the concrete ids of the nodes this same call will create. Parents come before
// children. `makeId` is injectable so the resolution is deterministically
// testable; by default it mints real node ids (addNode honours a supplied id).
export function recipeToNodeSpecs(recipe, makeId = () => uid('node')) {
  const ordered = orderNodes(recipe.nodes || []);
  const idByKey = {};
  for (const node of ordered) idByKey[node.key] = makeId();
  return ordered.map((node) => {
    const dep = node.dependsOn;
    const parents = dep && Array.isArray(dep.keys)
      ? dep.keys.map((k) => idByKey[k]).filter(Boolean)
      : [];
    const th = node.threshold || {};
    return {
      key: node.key,
      id: idByKey[node.key],
      statId: recipe.statId,
      title: node.title,
      criteria: node.criteria || '',
      thresholdType: th.type === 'level' ? 'level' : 'practice',
      thresholdValue: clamp(Number(th.value) || 1, 1, 100000),
      parents,
      requireMode: dep && dep.mode === 'any' ? 'any' : 'all',
      anyCount: dep && dep.mode === 'any' ? clamp(Number(dep.count) || 1, 1, 20) : 1,
      reward: rewardToNode(node.reward),
    };
  });
}
