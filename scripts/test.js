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

test('sessionLine: factual, reflects leaving on the nudge', () => {
  assert.equal(sessionLine({ durationSec: 1980, package: 'x' }, 'Instagram'), 'Instagram · 33 min');
  assert.ok(sessionLine({ durationSec: 1200, alerted: true, leftAfterAlertSec: 20 }, 'IG')
    .includes('left soon after the nudge'));
  assert.ok(sessionLine({ durationSec: 1200, alerted: true, leftAfterAlertSec: 600 }, 'IG')
    .includes('stayed after the nudge'));
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

console.log(`\n${passed} checks passed.`);
