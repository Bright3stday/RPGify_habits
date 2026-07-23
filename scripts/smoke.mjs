// Headless-browser smoke test: boots the real app, exercises the core loop
// (add stat -> add habit -> complete -> level up -> unlock skill node) and
// checks each screen renders. Dev-only; not shipped.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 5199;

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

const server = spawn('node', ['scripts/serve.js'], { env: { ...process.env, PORT }, stdio: 'inherit' });
await wait(600);

let failed = false;
const check = (cond, msg) => { console.log(`${cond ? '  ok ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; };

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await wait(300);

  // Dashboard shows the 4 default stats.
  const statNames = await page.$$eval('.stat-name', (els) => els.map((e) => e.textContent));
  check(statNames.length === 4, `dashboard shows 4 default stats (${statNames.join(',')})`);

  // Go to Quests, add a habit.
  await page.click('.tab[data-route="habits"]');
  await page.click('#add-habit');
  await page.fill('#f-name', 'Morning Run');
  await page.fill('#f-xp', '120');
  await page.click('#f-stats .chip'); // link first stat
  await page.click('#f-save');
  await wait(200);
  const habitCount = await page.$$eval('.habit', (els) => els.length);
  check(habitCount >= 1, 'habit created and listed');

  // Complete it -> should award XP and pop LEVEL UP (120 xp -> level 2).
  // Use [data-do] so we hit the manual button, not the seeded steps AUTO badge.
  await page.click('[data-do]:not([disabled])');
  await wait(300);
  const leveled = await page.$('.levelup');
  check(!!leveled, 'completing habit triggers LEVEL UP! beat');
  if (leveled) { await page.click('.levelup'); await wait(200); }

  // Dashboard reflects XP.
  await page.click('.tab[data-route="dashboard"]');
  await wait(150);
  const anyLv2 = await page.$$eval('.stat-level', (els) => els.some((e) => /LV [2-9]/.test(e.textContent)));
  check(anyLv2, 'a stat reached level 2+ after completion');

  // Skill tree renders nodes; novice should be available now.
  await page.click('.tab[data-route="tree"]');
  await wait(150);
  const nodeCount = await page.$$eval('.node', (els) => els.length);
  check(nodeCount >= 16, `skill tree renders nodes (${nodeCount})`);
  const available = await page.$('.node.available');
  check(!!available, 'at least one node is available to unlock');
  if (available) {
    await available.click();
    await wait(200);
    const unlockBeat = await page.$('.levelup');
    check(!!unlockBeat, 'unlocking a node fires SKILL UNLOCKED beat');
    if (unlockBeat) { await page.click('.levelup'); await wait(150); }
  }

  // Steps feature: dashboard shows sprites + a steps widget; logging steps to
  // the goal auto-completes the seeded Daily Steps habit.
  await page.click('.tab[data-route="dashboard"]');
  await wait(150);
  const spriteCount = await page.$$eval('.stat-avatar .sprite', (els) => els.length);
  check(spriteCount === 4, `each stat shows an evolving sprite (${spriteCount})`);
  const hasStepsWidget = await page.$$eval('.window-title', (els) => els.some((e) => /STEPS TODAY/.test(e.textContent)));
  check(hasStepsWidget, 'steps widget renders on dashboard');
  // log 3000 x3 = 9000 >= 8000 goal
  for (let i = 0; i < 3; i += 1) { await page.click('[data-steps-add="3000"]'); await wait(120); }
  const stepsDone = await page.$$eval('.h-meta, .window', (els) => els.some((e) => /done today ✓|✓/.test(e.textContent)));
  const bodyLeveledOrDone = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rpgify.state.v1'));
    const steps = Object.values(s.habits).find((h) => h.source === 'steps');
    return !!steps.lastCompleted; // auto-completed today
  });
  check(bodyLeveledOrDone, 'reaching step goal auto-completes the Daily Steps habit');

  // Settings renders; export produces a download (via CDP not trivial, just check UI).
  await page.click('.tab[data-route="settings"]');
  await wait(150);
  const hasExport = await page.$('#export');
  check(!!hasExport, 'settings screen renders with data controls');

  // Bag / loot: the screen renders, and an injected item shows in the grid.
  await page.click('.tab[data-route="bag"]');
  await wait(150);
  const bagTitle = await page.$$eval('.window-title', (els) => els.some((e) => /BAG/.test(e.textContent)));
  check(bagTitle, 'Bag screen renders');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rpgify.state.v1'));
    s.inventory = s.inventory || [];
    s.inventory.push({ key: 'excalibur', name: 'Excalibur', type: 'Weapon', shape: 'sword', rarity: 'legendary', color: '#f0d840', id: 't1', ts: Date.now() });
    localStorage.setItem('rpgify.state.v1', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(200);
  await page.click('.tab[data-route="bag"]');
  await wait(150);
  const lootCells = await page.$$eval('.loot-cell', (els) => els.length);
  check(lootCells >= 1, `loot item renders in the bag (${lootCells})`);

  // Persistence: reload and confirm the habit survived.
  await page.reload({ waitUntil: 'networkidle' });
  await wait(300);
  await page.click('.tab[data-route="habits"]');
  await wait(150);
  const persisted = await page.$$eval('.h-name', (els) => els.some((e) => e.textContent.includes('Morning Run')));
  check(persisted, 'state persisted across reload (localStorage)');

  check(errors.length === 0, `no page/console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(failed ? '\nSMOKE TEST FAILED' : '\nSmoke test passed.');
process.exit(failed ? 1 : 0);
