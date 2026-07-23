// All four screens + the shared editor modals. Kept in one module so the
// small DOM helpers (segmented bar, condition badge, modal) are shared without
// ceremony. Views are pure render-on-demand: each sets container.innerHTML and
// wires listeners against the freshly-rendered nodes.

import { esc, fmtRelative, dayKey } from './util.js';
import { levelProgress } from './leveling.js';
import { conditionState, sustainedDays, SUSTAIN_THRESHOLD } from './condition.js';
import { CADENCE_TYPES, cadenceLabel, isDue, dueAt } from './cadence.js';
import {
  addHabit, updateHabit, retireHabit, deleteHabit, completeHabit,
  addStat, updateStat, deleteStat, defaultState,
} from './game.js';
import { evaluateTree, unlockNode } from './skilltree.js';
import { exportState, parseImport, readFile } from './backup.js';
import { spriteSvg, TIER_NAMES, spriteFor } from './sprites.js';
import {
  hasSensor, stepsToday, addManualSteps, setManualSteps,
} from './pedometer.js';

const PALETTE = ['#e05a5a', '#48c8ff', '#f0c020', '#6ad46a', '#b06af0', '#e0803a', '#5ad0c0', '#f078b0'];

// ---- small shared bits --------------------------------------------------

function segBar(pct, color) {
  const w = Math.round(Math.max(0, Math.min(1, pct)) * 100);
  return `<div class="bar"><div class="fill" style="width:${w}%;background:${color}"></div></div>`;
}

function condBadge(cond) {
  const s = conditionState(cond);
  const label = { healthy: 'STEADY', worn: 'FADING', cracked: 'CRACKED', broken: 'BROKEN' }[s];
  return `<span class="cond ${s}"><span class="dot"></span>${label} ${cond}%</span>`;
}

function modal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="window modal">${html}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

// Shared completion handler used by dashboard + quests.
function doComplete(ctx, habitId, btn) {
  const result = completeHabit(ctx.state, habitId);
  if (!result) return;
  ctx.save();
  const total = result.awards.reduce((a, x) => a + x.gain, 0);
  if (btn) {
    const r = btn.getBoundingClientRect();
    ctx.floatXp(`+${total} XP`, r.left, r.top);
  }
  ctx.levelUpBeat(result.levelUps);
  ctx.render();
}

// ========================================================================
// DASHBOARD (status screen)
// ========================================================================

export function renderDashboard(container, ctx) {
  const { state } = ctx;
  const stats = Object.values(state.stats);
  const habits = Object.values(state.habits).filter((h) => !h.retired);
  const due = habits.filter((h) => isDue(h)).sort((a, b) => dueAt(a) - dueAt(b));

  const statsHtml = stats.map((s) => {
    const p = levelProgress(s.xp);
    const cState = conditionState(s.condition);
    const decayCls = cState === 'healthy' ? '' : 'decaying';
    const { tier } = spriteFor(s);
    return `
      <div class="stat-card ${decayCls}">
        <div class="stat-row">
          <div class="stat-avatar" title="${esc(TIER_NAMES[tier])}">${spriteSvg(s, { size: 52 })}</div>
          <div style="flex:1;min-width:0">
            <div class="stat-head">
              <span class="stat-name" style="color:${s.color}">${esc(s.name)}</span>
              <span class="stat-level">LV ${p.level}</span>
            </div>
            ${segBar(p.pct, s.color)}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
              <span class="bar-caption">${p.into}/${p.span} XP</span>
              ${condBadge(s.condition)}
            </div>
          </div>
        </div>
      </div>`;
  }).join('') || '<div class="empty">No stats yet. Add some in Config.</div>';

  const manualDue = due.filter((h) => h.source !== 'steps');
  const dueHtml = manualDue.length ? manualDue.map((h) => habitRow(h, ctx, true)).join('')
    : '<div class="empty">Nothing due right now.<br/>Rest, hero.</div>';

  container.innerHTML = `
    <div class="window">
      <div class="window-title">◆ STATUS</div>
      ${statsHtml}
    </div>
    ${stepsWidget(ctx)}
    <div class="section-label">TODAY'S QUESTS (${manualDue.length})</div>
    ${dueHtml}
  `;

  container.querySelectorAll('[data-do]').forEach((btn) => {
    btn.addEventListener('click', () => doComplete(ctx, btn.dataset.do, btn));
  });
  wireSteps(container, ctx);
}

