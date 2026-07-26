// Explicit, user-triggered backup. No auto-sync, no server — export produces a
// JSON file the user saves/shares; import replaces state from such a file.

import { SCHEMA_VERSION } from './game.js';

function caps() {
  const c = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return c && c.Plugins ? c.Plugins : {};
}

export function serialize(state) {
  return JSON.stringify({ ...state, exportedAt: Date.now() }, null, 2);
}

function filename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `rpgify-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
}

// Export: prefer native Filesystem+Share; fall back to a browser download.
export async function exportState(state) {
  const json = serialize(state);
  const name = filename();
  const { Filesystem, Share } = caps();
  if (Filesystem && Share) {
    try {
      const res = await Filesystem.writeFile({
        path: name,
        data: json,
        directory: 'CACHE',
        encoding: 'utf8',
      });
      await Share.share({ title: 'RPGify Habits backup', url: res.uri });
      return { ok: true, method: 'share' };
    } catch (e) {
      console.warn('native export failed, falling back', e);
    }
  }
  // Web download.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, method: 'download' };
}

// Validate + normalize imported text into a state object. Throws on garbage.
export function parseImport(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error('Not valid JSON.');
  }
  if (!obj || typeof obj !== 'object' || !obj.stats || !obj.habits) {
    throw new Error('This does not look like an RPGify backup.');
  }
  if (obj.version !== SCHEMA_VERSION) {
    // Single schema version so far; accept but warn.
    console.warn(`Backup schema v${obj.version} vs app v${SCHEMA_VERSION}`);
  }
  delete obj.exportedAt;
  return obj;
}

// Read a File (from an <input type=file>) as text.
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
