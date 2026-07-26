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
  addNode, nodeStatus, unlockNode, eligibleNodes, activeEffects,
  grantDue, growthInfo, growthCap, practiceCount,
} from '../www/js/skilltree.js';
import { setManualSteps, stepsToday } from '../www/js/pedometer.js';
import { heroTierOf } from '../www/js/sprites.js';
import {
  characterSheet, characterLevel, overallCondition, totalXp,
} from '../www/js/attributes.js';
import { rollLoot, RARITY_ORDER } from '../www/js/items.js';
import { equipItem, slotForItem } from '../www/js/equipment.js';
import { spreadMinutes } from '../www/js/notifications.js';
import {
  currentSession, shouldAlert, observationCopy, sanitizeConfig, nextFireDelayMs, probeSummary,
  watchedSessions, sessionLine, watchedMinutesSince,
} from '../www/js/doomscroll.js';
import { shouldApply, describeStatus } from '../www/js/ota.js';
import {
  applyLedger, recoverOnQuest, decayedWear, defaultSpiritTrack, spiritWear, SPIRIT_TUNING,
} from '../www/js/spirit.js';
import {
  QUEST_RECIPES, MASTERY_RECIPES, recipeToHabit, recipeToNodeSpecs, recipesForStat,
} from '../www/js/recipes.js';
import { ATTRIBUTE_IDS } from '../www/js/attributes.js';

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

test('overall condition averages only engaged stats (focused user)', () => {
  // Fresh save trains only Strength (seeded Daily Steps). Let every habit lapse.
  const s = defaultState();
  for (const h of Object.values(s.habits)) { h.lastCompleted = 0; h.createdAt = 0; }
  refreshConditions(s, 10 * DAY_MS);
  const strCond = s.stats.str.condition;
  assert.ok(strCond < 30);                         // Strength has decayed hard
  assert.equal(overallCondition(s), strCond);      // not diluted by 5 untrained stats at 100
});

