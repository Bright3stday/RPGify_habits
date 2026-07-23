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
const RED = '#e05a5a';
const GREEN = '#6ad46a';
const BLUE = '#48c8ff';
const NAVY = '#2a4a8a';

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

function blob() { // out-of-shape humanoid
  const p = new Px();
  p.disc(8, 4, 2, SKIN);           // head, slumped low
  p.rect(6, 2, 5, 1, HAIR);        // hair
  p.put(7, 4, EYE); p.put(9, 4, EYE);
  p.put(8, 5, SKIND);              // frown-ish
  p.rect(5, 7, 6, 4, GREY);        // wide torso
  p.rect(5, 7, 6, 1, GREYD);       // shoulders shadow
  p.put(4, 8, SKIN); p.put(4, 9, SKIN);   // stubby arms
  p.put(11, 8, SKIN); p.put(11, 9, SKIN);
  p.rect(6, 11, 2, 3, GREYD);      // short legs
  p.rect(8, 11, 2, 3, GREYD);
  p.rect(6, 14, 2, 1, EYE); p.rect(8, 14, 2, 1, EYE);
  return { grid: p };
}

function average() {
  const p = new Px();
  p.disc(8, 3, 2, SKIN);
  p.rect(6, 1, 5, 1, HAIR);
  p.put(7, 3, EYE); p.put(9, 3, EYE);
  p.rect(6, 6, 4, 5, BLUE);        // torso
  p.rect(5, 6, 1, 4, SKIN); p.rect(10, 6, 1, 4, SKIN); // arms
  p.rect(6, 11, 2, 4, NAVY); p.rect(8, 11, 2, 4, NAVY); // legs
  p.rect(6, 15, 2, 1, EYE); p.rect(8, 15, 2, 1, EYE);   // feet
  return { grid: p };
}

function fit() {
  const p = new Px();
  p.disc(8, 3, 2, SKIN);
  p.rect(6, 1, 5, 1, HAIR);
  p.rect(6, 2, 5, 1, RED);         // headband
  p.put(7, 3, EYE); p.put(9, 3, EYE);
  p.rect(5, 6, 6, 1, GREEN);       // broad shoulders
  p.rect(6, 6, 4, 5, GREEN);       // athletic torso
  p.put(8, 8, SLIMEL);             // torso highlight (abs)
  p.rect(4, 6, 1, 4, SKIN); p.rect(11, 6, 1, 4, SKIN);  // arms
  p.put(4, 7, WHITE); p.put(11, 7, WHITE);              // arm highlight
  p.rect(6, 11, 2, 4, NAVY); p.rect(8, 11, 2, 4, NAVY);
  p.rect(6, 15, 2, 1, EYE); p.rect(8, 15, 2, 1, EYE);
  return { grid: p };
}

function champion() {
  const p = new Px();
  p.put(7, 0, GOLD); p.put(8, 0, GOLD); p.put(9, 0, GOLD); // crown
  p.put(8, -0, GOLD);
  p.disc(8, 3, 2, SKIN);
  p.rect(6, 2, 5, 1, HAIR);
  p.put(7, 3, EYE); p.put(9, 3, EYE);
  p.rect(11, 6, 1, 6, RED);        // cape edge
  p.rect(4, 6, 8, 1, GOLD);        // huge shoulders (gold trim)
  p.rect(5, 7, 6, 4, GREEN);       // muscular torso
  p.put(7, 8, GOLD); p.put(9, 8, GOLD); // chest emblem
  p.rect(3, 7, 1, 4, SKIN); p.rect(12, 7, 1, 4, SKIN);  // big arms
  p.put(3, 8, WHITE); p.put(12, 8, WHITE);
  p.rect(6, 11, 2, 4, NAVY); p.rect(8, 11, 2, 4, NAVY);
  p.rect(6, 15, 2, 1, GOLD); p.rect(8, 15, 2, 1, GOLD); // gold boots
  return { grid: p, aura: true };
}

const BUILDERS = { slime, blob, average, fit, champion };
export const TIER_NAMES = { slime: 'Slime', blob: 'Out of Shape', average: 'Adventurer', fit: 'Athlete', champion: 'Champion' };

// Which sprite for a stat, and whether it should look decayed (desaturated).
export function spriteFor(stat) {
  const cond = stat.condition ?? 100;
  const level = levelFromXp(stat.xp);
  let tier;
  if (cond < 15) tier = 'slime';          // broken -> devolved
  else if (cond < 40) tier = 'blob';      // cracked -> unfit
  else if (level <= 2) tier = 'average';
  else if (level <= 5) tier = 'fit';
  else tier = 'champion';
  return { tier, decayed: cond < 75 && tier !== 'slime' };
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
