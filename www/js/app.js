// App orchestrator: owns state, persistence, routing, and the shared reward
// beats (LEVEL UP! flash, XP floaters, toasts) that the views trigger.

import { loadState, saveState } from './store.js';
import { defaultState, syncStepHabits, migrate } from './game.js';
import { refreshConditions } from './condition.js';
import { activeEffects, grantDue } from './skilltree.js';
import { rescheduleAll } from './notifications.js';
import { refreshSteps } from './pedometer.js';
import { notifyReady, checkForUpdate, isDismissed } from './ota.js';
import { readUsageEvents, syncUsage, startMonitoring, hasUsageAccess } from './doomscroll.js';
import { applyLedger, spiritWear, defaultSpiritTrack, SPIRIT_TUNING } from './spirit.js';
import { DAY_MS } from './util.js';
import { RARITY, itemIconSvg } from './items.js';
import { esc } from './util.js';
import {
  renderDashboard, renderHabits, renderTree, renderSettings, renderInventory,
  showUpdatePrompt, showWalkthrough,
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

// A deliberately un-celebratory beat for setbacks (e.g. doomscroll wear): muted
// colours, a downward "sink" instead of the gold pop, and a low descending tone
// — so a negative event never reads like a reward. Not alarming/red either,
// keeping the observation-only tone.
function debuffBeat({ title, line, icon }, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'debuff';
  overlay.innerHTML = `
    <div class="db-title">${esc(title)}</div>
    ${icon ? `<div class="db-icon">${icon}</div>` : ''}
    <div class="db-line">${line}</div>
    <div class="db-hint">▼  tap to continue</div>`;
  const dismiss = () => { overlay.remove(); if (onDone) onDone(); };
  overlay.addEventListener('click', dismiss);
  document.body.appendChild(overlay);
  lowBeep();
}

function playBeats(beats) {
  if (!beats || !beats.length) return;
  const [first, ...rest] = beats;
  const show = first.kind === 'debuff' ? debuffBeat : flashBeat;
  show(first, () => playBeats(rest));
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

// A soft, low, *descending* tone for setback beats — reads as "down", not a win.
function lowBeep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    const notes = [330, 262, 196];
    notes.forEach((freq, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime + i * 0.13;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.start(t); o.stop(t + 0.18);
    });
  } catch (e) { /* audio not allowed; ignore */ }
}

// ---- Context handed to every view --------------------------------------

const ctx = {
  get state() { return state; },
  save, render, go, toast, floatXp, reward,
  // Positional wrapper kept for the skill-tree unlock beat.
  flashBeat(title, line, color, onDone) { flashBeat({ title, line, color }, onDone); },
  // Muted setback beat (deliberately not celebratory) — e.g. doomscroll wear.
  debuffBeat(title, line, onDone) { debuffBeat({ title, line }, onDone); },
  async reschedule() { await rescheduleAll(state.settings); },
  replaceState(next) { state = next; },
  // Re-open the first-run walkthrough on demand (from Config).
  openWalkthrough() { showWalkthrough(ctx, { fromSettings: true }); },
  async drainDoomscroll() { return drainDoomscroll({ silent: true }); },
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
  const cfg = state.settings && state.settings.doomscroll;
  const enabled = cfg && cfg.enabled;
  // Oracle path (and a top-up for Sentinel): reconstruct sessions since the last
  // check into the native ledger *before* we read it, so the reckoning shows on
  // return with no background service. Graceful no-op on web / an older APK.
  if (enabled) { try { await syncUsage(cfg); } catch (e) { /* ignore */ } }
  let events;
  try { ({ events } = await readUsageEvents()); } catch (e) { return; }
  if (!events || !events.length) return;
  const prevSeq = (state.spiritTrack && state.spiritTrack.lastSeq) || 0;
  // Only score when the doomscroll feature is enabled. When it's off, consume
  // the ledger cursor without scoring so nothing applies now — and so a backlog
  // recorded earlier can't retroactively apply when it's turned back on.
  if (!enabled) {
    const maxSeq = events.reduce((m, e) => Math.max(m, (e && e.seq) || 0), prevSeq);
    if (maxSeq !== prevSeq) {
      if (!state.spiritTrack) state.spiritTrack = defaultSpiritTrack();
      state.spiritTrack.lastSeq = maxSeq;
      await saveState(state);
    }
    return;
  }
  const res = applyLedger(state.spiritTrack, events, Date.now());
  state.spiritTrack = res.track;
  if (cfg.path === 'oracle') trackOracleOutcome(res);
  if (res.track.lastSeq !== prevSeq || res.gainedXp || res.addedWear) {
    refreshConditions(state);
    await saveState(state);
  }
  if (silent) return { gainedXp: res.gainedXp, addedWear: res.addedWear };
  // Surface the effect as proper animated reward beats (not just a toast).
  const beats = [];
  if (res.gainedXp) {
    beats.push({ title: `SPIRIT +${res.gainedXp}`, line: 'You stepped away from the scroll', color: '#b06af0', icon: '☯' });
  }
  if (res.addedWear) {
    const pct = Math.round(spiritWear(state) * 100);
    beats.push({ kind: 'debuff', title: 'SPIRIT WORN', line: `A long session · Spirit fatigue ${pct}%` });
  }
  if (beats.length) playBeats(beats);
  // After the beats settle, offer (never force) the Sentinel path if Oracle keeps
  // losing to the scroll.
  maybeSuggestSentinel();
  return { gainedXp: res.gainedXp, addedWear: res.addedWear };
}

