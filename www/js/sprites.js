// Your hero — one character, drawn as a cozy-fantasy archetype.
//
//   character LEVEL   -> from Wanderer (base) into the archetype for your
//                        chosen growth path (Druid / Scholar / Ranger).
//   overall CONDITION -> DEVOLUTION (worn look -> Imp when cracked -> SLIME when broken)
//
// Leveling comes from doing real habits; devolution comes from neglect. Sprites
// are drawn procedurally on a 16x16 grid and rendered as inline SVG, so they
// stay crisp at any size, tint on decay, and need no image assets.

import { characterLevel, overallCondition, scoreOf } from './attributes.js';

// palette
const SKIN = '#e8b088';
const HAIR = '#3a2a1a';
const EYE = '#1a1a2a';
const SLIME = '#6ad46a';
const SLIMED = '#3a9a3a';
const SLIMEL = '#a8f0a8';
const WHITE = '#f4f4fb';
const GOLD = '#f0c020';
const GOLDL = '#ffe070';
// job-class materials
const LEATHER = '#8a5a2a';
const LEATHERL = '#a87038';
const IMP = '#b0484a';
const IMPD = '#7a2a2c';
const GEM_C = '#48c8ff';
// wanderer (base traveler) — warm, neutral, plain-clothes
const CLOAK = '#a8783a';
// druid (Anchor — earthy greens/browns)
const MOSS = '#5a8a4a';
const MOSSL = '#7ab868';
const BARK = '#6a4a2a';
const BARKD = '#4a3218';
const BARKL = '#8a6a44';
const LEAF = '#7ec850';
// scholar (Architect — clean blues/whites)
const SCHOLAR = '#3a6ab0';
const SCHOLARL = '#dce8f8';
const SCHOLARD = '#274a80';
const PAPER = '#f4f0e0';
// ranger (Catalyst — practical greys/leathers)
const HOOD = '#6a6a70';
const HOODD = '#48484e';
const RANGERC = '#7a6a56';
const RANGERD = '#4a3e30';
const BOWWOOD = '#5a3a20';
const BOWSTR = '#e8e8e8';

// tiny pixel canvas
class Px {
  constructor(n = 16) {
    this.n = n;
    this.g = Array.from({ length: n }, () => Array(n).fill(null));
  }
  // stored as g[x][y]
  put(x, y, c) { if (c && x >= 0 && x < this.n && y >= 0 && y < this.n) this.g[x][y] = c; }
  rect(x, y, w, h, c) {
    for (let i = 0; i < w; i += 1) for (let j = 0; j < h; j += 1) this.put(x + i, y + j, c);
  }
  disc(cx, cy, r, c) {
    for (let x = -r; x <= r; x += 1) {
      for (let y = -r; y <= r; y += 1) {
        if (x * x + y * y <= r * r + Math.floor(r / 2)) this.put(cx + x, cy + y, c);
      }
    }
  }
  cells() {
    const out = [];
    for (let x = 0; x < this.n; x += 1) {
      for (let y = 0; y < this.n; y += 1) {
        if (this.g[x][y]) out.push([x, y, this.g[x][y]]);
      }
    }
    return out;
  }
}

// ---- sprite builders (feet ~row 15) -------------------------------------

function slime() {
  const p = new Px();
  // squat rounded dome, wider than tall
  p.rect(6, 6, 4, 1, SLIME);       // rounded top
  p.rect(5, 7, 6, 1, SLIME);
  p.rect(4, 8, 8, 2, SLIME);       // rows 8-9
  p.rect(3, 10, 10, 3, SLIME);     // widest band rows 10-12
  p.rect(4, 13, 8, 1, SLIMED);     // base shadow
  p.put(5, 7, SLIMEL); p.put(6, 6, SLIMEL); // shine
  p.rect(6, 9, 1, 2, WHITE); p.rect(9, 9, 1, 2, WHITE); // eyes
  p.put(6, 10, EYE); p.put(9, 10, EYE);                 // pupils
  p.rect(7, 11, 2, 1, SLIMED);     // mouth
  return { grid: p };
}

