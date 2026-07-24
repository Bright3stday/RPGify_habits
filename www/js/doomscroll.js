// Doomscroll reflection alert.
//
// A deliberately disruptive nudge with a deliberately non-judgemental message.
// The timing interrupts (mid-scroll); the copy only *observes* — "28 minutes on
// Instagram" — never instructs, scolds, or warns. No streak-broken framing, no
// red styling. A factual mirror at a moment meant to break the trance.
//
// The real detection loop runs in a native Android foreground service
// (DoomscrollService.java) polling UsageStats — the webview isn't alive when the
// app is backgrounded, so JS can't do it. THIS module holds (1) a thin bridge to
// that native plugin and (2) the pure session/threshold/copy logic that the
// service mirrors, so the important behaviour is unit-tested here.

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

export async function startMonitoring(config) {
  const p = plugin();
  if (!p) return false;
  try { await p.startMonitoring(sanitizeConfig(config)); return true; } catch { return false; }
}

export async function stopMonitoring() {
  const p = plugin();
  if (p) { try { await p.stopMonitoring(); } catch { /* ignore */ } }
}

export async function isMonitoring() {
  const p = plugin();
  if (!p) return false;
  try { return !!(await p.isMonitoring()).active; } catch { return false; }
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
    // How often the service re-checks which app is foregrounded (to arm the
    // exact-fire timer). The alert itself fires precisely at start+threshold
    // regardless, so this only bounds how soon a *new* session is noticed.
    pollMinutes: 1,
    // apps: [{ package, label, thresholdMin }]
    apps: [],
    // retrigger within the same continuous session
    retrigger: { mode: 'once', everyMin: 15 }, // 'once' | 'every'
  };
}

export function sanitizeConfig(cfg) {
  const d = defaultDoomscroll();
  const c = cfg || {};
  return {
    enabled: !!c.enabled,
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

// Gap (minutes) of non-use that ends a continuous session, for the OS session
// observer. Mirrors DoomscrollUtil.SESSION_GAP_MIN.
export const SESSION_GAP_MIN = 1;

// Map the config to per-app OS-observer specs (API 29+ path). The native
// DoomscrollObserver registers one usage-session observer per app with these
// params; observer id = the app's index. Kept here so the mapping is tested.
export function observerSpecs(config) {
  const c = sanitizeConfig(config);
  return c.apps.map((a, i) => ({
    id: i,
    package: a.package,
    label: a.label,
    timeLimitMin: a.thresholdMin,
    sessionGapMin: SESSION_GAP_MIN,
  }));
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
