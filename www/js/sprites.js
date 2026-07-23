// Evolving stat avatars — the loss-aversion payoff made literal.
//
// A stat's sprite reflects the two forces already in the game:
//   • XP/level  -> EVOLUTION  (average -> fit -> champion)
//   • condition -> DEVOLUTION (worn look -> unfit blob -> a SLIME when broken)
//
// Because step-habit completions feed the Body stat's XP and reset its decay,
// walking literally levels your avatar up, and neglect literally melts it into
// a slime. Sprites are drawn procedurally on a 16x16 pixel grid and rendered as
// inline SVG so they stay crisp at any size, tint on decay, and need no assets.

import { levelFromXp } from './leveling.js';

// palette
const SKIN = '#e8b088';
const SKIND = '#c88860';
const HAIR = '#3a2a1a';
const EYE = '#1a1a2a';
const SLIME = '#6ad46a';
const SLIMED = '#3a9a3a';
const SLIMEL = '#a8f0a8';
const WHITE = '#f4f4fb';
const GREY = '#9a9ab0';
const GREYD = '#5a5a70';
const GOLD = '#f0c020';
const GOLDL = '#ffe070';
const RED = '#e05a5a';
const GREEN = '#6ad46a';
const BLUE = '#48c8ff';
const NAVY = '#2a4a8a';
// job-class materials
const LEATHER = '#8a5a2a';
const LEATHERL = '#a87038';
const STEEL = '#a8a8c0';
const STEELD = '#6a6a8a';
const STEELL = '#dcdcec';
const ROBE = '#5a3aaa';
const ROBED = '#3a2070';
const ROBEL = '#7a5aca';
const IMP = '#b0484a';
const IMPD = '#7a2a2c';
const GEM_C = '#48c8ff';

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

function adventurer() {
  const p = new Px();
  p.disc(8, 3, 2, SKIN);
  p.rect(6, 1, 5, 1, HAIR);
  p.put(7, 3, EYE); p.put(9, 3, EYE);
  p.rect(6, 6, 4, 5, GREEN);        // green tunic
  p.rect(6, 10, 4, 1, LEATHER);     // belt
  p.put(7, 6, LEATHERL); p.put(8, 7, LEATHERL); // shoulder strap
  p.rect(5, 6, 1, 4, SKIN); p.rect(10, 6, 1, 4, SKIN); // arms
  p.rect(6, 11, 2, 4, LEATHER); p.rect(8, 11, 2, 4, LEATHER); // legs
  p.rect(6, 15, 2, 1, EYE); p.rect(8, 15, 2, 1, EYE);  // boots
  return { grid: p };
}

function warrior() {
  const p = new Px();
  p.disc(8, 3, 2, SKIN);            // head first...
  p.rect(6, 1, 5, 1, HAIR);         // ...then hair
  p.rect(6, 2, 5, 1, RED);          // ...then red bandana on top
  p.put(7, 3, EYE); p.put(9, 3, EYE);
  p.rect(4, 6, 7, 1, LEATHERL);     // broad shoulders
  p.rect(5, 6, 5, 5, LEATHER);      // leather cuirass
  p.put(6, 7, LEATHERL); p.put(7, 8, LEATHERL); // strap
  p.rect(4, 7, 1, 3, SKIN);         // left arm
  p.rect(10, 7, 1, 3, SKIN);        // right arm (sword hand)
  p.rect(12, 2, 1, 7, GOLD);        // sword blade
  p.put(12, 2, GOLDL);
  p.rect(11, 8, 3, 1, STEELL);      // guard
  p.rect(6, 11, 2, 4, STEELD); p.rect(8, 11, 2, 4, STEELD); // greaves
  p.rect(6, 15, 2, 1, EYE); p.rect(8, 15, 2, 1, EYE);
  return { grid: p };
}

