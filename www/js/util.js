// Small shared helpers. No dependencies so this can be imported anywhere.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function now() {
  return Date.now();
}

// Whole days between two epoch-ms timestamps (a - b), can be fractional.
export function daysBetween(a, b) {
  return (a - b) / DAY_MS;
}

// Local calendar-day key (YYYY-MM-DD) — used to bucket steps and detect
// "already completed today" for daily/steps habits.
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fmtRelative(ts) {
  if (!ts) return 'never';
  const diff = now() - ts;
  if (diff < HOUR_MS) return 'just now';
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  const d = Math.floor(diff / DAY_MS);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

// Escape user-provided text before dropping it into innerHTML.
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
