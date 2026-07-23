// Pure-logic tests for the game engine. No DOM, no storage — just the math.
// Run with `npm test`. Kept dependency-free and readable on purpose.

import assert from 'node:assert';
import { levelFromXp, xpToReachLevel, levelProgress } from '../www/js/leveling.js';
import { periodMs, isDue, dueAt } from '../www/js/cadence.js';
import { habitHealth, statCondition, refreshConditions, sustainedDays } from '../www/js/condition.js';
import { DAY_MS } from '../www/js/util.js';
import {
  defaultState, addHabit, completeHabit, addStat, syncStepHabits, addLoot,
} from '../www/js/game.js';
import { evaluateTree, unlockNode, activeEffects } from '../www/js/skilltree.js';
import { setManualSteps, stepsToday } from '../www/js/pedometer.js';
import { spriteFor } from '../www/js/sprites.js';
import { rollLoot, RARITY_ORDER } from '../www/js/items.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
}

// ---- Leveling -------------------------------------------------------------
test('level curve boundaries', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(99), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(levelFromXp(299), 2);
  assert.equal(levelFromXp(300), 3);
  assert.equal(xpToReachLevel(5), 1000);
});

test('level progress within a level', () => {
  const p = levelProgress(150); // level 2, floor 100, ceil 300
  assert.equal(p.level, 2);
  assert.equal(p.into, 50);
  assert.equal(p.span, 200);
  assert.ok(Math.abs(p.pct - 0.25) < 1e-9);
});

// ---- Cadence --------------------------------------------------------------
test('cadence period + due timing', () => {
  assert.equal(periodMs({ cadenceType: 'daily' }), DAY_MS);
  assert.equal(periodMs({ cadenceType: 'weekly' }), 7 * DAY_MS);
  assert.equal(periodMs({ cadenceType: 'everyN', cadenceN: 3 }), 3 * DAY_MS);
  const h = { cadenceType: 'daily', lastCompleted: 0, retired: false };
  assert.equal(dueAt(h), DAY_MS);
  assert.ok(!isDue(h, DAY_MS - 1));
  assert.ok(isDue(h, DAY_MS + 1));
});

// ---- Decay ----------------------------------------------------------------
test('habit health: full during grace, decays after', () => {
  const daily = { cadenceType: 'daily', lastCompleted: 0, createdAt: 0, retired: false };
  assert.equal(habitHealth(daily, DAY_MS), 100); // within grace
  assert.ok(habitHealth(daily, 2.5 * DAY_MS) < 100); // past grace, decaying
  assert.equal(habitHealth(daily, 10 * DAY_MS), 0); // long gone
});

test('decay is cadence-scaled: weekly rots slower than daily in real time', () => {
  const at = 10 * DAY_MS;
  const daily = { cadenceType: 'daily', lastCompleted: 0, createdAt: 0, retired: false };
  const weekly = { cadenceType: 'weekly', lastCompleted: 0, createdAt: 0, retired: false };
  assert.ok(habitHealth(weekly, at) > habitHealth(daily, at));
});

test('stat condition averages feeders; no feeders reads full', () => {
  const state = defaultState();
  const statId = addStat(state, { name: 'Iso', color: '#fff' }).id; // clean stat
  assert.equal(statCondition(state, statId, Date.now()), 100);
  const h = addHabit(state, { name: 'x', statIds: [statId], cadenceType: 'daily' });
  h.lastCompleted = 0; h.createdAt = 0;
  const cond = statCondition(state, statId, 10 * DAY_MS);
  assert.equal(cond, 0);
});

// ---- Completion + XP ------------------------------------------------------
test('completing a habit awards XP and can level up', () => {
  const state = defaultState();
  const statId = Object.keys(state.stats)[0];
  const h = addHabit(state, { name: 'run', statIds: [statId], xpPerCompletion: 60 });
  const r1 = completeHabit(state, h.id);
  assert.equal(r1.awards[0].gain, 60);
  assert.equal(state.stats[statId].xp, 60);
  const r2 = completeHabit(state, h.id); // total 120 -> level 2
  assert.equal(r2.levelUps.length, 1);
  assert.equal(r2.levelUps[0].to, 2);
});

test('completion resets decay clock (condition back to full)', () => {
  const state = defaultState();
  const statId = addStat(state, { name: 'Iso', color: '#fff' }).id; // clean stat
  const h = addHabit(state, { name: 'x', statIds: [statId], cadenceType: 'daily' });
  h.lastCompleted = 0; h.createdAt = 0;
  refreshConditions(state, 10 * DAY_MS);
  assert.equal(state.stats[statId].condition, 0);
  completeHabit(state, h.id, 10 * DAY_MS);
  assert.equal(state.stats[statId].condition, 100);
});

// ---- Skill tree -----------------------------------------------------------
test('tree: novice available at level 2, unlock records effect', () => {
  const state = defaultState();
  const statId = Object.keys(state.stats)[0];
  const h = addHabit(state, { name: 'x', statIds: [statId], xpPerCompletion: 100 });
  completeHabit(state, h.id); // 100 xp -> level 2
  const novice = evaluateTree(state).find((n) => n.id === `${statId}_novice`);
  assert.equal(novice.status, 'available');
  const unlocked = unlockNode(state, novice.id);
  assert.ok(unlocked);
  const { titles } = activeEffects(state);
  assert.ok(titles.some((t) => t.includes('Novice')));
});