function knight() {
  const p = new Px();
  p.rect(8, 0, 1, 2, RED);          // plume
  p.rect(6, 2, 5, 3, STEEL);        // helm
  p.rect(6, 2, 5, 1, STEELL);
  p.rect(7, 3, 3, 1, EYE);          // visor slit
  p.rect(4, 6, 8, 1, STEELL);       // pauldrons
  p.rect(6, 6, 4, 5, STEEL);        // plate cuirass
  p.put(7, 7, STEELL); p.put(8, 8, GEM_C); // emblem
  p.rect(3, 7, 3, 4, STEELD);       // shield
  p.rect(3, 7, 3, 1, STEELL);
  p.put(4, 8, GOLD); p.put(4, 9, GOLD); p.put(3, 9, GOLD); p.put(5, 9, GOLD); // shield cross
  p.rect(11, 7, 1, 3, STEEL);       // sword arm
  p.rect(12, 1, 1, 8, STEELL);      // longsword
  p.rect(11, 8, 3, 1, GOLD);        // guard
  p.rect(6, 11, 2, 4, STEELD); p.rect(8, 11, 2, 4, STEELD);
  p.rect(6, 15, 2, 1, GOLD); p.rect(8, 15, 2, 1, GOLD); // sabatons
  return { grid: p };
}

function mage() {
  const p = new Px();
  p.put(8, 0, GOLD);                // hat tip star
  p.put(8, 1, ROBE);
  p.rect(7, 2, 2, 1, ROBE);
  p.rect(6, 3, 4, 1, ROBED);        // hat brim
  p.rect(6, 4, 5, 1, SKIN);         // face
  p.put(7, 4, EYE); p.put(9, 4, EYE);
  p.rect(6, 5, 5, 1, WHITE);        // white beard
  p.rect(6, 6, 4, 2, ROBE);         // robe shoulders
  p.rect(5, 8, 6, 2, ROBE);
  p.rect(4, 10, 8, 3, ROBEL);       // flared robe
  p.rect(4, 13, 8, 1, GOLD);        // hem trim
  p.rect(4, 14, 8, 1, ROBED);
  p.rect(12, 5, 1, 10, LEATHER);    // staff
  p.rect(11, 3, 2, 2, GEM_C);       // orb
  p.put(12, 3, WHITE);
  return { grid: p, aura: true };
}

const BUILDERS = {
  slime, imp, adventurer, warrior, knight, mage,
};
export const TIER_NAMES = {
  slime: 'Slime', imp: 'Imp', adventurer: 'Adventurer', warrior: 'Warrior', knight: 'Knight', mage: 'Mage',
};

// Which class sprite for a stat, and whether it should look decayed.
// Level drives the class you evolve into; condition drives devolution into a
// monster (imp when cracked, slime when broken).
export function spriteFor(stat) {
  const cond = stat.condition ?? 100;
  const level = levelFromXp(stat.xp);
  let tier;
  if (cond < 15) tier = 'slime';          // broken -> devolved to goo
  else if (cond < 40) tier = 'imp';       // cracked -> lesser monster
  else if (level <= 2) tier = 'adventurer';
  else if (level <= 4) tier = 'warrior';
  else if (level <= 6) tier = 'knight';
  else tier = 'mage';
  return { tier, decayed: cond < 75 && tier !== 'slime' && tier !== 'imp' };
}

// Render a stat's sprite as inline SVG markup.
export function spriteSvg(stat, { size = 48 } = {}) {
  const { tier, decayed } = spriteFor(stat);
  const { grid, aura } = BUILDERS[tier]();
  const rects = grid.cells()
    .map(([x, y, c]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`)
    .join('');
  const glow = aura
    ? `<defs><filter id="au"><feGaussianBlur stdDeviation="1.1"/></filter></defs>
       <circle cx="8" cy="8" r="7" fill="${GOLD}" opacity="0.28" filter="url(#au)"/>`
    : '';
  const filter = decayed ? 'filter:saturate(0.35) brightness(0.85);' : '';
  return `<svg class="sprite" viewBox="-1 -1 18 18" width="${size}" height="${size}"
    shape-rendering="crispEdges" style="${filter}" xmlns="http://www.w3.org/2000/svg">
    ${glow}${rects}</svg>`;
}