// Steps panel: today's count vs goal for each step-habit, plus manual logging
// when no hardware pedometer is present (web, or a phone without the sensor).
function stepsWidget(ctx) {
  const { state } = ctx;
  const stepHabits = Object.values(state.habits).filter((h) => !h.retired && h.source === 'steps');
  if (!stepHabits.length) return '';
  const steps = stepsToday(state);
  const rows = stepHabits.map((h) => {
    const goal = h.stepGoal || 8000;
    const pct = Math.min(1, steps / goal);
    const done = h.lastCompleted && dayKey(h.lastCompleted) === dayKey();
    return `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:5px">
          <span>👟 ${esc(h.name)}</span>
          <span style="color:${done ? '#6ad46a' : '#f4f4fb'}">${steps.toLocaleString()} / ${goal.toLocaleString()}${done ? ' ✓' : ''}</span>
        </div>
        ${segBar(pct, '#6ad46a')}
      </div>`;
  }).join('');
  const manual = hasSensor()
    ? '<div class="bar-caption" style="margin-top:6px">Auto-counted from your device pedometer.</div>'
    : `<div class="btn-row" style="margin-top:10px">
         <button class="btn small" data-steps-add="1000">+1000</button>
         <button class="btn small" data-steps-add="3000">+3000</button>
         <button class="btn small" data-steps-set>SET</button>
       </div>
       <div class="bar-caption" style="margin-top:6px">No step sensor here — log steps manually. On an Android phone with a pedometer this fills in automatically.</div>`;
  return `<div class="window"><div class="window-title">◆ STEPS TODAY</div>${rows}${manual}</div>`;
}

function wireSteps(container, ctx) {
  container.querySelectorAll('[data-steps-add]').forEach((b) => b.addEventListener('click', async () => {
    addManualSteps(ctx.state, Number(b.dataset.stepsAdd));
    await ctx.save();
    await ctx.syncSteps();
    ctx.render();
  }));
  const setBtn = container.querySelector('[data-steps-set]');
  if (setBtn) setBtn.addEventListener('click', async () => {
    const v = prompt('Set today\'s step count:', String(stepsToday(ctx.state)));
    if (v == null) return;
    setManualSteps(ctx.state, Number(v) || 0);
    await ctx.save();
    await ctx.syncSteps();
    ctx.render();
  });
}

// ========================================================================
// QUESTS (habit list)
// ========================================================================

function habitRow(h, ctx, compact = false) {
  const { state } = ctx;
  const isSteps = h.source === 'steps';
  const due = isDue(h);
  const pills = h.statIds.map((id) => {
    const s = state.stats[id];
    return s ? `<span class="stat-pill" style="color:${s.color};border-color:${s.color}">${esc(s.name)}</span>` : '';
  }).join('');
  const doneToday = h.lastCompleted && dayKey(h.lastCompleted) === dayKey();
  const cls = h.retired ? 'retired' : (isSteps ? (doneToday ? 'done' : '') : (due ? '' : 'done'));
  const editBtn = compact ? '' : `<button class="btn small" data-edit="${h.id}">EDIT</button>`;
  const meta = isSteps
    ? `👟 Goal ${(h.stepGoal || 8000).toLocaleString()} · ${h.xpPerCompletion} XP · ${doneToday ? 'done today ✓' : `${stepsToday(state).toLocaleString()} steps`}`
    : `${cadenceLabel(h)} · ${h.xpPerCompletion} XP · streak ${h.streak || 0} · ${fmtRelative(h.lastCompleted)}`;
  // Step habits complete automatically — show an AUTO badge, not a DO button.
  const action = isSteps
    ? `<div class="do-btn auto" title="Auto-completes at your step goal">${doneToday ? '✓' : 'AUTO'}</div>`
    : `<button class="do-btn" data-do="${h.id}" ${(!due || h.retired) ? 'disabled' : ''}>${h.retired ? '—' : (due ? 'DO' : 'OK')}</button>`;
  return `
    <div class="habit ${cls}">
      <div class="h-main">
        <div class="h-name">${esc(h.name)}</div>
        <div class="h-meta">${meta}</div>
        <div class="h-stats">${pills}${editBtn}</div>
      </div>
      ${action}
    </div>`;
}

