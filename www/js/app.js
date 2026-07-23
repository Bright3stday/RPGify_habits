// App orchestrator: owns state, persistence, routing, and the shared reward
// beats (LEVEL UP! flash, XP floaters, toasts) that the views trigger.

import { loadState, saveState } from './store.js';
import { defaultState } from './game.js';
import { refreshConditions } from './condition.js';
import { activeEffects } from './skilltree.js';
import { rescheduleAll } from './notifications.js';
import { esc } from './util.js';
import {
  renderDashboard, renderHabits, renderTree, renderSettings,
} from './views.js';

const ROUTES = {
  dashboard: renderDashboard,
  habits: renderHabits,
  tree: renderTree,
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

// Full-screen JRPG flash beat. `onDone` chains follow-up beats.
function flashBeat(title, line, color, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'levelup';
  overlay.innerHTML = `
    <div class="lu-title">${esc(title)}</div>
    <div class="lu-line" style="color:${color || '#fff'}">${line}</div>
    <div class="lu-hint">▼  tap to continue</div>`;
  const dismiss = () => {
    overlay.remove();
    if (onDone) onDone();
  };
  overlay.addEventListener('click', dismiss);
  document.body.appendChild(overlay);
  beep();
}

// Chain one or more level-ups through the flash beat.
function levelUpBeat(levelUps) {
  if (!levelUps || !levelUps.length) return;
  const lu = levelUps[0];
  const rest = levelUps.slice(1);
  flashBeat('LEVEL UP!', `${esc(lu.statName)}  Lv.${lu.from} → Lv.${lu.to}`, lu.color,
    () => levelUpBeat(rest));
}

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
  save, render, go, toast, floatXp, levelUpBeat, flashBeat,
  async reschedule() { await rescheduleAll(state.settings); },
  replaceState(next) { state = next; },
};

// ---- Boot ---------------------------------------------------------------

async function boot() {
  state = await loadState();
  if (!state) {
    state = defaultState();
    await saveState(state);
    toast('Welcome, adventurer!');
  }
  refreshConditions(state);

  document.getElementById('tabbar').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) go(tab.dataset.route);
  });

  render();
  // Re-render conditions when returning to the app after time away.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
}

boot();
