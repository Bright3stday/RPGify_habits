// Mastery tree — user-authored nodes, honest self-confirmation, and a scarce
// Growth-Point currency that forces trade-offs.
//
// You author each node inside an attribute "tree" (domain): a title, a
// self-defined "cleared" criteria (what mastery means to YOU, not the app), an
// eligibility threshold (attribute level or practice count), optional dependency
// edges (strict AND, or "any N of parents"), and an optional reward.
//
// Lifecycle:  locked  ->  eligible (threshold + prerequisites met)
//                     ->  unlocked (you confirm you genuinely met it AND spend
//                                   one Growth Point)
//
// Growth Points accrue on a period (weekly/monthly), roll over, and are capped
// at 2x one period's grant — so a busy stretch isn't punished, but you can't
// hoard indefinitely. Reaching eligibility is never enough on its own; the
// point spend is the real gate, and when several nodes are eligible at once you
// must choose. That choice is the mechanic.

import { levelFromXp } from './leveling.js';
import { uid, clamp, now, DAY_MS } from './util.js';

// ---- Growth Points --------------------------------------------------------

export function defaultGrowth(at = now()) {
  return { points: 3, perPeriod: 3, period: 'weekly', lastGrant: at };
}

export function periodMsOf(period) {
  return period === 'monthly' ? 30 * DAY_MS : 7 * DAY_MS;
}

export function growthCap(g) {
  return 2 * (g.perPeriod || 3);
}

// Grant any points due since the last grant, capped at 2x a period. Mutates.
export function grantDue(state, at = now()) {
  if (!state.growth) state.growth = defaultGrowth(at);
  const g = state.growth;
  if (g.lastGrant == null) { g.lastGrant = at; return; }
  const pm = periodMsOf(g.period);
  const elapsed = Math.floor((at - g.lastGrant) / pm);
  if (elapsed >= 1) {
    g.points = Math.min(growthCap(g), (g.points || 0) + elapsed * g.perPeriod);
    g.lastGrant += elapsed * pm;
  }
}

export function growthInfo(state, at = now()) {
  const g = state.growth || defaultGrowth(at);
  const pm = periodMsOf(g.period);
  return {
    points: g.points || 0,
    cap: growthCap(g),
    perPeriod: g.perPeriod,
    period: g.period,
    nextGrantAt: g.lastGrant + pm,
    nextInDays: Math.max(0, (g.lastGrant + pm - at) / DAY_MS),
  };
}

// ---- Nodes ---------------------------------------------------------------

function nodes(state) {
  if (!state.tree) state.tree = { nodes: {} };
  if (!state.tree.nodes) state.tree.nodes = {};
  return state.tree.nodes;
}

export function nodesForStat(state, statId) {
  return Object.values(nodes(state)).filter((n) => n.statId === statId);
}

// Practice = total completions logged against habits that train this attribute.
export function practiceCount(state, statId) {
  return Object.values(state.habits || {})
    .filter((h) => h.statIds && h.statIds.includes(statId))
    .reduce((a, h) => a + (h.completions != null ? h.completions : (h.history ? h.history.length : 0)), 0);
}

function thresholdMet(state, node) {
  if (node.thresholdType === 'practice') {
    return practiceCount(state, node.statId) >= node.thresholdValue;
  }
  return levelFromXp(state.stats[node.statId]?.xp || 0) >= node.thresholdValue;
}

// Parents can be strict AND, or "any N of parents" (non-linear).
function parentsSatisfied(node, all) {
  if (!node.parents || node.parents.length === 0) return true;
  const met = node.parents.filter((pid) => all[pid] && all[pid].unlocked).length;
  if (node.requireMode === 'any') return met >= Math.max(1, node.anyCount || 1);
  return met === node.parents.length;
}

// 'unlocked' | 'eligible' | 'locked'
export function nodeStatus(state, node) {
  if (node.unlocked) return 'unlocked';
  if (parentsSatisfied(node, nodes(state)) && thresholdMet(state, node)) return 'eligible';
  return 'locked';
}