test('overall condition falls back to all six when nothing is trained', () => {
  const s = defaultState();
  for (const h of Object.values(s.habits)) h.retired = true; // no feeders anywhere
  refreshConditions(s);
  assert.equal(overallCondition(s), 100);
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

// ---- Mastery tree: authored nodes, eligibility, growth points ------------
test('growth points: accrue per period, cap at 2x, roll over', () => {
  const s = defaultState();
  s.growth = { points: 0, perPeriod: 3, period: 'weekly', lastGrant: 0 };
  grantDue(s, 6 * DAY_MS); // < 1 week -> nothing
  assert.equal(s.growth.points, 0);
  grantDue(s, 8 * DAY_MS); // 1 week -> +3
  assert.equal(s.growth.points, 3);
  grantDue(s, 60 * DAY_MS); // many weeks at once, but capped at 2x = 6
  assert.equal(s.growth.points, growthCap(s.growth));
  assert.equal(growthInfo(s).cap, 6);
});

test('node lifecycle: locked -> eligible (threshold) -> unlock spends a point', () => {
  const s = defaultState();
  const n = addNode(s, { statId: 'mag', title: 'T', thresholdType: 'level', thresholdValue: 3 });
  assert.equal(nodeStatus(s, n), 'locked');       // MAG level 1
  s.stats.mag.xp = 300;                            // -> level 3
  assert.equal(nodeStatus(s, n), 'eligible');
  s.growth.points = 0;
  assert.equal(unlockNode(s, n.id).reason, 'no-points'); // eligibility alone isn't enough
  s.growth.points = 1;
  const res = unlockNode(s, n.id);
  assert.ok(res.ok && s.tree.nodes[n.id].unlocked);
  assert.equal(s.growth.points, 0);               // point spent
});

test('practice threshold uses uncapped completion count', () => {
  const s = defaultState();
  const h = addHabit(s, { name: 'read', statIds: ['mag'], xpPerCompletion: 5 });
  const n = addNode(s, { statId: 'mag', title: 'P', thresholdType: 'practice', thresholdValue: 3 });
  completeHabit(s, h.id); completeHabit(s, h.id);
  assert.equal(practiceCount(s, 'mag'), 2);
  assert.equal(nodeStatus(s, n), 'locked');
  completeHabit(s, h.id);
  assert.equal(nodeStatus(s, n), 'eligible');
});

test('any-N parents: non-linear prerequisites', () => {
  const s = defaultState();
  const a = addNode(s, { statId: 'str', title: 'A', thresholdType: 'level', thresholdValue: 1 });
  const b = addNode(s, { statId: 'str', title: 'B', thresholdType: 'level', thresholdValue: 1 });
  const c = addNode(s, { statId: 'str', title: 'C', thresholdType: 'level', thresholdValue: 1 });
  const gate = addNode(s, {
    statId: 'str', title: 'Gate', thresholdType: 'level', thresholdValue: 1,
    parents: [a.id, b.id, c.id], requireMode: 'any', anyCount: 2,
  });
  s.growth.points = 9;
  assert.equal(nodeStatus(s, gate), 'locked');    // 0 parents unlocked
  unlockNode(s, a.id);
  assert.equal(nodeStatus(s, gate), 'locked');    // 1 of 3
  unlockNode(s, b.id);
  assert.equal(nodeStatus(s, gate), 'eligible');  // 2 of 3 -> satisfied
});

test('optional reward: unlocked node grants XP mult + decay resist', () => {
  const s = defaultState();
  s.stats.str.xp = 300; s.growth.points = 5;
  const xpNode = addNode(s, { statId: 'str', title: 'X', thresholdType: 'level', thresholdValue: 1, reward: { type: 'xp', value: 1.2 } });
  const rNode = addNode(s, { statId: 'str', title: 'R', thresholdType: 'level', thresholdValue: 1, reward: { type: 'resist', value: 0.2 } });
  unlockNode(s, xpNode.id); unlockNode(s, rNode.id);
  const eff = activeEffects(s);
  assert.ok(Math.abs(eff.xpMultiplier.str - 1.2) < 1e-9);
  assert.ok(Math.abs(eff.decayResist - 0.2) < 1e-9);
});

test('eligibleNodes lists cross-tree candidates for the forced trade-off', () => {
  const s = defaultState();
  s.stats.str.xp = 1000; s.stats.mag.xp = 1000; // both high level
  const a = addNode(s, { statId: 'str', title: 'A', thresholdType: 'level', thresholdValue: 2 });
  const b = addNode(s, { statId: 'mag', title: 'B', thresholdType: 'level', thresholdValue: 2 });
  const ids = eligibleNodes(s).map((n) => n.id);
  assert.ok(ids.includes(a.id) && ids.includes(b.id));
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

// ---- Reminder spacing -----------------------------------------------------
test('spreadMinutes: nudges are ordered, in-range, and never clump', () => {
  for (const n of [1, 2, 3, 4]) {
    for (let trial = 0; trial < 200; trial += 1) {
      const m = spreadMinutes(n, Math.random);
      assert.equal(m.length, n);
      for (let i = 0; i < n; i += 1) {
        assert.ok(m[i] >= 0 && m[i] <= 59, `minute in range (${m[i]})`);
        if (i > 0) assert.ok(m[i] - m[i - 1] >= 5, `>=5 min gap (${m.join(',')})`);
      }
    }
  }
  // extremes: rnd->0 hugs bucket starts, rnd->~1 hugs bucket ends; still spaced
  assert.deepEqual(spreadMinutes(2, () => 0), [6, 36]);
});

// ---- Doomscroll reflection alert -----------------------------------------
const MIN = 60000;
test('doomscroll currentSession: continuous session, resets on switch-away', () => {
  const watched = ['com.ig', 'com.tt'];
  let s = currentSession([{ package: 'com.ig', type: 'foreground', timestamp: 0 }], watched, 25 * MIN);
  assert.ok(s && s.package === 'com.ig' && Math.round(s.elapsedMs / MIN) === 25);
  // switching to another app ends the session (now foreground is unwatched)
  s = currentSession([
    { package: 'com.ig', type: 'foreground', timestamp: 0 },
    { package: 'com.other', type: 'foreground', timestamp: 10 * MIN },
  ], watched, 25 * MIN);
  assert.equal(s, null);
  // backgrounding ends it too
  s = currentSession([
    { package: 'com.ig', type: 'foreground', timestamp: 0 },
    { package: 'com.ig', type: 'background', timestamp: 5 * MIN },
  ], watched, 25 * MIN);
  assert.equal(s, null);
  // re-open counts from zero
  s = currentSession([
    { package: 'com.ig', type: 'foreground', timestamp: 0 },
    { package: 'com.ig', type: 'background', timestamp: 5 * MIN },
    { package: 'com.ig', type: 'foreground', timestamp: 20 * MIN },
  ], watched, 25 * MIN);
  assert.ok(s && Math.round(s.elapsedMs / MIN) === 5);
});

test('doomscroll shouldAlert: threshold + once/every retrigger', () => {
  const once = { mode: 'once' };
  const every = { mode: 'every', everyMin: 15 };
  assert.equal(shouldAlert({ elapsedMin: 10, thresholdMin: 20, lastAlertMin: null, retrigger: once }), false);
  assert.equal(shouldAlert({ elapsedMin: 20, thresholdMin: 20, lastAlertMin: null, retrigger: once }), true);
  assert.equal(shouldAlert({ elapsedMin: 40, thresholdMin: 20, lastAlertMin: 20, retrigger: once }), false);
  assert.equal(shouldAlert({ elapsedMin: 34, thresholdMin: 20, lastAlertMin: 20, retrigger: every }), false);
  assert.equal(shouldAlert({ elapsedMin: 35, thresholdMin: 20, lastAlertMin: 20, retrigger: every }), true);
});

test('doomscroll copy is a factual mirror — no instructional/evaluative words', () => {
  const c = observationCopy('Instagram', 28);
  assert.ok(c.includes('28') && c.includes('Instagram'));
  const banned = ['should', 'stop', 'put down', 'too', 'enough', 'limit', 'warning', 'break', 'quit', 'distract', 'wast'];
  const lc = c.toLowerCase();
  banned.forEach((w) => assert.ok(!lc.includes(w), `copy must not contain "${w}": ${c}`));
});

test('doomscroll nextFireDelayMs: schedules precisely at the crossing', () => {
  const sess = { package: 'x', start: 0 };
  const once = { mode: 'once' };
  const every = { mode: 'every', everyMin: 15 };
  // 5 min in, 20-min threshold -> fire in 15 min
  assert.equal(nextFireDelayMs({ session: sess, thresholdMin: 20, lastAlertMin: null, retrigger: once }, 5 * MIN), 15 * MIN);
  // already past the threshold -> fire now (0)
  assert.equal(nextFireDelayMs({ session: sess, thresholdMin: 20, lastAlertMin: null, retrigger: once }, 25 * MIN), 0);
  // once, already alerted -> never again
  assert.equal(nextFireDelayMs({ session: sess, thresholdMin: 20, lastAlertMin: 20, retrigger: once }, 30 * MIN), null);
  // every 15: alerted at 20, now 30 -> next at 35 -> 5 min
  assert.equal(nextFireDelayMs({ session: sess, thresholdMin: 20, lastAlertMin: 20, retrigger: every }, 30 * MIN), 5 * MIN);
  assert.equal(nextFireDelayMs({ session: null, thresholdMin: 20, lastAlertMin: null, retrigger: once }, 0), null);
});

test('doomscroll probeSummary: factual one-liner for each state', () => {
  assert.match(probeSummary({ native: false }), /Android app only/);
  assert.match(probeSummary({ native: true, granted: false }), /not granted/);
  assert.match(probeSummary({ native: true, granted: true, foreground: false }), /No foreground app/);
  assert.equal(
    probeSummary({ native: true, granted: true, foreground: true, label: 'Instagram', elapsedMin: 12, watched: true }),
    'Instagram · 12 min this session · watched',
  );
});

test('doomscroll sanitizeConfig clamps and filters', () => {
  const c = sanitizeConfig({
    enabled: 1, pollMinutes: 999,
    apps: [{ package: 'a', label: 'A', thresholdMin: 9999 }, { label: 'nopkg' }],
    retrigger: { mode: 'weird', everyMin: 0 },
  });
  assert.equal(c.enabled, true);
  assert.equal(c.pollMinutes, 30);
  assert.equal(c.apps.length, 1);
  assert.equal(c.apps[0].thresholdMin, 600);
  assert.equal(c.retrigger.mode, 'once');
  assert.equal(c.retrigger.everyMin, 1);
  assert.equal(c.path, 'oracle'); // default path
});

test('doomscroll sanitizeConfig: path is oracle unless explicitly sentinel', () => {
  assert.equal(sanitizeConfig({ path: 'sentinel' }).path, 'sentinel');
  assert.equal(sanitizeConfig({ path: 'oracle' }).path, 'oracle');
  assert.equal(sanitizeConfig({ path: 'garbage' }).path, 'oracle');
  assert.equal(sanitizeConfig({}).path, 'oracle');
});

// ---- doomscroll ledger (raw event log the native detector records) ------

test('watchedSessions: only watched sessions, newest first, capped', () => {
  const events = [
    { type: 'session', package: 'a', watched: true, ts: 100, durationSec: 600 },
    { type: 'session', package: 'b', watched: false, ts: 200, durationSec: 60 }, // not watched
    { type: 'threshold', package: 'a', ts: 250 }, // not a session
    { type: 'session', package: 'c', watched: true, ts: 300, durationSec: 120 },
  ];
  const out = watchedSessions(events, 10);
  assert.equal(out.length, 2);
  assert.equal(out[0].package, 'c'); // newest first
  assert.equal(out[1].package, 'a');
  assert.equal(watchedSessions(events, 1).length, 1); // capped
});

test('sessionLine: factual, reflects leaving on the nudge (legacy rows)', () => {
  assert.equal(sessionLine({ durationSec: 1980, package: 'x' }, 'Instagram'), 'Instagram · 33 min');
  assert.ok(sessionLine({ durationSec: 1200, alerted: true, leftAfterAlertSec: 20 }, 'IG')
    .includes('left soon after the nudge'));
  assert.ok(sessionLine({ durationSec: 1200, alerted: true, leftAfterAlertSec: 600 }, 'IG')
    .includes('stayed after the nudge'));
});

test('sessionLine: paths-era rows describe time past the limit', () => {
  // 20-min limit, 33-min session = 13 min past.
  assert.equal(sessionLine({ durationSec: 1980, thresholdMin: 20 }, 'Instagram'),
    'Instagram · 33 min · 13 min past your 20-min limit');
  // Ended under the limit — just the duration, no tail.
  assert.equal(sessionLine({ durationSec: 600, thresholdMin: 20 }, 'IG'), 'IG · 10 min');
});

test('watchedMinutesSince: sums watched session minutes in window', () => {
  const events = [
    { type: 'session', watched: true, end: 1000, durationSec: 600 }, // before window
    { type: 'session', watched: true, end: 5000, durationSec: 1200 }, // 20 min
    { type: 'session', watched: false, end: 6000, durationSec: 6000 }, // not watched
    { type: 'session', watched: true, end: 7000, durationSec: 300 }, // 5 min
  ];
  assert.equal(Math.round(watchedMinutesSince(events, 2000)), 25);
});

// ---- doomscroll → Spirit scoring ----------------------------------------

const now0 = Date.UTC(2026, 0, 10, 12, 0, 0);
const sess = (seq, over) => ({
  seq, type: 'session', watched: true, alerted: true, leftAfterAlertSec: over, ts: now0,
});

test('spirit: leaving soon after the nudge grants capped XP', () => {
  const t0 = defaultSpiritTrack();
  const events = [sess(1, 20), sess(2, 45), sess(3, 10)]; // 3 restrained exits
  const { track, gainedXp } = applyLedger(t0, events, now0);
  // 3 * 6 = 18, exactly the daily cap.
  assert.equal(gainedXp, 18);
  assert.equal(track.xp, 18);
  // A 4th restrained exit the same day earns nothing (cap reached).
  const r2 = applyLedger(track, [sess(4, 15)], now0);
  assert.equal(r2.gainedXp, 0);
  assert.equal(r2.track.xp, 18);
});

test('spirit: bingeing past the nudge adds capped wear', () => {
  const t0 = defaultSpiritTrack();
  const events = [sess(1, 600), sess(2, 600), sess(3, 600), sess(4, 600)]; // 4 binges
  const { track } = applyLedger(t0, events, now0);
  assert.equal(track.wear, SPIRIT_TUNING.wearMax); // capped, not 0.8
});

test('spirit: only NEW ledger events (seq > lastSeq) are scored', () => {
  const t0 = { ...defaultSpiritTrack(), lastSeq: 2 };
  const { gainedXp, track } = applyLedger(t0, [sess(1, 10), sess(2, 10), sess(3, 10)], now0);
  assert.equal(gainedXp, 6); // only seq 3 counts
  assert.equal(track.lastSeq, 3);
});

test('spirit: wear self-heals over time and drops to zero eventually', () => {
  const t = { ...defaultSpiritTrack(), wear: 0.4, wearAt: now0 };
  const oneHalfLife = now0 + SPIRIT_TUNING.wearHalfLifeMs;
  assert.ok(Math.abs(decayedWear(t, oneHalfLife) - 0.2) < 1e-9);
  assert.equal(decayedWear(t, now0 + 100 * SPIRIT_TUNING.wearHalfLifeMs), 0); // snaps to 0
});

test('spirit: wear is hidden while the doomscroll feature is disabled', () => {
  const track = { wear: 0.4, wearAt: now0 };
  assert.equal(spiritWear({ spiritTrack: track, settings: { doomscroll: { enabled: false } } }, now0), 0);
  assert.ok(spiritWear({ spiritTrack: track, settings: { doomscroll: { enabled: true } } }, now0) > 0.39);
});

test('spirit: completing a quest burns down wear', () => {
  const t = { ...defaultSpiritTrack(), wear: 0.3, wearAt: now0 };
  const after = recoverOnQuest(t, now0);
  assert.ok(Math.abs(after.wear - (0.3 - SPIRIT_TUNING.recoverPerQuest)) < 1e-9);
});

test('spirit: neutral events (not watched / not alerted) never score', () => {
  const t0 = defaultSpiritTrack();
  const events = [
    { seq: 1, type: 'session', watched: false, alerted: true, leftAfterAlertSec: 10, ts: now0 },
    { seq: 2, type: 'session', watched: true, alerted: false, leftAfterAlertSec: -1, ts: now0 },
    { seq: 3, type: 'threshold', watched: true, ts: now0 },
  ];
  const { gainedXp, addedWear, track } = applyLedger(t0, events, now0);
  assert.equal(gainedXp, 0);
  assert.equal(addedWear, 0);
  assert.equal(track.lastSeq, 3); // still advances the cursor
});

// Duration-based scoring — the paths-era rows (thresholdMin + durationSec), used
// identically by Oracle (reconstructed on open) and Sentinel (recorded live).
const durSess = (seq, durationSec, thresholdMin = 20) => ({
  seq, type: 'session', watched: true, thresholdMin, durationSec, ts: now0,
});

test('spirit(duration): crossing the threshold without bingeing grants capped XP', () => {
  const t0 = defaultSpiritTrack();
  // 20-min threshold = 1200s. Cross it but stay under the binge window (300s).
  const events = [durSess(1, 1200), durSess(2, 1400), durSess(3, 1490)];
  const { track, gainedXp } = applyLedger(t0, events, now0);
  assert.equal(gainedXp, 18);        // 3 * 6, exactly the daily cap
  const r2 = applyLedger(track, [durSess(4, 1300)], now0);
  assert.equal(r2.gainedXp, 0);      // cap reached
});

test('spirit(duration): ending before the threshold is neutral (no farming)', () => {
  const t0 = defaultSpiritTrack();
  // Many short sessions that never reach the 20-min reflection point.
  const events = [durSess(1, 60), durSess(2, 600), durSess(3, 1199)];
  const { gainedXp, addedWear, track } = applyLedger(t0, events, now0);
  assert.equal(gainedXp, 0);
  assert.equal(addedWear, 0);
  assert.equal(track.lastSeq, 3);
});

test('spirit(duration): bingeing past the threshold adds capped wear', () => {
  const t0 = defaultSpiritTrack();
  // 1200s threshold + 300s binge window = 1500s. Four full binges.
  const events = [durSess(1, 1500), durSess(2, 1800), durSess(3, 2000), durSess(4, 3000)];
  const { track } = applyLedger(t0, events, now0);
  assert.equal(track.wear, SPIRIT_TUNING.wearMax);
});

// ---- OTA update logic ---------------------------------------------------

test('ota shouldApply: newer applicable bundle applies', () => {
  const d = shouldApply(10, { build: 12, url: 'x.zip', minNative: 1 }, 1);
  assert.equal(d.apply, true);
  assert.equal(d.reason, 'ready');
});

test('ota shouldApply: same or older build is up-to-date', () => {
  assert.equal(shouldApply(12, { build: 12, url: 'x.zip' }, 1).reason, 'up-to-date');
  assert.equal(shouldApply(12, { build: 9, url: 'x.zip' }, 1).reason, 'up-to-date');
});

test('ota shouldApply: bundle needing newer native waits for an APK', () => {
  const d = shouldApply(10, { build: 20, url: 'x.zip', minNative: 3 }, 1);
  assert.equal(d.apply, false);
  assert.equal(d.reason, 'needs-apk');
});

test('ota shouldApply: unknown native version does not block', () => {
  // If we can't read the installed versionCode, don't wrongly gate the update.
  const d = shouldApply(10, { build: 20, url: 'x.zip', minNative: 3 }, null);
  assert.equal(d.apply, true);
});

test('ota shouldApply: malformed manifest is rejected', () => {
  assert.equal(shouldApply(10, null, 1).reason, 'invalid');
  assert.equal(shouldApply(10, { build: 'x', url: 'y' }, 1).reason, 'invalid');
  assert.equal(shouldApply(10, { build: 12 }, 1).reason, 'invalid'); // no url
});

test('ota describeStatus covers each status', () => {
  for (const s of ['web', 'current', 'needs-apk', 'applied', 'offline', 'error']) {
    assert.ok(describeStatus({ status: s, build: 1 }).length > 0);
  }
  // 'available' reads the nested manifest build.
  assert.ok(describeStatus({ status: 'available', manifest: { build: 7 } }).includes('7'));
});

// ---- Recipes: mapping helpers -------------------------------------------

test('recipeToHabit: maps cadence + clamps xp/stepGoal into addHabit shape', () => {
  const daily = recipeToHabit({ title: 'A', statIds: ['mag'], cadence: { type: 'daily' }, xpPerCompletion: 20, source: 'manual' });
  assert.equal(daily.cadenceType, 'daily');
  assert.deepEqual(daily.statIds, ['mag']);
  const everyN = recipeToHabit({ title: 'B', statIds: ['str'], cadence: { type: 'everyN', n: 3 }, xpPerCompletion: 5000 });
  assert.equal(everyN.cadenceType, 'everyN');
  assert.equal(everyN.cadenceN, 3);
  assert.equal(everyN.xpPerCompletion, 1000); // clamped to max
  const weekly = recipeToHabit({ title: 'C', statIds: ['spr'], cadence: { type: 'weekly' }, xpPerCompletion: 40 });
  assert.equal(weekly.cadenceType, 'weekly');
  // Step habits are forced daily and get a clamped goal.
  const steps = recipeToHabit({ title: 'D', statIds: ['str'], source: 'steps', stepGoal: 9, cadence: { type: 'weekly' } });
  assert.equal(steps.source, 'steps');
  assert.equal(steps.cadenceType, 'daily');
  assert.equal(steps.stepGoal, 100); // clamped to min
});

test('recipeToHabit: filters out unknown stat ids', () => {
  const h = recipeToHabit({ title: 'X', statIds: ['str', 'bogus', 'mag'], cadence: { type: 'daily' }, xpPerCompletion: 10 });
  assert.deepEqual(h.statIds, ['str', 'mag']);
});

test('recipeToHabit output is accepted by addHabit unchanged', () => {
  const s = defaultState();
  const recipe = QUEST_RECIPES.find((r) => r.id === 'str-resistance');
  const h = addHabit(s, recipeToHabit(recipe));
  assert.equal(h.name, 'Strength session');
  assert.equal(h.cadenceType, 'everyN');
  assert.ok(h.statIds.includes('str'));
});

test('recipeToNodeSpecs: single node -> one spec, converted reward, no parents', () => {
  const recipe = { statId: 'str', title: 'T', nodes: [
    { key: 'a', title: 'A', criteria: 'c', threshold: { type: 'practice', value: 45 }, reward: { type: 'decayResist', pct: 15 } },
  ] };
  const specs = recipeToNodeSpecs(recipe);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].thresholdType, 'practice');
  assert.equal(specs[0].thresholdValue, 45);
  assert.deepEqual(specs[0].parents, []);
  assert.deepEqual(specs[0].reward, { type: 'resist', value: 0.15 });
});

test('recipeToNodeSpecs: resolves dependsOn keys to created ids, parents first', () => {
  let n = 0;
  const makeId = () => `nid${(n += 1)}`;
  const recipe = { statId: 'str', title: 'Path', nodes: [
    { key: 'base', title: 'Base', threshold: { type: 'level', value: 1 },
      dependsOn: { mode: 'all', keys: ['consistency', 'heavy'] }, reward: { type: 'xp', pct: 5 } },
    { key: 'consistency', title: 'Consistency', threshold: { type: 'practice', value: 20 } },
    { key: 'heavy', title: 'Heavy', threshold: { type: 'level', value: 6 } },
  ] };
  const specs = recipeToNodeSpecs(recipe, makeId);
  // Parents must be created before the child that depends on them.
  const order = specs.map((sp) => sp.key);
  assert.ok(order.indexOf('consistency') < order.indexOf('base'));
  assert.ok(order.indexOf('heavy') < order.indexOf('base'));
  const byKey = Object.fromEntries(specs.map((sp) => [sp.key, sp]));
  assert.deepEqual(byKey.base.parents.sort(), [byKey.consistency.id, byKey.heavy.id].sort());
  assert.equal(byKey.base.requireMode, 'all');
  assert.deepEqual(byKey.base.reward, { type: 'xp', value: 1.05 });
});

test('recipeToNodeSpecs: any-N path carries mode + count', () => {
  const recipe = { statId: 'mag', title: 'Poly', nodes: [
    { key: 'x', title: 'X', threshold: { type: 'practice', value: 5 } },
    { key: 'y', title: 'Y', threshold: { type: 'level', value: 2 } },
    { key: 'z', title: 'Z', threshold: { type: 'practice', value: 5 } },
    { key: 'cap', title: 'Cap', threshold: { type: 'level', value: 1 },
      dependsOn: { mode: 'any', keys: ['x', 'y', 'z'], count: 2 } },
  ] };
  const specs = recipeToNodeSpecs(recipe);
  const cap = specs.find((sp) => sp.key === 'cap');
  assert.equal(cap.requireMode, 'any');
  assert.equal(cap.anyCount, 2);
  assert.equal(cap.parents.length, 3);
});

test('recipeToNodeSpecs specs create a wired dependency via addNode', () => {
  const s = defaultState();
  const recipe = MASTERY_RECIPES.find((r) => r.id === 'str-foundations');
  const specs = recipeToNodeSpecs(recipe);
  for (const spec of specs) addNode(s, spec);
  const base = Object.values(s.tree.nodes).find((x) => x.title === 'Strength Base');
  assert.ok(base && base.parents.length === 2);
  // The referenced parent ids are real nodes now present in the tree.
  assert.ok(base.parents.every((pid) => !!s.tree.nodes[pid]));
});

// ---- Recipes: catalog integrity -----------------------------------------

test('catalog: every quest recipe is well-formed and covers all six stats', () => {
  const ids = new Set();
  const covered = new Set();
  for (const r of QUEST_RECIPES) {
    assert.ok(r.id && !ids.has(r.id), `unique id: ${r.id}`);
    ids.add(r.id);
    assert.ok((r.title || '').trim().length, `non-empty title: ${r.id}`);
    assert.ok(Array.isArray(r.statIds) && r.statIds.length, `has statIds: ${r.id}`);
    r.statIds.forEach((sid) => {
      assert.ok(ATTRIBUTE_IDS.includes(sid), `valid stat ${sid} in ${r.id}`);
      covered.add(sid);
    });
    assert.ok(['daily', 'everyN', 'weekly'].includes(r.cadence.type), `valid cadence: ${r.id}`);
    if (r.source === 'steps') assert.ok(r.stepGoal > 0, `steps recipe has goal: ${r.id}`);
    assert.ok(r.xpPerCompletion > 0, `has xp: ${r.id}`);
    assert.ok((r.why || '').trim().length, `has rationale: ${r.id}`);
  }
  assert.deepEqual([...covered].sort(), [...ATTRIBUTE_IDS].sort());
});

test('catalog: every mastery recipe is well-formed and covers all six stats', () => {
  const ids = new Set();
  const covered = new Set();
  let pathCount = 0;
  for (const r of MASTERY_RECIPES) {
    assert.ok(r.id && !ids.has(r.id), `unique id: ${r.id}`);
    ids.add(r.id);
    assert.ok((r.title || '').trim().length, `non-empty title: ${r.id}`);
    assert.ok(ATTRIBUTE_IDS.includes(r.statId), `valid stat: ${r.id}`);
    covered.add(r.statId);
    assert.ok(Array.isArray(r.nodes) && r.nodes.length, `has nodes: ${r.id}`);
    const keys = new Set();
    for (const node of r.nodes) {
      assert.ok(node.key && !keys.has(node.key), `unique node key ${node.key} in ${r.id}`);
      keys.add(node.key);
      assert.ok((node.title || '').trim().length, `node title in ${r.id}`);
      assert.ok(['practice', 'level'].includes(node.threshold.type), `node threshold type in ${r.id}`);
    }
    // dependsOn keys must reference real sibling keys (no dangling deps).
    for (const node of r.nodes) {
      if (!node.dependsOn) continue;
      pathCount += 1;
      node.dependsOn.keys.forEach((k) => assert.ok(keys.has(k), `dep key ${k} exists in ${r.id}`));
      if (node.dependsOn.mode === 'any') {
        assert.ok(node.dependsOn.count >= 1 && node.dependsOn.count <= node.dependsOn.keys.length, `any-count sane in ${r.id}`);
      }
    }
  }
  assert.deepEqual([...covered].sort(), [...ATTRIBUTE_IDS].sort());
  assert.ok(pathCount >= 1, 'at least one multi-node path exists');
});

test('recipesForStat: returns both kinds for a stat', () => {
  const { quests, mastery } = recipesForStat('str');
  assert.ok(quests.length >= 1 && mastery.length >= 1);
  assert.ok(quests.every((r) => r.statIds.includes('str')));
  assert.ok(mastery.every((r) => r.statId === 'str'));
});

console.log(`\n${passed} checks passed.`);
