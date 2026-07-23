// Storage abstraction.
//
// Runs on plain web (localStorage) and inside Capacitor (Preferences plugin).
// Everything is a single JSON blob keyed under STORAGE_KEY — the whole game
// state is small enough that read-modify-write of one blob is simpler and
// safer than a normalized multi-key layout, and it makes export/import trivial.

const STORAGE_KEY = 'rpgify.state.v1';

function cap() {
  return typeof window !== 'undefined' ? window.Capacitor : undefined;
}

// Is the Capacitor Preferences plugin actually available? (Native builds only.)
function hasPreferences() {
  const c = cap();
  return !!(c && c.Plugins && c.Plugins.Preferences);
}

export async function loadRaw() {
  if (hasPreferences()) {
    const { value } = await cap().Plugins.Preferences.get({ key: STORAGE_KEY });
    return value ?? null;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(STORAGE_KEY);
  }
  return null;
}

export async function saveRaw(raw) {
  if (hasPreferences()) {
    await cap().Plugins.Preferences.set({ key: STORAGE_KEY, value: raw });
    return;
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, raw);
  }
}

export async function loadState() {
  const raw = await loadRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Corrupt saved state, ignoring', e);
    return null;
  }
}

export async function saveState(state) {
  await saveRaw(JSON.stringify(state));
}

export { STORAGE_KEY };
