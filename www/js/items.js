// Loot. Completing a quest doesn't just give XP — it can drop treasure.
//
// Every completion rolls the loot table (a longer streak improves both the drop
// chance and the odds of something rare — consistency pays out). Items are pure
// collectibles: weapons, armour, treasure, and consumables in classic FF flavor,
// each drawn as a small pixel icon (inline SVG, no assets) tinted by the item.

import { uid, now } from './util.js';

export const RARITY = {
  common: { label: 'Common', color: '#b8b8c8', weight: 60 },
  uncommon: { label: 'Uncommon', color: '#6ad46a', weight: 25 },
  rare: { label: 'Rare', color: '#48c8ff', weight: 10 },
  epic: { label: 'Epic', color: '#b06af0', weight: 4 },
  legendary: { label: 'Legendary', color: '#f0c020', weight: 1 },
};
export const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

// shape = which pixel icon; color = the item's own tint.
export const LOOT_TABLE = [
  // weapons
  { key: 'rusty_dagger', name: 'Rusty Dagger', type: 'Weapon', shape: 'dagger', rarity: 'common', color: '#9a8a6a' },
  { key: 'iron_sword', name: 'Iron Sword', type: 'Weapon', shape: 'sword', rarity: 'common', color: '#c8c8d8' },
  { key: 'battle_axe', name: 'Battle Axe', type: 'Weapon', shape: 'axe', rarity: 'uncommon', color: '#c0c0d0' },
  { key: 'silver_rapier', name: 'Silver Rapier', type: 'Weapon', shape: 'sword', rarity: 'rare', color: '#e4e4f4' },
  { key: 'flame_blade', name: 'Flame Blade', type: 'Weapon', shape: 'sword', rarity: 'epic', color: '#e0603a' },
  { key: 'excalibur', name: 'Excalibur', type: 'Weapon', shape: 'sword', rarity: 'legendary', color: '#f0d840' },
  // armour
  { key: 'leather_cap', name: 'Leather Cap', type: 'Armour', shape: 'helm', rarity: 'common', color: '#8a5a2a' },
  { key: 'bronze_shield', name: 'Bronze Shield', type: 'Armour', shape: 'shield', rarity: 'common', color: '#b07838' },
  { key: 'iron_helm', name: 'Iron Helm', type: 'Armour', shape: 'helm', rarity: 'uncommon', color: '#b8b8c8' },
  { key: 'chain_mail', name: 'Chain Mail', type: 'Armour', shape: 'armor', rarity: 'rare', color: '#a8a8c0' },
  { key: 'knights_plate', name: "Knight's Plate", type: 'Armour', shape: 'armor', rarity: 'epic', color: '#d4d4e4' },
  { key: 'dragon_shield', name: 'Dragon Shield', type: 'Armour', shape: 'shield', rarity: 'legendary', color: '#f0c020' },
  // treasure
  { key: 'gil_pouch', name: 'Gil Pouch', type: 'Treasure', shape: 'coin', rarity: 'common', color: '#f0c020' },
  { key: 'sapphire', name: 'Sapphire', type: 'Treasure', shape: 'gem', rarity: 'rare', color: '#48c8ff' },
  { key: 'ruby', name: 'Ruby', type: 'Treasure', shape: 'gem', rarity: 'rare', color: '#e05a5a' },
  { key: 'emerald', name: 'Emerald', type: 'Treasure', shape: 'gem', rarity: 'epic', color: '#6ad46a' },
  { key: 'ancient_relic', name: 'Ancient Relic', type: 'Treasure', shape: 'gem', rarity: 'legendary', color: '#b06af0' },
  // consumables
  { key: 'potion', name: 'Potion', type: 'Item', shape: 'potion', rarity: 'common', color: '#e05a5a' },
  { key: 'ether', name: 'Ether', type: 'Item', shape: 'potion', rarity: 'uncommon', color: '#48c8ff' },
  { key: 'phoenix_down', name: 'Phoenix Down', type: 'Item', shape: 'potion', rarity: 'rare', color: '#f0a020' },
  { key: 'elixir', name: 'Elixir', type: 'Item', shape: 'potion', rarity: 'epic', color: '#f0c020' },
];

const BY_KEY = Object.fromEntries(LOOT_TABLE.map((i) => [i.key, i]));
export function itemByKey(key) { return BY_KEY[key]; }

// Weighted rarity pick, biased upward by `luck` (0..~0.3 from streak).
function pickRarity(luck, rnd) {
  const w = {
    common: RARITY.common.weight * (1 - Math.min(0.8, luck * 1.6)),
    uncommon: RARITY.uncommon.weight * (1 + luck),
    rare: RARITY.rare.weight * (1 + luck * 3),
    epic: RARITY.epic.weight * (1 + luck * 6),
    legendary: RARITY.legendary.weight * (1 + luck * 12),
  };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (const [k, v] of Object.entries(w)) {
    if ((r -= v) <= 0) return k;
  }
  return 'common';
}