function imp() { // cracked -> a lesser monster (partway to slime)
  const p = new Px();
  p.put(5, 3, IMPD); p.put(6, 2, IMPD);    // horns
  p.put(11, 3, IMPD); p.put(10, 2, IMPD);
  p.disc(8, 5, 2, IMP);                     // head
  p.put(6, 5, GOLD); p.put(10, 5, GOLD);    // glowing eyes
  p.rect(7, 6, 3, 1, IMPD);                 // grin
  p.rect(6, 8, 4, 3, IMP);                  // little body
  p.put(5, 8, IMP); p.put(10, 8, IMP);      // arms
  p.rect(6, 11, 1, 2, IMP); p.rect(9, 11, 1, 2, IMP); // legs
  p.put(6, 13, IMPD); p.put(9, 13, IMPD);   // claws
  p.put(11, 10, IMPD); p.put(12, 11, IMPD); // tail
  return { grid: p };
}

// Base traveler — everyone starts here, regardless of path.
function wanderer() {
  const p = new Px();
  p.disc(8, 3, 2, SKIN);
  p.rect(6, 1, 5, 1, HAIR);
  p.put(7, 3, EYE); p.put(9, 3, EYE);
  p.rect(6, 6, 4, 5, CLOAK);         // simple travel cloak
  p.rect(6, 10, 4, 1, LEATHER);      // belt
  p.put(7, 6, LEATHERL); p.put(8, 7, LEATHERL); // satchel strap
  p.rect(5, 6, 1, 4, SKIN); p.rect(10, 6, 1, 4, SKIN); // arms
  p.rect(6, 11, 2, 4, LEATHER); p.rect(8, 11, 2, 4, LEATHER); // legs
  p.rect(6, 15, 2, 1, EYE); p.rect(8, 15, 2, 1, EYE);  // boots
  return { grid: p };
}

// The Anchor — steady, grounded, resilient. Earthy greens and browns.
function druid() {
  const p = new Px();
  p.disc(8, 3, 2, SKIN);
  p.rect(6, 1, 5, 1, HAIR);
  p.put(6, 1, LEAF); p.put(10, 1, LEAF); // leaf-crown sprigs
  p.put(7, 3, EYE); p.put(9, 3, EYE);
  p.rect(4, 6, 7, 1, BARKL);         // broad wrap collar
  p.rect(5, 6, 5, 5, MOSS);          // mossy-green robe
  p.put(6, 7, MOSSL); p.put(7, 8, MOSSL);
  p.rect(4, 7, 1, 3, SKIN); p.rect(10, 7, 1, 3, SKIN); // arms
  p.rect(12, 2, 1, 7, BARK);         // wooden staff
  p.put(12, 2, LEAF);                // leaf tip
  p.rect(11, 8, 3, 1, BARKL);        // staff binding
  p.rect(6, 11, 2, 4, BARKD); p.rect(8, 11, 2, 4, BARKD); // leggings
  p.rect(6, 15, 2, 1, EYE); p.rect(8, 15, 2, 1, EYE);
  return { grid: p };
}

// The Architect — deep focus, calm clarity. Clean blues and whites.
function scholar() {
  const p = new Px();
  p.disc(8, 3, 2, SKIN);
  p.rect(6, 1, 5, 1, HAIR);
  p.put(7, 3, EYE); p.put(9, 3, EYE);
  p.rect(4, 6, 8, 1, SCHOLARL);      // trimmed shoulders
  p.rect(5, 6, 6, 5, SCHOLAR);       // clean robe
  p.put(6, 7, SCHOLARL); p.put(9, 8, GEM_C); // trim + small emblem
  p.rect(4, 7, 1, 3, SCHOLARD);      // book-holding arm sleeve
  p.rect(3, 8, 2, 2, PAPER);         // open book
  p.rect(11, 7, 1, 3, SCHOLARD);     // other sleeve
  p.rect(6, 11, 2, 4, SCHOLARD); p.rect(8, 11, 2, 4, SCHOLARD);
  p.rect(6, 15, 2, 1, SCHOLARL); p.rect(8, 15, 2, 1, SCHOLARL);
  return { grid: p, aura: true };
}

