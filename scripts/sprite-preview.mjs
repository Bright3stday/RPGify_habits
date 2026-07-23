import { chromium } from 'playwright-core';
import { spriteSvg, TIER_NAMES } from '../www/js/sprites.js';
const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const stats = [
  { name:'Slime (broken)', xp:2000, condition:5 },
  { name:'Imp (cracked)', xp:2000, condition:30 },
  { name:'Adventurer L1', xp:50, condition:100 },
  { name:'Warrior L4', xp:700, condition:100 },
  { name:'Knight L6', xp:1600, condition:100 },
  { name:'Mage L8', xp:3000, condition:100 },
  { name:'Knight (fading)', xp:1600, condition:55 },
];
const cards = stats.map(s=>`<div style="display:flex;flex-direction:column;align-items:center;gap:8px;background:#1c1c46;border:4px solid #e8e8f4;box-shadow:0 0 0 4px #05050f;padding:14px">
  ${spriteSvg(s,{size:96})}
  <div style="font-size:9px;color:#f0c020">${s.name}</div></div>`).join('');
const b=await chromium.launch({executablePath:EXE,args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewportSize({width:800,height:360});
await p.setContent(`<body style="margin:0;background:#0e0e24;display:flex;flex-wrap:wrap;gap:16px;padding:20px;font-family:monospace">${cards}</body>`,{waitUntil:'load'});
await p.screenshot({path:process.env.OUT});
await b.close();console.log('ok');
