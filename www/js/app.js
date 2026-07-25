// App orchestrator: owns state, persistence, routing, and the shared reward
// beats (LEVEL UP! flash, XP floaters, toasts) that the views trigger.

import { loadState, saveState } from './store.js';
import { defaultState, syncStepHabits, migrate } from './game.js';
import { refreshConditions } from './condition.js';
import { activeEffects, grantDue } from './skilltree.js';
import { rescheduleAll } from './notifications.js';
import { refreshSteps } from './pedometer.js';
import { notifyReady, checkForUpdate, isDismissed } from './ota.js';
import { readUsageEvents } from './doomscroll.js';
import { applyLedger } from './spirit.js';
import { RARITY, itemIconSvg } from './items.js';
import { esc } from './util.js';
import {
  renderDashboard, renderHabits, renderTree, renderSettings, renderInventory,
  showUpdatePrompt,
} from './views.js';

const ROUTES = {
  dashboard: renderDashboard,
  habits: renderHabits,
  tree: renderTree,
  bag: renderInventory,
  settings: renderSettings,
};

let state = null;
let route = 'dashboard';

const appEl = () => document.getElementById('app');

async function save() {
  refreshConditions(state);
  await saveState(state);
}

function render() {
  refreshConditions(state);
  ROUTES[route](appEl(), ctx);
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.route === route);
  });
  const { titles } = activeEffects(state);
  const badge = document.getElementById('title-badge');
  badge.textContent = titles.length ? titles[titles.length - 1] : 'Adventurer';
}

function go(r) {
  route = r;
  appEl().scrollTop = 0;
  render();
}

// ---- Reward beats -------------------------------------------------------

function toast(msg, ms = 1600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function floatXp(text, x, y) {
  const f = document.createElement('div');
  f.className = 'xp-float';
  f.textContent = text;
  f.style.left = `${x}px`;
  f.style.top = `${y}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 900);
}

// Full-screen JRPG flash beat. `onDone` chains the next beat in the queue.
function flashBeat({ title, line, color, icon }, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'levelup';
  overlay.innerHTML = `
    <div class="lu-title">${esc(title)}</div>
    ${icon ? `<div class="lu-icon">${icon}</div>` : ''}
    <div class="lu-line" style="color:${color || '#fff'}">${line}</div>
    <div class="lu-hint">▼  tap to continue</div>`;
  const dismiss = () => { overlay.remove(); if (onDone) onDone(); };
  overlay.addEventListener('click', dismiss);
  document.body.appendChild(overlay);
  beep();
}

function playBeats(beats) {
  if (!beats || !beats.length) return;
  const [first, ...rest] = beats;
  flashBeat(first, () => playBeats(rest));
}

// Turn a completion result into a queue of beats: level-ups first, then loot.
function beatsFor({ levelUps = [], loot = null } = {}) {
  const beats = levelUps.map((lu) => ({
    title: 'LEVEL UP!',
    line: `${esc(lu.statName)}  Lv.${lu.from} → Lv.${lu.to}`,
    color: lu.color,
  }));
  const loots = Array.isArray(loot) ? loot : (loot ? [loot] : []);
  for (const it of loots) {
    beats.push({
      title: 'TREASURE!',
      line: `${RARITY[it.rarity].label} · ${esc(it.name)}`,
      color: RARITY[it.rarity].color,
      icon: itemIconSvg(it, { size: 64 }),
    });
  }
  return beats;
}

function reward(result) { playBeats(beatsFor(result)); }

// Tiny WebAudio "jingle" so the beat has an old-school chime. Best-effort.
function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.start(t); o.stop(t + 0.1);
    });
  } catch (e) { /* audio not allowed; ignore */ }
}

// ---- Context handed to every view --------------------------------------

const ctx = {
  get state() { return state; },
  save, render, go, toast, floatXp, reward,
  // Positional wrapper kept for the skill-tree unlock beat.
  flashBeat(title, line, color, onDone) { flashBeat({ title, line, color }, onDone); },
  async reschedule() { await rescheduleAll(state.settings); },
  replaceState(next) { state = next; },
  // Pull today's steps and auto-complete any step-goal habits that hit target.
  async syncSteps({ silent = false } = {}) {
    await refreshSteps(state);
    const fired = syncStepHabits(state);
    if (fired.length) {
      await saveState(state);
      if (!silent) {
        toast(`👟 ${fired[0].habit.name} complete!`);
        reward({
          levelUps: fired.flatMap((f) => f.levelUps),
          loot: fired.map((f) => f.loot).filter(Boolean),
        });
      }
    }
    return fired;
  },
};

// ---- Doomscroll → Spirit --------------------------------------------------

// Drain the native detector's session ledger and fold it into Spirit (XP for
// restraint, wear for bingeing). Native-only; a no-op on the web preview.
async function drainDoomscroll({ silent = false } = {}) {
  let events;
  try { ({ events } = await readUsageEvents()); } catch (e) { return; }
  if (!events || !events.length) return;
  const prevSeq = (state.spiritTrack && state.spiritTrack.lastSeq) || 0;
  const res = applyLedger(state.spiritTrack, events, Date.now());
  state.spiritTrack = res.track;
  if (res.track.lastSeq !== prevSeq || res.gainedXp || res.addedWear) {
    refreshConditions(state);
    await saveState(state);
  }
  if (!silent && res.gainedXp) toast(`☯ Spirit +${res.gainedXp} — you left on the nudge`);
  else if (!silent && res.addedWear) toast('☯ Spirit wears a little — long session');
}

// ---- OTA update prompt --------------------------------------------------

// Check for a newer web bundle and, if one is available and not snoozed, ask
// the user (never auto-applies). Safe no-op on the web preview.
async function maybePromptUpdate() {
  try {
    const r = await checkForUpdate();
    if (r.status === 'available' && !(await isDismissed(r.manifest.build))) {
      showUpdatePrompt(r.manifest, ctx);
    }
  } catch (e) { /* offline / not native — ignore */ }
}

// ---- Boot ---------------------------------------------------------------

async function boot() {
  // Confirm this web bundle booted OK so the OTA updater doesn't roll it back,
  // then quietly check for a newer bundle. Nothing is downloaded automatically:
  // if one is found (and not previously snoozed) we prompt for consent.
  notifyReady();
  maybePromptUpdate();

  state = migrate(await loadState());
  if (!state) {
    state = defaultState();
    await saveState(state);
    toast('Welcome, adventurer!');
  } else {
    await saveState(state); // persist any migration
  }
  grantDue(state); // accrue any Growth Points due since last open
  refreshConditions(state);

  document.getElementById('tabbar').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) go(tab.dataset.route);
  });

  await ctx.syncSteps({ silent: true }); // catch up steps from time away
  await drainDoomscroll({ silent: true }); // fold any doomscroll sessions into Spirit
  render();
  // Re-check steps + conditions when returning to the app after time away.
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      await ctx.syncSteps();
      await drainDoomscroll();
      render();
    }
  });
  // Poll the pedometer live while the app is open so step goals auto-complete
  // in real time (not only on open/resume).
  setInterval(async () => {
    if (document.hidden) return;
    const fired = await ctx.syncSteps();
    if (fired.length) render();
  }, 60000);
}

boot();
