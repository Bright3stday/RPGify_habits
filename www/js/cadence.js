// Cadence: how often a habit is expected. This is the unit that scales both
// "is it due?" and how fast decay bites — a lapsed weekly habit must not rot
// as fast as a lapsed daily one, so everything downstream is expressed in
// multiples of the habit's own period rather than absolute time.

import { DAY_MS } from './util.js';

export const CADENCE_TYPES = [
  { type: 'daily', label: 'Daily' },
  { type: 'everyN', label: 'Every N days' },
  { type: 'weekly', label: 'Weekly' },
];

// The cadence period in milliseconds.
export function periodMs(habit) {
  switch (habit.cadenceType) {
    case 'daily':
      return DAY_MS;
    case 'weekly':
      return 7 * DAY_MS;
    case 'everyN':
      return Math.max(1, habit.cadenceN || 1) * DAY_MS;
    default:
      return DAY_MS;
  }
}

export function cadenceLabel(habit) {
  switch (habit.cadenceType) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'everyN':
      return `Every ${Math.max(1, habit.cadenceN || 1)} days`;
    default:
      return 'Daily';
  }
}

// When the habit next becomes due (epoch ms). Never completed => due now.
export function dueAt(habit) {
  if (habit.lastCompleted == null) return 0;
  return habit.lastCompleted + periodMs(habit);
}

export function isDue(habit, at = Date.now()) {
  if (habit.retired) return false;
  return at >= dueAt(habit);
}
