// Steps source. Offline, no accounts.
//
// Native (Android): reads the hardware step-counter sensor via the bundled
// `StepCounter` Capacitor plugin (see android StepCounterPlugin.java). That
// sensor reports steps *since the last reboot*, so we keep a per-day baseline
// and derive "today" from the delta.
//
// Web / no sensor: falls back to a manual count the user (or the dev tester)
// sets directly. Either way the rest of the game only reads `stepsToday()`, so
// auto-complete and the avatar behave identically regardless of source.

import { dayKey } from './util.js';

function plugin() {
  const c = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return c && c.Plugins && c.Plugins.StepCounter;
}

export function hasSensor() {
  return !!plugin();
}

// Read cumulative since-boot steps from the sensor, or null if unavailable.
async function readSensor() {
  const p = plugin();
  if (!p) return null;
  try {
    const res = await p.getSteps();
    if (res && res.available && typeof res.steps === 'number') return res.steps;
  } catch (e) {
    console.warn('step sensor read failed', e);
  }
  return null;
}

export async function ensurePermission() {
  const p = plugin();
  if (!p || !p.requestPermission) return hasSensor();
  try {
    const res = await p.requestPermission();
    return !!(res && res.granted);
  } catch (e) {
    return false;
  }
}

// On native, request the activity-recognition permission once per session so
// the first sensor read can succeed.
let permRequested = false;
async function ensureNativePermission() {
  if (!hasSensor() || permRequested) return;
  permRequested = true;
  await ensurePermission();
}

// Pull the latest count from the sensor (if any) into state.meta.steps.
// Manual mode has no sensor; its count is set via setManualSteps.
export async function refreshSteps(state, at = Date.now()) {
  const dk = dayKey(at);
  await ensureNativePermission();
  const boot = await readSensor();
  if (boot == null) {
    // No sensor: just roll the manual counter over at midnight.
    if (state.meta.steps && state.meta.steps.day !== dk) {
      state.meta.steps = { day: dk, count: 0 };
    }
    return stepsToday(state, at);
  }
  let bl = state.meta.stepBaseline;
  // New day, first run, or a reboot (counter went backwards) -> rebaseline.
  if (!bl || bl.day !== dk || boot < bl.boot) {
    bl = { day: dk, boot };
    state.meta.stepBaseline = bl;
  }
  const today = Math.max(0, boot - bl.boot);
  state.meta.steps = { day: dk, count: today };
  return today;
}

export function stepsToday(state, at = Date.now()) {
  const s = state.meta.steps;
  if (s && s.day === dayKey(at)) return s.count;
  return 0;
}

export function setManualSteps(state, n, at = Date.now()) {
  state.meta.steps = { day: dayKey(at), count: Math.max(0, Math.round(n)) };
}

export function addManualSteps(state, n, at = Date.now()) {
  setManualSteps(state, stepsToday(state, at) + n, at);
}
