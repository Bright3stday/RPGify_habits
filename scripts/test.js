// Pure-logic tests for the game engine. No DOM, no storage — just the math.
// Run with `npm test`. Kept dependency-free and readable on purpose.

import assert from 'node:assert';
import {
  levelFromXp, xpToReachLevel, levelProgress, charLevelFromXp, charXpToReach,
} from '../www/js/leveling.js';
import { periodMs, isDue, dueAt } from '../www/js/cadence.js';
import {
  habitHealth, statCondition, refreshConditions, sustainedDays,
} from '../www/js/condition.js';
import { DAY_MS } from '../www/js/util.js';
import {
  defaultState, addHabit, completeHabit, addStat, syncStepHabits, addLoot,
} from '../www/js/game.js';
import {
  evaluateTree, unlockNode, activeEffects, availableSp, earnedSp,
} from '../www/js/skilltree.js';
import { setManualSteps, stepsToday } from '../www/js/pedometer.js';
import { heroTierOf } from '../www/js/sprites.js';
import {
  characterSheet, characterLevel, overallCondition, totalXp,
} from '../www/js/attributes.js';
import { rollLoot, RARITY_ORDER } from '../www/js/items.js';
import { equipItem, slotForItem } from '../www/js/equipment.js';

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
test('attribute level curve boundaries', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(levelFromXp(300), 3);
  assert.equal(xpToReachLevel(5), 1000);
});

test('character level curve', () => {
  assert.equal(charXpToReach(2), 120);
  assert.equal(charLevelFromXp(0), 1);
  assert.equal(charLevelFromXp(120), 2);
  assert.equal(charLevelFromXp(360), 3); // 60*3*2 = 360
});

test('level progress within a level', () => {
  const p = levelProgress(150);
  assert.equal(p.level, 2);
  assert.equal(p.into, 50);
  assert.equal(p.span, 200);
});

// ---- Cadence --------------------------------------------------------------
test('cadence period + due timing', () => {
  assert.equal(periodMs({ cadenceType: 'daily' }), DAY_MS);
  assert.equal(periodMs({ cadenceType: 'weekly' }), 7 * DAY_MS);
  const h = { cadenceType: 'daily', lastCompleted: 0, retired: false };
  assert.ok(!isDue(h, DAY_MS - 1));
  assert.ok(isDue(h, DAY_MS + 1));
});

// ---- Decay ----------------------------------------------------------------
test('habit health: full during grace, decays after', () => {
  const daily = { cadenceType: 'daily', lastCompleted: 0, createdAt: 0, retired: false };
  assert.equal(habitHealth(daily, DAY_MS), 100);
  assert.ok(habitHealth(daily, 2.5 * DAY_MS) < 100);
  assert.equal(habitHealth(daily, 10 * DAY_MS), 0);
});

test('decay is cadence-scaled: weekly rots slower than daily', () => {
  const at = 10 * DAY_MS;
  const daily = { cadenceType: 'daily', lastCompleted: 0, createdAt: 0, retired: false };
  const weekly = { cadenceType: 'weekly', lastCompleted: 0, createdAt: 0, retired: false };
  assert.ok(habitHealth(weekly, at) > habitHealth(daily, at));
});

test('stat condition averages feeders; no feeders reads full', () => {
  const state = defaultState();
  const statId = addStat(state, { name: 'Iso', color: '#fff' }).id;
  assert.equal(statCondition(state, statId, Date.now()), 100);
  const h = addHabit(state, { name: 'x', statIds: [statId], cadenceType: 'daily' });
  h.lastCompleted = 0; h.createdAt = 0;
  assert.equal(statCondition(state, statId, 10 * DAY_MS), 0);
});

// ---- Attributes / character sheet -----------------------------------------
test('default state seeds the six fixed attributes', () => {
  const s = defaultState();
  assert.deepEqual(Object.keys(s.stats).sort(), ['lck', 'mag', 'spd', 'spr', 'str', 'vit']);
});

test('character sheet: level, derived stats, HP/MP', () => {
  const s = defaultState();
  s.stats.str.xp = 300; // STR level 3 -> score 11
  s.stats.vit.xp = 100; // VIT level 2 -> score 10
  const sheet = characterSheet(s);
  assert.equal(sheet.primary.str, 11);
  assert.equal(sheet.primary.vit, 10);
  assert.equal(totalXp(s), 400);
  assert.equal(sheet.level, characterLevel(s));
  assert.equal(sheet.derived.attack, 11 * 2 + sheet.level); // STR*2 + level
  assert.ok(sheet.hp > 100 && sheet.mp >= 8);
});

// ---- Completion + XP ------------------------------------------------------
test('completing a habit awards XP to its attribute', () => {
  const s = defaultState();
  const h = addHabit(s, { name: 'lift', statIds: ['str'], xpPerCompletion: 60 });
  const r = completeHabit(s, h.id);
  assert.equal(r.awards[0].gain, 60);
  assert.equal(s.stats.str.xp, 60);
});

