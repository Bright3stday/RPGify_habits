// Core game engine: the single source of truth for state mutations.
//
// The UI never edits state fields directly — it calls these functions, which
// keep XP, levels, streaks, conditions and skill-tree effects consistent, and
// report back the reward beats (XP gained, level-ups) the UI needs to animate.

import { uid, clamp, now, dayKey } from './util.js';
import { periodMs } from './cadence.js';
import { levelFromXp } from './leveling.js';
import { refreshConditions } from './condition.js';
import { activeEffects, addNode, defaultGrowth } from './skilltree.js';
import { stepsToday } from './pedometer.js';
import { rollLoot } from './items.js';
import { emptyEquipment } from './equipment.js';
import { ATTRIBUTES, scoreOf } from './attributes.js';
import { defaultDoomscroll } from './doomscroll.js';
import { defaultSpiritTrack, recoverOnQuest } from './spirit.js';

export const SCHEMA_VERSION = 4;

export function defaultState() {
  const state = {
    version: SCHEMA_VERSION,
    createdAt: now(),
    stats: {},          // the six fixed primary attributes, keyed by attribute id
    habits: {},
    tree: { nodes: {} }, // user-authored mastery nodes
    growth: defaultGrowth(), // Growth Points currency
    spiritTrack: defaultSpiritTrack(), // doomscroll → Spirit XP/wear (OTA-scored)
    inventory: [],      // cosmetic loot collected from completions
    equipment: emptyEquipment(), // cosmetic only — no stat bonuses
    reminders: {},
    settings: {
      activeHours: { start: 9, end: 21 }, // 9am–9pm
      general: {
        water: { enabled: false, perHour: 1 },
        posture: { enabled: false, perHour: 1 },
      },
      checkIn: { enabled: true, weekday: 0, hour: 9 }, // Sunday 9am
      doomscroll: defaultDoomscroll(),
      path: null, // growth path from the onboarding quiz: 'anchor'|'architect'|'catalyst'
    },
    meta: { lastCheckIn: null },
  };
  for (const a of ATTRIBUTES) {
    state.stats[a.id] = {
      id: a.id, name: a.name, color: a.color,
      xp: 0, condition: 100, healthySince: now(),
    };
  }
  // Showcase the pedometer: a step-goal habit training Strength that
  // auto-completes on the day you hit your goal.
  addHabit(state, {
    name: 'Daily Steps',
    description: 'Auto-completes when you reach your step goal.',
    statIds: ['str'],
    source: 'steps',
    stepGoal: 8000,
    xpPerCompletion: 50,
  });
  seedExampleNodes(state);
  refreshConditions(state);
  return state;
}

// A couple of example mastery nodes so the tree isn't empty — one sequential
// pair (Strength) and one flat node (Magic). Fully editable/deletable.
function seedExampleNodes(state) {
  const a = addNode(state, {
    statId: 'str', title: 'Build the Habit',
    criteria: 'Log 15 strength sessions and mean it.',
    thresholdType: 'practice', thresholdValue: 15,
  });
  addNode(state, {
    statId: 'str', title: 'Grow Stronger',
    criteria: 'Reach Strength level 5 with real, progressive effort.',
    thresholdType: 'level', thresholdValue: 5,
    parents: [a.id], requireMode: 'all', // sequential: needs the first
  });
  addNode(state, {
    statId: 'mag', title: 'Curiosity',
    criteria: 'Finish a book or a course module.',
    thresholdType: 'practice', thresholdValue: 10,
  });
}

// Luck attribute -> loot luck (0..~0.3). Growing Luck improves your drops.
export function luckFactor(state) {
  return clamp((scoreOf(state, 'lck') - 8) * 0.015, 0, 0.3);
}

// Migrate an older save to the current schema.
//   v1: free-form stat categories -> v2: the six fixed attributes.
//   v2: the auto-generated skill tree (unlocked ids) -> v3: user-authored
//       mastery nodes + Growth Points.
// Habits and cosmetic loot are preserved; the old tree (fixed-node bonuses) is
// reset since its node ids no longer mean anything.
export function migrate(state) {
  if (!state) return state;
  const hasAttrs = state.stats && state.stats.str && state.stats.spd;
  if (!hasAttrs) {
    state.stats = {};
    for (const a of ATTRIBUTES) {
      state.stats[a.id] = {
        id: a.id, name: a.name, color: a.color, xp: 0, condition: 100, healthySince: now(),
      };
    }
    for (const h of Object.values(state.habits || {})) {
      h.statIds = ['str']; // reassignable by the user afterwards
    }
  }
  if (!state.tree || !state.tree.nodes) state.tree = { nodes: {} };
  if (!state.growth) state.growth = defaultGrowth();
  if (!state.equipment) state.equipment = emptyEquipment();
  if (!state.inventory) state.inventory = [];
  for (const h of Object.values(state.habits || {})) {
    if (h.completions == null) h.completions = h.history ? h.history.length : 0;
  }
  if (!state.settings) state.settings = {};
  if (!state.settings.doomscroll) state.settings.doomscroll = defaultDoomscroll();
  // Paths migration: rows recorded before this update had no chosen path; default
  // the gentler Oracle (reflect-on-return) so nothing starts watching in the
  // background without an explicit opt-in.
  if (!state.settings.doomscroll.path) state.settings.doomscroll.path = 'oracle';
  if (state.settings.path === undefined) state.settings.path = null;
  if (!state.meta) state.meta = { lastCheckIn: null };
  if (!state.spiritTrack) state.spiritTrack = defaultSpiritTrack();
  state.version = SCHEMA_VERSION;
  refreshConditions(state);
  return state;
}

// ---- Stats ----------------------------------------------------------------

