// Shared 8-bit sword emblem — the app's icon everywhere it appears (Android
// launcher icon, PWA manifest icons). One definition so they stay identical.

const G = '#f0c020';   // gold
const GL = '#ffe070';  // gold light (highlight)
const C = '#48c8ff';   // cyan
const CD = '#2a9ad0';  // cyan dark
const B = '#8a5a2a';   // grip brown
const BD = '#5a3a1a';  // grip dark

const CELLS = [
  // blade (tip -> guard)
  [7, 0, GL],
  [7, 1, GL], [8, 1, G],
  [7, 2, GL], [8, 2, G],
  [7, 3, GL], [8, 3, G],
  [7, 4, GL], [8, 4, G],
  [7, 5, GL], [8, 5, G],
  [7, 6, GL], [8, 6, G],
  [7, 7, GL], [8, 7, G],
  [7, 8, GL], [8, 8, G],
  [7, 9, GL], [8, 9, G],
  // crossguard
  [5, 10, CD], [6, 10, C], [7, 10, C], [8, 10, C], [9, 10, C], [10, 10, CD],
  // grip
  [7, 11, B], [8, 11, BD],
  [7, 12, B], [8, 12, BD],
  [7, 13, B], [8, 13, BD],
  // pommel
  [7, 14, GL], [8, 14, G],
];

export function emblemSvg() {
  const rects = CELLS.map(([x, y, c]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`).join('');
  return `<svg viewBox="0 0 16 16" width="100%" height="100%" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="0.8"/></filter></defs>
    <circle cx="7.5" cy="6" r="6" fill="${G}" opacity="0.22" filter="url(#glow)"/>
    ${rects}
  </svg>`;
}

export function bgRadial(inner, outer) {
  return `radial-gradient(circle at 50% 42%, ${inner} 0%, ${outer} 78%)`;
}