test('tree: exclusive branch locks its sibling once chosen', () => {
  const state = defaultState();
  const statId = Object.keys(state.stats)[0];
  const h = addHabit(state, { name: 'x', statIds: [statId], xpPerCompletion: 700 });
  completeHabit(state, h.id); // 700 xp -> level 4
  unlockNode(state, `${statId}_novice`);
  const power = unlockNode(state, `${statId}_power`);
  assert.ok(power, 'power should unlock at level 4');
  const steady = evaluateTree(state).find((n) => n.id === `${statId}_steady`);
  assert.equal(steady.status, 'lockedout');
  assert.equal(activeEffects(state).xpMultiplier[statId], 1.25);
});

test('tree: sustained requirement blocks then allows', () => {
  const state = defaultState();
  const statId = Object.keys(state.stats)[0];
  // Level high enough, but healthySince just now -> not yet sustained 5 days.
  state.stats[statId].xp = 700;
  unlockNode(state, `${statId}_novice`);
  state.stats[statId].healthySince = Date.now();
  refreshConditions(state);
  let steady = evaluateTree(state).find((n) => n.id === `${statId}_steady`);
  assert.equal(steady.status, 'locked'); // sustainedDays ~ 0
  // Backdate healthySince 6 days.
  state.stats[statId].healthySince = Date.now() - 6 * DAY_MS;
  steady = evaluateTree(state).find((n) => n.id === `${statId}_steady`);
  assert.equal(steady.status, 'available');
  assert.ok(sustainedDays(state.stats[statId]) >= 5);
});

// ---- Steps: auto-complete + sprite evolution ------------------------------
test('default state seeds a Daily Steps habit feeding Body', () => {
  const state = defaultState();
  const steps = Object.values(state.habits).find((h) => h.source === 'steps');
  assert.ok(steps, 'a steps habit exists');
  assert.equal(steps.stepGoal, 8000);
  const body = Object.values(state.stats).find((s) => s.name === 'Body');
  assert.ok(steps.statIds.includes(body.id), 'steps habit feeds Body');
});

test('step habit auto-completes at goal, awards XP, idempotent per day', () => {
  const state = defaultState();
  const steps = Object.values(state.habits).find((h) => h.source === 'steps');
  const body = state.stats[steps.statIds[0]];
  setManualSteps(state, 5000);
  assert.equal(syncStepHabits(state).length, 0, 'below goal: no completion');
  setManualSteps(state, 8200);
  const fired = syncStepHabits(state);
  assert.equal(fired.length, 1, 'reaching goal completes it');
  assert.equal(body.xp, 50);
  assert.equal(syncStepHabits(state).length, 0, 'same day: does not re-fire');
  // next day, goal met again -> fires again
  const tomorrow = Date.now() + 25 * 60 * 60 * 1000;
  setManualSteps(state, 9000, tomorrow);
  assert.equal(syncStepHabits(state, tomorrow).length, 1, 'new day re-fires');
  assert.equal(body.xp, 100);
});

test('manual steps roll to zero on a new day', () => {
  const state = defaultState();
  setManualSteps(state, 6000);
  assert.equal(stepsToday(state), 6000);
  assert.equal(stepsToday(state, Date.now() + 25 * 60 * 60 * 1000), 0);
});

test('sprite: FF-class ladder + monster devolution', () => {
  assert.equal(spriteFor({ xp: 2000, condition: 5 }).tier, 'slime');   // broken
  assert.equal(spriteFor({ xp: 2000, condition: 30 }).tier, 'imp');    // cracked
  assert.equal(spriteFor({ xp: 50, condition: 100 }).tier, 'adventurer'); // L1
  assert.equal(spriteFor({ xp: 700, condition: 100 }).tier, 'warrior');   // L4
  assert.equal(spriteFor({ xp: 1600, condition: 100 }).tier, 'knight');   // L6
  assert.equal(spriteFor({ xp: 3000, condition: 100 }).tier, 'mage');     // L8
  assert.ok(spriteFor({ xp: 1600, condition: 55 }).decayed, 'worn knight looks decayed');
});

// ---- Loot -----------------------------------------------------------------
test('loot: drops within chance, no drop above it', () => {
  const item = rollLoot({ streak: 0 }, () => 0);
  assert.ok(item && item.rarity === 'common' && item.id, 'rnd=0 -> common drop');
  assert.equal(rollLoot({ streak: 0 }, () => 0.99), null, 'high rnd -> no drop');
});

test('loot: high rarity roll yields legendary', () => {
  let n = 0;
  const rnd = () => { n += 1; return n === 1 ? 0 : 0.999; }; // drop, then max rarity/pick
  const item = rollLoot({ streak: 30 }, rnd);
  assert.ok(item, 'drops');
  assert.equal(item.rarity, 'legendary');
  assert.ok(RARITY_ORDER.includes(item.rarity));
});

test('addLoot appends to inventory', () => {
  const state = defaultState();
  const before = state.inventory.length;
  addLoot(state, { key: 'potion', name: 'Potion', type: 'Item', shape: 'potion', rarity: 'common', color: '#e05a5a', id: 'x' });
  assert.equal(state.inventory.length, before + 1);
});

console.log(`\n${passed} checks passed.`);
