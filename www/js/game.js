// Core game engine: the single source of truth for state mutations.
//
// The UI never edits state fields directly — it calls these functions, which
// keep XP, levels, streaks, conditions and skill-tree effects consistent, and
// report back the reward beats (XP gained, level-ups) the UI needs to animate.

import { uid, clamp, now, dayKey } from './util.js';
import { periodMs } from './cadence.js';
import { levelFromXp } from './leveling.js';
import { refreshConditions } from './condition.js';
import { activeEffects } from './skilltree.js';
import { stepsToday } from './pedometer.js';
import { rollLoot } from './items.js';

export const SCHEMA_VERSION = 1;

// A small, fixed retro palette — one deliberate hue per default stat.
const DEFAULT_STATS = [
  { name: 'Body', color: '#e05a5a' },
  { name: 'Mind', color: '#48c8ff' },
  { name: 'Discipline', color: '#f0c020' },
  { name: 'Craft', color: '#6ad46a' },
];

export function defaultState() {
  const state = {
    version: SCHEMA_VERSION,
    createdAt: now(),
    stats: {},
    habits: {},
    tree: { unlocked: [] },
    inventory: [], // loot collected from completions
    reminders: {},
    settings: {
      activeHours: { start: 9, end: 21 }, // 9am–9pm
      general: {
        water: { enabled: false, perHour: 1 },
        posture: { enabled: false, perHour: 1 },
      },
      checkIn: { enabled: true, weekday: 0, hour: 9 }, // Sunday 9am
    },
    meta: { lastCheckIn: null },
  };
  let bodyId = null;
  for (const s of DEFAULT_STATS) {
    const id = uid('stat');
    if (s.name === 'Body') bodyId = id;
    state.stats[id] = {
      id,
      name: s.name,
      color: s.color,
      xp: 0,
      condition: 100,
      healthySince: now(),
    };
  }
  // Showcase the pedometer feature: a step-goal habit feeding Body that
  // auto-completes on the day you hit your goal.
  if (bodyId) {
    addHabit(state, {
      name: 'Daily Steps',
      description: 'Auto-completes when you reach your step goal.',
      statIds: [bodyId],
      source: 'steps',
      stepGoal: 8000,
      xpPerCompletion: 50,
    });
  }
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
    const mult = xpMultiplier[statId] || 1;
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
  h.history.push(at);
  if (h.history.length > 200) h.history = h.history.slice(-200);

  // Loot roll — happens before the streak is consumed elsewhere; uses the
  // streak we just updated so consistency improves drops.
  const loot = rollLoot(h);
  if (loot) addLoot(state, loot);

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
