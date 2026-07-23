// Skill tree — where progression bonuses now live (moved off of items).
//
// One diamond per primary attribute:
//
//         Adept             (depth 0)
//        /      \
//   Power       Steadfast   (depth 1, MUTUALLY EXCLUSIVE — pick one)
//        \      /
//         Master            (depth 2, needs whichever branch you chose)
//
// Power nodes grant +XP toward that attribute; Steadfast/Master nodes grant
// decay resistance. Unlocking a node costs a Skill Point (earned 1 per
// character level) plus attribute-level and sustained-consistency requirements.
// So bonuses come from growing the real habits, not from loot.

import { levelFromXp, charLevelFromXp } from './leveling.js';
import { totalXp } from './attributes.js';
import { DAY_MS } from './util.js';

// Local copy so this module doesn't import condition.js (avoids a cycle:
// condition.js reads activeEffects() from here).
function sustainedDays(stat, at) {
  if (!stat || !stat.healthySince) return 0;
  return (at - stat.healthySince) / DAY_MS;
}

export function buildTree(state) {
  const nodes = [];
  Object.values(state.stats).forEach((stat, i) => {
    const s = stat.id;
    const group = `${s}_focus`;
    nodes.push({
      id: `${s}_novice`, statId: s, title: 'Adept', cost: 1,
      desc: `Awaken your ${stat.name}. +10% ${stat.name} XP.`,
      parents: [], parentsMode: 'all', req: { minLevel: 2 },
      exclusiveGroup: null, effect: { type: 'xp', value: 1.1 },
      earnedTitle: `${stat.name} Adept`, lane: 0, depth: 0, statIndex: i,
    });
    nodes.push({
      id: `${s}_power`, statId: s, title: 'Path of Power', cost: 1,
      desc: `Raw growth — +30% ${stat.name} XP.`,
      parents: [`${s}_novice`], parentsMode: 'all', req: { minLevel: 4 },
      exclusiveGroup: group, effect: { type: 'xp', value: 1.3 },
      lane: -1, depth: 1, statIndex: i,
    });
    nodes.push({
      id: `${s}_steady`, statId: s, title: 'Path of the Steadfast', cost: 1,
      desc: `Resilience — +15% decay resistance. Needs 5 days without decay.`,
      parents: [`${s}_novice`], parentsMode: 'all', req: { minLevel: 3, sustainedDays: 5 },
      exclusiveGroup: group, effect: { type: 'resist', value: 0.15 },
      lane: 1, depth: 1, statIndex: i,
    });
    nodes.push({
      id: `${s}_master`, statId: s, title: 'Master', cost: 2,
      desc: `Mastery of ${stat.name}. +10% decay resistance. Needs 10 days without decay.`,
      parents: [`${s}_power`, `${s}_steady`], parentsMode: 'any',
      req: { minLevel: 7, sustainedDays: 10 },
      exclusiveGroup: null, effect: { type: 'resist', value: 0.1 },
      earnedTitle: `${stat.name} Master`, lane: 0, depth: 2, statIndex: i,
    });
  });
  return nodes;
}

// ---- Skill points --------------------------------------------------------
// One SP earned per character level (beyond 1); each unlocked node spends its
// cost. Available = earned − spent.

export function earnedSp(state) {
  return Math.max(0, charLevelFromXp(totalXp(state)) - 1);
}
export function spentSp(state) {
  const unlocked = new Set(state.tree?.unlocked || []);
  return buildTree(state).reduce((sum, n) => (unlocked.has(n.id) ? sum + n.cost : sum), 0);
}
export function availableSp(state) {
  return earnedSp(state) - spentSp(state);
}

function parentsSatisfied(node, unlockedSet) {
  if (node.parents.length === 0) return true;
  if (node.parentsMode === 'any') return node.parents.some((p) => unlockedSet.has(p));
  return node.parents.every((p) => unlockedSet.has(p));
}

function lockedOut(node, nodes, unlockedSet) {
  if (!node.exclusiveGroup) return false;
  return nodes.some((n) => n.id !== node.id && n.exclusiveGroup === node.exclusiveGroup && unlockedSet.has(n.id));
}

function reqMet(node, state, at) {
  const stat = state.stats[node.statId];
  if (!stat) return false;
  if (node.req.minLevel && levelFromXp(stat.xp) < node.req.minLevel) return false;
  if (node.req.sustainedDays && sustainedDays(stat, at) < node.req.sustainedDays) return false;
  if (availableSp(state) < node.cost) return false; // need the skill point
  return true;
}

// 'unlocked' | 'available' | 'locked' | 'lockedout'
export function evaluateTree(state, at = Date.now()) {
  const nodes = buildTree(state);
  const unlocked = new Set(state.tree?.unlocked || []);
  return nodes.map((node) => {
    let status;
    if (unlocked.has(node.id)) status = 'unlocked';
    else if (lockedOut(node, nodes, unlocked)) status = 'lockedout';
    else if (parentsSatisfied(node, unlocked) && reqMet(node, state, at)) status = 'available';
    else status = 'locked';
    return { ...node, status };
  });
}

export function unlockNode(state, nodeId, at = Date.now()) {
  const node = evaluateTree(state, at).find((n) => n.id === nodeId);
  if (!node || node.status !== 'available') return null;
  if (!state.tree) state.tree = { unlocked: [] };
  if (!state.tree.unlocked.includes(nodeId)) state.tree.unlocked.push(nodeId);
  return node;
}

// Aggregate: per-attribute XP multiplier, global decay resistance, titles.
export function activeEffects(state) {
  const unlocked = new Set(state.tree?.unlocked || []);
  const xpMultiplier = {};
  const titles = [];
  let decayResist = 0;
  for (const node of buildTree(state)) {
    if (!unlocked.has(node.id)) continue;
    if (node.effect.type === 'xp') {
      xpMultiplier[node.statId] = (xpMultiplier[node.statId] || 1) * node.effect.value;
    } else if (node.effect.type === 'resist') {
      decayResist += node.effect.value;
    }
    if (node.earnedTitle) titles.push(node.earnedTitle);
  }
  return { xpMultiplier, decayResist: Math.min(0.7, decayResist), titles };
}