// Roll loot for a completion. Returns an item instance or null (no drop).
// `rnd` is injectable for tests.
export function rollLoot(habit = {}, rnd = Math.random) {
  const streak = habit.streak || 0;
  const dropChance = 0.35 + Math.min(0.2, streak * 0.01);
  if (rnd() > dropChance) return null;
  const luck = Math.min(0.3, streak * 0.02);
  let rarity = pickRarity(luck, rnd);
  let pool = LOOT_TABLE.filter((i) => i.rarity === rarity);
  while (pool.length === 0) { // safety, shouldn't happen
    rarity = 'common';
    pool = LOOT_TABLE.filter((i) => i.rarity === rarity);
  }
  const base = pool[Math.floor(rnd() * pool.length)];
  return { ...base, id: uid('loot'), ts: now() };
}

// ---- pixel icons --------------------------------------------------------

class G {
  constructor(n = 16) { this.n = n; this.g = Array.from({ length: n }, () => Array(n).fill(null)); }
  put(x, y, c) { if (c && x >= 0 && x < this.n && y >= 0 && y < this.n) this.g[x][y] = c; }
  rect(x, y, w, h, c) { for (let i = 0; i < w; i += 1) for (let j = 0; j < h; j += 1) this.put(x + i, y + j, c); }
  cells() {
    const out = [];
    for (let x = 0; x < this.n; x += 1) for (let y = 0; y < this.n; y += 1) if (this.g[x][y]) out.push([x, y, this.g[x][y]]);
    return out;
  }
}

const DARK = '#0a0a1a';
const WHITE = '#f4f4fb';
const WOOD = '#8a5a2a';
const STEEL = '#c8c8d8';
const GOLD = '#f0c020';

function light(c) { return c; } // items already carry their tint

const SHAPES = {
  sword(c) {
    const g = new G();
    g.rect(7, 2, 2, 9, c); g.put(7, 2, WHITE);       // blade
    g.rect(5, 11, 6, 1, GOLD);                        // guard
    g.rect(7, 12, 2, 2, WOOD);                        // grip
    g.put(7, 14, GOLD);                               // pommel
    return g;
  },
  dagger(c) {
    const g = new G();
    g.rect(7, 5, 2, 6, c); g.put(7, 5, WHITE);
    g.rect(6, 11, 4, 1, GOLD);
    g.rect(7, 12, 2, 2, WOOD);
    return g;
  },
  axe(c) {
    const g = new G();
    g.rect(8, 2, 1, 12, WOOD);                        // haft
    g.rect(4, 3, 4, 4, c); g.put(4, 3, WHITE);        // head
    g.rect(9, 3, 3, 3, c);                            // back spike
    return g;
  },
  shield(c) {
    const g = new G();
    g.rect(4, 3, 8, 7, c);
    g.rect(5, 10, 6, 2, c);
    g.rect(6, 12, 4, 1, c);
    g.rect(4, 3, 8, 1, WHITE);                        // top rim highlight
    g.rect(7, 5, 2, 5, GOLD); g.rect(5, 6, 6, 2, GOLD); // cross
    return g;
  },
  helm(c) {
    const g = new G();
    g.rect(5, 4, 6, 5, c);
    g.rect(5, 4, 6, 1, WHITE);
    g.rect(4, 8, 8, 2, c);                            // brim
    g.rect(6, 6, 4, 1, DARK);                         // visor slit
    return g;
  },
  armor(c) {
    const g = new G();
    g.rect(4, 4, 8, 2, c);                            // shoulders
    g.rect(5, 6, 6, 6, c);
    g.rect(5, 6, 1, 6, WHITE);                        // highlight edge
    g.put(8, 8, GOLD);                                // emblem
    g.rect(6, 12, 4, 1, c);
    return g;
  },
  coin(c) {
    const g = new G();
    g.rect(6, 4, 5, 5, c); g.rect(7, 3, 3, 7, c);     // front coin
    g.put(7, 4, WHITE);
    g.rect(4, 9, 5, 4, c); g.rect(5, 8, 3, 6, c);     // second coin
    g.put(5, 9, WHITE);
    return g;
  },
  gem(c) {
    const g = new G();
    g.rect(6, 3, 4, 1, WHITE);                        // table
    g.rect(5, 4, 6, 1, c);
    g.rect(4, 5, 8, 3, c);
    g.rect(5, 8, 6, 2, c);
    g.rect(6, 10, 4, 1, c);
    g.put(7, 11, c); g.put(8, 11, c);                 // point
    g.put(6, 5, WHITE); g.put(7, 4, WHITE);           // sparkle
    return g;
  },
  potion(c) {
    const g = new G();
    g.rect(7, 2, 2, 2, WOOD);                         // cork
    g.rect(6, 4, 4, 1, STEEL);                        // neck
    g.rect(5, 5, 6, 7, c);                            // body
    g.rect(6, 12, 4, 1, c);
    g.put(6, 6, WHITE);                               // shine
    return g;
  },
};

// Render an item's pixel icon as inline SVG.
export function itemIconSvg(item, { size = 40 } = {}) {
  const build = SHAPES[item.shape] || SHAPES.gem;
  const grid = build(item.color);
  const rects = grid.cells()
    .map(([x, y, c]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`)
    .join('');
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" shape-rendering="crispEdges"
    xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}
