// Generate Android launcher icons + splash from a hand-drawn pixel emblem,
// rasterized with headless Chromium (sharp's native binary is unavailable in
// the authoring environment). Writes straight into the android/ res folders.
//
// Emblem: a glowing 8-bit sword in the app palette — reads as "RPG" instantly
// and matches the in-app gold/cyan/indigo look.

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { emblemSvg, bgRadial } from './lib/emblem.mjs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const RES = 'android/app/src/main/res';
const fontB64 = fs.readFileSync('www/assets/fonts/PressStart2P.woff2').toString('base64');

async function shoot(browser, { w, h, out, transparent, bg, emblemPct, title }) {
  const page = await browser.newPage();
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    ${title ? `@font-face{font-family:PS;src:url(data:application/font-woff2;charset=utf-8;base64,${fontB64}) format('woff2');}` : ''}
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:${w}px;height:${h}px;overflow:hidden;}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(Math.min(w, h) * 0.06)}px;
      background:${transparent ? 'transparent' : bg};font-family:PS;}
    .em{width:${emblemPct}%;aspect-ratio:1;display:flex;}
    .t{color:#f0c020;text-shadow:${Math.max(2, Math.round(w / 240))}px ${Math.max(2, Math.round(w / 240))}px 0 #05050f;
      font-size:${Math.round(Math.min(w, h) * 0.075)}px;letter-spacing:${Math.round(w / 300)}px;}
    .t2{color:#48c8ff;font-size:${Math.round(Math.min(w, h) * 0.055)}px;letter-spacing:${Math.round(w / 260)}px;}
  </style></head><body>
    <div class="em">${emblemSvg()}</div>
    ${title ? `<div class="t">RPGIFY</div><div class="t2">HABITS</div>` : ''}
  </body></html>`;
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: 'load' });
  if (title) await page.evaluate(() => document.fonts.ready.then(() => true));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  process.stdout.write(`  ${out} (${w}x${h})\n`);
  await page.screenshot({ path: out, omitBackground: !!transparent, timeout: 15000 });
  await page.close();
}

// circular-masked variant for round launcher icons
async function shootRound(browser, size, out) {
  const page = await browser.newPage();
  const html = `<!doctype html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:${size}px;height:${size}px;overflow:hidden;background:transparent;}
    .circle{width:${size}px;height:${size}px;border-radius:50%;background:${bgRadial('#20205a', '#0e0e24')};
      display:flex;align-items:center;justify-content:center;}
    .em{width:66%;aspect-ratio:1;display:flex;}
  </style></head><body><div class="circle"><div class="em">${emblemSvg()}</div></div></body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: 'load' });
  process.stdout.write(`  ${out} (round ${size})\n`);
  await page.screenshot({ path: out, omitBackground: true, timeout: 15000 });
  await page.close();
}

const FG = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const LEG = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const SPLASH_PORT = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
let n = 0;

// Adaptive foreground: emblem only, transparent, sized into the 66% safe zone.
for (const [d, size] of Object.entries(FG)) {
  await shoot(browser, { w: size, h: size, out: `${RES}/mipmap-${d}/ic_launcher_foreground.png`, transparent: true, emblemPct: 60 });
  n += 1;
}
// Legacy square icon: full indigo tile + emblem.
for (const [d, size] of Object.entries(LEG)) {
  await shoot(browser, { w: size, h: size, out: `${RES}/mipmap-${d}/ic_launcher.png`, bg: bgRadial('#20205a', '#0e0e24'), emblemPct: 68 });
  await shootRound(browser, size, `${RES}/mipmap-${d}/ic_launcher_round.png`);
  n += 2;
}
// Splash: indigo full screen, centered emblem + title, per orientation/density.
for (const [d, [w, h]] of Object.entries(SPLASH_PORT)) {
  await shoot(browser, { w, h, out: `${RES}/drawable-port-${d}/splash.png`, bg: bgRadial('#1a1a44', '#0b0b1e'), emblemPct: 34, title: true });
  await shoot(browser, { w: h, h: w, out: `${RES}/drawable-land-${d}/splash.png`, bg: bgRadial('#1a1a44', '#0b0b1e'), emblemPct: 20, title: true });
  n += 2;
}
// generic fallback splash
await shoot(browser, { w: 480, h: 800, out: `${RES}/drawable/splash.png`, bg: bgRadial('#1a1a44', '#0b0b1e'), emblemPct: 34, title: true });
n += 1;

// preview strip for review
await shoot(browser, { w: 512, h: 512, out: process.env.PREVIEW || '/tmp/icon-preview.png', bg: bgRadial('#20205a', '#0e0e24'), emblemPct: 68 });

await browser.close();
console.log(`generated ${n} icon/splash images`);