export function addNode(state, data) {
  // Callers may supply an id (e.g. a recipe path that pre-resolves sibling
  // dependencies to concrete ids before creating the nodes); otherwise mint one.
  const id = data.id || uid('node');
  nodes(state)[id] = {
    id,
    statId: data.statId,
    title: (data.title || 'Mastery').trim() || 'Mastery',
    criteria: (data.criteria || '').trim(),
    thresholdType: data.thresholdType === 'practice' ? 'practice' : 'level',
    thresholdValue: clamp(Number(data.thresholdValue) || 1, 1, 100000),
    parents: Array.isArray(data.parents) ? data.parents : [],
    requireMode: data.requireMode === 'any' ? 'any' : 'all',
    anyCount: clamp(Number(data.anyCount) || 1, 1, 20),
    reward: data.reward && data.reward.type ? data.reward : null,
    confirmed: false,
    unlocked: false,
    createdAt: now(),
  };
  return nodes(state)[id];
}

export function updateNode(state, id, patch) {
  const n = nodes(state)[id];
  if (!n) return;
  if (patch.title != null) n.title = patch.title.trim() || n.title;
  if (patch.criteria != null) n.criteria = patch.criteria.trim();
  if (patch.thresholdType != null) n.thresholdType = patch.thresholdType === 'practice' ? 'practice' : 'level';
  if (patch.thresholdValue != null) n.thresholdValue = clamp(Number(patch.thresholdValue) || 1, 1, 100000);
  if (patch.parents != null) n.parents = patch.parents.filter((p) => p !== id);
  if (patch.requireMode != null) n.requireMode = patch.requireMode === 'any' ? 'any' : 'all';
  if (patch.anyCount != null) n.anyCount = clamp(Number(patch.anyCount) || 1, 1, 20);
  if (patch.reward !== undefined) n.reward = patch.reward && patch.reward.type ? patch.reward : null;
}

export function deleteNode(state, id) {
  delete nodes(state)[id];
  for (const n of Object.values(nodes(state))) {
    if (n.parents) n.parents = n.parents.filter((p) => p !== id);
  }
}

// Confirm + spend one Growth Point to unlock an eligible node.
// Returns { ok, node? , reason? }. The UI gates this behind a self-attestation.
export function unlockNode(state, nodeId, at = now()) {
  const node = nodes(state)[nodeId];
  if (!node) return { ok: false, reason: 'missing' };
  if (node.unlocked) return { ok: false, reason: 'already' };
  if (nodeStatus(state, node) !== 'eligible') return { ok: false, reason: 'not-eligible' };
  grantDue(state, at);
  if ((state.growth.points || 0) < 1) return { ok: false, reason: 'no-points' };
  state.growth.points -= 1;
  node.unlocked = true;
  node.confirmed = true;
  node.unlockedAt = at;
  return { ok: true, node };
}

// Every node currently eligible (for the forced cross-tree trade-off UI).
export function eligibleNodes(state) {
  return Object.values(nodes(state)).filter((n) => !n.unlocked && nodeStatus(state, n) === 'eligible');
}

// Aggregate rewards from unlocked nodes: per-attribute XP multiplier + global
// decay resistance + earned titles.
export function activeEffects(state) {
  const xpMultiplier = {};
  const titles = [];
  let decayResist = 0;
  for (const node of Object.values(nodes(state))) {
    if (!node.unlocked) continue;
    titles.push(node.title);
    if (node.reward) {
      if (node.reward.type === 'xp') {
        xpMultiplier[node.statId] = (xpMultiplier[node.statId] || 1) * node.reward.value;
      } else if (node.reward.type === 'resist') {
        decayResist += node.reward.value;
      }
    }
  }
  return { xpMultiplier, decayResist: Math.min(0.7, decayResist), titles };
}

// Layered layout depth for rendering a DAG (longest path from a root).
export function nodeDepth(node, all, seen = new Set()) {
  if (!node.parents || node.parents.length === 0) return 0;
  if (seen.has(node.id)) return 0; // guard against cycles
  seen.add(node.id);
  return 1 + Math.max(0, ...node.parents.map((pid) => (all[pid] ? nodeDepth(all[pid], all, seen) : -1)));
}