export function addStat(state, { name, color }) {
  const id = uid('stat');
  state.stats[id] = {
    id,
    name: name.trim() || 'Stat',
    color: color || '#48c8ff',
    xp: 0,
    condition: 100,
    healthySince: now(),
  };
  return state.stats[id];
}

export function updateStat(state, id, patch) {
  const stat = state.stats[id];
  if (!stat) return;
  if (patch.name != null) stat.name = patch.name.trim() || stat.name;
  if (patch.color != null) stat.color = patch.color;
}

export function deleteStat(state, id) {
  delete state.stats[id];
  // Unlink from habits.
  for (const h of Object.values(state.habits)) {
    h.statIds = h.statIds.filter((sid) => sid !== id);
  }
  // Drop any tree nodes belonging to it.
  state.tree.unlocked = state.tree.unlocked.filter((n) => !n.startsWith(id));
}

// ---- Habits ---------------------------------------------------------------

export function addHabit(state, data) {
  const id = uid('habit');
  state.habits[id] = {
    id,
    name: (data.name || '').trim() || 'New Habit',
    description: data.description || '',
    statIds: Array.isArray(data.statIds) ? data.statIds : [],
    // 'manual' = tap to complete; 'steps' = auto-completes at a daily step goal.
    source: data.source === 'steps' ? 'steps' : 'manual',
    stepGoal: clamp(Number(data.stepGoal) || 8000, 100, 100000),
    cadenceType: data.source === 'steps' ? 'daily' : (data.cadenceType || 'daily'),
    cadenceN: data.cadenceN || 2,
    xpPerCompletion: clamp(Number(data.xpPerCompletion) || 20, 1, 1000),
    lastCompleted: null,
    streak: 0,
    completions: 0, // uncapped count, for mastery "practice" thresholds
    createdAt: now(),
    retired: false,
    history: [],
  };
  return state.habits[id];
}

export function updateHabit(state, id, patch) {
  const h = state.habits[id];
  if (!h) return;
  if (patch.name != null) h.name = patch.name.trim() || h.name;
  if (patch.description != null) h.description = patch.description;
  if (patch.statIds != null) h.statIds = patch.statIds;
  if (patch.cadenceType != null) h.cadenceType = patch.cadenceType;
  if (patch.cadenceN != null) h.cadenceN = clamp(Number(patch.cadenceN) || 1, 1, 365);
  if (patch.xpPerCompletion != null) {
    h.xpPerCompletion = clamp(Number(patch.xpPerCompletion) || 1, 1, 1000);
  }
  if (patch.source != null) h.source = patch.source === 'steps' ? 'steps' : 'manual';
  if (patch.stepGoal != null) h.stepGoal = clamp(Number(patch.stepGoal) || 8000, 100, 100000);
  if (h.source === 'steps') h.cadenceType = 'daily';
}

export function retireHabit(state, id, retired = true) {
  const h = state.habits[id];
  if (h) h.retired = retired;
}

// Append a loot item to the inventory (tolerating pre-loot saves).
export function addLoot(state, item) {
  if (!state.inventory) state.inventory = [];
  state.inventory.push(item);
}

export function deleteHabit(state, id) {
  delete state.habits[id];
  // Detach reminders that pointed at it.
  for (const r of Object.values(state.reminders)) {
    if (r.habitId === id) r.habitId = null;
  }
}

// Log a completion. Awards XP (with skill-tree multipliers) to each linked
// stat, updates streak, resets the decay clock, and reports level-ups so the
// UI can fire the LEVEL UP! beat.
export function completeHabit(state, id, at = now()) {
  const h = state.habits[id];
  if (!h || h.retired) return null;

  const { xpMultiplier } = activeEffects(state);
  const awards = [];
  const levelUps = [];

  for (const statId of h.statIds) {
    const stat = state.stats[statId];
    if (!stat) continue;
    const before = levelFromXp(stat.xp);
    const mult = xpMultiplier[statId] || 1; // skill-tree XP bonus
    const gain = Math.round(h.xpPerCompletion * mult);
    stat.xp += gain;
    const after = levelFromXp(stat.xp);
    awards.push({ statId, gain });
    if (after > before) {
      levelUps.push({ statId, from: before, to: after, statName: stat.name, color: stat.color });
    }
  }

  // Streak: consecutive on-time (within 2 periods of the prior completion).
  const period = periodMs(h);
  if (h.lastCompleted && at - h.lastCompleted <= 2 * period) {
    h.streak = (h.streak || 0) + 1;
  } else {
    h.streak = 1;
  }
  h.lastCompleted = at;
  h.completions = (h.completions || 0) + 1;
  h.history.push(at);
  if (h.history.length > 200) h.history = h.history.slice(-200);

  // Loot roll — streak (consistency) plus your Luck attribute improve drops.
  const loot = rollLoot(h, Math.random, { luck: luckFactor(state) });
  if (loot) addLoot(state, loot);

  // Doing a real habit burns down some doomscroll "wear" on Spirit.
  state.spiritTrack = recoverOnQuest(state.spiritTrack, at);

  refreshConditions(state, at);
  return { awards, levelUps, loot };
}

// Auto-complete step-goal habits when today's step count reaches their goal.
// Idempotent per day: a habit already completed today is skipped. Returns any
// completions (with their level-ups) so the UI can fire reward beats.
export function syncStepHabits(state, at = now()) {
  const steps = stepsToday(state, at);
  const fired = [];
  for (const h of Object.values(state.habits)) {
    if (h.retired || h.source !== 'steps') continue;
    const doneToday = h.lastCompleted && dayKey(h.lastCompleted) === dayKey(at);
    if (steps >= (h.stepGoal || 8000) && !doneToday) {
      const r = completeHabit(state, h.id, at);
      if (r) fired.push({ habit: h, steps, ...r });
    }
  }
  return fired;
}