// ---- Adaptive "try Sentinel" suggestion (Oracle only, never forced) --------

// Tally how the Oracle path is going. A gain nudges the tally toward "coping"; a
// binge nudges it toward "struggling". Persisted in meta so it survives reopens.
function trackOracleOutcome(res) {
  const m = state.meta || (state.meta = {});
  const p = m.dsPrompt || (m.dsPrompt = { binges: 0, gains: 0, dismissed: false, lastTs: 0 });
  if (res.gainedXp) { p.gains += 1; p.binges = Math.max(0, p.binges - 1); }
  if (res.addedWear) p.binges += 1;
}

// If the scroll keeps winning on Oracle — repeated binges with no restraint gains,
// or wear pinned at the cap — gently suggest trying the real-time Sentinel path.
// Dismissible, cooldown-gated, and permanently silenceable. Opt-in, not a penalty.
function maybeSuggestSentinel() {
  const cfg = state.settings && state.settings.doomscroll;
  if (!cfg || !cfg.enabled || cfg.path !== 'oracle') return;
  const p = state.meta && state.meta.dsPrompt;
  if (!p || p.dismissed) return;
  const now = Date.now();
  if (now - (p.lastTs || 0) < 3 * DAY_MS) return; // don't nag
  const wearMaxed = spiritWear(state, now) >= SPIRIT_TUNING.wearMax - 1e-3;
  const struggling = (p.binges >= 3 && p.gains === 0) || wearMaxed;
  if (!struggling) return;
  p.lastTs = now;
  saveState(state);
  suggestSentinelPrompt();
}

// The suggestion overlay itself — two calm choices plus a permanent opt-out.
function suggestSentinelPrompt() {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="window modal">
      <div class="window-title">◆ A DIFFERENT PATH?</div>
      <div class="bar-caption" style="line-height:1.9;margin-bottom:10px">The scroll's been winning lately. The <b>Sentinel</b> path nudges you live, in the moment — not just when you return. Want to try it and see if it helps? You can switch back anytime.</div>
      <div class="btn-row">
        <button class="btn primary" id="ss-yes">TRY SENTINEL</button>
        <button class="btn" id="ss-no">NOT NOW</button>
      </div>
      <div style="text-align:center;margin-top:8px"><button class="btn small" id="ss-never">DON'T ASK AGAIN</button></div>
    </div>`;
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  overlay.querySelector('#ss-no').addEventListener('click', close);
  overlay.querySelector('#ss-never').addEventListener('click', async () => {
    state.meta.dsPrompt.dismissed = true;
    await saveState(state);
    close();
  });
  overlay.querySelector('#ss-yes').addEventListener('click', async () => {
    const cfg = state.settings.doomscroll;
    cfg.path = 'sentinel';
    state.meta.dsPrompt.dismissed = true; // chosen — stop suggesting
    await saveState(state);
    if (await hasUsageAccess()) {
      const { ensurePermission } = await import('./notifications.js');
      await ensurePermission();
      await startMonitoring(cfg);
      toast('Sentinel path active — it will nudge you live.', 2600);
    } else {
      toast('Switched to Sentinel. Grant Usage Access in Config to begin.', 3000);
    }
    close();
    render();
  });
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
  render();
  // First run (or an existing player who hasn't seen the paths intro yet): show
  // the walkthrough, which introduces the game and lets them choose a doomscroll
  // path. Drawn over the rendered app; skippable.
  if (!state.settings.onboarded) showWalkthrough(ctx);
  // Fold any doomscroll sessions into Spirit and show the reward/wear beats over
  // the drawn screen, then re-render so the Spirit dot + wear indicator update.
  drainDoomscroll().then((d) => { if (d && (d.gainedXp || d.addedWear)) render(); });
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
