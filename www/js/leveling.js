// XP -> level curve. Deliberately simple and slightly super-linear so early
// levels come fast (early wins are the hook) and later ones ask for more.
//
// Cumulative XP required to *reach* level L:  50 * L * (L - 1)
//   L1 -> 0, L2 -> 100, L3 -> 300, L4 -> 600, L5 -> 1000 ...
// i.e. the step from level L to L+1 costs 100 * L.

export function xpToReachLevel(level) {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp) {
  if (xp <= 0) return 1;
  // Invert 50*L*(L-1) = xp  ->  L = (1 + sqrt(1 + xp/12.5)) / 2
  const l = Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
  return Math.max(1, l);
}

// Progress within the current level: { level, into, span, pct }
export function levelProgress(xp) {
  const level = levelFromXp(xp);
  const floor = xpToReachLevel(level);
  const ceil = xpToReachLevel(level + 1);
  const span = ceil - floor;
  const into = xp - floor;
  return {
    level,
    into,
    span,
    pct: span > 0 ? into / span : 0,
  };
}
