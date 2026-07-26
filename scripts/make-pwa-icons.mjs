// Generate the web-app-manifest icons for the browser PWA build, using the
// same emblem as the Android launcher icon (scripts/make-icons.mjs) so both
// installs look identical. Writes into www/assets/icons/.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { emblemSvg, bgRadial } from './lib/emblem.mjs';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = 'www/assets/icons';
const BG = bgRadial('#20205a', '#0e0e24');

async function shoot(browser, { size, out, emblemPct }) {
  const page = await browser.newPage();
  const margin = (100 - emblemPct) / 2;
  const html = `<!doctype html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{width:${size}px;height:${size}px;overflow:hidden;background:${BG};}
    .em{width:${emblemPct}%;aspect-ratio:1;margin:${margin}%;display:flex;}
  </style></head><body><div class="em">${emblemSvg()}</div></body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: 'load' });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  process.stdout.write(`  ${out} (${size}x${size})\n`);
  await page.screenshot({ path: out, timeout: 15000 });
  await page.close();
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// "any" purpose: how the icon looks standalone (browser tab, taskbar, app
// switcher) — most of the frame is emblem.
await shoot(browser, { size: 192, out: `${OUT}/icon-192.png`, emblemPct: 68 });
await shoot(browser, { size: 512, out: `${OUT}/icon-512.png`, emblemPct: 68 });

// "maskable" purpose: Android crops these to a circle/squircle/rounded-square
// at install time, so keep all content inside the center safe zone.
await shoot(browser, { size: 192, out: `${OUT}/icon-maskable-192.png`, emblemPct: 46 });
await shoot(browser, { size: 512, out: `${OUT}/icon-maskable-512.png`, emblemPct: 46 });

// iOS home-screen icon: iOS applies its own rounded-corner mask (no safe-zone
// cropping needed) and ignores/mishandles alpha, so this one's fully opaque.
await shoot(browser, { size: 180, out: `${OUT}/apple-touch-icon.png`, emblemPct: 62 });

await browser.close();
console.log('generated 5 PWA icons');
