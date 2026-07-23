// Decay / condition — the loss-aversion half of the design.
//
// A stat's "condition" (0-100) is *derived*, never stored as a decaying
// counter. That matters for an offline app: whether the user opens it after an
// hour or after three weeks, condition is recomputed from timestamps, so time
// spent away from the app decays exactly as much as real neglect should. No
// background job, no drift.
//
// Health of a single habit is measured in units of its own cadence period, so
// a weekly habit and a daily habit that are each "one period overdue" have the
// same health — absolute time is deliberately not the axis.

import { periodMs } from './cadence.js';
import { clamp } from './util.js';
import { activeEffects } from './skilltree.js';

// Condition stays pristine for one full grace period past due, then falls to
// zero over this many further periods.
const DECAY_PERIODS = 3;

// Condition at/above which a stat counts as "being kept up" for the purpose of
// skill-tree sustained-engagement requirements.
export const SUSTAIN_THRESHOLD = 70;

// Health of one habit, 0-100. Never-completed habits decay from creation so a
// freshly added habit doesn't instantly drag its stat down.
export function habitHealth(habit, at = Date.now()) {
  if (habit.retired) return 100; // retired habits exert no pressure
  const period = periodMs(habit);
  const reference = habit.lastCompleted != null
    ? habit.lastCompleted
    : (habit.createdAt != null ? habit.createdAt : at);
  const elapsed = at - reference;
  const grace = period; // one free period
  if (elapsed <= grace) return 100;
  const overdue = elapsed - grace;
  const window = DECAY_PERIODS * period;
  return clamp(100 * (1 - overdue / window), 0, 100);
}

// A stat's condition: the mean health of the active habits feeding it. A stat
// with no active feeders can't be neglected, so it reads full.
export function statCondition(state, statId, at = Date.now()) {
  const feeders = Object.values(state.habits).filter(
    (h) => !h.retired && h.statIds.includes(statId),
  );
  if (feeders.length === 0) return 100;
  const sum = feeders.reduce((acc, h) => acc + habitHealth(h, at), 0);
  const raw = sum / feeders.length;
  // Skill-tree Steadfast/Master nodes soften the loss (never full immunity).
  const resist = activeEffects(state).decayResist;
  const resisted = 100 - (100 - raw) * (1 - resist);
  return Math.round(resisted);
}

// Discrete visual bucket for a condition value.
export function conditionState(cond) {
  if (cond >= 75) return 'healthy';
  if (cond >= 40) return 'worn';
  if (cond >= 15) return 'cracked';
  return 'broken';
}

// Recompute every stat's condition and maintain its `healthySince` streak
// marker (used by sustained skill-tree requirements). Call after any state
// change and on load. Mutates state.
export function refreshConditions(state, at = Date.now()) {
  for (const stat of Object.values(state.stats)) {
    const cond = statCondition(state, stat.id, at);
    stat.condition = cond;
    if (cond >= SUSTAIN_THRESHOLD) {
      if (!stat.healthySince) stat.healthySince = at;
    } else {
      stat.healthySince = null;
    }
  }
}

// How many days a stat has been continuously at/above the sustain threshold.
export function sustainedDays(stat, at = Date.now()) {
  if (!stat.healthySince) return 0;
  return (at - stat.healthySince) / (24 * 60 * 60 * 1000);
}
