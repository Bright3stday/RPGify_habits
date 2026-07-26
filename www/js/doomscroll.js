// Doomscroll reflection alert.
//
// A deliberately disruptive nudge with a deliberately non-judgemental message.
// The timing interrupts (mid-scroll); the copy only *observes* — "28 minutes on
// Instagram" — never instructs, scolds, or warns. No streak-broken framing, no
// red styling. A factual mirror at a moment meant to break the trance.
//
// Detection runs natively off Android **Usage Access** (no Accessibility). There
// are two user-chosen "paths", both reading the same permission:
//   • Oracle (default, reflect-on-return): nothing runs in the background. When
//     RPGify opens, `syncUsage()` reconstructs completed sessions since the last
//     check into the ledger — so the reckoning shows on return. No notification,
//     no extra battery.
//   • Sentinel (opt-in, real-time): a foreground service records the same ledger
//     rows continuously AND fires a live nudge at the threshold. Costs a
//     persistent "watching" notice + a little battery.
// Either way the native side only RECORDS raw session facts to a ledger; all
// scoring is computed in JS (spirit.js) so the mechanic stays OTA-tunable. THIS
// module holds (1) a thin bridge to the plugin, (2) the pure session/threshold/
// copy logic the native side mirrors, and (3) pure ledger→UI helpers — kept here
// so the behaviour is unit-tested.

// ---- native bridge -------------------------------------------------------

function plugin() {
  const c = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return c && c.Plugins && c.Plugins.Doomscroll;
}

export function isNativeAvailable() {
  return !!plugin();
}

export async function hasUsageAccess() {
  const p = plugin();
  if (!p) return false;
  try { return !!(await p.hasUsageAccess()).granted; } catch { return false; }
}

// Opens the system "Usage access" settings screen (a special-access permission
// that can't be requested with a normal dialog).
export async function openUsageAccessSettings() {
  const p = plugin();
  if (p) { try { await p.openUsageAccessSettings(); } catch { /* ignore */ } }
}

// Installed, launchable, non-system apps the user can choose to watch.
export async function getInstalledApps() {
  const p = plugin();
  if (!p) return [];
  try { return (await p.getInstalledApps()).apps || []; } catch { return []; }
}

// Start the Sentinel foreground service (real-time path). Persists the watched-
// apps config and starts the service that records sessions + fires live nudges.
export async function startMonitoring(config) {
  const p = plugin();
  if (!p) return false;
  try { await p.startMonitoring(sanitizeConfig(config)); return true; } catch { return false; }
}

// Stop the Sentinel service (and clear its persisted config).
export async function stopMonitoring() {
  const p = plugin();
  if (p) { try { await p.stopMonitoring(); } catch { /* ignore */ } }
}

// Is the Sentinel service currently running?
export async function isMonitoring() {
  const p = plugin();
  if (!p) return false;
  try { return !!(await p.isMonitoring()).active; } catch { return false; }
}

// ---- Oracle sync (reflect-on-return) --------------------------------------

// Reconstruct completed watched sessions from UsageStats since the last check
// and append them to the ledger, so opening RPGify shows what happened while it
// wasn't watching. Cheap and idempotent (the native side tracks its own cursor,
// shared with the Sentinel service so the two never double-count). Returns the
// number of sessions added. No-op (0) on the web preview or without Usage Access.
export async function syncUsage(config) {
  const p = plugin();
  if (!p || !p.syncUsage) return 0;
  try { return Number((await p.syncUsage(sanitizeConfig(config))).added) || 0; }
  catch { return 0; }
}

// Read the raw session ledger the detector has recorded. Returns { events, seq }.
// The native side only records facts; all scoring is computed here in JS (so the
// mechanic is OTA-tunable). Callers track the last `seq` they processed.
export async function readUsageEvents() {
  const p = plugin();
  if (!p) return { events: [], seq: 0 };
  try {
    const r = await p.readEvents();
    return { events: Array.isArray(r.events) ? r.events : [], seq: Number(r.seq) || 0 };
  } catch { return { events: [], seq: 0 }; }
}

