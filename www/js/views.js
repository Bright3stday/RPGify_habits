// All four screens + the shared editor modals. Kept in one module so the
// small DOM helpers (segmented bar, condition badge, modal) are shared without
// ceremony. Views are pure render-on-demand: each sets container.innerHTML and
// wires listeners against the freshly-rendered nodes.

import { esc, fmtRelative, dayKey } from './util.js';
import { levelFromXp } from './leveling.js';
import { conditionState } from './condition.js';
import { CADENCE_TYPES, cadenceLabel, isDue, dueAt } from './cadence.js';
import {
  addHabit, updateHabit, retireHabit, deleteHabit, completeHabit, defaultState,
} from './game.js';
import {
  nodeStatus, nodesForStat, addNode, updateNode, deleteNode, unlockNode,
  eligibleNodes, growthInfo, practiceCount, nodeDepth,
} from './skilltree.js';
import { exportState, parseImport, readFile } from './backup.js';
import { heroSpriteSvg, heroTierName } from './sprites.js';
import {
  ATTRIBUTES, ATTR, characterSheet, overallCondition,
} from './attributes.js';
import {
  hasSensor, stepsToday, addManualSteps, setManualSteps,
} from './pedometer.js';
import { itemIconSvg, RARITY, RARITY_ORDER } from './items.js';
import {
  isNativeAvailable as doomNative, hasUsageAccess, openUsageAccessSettings,
  getInstalledApps, startMonitoring, stopMonitoring, sanitizeConfig, observationCopy,
  probe, fireTestAlert, probeSummary,
} from './doomscroll.js';
import {
  SLOTS, SLOT_LABEL, slotForItem, equipItem, unequipSlot, isKeyEquipped,
} from './equipment.js';

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
  ctx.reward(result); // level-ups + any loot beat
  ctx.render();
}

// ========================================================================
// DASHBOARD (status screen)
// ========================================================================

