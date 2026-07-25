// Over-the-air (OTA) web updates.
//
// Most of this app is web code (www/). Capgo's capacitor-updater plugin lets a
// new web bundle be downloaded and swapped in at runtime, so day-to-day changes
// reach the phone WITHOUT building or reinstalling an APK. A fresh APK is only
// needed when *native* code changes (the step counter, doomscroll service, or a
// newly added plugin).
//
// Hosting is self-served on GitHub Pages — no Capgo account, no server. CI
// publishes a bundle zip + a `latest.json` manifest under `<channel>/`; this
// module fetches the manifest, compares build numbers, and applies newer web
// bundles. See docs/INSTALL_AND_UPDATE.md and .github/workflows/web-ota.yml.
//
// Build numbers are `git rev-list --count HEAD` (monotonic across the branch),
// stamped by CI into both the APK's baked-in `ota.json` and each published
// manifest, so "manifest build > my build" is a clean, cross-workflow test.

const OTA_BUILD_KEY = 'rpgify.ota.build'; // Preferences: last OTA build applied
const OTA_DISMISS_KEY = 'rpgify.ota.dismissed'; // Preferences: build the user snoozed

function cap() {
  return typeof window !== 'undefined' ? window.Capacitor : undefined;
}
function plugin(name) {
  const c = cap();
  return c && c.Plugins ? c.Plugins[name] : undefined;
}

// OTA only works inside the installed Android app (needs the native updater
// plugin). On the plain-web preview every entry point below is a safe no-op.
export function otaSupported() {
  return !!plugin('CapacitorUpdater');
}

// ---- Pure decision logic (unit-tested) ----------------------------------

// Given the build currently running, a fetched manifest, and the installed
// APK's native versionCode, decide what to do. Kept side-effect free.
export function shouldApply(current, manifest, nativeVersion) {
  if (!manifest || typeof manifest.build !== 'number' || !manifest.url) {
    return { apply: false, reason: 'invalid' };
  }
  if (manifest.build <= current) return { apply: false, reason: 'up-to-date' };
  // A web bundle can declare the minimum native versionCode it needs (CI sets
  // this from build.gradle). If the installed APK is older, the web change
  // relies on native code this phone doesn't have yet — needs a new APK.
  const minNative = Number(manifest.minNative || 0);
  if (minNative && nativeVersion != null && minNative > nativeVersion) {
    return { apply: false, reason: 'needs-apk' };
  }
  return { apply: true, reason: 'ready' };
}

// A human-readable line for the Config screen, from a checkForUpdate() result.
export function describeStatus(r) {
  switch (r && r.status) {
    case 'web': return 'Updates apply inside the installed Android app.';
    case 'unconfigured': return 'No update channel configured for this build.';
    case 'current': return `Up to date (build ${r.build}).`;
    case 'available': return `Update available (build ${r.manifest.build}).`;
    case 'needs-apk': return 'A newer version needs a fresh APK from Releases.';
    case 'downloading': return 'Downloading update…';
    case 'applied': return 'Update installed — restarting…';
    case 'offline': return 'Could not reach the update server. Try again later.';
    case 'error': return 'Update check failed. Try again later.';
    default: return '';
  }
}

// ---- Native glue --------------------------------------------------------

let baselineCache;
// The APK bakes in an `ota.json` (stamped by CI) describing the web build it
// shipped with and where to look for updates.
async function baseline() {
  if (baselineCache) return baselineCache;
  try {
    const res = await fetch('ota.json', { cache: 'no-store' });
    baselineCache = await res.json();
  } catch (e) {
    baselineCache = { build: 0, channel: '' };
  }
  return baselineCache;
}

async function appliedBuild() {
  const prefs = plugin('Preferences');
  if (!prefs) return 0;
  try {
    const { value } = await prefs.get({ key: OTA_BUILD_KEY });
    return value ? Number(value) || 0 : 0;
  } catch (e) { return 0; }
}

async function setAppliedBuild(build) {
  const prefs = plugin('Preferences');
  if (!prefs) return;
  try { await prefs.set({ key: OTA_BUILD_KEY, value: String(build) }); } catch (e) { /* ignore */ }
}

// "Later" dismissals: remember which build the user declined so the launch
// prompt doesn't nag every open. A newer build clears the snooze automatically.
export async function markDismissed(build) {
  const prefs = plugin('Preferences');
  if (!prefs) return;
  try { await prefs.set({ key: OTA_DISMISS_KEY, value: String(build) }); } catch (e) { /* ignore */ }
}

export async function isDismissed(build) {
  const prefs = plugin('Preferences');
  if (!prefs) return false;
  try {
    const { value } = await prefs.get({ key: OTA_DISMISS_KEY });
    return value != null && Number(value) === Number(build);
  } catch (e) { return false; }
}

// Installed APK's Android versionCode (App.getInfo().build), or null if unknown.
async function nativeVersion() {
  const app = plugin('App');
  if (!app || !app.getInfo) return null;
  try {
    const info = await app.getInfo();
    const n = Number(info.build);
    return Number.isFinite(n) ? n : null;
  } catch (e) { return null; }
}

// The build the app is effectively running: the higher of the APK's baked-in
// build and the last OTA bundle applied. (A freshly installed newer APK jumps
// ahead of any older OTA bundle, so we never "downgrade" back to it.)
export async function currentBuild() {
  const base = await baseline();
  const applied = await appliedBuild();
  return Math.max(Number(base.build) || 0, applied);
}

// Capgo rolls a freshly-set bundle back unless the app confirms it booted OK.
// Call this once, early, on every launch.
export async function notifyReady() {
  const p = plugin('CapacitorUpdater');
  if (!p || !p.notifyAppReady) return;
  try { await p.notifyAppReady(); } catch (e) { /* ignore */ }
}

// Check the channel and report whether a newer applicable bundle exists. This
// NEVER downloads or applies anything on its own — updates require explicit
// consent via applyUpdate(). Returns a status object; see describeStatus().
// An 'available' result carries the full manifest (build, version, notes) so
// the UI can show the user what's changing before they decide.
export async function checkForUpdate() {
  const p = plugin('CapacitorUpdater');
  if (!p) return { status: 'web' };

  const base = await baseline();
  if (!base.channel) return { status: 'unconfigured' };

  let manifest;
  try {
    const url = `${base.channel.replace(/\/$/, '')}/latest.json?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { status: 'offline' };
    manifest = await res.json();
  } catch (e) {
    return { status: 'offline' };
  }

  const current = await currentBuild();
  const decision = shouldApply(current, manifest, await nativeVersion());
  if (decision.reason === 'invalid') return { status: 'error' };
  if (decision.reason === 'up-to-date') return { status: 'current', build: current };
  if (decision.reason === 'needs-apk') return { status: 'needs-apk', build: manifest.build };
  return { status: 'available', manifest };
}

// Download and apply a specific manifest's bundle — called ONLY after the user
// agrees. set() reloads the app into the new bundle. Records the build BEFORE
// set() so the next boot sees it as current and doesn't re-offer it.
export async function applyUpdate(manifest) {
  const p = plugin('CapacitorUpdater');
  if (!p || !manifest || !manifest.url) return { status: 'error' };
  try {
    const b = await p.download({ url: manifest.url, version: manifest.version || `web-${manifest.build}` });
    await setAppliedBuild(manifest.build);
    await p.set({ id: b.id });
    return { status: 'applied', build: manifest.build };
  } catch (e) {
    return { status: 'error', error: String(e && e.message || e) };
  }
}