// Dev/test: reset the native sync cursor so the next syncUsage replays from
// scratch (up to MAX_BACKFILL_MS). Useful after installing a new APK to verify
// the gap-merging fix without waiting for new sessions to accumulate.
export async function resetCursor() {
  const p = plugin();
  if (!p || !p.resetCursor) return false;
  try { await p.resetCursor(); return true; } catch { return false; }
}

// Dev/test: inject a fake session row directly into the native ledger. Lets
// you test Spirit scoring end-to-end without waiting 30 minutes in the app.
// pkg defaults to the first watched app; durationSec/thresholdMin are passed
// through to the session row so spirit.js scores it normally.
export async function injectTestSession(pkg, durationSec, thresholdMin) {
  const p = plugin();
  if (!p || !p.injectSession) return { ok: false };
  try { return await p.injectSession({ pkg, durationSec, thresholdMin }); }
  catch { return { ok: false }; }
}

// Diagnostics: read the current foreground app + elapsed session time.
export async function probe() {
  const p = plugin();
  if (!p) return { native: false };
  try { return { native: true, ...(await p.probe()) }; } catch { return { native: true, error: true }; }
}

// Post a sample reflection alert now (to confirm the notification path).
export async function fireTestAlert() {
  const p = plugin();
  if (!p) return false;
  try { await p.fireTestAlert(); return true; } catch { return false; }
}

// Factual one-line summary of a probe() result (tested).
export function probeSummary(r) {
  if (!r || r.native === false) return 'Diagnostics run in the Android app only.';
  if (r.error) return 'Could not read usage.';
  if (r.granted === false) return 'Usage access not granted yet.';
  if (!r.foreground) return 'No foreground app detected right now.';
  const m = Math.max(0, Math.round(r.elapsedMin || 0));
  return `${r.label || r.package} · ${m} min this session${r.watched ? ' · watched' : ''}`;
}

// ---- config --------------------------------------------------------------

export function defaultDoomscroll() {
  return {
    enabled: false,
    // Which detection path: 'oracle' (reflect-on-return, no background service —
    // the default) or 'sentinel' (real-time foreground service + live nudge).
    path: 'oracle',
    // How often the Sentinel service re-checks which app is foregrounded (to arm
    // the exact-fire timer). The nudge itself fires precisely at start+threshold
    // regardless, so this only bounds how soon a *new* session is noticed.
    pollMinutes: 1,
    // apps: [{ package, label, thresholdMin }]
    apps: [],
    // retrigger within the same continuous session (Sentinel only)
    retrigger: { mode: 'once', everyMin: 15 }, // 'once' | 'every'
  };
}

export function sanitizeConfig(cfg) {
  const d = defaultDoomscroll();
  const c = cfg || {};
  return {
    enabled: !!c.enabled,
    path: c.path === 'sentinel' ? 'sentinel' : 'oracle',
    pollMinutes: clampInt(c.pollMinutes, 1, 30, d.pollMinutes),
    apps: (Array.isArray(c.apps) ? c.apps : []).map((a) => ({
      package: String(a.package || ''),
      label: String(a.label || a.package || ''),
      thresholdMin: clampInt(a.thresholdMin, 1, 600, 20),
    })).filter((a) => a.package),
    retrigger: {
      mode: c.retrigger && c.retrigger.mode === 'every' ? 'every' : 'once',
      everyMin: clampInt(c.retrigger && c.retrigger.everyMin, 1, 240, 15),
    },
  };
}