// The Catalyst — momentum, execution. Practical greys and worn leathers.
function ranger() {
  const p = new Px();
  p.rect(6, 1, 5, 2, HOOD);          // hood over head
  p.rect(7, 3, 3, 1, SKIN);          // face peeking out
  p.put(7, 3, EYE); p.put(9, 3, EYE);
  p.rect(6, 5, 5, 1, HOODD);         // hood trim
  p.rect(5, 6, 6, 5, RANGERC);       // leather-grey travel coat
  p.rect(4, 13, 8, 1, RANGERD);      // hem
  p.rect(4, 6, 1, 4, RANGERD); p.rect(11, 6, 1, 4, RANGERD); // side straps
  p.rect(12, 3, 1, 9, BOWWOOD);      // bow stave
  p.put(12, 3, BOWSTR); p.put(12, 11, BOWSTR); // bowstring nocks
  p.rect(3, 9, 1, 2, RANGERD);       // quiver hint
  p.rect(6, 11, 2, 4, RANGERD); p.rect(8, 11, 2, 4, RANGERD);
  p.rect(6, 15, 2, 1, EYE); p.rect(8, 15, 2, 1, EYE);
  return { grid: p };
}

const BUILDERS = {
  slime, imp, wanderer, druid, scholar, ranger,
};
export const TIER_NAMES = {
  slime: 'Slime', imp: 'Imp', wanderer: 'Wanderer', druid: 'Druid', scholar: 'Scholar', ranger: 'Ranger',
};

// Growth path (from the onboarding quiz, `state.settings.path`) -> the sprite
// tier it evolves into once past the base Wanderer stage.
const PATH_TO_TIER = { anchor: 'druid', architect: 'scholar', catalyst: 'ranger' };

// Which growth path the hero currently embodies. Uses the path chosen in the
// onboarding quiz when set; older saves that never took the quiz (or players
// who skipped it) fall back to whichever path their stats already lean
// toward, so a returning user still sees an archetype that fits them.
function archetypeId(state) {
  const chosen = state.settings && state.settings.path;
  if (PATH_TO_TIER[chosen]) return chosen;
  const anchor = scoreOf(state, 'vit') + scoreOf(state, 'spr');
  const architect = scoreOf(state, 'mag') + scoreOf(state, 'spr');
  const catalyst = scoreOf(state, 'spd') + scoreOf(state, 'str');
  const top = Math.max(anchor, architect, catalyst);
  if (top === catalyst) return 'catalyst';
  if (top === architect) return 'architect';
  return 'anchor';
}

// The hero's class by character level + chosen path; monster devolution by
// overall condition.
function heroTier(level, cond, pathId) {
  if (cond < 15) return 'slime';    // broken -> goo
  if (cond < 40) return 'imp';      // cracked -> lesser monster
  if (level <= 3) return 'wanderer';
  return PATH_TO_TIER[pathId] || 'wanderer';
}

export function heroTierOf(state) {
  return heroTier(characterLevel(state), overallCondition(state), archetypeId(state));
}
export function heroTierName(state) {
  return TIER_NAMES[heroTierOf(state)];
}

// The single main hero sprite, from the whole character's level + condition.
export function heroSpriteSvg(state, { size = 96 } = {}) {
  const cond = overallCondition(state);
  const tier = heroTierOf(state);
  const { grid, aura } = BUILDERS[tier]();
  const decayed = cond < 75 && tier !== 'slime' && tier !== 'imp';
  const rects = grid.cells()
    .map(([x, y, c]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`)
    .join('');
  const glow = aura
    ? `<defs><filter id="au"><feGaussianBlur stdDeviation="1.1"/></filter></defs>
       <circle cx="8" cy="8" r="7" fill="${GOLD}" opacity="0.28" filter="url(#au)"/>`
    : '';
  const filter = decayed ? 'filter:saturate(0.4) brightness(0.85);' : '';
  return `<svg class="sprite" viewBox="-1 -1 18 18" width="${size}" height="${size}"
    shape-rendering="crispEdges" style="${filter}" xmlns="http://www.w3.org/2000/svg">
    ${glow}${rects}</svg>`;
}
