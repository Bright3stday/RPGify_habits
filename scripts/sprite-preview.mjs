import { chromium } from 'playwright-core';
import { spriteSvg, TIER_NAMES } from '../www/js/sprites.js';
const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// fake stats to force each tier
const stats = [
  { name:'Slime', xp:1500, condition:5 },
  { name:'Out of Shape', xp:1500, condition:30 },
  { name:'Adventurer', xp:100, condition:100 },
  { name:'Athlete', xp:800, condition:100 },
  { name:'Champion', xp:2000, condition:100 },
  { name:'Athlete (decaying)', xp:800, condition:55 },
];
const cards = stats.map(s=>`<div style="display:flex;flex-direction:column;align-items:center;gap:8px;background:#1c1c46;border:4px solid #e8e8f4;box-shadow:0 0 0 4px #05050f;padding:14px">
  ${spriteSvg(s,{size:96})}
  <div style="font-size:9px;color:#f0c020">${s.name}</div></div>`).join('');
const b=await chromium.launch({executablePath:EXE,args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewportSize({width:760,height:360});
await p.setContent(`<body style="margin:0;background:#0e0e24;display:flex;flex-wrap:wrap;gap:16px;padding:20px;font-family:monospace">${cards}</body>`,{waitUntil:'load'});
await p.screenshot({path:process.env.OUT});
await b.close();console.log('ok');