export function renderHabits(container, ctx) {
  const { state } = ctx;
  const all = Object.values(state.habits);
  const active = all.filter((h) => !h.retired);
  const retired = all.filter((h) => h.retired);

  container.innerHTML = `
    <div class="btn-row" style="margin-bottom:14px">
      <button class="btn primary block" id="add-habit">＋ NEW QUEST</button>
    </div>
    <div class="section-label">ACTIVE (${active.length})</div>
    ${active.map((h) => habitRow(h, ctx)).join('') || '<div class="empty">No quests yet.</div>'}
    ${retired.length ? `<div class="section-label">RETIRED (${retired.length})</div>${retired.map((h) => habitRow(h, ctx)).join('')}` : ''}
  `;

  container.querySelector('#add-habit').addEventListener('click', () => habitEditor(ctx, null));
  container.querySelectorAll('[data-do]').forEach((b) => b.addEventListener('click', () => doComplete(ctx, b.dataset.do, b)));
  container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => habitEditor(ctx, b.dataset.edit)));
}

function habitEditor(ctx, habitId) {
  const { state } = ctx;
  const editing = habitId ? state.habits[habitId] : null;
  const h = editing || {
    name: '', description: '', statIds: [], cadenceType: 'daily', cadenceN: 2,
    xpPerCompletion: 20, source: 'manual', stepGoal: 8000,
  };
  const cadenceOpts = CADENCE_TYPES.map((c) => `<option value="${c.type}" ${h.cadenceType === c.type ? 'selected' : ''}>${c.label}</option>`).join('');
  const statChips = Object.values(state.stats).map((s) => `
    <span class="chip ${h.statIds.includes(s.id) ? 'on' : ''}" data-stat="${s.id}" style="${h.statIds.includes(s.id) ? `color:${s.color}` : ''}">${esc(s.name)}</span>`).join('');

  const overlay = modal(`
    <div class="window-title">${editing ? '◆ EDIT QUEST' : '◆ NEW QUEST'}</div>
    <label class="field"><span>NAME</span><input type="text" id="f-name" value="${esc(h.name)}" maxlength="40" /></label>
    <label class="field"><span>DESCRIPTION</span><textarea id="f-desc" maxlength="140">${esc(h.description)}</textarea></label>
    <label class="field"><span>FEEDS STATS (tap)</span></label>
    <div class="chips" id="f-stats" style="margin-bottom:12px">${statChips || '<span class="bar-caption">No stats — add some in Config.</span>'}</div>
    <label class="field"><span>TYPE</span></label>
    <div class="chips" id="f-src" style="margin-bottom:12px">
      <span class="chip ${h.source !== 'steps' ? 'on' : ''}" data-src="manual">✋ Tap to log</span>
      <span class="chip ${h.source === 'steps' ? 'on' : ''}" data-src="steps">👟 Auto (steps)</span>
    </div>
    <div style="display:flex;gap:10px" id="f-cad-row">
      <label class="field" style="flex:1"><span>CADENCE</span><select id="f-cad">${cadenceOpts}</select></label>
      <label class="field" style="width:90px" id="f-n-wrap"><span>EVERY N</span><input type="number" id="f-n" min="1" max="365" value="${h.cadenceN || 2}" /></label>
    </div>
    <label class="field" id="f-goal-wrap"><span>STEP GOAL / DAY</span><input type="number" id="f-goal" min="100" max="100000" step="500" value="${h.stepGoal || 8000}" /></label>
    <label class="field"><span>XP PER COMPLETION</span><input type="number" id="f-xp" min="1" max="1000" value="${h.xpPerCompletion}" /></label>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn primary" id="f-save">SAVE</button>
      ${editing ? `<button class="btn gold" id="f-retire">${editing.retired ? 'UNRETIRE' : 'RETIRE'}</button>` : ''}
      ${editing ? '<button class="btn danger" id="f-del">DELETE</button>' : ''}
    </div>
  `);

  const chosen = new Set(h.statIds);
  const nWrap = overlay.querySelector('#f-n-wrap');
  const cadSel = overlay.querySelector('#f-cad');
  const syncN = () => { nWrap.style.display = cadSel.value === 'everyN' ? '' : 'none'; };
  syncN();
  cadSel.addEventListener('change', syncN);

  // Source toggle: manual (cadence) vs steps (daily goal).
  let source = h.source === 'steps' ? 'steps' : 'manual';
  const cadRow = overlay.querySelector('#f-cad-row');
  const goalWrap = overlay.querySelector('#f-goal-wrap');
  const syncSrc = () => {
    const steps = source === 'steps';
    cadRow.style.display = steps ? 'none' : 'flex';
    goalWrap.style.display = steps ? 'block' : 'none';
  };
  syncSrc();
  overlay.querySelectorAll('[data-src]').forEach((chip) => chip.addEventListener('click', () => {
    source = chip.dataset.src;
    overlay.querySelectorAll('[data-src]').forEach((c) => c.classList.toggle('on', c.dataset.src === source));
    syncSrc();
  }));

  overlay.querySelectorAll('[data-stat]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.stat;
      const s = state.stats[id];
      if (chosen.has(id)) { chosen.delete(id); chip.classList.remove('on'); chip.style.color = ''; }
      else { chosen.add(id); chip.classList.add('on'); chip.style.color = s.color; }
    });
  });

  overlay.querySelector('#f-save').addEventListener('click', () => {
    const data = {
      name: overlay.querySelector('#f-name').value,
      description: overlay.querySelector('#f-desc').value,
      statIds: [...chosen],
      source,
      stepGoal: overlay.querySelector('#f-goal').value,
      cadenceType: cadSel.value,
      cadenceN: overlay.querySelector('#f-n').value,
      xpPerCompletion: overlay.querySelector('#f-xp').value,
    };
    if (editing) updateHabit(state, habitId, data);
    else addHabit(state, data);
    ctx.save();
    // A steps habit may already be past goal today -> reflect immediately.
    ctx.syncSteps({ silent: true }).then(() => { overlay.remove(); ctx.render(); });
  });

  overlay.querySelector('#f-retire')?.addEventListener('click', () => {
    retireHabit(state, habitId, !editing.retired);
    ctx.save(); overlay.remove(); ctx.render();
  });
  overlay.querySelector('#f-del')?.addEventListener('click', () => {
    if (confirm('Delete this quest permanently?')) {
      deleteHabit(state, habitId); ctx.save(); overlay.remove(); ctx.render();
    }
  });
}