export function renderDashboard(container, ctx) {
  const { state } = ctx;
  const sheet = characterSheet(state);
  const gp = growthInfo(state);
  const overall = overallCondition(state);
  const habits = Object.values(state.habits).filter((h) => !h.retired);
  const due = habits.filter((h) => isDue(h)).sort((a, b) => dueAt(a) - dueAt(b));

  // Primary attributes with their upkeep (condition) dot.
  const primHtml = ATTRIBUTES.map((a) => {
    const st = state.stats[a.id];
    const cs = conditionState(st.condition);
    return `
      <div class="attr-row">
        <span class="attr-glyph" style="color:${a.color}">${a.glyph}</span>
        <span class="attr-name">${a.name}</span>
        <span class="attr-cond ${cs}" title="${st.condition}% upkeep"></span>
        <span class="attr-val">${sheet.primary[a.id]}</span>
      </div>`;
  }).join('');

  const der = sheet.derived;
  const derRows = [
    ['Attack', der.attack], ['Magic Attack', der.magicAttack],
    ['Defense', der.defense], ['Magic Defense', der.magicDefense],
    ['Speed', der.speed], ['Luck', der.luck],
  ].map(([n, v]) => `<div class="attr-row"><span class="attr-name dim">${n}</span><span class="attr-val">${v}</span></div>`).join('');

  const manualDue = due.filter((h) => h.source !== 'steps');
  const dueHtml = manualDue.length ? manualDue.map((h) => habitRow(h, ctx, true)).join('')
    : '<div class="empty">Nothing due right now.<br/>Rest, hero.</div>';

  container.innerHTML = `
    <div class="window">
      <div class="char-top">
        <div class="hero-avatar big">${heroSpriteSvg(state, { size: 104 })}</div>
        <div class="char-meta">
          <div class="char-name">${esc(heroTierName(state))}</div>
          <div class="char-level">LV ${sheet.level}</div>
          ${segBar(sheet.exp.pct, '#f0c020')}
          <div class="bar-caption">EXP ${sheet.exp.into}/${sheet.exp.span}</div>
          <div class="vitals">
            <span>HP <b>${sheet.hp}</b></span>
            <span>MP <b>${sheet.mp}</b></span>
            <span>GP <b style="color:${gp.points > 0 ? 'var(--green)' : 'var(--ink-dim)'}">${gp.points}/${gp.cap}</b></span>
          </div>
          ${condBadge(overall)}
        </div>
      </div>
      ${gp.points > 0 ? '<div class="bar-caption" style="margin-top:10px;color:var(--green)">▶ You have Growth Points to spend in Skills.</div>' : ''}
    </div>

    <div class="window">
      <div class="window-title">◆ ATTRIBUTES</div>
      <div class="attr-grid">
        <div class="attr-col">${primHtml}</div>
        <div class="attr-col">${derRows}</div>
      </div>
      <div class="bar-caption" style="margin-top:10px">Dots show each attribute's upkeep — neglect a habit and its attribute fades, dragging your hero toward a slime.</div>
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
// MASTERY TREE (user-authored nodes + Growth Points)
// ========================================================================

export function renderTree(container, ctx) {
  const { state } = ctx;
  const gi = growthInfo(state);
  const eligible = eligibleNodes(state);

  const tradeoff = eligible.length
    ? (gi.points >= 1
      ? `<div class="bar-caption" style="color:var(--gold);margin-top:6px">▶ ${eligible.length} node${eligible.length > 1 ? 's' : ''} eligible and ${gi.points} point${gi.points > 1 ? 's' : ''} to spend — choose where they go.</div>`
      : `<div class="bar-caption" style="margin-top:6px">${eligible.length} eligible · no Growth Points yet (next in ${Math.ceil(gi.nextInDays)}d).</div>`)
    : '';

  container.innerHTML = `
    <div class="window">
      <div class="window-title">◆ GROWTH POINTS</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="char-level" style="color:${gi.points > 0 ? 'var(--green)' : 'var(--ink-dim)'}">${gi.points} / ${gi.cap} GP</span>
        <span class="bar-caption">+${gi.perPeriod} ${gi.period} · next in ${Math.ceil(gi.nextInDays)}d</span>
      </div>
      <div class="bar-caption" style="margin-top:8px">Reaching a node's threshold makes it <b>eligible</b>; spend 1 Growth Point (and confirm you truly met it) to <b>unlock</b>. Points cap at ${gi.cap} and roll over.</div>
      ${tradeoff}
    </div>
    ${ATTRIBUTES.map((a) => treeBlock(ctx, a)).join('')}
  `;

  wireTree(container, ctx);
}

function treeBlock(ctx, attr) {
  const { state } = ctx;
  const all = state.tree.nodes;
  const list = nodesForStat(state, attr.id)
    .sort((x, y) => nodeDepth(x, all) - nodeDepth(y, all) || x.createdAt - y.createdAt);
  const level = levelFromXp(state.stats[attr.id].xp);
  const practice = practiceCount(state, attr.id);
  const cards = list.length
    ? list.map((n) => nodeCard(ctx, attr, n, level, practice)).join('')
    : '<div class="bar-caption" style="padding:8px 2px">No mastery nodes yet — add one.</div>';
  return `
    <div class="window">
      <div class="tree-stat-label" style="color:${attr.color}">${attr.glyph} ${esc(attr.name)} — Lv ${level} · ${practice} practice</div>
      ${cards}
      <button class="btn small block" data-addnode="${attr.id}" style="margin-top:8px">＋ ADD MASTERY NODE</button>
    </div>`;
}

function rewardText(reward, attr) {
  if (!reward) return '';
  return reward.type === 'xp'
    ? `+${Math.round((reward.value - 1) * 100)}% ${attr.abbr} XP`
    : `+${Math.round(reward.value * 100)}% decay resist`;
}

function nodeCard(ctx, attr, n, level, practice) {
  const { state } = ctx;
  const status = nodeStatus(state, n);
  const all = state.tree.nodes;
  const reqBits = [];
  if (n.thresholdType === 'practice') reqBits.push(`${Math.min(practice, n.thresholdValue)}/${n.thresholdValue} practice`);
  else reqBits.push(`Lv ${level}/${n.thresholdValue}`);
  if (n.parents && n.parents.length) {
    const names = n.parents.map((pid) => (all[pid] ? all[pid].title : '?')).join(', ');
    reqBits.push(n.requireMode === 'any' ? `any ${n.anyCount} of: ${names}` : `after: ${names}`);
  }
  const reward = rewardText(n.reward, attr);
  let action = '';
  if (status === 'eligible') {
    action = `
      <label class="mnode-confirm"><input type="checkbox" data-confirm="${n.id}"> I genuinely met this</label>
      <button class="btn small primary" data-spend="${n.id}" disabled>Spend 1 GP ▸ Unlock</button>`;
  } else if (status === 'unlocked') {
    action = `<div class="mnode-done">✓ Unlocked${reward ? ` · <span style="color:var(--gold)">${reward}</span>` : ''}</div>`;
  }
  return `
    <div class="mnode ${status}" style="--ac:${attr.color}">
      <div class="mnode-head">
        <span class="mnode-title">${esc(n.title)}</span>
        <span class="mnode-status">${status}</span>
        <button class="btn small" data-editnode="${n.id}">✎</button>
      </div>
      ${n.criteria ? `<div class="mnode-crit">“${esc(n.criteria)}”</div>` : ''}
      <div class="mnode-req">${reqBits.join(' · ')}${reward && status !== 'unlocked' ? ` · reward ${reward}` : ''}</div>
      ${action}
    </div>`;
}

function wireTree(container, ctx) {
  const { state } = ctx;
  const points = growthInfo(state).points;
  container.querySelectorAll('[data-addnode]').forEach((b) => b.addEventListener('click', () => nodeEditor(ctx, b.dataset.addnode, null)));
  container.querySelectorAll('[data-editnode]').forEach((b) => b.addEventListener('click', () => {
    const n = state.tree.nodes[b.dataset.editnode];
    if (n) nodeEditor(ctx, n.statId, n.id);
  }));
  container.querySelectorAll('[data-confirm]').forEach((cb) => cb.addEventListener('change', () => {
    const btn = container.querySelector(`[data-spend="${cb.dataset.confirm}"]`);
    if (btn) btn.disabled = !(cb.checked && points >= 1);
  }));
  container.querySelectorAll('[data-spend]').forEach((btn) => btn.addEventListener('click', () => {
    const res = unlockNode(state, btn.dataset.spend);
    if (res.ok) {
      ctx.save();
      ctx.flashBeat('MASTERY UNLOCKED!', esc(res.node.title), state.stats[res.node.statId]?.color, () => ctx.render());
    } else if (res.reason === 'no-points') {
      ctx.toast('No Growth Points to spend.');
    } else {
      ctx.toast('Not eligible right now.');
    }
  }));
}

function nodeEditor(ctx, statId, nodeId) {
  const { state } = ctx;
  const attr = ATTR[statId];
  const editing = nodeId ? state.tree.nodes[nodeId] : null;
  const n = editing || {
    title: '', criteria: '', thresholdType: 'practice', thresholdValue: 10,
    parents: [], requireMode: 'all', anyCount: 1, reward: null,
  };
  const others = nodesForStat(state, statId).filter((x) => x.id !== nodeId);
  const parentChips = others.length
    ? others.map((o) => `<span class="chip ${n.parents.includes(o.id) ? 'on' : ''}" data-parent="${o.id}">${esc(o.title)}</span>`).join('')
    : '<span class="bar-caption">No other nodes in this tree yet.</span>';
  const rt = n.reward ? n.reward.type : 'none';
  const rpct = n.reward ? (n.reward.type === 'xp' ? Math.round((n.reward.value - 1) * 100) : Math.round(n.reward.value * 100)) : 15;

  const overlay = modal(`
    <div class="window-title">${editing ? '◆ EDIT NODE' : `◆ NEW ${esc(attr.name.toUpperCase())} NODE`}</div>
    <label class="field"><span>TITLE</span><input type="text" id="n-title" value="${esc(n.title)}" maxlength="40" /></label>
    <label class="field"><span>WHAT "CLEARED" MEANS — your own words</span><textarea id="n-crit" maxlength="200">${esc(n.criteria)}</textarea></label>
    <div style="display:flex;gap:10px">
      <label class="field" style="flex:1"><span>ELIGIBLE WHEN</span><select id="n-tt">
        <option value="practice" ${n.thresholdType === 'practice' ? 'selected' : ''}>Practice count ≥</option>
        <option value="level" ${n.thresholdType === 'level' ? 'selected' : ''}>${esc(attr.name)} level ≥</option>
      </select></label>
      <label class="field" style="width:84px"><span>VALUE</span><input type="number" id="n-tv" min="1" max="100000" value="${n.thresholdValue}" /></label>
    </div>
    <label class="field"><span>DEPENDS ON (optional)</span></label>
    <div class="chips" id="n-parents" style="margin-bottom:10px">${parentChips}</div>
    <div style="display:flex;gap:10px" id="n-mode-row">
      <label class="field" style="flex:1"><span>REQUIRE</span><select id="n-mode">
        <option value="all" ${n.requireMode === 'all' ? 'selected' : ''}>All of them</option>
        <option value="any" ${n.requireMode === 'any' ? 'selected' : ''}>Any N of them</option>
      </select></label>
      <label class="field" style="width:84px" id="n-anywrap"><span>N</span><input type="number" id="n-any" min="1" max="20" value="${n.anyCount}" /></label>
    </div>
    <div style="display:flex;gap:10px">
      <label class="field" style="flex:1"><span>REWARD (optional)</span><select id="n-rt">
        <option value="none" ${rt === 'none' ? 'selected' : ''}>None</option>
        <option value="xp" ${rt === 'xp' ? 'selected' : ''}>+% ${esc(attr.abbr)} XP</option>
        <option value="resist" ${rt === 'resist' ? 'selected' : ''}>+% decay resist</option>
      </select></label>
      <label class="field" style="width:84px" id="n-rpwrap"><span>%</span><input type="number" id="n-rp" min="1" max="100" value="${rpct}" /></label>
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn primary" id="n-save">SAVE</button>
      ${editing ? '<button class="btn danger" id="n-del">DELETE</button>' : ''}
    </div>
  `);

  const chosen = new Set(n.parents);
  const modeRow = overlay.querySelector('#n-mode-row');
  const anyWrap = overlay.querySelector('#n-anywrap');
  const modeSel = overlay.querySelector('#n-mode');
  const syncMode = () => {
    modeRow.style.display = chosen.size ? 'flex' : 'none';
    anyWrap.style.display = (chosen.size && modeSel.value === 'any') ? 'block' : 'none';
  };
  overlay.querySelectorAll('[data-parent]').forEach((chip) => chip.addEventListener('click', () => {
    const id = chip.dataset.parent;
    if (chosen.has(id)) { chosen.delete(id); chip.classList.remove('on'); } else { chosen.add(id); chip.classList.add('on'); }
    syncMode();
  }));
  modeSel.addEventListener('change', syncMode);
  syncMode();

  const rtSel = overlay.querySelector('#n-rt');
  const rpWrap = overlay.querySelector('#n-rpwrap');
  const syncReward = () => { rpWrap.style.display = rtSel.value === 'none' ? 'none' : 'block'; };
  rtSel.addEventListener('change', syncReward);
  syncReward();

  overlay.querySelector('#n-save').addEventListener('click', () => {
    const rtv = rtSel.value;
    const pct = Number(overlay.querySelector('#n-rp').value) || 0;
    let reward = null;
    if (rtv === 'xp') reward = { type: 'xp', value: 1 + pct / 100 };
    else if (rtv === 'resist') reward = { type: 'resist', value: pct / 100 };
    const data = {
      statId,
      title: overlay.querySelector('#n-title').value,
      criteria: overlay.querySelector('#n-crit').value,
      thresholdType: overlay.querySelector('#n-tt').value,
      thresholdValue: overlay.querySelector('#n-tv').value,
      parents: [...chosen],
      requireMode: modeSel.value,
      anyCount: overlay.querySelector('#n-any').value,
      reward,
    };
    if (editing) updateNode(state, nodeId, data);
    else addNode(state, data);
    ctx.save(); overlay.remove(); ctx.render();
  });
  overlay.querySelector('#n-del')?.addEventListener('click', () => {
    if (confirm('Delete this mastery node?')) { deleteNode(state, nodeId); ctx.save(); overlay.remove(); ctx.render(); }
  });
}

// ========================================================================
// CONFIG (settings)
// ========================================================================

export function renderSettings(container, ctx) {
  const { state } = ctx;
  const s = state.settings;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  container.innerHTML = `
    <div class="window">
      <div class="window-title">◆ ATTRIBUTES</div>
      ${ATTRIBUTES.map((a) => `<div class="menu-row" style="cursor:default">
        <span class="attr-glyph" style="color:${a.color}">${a.glyph}</span>
        <span style="flex:1;color:${a.color}">${esc(a.name)}</span>
        <span class="bar-caption">${esc(a.desc)}</span>
      </div>`).join('')}
      <div class="bar-caption" style="margin-top:8px">The six attributes are fixed. Assign each quest to the ones it trains.</div>
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
      <div class="btn-row">
        <button class="btn primary" id="apply-rem">APPLY</button>
        <button class="btn gold" id="test-rem">🔔 TEST (5s)</button>
      </div>
      <div class="bar-caption" style="margin-top:8px">Reminders fire on-device only (Android build). Water/posture nudges land at a random minute within each active hour, so the first can be up to an hour away — use TEST to confirm they work now.</div>
    </div>

    ${doomscrollSection(state)}

    <div class="window">
      <div class="window-title">◆ GROWTH POINTS</div>
      <div style="display:flex;gap:10px">
        <label class="field" style="flex:1"><span>GRANT EVERY</span><select id="gp-period">
          <option value="weekly" ${state.growth.period === 'weekly' ? 'selected' : ''}>Week</option>
          <option value="monthly" ${state.growth.period === 'monthly' ? 'selected' : ''}>Month</option>
        </select></label>
        <label class="field" style="width:96px"><span>POINTS</span><input type="number" id="gp-per" min="1" max="10" value="${state.growth.perPeriod}"></label>
      </div>
      <button class="btn primary block" id="gp-apply">APPLY</button>
      <div class="bar-caption" style="margin-top:8px">You currently hold ${growthInfo(state).points}/${growthInfo(state).cap} GP. Balance caps at 2× the per-period grant and rolls over.</div>
    </div>

    <div class="window">
      <div class="window-title">◆ APP UPDATES</div>
      <div class="bar-caption" id="ota-status">Checking current version…</div>
      <button class="btn primary block" id="ota-check" style="margin-top:8px">CHECK FOR UPDATES</button>
      <div class="bar-caption" style="margin-top:8px">Web changes install over-the-air here — no APK download needed. Only brand-new native features require a fresh APK from the Releases page.</div>
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

  // Growth Points config.
  container.querySelector('#gp-apply').addEventListener('click', async () => {
    state.growth.period = container.querySelector('#gp-period').value === 'monthly' ? 'monthly' : 'weekly';
    state.growth.perPeriod = Math.max(1, Math.min(10, Number(container.querySelector('#gp-per').value) || 3));
    // Re-cap the current balance to the new 2x cap.
    state.growth.points = Math.min(state.growth.points, 2 * state.growth.perPeriod);
    await ctx.save();
    ctx.toast('Growth Points updated.');
    ctx.render();
  });

  wireDoomscroll(container, ctx);

  // Fire a test notification ~5s out to verify permission + channel + display.
  container.querySelector('#test-rem').addEventListener('click', async () => {
    const { testNotification } = await import('./notifications.js');
    const res = await testNotification();
    if (res.ok) ctx.toast('Test sent — watch for it in ~5s.');
    else if (res.reason === 'permission') ctx.toast('Notifications not permitted — allow them in Android settings.', 2600);
    else ctx.toast('Reminders only work in the installed Android app.', 2600);
  });

  // App updates (OTA) — show current build, allow a manual check.
  (async () => {
    const { otaSupported, currentBuild, describeStatus } = await import('./ota.js');
    const statusEl = container.querySelector('#ota-status');
    if (!statusEl) return;
    if (!otaSupported()) {
      statusEl.textContent = describeStatus({ status: 'web' });
    } else {
      statusEl.textContent = `Current version: build ${await currentBuild()}.`;
    }
  })();
  container.querySelector('#ota-check').addEventListener('click', async () => {
    const { checkForUpdate, describeStatus } = await import('./ota.js');
    const statusEl = container.querySelector('#ota-status');
    statusEl.textContent = 'Checking for updates…';
    const r = await checkForUpdate({ manual: true });
    statusEl.textContent = describeStatus(r);
    ctx.toast(describeStatus(r), 2600);
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

// ---- Doomscroll mirror (Config section) ---------------------------------

function doomscrollSection(state) {
  const d = state.settings.doomscroll;
  const apps = d.apps || [];
  const appRows = apps.length ? apps.map((a, i) => `
    <div class="menu-row" style="cursor:default">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(a.label)}</span>
      <input type="number" class="ds-th" data-i="${i}" min="1" max="600" value="${a.thresholdMin}" style="width:58px" />
      <span class="bar-caption">min</span>
      <button class="btn small danger" data-dsrm="${i}">✕</button>
    </div>`).join('') : '<div class="bar-caption" style="padding:6px 2px">No apps chosen yet.</div>';
  return `
    <div class="window">
      <div class="window-title">◆ DOOMSCROLL MIRROR</div>
      <label class="field"><span>ENABLE <input type="checkbox" id="ds-on" ${d.enabled ? 'checked' : ''}></span></label>
      <div class="bar-caption" id="ds-access">Checking usage access…</div>
      <button class="btn small block" id="ds-grant" style="margin:8px 0">GRANT USAGE ACCESS</button>
      <div class="section-label" style="margin-left:0">WATCHED APPS · alert after N continuous min</div>
      ${appRows}
      <button class="btn small block" id="ds-add" style="margin-top:8px">＋ CHOOSE APPS</button>
      <div class="bar-caption" style="margin-top:8px">YouTube can't distinguish Shorts from long-form — give it a much longer threshold, or leave it off.</div>
      <div style="display:flex;gap:10px;margin-top:6px">
        <label class="field" style="flex:1"><span>RE-ALERT</span><select id="ds-rt">
          <option value="once" ${d.retrigger.mode === 'once' ? 'selected' : ''}>Once per session</option>
          <option value="every" ${d.retrigger.mode === 'every' ? 'selected' : ''}>Every N minutes</option>
        </select></label>
        <label class="field" style="width:84px" id="ds-everywrap"><span>N MIN</span><input type="number" id="ds-every" min="1" max="240" value="${d.retrigger.everyMin}"></label>
      </div>
      <label class="field"><span>CHECK EVERY (min) — how often it re-checks the foreground app</span><input type="number" id="ds-poll" min="1" max="30" value="${d.pollMinutes}"></label>
      <button class="btn primary block" id="ds-apply">APPLY</button>
      <div class="section-label" style="margin-left:0">DIAGNOSTICS</div>
      <div class="btn-row">
        <button class="btn small" id="ds-probe">🔍 PROBE CURRENT APP</button>
        <button class="btn small gold" id="ds-test">🔔 TEST ALERT</button>
      </div>
      <div class="bar-caption" id="ds-probe-out" style="margin-top:6px">Probe reads whatever app is in the foreground right now + how long you've been in it.</div>
      <div class="bar-caption" style="margin-top:8px">Disruptive timing, calm message — e.g. “${esc(observationCopy('Instagram', 28))}”. It only notices; it never tells you what to do. Runs as a foreground service (a persistent notice, more battery) that reads app usage times; the alert is scheduled to fire <b>exactly</b> at your threshold from the real session start.</div>
    </div>`;
}

function wireDoomscroll(container, ctx) {
  const { state } = ctx;
  const d = state.settings.doomscroll;
  const everyWrap = container.querySelector('#ds-everywrap');
  const rtSel = container.querySelector('#ds-rt');
  const syncRt = () => { everyWrap.style.display = rtSel.value === 'every' ? 'block' : 'none'; };
  rtSel.addEventListener('change', syncRt); syncRt();

  container.querySelectorAll('.ds-th').forEach((inp) => inp.addEventListener('change', () => {
    const i = Number(inp.dataset.i);
    if (d.apps[i]) d.apps[i].thresholdMin = Math.max(1, Math.min(600, Number(inp.value) || 20));
  }));
  container.querySelectorAll('[data-dsrm]').forEach((b) => b.addEventListener('click', () => {
    d.apps.splice(Number(b.dataset.dsrm), 1); ctx.save(); ctx.render();
  }));

  (async () => {
    const el = container.querySelector('#ds-access');
    if (!doomNative()) { el.textContent = 'Usage access is Android-only (no effect on web).'; return; }
    const ok = await hasUsageAccess();
    el.textContent = ok ? 'Usage access granted ✓' : 'Usage access not granted yet — tap below.';
    el.style.color = ok ? 'var(--green)' : 'var(--ink-dim)';
  })();

  container.querySelector('#ds-grant').addEventListener('click', async () => {
    await openUsageAccessSettings();
    ctx.toast('Enable "Usage access" for RPGify, then return.', 2600);
  });
  container.querySelector('#ds-probe').addEventListener('click', async () => {
    const out = container.querySelector('#ds-probe-out');
    out.textContent = 'Probing…';
    out.textContent = probeSummary(await probe());
  });
  container.querySelector('#ds-test').addEventListener('click', async () => {
    if (!doomNative()) { ctx.toast('Alerts fire in the Android app only.'); return; }
    const ok = await fireTestAlert();
    ctx.toast(ok ? 'Sample alert posted.' : 'Grant notification permission first.');
  });
  container.querySelector('#ds-add').addEventListener('click', () => appPicker(ctx));
  container.querySelector('#ds-apply').addEventListener('click', async () => {
    d.enabled = container.querySelector('#ds-on').checked;
    d.retrigger.mode = rtSel.value;
    d.retrigger.everyMin = Math.max(1, Math.min(240, Number(container.querySelector('#ds-every').value) || 15));
    d.pollMinutes = Math.max(1, Math.min(30, Number(container.querySelector('#ds-poll').value) || 1));
    state.settings.doomscroll = sanitizeConfig(d);
    await ctx.save();
    if (!doomNative()) { ctx.toast('Saved. Monitoring runs in the Android app.'); return; }
    if (state.settings.doomscroll.enabled) {
      if (!(await hasUsageAccess())) { ctx.toast('Grant usage access first.'); return; }
      const { ensurePermission } = await import('./notifications.js');
      await ensurePermission();
      await startMonitoring(state.settings.doomscroll);
      ctx.toast('Focus monitor started.');
    } else {
      await stopMonitoring();
      ctx.toast('Focus monitor stopped.');
    }
  });
}

async function appPicker(ctx) {
  const { state } = ctx;
  const d = state.settings.doomscroll;
  const overlay = modal('<div class="window-title">◆ CHOOSE APPS</div><div id="ap-body"><div class="bar-caption">Loading…</div></div>');
  const body = overlay.querySelector('#ap-body');

  if (!doomNative()) {
    body.innerHTML = `
      <div class="bar-caption">The installed-app list needs the Android build + Usage Access. Add one manually:</div>
      <label class="field"><span>APP NAME</span><input type="text" id="ap-label" placeholder="Instagram"></label>
      <label class="field"><span>PACKAGE</span><input type="text" id="ap-pkg" placeholder="com.instagram.android"></label>
      <button class="btn primary block" id="ap-manual">ADD</button>`;
    overlay.querySelector('#ap-manual').addEventListener('click', () => {
      const pkg = overlay.querySelector('#ap-pkg').value.trim();
      const label = overlay.querySelector('#ap-label').value.trim() || pkg;
      if (pkg && !d.apps.some((a) => a.package === pkg)) d.apps.push({ package: pkg, label, thresholdMin: 20 });
      overlay.remove(); ctx.render();
    });
    return;
  }

  const apps = (await getInstalledApps()).sort((a, b) => a.label.localeCompare(b.label));
  const chosen = new Set(d.apps.map((a) => a.package));
  body.innerHTML = `
    <input type="text" id="ap-search" placeholder="search…" style="margin-bottom:8px" />
    <div id="ap-list" style="max-height:52vh;overflow:auto"></div>
    <button class="btn primary block" id="ap-done" style="margin-top:8px">DONE</button>`;
  const list = overlay.querySelector('#ap-list');
  const draw = (q = '') => {
    list.innerHTML = apps.filter((a) => a.label.toLowerCase().includes(q)).slice(0, 250).map((a) => `
      <div class="menu-row" style="cursor:pointer" data-pkg="${esc(a.package)}" data-label="${esc(a.label)}">
        <span style="flex:1">${esc(a.label)}</span><span style="color:var(--green)">${chosen.has(a.package) ? '✓' : ''}</span></div>`).join('');
    list.querySelectorAll('[data-pkg]').forEach((row) => row.addEventListener('click', () => {
      const pkg = row.dataset.pkg;
      if (chosen.has(pkg)) { chosen.delete(pkg); d.apps = d.apps.filter((a) => a.package !== pkg); } else { chosen.add(pkg); d.apps.push({ package: pkg, label: row.dataset.label, thresholdMin: 20 }); }
      draw(overlay.querySelector('#ap-search').value.toLowerCase());
    }));
  };
  draw();
  overlay.querySelector('#ap-search').addEventListener('input', (e) => draw(e.target.value.toLowerCase()));
  overlay.querySelector('#ap-done').addEventListener('click', () => { ctx.save(); overlay.remove(); ctx.render(); });
}

function hourOpts(sel) {
  let out = '';
  for (let h = 0; h < 24; h += 1) {
    const label = `${String(h).padStart(2, '0')}:00`;
    out += `<option value="${h}" ${h === sel ? 'selected' : ''}>${label}</option>`;
  }
  return out;
}

// ========================================================================
// BAG (inventory / loot)
// ========================================================================

export function renderInventory(container, ctx) {
  const { state } = ctx;
  const items = state.inventory || [];
  const eq = state.equipment || {};

  // Equipment slots around the hero.
  const slotsHtml = SLOTS.map((slot) => {
    const it = eq[slot];
    const inner = it
      ? `<div class="loot-ico">${itemIconSvg(it, { size: 30 })}</div><div class="slot-name" style="color:${RARITY[it.rarity].color}">${esc(it.name)}</div>`
      : `<div class="slot-empty">${SLOT_LABEL[slot]}</div>`;
    return `<div class="gear-slot ${it ? 'filled' : ''}" style="--rc:${it ? RARITY[it.rarity].color : '#2a2a55'}" data-slot="${slot}">${inner}</div>`;
  }).join('');

  // Group identical loot; sort by rarity then name.
  const byKey = new Map();
  for (const it of items) {
    const g = byKey.get(it.key);
    if (g) g.count += 1;
    else byKey.set(it.key, { ...it, count: 1 });
  }
  const groups = [...byKey.values()].sort((a, b) => {
    const r = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    return r !== 0 ? r : a.name.localeCompare(b.name);
  });

  const grid = groups.length ? `<div class="loot-grid">${groups.map((g) => {
    const equippable = !!slotForItem(g);
    const on = isKeyEquipped(state, g.key);
    return `
      <div class="loot-cell ${equippable ? 'equippable' : ''} ${on ? 'equipped' : ''}"
           style="--rc:${RARITY[g.rarity].color}" ${equippable ? `data-equip="${g.key}"` : ''}
           title="${esc(g.name)} — ${RARITY[g.rarity].label} ${esc(g.type)}${equippable ? (on ? ' (equipped — tap to remove)' : ' (tap to equip)') : ''}">
        ${on ? '<span class="equip-badge">E</span>' : ''}
        <div class="loot-ico">${itemIconSvg(g, { size: 44 })}</div>
        ${g.count > 1 ? `<span class="loot-count">×${g.count}</span>` : ''}
        <div class="loot-name" style="color:${RARITY[g.rarity].color}">${esc(g.name)}</div>
        <div class="loot-type">${esc(g.type)}</div>
      </div>`;
  }).join('')}</div>`
    : '<div class="empty">No loot yet.<br/>Complete quests to find treasure.</div>';

  container.innerHTML = `
    <div class="window">
      <div class="window-title">◆ HERO</div>
      <div class="hero-panel">
        <div class="hero-avatar">${heroSpriteSvg(state, { size: 108 })}</div>
        <div class="gear-slots">${slotsHtml}</div>
      </div>
      <div class="hero-bonus"><span class="bar-caption">${esc(heroTierName(state))} · gear is cosmetic — your power comes from leveling and skills.</span></div>
    </div>
    <div class="section-label">BAG (${items.length}) — tap gear to equip</div>
    ${grid}
  `;

  // Unequip by tapping a filled slot.
  container.querySelectorAll('.gear-slot.filled').forEach((el) => el.addEventListener('click', () => {
    unequipSlot(state, el.dataset.slot);
    ctx.save(); ctx.render();
  }));
  // Equip / unequip by tapping a loot cell.
  container.querySelectorAll('[data-equip]').forEach((el) => el.addEventListener('click', () => {
    const key = el.dataset.equip;
    const item = groups.find((g) => g.key === key);
    if (isKeyEquipped(state, key)) {
      const slot = SLOTS.find((s) => eq[s] && eq[s].key === key);
      if (slot) unequipSlot(state, slot);
      ctx.toast(`Unequipped ${item.name}`);
    } else {
      const slot = equipItem(state, item);
      if (slot) ctx.toast(`Equipped ${item.name}`);
    }
    ctx.save(); ctx.render();
  }));
}
