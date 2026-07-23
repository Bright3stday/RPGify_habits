import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 5233;
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-RPGify-habits/64060c1f-9061-57cc-8b3f-f51b6b8f942d/scratchpad';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node', ['scripts/serve.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
await wait(600);
const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await wait(400);
// seed some progress for a richer dashboard
await page.evaluate(() => {
  const raw = localStorage.getItem('rpgify.state.v1'); const s = JSON.parse(raw);
  const ids = Object.keys(s.stats);
  s.stats[ids[0]].xp = 340; s.stats[ids[1]].xp = 620; s.stats[ids[2]].xp = 90; s.stats[ids[3]].xp = 1100;
  const now = Date.now(), DAY = 864e5;
  s.habits = {
    h1: { id:'h1', name:'Morning Run', description:'', statIds:[ids[0]], cadenceType:'daily', cadenceN:2, xpPerCompletion:40, lastCompleted: now-2.4*DAY, createdAt: now-20*DAY, streak:3, retired:false, history:[] },
    h2: { id:'h2', name:'Read 20 pages', description:'', statIds:[ids[1]], cadenceType:'daily', cadenceN:1, xpPerCompletion:30, lastCompleted: now-0.2*DAY, createdAt: now-30*DAY, streak:12, retired:false, history:[] },
    h3: { id:'h3', name:'Deep work block', description:'', statIds:[ids[2],ids[3]], cadenceType:'everyN', cadenceN:2, xpPerCompletion:60, lastCompleted: now-5*DAY, createdAt: now-40*DAY, streak:0, retired:false, history:[] },
    h4: { id:'h4', name:'Weekly review', description:'', statIds:[ids[2]], cadenceType:'weekly', cadenceN:7, xpPerCompletion:50, lastCompleted: now-1*DAY, createdAt: now-60*DAY, streak:5, retired:false, history:[] },
  };
  s.tree.unlocked = [ids[3]+'_novice', ids[3]+'_power'];
  s.stats[ids[3]].healthySince = now - 8*DAY;
  localStorage.setItem('rpgify.state.v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'networkidle' }); await wait(400);
await page.screenshot({ path: `${OUT}/01-dashboard.png` });
await page.click('.tab[data-route="habits"]'); await wait(250);
await page.screenshot({ path: `${OUT}/02-quests.png` });
await page.click('.tab[data-route="tree"]'); await wait(250);
await page.screenshot({ path: `${OUT}/03-tree.png`, fullPage: true });
await page.click('.tab[data-route="settings"]'); await wait(250);
await page.screenshot({ path: `${OUT}/04-settings.png`, fullPage: true });
// level-up beat
await page.click('.tab[data-route="dashboard"]'); await wait(200);
await page.evaluate(() => { document.querySelector('.tab[data-route="habits"]').click(); });
await wait(200);
await b.close(); server.kill();
console.log('shots written to', OUT);