// ========================================================================
// SKILL TREE
// ========================================================================

export function renderTree(container, ctx) {
  const { state } = ctx;
  const nodes = evaluateTree(state);
  const stats = Object.values(state.stats);

  if (!stats.length) {
    container.innerHTML = '<div class="empty">No stats yet. Add some in Config to grow a skill tree.</div>';
    return;
  }

  const blocks = stats.map((stat) => {
    const sNodes = nodes.filter((n) => n.statId === stat.id);
    const W = 300;
    const H = 340;
    const cx = W / 2;
    const posOf = (n) => ({ x: cx + n.lane * 92, y: 55 + n.depth * 115 });

    // edges
    let lines = '';
    for (const n of sNodes) {
      const to = posOf(n);
      for (const pid of n.parents) {
        const parent = sNodes.find((p) => p.id === pid);
        if (!parent) continue;
        const from = posOf(parent);
        const lit = n.status === 'unlocked' || parent.status === 'unlocked';
        lines += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${lit ? '#f0c020' : '#3a3a66'}" stroke-width="3" />`;
      }
    }

    const nodeEls = sNodes.map((n) => {
      const p = posOf(n);
      const reqBits = [];
      if (n.req.minLevel) reqBits.push(`Lv${n.req.minLevel}`);
      if (n.req.sustainedDays) reqBits.push(`${n.req.sustainedDays}d steady`);
      return `
        <div class="node ${n.status}" data-node="${n.status === 'available' ? n.id : ''}"
             style="left:${p.x}px;top:${p.y}px">
          <div class="n-title">${esc(n.title)}</div>
          <div>${reqBits.join(' · ')}</div>
        </div>`;
    }).join('');

    const sd = Math.floor(sustainedDays(stat));
    return `
      <div class="window">
        <div class="tree-stat-label" style="color:${stat.color}">${esc(stat.name)} — ${sd}d steady (need ≥${SUSTAIN_THRESHOLD}% cond.)</div>
        <div class="tree-wrap">
          <div class="tree-canvas" style="width:${W}px;height:${H}px;margin:0 auto">
            <svg class="tree-svg" width="${W}" height="${H}">${lines}</svg>
            ${nodeEls}
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `<div class="section-label">SKILL TREE — tap glowing nodes to unlock</div>${blocks}`;

  container.querySelectorAll('.node[data-node]').forEach((el) => {
    if (!el.dataset.node) return;
    el.addEventListener('click', () => {
      const node = unlockNode(state, el.dataset.node);
      if (!node) return;
      ctx.save();
      ctx.flashBeat('SKILL UNLOCKED!', esc(node.title), state.stats[node.statId]?.color, () => ctx.render());
    });
  });
}

// ========================================================================
// CONFIG (settings)
// ========================================================================

export function renderSettings(container, ctx) {
  const { state } = ctx;
  const s = state.settings;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const statRows = Object.values(state.stats).map((st) => `
    <div class="menu-row" style="cursor:default">
      <span style="flex:1;color:${st.color}">${esc(st.name)}</span>
      <button class="btn small" data-editstat="${st.id}">EDIT</button>
      <button class="btn small danger" data-delstat="${st.id}">✕</button>
    </div>`).join('');

  container.innerHTML = `
    <div class="window">
      <div class="window-title">◆ STATS</div>
      ${statRows || '<div class="empty">No stats.</div>'}
      <button class="btn block" id="add-stat" style="margin-top:10px">＋ ADD STAT</button>
    </div>

    <div class="window">
      <div class="window-title">◆ REMINDERS</div>
      <label class="field">
        <span>WEEKLY CHECK-IN <input type="checkbox" id="ci-on" ${s.checkIn.enabled ? 'checked' : ''}></span>
      </label>
      <div style="display:flex;gap:10px">
        <label class="field" style="flex:1"><span>DAY</span>
          <select id="ci-day">${weekdays.map((w, i) => `<option value="${i}" ${s.checkIn.weekday === i ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
        <label class="field" style="flex:1"><span>HOUR</span>
          <select id="ci-hour">${hourOpts(s.checkIn.hour)}</select></label>
      </div>

      <div class="section-label" style="margin-left:0">GENERAL NUDGES (random within active hours)</div>
      <label class="field"><span>💧 WATER <input type="checkbox" id="w-on" ${s.general.water.enabled ? 'checked' : ''}> · per hour</span>
        <input type="number" id="w-n" min="1" max="4" value="${s.general.water.perHour}"></label>
      <label class="field"><span>🪑 POSTURE <input type="checkbox" id="p-on" ${s.general.posture.enabled ? 'checked' : ''}> · per hour</span>
        <input type="number" id="p-n" min="1" max="4" value="${s.general.posture.perHour}"></label>
      <div style="display:flex;gap:10px">
        <label class="field" style="flex:1"><span>ACTIVE FROM</span><select id="ah-s">${hourOpts(s.activeHours.start)}</select></label>
        <label class="field" style="flex:1"><span>ACTIVE TO</span><select id="ah-e">${hourOpts(s.activeHours.end)}</select></label>
      </div>
      <button class="btn primary block" id="apply-rem">APPLY REMINDERS</button>
      <div class="bar-caption" style="margin-top:8px">Reminders fire on-device only. They take effect in the Android build.</div>
    </div>

    <div class="window">
      <div class="window-title">◆ DATA</div>
      <div class="btn-row">
        <button class="btn" id="export">⬇ EXPORT</button>
        <button class="btn" id="import">⬆ IMPORT</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" class="hidden" />
      <button class="btn danger block" id="reset" style="margin-top:12px">RESET ALL DATA</button>
    </div>
  `;

  // Stats
  container.querySelector('#add-stat').addEventListener('click', () => statEditor(ctx, null));
  container.querySelectorAll('[data-editstat]').forEach((b) => b.addEventListener('click', () => statEditor(ctx, b.dataset.editstat)));
  container.querySelectorAll('[data-delstat]').forEach((b) => b.addEventListener('click', () => {
    if (confirm('Delete this stat? Habits will be unlinked from it.')) {
      deleteStat(state, b.dataset.delstat); ctx.save(); ctx.render();
    }
  }));

  // Reminders — persist on apply.
  container.querySelector('#apply-rem').addEventListener('click', async () => {
    s.checkIn.enabled = container.querySelector('#ci-on').checked;
    s.checkIn.weekday = Number(container.querySelector('#ci-day').value);
    s.checkIn.hour = Number(container.querySelector('#ci-hour').value);
    s.general.water.enabled = container.querySelector('#w-on').checked;
    s.general.water.perHour = Number(container.querySelector('#w-n').value);
    s.general.posture.enabled = container.querySelector('#p-on').checked;
    s.general.posture.perHour = Number(container.querySelector('#p-n').value);
    s.activeHours.start = Number(container.querySelector('#ah-s').value);
    s.activeHours.end = Number(container.querySelector('#ah-e').value);
    await ctx.save();
    const { ensurePermission } = await import('./notifications.js');
    await ensurePermission();
    await ctx.reschedule();
    ctx.toast('Reminders applied.');
  });

  // Data
  container.querySelector('#export').addEventListener('click', async () => {
    await exportState(state);
    ctx.toast('Backup exported.');
  });
  const fileInput = container.querySelector('#import-file');
  container.querySelector('#import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const next = parseImport(await readFile(file));
      if (confirm('Replace all current data with this backup?')) {
        ctx.replaceState(next);
        await ctx.save();
        ctx.toast('Backup imported.');
        ctx.render();
      }
    } catch (e) {
      alert(`Import failed: ${e.message}`);
    }
  });

  container.querySelector('#reset').addEventListener('click', async () => {
    if (confirm('Erase everything and start fresh? This cannot be undone.')) {
      ctx.replaceState(defaultState());
      await ctx.save();
      ctx.toast('Reset complete.');
      ctx.render();
    }
  });
}

function hourOpts(sel) {
  let out = '';
  for (let h = 0; h < 24; h += 1) {
    const label = `${String(h).padStart(2, '0')}:00`;
    out += `<option value="${h}" ${h === sel ? 'selected' : ''}>${label}</option>`;
  }
  return out;
}

function statEditor(ctx, statId) {
  const { state } = ctx;
  const editing = statId ? state.stats[statId] : null;
  const st = editing || { name: '', color: PALETTE[1] };
  const swatches = PALETTE.map((c) => `<span class="chip ${st.color === c ? 'on' : ''}" data-color="${c}" style="background:${c};width:26px;height:26px;${st.color === c ? 'color:#fff' : ''}"></span>`).join('');
  const overlay = modal(`
    <div class="window-title">${editing ? '◆ EDIT STAT' : '◆ NEW STAT'}</div>
    <label class="field"><span>NAME</span><input type="text" id="s-name" value="${esc(st.name)}" maxlength="18" /></label>
    <label class="field"><span>COLOR</span></label>
    <div class="chips" id="s-colors" style="margin-bottom:14px">${swatches}</div>
    <div class="btn-row"><button class="btn primary" id="s-save">SAVE</button></div>
  `);
  let color = st.color;
  overlay.querySelectorAll('[data-color]').forEach((c) => c.addEventListener('click', () => {
    color = c.dataset.color;
    overlay.querySelectorAll('[data-color]').forEach((x) => { x.classList.remove('on'); x.style.color = ''; });
    c.classList.add('on'); c.style.color = '#fff';
  }));
  overlay.querySelector('#s-save').addEventListener('click', () => {
    const name = overlay.querySelector('#s-name').value;
    if (editing) updateStat(state, statId, { name, color });
    else addStat(state, { name, color });
    ctx.save(); overlay.remove(); ctx.render();
  });
}