function clampInt(v, lo, hi, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

// ---- pure detection logic (mirrored by DoomscrollService.java) -----------

// Reconstruct the CURRENT continuous foreground session from ordered UsageStats
// events. Each event: { package, type: 'foreground'|'background', timestamp }.
// A session is per-continuous-use: any switch to another app ends it, and the
// next open starts counting from zero. Returns { package, start, elapsedMs } for
// the app currently in the foreground, or null if it isn't a watched app.
export function currentSession(events, watched, now) {
  const set = watched instanceof Set ? watched : new Set(watched);
  let fg = null;
  let start = 0;
  for (const e of events) { // assumed ascending by timestamp
    if (e.type === 'foreground') { fg = e.package; start = e.timestamp; }
    else if (e.type === 'background' && e.package === fg) { fg = null; }
  }
  if (fg && set.has(fg)) return { package: fg, start, elapsedMs: Math.max(0, now - start) };
  return null;
}

// Decide whether this poll should fire an alert, given the session's elapsed
// minutes, the app threshold, when we last alerted THIS session (minutes, or
// null), and the retrigger config. Eligibility (crossing the threshold) is
// necessary but the caller still owns actually posting + recording lastAlertMin.
export function shouldAlert({ elapsedMin, thresholdMin, lastAlertMin, retrigger }) {
  if (elapsedMin < thresholdMin) return false;
  if (lastAlertMin == null) return true; // first crossing this session
  if (!retrigger || retrigger.mode !== 'every') return false; // once-per-session
  return elapsedMin - lastAlertMin >= retrigger.everyMin;
}

// Observation-only notification copy. Factual mirror, nothing else. Kept free of
// any instructional / evaluative language on purpose (asserted in tests).
export function observationCopy(appLabel, elapsedMin) {
  const mins = Math.max(1, Math.round(elapsedMin));
  return `${mins} ${mins === 1 ? 'minute' : 'minutes'} on ${appLabel}`;
}

// Real-time firing: given the *known* session start, compute how many ms from
// `now` until the next alert should fire — so the service can schedule a precise
// one-shot at the exact crossing instead of waiting for the next poll. Returns
// null when nothing more should fire this session. The service re-verifies the
// session is still current when the timer actually fires.
export function nextFireDelayMs({ session, thresholdMin, lastAlertMin, retrigger }, now) {
  if (!session) return null;
  let fireAt;
  if (lastAlertMin == null) {
    fireAt = session.start + thresholdMin * 60000; // first alert, exactly at crossing
  } else if (retrigger && retrigger.mode === 'every') {
    fireAt = session.start + (lastAlertMin + retrigger.everyMin) * 60000;
  } else {
    return null; // once-per-session, already alerted
  }
  return Math.max(0, fireAt - now);
}

// ---- ledger reading (pure) ----------------------------------------------
//
// The detector records raw `session` and `threshold` events. These helpers turn
// that ledger into what the UI shows and what future scoring consumes — kept
// pure so they're unit-tested and can evolve over-the-air.

// The most recent completed *watched* sessions, newest first.
export function watchedSessions(events, limit = 20) {
  return (Array.isArray(events) ? events : [])
    .filter((e) => e && e.type === 'session' && e.watched)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, limit);
}

// A factual one-line description of a recorded session for the transparency
// panel. `label` is resolved by the caller (events store only the package).
// Prefers the threshold-relative tail (paths-era rows); falls back to the
// nudge-relative tail for rows recorded by the pre-paths APK.
export function sessionLine(ev, label) {
  const mins = Math.max(0, Math.round((ev.durationSec || 0) / 60));
  const name = label || ev.package || 'app';
  let tail = '';
  const tMin = Number(ev.thresholdMin);
  if (Number.isFinite(tMin) && tMin > 0) {
    const pastMin = Math.round((Number(ev.durationSec) - tMin * 60) / 60);
    if (pastMin >= 1) tail = ` · ${pastMin} min past your ${tMin}-min limit`;
  } else if (ev.alerted) {
    const left = Number(ev.leftAfterAlertSec);
    tail = left >= 0 && left < 90
      ? ' · left soon after the nudge'
      : ' · stayed after the nudge';
  }
  return `${name} · ${mins} min${tail}`;
}

// Total watched minutes today (local day), per the ledger — the raw signal a
// future "total usage over time" view would build on. `now` and `dayStart` in ms.
export function watchedMinutesSince(events, sinceMs) {
  return (Array.isArray(events) ? events : [])
    .filter((e) => e && e.type === 'session' && e.watched && (e.end || e.ts || 0) >= sinceMs)
    .reduce((sum, e) => sum + Math.max(0, (e.durationSec || 0) / 60), 0);
}
