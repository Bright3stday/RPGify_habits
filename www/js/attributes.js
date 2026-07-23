// The FF7-style character sheet.
//
// Six fixed primary attributes replace the old free-form categories. Habits
// train one or more of them. Each attribute's *score* grows permanently from
// accumulated XP (you never lose progress), while its *condition* (upkeep)
// decays with neglect — the loss-aversion signal, and what devolves your hero.
//
// Derived stats (Attack, Defense, HP, MP, ...) are computed from the primaries
// plus your character level, exactly like a JRPG status screen.

import { levelFromXp, charLevelFromXp, charProgress } from './leveling.js';

export const ATTRIBUTES = [
  { id: 'str', name: 'Strength', abbr: 'STR', color: '#e05a5a', glyph: '⚔', desc: 'Physical training & exertion' },
  { id: 'mag', name: 'Magic', abbr: 'MAG', color: '#48c8ff', glyph: '✦', desc: 'Learning & mental skill' },
  { id: 'vit', name: 'Vitality', abbr: 'VIT', color: '#6ad46a', glyph: '❤', desc: 'Health & body upkeep' },
  { id: 'spr', name: 'Spirit', abbr: 'SPR', color: '#b06af0', glyph: '☯', desc: 'Mindfulness & emotion' },
  { id: 'lck', name: 'Luck', abbr: 'LCK', color: '#f0c020', glyph: '🍀', desc: 'Chance, social & creativity' },
  { id: 'spd', name: 'Speed', abbr: 'SPD', color: '#5ad0c0', glyph: '⚡', desc: 'Consistency & productivity' },
];
export const ATTRIBUTE_IDS = ATTRIBUTES.map((a) => a.id);
export const ATTR = Object.fromEntries(ATTRIBUTES.map((a) => [a.id, a]));

// A primary attribute's displayed score (permanent, from XP). Starts at 8.
export function attributeScore(xp) {
  return 8 + levelFromXp(xp);
}

export function totalXp(state) {
  return Object.values(state.stats).reduce((a, s) => a + (s.xp || 0), 0);
}

export function scoreOf(state, id) {
  const s = state.stats[id];
  return s ? attributeScore(s.xp) : 8;
}

// The full derived character sheet.
export function characterSheet(state) {
  const xp = totalXp(state);
  const prog = charProgress(xp);
  const lvl = prog.level;
  const str = scoreOf(state, 'str');
  const mag = scoreOf(state, 'mag');
  const vit = scoreOf(state, 'vit');
  const spr = scoreOf(state, 'spr');
  const lck = scoreOf(state, 'lck');
  const spd = scoreOf(state, 'spd');
  return {
    level: lvl,
    exp: prog,
    primary: { str, mag, vit, spr, lck, spd },
    derived: {
      attack: str * 2 + lvl,
      magicAttack: mag * 2 + lvl,
      defense: vit + Math.floor(lvl / 2),
      magicDefense: spr + Math.floor(lvl / 2),
      speed: spd,
      luck: lck,
    },
    hp: 100 + vit * 25 + lvl * 20,
    mp: 8 + mag * 2 + spr,
  };
}

export function characterLevel(state) {
  return charLevelFromXp(totalXp(state));
}

// Overall condition (mean of the six attributes) — drives hero devolution.
export function overallCondition(state) {
  const vals = ATTRIBUTE_IDS.map((id) => state.stats[id]?.condition ?? 100);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