// ---- Steps ----------------------------------------------------------------
test('default Daily Steps habit trains Strength and auto-completes', () => {
  const s = defaultState();
  const steps = Object.values(s.habits).find((h) => h.source === 'steps');
  assert.ok(steps.statIds.includes('str'));
  setManualSteps(s, 8200);
  const fired = syncStepHabits(s);
  assert.equal(fired.length, 1);
  assert.equal(syncStepHabits(s).length, 0); // idempotent per day
});

// ---- Skill tree (SP-gated, bonuses) --------------------------------------
test('skill points: earned per character level, spent on nodes', () => {
  const s = defaultState();
  assert.equal(availableSp(s), 0);
  s.stats.str.xp = 120; // total 120 -> char level 2 -> 1 SP
  assert.equal(earnedSp(s), 1);
  assert.equal(availableSp(s), 1);
  const novice = evaluateTree(s).find((n) => n.id === 'str_novice');
  assert.equal(novice.status, 'available'); // level>=2, has SP
  unlockNode(s, 'str_novice');
  assert.equal(availableSp(s), 0); // SP spent
});

test('tree: no SP means a met-requirement node is still locked', () => {
  const s = defaultState();
  s.stats.str.xp = 100; // attr level 2 but total 100 -> char level 1 -> 0 SP
  const novice = evaluateTree(s).find((n) => n.id === 'str_novice');
  assert.equal(novice.status, 'locked');
});

test('tree: exclusive branch locks its sibling; XP effect applies', () => {
  const s = defaultState();
  s.stats.str.xp = 700; // attr level 4; total 700 -> char level ~3 -> 2 SP
  unlockNode(s, 'str_novice');
  const power = unlockNode(s, 'str_power');
  assert.ok(power, 'power unlocks');
  assert.equal(evaluateTree(s).find((n) => n.id === 'str_steady').status, 'lockedout');
  const eff = activeEffects(s);
  assert.ok(eff.xpMultiplier.str > 1, 'str gains an XP multiplier');
});

test('tree: Steadfast node grants decay resistance (condition rises)', () => {
  const s = defaultState();
  const h = addHabit(s, { name: 'x', statIds: ['str'], cadenceType: 'daily' });
  h.lastCompleted = 0; h.createdAt = 0;
  const at = 2.6 * DAY_MS;
  const before = statCondition(s, 'str', at);
  s.tree.unlocked.push('str_steady'); // directly grant the resist effect
  const after = statCondition(s, 'str', at);
  assert.ok(after > before, `decay resist raises condition (${before} -> ${after})`);
  assert.ok(activeEffects(s).decayResist > 0);
});

// ---- Hero sprite ----------------------------------------------------------
test('hero: single class by character level, monster by condition', () => {
  const s = defaultState();
  assert.equal(heroTierOf(s), 'adventurer'); // level 1
  for (const id of Object.keys(s.stats)) s.stats[id].xp = 1200; // total high -> knight/mage
  assert.ok(['knight', 'mage'].includes(heroTierOf(s)));
  for (const id of Object.keys(s.stats)) s.stats[id].condition = 5; // broken
  assert.equal(heroTierOf(s), 'slime');
});

// ---- Loot (cosmetic) + luck from Luck attribute --------------------------
test('loot: drops within chance; high roll yields legendary', () => {
  assert.ok(rollLoot({ streak: 0 }, () => 0).rarity === 'common');
  assert.equal(rollLoot({ streak: 0 }, () => 0.99), null);
  let n = 0;
  const rnd = () => { n += 1; return n === 1 ? 0 : 0.999; };
  assert.equal(rollLoot({ streak: 30 }, rnd).rarity, 'legendary');
});

test('addLoot appends to inventory', () => {
  const s = defaultState();
  addLoot(s, { key: 'potion', name: 'Potion', type: 'Item', shape: 'potion', rarity: 'common', color: '#e05a5a', id: 'x' });
  assert.equal(s.inventory.length, 1);
});

// ---- Equipment (cosmetic only, no bonuses) -------------------------------
test('equipment: slot mapping; equipping is cosmetic', () => {
  assert.equal(slotForItem({ shape: 'sword', type: 'Weapon' }), 'weapon');
  assert.equal(slotForItem({ shape: 'potion', type: 'Item' }), null);
  const s = defaultState();
  const before = s.stats.str.xp;
  const slot = equipItem(s, { key: 'excalibur', name: 'Excalibur', type: 'Weapon', shape: 'sword', rarity: 'legendary', color: '#f0d840' });
  assert.equal(slot, 'weapon');
  assert.equal(s.equipment.weapon.key, 'excalibur');
  // completing still awards the same XP (no gear bonus)
  const h = addHabit(s, { name: 'x', statIds: ['str'], xpPerCompletion: 40 });
  completeHabit(s, h.id);
  assert.equal(s.stats.str.xp - before, 40);
});

console.log(`\n${passed} checks passed.`);
