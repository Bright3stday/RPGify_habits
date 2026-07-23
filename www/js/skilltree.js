// Skill tree — branching, not a linear ladder.
//
// Stats are user-defined at setup, so the tree can't be hand-authored against
// fixed stat names. Instead each stat grows an identical *shape* — a diamond:
//
//         Novice            (depth 0)
//        /      \
//   Power       Steadfast   (depth 1, MUTUALLY EXCLUSIVE — pick one)
//        \      /
//         Master            (depth 2, needs whichever branch you chose)
//
// The two depth-1 nodes are an exclusive choice: taking one permanently locks
// the other, so progression is a real decision, not a checklist. The Steadfast
// branch and the Master capstone are gated on *sustained* condition (days spent
// not decaying), not just accumulated XP — the tree rewards consistency.

import { levelFromXp } from './leveling.js';
import { sustainedDays } from './condition.js';

// Build the full node list for the current set of stats. Pure — derives
// structure from state.stats; unlock state lives in state.tree.unlocked.
export function buildTree(state) {
  const nodes = [];
  const stats = Object.values(state.stats);
  stats.forEach((stat, i) => {
    const s = stat.id;
    const group = `${s}_focus`; // exclusive-choice group id
    nodes.push({
      id: `${s}_novice`,
      statId: s,
      title: 'Novice',
      desc: `Awaken your ${stat.name}.`,
      parents: [],
      parentsMode: 'all',
      req: { minLevel: 2 },
      exclusiveGroup: null,
      effect: { type: 'title', value: `${stat.name} Novice` },
      lane: 0,
      depth: 0,
      statIndex: i,
    });
    nodes.push({
      id: `${s}_power`,
      statId: s,
      title: 'Path of Power',
      desc: `Raw growth — +25% XP toward ${stat.name}.`,
      parents: [`${s}_novice`],
      parentsMode: 'all',
      req: { minLevel: 4 },
      exclusiveGroup: group,
      effect: { type: 'xpMultiplier', value: 1.25 },
      lane: -1,
      depth: 1,
      statIndex: i,
    });
    nodes.push({
      id: `${s}_steady`,
      statId: s,
      title: 'Path of the Steadfast',
      desc: `Consistency — +15% XP toward ${stat.name}. Requires 5 days without decay.`,
      parents: [`${s}_novice`],
      parentsMode: 'all',
      req: { minLevel: 3, sustainedDays: 5 },
      exclusiveGroup: group,
      effect: { type: 'xpMultiplier', value: 1.15 },
      lane: 1,
      depth: 1,
      statIndex: i,
    });
    nodes.push({
      id: `${s}_master`,
      statId: s,
      title: 'Master',
      desc: `Mastery of ${stat.name}. Requires 10 days without decay.`,
      parents: [`${s}_power`, `${s}_steady`],
      parentsMode: 'any', // whichever branch you took
      req: { minLevel: 7, sustainedDays: 10 },
      exclusiveGroup: null,
      effect: { type: 'title', value: `${stat.name} Master` },
      lane: 0,
      depth: 2,
      statIndex: i,
    });
  });
  return nodes;
}

function parentsSatisfied(node, unlockedSet) {
  if (node.parents.length === 0) return true;
  if (node.parentsMode === 'any') {
    return node.parents.some((p) => unlockedSet.has(p));
  }
  return node.parents.every((p) => unlockedSet.has(p));
}

// Is a sibling in the same exclusive group already unlocked?
function lockedOut(node, nodes, unlockedSet) {
  if (!node.exclusiveGroup) return false;
  return nodes.some(
    (n) =>
      n.id !== node.id &&
      n.exclusiveGroup === node.exclusiveGroup &&
      unlockedSet.has(n.id),
  );
}

function reqMet(node, state, at) {
  const stat = state.stats[node.statId];
  if (!stat) return false;
  const level = levelFromXp(stat.xp);
  if (node.req.minLevel && level < node.req.minLevel) return false;
  if (node.req.minXp && stat.xp < node.req.minXp) return false;
  if (node.req.sustainedDays && sustainedDays(stat, at) < node.req.sustainedDays) {
    return false;
  }
  return true;
}

// Classify every node: 'unlocked' | 'available' | 'locked' | 'lockedout'.
export function evaluateTree(state, at = Date.now()) {
  const nodes = buildTree(state);
  const unlocked = new Set(state.tree?.unlocked || []);
  return nodes.map((node) => {
    let status;
    if (unlocked.has(node.id)) {
      status = 'unlocked';
    } else if (lockedOut(node, nodes, unlocked)) {
      status = 'lockedout';
    } else if (parentsSatisfied(node, unlocked) && reqMet(node, state, at)) {
      status = 'available';
    } else {
      status = 'locked';
    }
    return { ...node, status };
  });
}

// Attempt to unlock a node by id. Returns the node on success, null otherwise.
export function unlockNode(state, nodeId, at = Date.now()) {
  const evaluated = evaluateTree(state, at);
  const node = evaluated.find((n) => n.id === nodeId);
  if (!node || node.status !== 'available') return null;
  if (!state.tree) state.tree = { unlocked: [] };
  if (!state.tree.unlocked.includes(nodeId)) {
    state.tree.unlocked.push(nodeId);
  }
  return node;
}

// Aggregate active effects. Currently: per-stat XP multiplier + earned titles.
export function activeEffects(state) {
  const unlocked = new Set(state.tree?.unlocked || []);
  const nodes = buildTree(state);
  const xpMultiplier = {}; // statId -> multiplier
  const titles = [];
  for (const node of nodes) {
    if (!unlocked.has(node.id)) continue;
    if (node.effect.type === 'xpMultiplier') {
      xpMultiplier[node.statId] = (xpMultiplier[node.statId] || 1) * node.effect.value;
    } else if (node.effect.type === 'title') {
      titles.push(node.effect.value);
    }
  }
  return { xpMultiplier, titles };
}
